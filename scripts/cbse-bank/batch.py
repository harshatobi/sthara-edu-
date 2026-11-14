"""Run the rules-only CBSE pipeline over many sample papers, no AI (decisions of 2026-11-14/15).

For each paper in the catalogue: download the sample paper (SQP) and marking scheme (MS) from cbseacademic.nic.in,
segment both (figures cropped from CBSE's own PDF), parse them against the app's curriculum, and check the paper:
its questions' marks must add up to the "Maximum Marks" printed on it. Only papers that add up are written to
work/manifest.json with ok=true; load.ts loads exactly those (figures to the bank-figures bucket).

    python batch.py --session 2026-27 --grades 10 12           board classes, core subjects
    python batch.py --session 2025-26 --grades 10 12 --only Physics Chemistry
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORK = HERE / "work"
CUR = HERE.parents[1] / "src/lib/curriculum/cbse-2026-27"
PY = str(WORK / "venv/bin/python")
SITE = "https://cbseacademic.nic.in"
ROMAN = {9: "IX", 10: "X", 11: "XI", 12: "XII"}

# CBSE's file name for a subject -> the app's curriculum file and how the subject is named on the paper.
CORE = {
    10: {"Science": ("10-science", "Science"), "MathsStandard": ("10-mathematics", "Mathematics (Standard)"),
         "MathsBasic": ("10-mathematics", "Mathematics (Basic)"), "SocialScience": ("10-social-science", "Social Science"),
         "EnglishL": ("10-english-language-and-literature", "English Language and Literature"),
         "ComputerApplication": ("10-computer-applications", "Computer Applications"), "HomeScience": ("10-home-science", "Home Science")},
    12: {"Physics": ("12-physics", "Physics"), "Chemistry": ("12-chemistry", "Chemistry"), "Biology": ("12-biology", "Biology"),
         "Maths": ("12-mathematics", "Mathematics"), "Applied-Maths": ("12-applied-mathematics", "Applied Mathematics"),
         "Accountancy": ("12-accountancy", "Accountancy"), "BusinessStudies": ("12-business-studies", "Business Studies"),
         "Economics": ("12-economics", "Economics"), "ComputerScience": ("12-computer-science", "Computer Science"),
         "InformaticsPractices": ("12-informatics-practices", "Informatics Practices"), "EnglishCore": ("12-english-core", "English Core"),
         "History": ("12-history", "History"), "Geography": ("12-geography", "Geography"), "PolSci": ("12-political-science", "Political Science"),
         "Psychology": ("12-psychology", "Psychology"), "Sociology": ("12-sociology", "Sociology")},
}


def curl(url: str, out: Path) -> bool:
    if out.exists() and out.stat().st_size > 1000:
        return True
    out.parent.mkdir(parents=True, exist_ok=True)
    # Python's TLS to cbseacademic.nic.in fails; curl works (noted 2026-11-11).
    r = subprocess.run(["curl", "-sSLf", "-A", "Mozilla/5.0", "-o", str(out), url], capture_output=True, text=True)
    return r.returncode == 0 and out.exists() and out.stat().st_size > 1000


def links(grade: int, session: str) -> dict[str, str]:
    page = WORK / "pages" / f"SQP_CLASS{ROMAN[grade]}_{session}.html"
    if not curl(f"{SITE}/SQP_CLASS{ROMAN[grade]}_{session}.html", page):
        return {}
    html = page.read_text(errors="ignore")
    return {m.group(2): f"{SITE}/{m.group(1)}" for m in re.finditer(r'href="((?:[^"]*/)?([A-Za-z_-]+)-(?:SQP|MS)\.pdf)"', html, re.I)} | \
        {f"{m.group(2)}-MS": f"{SITE}/{m.group(1)}" for m in re.finditer(r'href="((?:[^"]*/)?([A-Za-z_-]+)-MS\.pdf)"', html, re.I)} | \
        {f"{m.group(2)}-SQP": f"{SITE}/{m.group(1)}" for m in re.finditer(r'href="((?:[^"]*/)?([A-Za-z_-]+)-SQP\.pdf)"', html, re.I)}


def max_marks(pdf: Path) -> int | None:
    r = subprocess.run([PY, "-c", "import pymupdf,sys,re;d=pymupdf.open(sys.argv[1]);t=' '.join(d[i].get_text() for i in range(min(3,len(d))));"
                        "m=re.search(r'Max(?:imum|\\.)?\\s*Marks\\s*[:\\-]?\\s*(\\d{2,3})',t,re.I);print(m.group(1) if m else '')", str(pdf)],
                       capture_output=True, text=True)
    v = r.stdout.strip()
    return int(v) if v.isdigit() else None


def total(items: list[dict]) -> tuple[int, int]:
    seen: dict[str, int] = {}
    for it in items:
        n = re.match(r"\d+", str(it["q"])).group(0)
        seen.setdefault(n, it.get("marks") or 0)
    return sum(seen.values()), len(seen)


def run(grade: int, session: str, slug: str, cur_file: str, name: str, urls: dict[str, str]) -> dict:
    key = f"{ROMAN[grade]}_{session}_{slug}"
    entry = {"items": key, "sqp": f"{key}-SQP", "ms": f"{key}-MS", "name": name, "slug": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
             "grade": grade, "session": session, "ok": False}
    sqp_url, ms_url = urls.get(f"{slug}-SQP"), urls.get(f"{slug}-MS")
    if not sqp_url or not ms_url:
        return {**entry, "why": "not published on CBSE's page"}
    pdf_q, pdf_m = WORK / "pdf" / f"{key}-SQP.pdf", WORK / "pdf" / f"{key}-MS.pdf"
    if not (curl(sqp_url, pdf_q) and curl(ms_url, pdf_m)):
        return {**entry, "why": "download failed"}
    for pdf, stem in ((pdf_q, entry["sqp"]), (pdf_m, entry["ms"])):
        out = WORK / "seg" / f"{stem}.json"
        if not out.exists():
            r = subprocess.run([PY, str(HERE / "segment.py"), str(pdf), str(out), str(WORK / "seg" / f"fig_{stem}")], capture_output=True, text=True, timeout=900)
            if r.returncode != 0:
                return {**entry, "why": f"segment failed: {r.stderr.strip()[-300:]}"}
    cur = json.loads((CUR / f"{cur_file}.json").read_text())
    vocab = WORK / f"vocab_{grade}_{cur_file.split('-', 1)[1].replace('-', '_')}.json"
    items_out = WORK / "items" / f"{key}.json"
    cmd = [PY, str(HERE / "parse.py"), str(WORK / "seg" / f"{entry['sqp']}.json"), str(WORK / "seg" / f"{entry['ms']}.json"), str(CUR / f"{cur_file}.json"),
           str(items_out), "--cls", f"Class {grade}", "--subject", cur.get("subject", name), "--session", session, "--source", "cbse_sqp", "--ref", sqp_url]
    if vocab.exists():
        cmd += ["--vocab", str(vocab)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if r.returncode != 0 or not items_out.exists():
        return {**entry, "why": f"parse failed: {r.stderr.strip()[-300:]}"}
    items = json.loads(items_out.read_text())
    got, qs = total(items)
    mx = max_marks(pdf_q)
    flagged = sum(1 for it in items if it.get("flags"))
    figs = sum(len(it.get("figures") or []) for it in items)
    ok = bool(mx) and got == mx and qs > 0
    return {**entry, "ok": ok, "total": got, "max": mx, "questions": qs, "items_count": len(items), "flagged": flagged, "figures": figs,
            **({} if ok else {"why": f"marks add up to {got}, paper says {mx}"})}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True)
    ap.add_argument("--grades", nargs="+", type=int, default=[10, 12])
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    man_path = WORK / "manifest.json"
    manifest = {m["items"]: m for m in (json.loads(man_path.read_text()) if man_path.exists() else [])}
    for g in a.grades:
        urls = links(g, a.session)
        for slug, (cur_file, name) in CORE[g].items():
            if a.only and slug not in a.only:
                continue
            try:
                m = run(g, a.session, slug, cur_file, name, urls)
            except Exception as e:  # noqa: BLE001
                m = {"items": f"{ROMAN[g]}_{a.session}_{slug}", "ok": False, "why": repr(e)[:300], "grade": g, "session": a.session, "name": name}
            manifest[m["items"]] = m
            print(json.dumps({k: m.get(k) for k in ("items", "ok", "total", "max", "questions", "flagged", "figures", "why")}))
            man_path.write_text(json.dumps(list(manifest.values()), indent=1))


if __name__ == "__main__":
    sys.exit(main())
