"""Pair each NCERT textbook chapter PDF with the curriculum chapter of the same name; save its text as matching vocabulary."""
import json, re, sys, difflib, glob
import pymupdf

def title(doc):
    best = []
    for p in list(doc)[:2]:
        for b in p.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                for s in l['spans']:
                    t = s['text'].strip()
                    if len(t) > 3 and re.search('[A-Za-z]{3}', t):
                        best.append((s['size'], t))
    best.sort(reverse=True)
    return ' '.join(t for sz, t in best[:3] if sz >= best[0][0] - 0.5)

# Titles printed with drop caps that name matching can't read; pinned by the book's chapter order.
PIN = {'jemh108': 'Introduction to Trigonometry', 'jemh109': 'Heights and Distances'}
cur = json.load(open(sys.argv[1])); pdfs = sorted(glob.glob(sys.argv[2])); out = {}
names = [c['name'] for u in cur['units'] for c in u['chapters']]
norm = lambda s: re.sub(r'[^a-z ]', '', s.lower())
for f in pdfs:
    d = pymupdf.open(f); t = title(d)
    m = max(names, key=lambda n: difflib.SequenceMatcher(None, norm(n), norm(t)).ratio() + (0.5 if norm(n) in norm(t) else 0))
    m = PIN.get(f.split('/')[-1][:-4], m)
    r = difflib.SequenceMatcher(None, norm(m), norm(t)).ratio()
    print(f.split('/')[-1], '|', t[:60], '->', m, round(r, 2))
    out.setdefault(m, '')
    out[m] += ' '.join(p.get_text() for p in d)
json.dump(out, open(sys.argv[3], 'w'))
