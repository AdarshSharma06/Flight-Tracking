"""Guardrail policies — pattern definitions for input/output checks."""

import re
from typing import Optional

# ── Input size limits ──────────────────────────────────────────────

MAX_INPUT_LENGTH = 4000
MAX_TOOL_RESULT_LENGTH = 10000

# ── Prompt injection patterns ──────────────────────────────────────
# These are case-insensitive regex patterns that detect attempts to
# override system instructions, inject new instructions, or manipulate
# the model's behavior.

PROMPT_INJECTION_PATTERNS: list[re.Pattern] = [
    # Direct override attempts
    re.compile(r"ignore\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|rules?|guidelines?|prompts?|directives?|policies?)", re.IGNORECASE),
    re.compile(r"disregard\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|rules?|guidelines?|prompts?|directives?)", re.IGNORECASE),
    re.compile(r"forget\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|rules?|guidelines?|prompts?)", re.IGNORECASE),
    re.compile(r"override\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|rules?|guidelines?)", re.IGNORECASE),

    # Role/identity hijacking
    re.compile(r"you\s+are\s+now\s+(a|an|the)\s+", re.IGNORECASE),
    re.compile(r"from\s+now\s+on,?\s+you\s+(are|will|must|should)\s+", re.IGNORECASE),
    re.compile(r"new\s+(role|identity|persona|instructions?)\s*:", re.IGNORECASE),
    re.compile(r"act\s+as\s+(if|though)\s+(you|there)\s+", re.IGNORECASE),

    # Instruction injection via delimiters
    re.compile(r"\[SYSTEM\]\s*", re.IGNORECASE),
    re.compile(r"\[ADMIN\]\s*", re.IGNORECASE),
    re.compile(r"<system>\s*", re.IGNORECASE),
    re.compile(r"<instructions?>\s*", re.IGNORECASE),
    re.compile(r"---\s*END\s+(OF\s+)?(SYSTEM\s+)?PROMPT\s*---", re.IGNORECASE),
    re.compile(r"---\s*BEGIN\s+(NEW\s+)?(SYSTEM\s+)?PROMPT\s*---", re.IGNORECASE),

    # Priority escalation
    re.compile(r"(treat|consider)\s+(my|this)\s+(instructions?|message|request)\s+(as|to\s+be)\s+(higher|more\s+important|priority|overriding)", re.IGNORECASE),
    re.compile(r"your\s+(new|real|actual)\s+(instructions?|system\s+prompt|rules?)", re.IGNORECASE),

    # DAN-style jailbreaks
    re.compile(r"(do\s+anything\s+now|DAN\s+mode|jailbreak)", re.IGNORECASE),

    # Prompt leaking disguised as instructions
    re.compile(r"repeat\s+(everything|all|the)\s+(above|before|from|starting|in\s+this)", re.IGNORECASE),
    re.compile(r"(output|print|show|display|reveal)\s+(your|the)\s+(system\s+prompt|instructions?|rules?|guidelines?|configuration)", re.IGNORECASE),
]


# ── System prompt extraction patterns ──────────────────────────────

SYSTEM_PROMPT_EXTRACTION_PATTERNS: list[re.Pattern] = [
    re.compile(r"(show|print|display|reveal|output|tell\s+me|what\s+are|share)\s+(me\s+)?(your|the)\s+(system\s+prompt|hidden\s+instructions?|internal\s+instructions?|secret\s+instructions?|original\s+instructions?)", re.IGNORECASE),
    re.compile(r"what\s+(are|is)\s+(your|the)\s+(system\s+prompt|rules?|guidelines?|policies?|guardrails?|constraints?|restrictions?)", re.IGNORECASE),
    re.compile(r"(copy|paste|repeat)\s+(your|the)\s+(system\s+prompt|instructions?|rules?)", re.IGNORECASE),
    re.compile(r"who\s+(made|created|built|programmed)\s+you", re.IGNORECASE),
    re.compile(r"what\s+(model|version|API)\s+(are\s+you|do\s+you\s+use)", re.IGNORECASE),
    re.compile(r"(reveal|expose|leak)\s+(the\s+)?(secret|API|key|token|password|credential)", re.IGNORECASE),
]


