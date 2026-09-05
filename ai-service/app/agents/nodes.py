"""LangGraph nodes for the flight recommendation workflow.

Each node is an async function that takes RecommendationState and returns a dict
of state updates. Nodes use the existing ToolRegistry for all external data access.

Tools used by the recommendation agent:
- search_flights: search flights by route
- get_flight_status: enrich candidates with status/aircraft/airline details
- get_weather: weather conditions at origin/destination airports

Tools NOT used (intentionally):
- get_flight_tracking: live aircraft position is irrelevant for recommendation
- get_airport_information: airport details not needed for scoring
- get_airport_departures/arrivals: not needed for route-specific search
"""

import json
import logging
from typing import Optional

from app.agents.state import (
    FlightCandidate,
    PredictionInfo,
    RecommendationResult,
    RecommendationState,
    ScoredFlight,
    UserPreferences,
    WeatherInfo,
    coerce_recommendation_state,
)
from app.agents.ranking import score_flight, rank_flights
from app.llm.base import LLMClient, LLMMessage
from app.tools.registry import registry

logger = logging.getLogger(__name__)

# ── Observability helper (no secrets, no behavior change) ───────
_step_order = {
    "parse_preferences": 1,
    "search_flights": 2,
    "enrich_flights": 3,
    "get_weather": 4,
    "get_predictions": 5,
    "score_flights": 6,
    "rank_flights": 7,
    "generate_recommendation": 8,
}

def _record_agent_step(step_name: str, duration_ms: float, success: bool, status: str = ""):
    try:
        from app.observability.context import get_request_id
        from app.observability import tracer
        rid = get_request_id() or "unknown"
        tracer.record_agent_step(rid, step_name, _step_order.get(step_name, 0), duration_ms, success, status=status)
    except Exception:
        pass

MAX_SEARCH_RESULTS = 20

# ── IATA normalization ──────────────────────────────────────────
# LLMs sometimes return city/airport names instead of IATA codes.
# Spring Boot rejects non-3-letter values via validateIataIfPresent.
# This mapping converts common city names to their IATA codes.

_CITY_TO_IATA: dict[str, str] = {
    # India
    "delhi": "DEL",
    "new delhi": "DEL",
    "mumbai": "BOM",
    "bombay": "BOM",
    "bangalore": "BLR",
    "bengaluru": "BLR",
    "chennai": "MAA",
    "madras": "MAA",
    "kolkata": "CCU",
    "calcutta": "CCU",
    "hyderabad": "HYD",
    "pune": "PNQ",
    "ahmedabad": "AMD",
    "goa": "GOI",
    "jaipur": "JAI",
    "lucknow": "LKO",
    "chandigarh": "IXC",
    "bhopal": "BHO",
    "indore": "IDR",
    "nagpur": "NAG",
    "patna": "PAT",
    "guwahati": "GAU",
    "cochin": "COK",
    "kochi": "COK",
    "trivandrum": "TRV",
    "thiruvananthapuram": "TRV",
    "calicut": "CCJ",
    "kozhikode": "CCJ",
    "visakhapatnam": "VTZ",
    "vijayawada": "VGA",
    "tiruchirappalli": "TRZ",
    "madurai": "IXM",
    "coimbatore": "CJB",
    "dehradun": "DED",
    "varanasi": "VNS",
    "amritsar": "ATQ",
    "ranchi": "IXR",
    "hubli": "HBX",
    "mangalore": "IXE",
    "jammu": "IXJ",
    "srinagar": "SXR",
    "leh": "IXL",
    "puducherry": "PNY",
    # International
    "new york": "JFK",
    "los angeles": "LAX",
    "london": "LHR",
    "paris": "CDG",
    "tokyo": "NRT",
    "dubai": "DXB",
    "singapore": "SIN",
    "bangkok": "BKK",
    "hong kong": "HKG",
    "shanghai": "PVG",
    "beijing": "PEK",
    "frankfurt": "FRA",
    "amsterdam": "AMS",
    "istanbul": "IST",
    "kathmandu": "KTM",
    "colombo": "CMB",
    "dhaka": "DAC",
    "hanoi": "HAN",
    "ho chi minh": "SGN",
    "kuala lumpur": "KUL",
    "osaka": "KIX",
    "seoul": "ICN",
    "sydney": "SYD",
    "melbourne": "MEL",
    "toronto": "YYZ",
    "san francisco": "SFO",
    "chicago": "ORD",
    "washington": "IAD",
    "doha": "DOH",
    "abu dhabi": "AUH",
    "riyadh": "RUH",
    "jeddah": "JED",
}


