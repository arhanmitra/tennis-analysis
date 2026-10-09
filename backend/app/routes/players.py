from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Match, Player
from app.schemas import PlayerOut

router = APIRouter(tags=["players"])

# "Active" = played a tour-level match in the last 12 months — same window as
# the win_pct_last52w feature, so it lines up with what "recent form" means
# elsewhere in the model. Used to keep the Predictor tab from matching a
# retired player against their last-known (often decades-stale) Elo/age.
ACTIVE_WINDOW_DAYS = 365


@router.get("/players", response_model=list[PlayerOut])
def search_players(
    search: str = Query(default="", min_length=0),
    limit: int = Query(default=20, le=100),
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    cutoff = date.today() - timedelta(days=ACTIVE_WINDOW_DAYS)
    active_ids = select(Match.winner_id).where(Match.tourney_date >= cutoff).union(
        select(Match.loser_id).where(Match.tourney_date >= cutoff)
    )
    is_active = Player.player_id.in_(active_ids)
    stmt = select(Player)
    if active_only:
        stmt = stmt.where(is_active)
    if search:
        stmt = stmt.where(Player.name.ilike(f"%{search}%"))
    # Active players first, so "Fritz" finds Taylor Fritz before seven historical
    # Fritzes that happen to sort earlier alphabetically.
    stmt = stmt.order_by(case((is_active, 0), else_=1), Player.name).limit(limit)
    return db.execute(stmt).scalars().all()


@router.get("/players/{player_id}", response_model=PlayerOut)
def get_player(player_id: str, db: Session = Depends(get_db)):
    player = db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return player
