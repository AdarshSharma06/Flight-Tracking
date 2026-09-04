"""Request/response models for AI-7 ATC explanation endpoint."""

from typing import Optional

from pydantic import BaseModel, Field


class AtcExplanationRequest(BaseModel):
    """Request to explain an existing ATC anomaly."""

    anomalyId: int = Field(..., description="ID of the anomaly to explain")
    flightNumber: Optional[str] = None
    anomalyType: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    detectedAt: Optional[str] = None
    telemetry: Optional["TelemetryData"] = None
    weather: Optional["WeatherData"] = None
    limitations: list[str] = Field(default_factory=list)


class TelemetryData(BaseModel):
    """Linked telemetry data for the anomaly."""

    id: Optional[int] = None
    flightNumber: Optional[str] = None
    originIata: Optional[str] = None
    destinationIata: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None
    speed: Optional[float] = None
    direction: Optional[float] = None
    heading: Optional[float] = None
    flightStatus: Optional[str] = None
    aircraftRegistration: Optional[str] = None
    recordedAt: Optional[str] = None


class WeatherData(BaseModel):
    """Weather conditions at the relevant airport."""

    temperature: Optional[float] = None
    windSpeed: Optional[float] = None
    humidity: Optional[float] = None
    precipitation: Optional[float] = None
    weatherCondition: Optional[str] = None


class AtcExplanationResponse(BaseModel):
    """Structured response from ATC anomaly explanation."""

    explanation: str
    anomalyId: int
    flightNumber: Optional[str] = None
    facts: list[str] = Field(default_factory=list)
    context: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