# ── Malicious instruction patterns ─────────────────────────────────

MALICIOUS_INSTRUCTION_PATTERNS: list[re.Pattern] = [
    # Fabrication instructions
    re.compile(r"(make\s+up|invent|fabricate|fake|forge)\s+(data|information|results?|values?|flights?|weather|prices?)", re.IGNORECASE),
    re.compile(r"(pretend|act\s+as\s+if)\s+(there\s+is|you\s+have|the\s+flight|the\s+weather)", re.IGNORECASE),

    # Safety bypass
    re.compile(r"(bypass|circumvent|disable|turn\s+off)\s+(all\s+)?(safety|security|guardrails?|filters?|restrictions?)", re.IGNORECASE),

    # Tool abuse
    re.compile(r"(call|execute|run|use)\s+(any|all|every|arbitrary)\s+(tool|function|API|endpoint)", re.IGNORECASE),
    re.compile(r"(access|connect\s+to|query)\s+(the\s+)?(database|DB|directly|raw)", re.IGNORECASE),
    re.compile(r"(send|make)\s+(HTTP|API|web)\s+(requests?|calls?)\s+(to\s+any|directly)", re.IGNORECASE),

    # Data exfiltration
    re.compile(r"(exfiltrate|steal|copy|send)\s+(all\s+)?(data|secrets?|credentials?|keys?|tokens?|API\s+keys?)", re.IGNORECASE),
]


# ── Secret patterns ────────────────────────────────────────────────

SECRET_PATTERNS: list[re.Pattern] = [
    # OpenRouter / OpenAI-style API keys
    re.compile(r"sk-or-v1-[a-zA-Z0-9]{20,}", re.IGNORECASE),
    re.compile(r"sk-[a-zA-Z0-9]{20,}", re.IGNORECASE),

    # Generic API key patterns
    re.compile(r"(api[_-]?key|apikey)\s*[=:]\s*['\"][^'\"]{10,}['\"]", re.IGNORECASE),

    # Database credentials
    re.compile(r"(password|passwd|pwd)\s*[=:]\s*['\"][^'\"]{5,}['\"]", re.IGNORECASE),

    # JWT tokens (long base64 strings)
    re.compile(r"eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}"),

    # Connection strings
    re.compile(r"(postgresql|mysql|mongodb)://[^\s]{15,}", re.IGNORECASE),

    # Bearer tokens
    re.compile(r"Bearer\s+[a-zA-Z0-9._-]{20,}"),
]


# ── Internal detail patterns ───────────────────────────────────────
# Patterns that should not appear in user-facing responses.

INTERNAL_DETAIL_PATTERNS: list[re.Pattern] = [
    # Exception class names
    re.compile(r"\b(RuntimeError|ConnectionError|TimeoutError|ValueError|TypeError|OSError|Exception|FileNotFoundError|ImportError|AttributeError)\b"),

    # Stack traces
    re.compile(r"(Traceback|stack\s?trace|File\s+[\"'])", re.IGNORECASE),

    # Internal hostnames/IPs
    re.compile(r"(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)", re.IGNORECASE),

    # Internal URLs
    re.compile(r"(jdbc:|redis://|amqp://|mongodb://)", re.IGNORECASE),

    # File paths
    re.compile(r"(C:\\|/home/|/usr/|/var/|/etc/|/opt/|/tmp/)[^\s]{5,}", re.IGNORECASE),

    # Python/Java internals
    re.compile(r"(app\.config|app\.main|app\.guardrails|app\.llm\.|app\.tools\.|app\.api\.)", re.IGNORECASE),
]


# ── Fabrication detection patterns ─────────────────────────────────
# Patterns in LLM output that suggest fabricated live data.
# NOTE: These patterns are used inside the grounding check. They must be
# compared against structured grounding_context (actual tool/DB data) —
# they are NOT standalone block rules.

