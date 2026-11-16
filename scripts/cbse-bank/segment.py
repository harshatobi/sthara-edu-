"""Split a CBSE sample paper / marking scheme PDF into numbered questions by layout. No AI.

CBSE papers are a table: | Q.No | question | marks |. Every question runs from its number down to the next
number (across pages). Text is rebuilt from positioned spans so stacked fractions (a drawn bar with spans above
and below) become a/b and raised spans become ^. Figures (embedded images, or clusters of vector drawing inside
the question column) are cut out as PNGs, and text that sits inside a figure (its labels) is left with the figure.
"""
import json, re, sys
import pymupdf

# 1. | 1 | 21(A). | 6A | 8.1. | 8.2 | 36 (i)
PREFIX = re.compile(r'^(\d{1,2})\s*(?:\(([A-Z])\)|\.(\d{1,2}))?[.)]\s*(?:\(([A-Z])\)\s*)?(\S.*)$')
LABEL = re.compile(r'^(\d{1,2})\s*\.?\s*(?:\(([A-Z])\)|([A-Z])|\.(\d{1,2}))?\s*\.?$')
MARK = re.compile(r'^(\d(\.\d)?|\d\s*[x×+]\s*\d|\(\d\)|\d+\s*marks?)$', re.I)
NOISE = re.compile(r'^\*$|Please note that the assessment scheme|There is no change in the Question Paper Design|^Page \d+ of \d+$|^\d+\s*\|\s*Page|^Q\.\s*No\.?$|^Questions?$|^Marks$|^S\.?\s*No\.?$', re.I)


def _spans(page):
    out = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        for l in b['lines']:
            for s in l['spans']:
                if s['text'].strip():
                    out.append({'t': s['text'], 'bbox': pymupdf.Rect(s['bbox']), 'oy': s['origin'][1], 'size': s['size'],
                                'sup': bool(s['flags'] & 1), 'bold': bool(s['flags'] & 16) or 'Bold' in s['font']})
    return out


def _fraction_bars(page):
    bars = []
    for d in page.get_drawings():
        for it in d['items']:
            if it[0] == 'l':
                p1, p2 = it[1], it[2]
                if abs(p1.y - p2.y) < 0.8 and 3 < abs(p2.x - p1.x) < 90:
                    bars.append(pymupdf.Rect(min(p1.x, p2.x), p1.y - 0.6, max(p1.x, p2.x), p1.y + 0.6))
            elif it[0] == 're':
                r = it[1]
                if r.height < 1.8 and 3 < r.width < 90:
                    bars.append(pymupdf.Rect(r))
    return bars


def _clean(t):
    t = re.sub(r'\s+', ' ', t).strip()
    return f'({t})' if re.search(r'[\s+\-–−]', t) else t


