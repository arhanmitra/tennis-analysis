"""
Phase 2 — Elo engine batch replay.

Replays the full match history in chronological order exactly once, updating
each player's overall + surface Elo, and writes a row to `elo_history` for the
winner and loser after every match (the rating *produced by* that match).
This is the only place Elo gets computed for storage — the API never
recomputes it live. See app/elo.py for the rating math itself.

Run from backend/: `python -m ml.build_elo`
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.elo import EloEngine  # noqa: E402
from app.models import EloHistory, Match  # noqa: E402

BATCH_SIZE = 5000


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    print("Clearing existing elo_history ...")
    db.query(EloHistory).delete()
    db.commit()

    print("Loading matches in chronological order ...")
    matches = (
        db.execute(
            select(
                Match.match_id,
                Match.tourney_date,
                Match.tourney_id,
                Match.surface,
                Match.winner_id,
                Match.loser_id,
            ).order_by(Match.tourney_date, Match.tourney_id, Match.match_id)
        )
        .all()
    )
    print(f"{len(matches)} matches to replay.")

    engine_ = EloEngine()
    buffer: list[dict] = []
    n_written = 0

    for i, m in enumerate(matches):
        surface = m.surface if m.surface in ("Hard", "Clay", "Grass", "Carpet") else None

        engine_.apply_match(m.winner_id, m.loser_id, surface or "")

        winner_state = engine_.get_state(m.winner_id)
        loser_state = engine_.get_state(m.loser_id)

        buffer.append(
            {
                "player_id": m.winner_id,
                "as_of_date": m.tourney_date,
                "surface": "overall",
                "elo": winner_state.overall,
                "match_id": m.match_id,
            }
        )
        buffer.append(
            {
                "player_id": m.loser_id,
                "as_of_date": m.tourney_date,
                "surface": "overall",
                "elo": loser_state.overall,
                "match_id": m.match_id,
            }
        )
        if surface:
            buffer.append(
                {
                    "player_id": m.winner_id,
                    "as_of_date": m.tourney_date,
                    "surface": surface,
                    "elo": winner_state.surface_rating(surface),
                    "match_id": m.match_id,
                }
            )
            buffer.append(
                {
                    "player_id": m.loser_id,
                    "as_of_date": m.tourney_date,
                    "surface": surface,
                    "elo": loser_state.surface_rating(surface),
                    "match_id": m.match_id,
                }
            )

        if len(buffer) >= BATCH_SIZE:
            db.bulk_insert_mappings(EloHistory, buffer)
            db.commit()
            n_written += len(buffer)
            buffer.clear()

        if (i + 1) % 20000 == 0:
            print(f"  replayed {i + 1}/{len(matches)} matches ...")

    if buffer:
        db.bulk_insert_mappings(EloHistory, buffer)
        db.commit()
        n_written += len(buffer)

    print(f"Done. {n_written} elo_history rows written for {len(engine_.players)} players.")
    db.close()


if __name__ == "__main__":
    main()