def normalize_iata(value: str | None) -> str | None:
    """Normalize a value to a 3-letter IATA code.

    Accepts IATA codes (returned as-is) or common city/airport names
    (mapped to IATA). Returns None if value is None/empty or cannot
    be resolved.
    """
    if not value or not value.strip():
        return None
    v = value.strip()
    key = v.lower()
    if key in _CITY_TO_IATA:
        return _CITY_TO_IATA[key]
    if len(v) == 3 and v.isalpha():
        return v.upper()
    return None


def _extract_json_from_llm(text: str) -> dict:
    """Extract a JSON object from LLM text that may contain markdown fences."""
    text = text.strip()
    if "```json" in text:
        start = text.index("```json") + 7
        end = text.index("```", start)
        text = text[start:end].strip()
    elif "```" in text:
        start = text.index("```") + 3
        end = text.index("```", start)
        text = text[start:end].strip()

    if not text.startswith("{"):
        brace = text.find("{")
        if brace >= 0:
            text = text[brace:]
    if text.endswith("}"):
        pass
    else:
        close = text.rfind("}")
        if close >= 0:
            text = text[: close + 1]

    return json.loads(text)


async def parse_preferences(state: RecommendationState, llm: LLMClient) -> dict:
    """Parse user's natural language request into structured preferences using LLM.

    If preferences already exist in state (e.g., from stored user preferences),
    LLM-extracted values override only non-null fields. This allows stored
    preferences to serve as defaults while explicit request values take precedence.
    """
    state = coerce_recommendation_state(state)
    prompt = f"""Extract flight search preferences from this request. Return ONLY a JSON object.

User request: "{state.user_request}"

Return JSON with these fields (use null for unknown/missing):
{{
  "origin": "3-letter IATA code or null",
  "destination": "3-letter IATA code or null",
  "travel_date": "YYYY-MM-DD or null",
  "travel_time": "HH:MM or null",
  "budget": "number or null (in the user's currency)",
  "budget_currency": "ISO 4217 code or null",
  "direct_only": "true, false, or null",
  "airline_preference": "airline name/code or null",
  "other_preferences": "any other stated preferences or null"
}}

direct_only rules:
- Return true ONLY when the current request explicitly asks for a direct/non-stop flight.
- Return false ONLY when the current request explicitly asks for a connecting/stopover/one-stop flight.
- Return null when the current request does not mention whether the flight should be direct.
The current request must be treated independently from any stored preferences."""

    try:
        response = await llm.complete(
            [LLMMessage(role="user", content=prompt)],
            temperature=0.0,
            max_tokens=512,
        )
        parsed = _extract_json_from_llm(response.content or "{}")

        # Start with existing preferences (from stored memory) if present
        existing = state.preferences or UserPreferences()

        # LLM-extracted values override only non-null fields
        preferences = UserPreferences(
            origin=normalize_iata(parsed.get("origin") or existing.origin),
            destination=normalize_iata(parsed.get("destination") or existing.destination),
            travel_date=parsed.get("travel_date") or existing.travel_date,
            travel_time=parsed.get("travel_time") or existing.travel_time,
            budget=parsed.get("budget") or existing.budget,
            budget_currency=parsed.get("budget_currency") or existing.budget_currency,
            direct_only=parsed.get("direct_only") if parsed.get("direct_only") is not None else existing.direct_only,
            airline_preference=parsed.get("airline_preference") or existing.airline_preference,
            other_preferences=parsed.get("other_preferences") or existing.other_preferences,
        )

        errors = list(state.errors)
        if not preferences.origin and not preferences.destination:
            errors.append(
                "Could not determine origin or destination from the request."
            )

        return {"preferences": preferences, "errors": errors}

    except Exception as e:
        logger.exception("Failed to parse preferences")
        errors = list(state.errors)
        errors.append(f"Failed to parse preferences: {e}")
        return {"errors": errors}


