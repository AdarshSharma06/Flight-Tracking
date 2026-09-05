"""Regression tests for AI302 departure-delay and terminal/gate grounding bug."""

import json
import pytest
from app.guardrails.service import guardrail_service
from app.guardrails.output import OutputGuardrails
from app.api.chat_service import ChatService
from app.llm.base import LLMMessage


def _flight_tool_payload(dep_delay="45", arr_delay="4",
                         dep_sched="2026-09-01T02:00:00+0000",
                         dep_actual="2026-09-01T02:45:00+0000",
                         arr_sched="2026-09-01T19:05:00+0000",
                         arr_actual="2026-09-01T19:09:00+0000",
                         dep_terminal="3", dep_gate="21", arr_terminal="1", arr_gate="54",
                         status="landed", flight_number="AI302"):
    """Helper to build a realistic FlightDto JSON payload as returned by Spring Boot."""
    return {
        "flightNumber": flight_number,
        "flightIata": flight_number,
        "departureIata": "DEL",
        "arrivalIata": "SYD",
        "departureScheduled": dep_sched,
        "departureActual": dep_actual,
        "departureDelay": dep_delay,
        "departureTerminal": dep_terminal,
        "departureGate": dep_gate,
        "arrivalScheduled": arr_sched,
        "arrivalActual": arr_actual,
        "arrivalDelay": arr_delay,
        "arrivalTerminal": arr_terminal,
        "arrivalGate": arr_gate,
        "status": status,
        "airlineName": "Air India",
    }


