"""Answer checks without AI: where a question is plain mathematics, compute the answer with sympy and compare it with
the stated one (an option or a value). Only what can be read with confidence is checked; everything else is 'skip'.

Handled: "solve / find the roots / find x" with one equation in one unknown; "evaluate / simplify / find the value of"
an arithmetic expression. The result goes to bank_items.checks.sympy = {status: pass|fail|skip, detail, version};
a fail is a flag for review (never deleted).

    python scripts/kb/checks.py [--all]
"""
from __future__ import annotations

import argparse
import json
import re

from common import connect, log

VERSION = 2
NUM = re.compile(r"^\s*[-+]?\d+(\.\d+)?(\s*/\s*\d+)?\s*$")


def _expr(s: str):
    from sympy.parsing.sympy_parser import convert_xor, implicit_multiplication_application, parse_expr, standard_transformations

    s = s.replace("−", "-").replace("–", "-").replace("×", "*").replace("÷", "/").replace("²", "^2").replace("³", "^3").replace("√", "sqrt")
    return parse_expr(s, transformations=standard_transformations + (implicit_multiplication_application, convert_xor), evaluate=True)


def _numbers(text: str) -> list[float]:
    """Numbers stated in an answer: '3/2 and 1', 'x = 1, 1.5', '−2'."""
    from sympy import Rational

    out = []
    for m in re.finditer(r"[-+−]?\d+(?:\.\d+)?(?:\s*/\s*\d+)?", text):
        t = m.group(0).replace("−", "-").replace(" ", "")
        try:
            out.append(float(Rational(t)) if "/" in t else float(t))
        except Exception:  # noqa: BLE001
            pass
    return out


def check(body: dict) -> dict:
    text = str(body.get("text") or "")
    stated = None
    if body.get("value") is not None:
        stated = [float(body["value"])]
    elif isinstance(body.get("answer"), int) and body.get("options"):
        opts = body["options"]
        if 0 <= body["answer"] < len(opts):
            stated = _numbers(str(opts[body["answer"]]))
    if not stated:
        return {"status": "skip", "detail": "no numeric answer stated"}
    low = text.lower()
    try:
        from sympy import Eq, N, S, Symbol, solve

        # Maths spans only: numbers, operators and single-letter unknowns (a word like "equation" ends the span).
        tok = r"(?:\d+(?:\.\d+)?|(?<![A-Za-z])[a-z](?![A-Za-z])|[\s+\-−–*/^().²³√×÷])+"
        eq = re.search(rf"({tok})=({tok})", text)
        if eq and re.search(r"\b(solve|roots?|find (the value of )?[a-z]\b|zeroes|zeros)\b", low):
            if eq.group(1).strip()[:1] in "+-−–*/^" or re.search(r"[A-Za-z]{2,}", eq.group(1) + eq.group(2)):
                return {"status": "skip", "detail": "equation not read whole"}
            lhs, rhs = _expr(eq.group(1)), _expr(eq.group(2))
            syms = sorted((lhs - rhs).free_symbols, key=str)
            if len(syms) != 1:
                return {"status": "skip", "detail": "not one unknown"}
            sols = [complex(N(x)) for x in solve(Eq(lhs, rhs), syms[0])]
            real = sorted(round(z.real, 4) for z in sols if abs(z.imag) < 1e-9)
            if not real:
                return {"status": "skip", "detail": "no real roots"}
            ok = all(any(abs(v - r) < 1e-3 for r in real) for v in stated)
            return {"status": "pass" if ok else "fail", "detail": f"sympy roots {real}, stated {stated}"}
        ev = re.search(r"\b(evaluate|simplify|find the value of|value of)\b[:\s]*([0-9\s+\-−*/^().²³√×÷]{3,})", low)
        if ev and len(stated) == 1:
            v = float(N(_expr(ev.group(2).strip().rstrip("."))))
            ok = abs(v - stated[0]) < 1e-3 * max(1, abs(v))
            return {"status": "pass" if ok else "fail", "detail": f"sympy {round(v, 4)}, stated {stated[0]}"}
        _ = S  # keep import used
    except Exception as e:  # noqa: BLE001 - unreadable maths is a skip, not a failure
        return {"status": "skip", "detail": f"not readable ({type(e).__name__})"}
    return {"status": "skip", "detail": "not a form sympy checks"}


def main(redo: bool = False):
    with connect() as conn, conn.cursor() as cur:
        cur.execute("""SELECT id, body, checks FROM bank_items WHERE status <> 'retired' AND dup_of IS NULL
                       AND (lower(subject) LIKE '%%math%%' OR lower(subject) LIKE '%%physic%%' OR qtype = 'numerical')""")
        counts = {"pass": 0, "fail": 0, "skip": 0}
        for i, body, checks in cur.fetchall():
            if not redo and ((checks or {}).get("sympy") or {}).get("version") == VERSION:
                continue
            r = {**check(body or {}), "version": VERSION}
            counts[r["status"]] += 1
            cur.execute("UPDATE bank_items SET checks = coalesce(checks, '{}'::jsonb) || jsonb_build_object('sympy', %s::jsonb) WHERE id = %s", (json.dumps(r), i))
        conn.commit()
        log("checks", **counts)
        return counts


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    main(ap.parse_args().all)
