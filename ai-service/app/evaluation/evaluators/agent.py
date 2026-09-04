"""Agent evaluator — tests LangGraph recommendation workflow offline with mocks."""

import json
from unittest.mock import AsyncMock, patch, MagicMock

from app.evaluation.models import EvaluationCase, EvaluationResult
from app.evaluation.metrics import agent_success
from app.agents.state import RecommendationState


# Deterministic mock data for flights
_MOCK_FLIGHTS = {
    "flights": [
        {"flight_iata": "AI302", "dep_iata": "DEL", "arr_iata": "BOM", "flight_status": "scheduled", "airline_iata": "AI", "price": None},
        {"flight_iata": "6E101", "dep_iata": "DEL", "arr_iata": "BOM", "flight_status": "scheduled", "airline_iata": "6E", "price": None},
    ],
    "count": 2,
}

_MOCK_WEATHER = {"temperature": 28, "windSpeed": 10, "humidity": 60, "weatherCondition": "Clear"}


class _FakeLLM:
    """Deterministic fake LLM for agent evaluation — no OpenRouter quota."""

    def __init__(self, prefs_response: dict):
        self.prefs_response = prefs_response
        self.calls = []

    def is_configured(self) -> bool:
        return True

    async def complete(self, messages, model=None, temperature=0.0, max_tokens=512, tools=None):
        # Detect preference parsing vs recommendation generation by prompt content
        if messages and any("Extract flight search preferences" in m.content for m in messages):
            self.calls.append("parse_preferences")
            return MagicMock(content=json.dumps(self.prefs_response))
        else:
            self.calls.append("generate_recommendation")
            return MagicMock(content="Recommended flight AI302 based on schedule and convenience. Limitations apply.")
        # Provide dummy for any other


def _prefs_for_case(case: EvaluationCase) -> dict:
    meta = case.metadata or {}
    # Infer prefs from input keywords
    q = case.input.lower()
    origin = meta.get("expected_origin")
    dest = meta.get("expected_destination")
    if not origin:
        if "delhi" in q or "del" in q:
            origin = "DEL"
        elif "bom" in q or "mumbai" in q:
            origin = "BOM"
        elif "jfk" in q:
            origin = "JFK"
    if not dest:
        if "mumbai" in q or "bom" in q:
            dest = "BOM"
        elif "london" in q or "lon" in q:
            dest = "LON"
        elif "lax" in q:
            dest = "LAX"
    return {
        "origin": origin,
        "destination": dest,
        "travel_date": None,
        "travel_time": None,
        "budget": 15000 if "budget" in q else None,
        "budget_currency": "INR" if "budget" in q else None,
        "direct_only": meta.get("expected_direct_only", False) or ("direct" in q),
        "airline_preference": None,
        "other_preferences": None,
    }


