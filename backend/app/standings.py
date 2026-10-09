"""Current Elo standings per surface among active players.

Ranks each active player's latest overall / Hard / Clay / Grass Elo against
everyone else active. Computed from elo_history in one pass and cached until
the underlying data changes (the daily refresh adds new elo_history rows), so
the leaderboard and per-player standing endpoints stay cheap.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import EloHistory, Match, Player
from app.routes.players import ACTIVE_WINDOW_DAYS

STANDING_SURFACES = ["overall", "Hard", "Clay", "Grass"]

# A surface rating built on a handful of matches is still close to the 1500
# default (or swung hard by provisional K), so it isn't ranked until the player
# has this many matches on that surface. Overall needs the same number in total.
MIN_SURFACE_MATCHES = 10

# Surface boards rank by a 50/50 blend of surface Elo and overall Elo. Scored on
# every 2024+ Hard/Clay/Grass match using pre-match ratings, the blend predicted
# results better than surface Elo alone (log-loss 0.629 vs 0.642; on grass
# 0.621 vs 0.653) and better than weighting by surface match count. Surface Elo
# alone lags: every surface rating starts at 1500 and short seasons (grass) leave
# most players far from settled, so long-career specialists sit artificially high.
SURFACE_BLEND_WEIGHT = 0.5


@dataclass
class Entry:
    player_id: str
    name: str
    ioc: str | None
    elo: float  # rating the board ranks by: overall Elo, or the surface/overall blend
    matches: int
    official_rank: int | None
    surface_elo: float | None = None  # raw surface Elo, surface boards only
    rank: int | None = None  # None = below MIN_SURFACE_MATCHES


@dataclass
class Standings:
    computed_for: tuple
    as_of: date
    by_surface: dict[str, list[Entry]] = field(default_factory=dict)  # ranked entries, best first
    lookup: dict[tuple[str, str], Entry] = field(default_factory=dict)  # (player_id, surface) -> entry


_cache: Standings | None = None


def _data_version(db: Session) -> tuple:
    return tuple(db.execute(select(func.count(EloHistory.id), func.max(EloHistory.as_of_date))).one())


def get_standings(db: Session) -> Standings:
    global _cache
    version = _data_version(db)
    if _cache is not None and _cache.computed_for == version:
        return _cache

    cutoff = date.today() - timedelta(days=ACTIVE_WINDOW_DAYS)

    # Latest official rank per active player, from their most recent ranked match.
    recent = db.execute(
        select(Match.tourney_date, Match.winner_id, Match.loser_id, Match.winner_rank, Match.loser_rank)
        .where(Match.tourney_date >= cutoff)
        .order_by(Match.tourney_date)
    ).all()
    active: set[str] = set()
    official: dict[str, int] = {}
    for r in recent:
        active.update((r.winner_id, r.loser_id))
        if r.winner_rank is not None:
            official[r.winner_id] = r.winner_rank
        if r.loser_rank is not None:
            official[r.loser_id] = r.loser_rank

    players = {
        p.player_id: p
        for p in db.execute(select(Player).where(Player.player_id.in_(active))).scalars()
    }

    # Latest rating and match count per (player, surface) for active players.
    rows = db.execute(
        text(
            """
            SELECT player_id, surface, elo, n FROM (
                SELECT player_id, surface, elo,
                       ROW_NUMBER() OVER (PARTITION BY player_id, surface ORDER BY as_of_date DESC, id DESC) AS rn,
                       COUNT(*) OVER (PARTITION BY player_id, surface) AS n
                FROM elo_history
                WHERE surface IN ('overall', 'Hard', 'Clay', 'Grass')
                  AND player_id IN (
                      SELECT winner_id FROM matches WHERE tourney_date >= :cutoff
                      UNION SELECT loser_id FROM matches WHERE tourney_date >= :cutoff
                  )
            ) WHERE rn = 1
            """
        ),
        {"cutoff": cutoff.isoformat()},
    ).all()

    standings = Standings(computed_for=version, as_of=version[1])
    for surface in STANDING_SURFACES:
        standings.by_surface[surface] = []
    for r in rows:
        p = players.get(r.player_id)
        if p is None:
            continue
        entry = Entry(
            player_id=r.player_id,
            name=p.name,
            ioc=p.ioc,
            elo=float(r.elo),
            matches=int(r.n),
            official_rank=official.get(r.player_id),
        )
        standings.lookup[(r.player_id, r.surface)] = entry

    # Surface ratings blend in the player's overall Elo (see SURFACE_BLEND_WEIGHT).
    for (pid, surface), entry in standings.lookup.items():
        if surface == "overall":
            continue
        overall = standings.lookup.get((pid, "overall"))
        entry.surface_elo = entry.elo
        if overall is not None:
            entry.elo = SURFACE_BLEND_WEIGHT * entry.surface_elo + (1 - SURFACE_BLEND_WEIGHT) * overall.elo

    for (pid, surface), entry in standings.lookup.items():
        if entry.matches >= MIN_SURFACE_MATCHES:
            standings.by_surface[surface].append(entry)

    for surface, entries in standings.by_surface.items():
        entries.sort(key=lambda e: e.elo, reverse=True)
        for i, e in enumerate(entries, start=1):
            e.rank = i

    _cache = standings
    return standings