async def search_flights(state: RecommendationState) -> dict:
    """Search for flights using existing ToolRegistry search_flights tool."""
    state = coerce_recommendation_state(state)
    prefs = state.preferences
    if not prefs or (not prefs.origin and not prefs.destination):
        return {
            "errors": state.errors + ["Cannot search flights: origin/destination unknown"],
        }

    search_args = {"limit": MAX_SEARCH_RESULTS}
    if prefs.origin:
        search_args["dep_iata"] = prefs.origin
    if prefs.destination:
        search_args["arr_iata"] = prefs.destination

    result = await registry.execute("search_flights", search_args)

    if not result.success:
        errors = list(state.errors)
        errors.append(f"Flight search failed: {result.error}")
        return {"errors": errors}

    data = result.data or {}
    flights_raw = data.get("flights", data.get("data", []))

    if not flights_raw:
        return {
            "candidate_flights": [],
            "unavailable_data": state.unavailable_data + ["no_flights_found"],
        }

    candidates = []
    for f in flights_raw:
        candidates.append(
            FlightCandidate(
                flight_number=f.get("flight_iata", f.get("flightIata", f.get("flightNumber", f.get("flight_number", "unknown")))),
                origin=f.get("dep_iata", f.get("departureIata", "")),
                destination=f.get("arr_iata", f.get("arrivalIata", "")),
                departure_time=f.get("departure_time", f.get("departureScheduled", f.get("scheduled departure", f.get("departureTime")))),
                arrival_time=f.get("arrival_time", f.get("arrivalScheduled", f.get("scheduled arrival", f.get("arrivalTime")))),
                airline=f.get("airline_iata", f.get("airlineIata", f.get("airline", f.get("airlineName")))),
                status=f.get("flight_status", f.get("status")),
                aircraft=f.get("aircraft", f.get("aircraftIata", f.get("aircraftType"))),
                price=f.get("price"),
                is_direct=_infer_direct(f),
                raw_data=f,
            )
        )

    price_available = any(c.price is not None for c in candidates)

    return {"candidate_flights": candidates, "price_data_available": price_available}


def _infer_direct(flight_data: dict) -> Optional[bool]:
    """Infer if a flight is direct from available data."""
    stops = flight_data.get("stops", flight_data.get("stop_count"))
    if stops is not None:
        return int(stops) == 0

    dep = flight_data.get("dep_iata", flight_data.get("departureIata", ""))
    arr = flight_data.get("arr_iata", flight_data.get("arrivalIata", ""))
    if dep and arr and dep == arr:
        return False

    return None


async def enrich_flights(state: RecommendationState) -> dict:
    """Enrich flight candidates with status details (optional step).

    Uses get_flight_status to fill in missing status, aircraft, and airline data.
    Does NOT use get_flight_tracking — live aircraft position is not relevant
    for flight recommendation scoring.
    """
    state = coerce_recommendation_state(state)
    candidates = state.candidate_flights
    if not candidates:
        return {}

    enriched = []
    for candidate in candidates[:10]:
        if candidate.flight_number and candidate.flight_number != "unknown":
            try:
                result = await registry.execute(
                    "get_flight_status", {"flight_number": candidate.flight_number}
                )
                if result.success and result.data:
                    data = result.data
                    if not candidate.status:
                        candidate.status = data.get("status", data.get("flight_status"))
                    if not candidate.aircraft:
                        candidate.aircraft = data.get("aircraftIata", data.get("aircraft", data.get("aircraftType")))
                    if not candidate.airline:
                        candidate.airline = data.get("airlineIata", data.get("airline", data.get("airlineName")))
            except Exception as e:
                logger.debug("Could not enrich flight %s: %s", candidate.flight_number, e)

        enriched.append(candidate)

    return {"candidate_flights": enriched}


