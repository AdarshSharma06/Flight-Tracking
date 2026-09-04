"""Evaluation runner — loads datasets, executes evaluators, produces report."""

import asyncio
import json
import sys
from pathlib import Path
from typing import Optional

from app.evaluation.models import EvaluationCase, Category
from app.evaluation.evaluators.rag import evaluate_rag
from app.evaluation.evaluators.tool import evaluate_tool
from app.evaluation.evaluators.agent import evaluate_agent
from app.evaluation.evaluators.guardrail import evaluate_guardrail
from app.evaluation.report import build_report, format_human_report


DATASET_DIR = Path(__file__).parent / "datasets"

EVALUATORS = {
    Category.RAG.value: evaluate_rag,
    Category.TOOL.value: evaluate_tool,
    Category.AGENT.value: evaluate_agent,
    Category.GUARDRAIL.value: evaluate_guardrail,
}


def load_cases(category: Optional[str] = None) -> list[EvaluationCase]:
    """Load cases from JSON datasets. If category specified, load only that."""
    files = {
        "RAG": DATASET_DIR / "rag.json",
        "TOOL": DATASET_DIR / "tool.json",
        "AGENT": DATASET_DIR / "agent.json",
        "GUARDRAIL": DATASET_DIR / "guardrail.json",
    }
    cases: list[EvaluationCase] = []
    for cat, path in files.items():
        if category and cat != category:
            continue
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for item in data:
            cases.append(EvaluationCase(
                id=item["id"],
                category=item["category"],
                input=item["input"],
                description=item.get("description", ""),
                expected_answer_keywords=item.get("expected_answer_keywords", []),
                expected_topics=item.get("expected_topics", []),
                expected_sources=item.get("expected_sources", []),
                expected_tools=item.get("expected_tools", []),
                expected_should_use_rag=item.get("expected_should_use_rag"),
                expected_guardrail=item.get("expected_guardrail"),
                expected_agent_success=item.get("expected_agent_success"),
                grounding_context=item.get("grounding_context"),
                metadata=item.get("metadata", {}),
                tags=item.get("tags", []),
            ))
    return cases


async def run_evaluation(category: Optional[str] = None, verbose: bool = True):
    cases = load_cases(category)
    if not cases:
        print(f"No cases found for category={category}")
        return None

    results = []
    for case in cases:
        evaluator = EVALUATORS.get(case.category)
        if not evaluator:
            print(f"No evaluator for {case.category} — skipping {case.id}")
            continue
        try:
            result = await evaluator(case)
            results.append(result)
            if verbose:
                status = "PASS" if result.passed else "FAIL"
                print(f"[{status}] {case.id} ({case.category}): {result.failure_reason or 'ok'}")
        except Exception as e:
            from app.evaluation.models import EvaluationResult
            results.append(EvaluationResult(
                case_id=case.id,
                category=case.category,
                input=case.input,
                expected={},
                actual={"error": str(e)},
                passed=False,
                metrics={},
                failure_reason=str(e),
            ))
            if verbose:
                print(f"[FAIL] {case.id}: evaluator error {e}")

    report = build_report(results)
    if verbose:
        print("\n" + format_human_report(report))
    return report


def main():
    import argparse
    parser = argparse.ArgumentParser(description="AI-9 offline evaluation runner")
    parser.add_argument("--category", choices=["RAG", "TOOL", "AGENT", "GUARDRAIL"], help="Run single category")
    parser.add_argument("--json", action="store_true", help="Output JSON report")
    parser.add_argument("--save", action="store_true", help="Save report to app/evaluation/reports/")
    args = parser.parse_args()

    report = asyncio.run(run_evaluation(category=args.category, verbose=not args.json))

    if args.json and report:
        print(json.dumps(report.to_dict(), indent=2))

    if args.save and report:
        from app.evaluation.report import save_reports
        jp, tp = save_reports(report)
        print(f"Saved {jp} and {tp}")

    # Exit code: 0 if all passed, 1 if any failed
    if report and report.failed > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
