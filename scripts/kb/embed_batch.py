"""Vectorise the knowledge base: every bank question, saved material, Copilot output, board paper and lesson plan
gets a meaning vector in kb_vectors. Only new or changed items are embedded (text hash); vanished items are removed.

    python scripts/kb/embed_batch.py [--limit N]
"""
from __future__ import annotations

import argparse
import json

from common import connect, grade_of, item_text, log, sha, vec_literal

BATCH = 64


def _questions(content) -> str:
    if not isinstance(content, dict):
        return ""
    items = content.get("items") or content.get("questions") or []
    return " ".join(str((q or {}).get("text") or (q or {}).get("questionText") or "") for q in items[:40] if isinstance(q, dict))


def _artifact_text(reply) -> str:
    if not isinstance(reply, dict):
        return ""
    a = reply.get("artifact") or {}
    parts = [str(a.get("title") or ""), str(a.get("chapter") or "")]
    k = a.get("kind")
    if k == "questions":
        parts += [str(q.get("questionText") or "") for q in (a.get("questions") or [])[:30] if isinstance(q, dict)]
    elif k == "lesson":
        parts += [*(a.get("topics") or []), *(a.get("objectives") or [])]
    elif k == "document":
        parts.append(str(a.get("markdown") or "")[:1500])
    elif k == "paper":
        for sec in ((a.get("paper") or {}).get("sections") or [])[:8]:
            parts += [str(q.get("text") or "") for q in (sec.get("questions") or [])[:6] if isinstance(q, dict)]
    elif k == "bundle":
        parts += [str(p.get("title") or "") for p in (a.get("parts") or []) if isinstance(p, dict)]
    else:
        parts.append(str(reply.get("say") or "")[:600])
    return " ".join(p for p in parts if p).strip()


def gather(cur):
    """(item_type, item_id, school_id, owner_id, grade, subject, chapter_key, kind, text) for everything that should have a vector."""
    out = []
    cur.execute("""SELECT id, school_id, created_by, class, subject, chapter_key, qtype, body, topic
                   FROM bank_items WHERE status <> 'retired' AND dup_of IS NULL""")
    for i, school, owner, cls, subj, ch, qt, body, topic in cur.fetchall():
        text = item_text(body or {})
        if topic:
            text = f"{topic}. {text}"
        # Diagram and map questions: CBSE's text-only version describes the picture, so search finds them by it.
        tv = ((body or {}).get("textVersion") or {}).get("text")
        if tv:
            text = f"{text} [diagram] {tv}"
        out.append(("bank", i, school, owner, grade_of(cls), subj, ch, qt, text))
    cur.execute("SELECT id, school_id, teacher_id, class, subject, chapter_key, chapter_name, kind, title, content FROM studio_materials")
    for i, school, owner, cls, subj, ch, chn, kind, title, content in cur.fetchall():
        out.append(("material", i, school, owner, grade_of(cls), subj, ch, kind, f"{title}. {chn or ''}. {_questions(content)}"))
    cur.execute("SELECT id, school_id, teacher_id, kind, class, subject, chapter, title, artifact_kind, reply FROM copilot_outputs WHERE kind <> 'image'")
    for i, school, owner, kind, cls, subj, ch, title, ak, reply in cur.fetchall():
        out.append(("paper" if kind == "paper" else "copilot", i, school, owner, grade_of(cls), subj, ch, ak, f"{title}. {_artifact_text(reply)}"))
    cur.execute("""SELECT id, school_id, teacher_id, class, subject, chapter_key, chapter_name, title, topics, objectives
                   FROM lesson_plans WHERE status <> 'archived'""")
    for i, school, owner, cls, subj, ch, chn, title, topics, objs in cur.fetchall():
        out.append(("lesson", i, school, owner, grade_of(cls), subj, ch, "lesson", f"{title}. {chn or ''}. {' '.join(topics or [])}. {' '.join(objs or [])}"))
    return [r for r in out if r[8].strip() and r[5]]


def main(limit: int | None = None):
    from _kb_embedder import embed

    with connect() as conn, conn.cursor() as cur:
        rows = gather(cur)
        cur.execute("SELECT item_type, item_id::text, text_hash FROM kb_vectors")
        have = {(t, i): h for t, i, h in cur.fetchall()}
        want = {(r[0], str(r[1])) for r in rows}
        todo = [r for r in rows if have.get((r[0], str(r[1]))) != sha(r[8])]
        if limit:
            todo = todo[:limit]
        for i in range(0, len(todo), BATCH):
            chunk = todo[i:i + BATCH]
            vecs = embed([r[8][:2000] for r in chunk])
            for r, v in zip(chunk, vecs):
                cur.execute("""
                  INSERT INTO kb_vectors (item_type, item_id, school_id, owner_id, grade, subject, chapter_key, kind, text_hash, embedding, updated_at)
                  VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::extensions.vector, now())
                  ON CONFLICT (item_type, item_id) DO UPDATE SET school_id = EXCLUDED.school_id, owner_id = EXCLUDED.owner_id,
                    grade = EXCLUDED.grade, subject = EXCLUDED.subject, chapter_key = EXCLUDED.chapter_key, kind = EXCLUDED.kind,
                    text_hash = EXCLUDED.text_hash, embedding = EXCLUDED.embedding, updated_at = now()""",
                            (r[0], r[1], r[2], r[3], r[4], r[5][:80], (r[6] or None) and r[6][:200], (r[7] or None) and str(r[7])[:40], sha(r[8]), vec_literal(v)))
            conn.commit()
        gone = [k for k in have if k not in want]
        for t, i in gone:
            cur.execute("DELETE FROM kb_vectors WHERE item_type = %s AND item_id = %s", (t, i))
        conn.commit()
        log("embed", items=len(rows), embedded=len(todo), removed=len(gone))
        return len(todo)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    main(ap.parse_args().limit)
