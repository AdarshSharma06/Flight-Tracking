"""MCP (Model Context Protocol) server for Flight Tracking AI Service.

Exposes existing AI-3 aviation tools through the standardized MCP protocol.
"""

from app.mcp.server import mcp, register_mcp_tools

__all__ = ["mcp", "register_mcp_tools"]