def page_lines(page):
    """Visual lines of the page: [{t, x0, y0, x1, y1, bold}], fractions and powers rebuilt."""
    spans = [s for s in _spans(page) if not NOISE.search(s['t'].strip())]
    used = set()
    synth = []
    for bar in _fraction_bars(page):
        if bar.x1 < page.rect.width * 0.15:
            continue  # the question-number column never holds fractions; its row rules do look like bars
        num = [i for i, s in enumerate(spans) if i not in used and bar.x0 - 3 <= (s['bbox'].x0 + s['bbox'].x1) / 2 <= bar.x1 + 3
               and bar.y0 - 6 <= s['bbox'].y1 <= bar.y0 + 3 and s['bbox'].y0 < bar.y0]
        den = [i for i, s in enumerate(spans) if i not in used and bar.x0 - 3 <= (s['bbox'].x0 + s['bbox'].x1) / 2 <= bar.x1 + 3
               and bar.y1 - 3 <= s['bbox'].y0 <= bar.y1 + 6 and s['bbox'].y1 > bar.y1]
        if not num or not den:
            continue
        wn = max(spans[i]['bbox'].x1 for i in num) - min(spans[i]['bbox'].x0 for i in num)
        wd = max(spans[i]['bbox'].x1 for i in den) - min(spans[i]['bbox'].x0 for i in den)
        if bar.width > 2.2 * max(wn, wd) + 8:
            continue  # a table rule between two rows, not a fraction
        nt = ''.join(spans[i]['t'] for i in sorted(num, key=lambda i: spans[i]['bbox'].x0))
        dt = ''.join(spans[i]['t'] for i in sorted(den, key=lambda i: spans[i]['bbox'].x0))
        used.update(num + den)
        box = pymupdf.Rect(bar)
        for i in num + den:
            box |= spans[i]['bbox']
        synth.append({'t': f'{_clean(nt)}/{_clean(dt)}', 'bbox': box, 'oy': None, 'size': 12, 'sup': False, 'bold': False, 'mid': bar.y0})
    items = [s for i, s in enumerate(spans) if i not in used]
    # Rows by baseline; a fraction joins the row whose text band holds its bar.
    rows = []
    body = sorted([s for s in items if not (s['sup'] and s['size'] < 10)], key=lambda s: s['oy'])
    for s in body:
        for r in rows:
            if abs(r['oy'] - s['oy']) < 3.2:
                r['spans'].append(s)
                break
        else:
            rows.append({'oy': s['oy'], 'spans': [s]})
    def nearest(y, x):
        cands = [r for r in rows if r['oy'] - 13 <= y <= r['oy'] + 4]
        return min(cands, key=lambda r: abs(r['oy'] - 4 - y)) if cands else None
    for f in synth:
        r = nearest(f['mid'], f['bbox'].x0)
        if r:
            r['spans'].append(f)
        else:
            rows.append({'oy': f['mid'] + 4, 'spans': [f]})
    for s in items:
        if s['sup'] and s['size'] < 10:
            r = nearest(s['bbox'].y1, s['bbox'].x0)
            if r:
                r['spans'].append({**s, 't': '^' + s['t'].strip()})
            else:
                rows.append({'oy': s['oy'], 'spans': [s]})
    lines = []
    for r in rows:
        ss = sorted(r['spans'], key=lambda s: s['bbox'].x0)
        # A wide gap splits a row into separate cells (number | text | marks).
        cell = [ss[0]]
        for s in ss[1:]:
            gap = s['bbox'].x0 - cell[-1]['bbox'].x1
            sofar = ''.join(c['t'] for c in cell).strip()
            if gap > 18 or (gap > 4 and (LABEL.match(sofar) or MARK.match(s['t'].strip()) or re.match(r'^\(\d+\s*[+=]', s['t'].strip()) or re.fullmatch(r'\d[\d+=\s.½]*\)', s['t'].strip()) or re.fullmatch(r'\d+(\s*\+\s*\d+)+\s*=?\s*\d*|=\s*\d+', s['t'].strip()))):
                lines.append(_join(cell)); cell = [s]
            else:
                cell.append(s)
        lines.append(_join(cell))
    h, w = page.rect.height, page.rect.width
    lines = [l for l in lines if not NOISE.search(l['t'])
             and not (re.fullmatch(r'\d{1,3}', l['t']) and l['y0'] > h * 0.86 and abs((l['x0'] + l['x1']) / 2 - w / 2) < w * 0.12)]
    return sorted(lines, key=lambda l: (round(l['y0']), l['x0']))


def _join(cell):
    t = ''
    for i, s in enumerate(cell):
        piece = s['t']
        if i and not piece.startswith('^') and s['bbox'].x0 - cell[i - 1]['bbox'].x1 > 1.5 and not t.endswith(' ') and not piece.startswith(' '):
            t += ' '
        t += piece
    box = pymupdf.Rect(cell[0]['bbox'])
    for s in cell[1:]:
        box |= s['bbox']
    t = re.sub(r'[ \t]+', ' ', t).strip()
    return {'t': t, 'x0': box.x0, 'y0': box.y0, 'x1': box.x1, 'y1': box.y1, 'bold': all(s['bold'] for s in cell)}


def rule_xs(doc):
    """x positions of the table's column rules: thin vertical strokes that repeat down the paper."""
    from collections import Counter
    c = Counter()
    for p in doc:
        for d in p.get_drawings():
            r = d['rect']
            if r.width < 2 and r.height > 8:
                c[round(r.x0 / 3)] += 1
    return {k * 3 for k, n in c.items() if n >= 6}


def _on_rule(x, xs):
    return any(abs(x - rx) < 4 for rx in xs)


