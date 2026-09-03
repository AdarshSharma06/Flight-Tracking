"""MCP server — exposes AI-3 tools via the Model Context Protocol.

Architecture:
  MCP tool call → ToolRegistry.execute() → existing AI-3 Tool → Spring Boot proxy

The MCP server translates MCP tool requests into calls to the existing
ToolRegistry, which delegates to the AI-3 tool implementations.
No tool logic is duplicated.
"""

import logging

from mcp.server.fastmcp import FastMCP

from app.tools.registry import registry

logger = logging.getLogger(__name__)

mcp = FastMCP(
    "Flight Tracking AI Service",
    instructions=(
        "Aviation assistant with access to live flight data, airport information, "
        "and weather conditions. Use tools to retrieve real-time data from the "
        "flight tracking backend."
    ),
)


# ===== MCP Tool Functions =====
# Defined at module level so they can be imported and tested directly.
# Each function delegates to the existing AI-3 ToolRegistry.


@mcp.tool()
async def get_flight_status(flight_number: str) -> str:
    """Get current status and details for a specific flight.

    Returns flight information including departure/arrival airports,
    scheduled and actual times, delays, airline, and aircraft details.
    """
    result = await registry.execute(
        "get_flight_status", {"flight_number": flight_number}
    )
    return result.to_content()


@mcp.tool()
async def get_flight_tracking(flight_number: str) -> str:
    """Get current tracking information for a flight.

    Returns live position data (latitude, longitude, altitude, speed)
    if available. Note: live position data may not always be available.
    """
    result = await registry.execute(
        "get_flight_tracking", {"flight_number": flight_number}
    )
    return result.to_content()


@mcp.tool()
async def get_airport_information(iata: str) -> str:
    """Get information about an airport.

    Returns airport details including name, city, country, coordinates,
    and timezone. Use 3-letter IATA code (e.g., DEL, JFK, BOM).
    """
    result = await registry.execute(
        "get_airport_information", {"iata": iata}
    )
    return result.to_content()


@mcp.tool()
async def get_airport_departures(iata: str, limit: int = 10) -> str:
    """Get flights currently departing from an airport.

    Returns a list of departing flights with their details.
    Use 3-letter IATA code (e.g., DEL, JFK).
    """
    result = await registry.execute(
        "get_airport_departures", {"iata": iata, "limit": limit}
    )
    return result.to_content()


@mcp.tool()
async def get_airport_arrivals(iata: str, limit: int = 10) -> str:
    """Get flights currently arriving at an airport.

    Returns a list of arriving flights with their details.
    Use 3-letter IATA code (e.g., DEL, JFK).
    """
    result = await registry.execute(
        "get_airport_arrivals", {"iata": iata, "limit": limit}
    )
    return result.to_content()


@mcp.tool()
async def get_weather(iata: str) -> str:
    """Get current weather conditions at an airport.

    Returns temperature, humidity, wind speed, and weather condition.
    Use 3-letter IATA code (e.g., DEL, JFK, BOM).
    """
    result = await registry.execute("get_weather", {"iata": iata})
    return result.to_content()


@mcp.tool()
async def search_flights(
    flight_iata: str = "",
    dep_iata: str = "",
    arr_iata: str = "",
    airline_iata: str = "",
    flight_status: str = "",
    limit: int = 10,
) -> str:
    """Search for flights by route, airline, or status.

    Can search by departure/arrival airports, flight number,
    airline, or flight status. At least one of flight_iata,
    dep_iata, or arr_iata must be provided.
    """
    args: dict[str, object] = {}
    if flight_iata:
        args["flight_iata"] = flight_iata
    if dep_iata:
        args["dep_iata"] = dep_iata
    if arr_iata:
        args["arr_iata"] = arr_iata
    if airline_iata:
        args["airline_iata"] = airline_iata
    if flight_status:
        args["flight_status"] = flight_status
    args["limit"] = limit
    result = await registry.execute("search_flights", args)
    return result.to_content()


# ===== Registration =====


def register_mcp_tools() -> None:
    """Ensure MCP tools are registered.

    The tools are registered via @mcp.tool() decorators at module level.
    This function logs the registration status.
    """
    tool_count = len(mcp._tool_manager._tools)
    tool_names = list(mcp._tool_manager._tools.keys())
    logger.info("MCP server has %d tools: %s", tool_count, ", ".join(tool_names))


def get_mcp_sse_app():
    """Get the ASGI app for MCP SSE transport.

    Returns a Starlette application that handles MCP protocol over SSE.
    Mount this on the FastAPI app at /mcp.
    """
    return mcp.sse_app()
