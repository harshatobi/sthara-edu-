"""Load question-bank files (src/lib/kb/bank-file.schema.json) into bank_items, rules only, no AI.

Every file is validated against the schema first; one bad item stops that file with the item's number and reason.
A question already in the bank (same fingerprint: wording and options, normalised, same language and owner) is
updated in place; new ones are inserted. Sthara files load as shared Sthara items, unreviewed until a Sthara reviewer
approves them; --school loads a school's own past paper into that school's private bank ('school_upload').

    python scripts/kb/load_bank.py FILE.json [FILE.json ...]            dry run: validate and count
    python scripts/kb/load_bank.py FILE.json --write                    load as Sthara items
    python scripts/kb/load_bank.py FILE.json --write --school <uuid>    load into one school's bank
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from common import ROOT, connect, fingerprint, log

SCHEMA = json.loads((ROOT / "src/lib/kb/bank-file.schema.json").read_text())


def validate(doc: dict) -> list[str]:
    from jsonschema import Draft202012Validator

    errs = []
    for e in sorted(Draft202012Validator(SCHEMA).iter_errors(doc), key=lambda e: list(e.path)):
        where = "/".join(str(p) for p in e.path) or "file"
        errs.append(f"{where}: {e.message}")
    for n, it in enumerate(doc.get("items") or []):
        if isinstance(it, dict) and it.get("options") and isinstance(it.get("answer"), int) and it["answer"] >= len(it["options"]):
            errs.append(f"items/{n}: answer {it['answer']} has no option")
    return errs


def rows(doc: dict, school: str | None):
    src = doc["source"]
    lang = src.get("language", "en")
    for it in doc["items"]:
        body = {k: it[k] for k in ("text", "options", "answer", "value", "unit", "scheme") if k in it}
        body.setdefault("scheme", "")
        if it.get("figures"):
            body["figures"] = it["figures"]
        if "difficulty" in it:
            body["difficulty"] = it["difficulty"]
        yield {
            "scope": "school" if school else "sthara", "school_id": school, "class": src["class"], "subject": src["subject"],
            "chapter_key": it.get("chapter_key") or "untagged", "topic": it.get("topic") or it.get("chapter"),
            "outcome_code": it.get("outcome_code"), "competency": it.get("competency") or "remember_understand",
            "qtype": it["qtype"], "marks": it["marks"], "language": lang, "body": body, "status": "unreviewed",
            "source": "school_upload" if school else src["kind"], "source_ref": it.get("source_ref") or src["title"],
            "fingerprint": fingerprint(it["text"], it.get("options") or []), "session": src.get("session"),
        }


def load(path: Path, write: bool, school: str | None) -> dict:
    doc = json.loads(path.read_text())
    errs = validate(doc)
    if errs:
        return {"file": path.name, "ok": False, "errors": errs[:20]}
    rs = list(rows(doc, school))
    inserted = updated = 0
    if write:
        with connect() as conn, conn.cursor() as cur:
            for r in rs:
                cur.execute("""SELECT id FROM bank_items WHERE coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid)
                               = coalesce(%s::uuid, '00000000-0000-0000-0000-000000000000'::uuid) AND language = %s AND fingerprint = %s""",
                            (r["school_id"], r["language"], r["fingerprint"]))
                hit = cur.fetchone()
                if hit:
                    cur.execute("""UPDATE bank_items SET class=%s, subject=%s, chapter_key=CASE WHEN %s = 'untagged' THEN chapter_key ELSE %s END,
                                   topic=%s, outcome_code=%s, competency=%s, qtype=%s, marks=%s, body=%s::jsonb, source_ref=%s, session=%s, updated_at=now()
                                   WHERE id=%s""", (r["class"], r["subject"], r["chapter_key"], r["chapter_key"], r["topic"], r["outcome_code"],
                                                    r["competency"], r["qtype"], r["marks"], json.dumps(r["body"]), r["source_ref"], r["session"], hit[0]))
                    updated += 1
                else:
                    cur.execute("""INSERT INTO bank_items (scope, school_id, class, subject, chapter_key, topic, outcome_code, competency, qtype, marks,
                                   language, body, status, source, source_ref, fingerprint, session, checks)
                                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,'{}'::jsonb)""",
                                (r["scope"], r["school_id"], r["class"], r["subject"], r["chapter_key"], r["topic"], r["outcome_code"], r["competency"],
                                 r["qtype"], r["marks"], r["language"], json.dumps(r["body"]), r["status"], r["source"], r["source_ref"], r["fingerprint"], r["session"]))
                    inserted += 1
            conn.commit()
    return {"file": path.name, "ok": True, "items": len(rs), "inserted": inserted, "updated": updated, "written": write}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--school")
    a = ap.parse_args()
    bad = 0
    for f in a.files:
        r = load(f, a.write, a.school)
        bad += 0 if r["ok"] else 1
        log("load_bank", **r)
    raise SystemExit(1 if bad else 0)
