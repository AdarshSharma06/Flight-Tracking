"""Estimated cost calculation — configurable, never fabricated."""

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.config import Settings


def estimate_cost(prompt_tokens: int, completion_tokens: int, settings) -> Optional[float]:
    """Estimate cost in USD from token counts and pricing config.

    Returns None if pricing unavailable or tokens missing.
    Returns 0.0 only when pricing explicitly zero.
    """
    if not settings:
        return None
    # Pricing per 1M tokens
    input_price = getattr(settings, "llm_input_cost_per_1m", None)
    output_price = getattr(settings, "llm_output_cost_per_1m", None)
    if input_price is None or output_price is None:
        return None
    try:
        # Treat None as unavailable
        if prompt_tokens is None and completion_tokens is None:
            return None
        pt = int(prompt_tokens or 0)
        ct = int(completion_tokens or 0)
        if pt == 0 and ct == 0:
            # Zero tokens -> zero cost if pricing known
            return 0.0
        cost = (pt * float(input_price) / 1_000_000) + (ct * float(output_price) / 1_000_000)
        return round(cost, 6)
    except Exception:
        return None
