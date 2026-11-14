"""Find near-identical bank questions (same meaning, any wording or language) and mark the later copy dup_of the
earlier one, so picks never repeat and the bank doesn't fill with copies.

Canonical copy, in order: official (CBSE/NCERT) over Sthara over school; approved over unreviewed; older over newer.
A Sthara item is never marked a duplicate of a school's item, and one school's item never of another school's.

    python scripts/kb/dedup.py [--threshold 0.95]
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict

import numpy as np

from common import connect, log


def rank(r):
    _, school, source, status, created, *_ = r
    return (0 if source.startswith(("cbse", "ncert")) else 1 if school is None else 2, 0 if status == "approved" else 1, created)


def main(threshold: float = 0.95):
    with connect() as conn, conn.cursor() as cur:
        cur.execute("""
          SELECT b.id, b.school_id, b.source, b.status, b.created_at, b.qtype, b.language, v.grade, lower(b.subject), v.embedding::text
          FROM bank_items b JOIN kb_vectors v ON v.item_type = 'bank' AND v.item_id = b.id
          WHERE b.status <> 'retired' AND b.dup_of IS NULL""")
        rows = cur.fetchall()
        groups = defaultdict(list)
        for r in rows:
            groups[(r[7], r[8], r[5])].append(r)
        marked = 0
        for rs in groups.values():
            if len(rs) < 2:
                continue
            rs.sort(key=rank)
            V = np.vstack([np.array(json.loads(r[9]), dtype=np.float32) for r in rs])
            S = V @ V.T
            dead = set()
            for i in range(len(rs)):
                if i in dead:
                    continue
                for j in range(i + 1, len(rs)):
                    if j in dead or S[i, j] < threshold:
                        continue
                    a, b = rs[i], rs[j]
                    # Visibility: b may point at a only when every viewer of b can also see a.
                    if b[1] is None and a[1] is not None:
                        continue
                    if a[1] is not None and b[1] is not None and a[1] != b[1]:
                        continue
                    cur.execute("UPDATE bank_items SET dup_of = %s WHERE id = %s AND dup_of IS NULL", (a[0], b[0]))
                    dead.add(j)
                    marked += 1
        if marked:
            cur.execute("DELETE FROM kb_vectors v USING bank_items b WHERE v.item_type = 'bank' AND v.item_id = b.id AND b.dup_of IS NOT NULL")
        conn.commit()
        log("dedup", items=len(rows), marked=marked, threshold=threshold)
        return marked


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold", type=float, default=0.95)
    main(ap.parse_args().threshold)
