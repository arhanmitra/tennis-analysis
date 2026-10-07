"""
Phase 1 — data ingestion.

Pulls the ATP main-tour year CSVs + ongoing_tourneys.csv + ATP_Database.csv from
stats.tennismylife.org and upserts them into the local SQLite `players` and
`matches` tables. See the Data section of the README for the source.

Run from backend/: `python -m ml.ingest`
"""

import re
import sys
from datetime import date, datetime
from pathlib import Path

import pandas as pd
import requests
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import Match, Player  # noqa: E402

FILE_INDEX_URL = "https://stats.tennismylife.org/api/data-files"
DATA_BASE_URL = "https://stats.tennismylife.org/data"
YEAR_FILE_RE = re.compile(r"^(\d{4})\.csv$")

REQUEST_TIMEOUT = 30


def list_source_files() -> list[str]:
    resp = requests.get(FILE_INDEX_URL, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    files = [f["name"] for f in resp.json()["files"]]

    # ATP main tour only: plain YYYY.csv year files, no challenger/wta/quali/amateur/backups.
    year_files = sorted(f for f in files if YEAR_FILE_RE.match(f))
    wanted = year_files + ["ongoing_tourneys.csv", "ATP_Database.csv"]
    return [f for f in wanted if f in files]


def fetch_csv(name: str) -> pd.DataFrame:
    url = f"{DATA_BASE_URL}/{name}"
    resp = requests.get(url, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    from io import StringIO

    return pd.read_csv(StringIO(resp.text), low_memory=False)


def _parse_birthdate(val) -> date | None:
    if pd.isna(val):
        return None
    try:
        return datetime.strptime(str(int(val)), "%Y%m%d").date()
    except (ValueError, OverflowError):
        return None


def _parse_tourney_date(val) -> date | None:
    if pd.isna(val):
        return None
    try:
        return datetime.strptime(str(int(val)), "%Y%m%d").date()
    except (ValueError, OverflowError):
        return None


def _nullable_int(val) -> int | None:
    if pd.isna(val):
        return None
    return int(val)


def _nullable_float(val) -> float | None:
    if pd.isna(val):
        return None
    return float(val)


def _nullable_str(val) -> str | None:
    if pd.isna(val):
        return None
    s = str(val).strip()
    return s if s else None


def upsert_players(db, pdb: pd.DataFrame) -> int:
    rows = []
    for _, r in pdb.iterrows():
        player_id = _nullable_str(r["id"])
        name = _nullable_str(r["player"]) or _nullable_str(r["atpname"])
        if not player_id or not name:
            continue
        rows.append(
            {
                "player_id": player_id,
                "name": name,
                "hand": _nullable_str(r.get("hand")),
                "height_cm": _nullable_int(r.get("height")),
                "ioc": _nullable_str(r.get("ioc")),
                "dob": _parse_birthdate(r.get("birthdate")),
            }
        )

    if not rows:
        return 0

    stmt = sqlite_insert(Player)
    stmt = stmt.on_conflict_do_update(
        index_elements=["player_id"],
        set_={
            "name": stmt.excluded.name,
            "hand": stmt.excluded.hand,
            "height_cm": stmt.excluded.height_cm,
            "ioc": stmt.excluded.ioc,
            "dob": stmt.excluded.dob,
        },
    )
    db.execute(stmt, rows)
    db.commit()
    return len(rows)


def _ensure_players_from_matches(db, match_df: pd.DataFrame) -> int:
    """Some winner_id/loser_id in the match CSVs aren't in ATP_Database.csv
    (older/obscure players). Backfill minimal player rows from the winner/loser
    name+hand+ht+ioc columns so every match_id's FK resolves."""
    seen: dict[str, dict] = {}
    for _, r in match_df.iterrows():
        for prefix in ("winner", "loser"):
            pid = _nullable_str(r.get(f"{prefix}_id"))
            if not pid or pid in seen:
                continue
            name = _nullable_str(r.get(f"{prefix}_name"))
            if not name:
                continue
            seen[pid] = {
                "player_id": pid,
                "name": name,
                "hand": _nullable_str(r.get(f"{prefix}_hand")),
                "height_cm": _nullable_int(r.get(f"{prefix}_ht")),
                "ioc": _nullable_str(r.get(f"{prefix}_ioc")),
                "dob": None,
            }

    if not seen:
        return 0

    rows = list(seen.values())
    stmt = sqlite_insert(Player)
    # Only fill in players missing entirely — don't clobber ATP_Database data
    # (which has hand/height/dob) with the thinner match-row fallback.
    stmt = stmt.on_conflict_do_nothing(index_elements=["player_id"])
    db.execute(stmt, rows)
    db.commit()
    return len(rows)


def upsert_matches(db, year_label: str, df: pd.DataFrame) -> int:
    rows = []
    for _, r in df.iterrows():
        winner_id = _nullable_str(r.get("winner_id"))
        loser_id = _nullable_str(r.get("loser_id"))
        tourney_id = _nullable_str(r.get("tourney_id"))
        match_num = r.get("match_num")
        tourney_date = _parse_tourney_date(r.get("tourney_date"))

        if not winner_id or not loser_id or not tourney_id or pd.isna(match_num) or not tourney_date:
            continue

        match_id = f"{tourney_id}-{int(match_num)}"
        score = _nullable_str(r.get("score"))
        is_retirement = bool(score) and any(
            marker in score for marker in ("RET", "W/O", "DEF", "ABN")
        )

        indoor_raw = _nullable_str(r.get("indoor"))
        indoor = None if indoor_raw is None else (indoor_raw.upper() == "I")

        rows.append(
            {
                "match_id": match_id,
                "tourney_id": tourney_id,
                "tourney_name": _nullable_str(r.get("tourney_name")),
                "surface": _nullable_str(r.get("surface")),
                "tourney_level": _nullable_str(r.get("tourney_level")),
                "indoor": indoor,
                "tourney_date": tourney_date,
                "round": _nullable_str(r.get("round")),
                "best_of": _nullable_int(r.get("best_of")),
                "winner_id": winner_id,
                "loser_id": loser_id,
                "winner_rank": _nullable_int(r.get("winner_rank")),
                "loser_rank": _nullable_int(r.get("loser_rank")),
                "winner_rank_points": _nullable_int(r.get("winner_rank_points")),
                "loser_rank_points": _nullable_int(r.get("loser_rank_points")),
                "winner_age": _nullable_float(r.get("winner_age")),
                "loser_age": _nullable_float(r.get("loser_age")),
                "winner_ht": _nullable_int(r.get("winner_ht")),
                "loser_ht": _nullable_int(r.get("loser_ht")),
                "winner_hand": _nullable_str(r.get("winner_hand")),
                "loser_hand": _nullable_str(r.get("loser_hand")),
                "score": score,
                "minutes": _nullable_float(r.get("minutes")),
                "is_retirement": is_retirement,
                "w_ace": _nullable_float(r.get("w_ace")),
                "w_df": _nullable_float(r.get("w_df")),
                "w_svpt": _nullable_float(r.get("w_svpt")),
                "w_1stIn": _nullable_float(r.get("w_1stIn")),
                "w_1stWon": _nullable_float(r.get("w_1stWon")),
                "w_2ndWon": _nullable_float(r.get("w_2ndWon")),
                "w_SvGms": _nullable_float(r.get("w_SvGms")),
                "w_bpSaved": _nullable_float(r.get("w_bpSaved")),
                "w_bpFaced": _nullable_float(r.get("w_bpFaced")),
                "l_ace": _nullable_float(r.get("l_ace")),
                "l_df": _nullable_float(r.get("l_df")),
                "l_svpt": _nullable_float(r.get("l_svpt")),
                "l_1stIn": _nullable_float(r.get("l_1stIn")),
                "l_1stWon": _nullable_float(r.get("l_1stWon")),
                "l_2ndWon": _nullable_float(r.get("l_2ndWon")),
                "l_SvGms": _nullable_float(r.get("l_SvGms")),
                "l_bpSaved": _nullable_float(r.get("l_bpSaved")),
                "l_bpFaced": _nullable_float(r.get("l_bpFaced")),
            }
        )

    if not rows:
        print(f"  {year_label}: 0 valid rows")
        return 0

    update_cols = [c for c in rows[0] if c != "match_id"]
    stmt = sqlite_insert(Match)
    stmt = stmt.on_conflict_do_update(
        index_elements=["match_id"],
        set_={c: getattr(stmt.excluded, c) for c in update_cols},
    )
    db.execute(stmt, rows)
    db.commit()
    print(f"  {year_label}: {len(rows)} rows upserted")
    return len(rows)


def main() -> None:
    import argparse
    from datetime import date

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--current-only",
        action="store_true",
        help=(
            "Only re-pull the current year's CSV + ongoing_tourneys.csv "
            "(for the daily refresh timer — full history only needs pulling once)."
        ),
    )
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    files = list_source_files()
    if args.current_only:
        current_year_file = f"{date.today().year}.csv"
        files = [f for f in files if f in (current_year_file, "ongoing_tourneys.csv", "ATP_Database.csv")]
    print(f"Found {len(files)} source files to ingest.")

    # Player reference table first so match rows' FKs mostly resolve immediately.
    if "ATP_Database.csv" in files:
        print("Fetching ATP_Database.csv ...")
        pdb = fetch_csv("ATP_Database.csv")
        n = upsert_players(db, pdb)
        print(f"  upserted {n} players")
        files.remove("ATP_Database.csv")

    total_matches = 0
    for name in files:
        print(f"Fetching {name} ...")
        try:
            df = fetch_csv(name)
        except requests.RequestException as e:
            print(f"  SKIPPED {name}: {e}")
            continue
        _ensure_players_from_matches(db, df)
        total_matches += upsert_matches(db, name, df)

    print(f"Done. {total_matches} match rows upserted this run.")
    db.close()


if __name__ == "__main__":
    main()
