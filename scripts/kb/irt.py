"""Real difficulty and discrimination for bank questions, from how students actually answered them (no AI).

Responses: bank_item_uses (which bank item sat at which question of which assignment) joined to submission_items
(each student's score on that question). A response counts as right when it scored at least half marks.

Model: Rasch (1-parameter IRT) fitted by joint maximum likelihood with a small ridge, giving each item a difficulty
on the logit scale (0 = average; positive = harder); discrimination is the item-rest point-biserial correlation.
Sthara's shared items pool every school's answers (counts only, nobody identifiable); a school's own items learn from
that school only. Items need MIN_N responses before their numbers are written.

    python scripts/kb/irt.py
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np

from common import connect, log

MIN_N = 10


def rasch(resp: dict[tuple[str, str], float], iters: int = 60, ridge: float = 0.05):
    """resp[(student, item)] = 0/1. Returns item difficulty b and student ability theta."""
    students = sorted({s for s, _ in resp})
    items = sorted({i for _, i in resp})
    si = {s: k for k, s in enumerate(students)}
    ii = {i: k for k, i in enumerate(items)}
    S = np.array([si[s] for s, _ in resp])
    I = np.array([ii[i] for _, i in resp])
    Y = np.array(list(resp.values()), dtype=np.float64)
    theta = np.zeros(len(students))
    b = np.zeros(len(items))
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(theta[S] - b[I])))
        w = p * (1 - p)
        g_t = np.bincount(S, Y - p, len(students)) - ridge * theta
        h_t = np.bincount(S, w, len(students)) + ridge
        theta += np.clip(g_t / h_t, -1, 1)
        p = 1 / (1 + np.exp(-(theta[S] - b[I])))
        w = p * (1 - p)
        g_b = -np.bincount(I, Y - p, len(items)) - ridge * b
        h_b = np.bincount(I, w, len(items)) + ridge
        b += np.clip(g_b / h_b, -1, 1)
        b -= b.mean()
    return {i: float(b[ii[i]]) for i in items}, {s: float(theta[si[s]]) for s in students}


def discrimination(resp, by_item):
    total = defaultdict(float)
    for (s, _), y in resp.items():
        total[s] += y
    out = {}
    for item, pairs in by_item.items():
        ys = np.array([y for _, y in pairs])
        rest = np.array([total[s] - y for s, y in pairs])
        out[item] = float(np.corrcoef(ys, rest)[0, 1]) if ys.std() > 0 and rest.std() > 0 else None
    return out


def main():
    with connect() as conn, conn.cursor() as cur:
        cur.execute("""
          SELECT u.item_id::text, b.school_id IS NULL, si.school_id::text, si.student_id::text,
                 CASE WHEN si.max_score > 0 AND si.score / si.max_score >= 0.5 THEN 1 ELSE 0 END
          FROM bank_item_uses u
          JOIN bank_items b ON b.id = u.item_id
          JOIN submission_items si ON si.assignment_id = u.assignment_id AND si.question_index = u.question_index
            AND (u.student_id IS NULL OR u.student_id = si.student_id)
          WHERE si.score IS NOT NULL AND si.max_score IS NOT NULL""")
        rows = cur.fetchall()
        # One pool for Sthara items (all schools), one per school for school items.
        pools = defaultdict(dict)
        for item, shared, school, student, y in rows:
            pools["sthara" if shared else school][(f"{school}:{student}", item)] = float(y)
        written = 0
        for pool, resp in pools.items():
            by_item = defaultdict(list)
            for (s, i), y in resp.items():
                by_item[i].append((s, y))
            if len(by_item) < 2:
                continue
            b, _ = rasch(resp)
            disc = discrimination(resp, by_item)
            for item, pairs in by_item.items():
                if len(pairs) < MIN_N:
                    continue
                cur.execute("UPDATE bank_items SET irt_difficulty = %s, irt_discrimination = %s, irt_n = %s WHERE id = %s",
                            (round(b[item], 3), None if disc[item] is None else round(disc[item], 3), len(pairs), item))
                written += 1
        conn.commit()
        log("irt", responses=len(rows), pools=len(pools), items_written=written)
        return written


if __name__ == "__main__":
    main()
