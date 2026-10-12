#!/usr/bin/env bash
# Daily data refresh: pulls the current season + ongoing-tournament matches,
# then replays Elo from scratch so ratings/rankings stay current. Does NOT
# retrain the model — that's a deliberate, manual step (ml/train.py +
# ml/backtest.py), not something that should silently change daily.
set -euo pipefail

cd "$(dirname "$0")/../backend"
source .venv/bin/activate

python -m ml.ingest --current-only
python -m ml.build_elo
