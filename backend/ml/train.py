"""
Phase 3b — train the classifier.

Temporal split (never random, which would leak future ratings): train on everything before
TRAIN_CUTOFF, validate on TRAIN_CUTOFF..TEST_CUTOFF, test on TEST_CUTOFF
onward. Reports the trained model's accuracy/log-loss on the held-out test
set alongside two naive baselines ("always pick higher rank" and "always pick
higher Elo") so the improvement is visible — this is the single most
important number for the Model Performance tab.

Run from backend/: `python -m ml.train`
"""

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, log_loss
from xgboost import XGBClassifier

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.features import FEATURE_NAMES  # noqa: E402

DATA_PATH = Path(__file__).parent / "cache" / "training_rows.parquet"
MODEL_DIR = Path(__file__).parent / "models"
MODEL_PATH = MODEL_DIR / "model.json"
METADATA_PATH = MODEL_DIR / "metadata.json"

TRAIN_CUTOFF = date(2023, 1, 1)  # train: everything before this
TEST_CUTOFF = date(2024, 1, 1)  # validate: [TRAIN_CUTOFF, TEST_CUTOFF); test: >= TEST_CUTOFF

MODEL_VERSION = "xgb_v1"


def baseline_accuracy(df: pd.DataFrame, diff_col: str) -> float:
    """'Always pick the player who is better on {diff_col}' (already oriented
    A-minus-B). A genuine tie (both unranked, or an exact Elo tie) carries no
    information, so it scores 0.5 rather than free credit either way."""
    diff = df[diff_col].to_numpy()
    label = df["label"].to_numpy()
    pred_a_wins = diff > 0
    correct = np.where(pred_a_wins, label == 1, label == 0).astype(float)
    score = np.where(diff == 0, 0.5, correct)
    return float(score.mean())


def main() -> None:
    if not DATA_PATH.exists():
        raise SystemExit(f"{DATA_PATH} not found — run `python -m ml.build_dataset` first.")

    df = pd.read_parquet(DATA_PATH)
    df["tourney_date"] = pd.to_datetime(df["tourney_date"]).dt.date
    print(f"Loaded {len(df)} training rows.")

    train_df = df[df["tourney_date"] < TRAIN_CUTOFF]
    val_df = df[(df["tourney_date"] >= TRAIN_CUTOFF) & (df["tourney_date"] < TEST_CUTOFF)]
    test_df = df[df["tourney_date"] >= TEST_CUTOFF]
    print(f"Train: {len(train_df)} (< {TRAIN_CUTOFF}) | Val: {len(val_df)} | Test: {len(test_df)} (>= {TEST_CUTOFF})")

    X_train, y_train = train_df[FEATURE_NAMES], train_df["label"]
    X_val, y_val = val_df[FEATURE_NAMES], val_df["label"]
    X_test, y_test = test_df[FEATURE_NAMES], test_df["label"]

    model = XGBClassifier(
        n_estimators=400,
        max_depth=4,
        learning_rate=0.03,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        reg_lambda=1.0,
        eval_metric="logloss",
        early_stopping_rounds=30,
        n_jobs=-1,
    )
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    print(f"Best iteration: {model.best_iteration}")

    test_pred_proba = model.predict_proba(X_test)[:, 1]
    test_pred = (test_pred_proba >= 0.5).astype(int)

    model_acc = accuracy_score(y_test, test_pred)
    model_logloss = log_loss(y_test, test_pred_proba)
    baseline_rank_acc = baseline_accuracy(test_df, "rank_diff")
    baseline_elo_acc = baseline_accuracy(test_df, "elo_diff")

    print(f"\n=== Held-out test set ({TEST_CUTOFF} onward, n={len(test_df)}) ===")
    print(f"Model accuracy:           {model_acc:.4f}")
    print(f"Model log-loss:           {model_logloss:.4f}")
    print(f"Baseline (higher rank):   {baseline_rank_acc:.4f}")
    print(f"Baseline (higher Elo):    {baseline_elo_acc:.4f}")

    importances = dict(zip(FEATURE_NAMES, model.feature_importances_.astype(float)))
    top_features = sorted(importances.items(), key=lambda kv: -kv[1])[:8]
    print("\nTop features by gain importance:")
    for name, imp in top_features:
        print(f"  {name}: {imp:.4f}")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.save_model(MODEL_PATH)

    metadata = {
        "model_version": MODEL_VERSION,
        "feature_names": FEATURE_NAMES,
        "train_cutoff": TRAIN_CUTOFF.isoformat(),
        "test_cutoff": TEST_CUTOFF.isoformat(),
        "n_train": int(len(train_df)),
        "n_val": int(len(val_df)),
        "n_test": int(len(test_df)),
        "test_accuracy": float(model_acc),
        "test_log_loss": float(model_logloss),
        "baseline_rank_accuracy": float(baseline_rank_acc),
        "baseline_elo_accuracy": float(baseline_elo_acc),
        "feature_importances": importances,
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2))
    print(f"\nSaved model to {MODEL_PATH}")
    print(f"Saved metadata to {METADATA_PATH}")


if __name__ == "__main__":
    main()