async def get_weather(state: RecommendationState) -> dict:
    """Get weather at origin and destination airports."""
    state = coerce_recommendation_state(state)
    prefs = state.preferences
    if not prefs:
        return {}

    airports_to_check = set()
    if prefs.origin:
        airports_to_check.add(prefs.origin)
    if prefs.destination:
        airports_to_check.add(prefs.destination)

    weather_data = dict(state.weather_data)
    unavailable = list(state.unavailable_data)

    for iata in airports_to_check:
        try:
            result = await registry.execute("get_weather", {"iata": iata})
            if result.success and result.data:
                data = result.data
                weather_data[iata] = WeatherInfo(
                    airport_iata=iata,
                    temperature=data.get("temperature", data.get("temp")),
                    condition=data.get("weatherCondition", data.get("condition")),
                    wind_speed=data.get("windSpeed", data.get("wind_speed")),
                    humidity=data.get("humidity"),
                    available=True,
                )
            else:
                weather_data[iata] = WeatherInfo(airport_iata=iata, available=False)
                unavailable.append(f"weather_{iata}")
        except Exception as e:
            logger.debug("Could not get weather for %s: %s", iata, e)
            weather_data[iata] = WeatherInfo(airport_iata=iata, available=False)
            unavailable.append(f"weather_{iata}")

    return {"weather_data": weather_data, "unavailable_data": unavailable}


async def get_predictions(state: RecommendationState) -> dict:
    """Placeholder for delay prediction (AI-11).

    Currently returns unavailable predictions for all flights.
    The future AI-11 implementation should plug into this node.
    """
    state = coerce_recommendation_state(state)
    predictions = {}
    unavailable = list(state.unavailable_data)

    for candidate in state.candidate_flights:
        predictions[candidate.flight_number] = PredictionInfo(
            flight_number=candidate.flight_number,
            delay_probability=None,
            available=False,
        )

    unavailable.append("delay_predictions_not_implemented")

    return {"prediction_data": predictions, "unavailable_data": unavailable}


async def score_flights(state: RecommendationState) -> dict:
    """Score each flight candidate deterministically."""
    state = coerce_recommendation_state(state)
    prefs = state.preferences
    if not prefs:
        prefs = UserPreferences()

    scored = []
    for candidate in state.candidate_flights:
        weather = state.weather_data.get(candidate.origin or "")
        prediction = state.prediction_data.get(candidate.flight_number)
        sf = score_flight(candidate, prefs, weather, prediction)
        scored.append(sf)

    return {"scored_flights": scored}


async def rank_flights_node(state: RecommendationState) -> dict:
    """Rank scored flights by total score, descending."""
    state = coerce_recommendation_state(state)
    ranked = rank_flights(state.scored_flights)
    return {"ranked_flights": ranked}


