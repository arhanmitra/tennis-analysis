import json
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.features import UNRANKED_FILL
from app.models import Match, ModelPrediction
from app.schemas import (
    CalibrationBucket,
    ConfusionMatrix,
    ModelPerformanceResponse,
    RollingAccuracyPoint,
)

router = APIRouter(tags=["model"])

METADATA_PATH = Path(__file__).parent.parent.parent / "ml" / "models" / "metadata.json"
EPS = 1e-15


def _log_loss(y_true: np.ndarray, p: np.ndarray) -> float:
    p = np.clip(p, EPS, 1 - EPS)
    return float(-np.mean(y_true * np.log(p) + (1 - y_true) * np.log(1 - p)))


@router.get("/model/performance", response_model=ModelPerformanceResponse)
def model_performance(db: Session = Depends(get_db)):
    if not METADATA_PATH.exists():
        raise HTTPException(status_code=503, detail="Model not trained yet.")
    metadata = json.loads(METADATA_PATH.read_text())
    model_version = metadata["model_version"]

    preds = db.execute(
        select(
            ModelPrediction.match_id,
            ModelPrediction.player_a_id,
            ModelPrediction.player_b_id,
            ModelPrediction.predicted_prob_a,
            ModelPrediction.actual_winner_id,
        ).where(ModelPrediction.model_version == model_version)
    ).all()
    if not preds:
        raise HTTPException(status_code=503, detail="No backtest predictions found — run `python -m ml.backtest`.")

    df = pd.DataFrame(preds, columns=["match_id", "player_a_id", "player_b_id", "predicted_prob_a", "actual_winner_id"])
    df["label"] = (df["actual_winner_id"] == df["player_a_id"]).astype(int)

    match_info = pd.DataFrame(
        db.execute(
            select(Match.match_id, Match.tourney_date, Match.winner_rank, Match.loser_rank).where(
                Match.match_id.in_(df["match_id"].tolist())
            )
        ).all(),
        columns=["match_id", "tourney_date", "winner_rank", "loser_rank"],
    )
    df = df.merge(match_info, on="match_id", how="inner").dropna(subset=["tourney_date"])

    # "Always pick the higher-ranked player", scored per match so it can be
    # bucketed by month alongside the model. Mirrors ml/train.py's baseline:
    # unranked players get UNRANKED_FILL, and an exact tie scores 0.5.
    w_rank = df["winner_rank"].fillna(UNRANKED_FILL).to_numpy(dtype=float)
    l_rank = df["loser_rank"].fillna(UNRANKED_FILL).to_numpy(dtype=float)
    df["baseline_correct"] = np.where(w_rank == l_rank, 0.5, (w_rank < l_rank).astype(float))

    df["model_pred"] = (df["predicted_prob_a"] >= 0.5).astype(int)
    df["model_correct"] = (df["model_pred"] == df["label"]).astype(int)

    overall_accuracy = float(df["model_correct"].mean())
    overall_log_loss = _log_loss(df["label"].to_numpy(), df["predicted_prob_a"].to_numpy())

    # Rolling accuracy over time, bucketed by month.
    df["period"] = pd.to_datetime(df["tourney_date"]).dt.to_period("M").astype(str)
    rolling = []
    for period, g in df.groupby("period"):
        rolling.append(
            RollingAccuracyPoint(
                period=period,
                model_accuracy=float(g["model_correct"].mean()),
                baseline_rank_accuracy=float(g["baseline_correct"].mean()),
                log_loss=_log_loss(g["label"].to_numpy(), g["predicted_prob_a"].to_numpy()),
                n_matches=int(len(g)),
            )
        )
    rolling.sort(key=lambda r: r.period)

    # Calibration: bucket predicted P(A wins) into deciles, compare to actual win rate.
    bucket_edges = np.linspace(0, 1, 11)
    df["bucket"] = pd.cut(df["predicted_prob_a"], bins=bucket_edges, include_lowest=True)
    calibration = []
    for interval, g in df.groupby("bucket", observed=True):
        if len(g) == 0:
            continue
        calibration.append(
            CalibrationBucket(
                bucket_lower=float(interval.left),
                bucket_upper=float(interval.right),
                predicted_mean=float(g["predicted_prob_a"].mean()),
                actual_win_rate=float(g["label"].mean()),
                count=int(len(g)),
            )
        )
    calibration.sort(key=lambda c: c.bucket_lower)

    tp = int(((df["model_pred"] == 1) & (df["label"] == 1)).sum())
    fp = int(((df["model_pred"] == 1) & (df["label"] == 0)).sum())
    tn = int(((df["model_pred"] == 0) & (df["label"] == 0)).sum())
    fn = int(((df["model_pred"] == 0) & (df["label"] == 1)).sum())

    return ModelPerformanceResponse(
        overall_accuracy=overall_accuracy,
        baseline_rank_accuracy=float(df["baseline_correct"].mean()),
        baseline_elo_accuracy=metadata.get("baseline_elo_accuracy"),
        overall_log_loss=overall_log_loss,
        rolling=rolling,
        calibration=calibration,
        confusion_matrix=ConfusionMatrix(true_positive=tp, false_positive=fp, true_negative=tn, false_negative=fn),
        model_version=model_version,
        n_test_matches=int(len(df)),
    )