def figure_boxes(page, left, right, lines, xs=()):
    images = [pymupdf.Rect(i['bbox']) for i in page.get_image_info() if pymupdf.Rect(i['bbox']).width > 20 and pymupdf.Rect(i['bbox']).height > 12]
    boxes = list(images)
    pieces = []
    for d in page.get_drawings():
        r = d['rect']
        if d.get('color') is None and d.get('fill') in ((1.0, 1.0, 1.0), (1, 1, 1)):
            continue  # white boxes behind text: invisible on the page
        if r.x0 < left - 2 or r.x1 > right + 2:
            continue
        if (r.height < 1.8 and r.x0 <= left + 8 and r.x1 >= right - 8) or (r.width < 1.8 and r.height > 250):
            continue  # the paper's row rules (whole cell wide)
        if r.width < 2 and r.height < 2:
            continue
        if r.width < 2 and _on_rule(r.x0, xs):
            continue  # a cell's vertical border
        if r.height < 2 and _on_rule(r.x0, xs) and _on_rule(r.x1, xs):
            continue  # a cell's top or bottom border
        pieces.append(pymupdf.Rect(r))
    # A long horizontal line only stays when a vertical stroke meets it (a data table), so separate figures
    # stacked in one cell are not glued together by a stray rule.
    verts = [r for r in pieces if r.width < 2 and r.height >= 6]
    # Any horizontal stroke stays only where a vertical stroke meets it: a table's rules. Fraction bars and
    # underlines meet nothing, and a stray rule can't glue separate figures together.
    pieces = [r for r in pieces if not (r.height < 1.8 and r.width >= 3) or any((v + (-2, -2, 2, 2)).intersects(r) for v in verts)]
    clusters = []
    solid = []
    for r in sorted(pieces, key=lambda r: (r.y0, r.x0)):
        clusters.append(pymupdf.Rect(r))
        solid.append(r.height >= 1.8)
    changed = True
    while changed:
        changed = False
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                if (clusters[i] + (-6, -6, 6, 6)).intersects(clusters[j]):
                    clusters[i] |= clusters.pop(j); solid[i] = solid[i] or solid.pop(j); changed = True; break
            if changed:
                break
    # A cluster of nothing but horizontal strokes is underlining, not a figure.
    boxes += [c for c, sd in zip(clusters, solid) if sd and c.width > 40 and c.height > 30]
    # Merge overlapping boxes (an image with drawn labels over it).
    changed = True
    while changed:
        changed = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                if boxes[i].intersects(boxes[j]):
                    boxes[i] |= boxes.pop(j); changed = True; break
            if changed:
                break
    out = []
    for b in boxes:
        b = pymupdf.Rect(b)
        # A photo or scan carries its own labels; only a drawn diagram has labels as separate text beside it.
        drawn = not any(b.contains(im) and im.get_area() > 0.8 * b.get_area() for im in images)
        # Take in labels that sit on or just beside the figure; drop slivers of the question text above/below.
        for l in lines:
            lr = pymupdf.Rect(l['x0'], l['y0'], l['x1'], l['y1'])
            if lr.x0 < left - 2:
                continue
            inside_v = lr.y0 >= b.y0 - 2 and lr.y1 <= b.y1 + 2
            if not drawn:
                continue
            if inside_v and lr.x1 > b.x0 - 30 and lr.x0 < b.x1 + 30 and lr.width < (right - left) * 0.45:
                b |= lr
            elif inside_v and b.x0 - 2 <= lr.x0 <= b.x1 and lr.x1 < right + 40:
                b |= lr  # a table row that starts inside the figure and runs past its drawn edge
        for l in lines:
            if l['y0'] < b.y0 < l['y1'] and l['x0'] < b.x1 and l['x1'] > b.x0 and not (l['y0'] >= b.y0):
                if (l['y1'] - b.y0) < (l['y1'] - l['y0']) * 0.75:
                    b.y0 = l['y1']
            if l['y0'] < b.y1 < l['y1'] and l['x0'] < b.x1 and l['x1'] > b.x0:
                if (b.y1 - l['y0']) < (l['y1'] - l['y0']) * 0.75:
                    b.y1 = l['y0']
        if b.height > 12:
            out.append(b)
    return out


INK = 232          # grey level below which a pixel counts as ink
SCAN_DPI = 100


def _segments(profile, min_gap):
    """Runs of non-empty entries in a row/column ink profile, split by at least min_gap empty entries."""
    segs, start, gap = [], None, 0
    for i, v in enumerate(profile):
        if v:
            if start is None:
                start = i
            gap, end = 0, i
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                segs.append((start, end)); start = None
    if start is not None:
        segs.append((start, end))
    return segs


