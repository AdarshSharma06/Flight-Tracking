"""Deterministic scoring and ranking for flight recommendations.

Scoring is purely data-driven. The LLM does not decide which flight is "best".
Missing data is handled gracefully — missing values reduce score, never fabricate data.
"""

import logging
from typing import Optional

from app.agents.state import (
    FlightCandidate,
    PredictionInfo,
    ScoredFlight,
    UserPreferences,
    WeatherInfo,
)

logger = logging.getLogger(__name__)

# Score weights (sum to 1.0)
WEIGHTS = {
    "direct_preference": 0.30,
    "departure_convenience": 0.15,
    "arrival_convenience": 0.15,
    "weather_impact": 0.10,
    "status_health": 0.10,
    "delay_risk": 0.10,
    "airline_match": 0.10,
}


def _score_direct_preference(
    candidate: FlightCandidate, preferences: UserPreferences
) -> float:
    """Score based on whether the flight is direct and user prefers direct.

    Returns:
        1.0 — preference specified and flight matches
        0.5 — no preference specified (neutral, does not favour or penalise)
        0.0 — preference specified but flight does not match
        0.5 — preference specified but flight direct-status unknown
    """
    if not preferences.direct_only:
        return 0.5

    if candidate.is_direct is None:
        return 0.5

    return 1.0 if candidate.is_direct else 0.0


def _score_departure_convenience(
    candidate: FlightCandidate, preferences: UserPreferences
) -> float:
    """Score based on departure time convenience. Returns 0.0-1.0."""
    if not candidate.departure_time:
        return 0.5

    if not preferences.travel_time:
        return 0.7

    try:
        dep_hour = int(candidate.departure_time.split("T")[1].split(":")[0])
        pref_hour = int(preferences.travel_time.split(":")[0])
        diff = abs(dep_hour - pref_hour)
        if diff <= 2:
            return 1.0
        elif diff <= 4:
            return 0.7
        elif diff <= 6:
            return 0.4
        else:
            return 0.2
    except (IndexError, ValueError):
        return 0.5


def _score_arrival_convenience(
    candidate: FlightCandidate, preferences: UserPreferences
) -> float:
    """Score based on arrival time. Returns 0.0-1.0."""
    if not candidate.arrival_time:
        return 0.5

    try:
        arr_hour = int(candidate.arrival_time.split("T")[1].split(":")[0])
        if 6 <= arr_hour <= 22:
            return 1.0
        else:
            return 0.6
    except (IndexError, ValueError):
        return 0.5


def _score_weather_impact(
    weather: Optional[WeatherInfo],
) -> float:
    """Score based on weather conditions. Returns 0.0-1.0."""
    if not weather or not weather.available:
        return 0.5

    condition = (weather.condition or "").lower()

    if any(w in condition for w in ["clear", "sunny", "fair"]):
        return 1.0
    elif any(w in condition for w in ["cloud", "overcast", "partly"]):
        return 0.8
    elif any(w in condition for w in ["rain", "drizzle", "shower"]):
        return 0.5
    elif any(w in condition for w in ["storm", "thunderstorm", "heavy"]):
        return 0.2
    elif any(w in condition for w in ["snow", "fog", "mist"]):
        return 0.3
    else:
        return 0.6


def _score_status_health(candidate: FlightCandidate) -> float:
    """Score based on flight status. Returns 0.0-1.0."""
    status = (candidate.status or "").lower()

    if status in ("active", "en route", "scheduled"):
        return 1.0
    elif status in ("landed", "arrived"):
        return 0.8
    elif status in ("delayed",):
        return 0.4
    elif status in ("cancelled",):
        return 0.0
    else:
        return 0.7


def _score_delay_risk(
    prediction: Optional[PredictionInfo],
) -> float:
    """Score based on delay prediction. Returns 0.0-1.0."""
    if not prediction or not prediction.available:
        return 0.5

    prob = prediction.delay_probability
    if prob is None:
        return 0.5

    return max(0.0, 1.0 - prob)


def _score_airline_match(
    candidate: FlightCandidate, preferences: UserPreferences
) -> float:
    """Score based on airline preference match.

    Returns:
        1.0 — preference specified and airline matches exactly
        0.8 — preference specified and airline partially matches
        0.5 — no airline preference specified (neutral)
        0.5 — preference specified but candidate has no airline data
        0.3 — preference specified but airline does not match
    """
    if not preferences.airline_preference:
        return 0.5

    if not candidate.airline:
        return 0.5

    pref = preferences.airline_preference.upper()
    airline = candidate.airline.upper()

    if pref == airline:
        return 1.0
    elif pref in airline or airline in pref:
        return 0.8
    else:
        return 0.3


def score_flight(
    candidate: FlightCandidate,
    preferences: UserPreferences,
    weather: Optional[WeatherInfo] = None,
    prediction: Optional[PredictionInfo] = None,
) -> ScoredFlight:
    """Compute a deterministic score for a flight candidate.

    Returns a ScoredFlight with score 0.0-1.0 and per-factor breakdown.
    """
    breakdown = {}

    breakdown["direct_preference"] = _score_direct_preference(candidate, preferences)
    breakdown["departure_convenience"] = _score_departure_convenience(
        candidate, preferences
    )
    breakdown["arrival_convenience"] = _score_arrival_convenience(
        candidate, preferences
    )
    breakdown["weather_impact"] = _score_weather_impact(weather)
    breakdown["status_health"] = _score_status_health(candidate)
    breakdown["delay_risk"] = _score_delay_risk(prediction)
    breakdown["airline_match"] = _score_airline_match(candidate, preferences)

    total = sum(
        breakdown[factor] * weight
        for factor, weight in WEIGHTS.items()
        if factor in breakdown
    )

    return ScoredFlight(
        candidate=candidate,
        score=round(total, 4),
        score_breakdown=breakdown,
        weather=weather,
        prediction=prediction,
    )


def rank_flights(scored_flights: list[ScoredFlight]) -> list[ScoredFlight]:
    """Rank scored flights by total score, descending."""
    return sorted(scored_flights, key=lambda sf: sf.score, reverse=True)
