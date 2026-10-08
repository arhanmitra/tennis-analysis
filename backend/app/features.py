"""
Shared pre-match feature construction.

This module is imported by BOTH `ml/build_dataset.py` (training, replaying
history chronologically) and `app/routes/predict.py` (live inference, reading
current DB state). The only thing that differs between the two call sites is
*how* a `PlayerMatchState` snapshot gets built — training builds it from a
streaming replay, inference builds it from the latest DB rows. The feature
formulas themselves live here exactly once, so training and serving can never
drift apart.

All features are computed as "player_a minus/relative-to player_b" diffs,
oriented so a positive value generally favours player_a.
"""

from dataclasses import dataclass

SURFACES = ["Hard", "Clay", "Grass", "Carpet"]
# Site uses a finer-grained level scheme than the ATP's classic G/A/D/F (confirmed
# against live data): Grand Slam, Tour (250/500/Masters), Davis Cup, Finals.
TOURNEY_LEVELS = ["G", "M", "500", "250", "A", "D", "F"]

UNRANKED_FILL = 2000.0  # worse than ~any real ATP ranking; used when a player has no known rank yet
DEFAULT_WIN_PCT = 0.5  # neutral prior for players with no match history yet
DEFAULT_SERVE_PCT = 0.60  # tour-average-ish 1st-serve-points-won%, neutral prior

FEATURE_NAMES = [
    "elo_diff",
    "surface_elo_diff",
    "rank_diff",
    "rank_points_diff",
    "age_diff",
    "height_diff",
    "same_hand",
    "win_pct_last10_diff",
    "win_pct_last52w_diff",
    "serve_1st_win_pct_diff",
    "h2h_win_pct_a",
    "best_of",
] + [f"surface_{s}" for s in SURFACES] + [f"level_{lvl}" for lvl in TOURNEY_LEVELS]


@dataclass
class PlayerMatchState:
    """Everything about a player as known immediately BEFORE a given match."""

    player_id: str
    elo_overall: float
    elo_surface: float
    rank: float | None
    rank_points: float | None
    age: float | None
    height_cm: float | None
    hand: str | None
    win_pct_last10: float
    win_pct_last52w: float
    serve_1st_win_pct: float


def _diff(a: float | None, b: float | None, fill: float) -> float:
    a_val = fill if a is None else a
    b_val = fill if b is None else b
    return a_val - b_val


def build_pairwise_features(
    a: PlayerMatchState,
    b: PlayerMatchState,
    h2h_a_wins: int,
    h2h_b_wins: int,
    surface: str | None,
    tourney_level: str | None,
    best_of: int | None,
) -> dict[str, float]:
    """Pure function: two pre-match player snapshots -> flat feature dict.

    No DB access, no I/O — safe to call identically from training replay and
    from a live API request.
    """
    h2h_total = h2h_a_wins + h2h_b_wins
    h2h_win_pct_a = (h2h_a_wins / h2h_total) if h2h_total > 0 else DEFAULT_WIN_PCT

    # Rank is "lower number = better", so flip the sign vs a plain a-minus-b
    # diff: rank_diff should be positive when player_a is better ranked.
    rank_diff = -_diff(a.rank, b.rank, UNRANKED_FILL)

    features: dict[str, float] = {
        "elo_diff": a.elo_overall - b.elo_overall,
        "surface_elo_diff": a.elo_surface - b.elo_surface,
        "rank_diff": rank_diff,
        "rank_points_diff": _diff(a.rank_points, b.rank_points, 0.0),
        "age_diff": _diff(a.age, b.age, 0.0),
        "height_diff": _diff(a.height_cm, b.height_cm, 0.0),
        "same_hand": 1.0 if (a.hand and b.hand and a.hand == b.hand) else 0.0,
        "win_pct_last10_diff": a.win_pct_last10 - b.win_pct_last10,
        "win_pct_last52w_diff": a.win_pct_last52w - b.win_pct_last52w,
        "serve_1st_win_pct_diff": a.serve_1st_win_pct - b.serve_1st_win_pct,
        "h2h_win_pct_a": h2h_win_pct_a,
        "best_of": float(best_of or 3),
    }

    for s in SURFACES:
        features[f"surface_{s}"] = 1.0 if surface == s else 0.0
    for lvl in TOURNEY_LEVELS:
        features[f"level_{lvl}"] = 1.0 if tourney_level == lvl else 0.0

    return features


def neutral_state(player_id: str, elo_overall: float, elo_surface: float) -> PlayerMatchState:
    """State for a player with no prior recorded matches (first tour appearance)."""
    return PlayerMatchState(
        player_id=player_id,
        elo_overall=elo_overall,
        elo_surface=elo_surface,
        rank=None,
        rank_points=None,
        age=None,
        height_cm=None,
        hand=None,
        win_pct_last10=DEFAULT_WIN_PCT,
        win_pct_last52w=DEFAULT_WIN_PCT,
        serve_1st_win_pct=DEFAULT_SERVE_PCT,
    )
