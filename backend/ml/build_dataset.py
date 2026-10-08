"""
Phase 3a — pairwise dataset reshaping.

Replays match history chronologically ONE more time (in-memory, cheap — no DB
writes) to build the streaming state (Elo, rolling form, rolling serve stats,
h2h) needed for pre-match features, then emits one row per match: a
(player_A, player_B) pair with a hash-based, outcome-independent assignment of
who is "A", pre-match-only features (via app/features.py, the same module
predict.py uses at inference time), and label = 1 if A won.

Retirement/walkover matches are excluded from the OUTPUT rows (too noisy a
signal for "who was better"), but they still count towards Elo/form/serve
rolling state, since a retirement is still a completed ATP result.

Output: backend/ml/cache/training_rows.parquet (rebuilt from scratch each run
— it's a derived artifact, not source data, so it isn't committed).

Run from backend/: `python -m ml.build_dataset`
"""

import hashlib
import sys
from collections import deque
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.elo import EloEngine  # noqa: E402
from app.features import FEATURE_NAMES, PlayerMatchState, build_pairwise_features  # noqa: E402
from app.models import Match  # noqa: E402

OUT_PATH = Path(__file__).parent / "cache" / "training_rows.parquet"

FORM_WINDOW = 10
FORM_WINDOW_DAYS = 364
SERVE_WINDOW = 20
VALID_SURFACES = {"Hard", "Clay", "Grass", "Carpet"}


class StreamingPlayerState:
    __slots__ = ("results_10", "results_52w", "serve_pcts", "h2h")

    def __init__(self) -> None:
        self.results_10: deque = deque(maxlen=FORM_WINDOW)
        self.results_52w: deque = deque()  # (date, result)
        self.serve_pcts: deque = deque(maxlen=SERVE_WINDOW)

    def win_pct_last10(self) -> float:
        if not self.results_10:
            return 0.5
        return sum(self.results_10) / len(self.results_10)

    def win_pct_last52w(self, as_of) -> float:
        while self.results_52w and (as_of - self.results_52w[0][0]).days > FORM_WINDOW_DAYS:
            self.results_52w.popleft()
        if not self.results_52w:
            return 0.5
        return sum(r for _, r in self.results_52w) / len(self.results_52w)

    def serve_1st_win_pct(self) -> float:
        if not self.serve_pcts:
            return 0.60
        return sum(self.serve_pcts) / len(self.serve_pcts)

    def record_result(self, as_of, won: bool) -> None:
        self.results_10.append(1 if won else 0)
        self.results_52w.append((as_of, 1 if won else 0))

    def record_serve(self, first_in: float | None, first_won: float | None) -> None:
        if first_in and first_in > 0 and first_won is not None:
            self.serve_pcts.append(first_won / first_in)


def hash_assign_a(match_id: str) -> bool:
    """True if the winner should be player_A for this match — deterministic,
    independent of who actually won, so the model can't learn "A always wins"."""
    digest = hashlib.md5(match_id.encode()).hexdigest()
    return int(digest, 16) % 2 == 0