class TestDelayGrounding:

    def test_departure_02_00_to_02_45_not_4_minutes(self):
        """Departure 02:00->02:45 must NOT be described as 4 minutes delayed."""
        payload = _flight_tool_payload(dep_delay="45", arr_delay="4")
        # Build grounding as chat_service would
        grounding = {
            "departureDelay": payload["departureDelay"],
            "arrivalDelay": payload["arrivalDelay"],
            "departureTerminal": payload["departureTerminal"],
        }
        # LLM incorrectly says departure 4 min
        text_dep_4 = "Departure:\n- Scheduled: 02:00 UTC\n- Actual: 02:45 UTC — 4 minutes delayed"
        result = guardrail_service.validate_output(text_dep_4, has_tool_data=True, grounding_context=grounding)
        # Should be flagged: departureDelay actual is 45 but claimed 4
        assert any(v.violation_type.value == "unsupported_claim" for v in result.violations), \
            "Departure delay 4 should be flagged when actual is 45"
        # Sanitized should mask the hallucinated delay
        assert "4 minutes" not in result.sanitized_text or "[UNAVAILABLE" in result.sanitized_text

    def test_arrival_19_05_to_19_09_is_4_minutes_ok(self):
        """Arrival 19:05->19:09 correctly described as 4 minutes delayed should PASS."""
        payload = _flight_tool_payload(dep_delay="45", arr_delay="4")
        grounding = {
            "departureDelay": payload["departureDelay"],
            "arrivalDelay": payload["arrivalDelay"],
        }
        text_arr_4 = "Arrival:\n- Scheduled: 19:05 UTC\n- Actual: 19:09 UTC — 4 minutes delayed"
        result = guardrail_service.validate_output(text_arr_4, has_tool_data=True, grounding_context=grounding)
        # arrivalDelay 4 matches actual 4 -> no violation for arrivalDelay field
        # Ensure not flagged as unsupported_claim for arrivalDelay
        # It may have zero violations (or only unrelated)
        departure_violations = [v for v in result.violations if "departureDelay" in v.message]
        assert len(departure_violations) == 0, "Arrival 4 should not trigger departureDelay violation"
        # Arrival 4 is consistent, so overall should not be flagged for arrivalDelay mismatch
        arrival_mismatch = [v for v in result.violations if "arrivalDelay" in v.message and "4" in v.detail]
        assert len(arrival_mismatch) == 0

    def test_departure_delay_45_preserved(self):
        """If departure delay is explicitly 45, grounded response must preserve 45."""
        payload = _flight_tool_payload(dep_delay="45", arr_delay="4")
        grounding = {"departureDelay": payload["departureDelay"], "arrivalDelay": payload["arrivalDelay"]}
        text_dep_45 = "Departure:\n- Scheduled: 02:00 UTC\n- Actual: 02:45 UTC — 45 minutes delayed"
        result = guardrail_service.validate_output(text_dep_45, has_tool_data=True, grounding_context=grounding)
        # Should PASS (no violation for correct departure delay)
        dep_violations = [v for v in result.violations if "departureDelay" in v.message]
        assert len(dep_violations) == 0, f"Correct 45 should not be flagged, got {result.violations}"
        assert result.sanitized_text == text_dep_45

    def test_delay_not_reused_across_events(self):
        """A delay value for arrival must not be reused for departure."""
        # Grounding has departure 45, arrival 4
        grounding = {"departureDelay": "45", "arrivalDelay": "4"}
        # LLM claims both are 4 (copying arrival into departure)
        text_both_4 = "Departure: Scheduled 02:00 UTC, actual 02:45 UTC (4-minute delay)\nArrival: Scheduled 19:05 UTC, actual 19:09 UTC (4-minute delay)"
        result = guardrail_service.validate_output(text_both_4, has_tool_data=True, grounding_context=grounding)
        # Departure 4 should be flagged even though arrival 4 exists elsewhere
        assert any("departureDelay" in v.message for v in result.violations), \
            "Cross-field reuse: departure 4 should be flagged despite arrival 4 existence"
        # Arrival 4 should not be flagged
        # Check arrival specifically not flagged alone? The violation list should contain departure but not necessarily arrival mismatch
        # Ensure at least departure flagged
        assert any("45" in v.detail or "45" in v.message for v in result.violations)

    def test_terminal_gate_absent_not_invented(self):
        """If terminal/gate absent from source data, AI must not invent them."""
        payload = _flight_tool_payload(dep_terminal=None, dep_gate=None, arr_terminal=None, arr_gate=None)
        grounding = {
            "departureTerminal": payload["departureTerminal"],
            "departureGate": payload["departureGate"],
            "arrivalTerminal": payload["arrivalTerminal"],
            "arrivalGate": payload["arrivalGate"],
            "terminal": None,
            "gate": None,
        }
        text_hallucinated = "Scheduled: 02:00 UTC (Terminal 3, Gate 21)\nScheduled: 19:05 UTC (Terminal 1, Gate 54)"
        result = guardrail_service.validate_output(text_hallucinated, has_tool_data=True, grounding_context=grounding)
        # Should flag terminal/gate hallucination
        assert any(v.violation_type.value == "unsupported_claim" for v in result.violations), \
            "Terminal/Gate hallucination should be flagged when source has None"
        # Check specific fields flagged
        types = [v.message for v in result.violations]
        assert any("terminal" in m.lower() or "gate" in m.lower() for m in types)

    def test_terminal_gate_present_may_be_reported(self):
        """If terminal/gate present, AI may report them (no violation)."""
        payload = _flight_tool_payload(dep_terminal="3", dep_gate="21", arr_terminal="1", arr_gate="54")
        grounding = {
            "departureTerminal": payload["departureTerminal"],
            "arrivalTerminal": payload["arrivalTerminal"],
            "departureGate": payload["departureGate"],
            "arrivalGate": payload["arrivalGate"],
            # generic terminal/gate would be considered available (not None) so not flagged
        }
        text_valid = "Scheduled: 02:00 UTC (Terminal 3, Gate 21) is correct from tool data"
        result = guardrail_service.validate_output(text_valid, has_tool_data=True, grounding_context=grounding)
        # No terminal/gate violation expected
        terminal_violations = [v for v in result.violations if "terminal" in v.message.lower() or "gate" in v.message.lower()]
        assert len(terminal_violations) == 0, f"Valid terminal should not be flagged, got {result.violations}"

    def test_chat_grounding_context_builds_flight_fields(self):
        """ChatService._build_chat_grounding_context must extract departureDelay/arrivalDelay separately."""
        svc = ChatService(llm_client=None)
        payload = _flight_tool_payload(dep_delay="45", arr_delay="4", dep_terminal="3", arr_terminal="1")
        tool_msg = LLMMessage(role="tool", content=json.dumps(payload))
        system_msg = LLMMessage(role="system", content="system")
        user_msg = LLMMessage(role="user", content="What is status of AI302?")
        grounding = svc._build_chat_grounding_context([system_msg, user_msg, tool_msg])
        assert grounding.get("departureDelay") == "45"
        assert grounding.get("arrivalDelay") == "4"
        assert grounding.get("departureTerminal") == "3"
        assert grounding.get("arrivalTerminal") == "1"
        assert grounding.get("status") == "landed"
        # Ensure string delays are kept (not dropped)
        assert isinstance(grounding.get("departureDelay"), str)

    def test_existing_ai8_behavior_intact(self):
        """Existing AI-8: price and delay_probability unavailable should still be flagged."""
        grounding = {"price": None, "delay_probability": None, "departureDelay": "45"}
        text_price = "The ticket costs ₹45000 and has 30% delay probability"
        result = guardrail_service.validate_output(text_price, has_tool_data=True, grounding_context=grounding)
        assert any("price" in v.message for v in result.violations)
        assert any("delay_probability" in v.message for v in result.violations)

    def test_ai1_through_ai7_still_work(self):
        """Sanity: guardrail does not break normal flight status report."""
        payload = _flight_tool_payload(dep_delay="45", arr_delay="4")
        grounding = {"departureDelay": payload["departureDelay"], "arrivalDelay": payload["arrivalDelay"],
                     "departureTerminal": payload["departureTerminal"]}
        text_correct = "Flight AI302 (Air India) has landed. Route Delhi (DEL) → Sydney (SYD). Departure 02:00→02:45 — 45 minutes delayed. Arrival 19:05→19:09 — 4 minutes delayed. Terminal 3 Gate 21."
        result = guardrail_service.validate_output(text_correct, has_tool_data=True, grounding_context=grounding)
        # Correct delay values should not trigger departureDelay mismatch
        dep_mismatch = [v for v in result.violations if "departureDelay" in v.message and "claimed" in v.message]
        assert len(dep_mismatch) == 0
