"""Tools package — LLM tool calling infrastructure."""

from app.tools.base import Tool, ToolResult
from app.tools.registry import ToolRegistry, registry
from app.tools.flight_tools import GetFlightStatusTool, GetFlightTrackingTool
from app.tools.airport_tools import (
    GetAirportInformationTool,
    GetAirportDeparturesTool,
    GetAirportArrivalsTool,
)
from app.tools.weather_tools import GetWeatherTool
from app.tools.flight_search import SearchFlightsTool


def register_all_tools() -> None:
    """Register all available tools in the global registry."""
    registry.register(GetFlightStatusTool())
    registry.register(GetFlightTrackingTool())
    registry.register(GetAirportInformationTool())
    registry.register(GetAirportDeparturesTool())
    registry.register(GetAirportArrivalsTool())
    registry.register(GetWeatherTool())
    registry.register(SearchFlightsTool())


__all__ = [
    "Tool",
    "ToolResult",
    "ToolRegistry",
    "registry",
    "register_all_tools",
]
