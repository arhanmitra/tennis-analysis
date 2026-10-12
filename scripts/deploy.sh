#!/usr/bin/env bash
# Sync this project to the Pi and restart its services. Mirrors the deploy
# pattern used by the other portfolio dashboards on the same Pi.
#
# .env files are intentionally excluded by --exclude below, so secrets never
# travel with a deploy. Create backend/.env on the Pi manually after the first
# deploy, from backend/.env.example.
#
# First-time setup on the Pi (run once, manually, not by this script):
#   cd ~/atp-predictor-dashboard/backend && python3 -m venv .venv && \
#     .venv/bin/pip install -r requirements.txt
#   cd ~/atp-predictor-dashboard/frontend && npm install && npm run build
#   sudo cp scripts/systemd/*.service scripts/systemd/*.timer /etc/systemd/system/
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now tennis-backend tennis-frontend tennis-refresh.timer
set -euo pipefail

PI_HOST="gympi"
PI_USER="pi"
REMOTE_DIR="/home/pi/atp-predictor-dashboard"

cd "$(dirname "$0")/.."

rsync -avz --delete \
  --exclude ".git/" \
  --exclude ".env" \
  --exclude "backend/.venv/" \
  --exclude "backend/data/" \
  --exclude "backend/ml/cache/" \
  --exclude "frontend/node_modules/" \
  --exclude "frontend/dist/" \
  --exclude "CLAUDE.md" \
  --exclude "claude/" \
  --exclude "PRODUCT.md" \
  --exclude "DESIGN.md" \
  --exclude ".impeccable/" \
  ./ "${PI_USER}@${PI_HOST}:${REMOTE_DIR}/"

ssh "${PI_USER}@${PI_HOST}" bash -s <<'EOF'
set -euo pipefail
cd ~/atp-predictor-dashboard

echo "--- backend deps ---"
cd backend && .venv/bin/pip install -q -r requirements.txt && cd ..

echo "--- frontend build ---"
cd frontend && npm install --silent && npm run build && cd ..

echo "--- restarting services ---"
sudo systemctl restart tennis-backend tennis-frontend

echo "Deploy complete."
EOF