def _ink_box(page, clip, avoid=(), rules=()):
    """The figure's ink inside clip (in points), with slivers of cut text and cell borders at the edges removed.
    Also says which edges the remaining ink still touches (the figure runs past the clip there)."""
    pm = page.get_pixmap(clip=clip, dpi=SCAN_DPI, colorspace=pymupdf.csGRAY)
    mat = pymupdf.Matrix(SCAN_DPI / 72, SCAN_DPI / 72)
    for a in avoid:
        if a.intersects(clip):
            ir = (a * mat).irect & pm.irect
            if not ir.is_empty:
                pm.set_rect(ir, (255,))   # the question's own text and other figures are not this figure's ink
    w, h, smp = pm.width, pm.height, pm.samples
    dark = [[smp[y * pm.stride + x] < INK for x in range(w)] for y in range(h)]
    rows = [sum(r) for r in dark]
    px = SCAN_DPI / 72
    segs = _segments(rows, 3)
    if not segs:
        return None, set()
    big = max(segs, key=lambda s: s[1] - s[0])
    keep = []
    for a, b in segs:
        thin = (b - a) <= 3                       # a ruled line
        sliver = (b - a) < 9 * px and (a <= 1 or b >= h - 2) and (a, b) != big   # half a line of text cut by the clip
        if (thin and (a <= 1 or b >= h - 2) and (a, b) != big) or sliver:
            continue
        keep.append((a, b))
    if not keep:
        keep = [big]
    y0, y1 = keep[0][0], keep[-1][1]
    cols = [sum(dark[y][x] for y in range(y0, y1 + 1)) for x in range(w)]
    csegs = _segments(cols, 3)
    span = y1 - y0 + 1
    # Cell borders: thin vertical strokes running (nearly) the full height, in the outer fifth of the crop.
    on_rule = lambda a, b: any(abs(clip.x0 + (a + b) / 2 / px - rx) < 3 for rx in rules)
    ckeep = [(a, b) for a, b in csegs if not ((b - a) <= 3 and max(cols[a:b + 1]) > span * 0.85 and on_rule(a, b))]
    if not ckeep:
        return None, set()
    x0, x1 = ckeep[0][0], ckeep[-1][1]
    # Horizontal cell borders: a thin row band spanning the full width at the top or bottom of what is left.
    def full_row(y): return sum(dark[y][x0:x1 + 1]) > (x1 - x0 + 1) * 0.9
    while y1 - y0 > 6 and full_row(y0) and not any(full_row(y) for y in range(y0 + 4, min(y0 + 8, y1))) and all(not any(dark[y][x0:x1 + 1]) for y in range(y0 + 1, y0 + 3) if not full_row(y)):
        y0 += 1
        while y0 < y1 and not any(dark[y0][x0:x1 + 1]):
            y0 += 1
    while y1 - y0 > 6 and full_row(y1) and all(not any(dark[y][x0:x1 + 1]) for y in range(y1 - 3, y1 - 1) if not full_row(y)):
        y1 -= 1
        while y1 > y0 and not any(dark[y1][x0:x1 + 1]):
            y1 -= 1
    touch = {e for e, hit in (('top', y0 <= 1), ('bottom', y1 >= h - 2), ('left', x0 <= 1), ('right', x1 >= w - 2)) if hit}
    box = pymupdf.Rect(clip.x0 + x0 / px, clip.y0 + y0 / px, clip.x0 + (x1 + 1) / px, clip.y0 + (y1 + 1) / px)
    return box, touch


