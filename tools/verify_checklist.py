"""Verify an agent-proposed checklist against ground_truth.json.

Usage:
    python verify_checklist.py young_family agent_checklist.json

agent_checklist.json is a list of free-text items the agent proposed, e.g.
    ["어린이집까지 걸어서 몇 분인지", "월세+관리비 총액", ...]

Matching is keyword-based (deterministic). For fuzzier matching, pass a
`judge` callable (e.g. Muse Spark as LLM-as-a-judge) to verify_checklist().
"""
import json
import sys
from pathlib import Path

GT_PATH = Path(__file__).resolve().parents[1] / "scenarios" / "verify" / "ground_truth.json"


def load_ground_truth(persona: str, path: Path = GT_PATH):
    gt = json.loads(path.read_text(encoding="utf-8"))
    if persona not in gt["personas"]:
        raise KeyError(f"unknown persona: {persona} (have: {list(gt['personas'])})")
    items = gt["common_items"] + gt["personas"][persona]["items"]
    return items, gt["acceptance"]


def _keyword_match(gt_item, agent_item: str) -> bool:
    text = agent_item.lower()
    return any(k.lower() in text for k in gt_item["keywords"])


def verify_checklist(persona: str, agent_items: list[str], judge=None) -> dict:
    """Return {passed, must_coverage, weighted_coverage, missing, feedback}.

    judge(gt_item, agent_items) -> bool  optional fallback for unmatched items.
    """
    items, acc = load_ground_truth(persona)
    w = acc["weights"]
    covered, missing = [], []
    for it in items:
        hit = any(_keyword_match(it, a) for a in agent_items)
        if not hit and judge is not None:
            hit = bool(judge(it, agent_items))
        (covered if hit else missing).append(it)

    must = [i for i in items if i["priority"] == "must"]
    must_cov = sum(i in covered for i in must) / len(must) if must else 1.0
    total_w = sum(w[i["priority"]] for i in items)
    cov_w = sum(w[i["priority"]] for i in covered)
    weighted = cov_w / total_w

    passed = must_cov >= acc["must_coverage"] and weighted >= acc["weighted_coverage_threshold"]
    feedback = [
        f"[{i['priority'].upper()}] {i['id']} {i['label_ko']} 항목이 빠졌어요."
        for i in sorted(missing, key=lambda x: x["priority"] != "must")
    ]
    return {
        "passed": passed,
        "must_coverage": round(must_cov, 2),
        "weighted_coverage": round(weighted, 2),
        "missing": [i["id"] for i in missing],
        "feedback": feedback,  # feed this back to the agent on retry
    }


if __name__ == "__main__":
    persona, path = sys.argv[1], sys.argv[2]
    agent_items = json.loads(Path(path).read_text(encoding="utf-8"))
    print(json.dumps(verify_checklist(persona, agent_items), ensure_ascii=False, indent=2))