FABRICATED_DATA_PATTERNS: list[re.Pattern] = [
    # Specific fabricated positions
    re.compile(r"(is\s+currently\s+(over|at|near|above|below|heading|flying)\s+[A-Z][a-z]+\s+[A-Z][a-z]+)", re.IGNORECASE),
    re.compile(r"(currently\s+over|positioned\s+at|flying\s+over)\s+[A-Z][a-z]+", re.IGNORECASE),
]

# ── Grounding claim patterns ─────────────────────────────────────────
# Field-specific patterns that detect a claimed measurement for a data field.
# Each entry maps a grounding field to patterns that indicate the LLM is
# asserting a specific value for that field.

GROUNDING_CLAIM_PATTERNS: dict[str, list[re.Pattern]] = {
    # Live position — any claim about current position/location
    "live": [
        re.compile(r"is\s+currently\s+(over|at|near|above|below|heading|flying)\s+[A-Z]", re.IGNORECASE),
        re.compile(r"currently\s+(over|at|positioned\s+at|flying\s+over)\s+[A-Z]", re.IGNORECASE),
        re.compile(r"live\s+position", re.IGNORECASE),
        re.compile(r"\blatitude\b.*\d+\.?\d*", re.IGNORECASE),
        re.compile(r"\blongitude\b.*\d+\.?\d*", re.IGNORECASE),
    ],
    # Altitude
    "altitude": [
        re.compile(r"altitude\s*(is|:)?\s*\d[\d,]*\s*(feet|ft|m\b)", re.IGNORECASE),
        re.compile(r"flying\s+at\s+\d[\d,]*\s*(feet|ft)", re.IGNORECASE),
        re.compile(r"\d[\d,]*\s*feet.*altitude", re.IGNORECASE),
        re.compile(r"at\s+\d[\d,]*\s*feet\b", re.IGNORECASE),
    ],
    # Speed
    "speed": [
        re.compile(r"speed\s*(is|:)?\s*\d[\d,]*\s*(km/?h|knots?|mph)", re.IGNORECASE),
        re.compile(r"travelling\s+at\s+\d[\d,]*\s*(km/?h|knots?)", re.IGNORECASE),
    ],
    # Heading / direction
    "heading": [
        re.compile(r"heading\s*(is|:)?\s*\d[\d,]*\s*(degrees?|°)", re.IGNORECASE),
        re.compile(r"direction\s*(is|:)?\s*\d[\d,]*\s*(degrees?|°)", re.IGNORECASE),
    ],
    # Wind speed
    "windSpeed": [
        re.compile(r"wind\s*speed\s*(is|:)?\s*\d", re.IGNORECASE),
        re.compile(r"strong\s+winds?", re.IGNORECASE),
        re.compile(r"experiencing\s+strong\s+wind", re.IGNORECASE),
        re.compile(r"wind.*\b\d[\d,]*\s*(km/?h|knots?|mph)", re.IGNORECASE),
    ],
    # Temperature
    "temperature": [
        re.compile(r"temperature\s*(is|:)?\s*\d", re.IGNORECASE),
        re.compile(r"\d+\s*°C", re.IGNORECASE),
    ],
    # Price
    "price": [
        re.compile(r"₹\s*\d[\d,]*", re.IGNORECASE),
        re.compile(r"Rs\.?\s*\d[\d,]*", re.IGNORECASE),
        re.compile(r"costs?\s+₹", re.IGNORECASE),
        re.compile(r"price\s*(is|:)?\s*[₹$]", re.IGNORECASE),
        re.compile(r"ticket.*[₹$]\s*\d", re.IGNORECASE),
        re.compile(r"\$\s*\d[\d,]*.*(?:flight|ticket|price|cost)", re.IGNORECASE),
    ],
    # Delay prediction
    "delay_probability": [
        re.compile(r"\d+\s*%\s*(delay|chance|probability)", re.IGNORECASE),
        re.compile(r"delay\s*(probability|chance)?\s*(is|:)?\s*\d+\s*%", re.IGNORECASE),
        re.compile(r"\b\d+\s*%\s*delay", re.IGNORECASE),
    ],
}
