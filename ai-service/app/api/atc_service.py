"""ATC explanation service — builds grounded prompts and calls the LLM for anomaly explanations."""

import json
import logging
from typing import Optional

from app.api.atc_models import (
    AtcExplanationRequest,
    AtcExplanationResponse,
    TelemetryData,
    WeatherData,
)
from app.api.atc_prompt import ATC_EXPLANATION_PROMPT
from app.llm.base import LLMClient, LLMMessage

logger = logging.getLogger(__name__)


def _format_data_section(label: str, items: dict[str, Optional[str]]) -> str:
    """Format a section of data for the LLM prompt."""
    lines = [f"{label}:"]
    for key, value in items.items():
        if value is not None and value != "" and value != "null":
            lines.append(f"  {key}: {value}")
        else:
            lines.append(f"  {key}: [UNAVAILABLE]")
    return "\n".join(lines)


def _build_explanation_prompt(request: AtcExplanationRequest) -> str:
    """Build a grounded prompt from the anomaly context data."""
    sections = []

    # Anomaly data (always present)
    sections.append(_format_data_section("ANOMALY RECORD", {
        "Anomaly ID": str(request.anomalyId) if request.anomalyId else None,
        "Flight Number": request.flightNumber,
        "Anomaly Type": request.anomalyType,
        "Severity": request.severity,
        "Description": request.description,
        "Status": request.status,
        "Detected At": request.detectedAt,
    }))

    # Telemetry data (may be null)
    if request.telemetry:
        t = request.telemetry
        sections.append(_format_data_section("TELEMETRY DATA (at time of anomaly)", {
            "Flight Number": t.flightNumber,
            "Origin Airport (IATA)": t.originIata,
            "Destination Airport (IATA)": t.destinationIata,
            "Latitude": str(t.latitude) if t.latitude is not None else None,
            "Longitude": str(t.longitude) if t.longitude is not None else None,
            "Altitude": str(t.altitude) if t.altitude is not None else None,
            "Speed": str(t.speed) if t.speed is not None else None,
            "Direction": str(t.direction) if t.direction is not None else None,
            "Heading": str(t.heading) if t.heading is not None else None,
            "Flight Status": t.flightStatus,
            "Aircraft Registration": t.aircraftRegistration,
            "Recorded At": t.recordedAt,
        }))
    else:
        sections.append("TELEMETRY DATA: [UNAVAILABLE — no telemetry record is linked to this anomaly]")

    # Weather data (may be null)
    if request.weather:
        w = request.weather
        sections.append(_format_data_section("WEATHER CONDITIONS (at origin airport)", {
            "Temperature": f"{w.temperature}°C" if w.temperature is not None else None,
            "Wind Speed": f"{w.windSpeed} km/h" if w.windSpeed is not None else None,
            "Humidity": f"{w.humidity}%" if w.humidity is not None else None,
            "Precipitation": f"{w.precipitation} mm" if w.precipitation is not None else None,
            "Condition": w.weatherCondition,
        }))
    else:
        sections.append("WEATHER CONDITIONS: [UNAVAILABLE]")

    # Pre-existing limitations from Spring Boot
    if request.limitations:
        sections.append("KNOWN DATA LIMITATIONS (from application):\n" +
                        "\n".join(f"  - {lim}" for lim in request.limitations))

    data_block = "\n\n".join(sections)

    return f"""{ATC_EXPLANATION_PROMPT}

---

APPLICATION DATA:

{data_block}

---

Based on the above data, provide your explanation. Structure your response as JSON with these fields:
- "explanation": Your detailed natural-language explanation (the main content)
- "facts": A list of specific measured values or data points from the supplied data that are directly relevant
- "context": A list of contextual observations (interpretations grounded in the data)
- "limitations": A list of information gaps or limitations you identified

Return ONLY the JSON object, no markdown fences."""


async def explain_anomaly(
    request: AtcExplanationRequest,
    llm_client: Optional[LLMClient],
) -> AtcExplanationResponse:
    """Explain an existing anomaly using the LLM with grounded data.

    The anomaly has already been detected by the application.
    This function provides a human-readable explanation grounded in the actual data.
    """
    if not llm_client or not llm_client.is_configured():
        return AtcExplanationResponse(
            explanation="AI explanation is currently unavailable. The anomaly data is still available in the dashboard.",
            anomalyId=request.anomalyId,
            flightNumber=request.flightNumber,
            facts=[],
            context=[],
            limitations=["AI explanation is temporarily unavailable."],
        )

    prompt = _build_explanation_prompt(request)

    try:
        response = await llm_client.complete(
            messages=[
                LLMMessage(role="system", content="You are an ATC anomaly explanation assistant. Respond ONLY with valid JSON."),
                LLMMessage(role="user", content=prompt),
            ],
            temperature=0.3,
            max_tokens=2048,
        )

        raw = response.content or ""
        parsed = _extract_json(raw)

        return AtcExplanationResponse(
            explanation=parsed.get("explanation", raw),
            anomalyId=request.anomalyId,
            flightNumber=request.flightNumber,
            facts=parsed.get("facts", []),
            context=parsed.get("context", []),
            limitations=parsed.get("limitations", []) + (request.limitations or []),
        )

    except Exception as e:
        logger.exception("LLM call failed for ATC explanation of anomaly %s", request.anomalyId)
        return AtcExplanationResponse(
            explanation="AI explanation is currently unavailable. The anomaly data is still available in the dashboard.",
            anomalyId=request.anomalyId,
            flightNumber=request.flightNumber,
            facts=[],
            context=[],
            limitations=["AI explanation is temporarily unavailable."] + (request.limitations or []),
        )


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown fences."""
    text = text.strip()

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from markdown code fence
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            try:
                return json.loads(part)
            except json.JSONDecodeError:
                continue

    # Try finding JSON object in text
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    return {"explanation": text}
