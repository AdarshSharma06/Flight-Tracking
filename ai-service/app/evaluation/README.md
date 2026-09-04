# AI-9 Evaluation Framework

## Why evaluation exists

AI-8 prevents unsafe behavior at runtime. AI-9 measures whether the AI system actually works across four dimensions. It answers “does the AI system work and can we measure it?” without modifying production behavior.

## Supported categories

| Category | What is measured | Primary metrics |
|----------|------------------|-----------------|
| RAG | Knowledge retrieval + routing | correctness, retrieval_quality, retrieval_recall, faithfulness, hallucination |
| TOOL | Tool selection + execution | tool_selection, correctness, execution_success |
| AGENT | LangGraph recommendation workflow | agent_success, correctness, fabrication_ok |
| GUARDRAIL | Input/output safety | guardrail_success, correctness |

## Dataset format

Each dataset is a JSON array in `app/evaluation/datasets/<category>.json`:

```json
{
  "id": "rag-001",
  "category": "RAG",
  "input": "What is a squawk code?",
  "description": "...",
  "expected_answer_keywords": ["squawk", "transponder"],
  "expected_sources": ["squawk_codes.txt"],
  "expected_should_use_rag": true,
  "tags": ["squawk"]
}
```

Fields are optional except `id`, `category`, `input`. Extensible via `metadata` and `grounding_context` (for hallucination checks).

## Metrics

- `correctness` — expected keywords present / total
- `relevance` — lightweight keyword overlap proxy
- `faithfulness` — answer supported by context
- `hallucination` — unsupported claim detection via `grounding_context`
- `retrieval_quality` — has relevant chunk
- `retrieval_recall` — expected sources retrieved / total expected
- `tool_selection` — correct tool selected / expected tool
- `agent_success` — required workflow steps completed / total required
- `guardrail_success` — correctly BLOCKed unsafe + correctly PASSED safe

All metrics are deterministic (no LLM).

## How to run offline evaluation

```bash
# All categories (deterministic, no API calls)
python -m app.evaluation.runner

# Single category
python -m app.evaluation.runner --category RAG
python -m app.evaluation.runner --category GUARDRAIL

# JSON output + save
python -m app.evaluation.runner --json --save

# Via pytest
pytest tests/evaluation -q
pytest -q
```

Offline evaluation is the default. It uses mocked Spring Boot responses, fake LLM for agent, and local knowledge files. No OpenRouter quota, no real AviationStack/Open-Meteo calls.

## How to interpret results

```
RAG
  Cases: 10  Passed: 9  Failed: 1  Pass rate: 0.90
  retrieval_recall: 0.90

GUARDRAILS
  Cases: 14  Passed: 14  Guardrail Success: 1.00
```

`pass_rate = passed / total`. Category metrics are means across cases.

## How to add a new evaluation case

1. Edit `app/evaluation/datasets/<category>.json`
2. Add object with `id` (unique), `category`, `input`, and expectations
3. Run `python -m app.evaluation.runner --category <CAT>` and `pytest tests/evaluation -q`

## Offline vs live evaluation

- **Offline (default):** deterministic, mocked, runs in `pytest` suite. Required for CI.
- **Live (optional):** would call configured `create_llm_client()`; must be explicitly invoked, must handle missing `LLM_API_KEY` gracefully, must not run in normal pytest. Not implemented as mandatory dependency per AI-9 constraints.

## Architectural notes

- Reuses existing `registry`, `should_use_rag`, `guardrail_service`, `compile_recommendation_graph`
- Does not duplicate business logic
- Does not expose secrets or system prompts
- Does not change API contracts or runtime behavior
