import json
from pathlib import Path

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import EloHistory, Match, Player
from app.schemas import (
    EloPoint,
    LeaderboardResponse,
    PlayerStandingResponse,
    RankVsEloPoint,
    RankVsEloResponse,
    RatingsResponse,
    StandingEntry,
    SurfaceStanding,
)
from app.standings import MIN_SURFACE_MATCHES, STANDING_SURFACES, get_standings

router = APIRouter(tags=["ratings"])

ELO_RANK_CURVE_PATH = Path(__file__).parent.parent.parent / "ml" / "models" / "elo_rank_curve.json"
_elo_rank_curve: dict | None = None


def _load_elo_rank_curve() -> dict | None:
    global _elo_rank_curve
    if _elo_rank_curve is None and ELO_RANK_CURVE_PATH.exists():
        _elo_rank_curve = json.loads(ELO_RANK_CURVE_PATH.read_text())
    return _elo_rank_curve


def _predicted_rank(elo: float | None, curve: dict | None) -> float | None:
    if elo is None or curve is None:
        return None
    return float(np.interp(elo, curve["elo_breakpoints"], curve["rank_breakpoints"]))


@router.get("/ratings/{player_id}", response_model=RatingsResponse)
def get_ratings(player_id: str, db: Session = Depends(get_db)):
    if not db.get(Player, player_id):
        raise HTTPException(status_code=404, detail="Player not found")

    rows = db.execute(
        select(EloHistory.as_of_date, EloHistory.surface, EloHistory.elo)
        .where(EloHistory.player_id == player_id)
        .order_by(EloHistory.as_of_date)
    ).all()

    history = [
        EloPoint(as_of_date=r.as_of_date.isoformat(), surface=r.surface, elo=r.elo) for r in rows
    ]
    return RatingsResponse(player_id=player_id, history=history)


@router.get("/ratings/{player_id}/vs-rank", response_model=RankVsEloResponse)
def get_ratings_vs_rank(player_id: str, db: Session = Depends(get_db)):
    if not db.get(Player, player_id):
        raise HTTPException(status_code=404, detail="Player not found")

    curve = _load_elo_rank_curve()

    elo_rows = db.execute(
        select(EloHistory.as_of_date, EloHistory.elo)
        .where(EloHistory.player_id == player_id, EloHistory.surface == "overall")
        .order_by(EloHistory.as_of_date)
    ).all()
    elo_by_date = {r.as_of_date: r.elo for r in elo_rows}

    match_rows = db.execute(
        select(
            Match.tourney_date,
            Match.winner_id,
            Match.winner_rank,
            Match.loser_rank,
        )
        .where((Match.winner_id == player_id) | (Match.loser_id == player_id))
        .order_by(Match.tourney_date)
    ).all()
    rank_by_date = {
        r.tourney_date: (r.winner_rank if r.winner_id == player_id else r.loser_rank)
        for r in match_rows
    }

    all_dates = sorted(set(elo_by_date) | set(rank_by_date))
    history = [
        RankVsEloPoint(
            as_of_date=d.isoformat(),
            elo=elo_by_date.get(d),
            official_rank=rank_by_date.get(d),
            predicted_rank=_predicted_rank(elo_by_date.get(d), curve),
        )
        for d in all_dates
    ]
    return RankVsEloResponse(player_id=player_id, history=history)


def _entry_out(e) -> StandingEntry:
    return StandingEntry(
        player_id=e.player_id,
        name=e.name,
        ioc=e.ioc,
        rank=e.rank,
        elo=e.elo,
        surface_elo=e.surface_elo,
        matches=e.matches,
        official_rank=e.official_rank,
    )


@router.get("/leaderboard", response_model=LeaderboardResponse)
def leaderboard(
    surface: str = Query(default="overall"),
    limit: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    if surface not in STANDING_SURFACES:
        raise HTTPException(status_code=400, detail=f"surface must be one of {', '.join(STANDING_SURFACES)}")
    standings = get_standings(db)
    ranked = standings.by_surface[surface]
    return LeaderboardResponse(
        surface=surface,
        as_of=standings.as_of.isoformat(),
        n_ranked=len(ranked),
        min_matches=MIN_SURFACE_MATCHES,
        entries=[_entry_out(e) for e in ranked[:limit]],
    )


@router.get("/ratings/{player_id}/standing", response_model=PlayerStandingResponse)
def player_standing(player_id: str, db: Session = Depends(get_db)):
    if not db.get(Player, player_id):
        raise HTTPException(status_code=404, detail="Player not found")
    standings = get_standings(db)
    surfaces = []
    for surface in STANDING_SURFACES:
        e = standings.lookup.get((player_id, surface))
        surfaces.append(
            SurfaceStanding(
                surface=surface,
                rank=e.rank if e else None,
                of=len(standings.by_surface[surface]),
                elo=e.elo if e else None,
                surface_elo=e.surface_elo if e else None,
                matches=e.matches if e else 0,
            )
        )
    active = any(standings.lookup.get((player_id, s)) for s in STANDING_SURFACES)
    return PlayerStandingResponse(
        player_id=player_id,
        active=active,
        as_of=standings.as_of.isoformat(),
        min_matches=MIN_SURFACE_MATCHES,
        surfaces=surfaces,
    )
