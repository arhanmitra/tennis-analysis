"""
Phase 3c — backtest, writing per-match predictions to `model_predictions`.

Scores the trained model against the held-out temporal test set (same split
as train.py) and writes one row per test match, with `actual_winner_id`
already filled in since these are historical (already-played) matches. The
`/api/model/performance` route aggregates this table live (rolling
accuracy/log-loss, calibration buckets, confusion matrix) rather than
pre-computing those summaries here — keeps the API route the single source of
truth for how those numbers are derived.

Run from backend/: `python -m ml.backtest` (run `ml.train` first).
"""

import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import xgboost as xgb

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.features import FEATURE_NAMES  # noqa: E402
from app.models import ModelPrediction  # noqa: E402

DATA_PATH = Path(__file__).parent / "cache" / "training_rows.parquet"
MODEL_PATH = Path(__file__).parent / "models" / "model.json"
METADATA_PATH = Path(__file__).parent / "models" / "metadata.json"

TEST_CUTOFF = date(2024, 1, 1)


def main() -> None:
    if not MODEL_PATH.exists():
        raise SystemExit(f"{MODEL_PATH} not found — run `python -m ml.train` first.")

    metadata = json.loads(METADATA_PATH.read_text())
    model_version = metadata["model_version"]

    # Raw Booster, not the XGBClassifier sklearn wrapper — loading a fitted
    # model.json into a fresh XGBClassifier() trips an xgboost/scikit-learn
    # sklearn-tags version mismatch (`__sklearn_tags__`); the raw Booster
    # sidesteps the sklearn wrapper entirely and is all `predict` needs here.
    booster = xgb.Booster()
    booster.load_model(MODEL_PATH)

    df = pd.read_parquet(DATA_PATH)
    df["tourney_date"] = pd.to_datetime(df["tourney_date"]).dt.date
    test_df = df[df["tourney_date"] >= TEST_CUTOFF].copy()
    print(f"Backtesting on {len(test_df)} matches (>= {TEST_CUTOFF}).")

    dmatrix = xgb.DMatrix(test_df[FEATURE_NAMES], feature_names=FEATURE_NAMES)
    test_df["predicted_prob_a"] = booster.predict(dmatrix)

    now = datetime.now(timezone.utc)
    rows = []
    for _, r in test_df.iterrows():
        actual_winner_id = r["player_a_id"] if r["label"] == 1 else r["player_b_id"]
        rows.append(
            {
                "match_id": r["match_id"],
                "player_a_id": r["player_a_id"],
                "player_b_id": r["player_b_id"],
                "predicted_prob_a": float(r["predicted_prob_a"]),
                "actual_winner_id": actual_winner_id,
                "predicted_at": now,
                "model_version": model_version,
            }
        )

    db = SessionLocal()
    db.query(ModelPrediction).filter(ModelPrediction.model_version == model_version).delete()
    db.bulk_insert_mappings(ModelPrediction, rows)
    db.commit()
    db.close()

    print(f"Wrote {len(rows)} backtest predictions for model_version={model_version}.")


if __name__ == "__main__":
    main()
