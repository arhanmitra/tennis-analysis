from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Match, Player
from app.schemas import H2HMatch, H2HResponse

router = APIRouter(tags=["h2h"])


@router.get("/h2h", response_model=H2HResponse)
def get_h2h(
    player_a: str = Query(...),
    player_b: str = Query(...),
    db: Session = Depends(get_db),
):
    if not db.get(Player, player_a) or not db.get(Player, player_b):
        raise HTTPException(status_code=404, detail="Player not found")

    rows = db.execute(
        select(Match)
        .where(
            or_(
                (Match.winner_id == player_a) & (Match.loser_id == player_b),
                (Match.winner_id == player_b) & (Match.loser_id == player_a),
            )
        )
        .order_by(Match.tourney_date.desc())
    ).scalars().all()

    a_wins = sum(1 for m in rows if m.winner_id == player_a)
    b_wins = sum(1 for m in rows if m.winner_id == player_b)

    surface_breakdown: dict[str, dict[str, int]] = defaultdict(lambda: {"player_a": 0, "player_b": 0})
    for m in rows:
        surface = m.surface or "Unknown"
        key = "player_a" if m.winner_id == player_a else "player_b"
        surface_breakdown[surface][key] += 1

    matches = [
        H2HMatch(
            match_id=m.match_id,
            tourney_name=m.tourney_name,
            surface=m.surface,
            tourney_date=m.tourney_date.isoformat(),
            round=m.round,
            winner_id=m.winner_id,
            score=m.score,
        )
        for m in rows
    ]

    return H2HResponse(
        player_a_id=player_a,
        player_b_id=player_b,
        player_a_wins=a_wins,
        player_b_wins=b_wins,
        surface_breakdown=dict(surface_breakdown),
        matches=matches,
    )
