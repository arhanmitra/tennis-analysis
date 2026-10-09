from pydantic import BaseModel


class PlayerOut(BaseModel):
    player_id: str
    name: str
    hand: str | None = None
    height_cm: int | None = None
    ioc: str | None = None

    class Config:
        from_attributes = True


class PredictRequest(BaseModel):
    player_a_id: str
    player_b_id: str
    surface: str = "Hard"
    round: str = "R32"
    tourney_level: str = "A"
    best_of: int = 3


class FeatureContribution(BaseModel):
    feature: str
    value: float
    contribution: float


class PredictResponse(BaseModel):
    player_a_id: str
    player_b_id: str
    prob_a: float
    prob_b: float
    top_features: list[FeatureContribution]


class EloPoint(BaseModel):
    as_of_date: str
    surface: str
    elo: float


class RatingsResponse(BaseModel):
    player_id: str
    history: list[EloPoint]


class RankVsEloPoint(BaseModel):
    as_of_date: str
    elo: float | None = None
    official_rank: int | None = None
    predicted_rank: float | None = None


class RankVsEloResponse(BaseModel):
    player_id: str
    history: list[RankVsEloPoint]


class H2HMatch(BaseModel):
    match_id: str
    tourney_name: str | None
    surface: str | None
    tourney_date: str
    round: str | None
    winner_id: str
    score: str | None


class H2HResponse(BaseModel):
    player_a_id: str
    player_b_id: str
    player_a_wins: int
    player_b_wins: int
    surface_breakdown: dict[str, dict[str, int]]
    matches: list[H2HMatch]


class CalibrationBucket(BaseModel):
    bucket_lower: float
    bucket_upper: float
    predicted_mean: float
    actual_win_rate: float
    count: int


class RollingAccuracyPoint(BaseModel):
    period: str
    model_accuracy: float
    baseline_rank_accuracy: float
    log_loss: float
    n_matches: int


class ConfusionMatrix(BaseModel):
    true_positive: int
    false_positive: int
    true_negative: int
    false_negative: int


class ModelPerformanceResponse(BaseModel):
    overall_accuracy: float
    baseline_rank_accuracy: float
    # Overall only (from training metadata, same test set); not bucketed by month.
    baseline_elo_accuracy: float | None = None
    overall_log_loss: float
    rolling: list[RollingAccuracyPoint]
    calibration: list[CalibrationBucket]
    confusion_matrix: ConfusionMatrix
    model_version: str
    n_test_matches: int


class StandingEntry(BaseModel):
    player_id: str
    name: str
    ioc: str | None = None
    rank: int | None = None  # None when below the minimum match count for this surface
    elo: float  # ranking rating: overall Elo, or the 50/50 surface/overall blend
    surface_elo: float | None = None
    matches: int
    official_rank: int | None = None


class LeaderboardResponse(BaseModel):
    surface: str
    as_of: str
    n_ranked: int
    min_matches: int
    entries: list[StandingEntry]


class SurfaceStanding(BaseModel):
    surface: str
    rank: int | None = None
    of: int
    elo: float | None = None
    surface_elo: float | None = None
    matches: int = 0


class PlayerStandingResponse(BaseModel):
    player_id: str
    active: bool
    as_of: str
    min_matches: int
    surfaces: list[SurfaceStanding]
