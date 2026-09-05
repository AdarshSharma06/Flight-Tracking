"""Recommendation agent state — typed state for the LangGraph flight recommendation workflow."""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class UserPreferences:
    """Structured user preferences parsed from natural language."""
    origin: Optional[str] = None
    destination: Optional[str] = None
    travel_date: Optional[str] = None
    travel_time: Optional[str] = None
    budget: Optional[float] = None
    budget_currency: Optional[str] = None
    direct_only: bool = False
    airline_preference: Optional[str] = None
    other_preferences: Optional[str] = None


@dataclass
class FlightCandidate:
    """A flight retrieved from the search, with optional enrichment data."""
    flight_number: str
    origin: Optional[str] = None
    destination: Optional[str] = None
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    airline: Optional[str] = None
    status: Optional[str] = None
    aircraft: Optional[str] = None
    price: Optional[float] = None
    is_direct: Optional[bool] = None
    raw_data: dict = field(default_factory=dict)


@dataclass
class WeatherInfo:
    """Weather data for an airport."""
    airport_iata: str
    temperature: Optional[float] = None
    condition: Optional[str] = None
    wind_speed: Optional[float] = None
    humidity: Optional[float] = None
    available: bool = False


@dataclass
class PredictionInfo:
    """Delay prediction data (placeholder for AI-11)."""
    flight_number: str
    delay_probability: Optional[float] = None
    available: bool = False


@dataclass
class ScoredFlight:
    """A flight with its computed recommendation score."""
    candidate: FlightCandidate
    score: float = 0.0
    score_breakdown: dict = field(default_factory=dict)
    weather: Optional[WeatherInfo] = None
    prediction: Optional[PredictionInfo] = None


@dataclass
class RecommendationResult:
    """Final recommendation output."""
    recommended_flight: Optional[ScoredFlight] = None
    alternatives: list = field(default_factory=list)
    explanation: str = ""
    limitations: list = field(default_factory=list)
    total_flights_evaluated: int = 0


@dataclass
class RecommendationState:
    """State that flows through the LangGraph recommendation workflow."""
    user_request: str = ""
    preferences: Optional[UserPreferences] = None
    candidate_flights: list = field(default_factory=list)
    weather_data: dict = field(default_factory=dict)
    prediction_data: dict = field(default_factory=dict)
    scored_flights: list = field(default_factory=list)
    ranked_flights: list = field(default_factory=list)
    recommendation: Optional[RecommendationResult] = None
    errors: list = field(default_factory=list)
    unavailable_data: list = field(default_factory=list)
    price_data_available: bool = False


def _coerce_user_preferences(obj) -> Optional[UserPreferences]:
    """Coerce a plain dict (from LangGraph asdict) back to UserPreferences."""
    if obj is None:
        return None
    if isinstance(obj, UserPreferences):
        return obj
    if isinstance(obj, dict):
        try:
            direct_only_val = obj.get("direct_only")
            if "direct_only" not in obj:
                direct_only_val = False
            return UserPreferences(
                origin=obj.get("origin"),
                destination=obj.get("destination"),
                travel_date=obj.get("travel_date"),
                travel_time=obj.get("travel_time"),
                budget=obj.get("budget"),
                budget_currency=obj.get("budget_currency"),
                direct_only=direct_only_val,
                airline_preference=obj.get("airline_preference"),
                other_preferences=obj.get("other_preferences"),
            )
        except Exception:
            try:
                return UserPreferences(**obj)
            except Exception:
                return None
    return None


def coerce_recommendation_state(state) -> RecommendationState:
    """Normalize LangGraph state (dict or dataclass) to typed RecommendationState."""
    if isinstance(state, RecommendationState):
        if isinstance(state.preferences, dict):
            state.preferences = _coerce_user_preferences(state.preferences)
        return state
    if isinstance(state, dict):
        prefs = _coerce_user_preferences(state.get("preferences"))
        return RecommendationState(
            user_request=state.get("user_request", ""),
            preferences=prefs,
            candidate_flights=state.get("candidate_flights", []),
            weather_data=state.get("weather_data", {}),
            prediction_data=state.get("prediction_data", {}),
            scored_flights=state.get("scored_flights", []),
            ranked_flights=state.get("ranked_flights", []),
            recommendation=state.get("recommendation"),
            errors=state.get("errors", []),
            unavailable_data=state.get("unavailable_data", []),
            price_data_available=state.get("price_data_available", False),
        )
    return RecommendationState()
