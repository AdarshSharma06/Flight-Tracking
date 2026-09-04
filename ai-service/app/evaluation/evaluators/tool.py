"""Tool evaluator — checks tool selection and mocked execution."""

from unittest.mock import AsyncMock, patch

from app.evaluation.models import EvaluationCase, EvaluationResult
from app.evaluation.metrics import tool_selection_accuracy
from app.tools.registry import registry
from app.tools import register_all_tools


# Ensure registry populated (idempotent)
try:
    register_all_tools()
except Exception:
    pass

# Mock responses for each tool (deterministic, no real API)
_MOCK_TOOL_RESPONSES: dict[str, dict] = {
    "get_flight_status": {"flightNumber": "AI302", "status": "active", "airline": "AI"},
    "get_flight_tracking": {"flightNumber": "AI302", "latitude": 28.5, "longitude": 77.1, "live_data_available": True},
    "get_weather": {"temperature": 25.0, "weatherCondition": "Clear"},
    "get_airport_departures": {"airport": "DEL", "flights": [], "count": 0},
    "get_airport_arrivals": {"airport": "BOM", "flights": [], "count": 0},
    "search_flights": {"flights": [{"flight_iata": "AI302", "dep_iata": "DEL", "arr_iata": "BOM"}], "count": 1},
    "get_airport_information": {"iata": "DEL", "name": "Indira Gandhi International"},
}

# Keyword heuristic for expected tool inference (used to simulate LLM tool choice offline)
_TOOL_KEYWORDS: dict[str, list[str]] = {
    "get_flight_status": ["delayed", "status", "is ai", "is flight"],
    "get_flight_tracking": ["where is", "tracking", "position", "live"],
    "get_weather": ["weather", "temperature", "metar"],
    "get_airport_departures": ["departures", "departing"],
    "get_airport_arrivals": ["arrivals", "arriving"],
    "search_flights": ["find flights", "search flights", "flights from", "jfk to", "del to"],
    "get_airport_information": ["tell me about", "airport information", "about delhi airport", "about airport"],
}


def _infer_tool(question: str) -> list[str]:
    q = question.lower()
    # Priority: more specific first
    if "departures" in q:
        return ["get_airport_departures"]
    if "arrivals" in q:
        return ["get_airport_arrivals"]
    if "weather" in q:
        return ["get_weather"]
    if "where is" in q or "tracking" in q:
        return ["get_flight_tracking"]
    if "find flights" in q or "flights from" in q or "search" in q:
        return ["search_flights"]
    if "tell me about" in q and "airport" in q:
        return ["get_airport_information"]
    if "delayed" in q or "status" in q:
        return ["get_flight_status"]
    return []


async def evaluate_tool(case: EvaluationCase) -> EvaluationResult:
    """Evaluate tool selection and mocked execution."""
    expected_tools = case.expected_tools or []

    # Simulate LLM tool selection via heuristic (offline, deterministic)
    inferred = _infer_tool(case.input)
    # If no heuristic match but expected single tool, use expected as inferred for execution test
    # (ensures execution path is tested even when heuristic ambiguous)
    actual_tools = inferred if inferred else []

    # For metric: if inferred empty but expected exists, count as miss unless we can execute expected
    acc = tool_selection_accuracy(expected_tools, actual_tools)

    # If expected tool exists but heuristic missed, fall back to expected for execution verification
    tools_to_execute = actual_tools if actual_tools else expected_tools

    execution_ok = True
    executed = []
    for tool_name in tools_to_execute:
        tool = registry.get(tool_name)
        if not tool:
            execution_ok = False
            break
        mock_resp = _MOCK_TOOL_RESPONSES.get(tool_name, {"ok": True})
        # Mock the Spring Boot client call
        patch_target = None
        if tool_name in ("get_flight_status", "get_flight_tracking"):
            patch_target = "app.tools.flight_tools.client.get"
        elif tool_name in ("get_airport_information", "get_airport_departures", "get_airport_arrivals"):
            patch_target = "app.tools.airport_tools.client.get"
        elif tool_name == "get_weather":
            patch_target = "app.tools.weather_tools.client.get"
        elif tool_name == "search_flights":
            patch_target = "app.tools.flight_search.client.get"

        try:
            if patch_target:
                with patch(patch_target, new_callable=AsyncMock, return_value=mock_resp):
                    # Build minimal valid args from metadata
                    args = {}
                    if tool_name == "get_flight_status" and "flight_number" not in case.metadata:
                        args = {"flight_number": case.metadata.get("flight_number", "AI302")}
                    elif tool_name == "get_flight_tracking":
                        args = {"flight_number": case.metadata.get("flight_number", "AI302")}
                    elif tool_name in ("get_airport_information", "get_airport_departures", "get_airport_arrivals", "get_weather"):
                        args = {"iata": case.metadata.get("iata", "DEL")}
                    elif tool_name == "search_flights":
                        args = {"dep_iata": case.metadata.get("dep_iata", "DEL"), "arr_iata": case.metadata.get("arr_iata", "BOM")}
                    else:
                        args = case.metadata or {}
                    result = await registry.execute(tool_name, args)
                    if not result.success:
                        execution_ok = False
                    else:
                        executed.append(tool_name)
            else:
                executed.append(tool_name)
        except Exception:
            execution_ok = False

    passed = (acc == 1.0) and execution_ok
    failure = None
    if not passed:
        if acc != 1.0:
            failure = f"Tool selection mismatch: expected {expected_tools} got {actual_tools}"
        elif not execution_ok:
            failure = f"Tool execution failed for {tools_to_execute}"

    metrics = {
        "tool_selection": acc,
        "correctness": acc,
        "execution_success": 1.0 if execution_ok else 0.0,
    }

    return EvaluationResult(
        case_id=case.id,
        category=case.category,
        input=case.input,
        expected={"expected_tools": expected_tools},
        actual={"actual_tools": actual_tools, "executed": executed, "execution_ok": execution_ok},
        passed=passed,
        metrics=metrics,
        failure_reason=failure,
    )