def save_figure(doc, page, rect, cell, base, avoid=(), rules=()):
    """Crop a figure cleanly: grow the clip until nothing is cut, trim slivers and borders, even 8pt margin.
    Writes base.png (200 dpi) and, for pure line drawings, base.svg. Returns the printed size in points."""
    lim = pymupdf.Rect(cell.x0 + 1.5, page.rect.y0 + 20, cell.x1 - 1.5, page.rect.y1 - 30)
    clip = (rect + (-6, -6, 6, 6)) & lim
    box = None
    for _ in range(6):
        box, touch = _ink_box(page, clip, avoid, rules)
        if box is None:
            box = rect
            break
        grown = pymupdf.Rect(clip)
        if 'top' in touch: grown.y0 -= 16
        if 'bottom' in touch: grown.y1 += 16
        if 'left' in touch: grown.x0 -= 16
        if 'right' in touch: grown.x1 += 16
        grown &= lim
        if grown == clip:
            break
        clip = grown
    # An even 8pt margin, narrowed on any side where the question's text would come into the picture.
    m = {'l': 8, 't': 8, 'r': 8, 'b': 8}
    for a in avoid:
        if a.x1 > box.x0 and a.x0 < box.x1:
            if a.y1 <= box.y0: m['t'] = min(m['t'], max(0, box.y0 - a.y1 - 1))
            if a.y0 >= box.y1: m['b'] = min(m['b'], max(0, a.y0 - box.y1 - 1))
        if a.y1 > box.y0 and a.y0 < box.y1:
            if a.x1 <= box.x0: m['l'] = min(m['l'], max(0, box.x0 - a.x1 - 1))
            if a.x0 >= box.x1: m['r'] = min(m['r'], max(0, a.x0 - box.x1 - 1))
    final = (box + (-m['l'], -m['t'], m['r'], m['b'])) & (lim + (-1, 0, 1, 0))
    if final.is_empty or final.width < 8 or final.height < 8:
        final = rect + (-4, -4, 4, 4)
    m200 = pymupdf.Matrix(200 / 72, 200 / 72)

    def render(r):
        pm = page.get_pixmap(clip=r, dpi=200)
        hit = False
        for a in avoid:
            if a.intersects(r):
                ir = (a * m200).irect & pm.irect
                if not ir.is_empty:
                    pm.set_rect(ir, (255, 255, 255) if pm.n >= 3 else (255,))   # question text over the picture
                    hit = True
        return pm, hit

    pm, covered = render(final)
    rule_y0, rule_y1 = -1e9, 1e9   # page limits set by dropped table row rules, kept across passes
    for _ in range(3):
        # Painting text out can leave empty space on one side: re-trim to the ink, then the even margin again.
        g = pymupdf.Pixmap(pymupdf.csGRAY, pm)
        prof = [sum(g.samples[y * g.stride + x] < INK for x in range(0, g.width, 2)) for y in range(g.height)]
        segs = _segments(prof, 6)
        # A thin, solid, straight line standing apart at the very top or bottom is a table row rule. A drawing's
        # own lines always meet a label or a shape, so they never stand apart like this.
        def solid(y):
            xs = [x for x in range(g.width) if g.samples[y * g.stride + x] < INK]
            return bool(xs) and xs[-1] - xs[0] + 1 > g.width * 0.3 and len(xs) > (xs[-1] - xs[0] + 1) * 0.9
        def edge_rule(order):
            ys = [y for y in order if prof[y]]
            if not ys: return None
            band = [ys[0]]
            for y in ys[1:]:
                if abs(y - band[-1]) == 1 and len(band) < 7: band.append(y)
                else: break
            if len(band) > 6 or not all(solid(y) for y in band if prof[y] > 1): return None
            nxt = next((y for y in order if prof[y] and y not in band), None)
            return band if nxt is not None and abs(nxt - band[-1]) >= 3 else None
        k = 72 / 200
        t = edge_rule(range(g.height))
        if t: rule_y0 = max(rule_y0, final.y0 + (max(t) + 2) * k)
        bt = edge_rule(range(g.height - 1, -1, -1))
        if bt: rule_y1 = min(rule_y1, final.y0 + (min(bt) - 1) * k)
        lo, hi = int((rule_y0 - final.y0) / k), int((rule_y1 - final.y0) / k)
        segs = [(max(a, lo), min(b, hi)) for a, b in segs if b >= lo and a <= hi]
        rows = [y for a, b in segs for y in range(a, b + 1) if prof[y]]
        cols = [x for x in range(g.width) if any(g.samples[y * g.stride + x] < INK for y in rows[::2])] if rows else []
        if rows and cols:
            k = 72 / 200
            ink = pymupdf.Rect(final.x0 + cols[0] * k, final.y0 + rows[0] * k, final.x0 + (cols[-1] + 1) * k, final.y0 + (rows[-1] + 1) * k)
            new = (ink + (-8, -8, 8, 8)) & (lim + (-1, 0, 1, 0))
            # The margin must not reach back over a row rule that was just dropped.
            new.y0, new.y1 = max(new.y0, rule_y0), min(new.y1, rule_y1)
            if abs(new.x0 - final.x0) < 0.5 and abs(new.x1 - final.x1) < 0.5 and abs(new.y0 - final.y0) < 0.5 and abs(new.y1 - final.y1) < 0.5:
                break
            final = new
            pm, covered = render(final)
    pm.save(base + '.png')
    svg = None
    if not covered and not any(pymupdf.Rect(i['bbox']).intersects(final) for i in page.get_image_info()):
        one = pymupdf.open()
        one.insert_pdf(doc, from_page=page.number, to_page=page.number)
        p = one[0]
        p.set_cropbox(final * page.derotation_matrix if page.rotation else final)
        open(base + '.svg', 'w').write(p.get_svg_image(text_as_path=True))
        svg = base.split('/')[-1] + '.svg'
    return {'w': round(final.width, 1), 'h': round(final.height, 1), 'svg': svg}


