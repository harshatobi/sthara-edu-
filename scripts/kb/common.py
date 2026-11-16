"""Shared helpers for the knowledge-base jobs (nightly on GitHub Actions, or by hand).

Database: SUPABASE_DB_URL from the environment, else from the app's .env.local (never printed).
Model: api/_kb_embedder.py (the same code the live Vercel function runs); KB_MODEL_DIR=scripts/kb/.model locally.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))


def db_url() -> str:
    url = os.environ.get("SUPABASE_DB_URL", "")
    if not url:
        env = ROOT / ".env.local"
        if env.exists():
            for line in env.read_text().splitlines():
                if line.startswith("SUPABASE_DB_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not url:
        raise SystemExit("SUPABASE_DB_URL is not set")
    return url


def connect():
    import psycopg

    conn = psycopg.connect(db_url(), autocommit=False, prepare_threshold=None)
    # Marks this session as a knowledge-base job: bank_items' touch trigger then leaves updated_at alone, so tags,
    # difficulty and checks never make an uploaded question look edited (and survive an import undo).
    with conn.cursor() as cur:
        cur.execute("SELECT set_config('sthara.kb_job', 'on', false)")
    conn.commit()
    return conn


def grade_of(cls: str | None) -> str:
    """'Class 9-B' -> '9', 'Class 10' -> '10', 'X' -> '10'. Unknown -> 'any'."""
    s = (cls or "").lower()
    roman = {"xii": "12", "xi": "11", "x": "10", "ix": "9", "viii": "8", "vii": "7", "vi": "6"}
    m = re.search(r"\b(1[0-2]|[1-9])\b", s) or re.search(r"(1[0-2]|[1-9])", s)
    if m:
        return m.group(1)
    for r, g in roman.items():
        if re.search(rf"\b{r}\b", s):
            return g
    return "any"


def topic_key(name: str | None) -> str | None:
    """Same as src/lib/teacher/topicKey.ts: the app's chapter key ("Ch 4 · Quadratic Equations" -> "quadratic equations")."""
    if not name:
        return None
    t = re.sub(r"^ch(apter)?\s*\d+\s*[·:.-]?\s*", "", name.lower())
    return re.sub(r"[^a-z0-9]+", " ", t).strip() or None


def norm(text: str) -> str:
    """Same as src/lib/studio/fingerprint.ts normalise(): lower case, letters/digits/spaces in any script."""
    t = unicodedata.normalize("NFKC", text).lower()
    t = "".join(ch if (unicodedata.category(ch)[0] in "LMN" or ch.isspace()) else " " for ch in t)
    return re.sub(r"\s+", " ", t).strip()


def _imul(a: int, b: int) -> int:
    return ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)) & 0xFFFFFFFF


def _hash53(s: str, seed: int) -> str:
    """cyrb53, identical to the TypeScript one (UTF-16 code units), so Python and the app agree on fingerprints."""
    h1 = (0xDEADBEEF ^ seed) & 0xFFFFFFFF
    h2 = (0x41C6CE57 ^ seed) & 0xFFFFFFFF
    units = s.encode("utf-16-le")
    for i in range(0, len(units), 2):
        ch = units[i] | (units[i + 1] << 8)
        h1 = _imul(h1 ^ ch, 2654435761)
        h2 = _imul(h2 ^ ch, 1597334677)
    h1 = _imul(h1 ^ (h1 >> 16), 2246822507) ^ _imul(h2 ^ (h2 >> 13), 3266489909)
    h2 = _imul(h2 ^ (h2 >> 16), 2246822507) ^ _imul(h1 ^ (h1 >> 13), 3266489909)
    h1 &= 0xFFFFFFFF
    h2 &= 0xFFFFFFFF
    return format(4294967296 * (2097151 & h2) + h1, "x").rjust(14, "0")


def fingerprint(text: str, options: list[str] | None = None) -> str:
    base = "|".join([norm(text), *sorted(norm(o) for o in (options or []))])
    return (_hash53(base, 1) + _hash53(base, 2))[:28]


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def item_text(body: dict) -> str:
    """What a bank question means, for vectors: the wording plus its options."""
    opts = body.get("options") or []
    return " ".join([str(body.get("text") or ""), *[str(o) for o in opts if o]]).strip()


def vec_literal(v) -> str:
    return "[" + ",".join(f"{float(x):.6f}" for x in v) + "]"


def log(job: str, **kw):
    print(json.dumps({"job": job, **kw}, ensure_ascii=False))
