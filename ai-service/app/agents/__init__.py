"""Agents package — AI-5 recommendation agent."""

from app.agents.recommendation_agent import (
    build_recommendation_graph,
    compile_recommendation_graph,
)
from app.agents.state import (
    FlightCandidate,
    PredictionInfo,
    RecommendationResult,
    RecommendationState,
    ScoredFlight,
    UserPreferences,
    WeatherInfo,
)

__all__ = [
    "build_recommendation_graph",
    "compile_recommendation_graph",
    "FlightCandidate",
    "PredictionInfo",
    "RecommendationResult",
    "RecommendationState",
    "ScoredFlight",
    "UserPreferences",
    "WeatherInfo",
]