def cell_bounds(xs, left, marks_x, width):
    """The question cell's left and right borders: the rule before the text, and the rule before the marks column
    (inner rules of a three-column answer table lie between and are not limits)."""
    l = max([x for x in xs if x <= left + 3], default=left - 6)
    r = max([x for x in xs if left + 50 < x < marks_x], default=marks_x - 4)
    return l, r


def segment(path, figdir=None, prefix='q'):
    doc = pymupdf.open(path)
    pages = [page_lines(p) for p in doc]
    w = doc[0].rect.width
    labels = sorted(l['x1'] for ls in pages for l in ls if LABEL.match(l['t']) and l['x0'] < w * 0.12 and l['x1'] < w * 0.2)
    left = labels[int(len(labels) * 0.95) - 1] + 4 if labels else 80
    marks = [l['x0'] for ls in pages for l in ls if MARK.match(l['t']) and l['x0'] > w * 0.8]
    right = (min(marks) - 3) if marks else w * 0.9
    xs = rule_xs(doc)
    mx = sorted(marks)[len(marks) // 2] if marks else w * 0.9
    cl, cr = cell_bounds(xs, left, mx, w)
    col = cr - cl
    mapqs = []
    qs, cur, pre = [], None, []
    expected = 1
    instructions = False
    for pi, page in enumerate(doc):
        ls = pages[pi]
        figs = figure_boxes(page, left - 4, right + 4, ls, xs) if figdir else []
        split = []
        for l in ls:
            m = PREFIX.match(l['t']) if l['x0'] < left - 8 and l['x1'] > left + 10 else None
            if m and int(m.group(1)) in (expected, cur['n'] if cur else -1):
                n, alt, part, alt2, rest = m.groups()
                lab = n + (f'({alt or alt2})' if (alt or alt2) else '') + (f'.{part}' if part else '')
                split.append({**l, 't': lab, 'x1': left - 2})
                split.append({**l, 't': rest, 'x0': left + 2})
            else:
                split.append(l)
        ls = split
        # Text on a question number's row belongs to that question even when it sits a point above the number.
        for lab in [l for l in ls if LABEL.match(l['t']) and l['x0'] < left - 2]:
            for l in ls:
                if l is not lab and abs(l['y0'] - lab['y0']) < 4:
                    l['y0'] = lab['y0'] + 0.1
        ls.sort(key=lambda l: (round(l['y0']), l['x0']))
        for l in ls:
            if any(pymupdf.Rect(l['x0'], l['y0'], l['x1'], l['y1']) in (f + (-1, -1, 1, 1)) for f in figs):
                continue  # a figure's own label
            # Numbered general instructions come before the first section; their numbers are not questions.
            if re.search(r'General Instructions', l['t'], re.I) and not qs:
                instructions = True
            if instructions and re.match(r'^(SECTION|Section)\s*[–-]?\s*[A-F]\b|^PART\s*[–-]?\s*[A-F]?\b', l['t'].strip()):
                instructions = False
            if instructions:
                pre.append(l['t'])
                continue
            m = LABEL.match(l['t']) if (l['x1'] <= left + 1 or l['x0'] < left - 12) else None
            if m:
                n = int(m.group(1)); alt = m.group(2) or m.group(3); part = m.group(4)
                if n == expected or (cur and n == cur['n'] and (alt or part)):
                    if n == expected:
                        cur = {'n': n, 'items': [], 'marks': [], 'figs': [], 'page': pi + 1}
                        qs.append(cur)
                        expected += 1
                    if alt or part:
                        cur['items'].append({'k': 'label', 'alt': alt, 'part': part, 'y': l['y0'], 'page': pi + 1})
                    continue
            if cur is None:
                pre.append(l['t'])
                continue
            if (l['x0'] >= right - 1 and MARK.match(l['t'])) or (l['x0'] >= right - 15 and re.match(r'^\(?\d[\d+=\s.½]*\)?$', l['t']) and re.search(r'[+=)]', l['t'])):
                cur['marks'].append(l['t'].strip('() '))
                cur['items'].append({'k': 'mark', 't': l['t'].strip('() '), 'raw': l['t'], 'y': l['y0'], 'x0': l['x0'], 'page': pi + 1})
            else:
                cur['items'].append({'k': 'text', 't': l['t'], 'x0': round(l['x0'], 1), 'y': l['y0'], 'y1': l['y1'], 'bold': l['bold'], 'page': pi + 1})
        for l in ls:
            if re.search(r'Map\s+for\s+Q', l['t'], re.I):
                mapqs = [int(x) for x in re.findall(r'Q(?:uestion)?\.?\s*(?:no\.?)?\s*(\d{1,2})', l['t'], re.I)]
        # Text that is not inside any figure is the question's own text.
        foreign = [pymupdf.Rect(l['x0'], l['y0'], l['x1'], l['y1']) for l in ls
                   if not any(pymupdf.Rect(l['x0'], l['y0'], l['x1'], l['y1']) in (f + (-1, -1, 1, 1)) for f in figs)]
        done = []
        for f in figs:
            owner = None
            avoid = foreign + [g for g in figs if g is not f and not g.intersects(f)]
            if any((f & d).get_area() > 0.6 * min(f.get_area(), d.get_area()) for d in done):
                continue  # the same figure found twice
            done.append(f)
            if mapqs:
                # A captioned map (this page or the next): one picture, attached to every question it names.
                base = f"map_{'_'.join(map(str, mapqs))}"
                # A map has its own page: the whole page width is its space.
                meta = save_figure(doc, page, f, pymupdf.Rect(20, 0, page.rect.width - 20, 0), f'{figdir}/{base}', avoid, xs)
                for q in qs:
                    if q['n'] in mapqs:
                        q['figs'].append({'file': base + '.png', **meta, 'col': round(page.rect.width - 40, 1), 'page': pi + 1, 'y': f.y0, 'x0': f.x0, 'y1': f.y1, 'map': True})
                mapqs = []
                continue
            for q in qs:
                here = [it['y'] for it in q['items'] if it['page'] == pi + 1]
                if (here or q['page'] == pi + 1) and f.y0 >= min(here or [0]) - 6:
                    owner = q
            owner = owner or (qs[-1] if qs else None)
            if owner is not None:
                base = f"{prefix}{owner['n']}_{len(owner['figs']) + 1}"
                name = base + '.png'
                meta = save_figure(doc, page, f, pymupdf.Rect(cl, 0, cr, 0), f'{figdir}/{base}', avoid, xs)
                owner['figs'].append({'file': name, **meta, 'col': round(col, 1), 'page': pi + 1, 'y': f.y0, 'x0': f.x0, 'y1': f.y1})
                owner['items'].append({'k': 'fig', 'file': name, 'y': f.y0, 'x0': f.x0, 'page': pi + 1})
    for q in qs:
        q['items'].sort(key=lambda it: (it['page'], round(it['y']), it.get('x0', 0)))
    return {'left': left, 'right': right, 'pre': pre, 'questions': qs}


if __name__ == '__main__':
    import os
    path, out = sys.argv[1], sys.argv[2]
    figdir = sys.argv[3] if len(sys.argv) > 3 else None
    if figdir:
        os.makedirs(figdir, exist_ok=True)
        for f in os.listdir(figdir):
            os.remove(os.path.join(figdir, f))
    r = segment(path, figdir)
    json.dump(r, open(out, 'w'), indent=1, ensure_ascii=False)
    print(path.split('/')[-1], 'cols', round(r['left']), round(r['right']), 'questions', len(r['questions']),
          'figs', sum(len(q['figs']) for q in r['questions']))
