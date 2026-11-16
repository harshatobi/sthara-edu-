"""Auto-tag bank questions with chapter and competency, without AI.

A logistic-regression classifier per class level and subject, trained on the meaning vectors of questions whose tags
we trust (Sthara items, approved items, and teacher-reviewed ones), predicts tags for AI-written, teacher-typed and
uploaded questions. Results go to bank_items.auto_tags with their confidence; an uploaded question that arrived with
no chapter ('untagged') takes the predicted chapter when the classifier is at least 80% sure.

    python scripts/kb/tag.py
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict

import numpy as np

from common import connect, log

MODEL = "lr-embed-v1"
MIN_CLASS = 3          # a chapter needs this many trusted examples to be learnt
SURE = 0.8


def parse_vec(s: str) -> np.ndarray:
    return np.array(json.loads(s), dtype=np.float32)


def main():
    from sklearn.linear_model import LogisticRegression

    with connect() as conn, conn.cursor() as cur:
        cur.execute("""
          SELECT b.id, b.class, b.subject, b.chapter_key, b.competency, b.source, b.status, b.auto_tags, v.grade, v.embedding::text
          FROM bank_items b JOIN kb_vectors v ON v.item_type = 'bank' AND v.item_id = b.id
          WHERE b.status <> 'retired' AND b.dup_of IS NULL""")
        rows = cur.fetchall()
        trusted = lambda r: r[5].startswith("cbse") or r[5].startswith("ncert") or r[6] == "approved"  # noqa: E731
        groups = defaultdict(list)
        for r in rows:
            groups[(r[8], r[2].lower())].append(r)
        tagged = 0
        for (grade, subject), rs in groups.items():
            train = [r for r in rs if trusted(r) and r[3] and r[3] != "untagged"]
            target = [r for r in rs if not trusted(r) and (r[7] is None or (r[7] or {}).get("model") != MODEL)]
            if not target or len(train) < 6:
                continue
            X = np.vstack([parse_vec(r[9]) for r in train])
            out = {r[0]: {"model": MODEL} for r in target}
            Xt = np.vstack([parse_vec(r[9]) for r in target])
            for field, idx in (("chapter_key", 3), ("competency", 4)):
                counts = Counter(r[idx] for r in train)
                keep = [i for i, r in enumerate(train) if counts[r[idx]] >= MIN_CLASS]
                labels = sorted({train[i][idx] for i in keep})
                if len(labels) < 2:
                    continue
                clf = LogisticRegression(max_iter=2000, C=4.0)
                clf.fit(X[keep], [train[i][idx] for i in keep])
                proba = clf.predict_proba(Xt)
                for r, p in zip(target, proba):
                    j = int(np.argmax(p))
                    out[r[0]][field] = {"value": clf.classes_[j], "p": round(float(p[j]), 3)}
            for r in target:
                tags = out[r[0]]
                cur.execute("UPDATE bank_items SET auto_tags = %s::jsonb WHERE id = %s", (json.dumps(tags), r[0]))
                ch = tags.get("chapter_key")
                # A school upload whose chapter isn't one the curriculum-tagged bank knows ("Ch 5 Life Processes") is
                # treated as untagged: the classifier's chapter replaces it when it is sure enough.
                known = {t[3] for t in train}
                unsure = r[3] == "untagged" or (r[5] == "school_upload" and r[3] not in known)
                if unsure and ch and ch["p"] >= SURE:
                    cur.execute("UPDATE bank_items SET chapter_key = %s WHERE id = %s", (ch["value"], r[0]))
                tagged += 1
        conn.commit()
        log("tag", groups=len(groups), tagged=tagged)
        return tagged


if __name__ == "__main__":
    main()
