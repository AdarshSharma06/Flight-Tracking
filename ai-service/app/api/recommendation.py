"""Recommendation endpoint — AI-5 flight recommendation API with AI-6 memory."""

import logging
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.agents.recommendation_agent import compile_recommendation_graph
from app.agents.state import RecommendationState, UserPreferences
from app.llm import create_llm_client
from app.memory.service import memory_service
from app.guardrails import guardrail_service

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


def _build_recommendation_grounding_context(recommendation, final_state: dict) -> dict:
    """Build grounding context for recommendation: price/prediction availability."""
    ctx: dict = {}
    # Price is never available from live flight data (AI-5 price_data_available)
    price_available = final_state.get("price_data_available", False) if isinstance(final_state, dict) else False
    ctx["price"] = True if price_available else None
    # Prediction never available until AI-11
    has_available_prediction = False
    if isinstance(final_state, dict):
        pred_data = final_state.get("prediction_data", {})
        if isinstance(pred_data, dict):
            has_available_prediction = any(
                getattr(v, "available", False) if hasattr(v, "available") else v.get("available", False)
                for v in pred_data.values()
            )
    ctx["delay_probability"] = True if has_available_prediction else None
    # Keep only unavailable entries for blocking; available True is kept but ignored
    return {k: v for k, v in ctx.items() if v is None or isinstance(v, (int, float))}


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

    Stored user preferences are loaded and used as defaults.
    Explicit preferences in the query override stored ones.
    """
    from app.observability.tracer import ensure_request_context
    from app.observability import tracer
    request_id = getattr(http_request.state, "request_id", "unknown")
    request_id = ensure_request_context(request_id)
    rec_start = tracer.start_timer()

    user_id = getattr(http_request.state, "user_id", None)

    # ── INPUT GUARDRAILS ────────────────────────────────────────────
    input_result = guardrail_service.validate_input(request.query)
    if input_result.blocked:
        refusal = guardrail_service.get_safe_refusal(input_result)
        logger.warning("Recommendation input blocked by guardrails")
        # Lifecycle is handled by middleware — keep only guardrail decision (already emitted by service)
        return RecommendationResponse(
            explanation=refusal,
            limitations=["Request blocked by input safety check"],
            requestId=request_id,
        )

    llm_client = _get_llm_client()

    # Load stored preferences and inject into initial state
    stored_prefs = {}
    if user_id:
        try:
            stored_prefs = await memory_service.get_preferences(user_id)
        except Exception as e:
            logger.debug("Could not load stored preferences: %s", e)

    # Build initial preferences from stored data
    initial_preferences = None
    if stored_prefs:
        merged = memory_service.merge_preferences(stored_prefs)
        initial_preferences = UserPreferences(**merged)

    initial_state = RecommendationState(
        user_request=request.query,
        preferences=initial_preferences,
    )

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

        # ── OUTPUT GUARDRAILS (with grounding: price/prediction) ──────
        explanation_text = recommendation.explanation
        grounding_context = _build_recommendation_grounding_context(
            recommendation, final_state if isinstance(final_state, dict) else {}
        )
        output_result = guardrail_service.validate_output(
            explanation_text, grounding_context=grounding_context
        )
        if output_result.sanitized_text:
            explanation_text = output_result.sanitized_text
        limitations = list(recommendation.limitations)
        if any(v.violation_type.value in ("unsupported_claim", "fabricated_data") for v in output_result.violations):
            limitations.append("Grounding check flagged unsupported price/prediction claims — output was sanitized.")

        # Success — lifecycle handled by middleware; component events already emitted via agent_step/llm/guardrail

        return RecommendationResponse(
            recommended_flight=recommended,
            alternatives=alternatives,
            explanation=explanation_text,
            limitations=limitations,
            total_flights_evaluated=recommendation.total_flights_evaluated,
            requestId=request_id,
        )

    except Exception as e:
        # Middleware will record request_failed/request_completed; emit component-specific failure
        from app.observability.events import ObservabilityEvent
        tracer.emit(ObservabilityEvent(
            request_id=request_id,
            event_type="request_failed",
            operation="recommendation",
            component="agent",
            duration_ms=tracer.elapsed_ms(rec_start),
            status="failure",
            error_category="recommendation_error",
        ))
        logger.exception("Recommendation failed")
        return RecommendationResponse(
            explanation="Sorry, the recommendation service encountered an error. Please try again.",
            limitations=[f"Service error: {e}"],
            requestId=request_id,
        )
