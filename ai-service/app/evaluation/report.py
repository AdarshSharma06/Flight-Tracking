"""Report generation for AI-9 evaluation."""

import json
from pathlib import Path
from app.evaluation.models import EvaluationReport, CategoryReport
from app.evaluation.metrics import aggregate_rate


def build_report(results) -> EvaluationReport:
    """Build aggregate report from per-case results."""
    report = EvaluationReport()
    report.results = results
    report.total = len(results)
    report.passed = sum(1 for r in results if r.passed)
    report.failed = report.total - report.passed
    report.pass_rate = report.passed / report.total if report.total else 0.0

    # By category
    categories = set(r.category for r in results)
    for cat in categories:
        cat_results = [r for r in results if r.category == cat]
        total = len(cat_results)
        passed = sum(1 for r in cat_results if r.passed)
        failed = total - passed
        pass_rate = passed / total if total else 0.0

        # Aggregate metrics (mean per metric key)
        all_keys = set()
        for r in cat_results:
            all_keys.update(r.metrics.keys())
        agg_metrics = {}
        for k in all_keys:
            vals = [r.metrics.get(k, 0.0) for r in cat_results if k in r.metrics]
            agg_metrics[k] = round(aggregate_rate(vals), 4)

        report.by_category[cat] = CategoryReport(
            category=cat,
            total=total,
            passed=passed,
            failed=failed,
            pass_rate=round(pass_rate, 4),
            metrics=agg_metrics,
        )

    return report


def format_human_report(report: EvaluationReport) -> str:
    lines = []
    lines.append("=" * 60)
    lines.append(f"AI-9 Evaluation Report — run {report.run_id}")
    lines.append("=" * 60)
    lines.append(f"Total: {report.total}  Passed: {report.passed}  Failed: {report.failed}  Pass rate: {report.pass_rate:.2%}")
    lines.append("")
    for cat, cr in sorted(report.by_category.items()):
        lines.append(f"{cat}")
        lines.append(f"  Cases: {cr.total}  Passed: {cr.passed}  Failed: {cr.failed}  Pass rate: {cr.pass_rate:.2%}")
        for mk, mv in sorted(cr.metrics.items()):
            lines.append(f"  {mk}: {mv:.2f}")
        # List failures
        fails = [r for r in report.results if r.category == cat and not r.passed]
        if fails:
            lines.append(f"  Failures:")
            for f in fails:
                lines.append(f"    - {f.case_id}: {f.failure_reason}")
        lines.append("")
    return "\n".join(lines)


def save_reports(report: EvaluationReport, out_dir: str = "app/evaluation/reports"):
    """Save JSON and human-readable reports."""
    p = Path(out_dir)
    p.mkdir(parents=True, exist_ok=True)
    json_path = p / f"report-{report.run_id}.json"
    txt_path = p / f"report-{report.run_id}.txt"
    json_path.write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")
    txt_path.write_text(format_human_report(report), encoding="utf-8")
    return str(json_path), str(txt_path)
