"""
Hand-rolled Elo rating engine for ATP matches.

Maintains one "overall" rating and one rating per surface (Hard/Clay/Grass/Carpet)
per player. Every match updates both the overall rating and the surface-specific
rating for that match's surface, so a player who has only played on Hard courts
has an overall rating but no meaningful Clay rating yet (they start at DEFAULT_ELO
on first appearance, like everyone else).

This module is pure computation — no DB access — so it can be unit-tested and
reused by build_elo.py (batch replay) without touching SQLAlchemy.
"""

from dataclasses import dataclass, field

DEFAULT_ELO = 1500.0
BASE_K = 32.0
PROVISIONAL_MATCHES = 30  # matches played before a player's K-factor settles down
PROVISIONAL_K_MULTIPLIER = 2.0  # newer players move faster, standard Elo refinement


@dataclass
class PlayerEloState:
    overall: float = DEFAULT_ELO
    surfaces: dict[str, float] = field(default_factory=dict)
    matches_played: int = 0

    def surface_rating(self, surface: str) -> float:
        return self.surfaces.get(surface, DEFAULT_ELO)


def expected_score(rating_a: float, rating_b: float) -> float:
    """Probability that player A beats player B, standard logistic Elo formula."""
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))


def k_factor(matches_played: int) -> float:
    """Higher K for players with few matches, so new ratings converge faster."""
    if matches_played < PROVISIONAL_MATCHES:
        return BASE_K * PROVISIONAL_K_MULTIPLIER
    return BASE_K


def update_ratings(
    winner_state: PlayerEloState,
    loser_state: PlayerEloState,
    surface: str,
) -> None:
    """Mutate winner_state and loser_state in place after one match."""
    # Overall rating update
    exp_winner = expected_score(winner_state.overall, loser_state.overall)
    k_w = k_factor(winner_state.matches_played)
    k_l = k_factor(loser_state.matches_played)

    winner_state.overall += k_w * (1.0 - exp_winner)
    loser_state.overall += k_l * (0.0 - (1.0 - exp_winner))

    # Surface-specific rating update (independent Elo pool per surface)
    if surface:
        w_surf = winner_state.surface_rating(surface)
        l_surf = loser_state.surface_rating(surface)
        exp_winner_surf = expected_score(w_surf, l_surf)

        winner_state.surfaces[surface] = w_surf + k_w * (1.0 - exp_winner_surf)
        loser_state.surfaces[surface] = l_surf + k_l * (0.0 - (1.0 - exp_winner_surf))

    winner_state.matches_played += 1
    loser_state.matches_played += 1


class EloEngine:
    """Tracks Elo state for all players, replayed in chronological match order."""

    def __init__(self) -> None:
        self.players: dict[str, PlayerEloState] = {}

    def get_state(self, player_id: str) -> PlayerEloState:
        if player_id not in self.players:
            self.players[player_id] = PlayerEloState()
        return self.players[player_id]

    def pre_match_ratings(self, player_id: str, surface: str) -> tuple[float, float]:
        """Ratings *entering* a match, i.e. before this match's update is applied."""
        state = self.get_state(player_id)
        return state.overall, state.surface_rating(surface)

    def apply_match(self, winner_id: str, loser_id: str, surface: str) -> None:
        winner_state = self.get_state(winner_id)
        loser_state = self.get_state(loser_id)
        update_ratings(winner_state, loser_state, surface)
