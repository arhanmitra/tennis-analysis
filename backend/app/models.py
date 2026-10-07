from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Player(Base):
    __tablename__ = "players"

    # Source IDs are alphanumeric strings (e.g. "A0E2"), not integers — confirmed
    # against the live ATP_Database.csv / match CSVs, despite ARCHITECTURE.md's
    # original INTEGER assumption.
    player_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, index=True)
    hand: Mapped[str | None] = mapped_column(String, nullable=True)
    height_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ioc: Mapped[str | None] = mapped_column(String, nullable=True)
    dob: Mapped[str | None] = mapped_column(Date, nullable=True)


class Match(Base):
    __tablename__ = "matches"

    match_id: Mapped[str] = mapped_column(String, primary_key=True)

    tourney_id: Mapped[str | None] = mapped_column(String, nullable=True)
    tourney_name: Mapped[str | None] = mapped_column(String, nullable=True)
    surface: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    tourney_level: Mapped[str | None] = mapped_column(String, nullable=True)
    indoor: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    tourney_date: Mapped[str] = mapped_column(Date, index=True)
    round: Mapped[str | None] = mapped_column(String, nullable=True)
    best_of: Mapped[int | None] = mapped_column(Integer, nullable=True)

    winner_id: Mapped[str] = mapped_column(ForeignKey("players.player_id"), index=True)
    loser_id: Mapped[str] = mapped_column(ForeignKey("players.player_id"), index=True)

    winner_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    loser_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    winner_rank_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    loser_rank_points: Mapped[int | None] = mapped_column(Integer, nullable=True)

    winner_age: Mapped[float | None] = mapped_column(Float, nullable=True)
    loser_age: Mapped[float | None] = mapped_column(Float, nullable=True)
    winner_ht: Mapped[int | None] = mapped_column(Integer, nullable=True)
    loser_ht: Mapped[int | None] = mapped_column(Integer, nullable=True)
    winner_hand: Mapped[str | None] = mapped_column(String, nullable=True)
    loser_hand: Mapped[str | None] = mapped_column(String, nullable=True)

    score: Mapped[str | None] = mapped_column(String, nullable=True)
    minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_retirement: Mapped[bool] = mapped_column(Boolean, default=False)

    w_ace: Mapped[float | None] = mapped_column(Float, nullable=True)
    w_df: Mapped[float | None] = mapped_column(Float, nullable=True)
    w_svpt: Mapped[float | None] = mapped_column(Float, nullable=True)
    w_1stIn: Mapped[float | None] = mapped_column(Float, nullable=True)
    w_1stWon: Mapped[float | None] = mapped_column(Float, nullable=True)
    w_2ndWon: Mapped[float | None] = mapped_column(Float, nullable=True)
    w_SvGms: Mapped[float | None] = mapped_column(Float, nullable=True)
    w_bpSaved: Mapped[float | None] = mapped_column(Float, nullable=True)
    w_bpFaced: Mapped[float | None] = mapped_column(Float, nullable=True)

    l_ace: Mapped[float | None] = mapped_column(Float, nullable=True)
    l_df: Mapped[float | None] = mapped_column(Float, nullable=True)
    l_svpt: Mapped[float | None] = mapped_column(Float, nullable=True)
    l_1stIn: Mapped[float | None] = mapped_column(Float, nullable=True)
    l_1stWon: Mapped[float | None] = mapped_column(Float, nullable=True)
    l_2ndWon: Mapped[float | None] = mapped_column(Float, nullable=True)
    l_SvGms: Mapped[float | None] = mapped_column(Float, nullable=True)
    l_bpSaved: Mapped[float | None] = mapped_column(Float, nullable=True)
    l_bpFaced: Mapped[float | None] = mapped_column(Float, nullable=True)


class EloHistory(Base):
    __tablename__ = "elo_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.player_id"), index=True)
    as_of_date: Mapped[str] = mapped_column(Date, index=True)
    surface: Mapped[str] = mapped_column(String, index=True)  # overall, Hard, Clay, Grass, Carpet
    elo: Mapped[float] = mapped_column(Float)
    match_id: Mapped[str | None] = mapped_column(String, nullable=True)


class ModelPrediction(Base):
    __tablename__ = "model_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    player_a_id: Mapped[str] = mapped_column(String)
    player_b_id: Mapped[str] = mapped_column(String)
    predicted_prob_a: Mapped[float] = mapped_column(Float)
    actual_winner_id: Mapped[str | None] = mapped_column(String, nullable=True)
    predicted_at: Mapped[str] = mapped_column(DateTime)
    model_version: Mapped[str] = mapped_column(String)
