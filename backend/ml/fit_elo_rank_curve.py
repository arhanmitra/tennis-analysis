"""
Fits a single "Elo -> expected ATP rank" curve from historical data, for the
Rankings vs Model tab's predicted-rank line.

This is a deliberate shortcut vs. reconstructing a full day-by-day Elo
leaderboard (which would need every active player's interpolated Elo on every
date to rank them against each other). Instead: every match already pairs a
player's post-match Elo (elo_history, joined via match_id) with their real
ATP rank at that time (matches.winner_rank/loser_rank) — ~400k such pairs
across history. Fit one monotonic curve through them (isotonic regression:
higher Elo -> better/lower rank number, non-increasing) and use it as a
lookup at request time.

This answers "what rank does a player with this Elo typically hold?", not
"what rank would this exact Elo have placed them on this exact date" — a
reasonable approximation, not a leaderboard reconstruction. Labelled as
"Elo-implied rank" in the API/UI so it isn't mistaken for the latter.

Run from backend/: `python -m ml.fit_elo_rank_curve`
"""

import json
import sys
from pathlib import Path

import numpy as np
from sklearn.isotonic import IsotonicRegression

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text  # noqa: E402

from app.database import SessionLocal  # noqa: E402

OUT_PATH = Path(__file__).parent / "models" / "elo_rank_curve.json"

# Collapse the fitted curve to this many (elo, rank) breakpoints for a small,
# fast-to-load JSON lookup table (np.interp at request time).
N_BREAKPOINTS = 300


def main() -> None:
    db = SessionLocal()
    rows = db.execute(
        text(
            """
            SELECT eh.elo AS elo, m.winner_rank AS rank
            FROM elo_history eh JOIN matches m ON eh.match_id = m.match_id AND eh.player_id = m.winner_id
            WHERE eh.surface = 'overall' AND m.winner_rank IS NOT NULL
            UNION ALL
            SELECT eh.elo AS elo, m.loser_rank AS rank
            FROM elo_history eh JOIN matches m ON eh.match_id = m.match_id AND eh.player_id = m.loser_id
            WHERE eh.surface = 'overall' AND m.loser_rank IS NOT NULL
            """
        )
    ).all()
    db.close()

    elo = np.array([r.elo for r in rows], dtype=float)
    rank = np.array([r.rank for r in rows], dtype=float)
    print(f"Fitting on {len(elo)} (elo, rank) pairs.")

    # Higher Elo -> lower (better) rank number, so the fit is non-increasing.
    iso = IsotonicRegression(increasing=False, out_of_bounds="clip")
    iso.fit(elo, rank)

    elo_grid = np.linspace(elo.min(), elo.max(), N_BREAKPOINTS)
    rank_grid = iso.predict(elo_grid)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(
            {
                "elo_min": float(elo.min()),
                "elo_max": float(elo.max()),
                "elo_breakpoints": elo_grid.tolist(),
                "rank_breakpoints": rank_grid.tolist(),
                "n_samples": int(len(elo)),
            },
            indent=2,
        )
    )
    print(f"Wrote {OUT_PATH}")

    # Sanity spot-check.
    for e in [1500, 1800, 2000, 2200, 2400, 2500]:
        r = float(np.interp(e, elo_grid, rank_grid))
        print(f"  Elo {e} -> implied rank ~{r:.0f}")


if __name__ == "__main__":
    main()