async def generate_recommendation(
    state: RecommendationState, llm: LLMClient
) -> dict:
    """Generate a human-readable recommendation using the LLM, grounded in actual data."""
    state = coerce_recommendation_state(state)
    if not state.ranked_flights:
        limitation_msgs = list(state.errors)
        if "no_flights_found" in state.unavailable_data:
            limitation_msgs.append(
                "No flights were found for the specified route and criteria."
            )
        return {
            "recommendation": RecommendationResult(
                explanation="I was unable to find flights matching your criteria.",
                limitations=limitation_msgs,
                total_flights_evaluated=0,
            )
        }

    if not llm or not llm.is_configured():
        top = state.ranked_flights[0]
        limitations = list(state.errors)
        limitations.append("LLM not configured — detailed explanation unavailable")
        return {
            "recommendation": RecommendationResult(
                recommended_flight=top,
                explanation=(
                    f"Flight {top.candidate.flight_number} is the highest-rated option "
                    f"(score: {top.score}). Detailed explanation unavailable."
                ),
                limitations=limitations,
                total_flights_evaluated=len(state.ranked_flights),
            )
        }

    top = state.ranked_flights[0]
    alternatives = state.ranked_flights[1:3]

    data_summary = _build_data_summary(state)

    budget_info = ""
    if state.preferences and state.preferences.budget is not None:
        budget_info = f"\nUSER BUDGET: {state.preferences.budget} {state.preferences.budget_currency or ''}"
        if not state.price_data_available:
            budget_info += (
                "\nIMPORTANT: Price/ticket data is NOT available from current flight data sources. "
                "The user's budget requirement CANNOT be verified. "
                "Do NOT state or imply that the recommended flight is within the user's budget. "
                "Instead, note that budget compliance could not be verified due to unavailable pricing data."
            )

    prompt = f"""You are an aviation recommendation assistant. Generate a clear flight recommendation based on actual data.

USER REQUEST:
{state.user_request}{budget_info}

PARSED PREFERENCES (what the system extracted from the request):
{json.dumps({
    "origin": state.preferences.origin if state.preferences else None,
    "destination": state.preferences.destination if state.preferences else None,
    "travel_date": state.preferences.travel_date if state.preferences else None,
    "travel_time": state.preferences.travel_time if state.preferences else None,
    "direct_only": state.preferences.direct_only if state.preferences else False,
    "airline_preference": state.preferences.airline_preference if state.preferences else None,
    "budget": state.preferences.budget if state.preferences else None,
}, indent=2)}
NOTE: If a preference field above is null/false/None, the user did NOT request it.
Do NOT claim the flight matches a preference the user did not specify.

TOP RECOMMENDED FLIGHT:
Flight: {top.candidate.flight_number}
Route: {top.candidate.origin or 'unknown'} → {top.candidate.destination or 'unknown'}
Departure: {top.candidate.departure_time or 'unknown'}
Arrival: {top.candidate.arrival_time or 'unknown'}
Airline: {top.candidate.airline or 'unknown'}
Status: {top.candidate.status or 'unknown'}
Score: {top.score}/1.0

SCORE BREAKDOWN:
{json.dumps(top.score_breakdown, indent=2)}
NOTE: A score of 0.5 for direct_preference or airline_match means no preference was specified (neutral). A score of 1.0 means the preference matched. A score below 0.5 means the preference was specified but not matched.

WEATHER (if available):
{data_summary.get('weather', 'Not available')}

PREDICTIONS:
Delay prediction is not yet available (ML model pending).

UNAVAILABLE DATA:
{json.dumps(state.unavailable_data)}

Generate a recommendation with:
1. The recommended flight and why it was selected
2. Key factors in the recommendation
3. Any important limitations or trade-offs
4. Alternative flights if applicable

Keep it concise, grounded in the actual data above, and do not invent information.
Do NOT mention internal system details like tool names, APIs, or implementation details.
If a budget was specified but price data is unavailable, clearly state that budget compliance could not be verified."""

    try:
        response = await llm.complete(
            [LLMMessage(role="user", content=prompt)],
            temperature=0.3,
            max_tokens=1024,
        )

        limitations = []
        if "delay_predictions_not_implemented" in state.unavailable_data:
            limitations.append("Delay prediction unavailable (ML model pending)")
        for item in state.unavailable_data:
            if item.startswith("weather_"):
                airport = item.replace("weather_", "")
                limitations.append(f"Weather data unavailable for {airport}")
        if (
            state.preferences
            and state.preferences.budget is not None
            and not state.price_data_available
        ):
            limitations.append(
                f"Budget of {state.preferences.budget} {state.preferences.budget_currency or ''} "
                "could not be verified — flight data does not include ticket prices"
            )

        recommendation = RecommendationResult(
            recommended_flight=top,
            alternatives=alternatives,
            explanation=response.content or "Recommendation generated.",
            limitations=limitations,
            total_flights_evaluated=len(state.ranked_flights),
        )

        return {"recommendation": recommendation}

    except Exception as e:
        logger.exception("Failed to generate recommendation")
        limitations = list(state.errors)
        limitations.append(f"Recommendation generation failed: {e}")

        recommendation = RecommendationResult(
            recommended_flight=top,
            alternatives=alternatives,
            explanation=(
                f"Flight {top.candidate.flight_number} is the top-rated option "
                f"with a score of {top.score}. However, a detailed explanation "
                f"could not be generated due to an error."
            ),
            limitations=limitations,
            total_flights_evaluated=len(state.ranked_flights),
        )

        return {"recommendation": recommendation}


def _build_data_summary(state: RecommendationState) -> dict:
    """Build a summary of available data for the LLM prompt."""
    state = coerce_recommendation_state(state)
    summary = {}

    if state.weather_data:
        weather_parts = []
        for iata, w in state.weather_data.items():
            if w.available:
                weather_parts.append(
                    f"{iata}: {w.condition or 'unknown'}, "
                    f"{w.temperature}°C, wind {w.wind_speed} km/h"
                )
            else:
                weather_parts.append(f"{iata}: unavailable")
        summary["weather"] = "\n".join(weather_parts)

    if state.prediction_data:
        pred_parts = []
        for fn, p in state.prediction_data.items():
            if p.available:
                pred_parts.append(f"{fn}: delay probability {p.delay_probability}")
            else:
                pred_parts.append(f"{fn}: prediction unavailable")
        summary["predictions"] = "\n".join(pred_parts)

    return summary