async def evaluate_agent(case: EvaluationCase) -> EvaluationResult:
    """Run recommendation workflow with mocked tools and fake LLM."""
    prefs_response = _prefs_for_case(case)
    fake_llm = _FakeLLM(prefs_response)

    from app.agents.recommendation_agent import compile_recommendation_graph

    # Patch all tool executions and LLM
    # Mock registry.execute for search_flights, get_weather, get_flight_status
    original_execute = None
    try:
        from app.tools.registry import registry

        async def mock_execute(name, args):
            from app.tools.base import ToolResult
            if name == "search_flights":
                return ToolResult(success=True, data=_MOCK_FLIGHTS)
            if name == "get_weather":
                return ToolResult(success=True, data=_MOCK_WEATHER)
            if name == "get_flight_status":
                return ToolResult(success=True, data={"status": "scheduled", "airline": "AI", "aircraft": "B738"})
            return ToolResult(success=True, data={})

        with patch.object(registry, "execute", new=AsyncMock(side_effect=mock_execute)):
            graph = compile_recommendation_graph(fake_llm)
            state = RecommendationState(user_request=case.input)
            result_dict = await graph.ainvoke(state)

            # Extract final state
            if isinstance(result_dict, dict):
                recommendation = result_dict.get("recommendation")
                candidate_flights = result_dict.get("candidate_flights", [])
                scored_flights = result_dict.get("scored_flights", [])
                ranked_flights = result_dict.get("ranked_flights", [])
                weather_data = result_dict.get("weather_data", {})
                preferences = result_dict.get("preferences")
                errors = result_dict.get("errors", [])
                price_data_available = result_dict.get("price_data_available", False)
            else:
                recommendation = getattr(result_dict, "recommendation", None)
                candidate_flights = getattr(result_dict, "candidate_flights", [])
                scored_flights = getattr(result_dict, "scored_flights", [])
                ranked_flights = getattr(result_dict, "ranked_flights", [])
                weather_data = getattr(result_dict, "weather_data", {})
                preferences = getattr(result_dict, "preferences", None)
                errors = getattr(result_dict, "errors", [])
                price_data_available = getattr(result_dict, "price_data_available", False)

            required_steps = case.metadata.get("required_steps", ["parse_preferences", "search_flights", "score_flights", "rank_flights", "generate_recommendation"])
            completed_steps = []
            if preferences:
                completed_steps.append("parse_preferences")
            if candidate_flights:
                completed_steps.append("search_flights")
            # enrich_flights is optional, check if executed via call history not needed
            if weather_data:
                completed_steps.append("get_weather")
            if scored_flights:
                completed_steps.append("score_flights")
            if ranked_flights:
                completed_steps.append("rank_flights")
            if recommendation and recommendation.explanation:
                completed_steps.append("generate_recommendation")

            success_score = agent_success(required_steps, completed_steps)

            # Check no price fabrication when price unavailable
            check_fabrication = case.metadata.get("check_no_price_fabrication", False)
            fabrication_ok = True
            fabrication_detail = ""
            if check_fabrication and recommendation:
                expl = recommendation.explanation or ""
                # Price should not be fabricated: check via guardrail
                from app.guardrails import guardrail_service
                grounding = {"price": None, "delay_probability": None}
                gr = guardrail_service.validate_output(expl, grounding_context=grounding)
                has_price_hallucination = any(v.violation_type.value in ("unsupported_claim", "fabricated_data") and "price" in v.message for v in gr.violations)
                if has_price_hallucination:
                    fabrication_ok = False
                    fabrication_detail = "Price fabrication detected in recommendation explanation"

            passed = success_score >= 1.0 and fabrication_ok
            if not fabrication_ok:
                passed = False

            failure = None
            if not passed:
                if success_score < 1.0:
                    missing = [s for s in required_steps if s not in completed_steps]
                    failure = f"Agent workflow incomplete: missing {missing}, completed {completed_steps}, errors={errors}"
                elif not fabrication_ok:
                    failure = fabrication_detail

            metrics = {
                "agent_success": success_score,
                "correctness": 1.0 if passed else 0.0,
                "fabrication_ok": 1.0 if fabrication_ok else 0.0,
            }

            return EvaluationResult(
                case_id=case.id,
                category=case.category,
                input=case.input,
                expected={"required_steps": required_steps, "check_no_price_fabrication": check_fabrication},
                actual={
                    "completed_steps": completed_steps,
                    "candidate_count": len(candidate_flights) if candidate_flights else 0,
                    "recommendation_generated": bool(recommendation and recommendation.explanation),
                    "fabrication_ok": fabrication_ok,
                    "explanation": (recommendation.explanation[:200] if recommendation else ""),
                },
                passed=passed,
                metrics=metrics,
                failure_reason=failure,
            )
    except Exception as e:
        return EvaluationResult(
            case_id=case.id,
            category=case.category,
            input=case.input,
            expected={"required_steps": case.metadata.get("required_steps", [])},
            actual={"error": str(e)},
            passed=False,
            metrics={"agent_success": 0.0},
            failure_reason=f"Agent evaluation error: {e}",
        )
