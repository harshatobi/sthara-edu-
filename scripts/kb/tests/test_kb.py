"""Unit tests for the knowledge-base jobs (no database): python -m pytest scripts/kb/tests"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from checks import check  # noqa: E402
from common import fingerprint, grade_of  # noqa: E402
from irt import rasch  # noqa: E402
from load_bank import validate  # noqa: E402


def test_fingerprint_matches_the_app():
    # Same values as src/lib/studio/fingerprint.ts produces (checked with tsx on 2026-11-14).
    assert fingerprint("What is the powerhouse of the cell?", ["Nucleus", "Mitochondria"]) == "19446652c52eb6108c9b370e9680"
    assert fingerprint("कोशिका का ऊर्जा घर क्या है?") == "15b799235123011acca3dba2c173"
    assert fingerprint("What is the powerhouse of the cell?", ["Mitochondria", "Nucleus"]) == fingerprint("what is the POWERHOUSE of the cell", ["nucleus", "mitochondria"])


def test_grade():
    assert [grade_of(c) for c in ["Class 9-B", "Class 10", "X", "Class XII", "Nursery"]] == ["9", "10", "10", "12", "any"]


def test_sympy_checks():
    q = "Find the roots of the quadratic equation 2x^2 - 5x + 3 = 0."
    assert check({"text": q, "options": ["1 and 3/2", "2 and 3"], "answer": 0})["status"] == "pass"
    assert check({"text": q, "options": ["1 and 3/2", "2 and 3"], "answer": 1})["status"] == "fail"
    assert check({"text": "Solve for x: 3x + 7 = 22", "value": 5})["status"] == "pass"
    assert check({"text": "Evaluate 12 × 15 + 6", "value": 186})["status"] == "pass"
    assert check({"text": "A car travels 60 km in 1.5 h. Find its speed.", "value": 40})["status"] == "skip"


def test_rasch_orders_items_by_difficulty():
    resp = {}
    for s in range(40):
        resp[(f"s{s}", "easy")] = 1.0 if s % 10 else 0.0       # 90% right
        resp[(f"s{s}", "mid")] = 1.0 if s % 2 else 0.0         # 50% right
        resp[(f"s{s}", "hard")] = 1.0 if s % 5 == 0 else 0.0   # 20% right
    b, _ = rasch(resp)
    assert b["easy"] < b["mid"] < b["hard"]


def test_schema():
    good = {"version": 1, "source": {"kind": "school_upload", "title": "Half-yearly 2025", "class": "Class 9", "subject": "Science"},
            "items": [{"qtype": "mcq", "marks": 1, "text": "Which organelle makes ATP?", "options": ["Nucleus", "Mitochondria"], "answer": 1}]}
    assert validate(good) == []
    bad = json.loads(json.dumps(good))
    del bad["items"][0]["answer"]
    bad["items"].append({"qtype": "short", "marks": 11, "text": "x"})
    errs = validate(bad)
    assert any("items/0" in e for e in errs) and any("items/1" in e for e in errs)


def test_en_dash_minus_and_parameters_are_skipped_not_failed():
    q = "If (1 – p) is a root of the quadratic equation x^2 + px + 1 – p = 0, then its roots are:"
    assert check({"text": q, "options": ["0, 1", "– 1, 1"], "answer": 0})["status"] == "skip"
