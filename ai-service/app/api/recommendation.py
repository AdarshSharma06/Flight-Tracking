"""Recommendation endpoint — AI-5 flight recommendation API."""

import logging
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.agents.recommendation_agent import compile_recommendation_graph
from app.agents.state import RecommendationState
from app.llm import create_llm_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["recommendation"])

_llm_client = None


def _get_llm_client():
    global _llm_client
    if _llm_client is None:
        _llm_client = create_llm_client()
    return _llm_client


class RecommendationRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=1,
        max_length=4000,
        description="Natural language flight recommendation request",
    )


class FlightInfo(BaseModel):
    flight_number: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    airline: Optional[str] = None
    status: Optional[str] = None
    aircraft: Optional[str] = None


class ScoredFlightInfo(BaseModel):
    flight: FlightInfo
    score: float
    score_breakdown: dict
    weather_available: bool = False
    prediction_available: bool = False


class RecommendationResponse(BaseModel):
    recommended_flight: Optional[ScoredFlightInfo] = None
    alternatives: list[ScoredFlightInfo] = []
    explanation: str
    limitations: list[str] = []
    total_flights_evaluated: int = 0
    requestId: str


def _scored_flight_to_info(sf) -> ScoredFlightInfo:
    """Convert a ScoredFlight dataclass to a ScoredFlightInfo Pydantic model."""
    c = sf.candidate
    return ScoredFlightInfo(
        flight=FlightInfo(
            flight_number=c.flight_number,
            origin=c.origin,
            destination=c.destination,
            departure_time=c.departure_time,
            arrival_time=c.arrival_time,
            airline=c.airline,
            status=c.status,
            aircraft=c.aircraft,
        ),
        score=sf.score,
        score_breakdown=sf.score_breakdown,
        weather_available=sf.weather is not None and sf.weather.available
        if sf.weather
        else False,
        prediction_available=sf.prediction is not None and sf.prediction.available
        if sf.prediction
        else False,
    )


@router.post("/recommend", response_model=RecommendationResponse)
async def recommend(request: RecommendationRequest, http_request: Request):
    """Generate a flight recommendation based on natural language preferences.

    Uses LangGraph to orchestrate a multi-step workflow:
    preference parsing → flight search → enrichment → weather → scoring → ranking → recommendation
    """
    request_id = getattr(http_request.state, "request_id", "unknown")
    llm_client = _get_llm_client()

    initial_state = RecommendationState(user_request=request.query)

    try:
        graph = compile_recommendation_graph(llm_client)
        final_state = await graph.ainvoke(initial_state)

        if isinstance(final_state, dict):
            recommendation = final_state.get("recommendation")
        else:
            recommendation = getattr(final_state, "recommendation", None)

        if recommendation is None:
            from app.agents.state import RecommendationResult
            recommendation = RecommendationResult(
                explanation="Unable to generate recommendation.",
                limitations=["Graph execution did not produce a recommendation"],
            )

        recommended = None
        if recommendation.recommended_flight:
            recommended = _scored_flight_to_info(recommendation.recommended_flight)

        alternatives = [
            _scored_flight_to_info(sf) for sf in recommendation.alternatives
        ]

        return RecommendationResponse(
            recommended_flight=recommended,
            alternatives=alternatives,
            explanation=recommendation.explanation,
            limitations=recommendation.limitations,
            total_flights_evaluated=recommendation.total_flights_evaluated,
            requestId=request_id,
        )

    except Exception as e:
        logger.exception("Recommendation failed")
        return RecommendationResponse(
            explanation="Sorry, the recommendation service encountered an error. Please try again.",
            limitations=[f"Service error: {e}"],
            requestId=request_id,
        )
