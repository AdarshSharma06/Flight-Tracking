"""Flight recommendation agent — LangGraph multi-step workflow.

Builds and compiles a StateGraph that orchestrates the full recommendation flow:
parse_preferences → search_flights → enrich_flights → get_weather → get_predictions
→ score_flights → rank_flights → generate_recommendation

Uses existing ToolRegistry tools for all external data access:
- search_flights: search flights by route
- get_flight_status: enrich candidates with status details
- get_weather: weather at origin/destination airports

LLM is used only for preference parsing and recommendation generation.
"""

import dataclasses
import logging
from typing import Optional

from langgraph.graph import END, StateGraph

from app.agents.nodes import (
    enrich_flights,
    generate_recommendation,
    get_predictions,
    get_weather,
    parse_preferences,
    rank_flights_node,
    score_flights,
    search_flights,
)
from app.agents.state import RecommendationState
from app.llm.base import LLMClient

logger = logging.getLogger(__name__)


def _route_after_parse(state: RecommendationState) -> str:
    """Route based on whether preferences were parsed successfully."""
    if state.errors and not state.preferences:
        return "end_no_preferences"
    if not state.preferences or (
        not state.preferences.origin and not state.preferences.destination
    ):
        return "end_no_preferences"
    return "search_flights"


def _route_after_search(state: RecommendationState) -> str:
    """Route based on whether flights were found."""
    if not state.candidate_flights:
        return "generate_recommendation"
    return "enrich_flights"


def _route_after_enrich(state: RecommendationState) -> str:
    """Always proceed to weather after enrichment."""
    return "get_weather"


def _route_after_weather(state: RecommendationState) -> str:
    """Always proceed to predictions after weather."""
    return "get_predictions"


def _route_after_predictions(state: RecommendationState) -> str:
    """Always proceed to scoring after predictions."""
    return "score_flights"


def _route_after_score(state: RecommendationState) -> str:
    """Always proceed to ranking after scoring."""
    return "rank_flights"


def _route_after_rank(state: RecommendationState) -> str:
    """Always proceed to recommendation generation after ranking."""
    return "generate_recommendation"


def build_recommendation_graph(llm_client: Optional[LLMClient] = None) -> StateGraph:
    """Build the LangGraph recommendation workflow graph.

    The graph has 8 nodes:
    1. parse_preferences — LLM extracts structured preferences
    2. search_flights — ToolRegistry searches for flights
    3. enrich_flights — Optional flight detail enrichment
    4. get_weather — Weather data at origin/destination
    5. get_predictions — Delay prediction placeholder (AI-11)
    6. score_flights — Deterministic multi-factor scoring
    7. rank_flights — Sort by score
    8. generate_recommendation — LLM generates human-readable recommendation
    """

    async def _parse_preferences(state: RecommendationState) -> dict:
        if not llm_client or not llm_client.is_configured():
            errors = list(state.errors)
            errors.append("LLM not configured — cannot parse preferences")
            return {"errors": errors}
        return await parse_preferences(state, llm_client)

    async def _generate_recommendation(state: RecommendationState) -> dict:
        if not llm_client or not llm_client.is_configured():
            from app.agents.state import RecommendationResult
            top = state.ranked_flights[0] if state.ranked_flights else None
            return {
                "recommendation": RecommendationResult(
                    recommended_flight=top,
                    explanation=(
                        f"Flight {top.candidate.flight_number} is the highest-rated option "
                        f"(score: {top.score}). LLM-based explanation unavailable."
                    )
                    if top
                    else RecommendationResult(
                        explanation="No flights found and LLM is not configured."
                    ),
                    limitations=state.errors + ["LLM not configured"],
                    total_flights_evaluated=len(state.ranked_flights),
                )
            }
        return await generate_recommendation(state, llm_client)

    graph = StateGraph(RecommendationState)

    graph.add_node("parse_preferences", _parse_preferences)
    graph.add_node("search_flights", search_flights)
    graph.add_node("enrich_flights", enrich_flights)
    graph.add_node("get_weather", get_weather)
    graph.add_node("get_predictions", get_predictions)
    graph.add_node("score_flights", score_flights)
    graph.add_node("rank_flights", rank_flights_node)
    graph.add_node("generate_recommendation", _generate_recommendation)

    graph.set_entry_point("parse_preferences")

    graph.add_conditional_edges(
        "parse_preferences",
        _route_after_parse,
        {
            "search_flights": "search_flights",
            "end_no_preferences": "generate_recommendation",
        },
    )

    graph.add_conditional_edges(
        "search_flights",
        _route_after_search,
        {
            "enrich_flights": "enrich_flights",
            "generate_recommendation": "generate_recommendation",
        },
    )

    graph.add_conditional_edges(
        "enrich_flights",
        _route_after_enrich,
        {"get_weather": "get_weather"},
    )

    graph.add_conditional_edges(
        "get_weather",
        _route_after_weather,
        {"get_predictions": "get_predictions"},
    )

    graph.add_conditional_edges(
        "get_predictions",
        _route_after_predictions,
        {"score_flights": "score_flights"},
    )

    graph.add_conditional_edges(
        "score_flights",
        _route_after_score,
        {"rank_flights": "rank_flights"},
    )

    graph.add_conditional_edges(
        "rank_flights",
        _route_after_rank,
        {"generate_recommendation": "generate_recommendation"},
    )

    graph.add_edge("generate_recommendation", END)

    return graph


def compile_recommendation_graph(
    llm_client: Optional[LLMClient] = None,
):
    """Build and compile the recommendation graph for execution."""
    graph = build_recommendation_graph(llm_client)
    compiled = graph.compile()

    original_ainvoke = compiled.ainvoke

    async def _ainvoke_with_dict(state, config=None, **kwargs):
        if dataclasses.is_dataclass(state) and not isinstance(state, dict):
            state_dict = dataclasses.asdict(state)
        elif isinstance(state, RecommendationState):
            state_dict = dataclasses.asdict(state)
        else:
            state_dict = state
        return await original_ainvoke(state_dict, config=config, **kwargs)

    compiled.ainvoke = _ainvoke_with_dict
    return compiled