def main() -> None:
    db = SessionLocal()
    print("Loading matches in chronological order ...")
    matches = (
        db.execute(
            select(Match).order_by(Match.tourney_date, Match.tourney_id, Match.match_id)
        )
        .scalars()
        .all()
    )
    print(f"{len(matches)} matches loaded.")
    db.close()

    elo_engine = EloEngine()
    form_state: dict[str, StreamingPlayerState] = {}
    h2h: dict[tuple[str, str], list[int]] = {}  # (low_id, high_id) -> [wins_low, wins_high]

    def get_form(pid: str) -> StreamingPlayerState:
        if pid not in form_state:
            form_state[pid] = StreamingPlayerState()
        return form_state[pid]

    def get_h2h(pid1: str, pid2: str) -> tuple[str, str, list[int]]:
        low, high = sorted((pid1, pid2))
        if (low, high) not in h2h:
            h2h[(low, high)] = [0, 0]
        return low, high, h2h[(low, high)]

    rows: list[dict] = []
    skipped_retirement = 0

    for i, m in enumerate(matches):
        surface = m.surface if m.surface in VALID_SURFACES else None
        elo_w_overall, elo_w_surf = elo_engine.pre_match_ratings(m.winner_id, surface or "")
        elo_l_overall, elo_l_surf = elo_engine.pre_match_ratings(m.loser_id, surface or "")

        fw = get_form(m.winner_id)
        fl = get_form(m.loser_id)

        winner_state = PlayerMatchState(
            player_id=m.winner_id,
            elo_overall=elo_w_overall,
            elo_surface=elo_w_surf if surface else elo_w_overall,
            rank=m.winner_rank,
            rank_points=m.winner_rank_points,
            age=m.winner_age,
            height_cm=m.winner_ht,
            hand=m.winner_hand,
            win_pct_last10=fw.win_pct_last10(),
            win_pct_last52w=fw.win_pct_last52w(m.tourney_date),
            serve_1st_win_pct=fw.serve_1st_win_pct(),
        )
        loser_state = PlayerMatchState(
            player_id=m.loser_id,
            elo_overall=elo_l_overall,
            elo_surface=elo_l_surf if surface else elo_l_overall,
            rank=m.loser_rank,
            rank_points=m.loser_rank_points,
            age=m.loser_age,
            height_cm=m.loser_ht,
            hand=m.loser_hand,
            win_pct_last10=fl.win_pct_last10(),
            win_pct_last52w=fl.win_pct_last52w(m.tourney_date),
            serve_1st_win_pct=fl.serve_1st_win_pct(),
        )

        low, high, rec = get_h2h(m.winner_id, m.loser_id)
        h2h_winner_wins = rec[0] if low == m.winner_id else rec[1]
        h2h_loser_wins = rec[1] if low == m.winner_id else rec[0]

        if not m.is_retirement:
            winner_is_a = hash_assign_a(m.match_id)
            if winner_is_a:
                a_state, b_state = winner_state, loser_state
                h2h_a_wins, h2h_b_wins = h2h_winner_wins, h2h_loser_wins
                label = 1
            else:
                a_state, b_state = loser_state, winner_state
                h2h_a_wins, h2h_b_wins = h2h_loser_wins, h2h_winner_wins
                label = 0

            feats = build_pairwise_features(
                a_state,
                b_state,
                h2h_a_wins,
                h2h_b_wins,
                surface,
                m.tourney_level,
                m.best_of,
            )
            feats["match_id"] = m.match_id
            feats["tourney_date"] = m.tourney_date
            feats["player_a_id"] = a_state.player_id
            feats["player_b_id"] = b_state.player_id
            feats["label"] = label
            rows.append(feats)
        else:
            skipped_retirement += 1

        # Update streaming state AFTER snapshotting features (no leakage).
        rec[0 if low == m.winner_id else 1] += 1
        fw.record_result(m.tourney_date, won=True)
        fl.record_result(m.tourney_date, won=False)
        fw.record_serve(m.w_1stIn, m.w_1stWon)
        fl.record_serve(m.l_1stIn, m.l_1stWon)
        elo_engine.apply_match(m.winner_id, m.loser_id, surface or "")

        if (i + 1) % 25000 == 0:
            print(f"  processed {i + 1}/{len(matches)} matches ...")

    print(f"Built {len(rows)} training rows (skipped {skipped_retirement} retirements/walkovers).")

    df = pd.DataFrame(rows)
    ordered_cols = ["match_id", "tourney_date", "player_a_id", "player_b_id", "label"] + FEATURE_NAMES
    df = df[ordered_cols]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT_PATH, index=False)
    print(f"Wrote {OUT_PATH} ({df.shape[0]} rows, {df.shape[1]} cols).")


if __name__ == "__main__":
    main()
