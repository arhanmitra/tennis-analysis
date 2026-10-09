import json
from datetime import date
from pathlib import Path

import numpy as np
import xgboost as xgb
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.elo import DEFAULT_ELO
from app.features import (
    DEFAULT_SERVE_PCT,
    DEFAULT_WIN_PCT,
    FEATURE_NAMES,
    PlayerMatchState,
    build_pairwise_features,
)
from app.models import EloHistory, Match, Player
from app.schemas import FeatureContribution, PredictRequest, PredictResponse

router = APIRouter(tags=["predict"])

MODEL_DIR = Path(__file__).parent.parent.parent / "ml" / "models"
FORM_LOOKBACK_MATCHES = 40  # query window; win_pct_last10/serve use a sub-slice of this

_model: xgb.Booster | None = None
_model_version: str | None = None


def _load_model() -> tuple[xgb.Booster, str]:
    global _model, _model_version
    if _model is None:
        model_path = MODEL_DIR / "model.json"
        metadata_path = MODEL_DIR / "metadata.json"
        if not model_path.exists():
            raise HTTPException(
                status_code=503,
                detail="Model not trained yet — run `python -m ml.train` in backend/.",
            )
        # Raw Booster, not the XGBClassifier sklearn wrapper — loading a fitted
        # model.json into a fresh XGBClassifier() trips an xgboost/scikit-learn
        # sklearn-tags version mismatch. The raw Booster is all `predict` needs.
        booster = xgb.Booster()
        booster.load_model(model_path)
        metadata = json.loads(metadata_path.read_text())
        _model = booster
        _model_version = metadata["model_version"]
    return _model, _model_version


def _latest_elo(db: Session, player_id: str, surface: str) -> float:
    row = db.execute(
        select(EloHistory.elo)
        .where(EloHistory.player_id == player_id, EloHistory.surface == surface)
        .order_by(EloHistory.as_of_date.desc())
        .limit(1)
    ).scalar_one_or_none()
    return row if row is not None else DEFAULT_ELO


def _build_live_state(db: Session, player_id: str, surface: str | None) -> PlayerMatchState:
    player = db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail=f"Player {player_id} not found")

    elo_overall = _latest_elo(db, player_id, "overall")
    elo_surface = _latest_elo(db, player_id, surface) if surface else elo_overall

    recent_matches = db.execute(
        select(Match)
        .where((Match.winner_id == player_id) | (Match.loser_id == player_id))
        .order_by(Match.tourney_date.desc())
        .limit(FORM_LOOKBACK_MATCHES)
    ).scalars().all()

    rank = rank_points = None
    if recent_matches:
        latest = recent_matches[0]
        if latest.winner_id == player_id:
            rank, rank_points = latest.winner_rank, latest.winner_rank_points
        else:
            rank, rank_points = latest.loser_rank, latest.loser_rank_points

    today = date.today()
    age = None
    if player.dob:
        age = (today - player.dob).days / 365.25

    results_10 = []
    results_52w = []
    serve_pcts = []
    for m in recent_matches:
        is_winner = m.winner_id == player_id
        won = 1 if is_winner else 0
        if len(results_10) < 10:
            results_10.append(won)
        if (today - m.tourney_date).days <= 364:
            results_52w.append(won)

        first_in = m.w_1stIn if is_winner else m.l_1stIn
        first_won = m.w_1stWon if is_winner else m.l_1stWon
        if first_in and first_in > 0 and first_won is not None and len(serve_pcts) < 20:
            serve_pcts.append(first_won / first_in)

    win_pct_last10 = (sum(results_10) / len(results_10)) if results_10 else DEFAULT_WIN_PCT
    win_pct_last52w = (sum(results_52w) / len(results_52w)) if results_52w else DEFAULT_WIN_PCT
    serve_1st_win_pct = (sum(serve_pcts) / len(serve_pcts)) if serve_pcts else DEFAULT_SERVE_PCT

    return PlayerMatchState(
        player_id=player_id,
        elo_overall=elo_overall,
        elo_surface=elo_surface,
        rank=rank,
        rank_points=rank_points,
        age=age,
        height_cm=player.height_cm,
        hand=player.hand,
        win_pct_last10=win_pct_last10,
        win_pct_last52w=win_pct_last52w,
        serve_1st_win_pct=serve_1st_win_pct,
    )


def _h2h_counts(db: Session, player_a_id: str, player_b_id: str) -> tuple[int, int]:
    a_wins = db.execute(
        select(Match.match_id).where(Match.winner_id == player_a_id, Match.loser_id == player_b_id)
    ).all()
    b_wins = db.execute(
        select(Match.match_id).where(Match.winner_id == player_b_id, Match.loser_id == player_a_id)
    ).all()
    return len(a_wins), len(b_wins)


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest, db: Session = Depends(get_db)):
    if req.player_a_id == req.player_b_id:
        raise HTTPException(status_code=400, detail="player_a_id and player_b_id must differ")

    model, _ = _load_model()

    a_state = _build_live_state(db, req.player_a_id, req.surface)
    b_state = _build_live_state(db, req.player_b_id, req.surface)
    h2h_a_wins, h2h_b_wins = _h2h_counts(db, req.player_a_id, req.player_b_id)

    feats = build_pairwise_features(
        a_state,
        b_state,
        h2h_a_wins,
        h2h_b_wins,
        req.surface,
        req.tourney_level,
        req.best_of,
    )
    x = np.array([[feats[name] for name in FEATURE_NAMES]], dtype=float)
    dmatrix = xgb.DMatrix(x, feature_names=FEATURE_NAMES)

    prob_a = float(model.predict(dmatrix)[0])

    # Per-instance SHAP contributions via XGBoost's native pred_contribs — a
    # real explanation, not just global feature importance re-used per request.
    contribs = model.predict(dmatrix, pred_contribs=True)[0]  # last entry is bias term

    contributions = [
        FeatureContribution(feature=name, value=feats[name], contribution=float(contribs[i]))
        for i, name in enumerate(FEATURE_NAMES)
    ]
    contributions.sort(key=lambda c: -abs(c.contribution))
    top_features = contributions[:6]

    return PredictResponse(
        player_a_id=req.player_a_id,
        player_b_id=req.player_b_id,
        prob_a=prob_a,
        prob_b=1.0 - prob_a,
        top_features=top_features,
    )
