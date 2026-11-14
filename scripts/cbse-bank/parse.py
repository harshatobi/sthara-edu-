"""Turn a segmented CBSE paper + marking scheme into bank items. Rules only, no AI.

  python parse.py <paper.json> <scheme.json> <curriculum.json> <out.json> --cls "Class 10" --subject Science
       --session 2026-27 --source cbse_sqp --ref <url>

Each question becomes one item per internal choice (A / B, or either side of an OR). A figure the question needs is
kept as CBSE's own picture; CBSE's text-only version for visually impaired candidates is kept beside it as the
item's access version. Answers and value points are CBSE's marking scheme, matched by question number and choice.
Chapter, competency and type are found by fixed rules; anything a rule can't settle is flagged for review.
"""
import json, math, re, sys, argparse
from collections import Counter

VI = re.compile(r'visual(ly)?\s*impa|V\.?\s*I\.?\s*candidates', re.I)
DROP = re.compile(r'^(SECTION\b|Section\s*[–-]|[-–\s]{6,}$|MAP SKILL[- ]BASED QUESTION|HINTS/SOLUTION|\[This section comprises|each\]$|Students? (are )?to attempt either option A or B\.?$|^\(?\d+\s*[x×]\s*\d+\s*=\s*\d*\)?$)', re.I)
HEADING = re.compile(r'^(?=.*[A-Z]{4,})(?!.*\b(?:I{1,3}|IV|VI{0,3})\b.*\b(?:I{1,3}|IV)\b)[A-Z][A-Z\s&,()\-–]{4,}(\(\d+ marks\))?$')  # GEOGRAPHY (20 marks), ECONOMICS
OPT = re.compile(r'^\(?([A-Da-d])[.)]\s*(.*)$')
OPT_INLINE = re.compile(r'\(([A-D])\)\s*')
EITHER = re.compile(r'attempt either (option|sub\s*-?\s*part)', re.I)
AR_OPTIONS = ['Both A and R are true, and R is the correct explanation of A.', 'Both A and R are true, and R is not the correct explanation of A.', 'A is true but R is false.', 'A is false but R is true.']

COMP_RULES = [
    ('analyse_evaluate', r'\b(evaluate|analy[sz]e|assess|justify|critically|examine|predict|compare|distinguish|infer|why do you think|would you|suggest|prove|show that|differentiate)\b'),
    ('apply', r'\b(calculate|find|determine|compute|solve|draw|construct|how many|what will|what would|if\b.*\bthen|identify|explain how|illustrate|use)\b'),
    ('remember_understand', r'\b(define|name|state|list|what is|what are|which|who|when|where|mention|write|describe|explain|give)\b'),
]


AR_INTRO = re.compile(r'consist of two statements|selecting the appropriate option|Assertion \(A\) and Reason \(R\)\.?\s*$', re.I)


def chunks(q):
    """Split one question's lines into its internal choices: label alternatives, a top-level OR, or 'attempt either A or B'."""
    items = []
    for it in q['items']:
        if it['k'] == 'text' and AR_INTRO.search(it['t']):
            break  # the shared assertion-reason instructions, printed after this question
        if not (it['k'] == 'text' and (DROP.search(it['t']) or HEADING.match(it['t'].strip()))):
            items.append(it)
    alts = [it for it in items if it['k'] == 'label' and it.get('alt')]
    if alts:
        out, cur = {}, None
        for it in items:
            if it['k'] == 'label' and it.get('alt'):
                cur = it['alt']; out.setdefault(cur, [])
                continue
            if it['k'] == 'text' and it['t'].strip() == 'OR':
                continue
            out.setdefault(cur or 'A', []).append(it)
        return out
    text = [it for it in items if it['k'] == 'text']
    ors = [i for i, it in enumerate(items) if it['k'] == 'text' and it['t'].strip() == 'OR']
    subpart = any(re.search(r'sub\s*-?\s*part', it['t'], re.I) for it in q['items'] if it['k'] == 'text')
    # An OR inside a case question's last part (iii) (A) / OR / (iii) (B) is a choice within the part, not two questions.
    in_part = ors and any(PART.match(it['t'].strip()) for it in items[:ors[0]] if it['k'] == 'text')
    if ors and len(ors) == 1 and not subpart and not in_part:
        i = ors[0]
        return {'A': items[:i], 'B': items[i + 1:]}
    # Science: "Students to attempt either option A or B." then top-level "A." / "B." at the start of the text column.
    either = any(EITHER.search(it['t']) and 'sub' not in it['t'].lower() for it in q['items'] if it['k'] == 'text')
    if either and text:
        col = min(it['x0'] for it in text)
        out, cur = {}, None
        for it in items:
            m = OPT.match(it.get('t', '')) if it['k'] == 'text' else None
            if m and m.group(1) in 'AB' and it['x0'] < col + 9 and (cur is None or m.group(1) > cur):
                cur = m.group(1); out[cur] = []
                if m.group(2).strip():
                    out[cur].append({**it, 't': m.group(2)})
                continue
            out.setdefault(cur or 'A', []).append(it)
        if len(out) == 2:
            return out
    return {'': items}


def split_vi(items):
    for i, it in enumerate(items):
        if it['k'] == 'text' and VI.search(it['t']) and re.match(r'^\W*(note|for|q\.?\s*no|question)', it['t'], re.I):
            return items[:i], [x for x in items[i + 1:]]
    return items, []


PART = re.compile(r'^\(?([ivx]+|[IVX]+(?=[.)\s])|\d\.\d)[.)]?(?=\s|$)')


def marks_of(items):
    """The printed total; else one mark per sub-part (an OR alternative of a part counted once)."""
    marks = [it for it in items if it['k'] == 'mark' and not it.get('raw', '').startswith('(')]
    if len(marks) >= 2 and not re.search('=', ''.join(it['t'] for it in marks)):
        # The n-th mark goes with the n-th part label of the top-level numbering style (I/II, (i)/(ii) or 8.1/8.2);
        # marks sit at the top of a part's cell in some papers and at the bottom in others, so position can't decide.
        style = lambda p: 'upper' if p.isupper() else 'dec' if '.' in p else 'lower'
        labels = [PART.match(it['t'].strip()).group(1) for it in items if it['k'] == 'text' and PART.match(it['t'].strip())]
        top = [p for p in labels if labels and style(p) == style(labels[0])]
        first_label = next((k for k, it in enumerate(items) if it['k'] == 'text' and PART.match(it['t'].strip())), None)
        before, per = None, {}
        vals = []
        for k, mk in enumerate(items):
            if mk in marks:
                try:
                    vals.append((k, float(mk['t'])))
                except ValueError:
                    pass
        # A mark well above the first part (before the passage ends) is the question's printed total.
        if vals and first_label is not None and vals[0][0] < first_label and not (items[vals[0][0]]['page'] == items[first_label]['page'] and abs(items[vals[0][0]]['y'] - items[first_label]['y']) < 5):
            before = vals[0][1]
            vals = vals[1:]
        for (k, v), p in zip(vals, top):
            per.setdefault(p, v)
        if before is not None:
            return int(before)
        if per:
            return int(sum(per.values()))
    joined = ''.join(it['t'] for it in items if it['k'] == 'mark')
    m = re.search(r'=\s*(\d+)', joined)
    if m:
        return int(m.group(1))
    for it in items:
        if it['k'] == 'mark':
            t = it['t']
            m = re.search(r'=\s*(\d+)', t)
            if m:
                return int(m.group(1))
            try:
                return int(float(t))
            except ValueError:
                pass
    return None


def join(lines):
    """Rejoin wrapped lines into paragraphs; keep list items, statements and sub-parts on their own lines."""
    out = []
    for t in lines:
        t = t.strip()
        if not t:
            continue
        starts_new = re.match(r'^(\(?[ivx]+[.)]|\(?[a-hA-H][.)]|\d+[.)]|[IVX]+[.:]|Statement|Assertion|Reason|Column|Option|Case|Source|OR$|•|-\s)', t)
        if out and not starts_new and not out[-1].endswith(':'):
            out[-1] += ' ' + t
        else:
            out.append(t)
    return strip_furniture('\n'.join(out))


# Paper furniture printed between questions that the segmenter leaves on the question before it: section
# headers ("This section comprises of 5 ... each."), the scheme's section tags and map captions.
FURNITURE = [
    re.compile(r'\s*\(?\[?\s*This section comprises\b.*$', re.I | re.S),
    re.compile(r'\s*\(\s*Section\s*[–—-]\s*[A-F]\s*\)\s*/?.*$', re.I | re.S),
    re.compile(r'\s*Map for Q\.?\s*no\.?\s*\d+.*$', re.I | re.S),
]


def strip_furniture(text):
    for rx in FURNITURE:
        text = rx.sub('', text)
    return text.strip()


def options_of(items):
    """MCQ options in reading order: lines starting A./(A)/(a), several on one row, or a picture beside a bare letter."""
    opts, stem, figs = {}, [], {}
    bare = {}
    for it in items:
        if it['k'] != 'text':
            continue
        t = it['t'].strip()
        if OPT_INLINE.search(t) and len(OPT_INLINE.findall(t)) >= 2 and t.startswith('('):
            parts = OPT_INLINE.split(t)[1:]
            for k, v in zip(parts[0::2], parts[1::2]):
                opts[k] = v.strip()
            continue
        m = OPT.match(t)
        if m and (m.group(1).upper() not in opts) and (opts or len(stem) > 0):
            opts[m.group(1).upper()] = m.group(2).strip()
            if not m.group(2).strip():
                bare[m.group(1).upper()] = it
            continue
        if opts and len(opts) < 4 and stem and not OPT.match(t):
            last = max(opts)
            opts[last] = (opts[last] + ' ' + t).strip()
            continue
        stem.append(t)
    for k, it in bare.items():
        f = min((x for x in items if x['k'] == 'fig' and x['page'] == it['page']), key=lambda x: abs(x['y'] - it['y']), default=None)
        if f:
            figs[k] = f['file']
    if sorted(opts) != ['A', 'B', 'C', 'D']:
        return None, None, None
    return [opts[k] for k in 'ABCD'], stem, figs


def answer_letter(items):
    for it in items:
        if it['k'] == 'text':
            m = re.match(r'^\(?([A-D])\s*(?:[.)\s\-–:/]|$)', it['t'].strip() + ' ')
            if m:
                return 'ABCD'.index(m.group(1))
            m = re.match(r'^(?:Ans(?:wer)?[:.]?\s*)?\(?([a-dA-D])\)', it['t'].strip())
            if m:
                return 'abcd'.index(m.group(1).lower())
    return None


# Paper sections name a discipline; these words pick the curriculum units that discipline covers.
DISCIPLINE = {
    'biology': ['living', 'natural resources', 'environment'], 'chemistry': ['chemical', 'substances'],
    'physics': ['phenomena', 'current', 'motion', 'light'], 'history': ['history'], 'geography': ['geography'],
    'political': ['political'], 'economics': ['economic'],
}


class Chapters:
    """Chapter by word overlap with the NCERT chapter text (when given) plus the curriculum's names, topics and outcomes."""
    def __init__(self, cur, vocab=None):
        self.ch = []
        vocab = vocab or {}
        for u in cur['units']:
            for c in u['chapters']:
                words = Counter(self.tok(' '.join([c['name']] * 3 + c.get('topics', []) * 2 + c.get('outcomes', []))))
                book = Counter(self.tok(vocab.get(c['name'], '')))
                total = sum(book.values()) or 1
                # Book words count by how much of the chapter they make up, so long chapters don't win by size.
                for w, n in book.items():
                    words[w] += min(4.0, 400 * n / total)
                self.ch.append((c['name'], words, (u.get('name') or '').lower()))
        df = Counter(w for _, c, _ in self.ch for w in c if c[w] >= 0.5)
        self.idf = {w: math.log((1 + len(self.ch)) / (1 + n)) for w, n in df.items()}

    STOP = set('the of and a an in to for is are its with by on from as at or be this that which what how its their these those used use into'.split())

    def tok(self, s):
        out = []
        for w in re.findall(r'[a-z]+', s.lower()):
            if len(w) < 3 or w in self.STOP:
                continue
            for suf in ('ations', 'ation', 'ings', 'ing', 'ies', 'es', 's'):
                if w.endswith(suf) and len(w) - len(suf) >= 4:
                    w = w[: -len(suf)] + ('y' if suf == 'ies' else ''); break
            out.append(w)
        return out

    def best(self, text, discipline=None):
        q = Counter(self.tok(text))
        keys = DISCIPLINE.get(discipline or '', [])
        pool = [x for x in self.ch if any(k in x[2] for k in keys)] or self.ch
        scored = sorted(((sum(self.idf.get(w, 0) * min(n, 2) * min(c[w], 4) ** 0.5 for w, n in q.items() if w in c), name) for name, c, _ in pool), reverse=True)
        top, second = scored[0], scored[1] if len(scored) > 1 else (0, '')
        sure = top[0] >= 4 and top[0] >= second[0] * 1.25
        return top[1], round(top[0], 2), sure


def competency(text, qtype):
    if qtype == 'assertion_reason':
        return 'analyse_evaluate'
    low = text.lower()
    if re.search(COMP_RULES[0][1], low):
        return 'analyse_evaluate'
    # Working with given numbers or data is applying, whatever the question word.
    if len(re.findall(r'\d+(?:\.\d+)?', low)) >= 2 or re.search(COMP_RULES[1][1], low):
        return 'apply'
    for comp, rx in COMP_RULES[2:]:
        if re.search(rx, low):
            return comp
    return 'apply' if qtype == 'case' else 'remember_understand'


def disciplines(paper):
    """Section letter -> discipline from the instructions ("Section A is Biology, Section B is Chemistry ...")."""
    text = ' '.join(paper['pre'])
    return {m.group(1): m.group(2).lower() for m in re.finditer(r'Section\s+([A-F])\s+(?:is|consists of|comprises)\s+([A-Za-z]+)', text)}


def section_of(t, by_letter):
    m = re.match(r'^Section\s*[–-]?\s*([A-F])\b', t.strip(), re.I)
    if m and m.group(1).upper() in by_letter:
        return by_letter[m.group(1).upper()]
    low = t.lower()
    if HEADING.match(t.strip()) or low.startswith('section'):
        for d in DISCIPLINE:
            if d in low:
                return d
    return None


def build(paper, scheme, cur, meta, vocab=None):
    chapters = Chapters(cur, vocab)
    ms = {q['n']: q for q in scheme['questions']}
    by_letter = disciplines(paper)
    discipline = None
    for t in paper['pre']:
        discipline = section_of(t, by_letter) or discipline
    out = []
    for q in paper['questions']:
        # A heading inside this question's lines belongs to the next question (it is printed after this one).
        here = discipline
        for it in q['items']:
            if it['k'] == 'text':
                d = section_of(it['t'], by_letter)
                if d:
                    discipline = d
        msq = ms.get(q['n'])
        pc = chunks(q)
        mc = chunks(msq) if msq else {}
        for key, items in pc.items():
            main, vi = split_vi(items)
            mitems = mc.get(key) or (mc.get('') if mc else None) or []
            m_main, m_vi = split_vi(mitems)
            marks = marks_of(main) or marks_of(items) or marks_of(q['items']) or marks_of(mitems)
            flags = []
            figs = [it['file'] for it in main if it['k'] == 'fig'] + [f['file'] for f in q['figs'] if f.get('map')]
            figs = list(dict.fromkeys(figs))
            item = {'q': f"{q['n']}{key}", 'marks': marks}
            options = None
            if marks == 1:
                options, stem, ofigs = options_of(main)
            if options is None and marks == 1 and figs and answer_letter(m_main) is not None and not any('Assertion' in it.get('t', '') for it in main):
                # The options are inside CBSE's picture (text stored as drawing): keep the picture, letters as options.
                options, stem, ofigs = ['A', 'B', 'C', 'D'], [it['t'] for it in main if it['k'] == 'text'], {}
                item['optionsInFigure'] = True
                flags.append('text_in_picture')
            if options is not None:
                text = join(stem)
                if not text and q['n'] > 1:
                    flags.append('stem_missing')
                is_ar = 'Assertion' in text
                if is_ar and not any(o.strip() for o in options):
                    options = AR_OPTIONS
                item.update(type='assertion_reason' if is_ar else 'mcq', text=text, options=options)
                if ofigs:
                    item['optionFigures'] = ofigs
                    figs = [f for f in figs if f not in ofigs.values()]
                a = answer_letter(m_main)
                pair = next((re.match(r'^\(?([A-D])\s*/\s*([A-D])\b', it['t'].strip()) for it in m_main if it['k'] == 'text' and re.match(r'^\(?[A-D]\s*/\s*[A-D]\b', it['t'].strip())), None)
                if pair and vi:
                    m_vi = [{'k': 'text', 't': pair.group(2) + '.'}]
                if a is None:
                    flags.append('answer_missing')
                item['answer'] = a
                item['scheme'] = join([it['t'] for it in m_main if it['k'] == 'text'])
            else:
                if marks == 1 and 'Assertion' in ' '.join(it.get('t', '') for it in main):
                    # Assertion-reason with the shared options printed once above the pair.
                    text = join([it['t'] for it in main if it['k'] == 'text'])
                    item.update(type='assertion_reason', text=text, options=AR_OPTIONS, answer=answer_letter(m_main),
                                scheme=join([it['t'] for it in m_main if it['k'] == 'text']))
                else:
                    text = join([it['t'] for it in main if it['k'] == 'text'])
                    sub = len(re.findall(r'(^|\n)\(?([ivx]+|[A-D]|[a-d]|\d\.\d)[.)]', text))
                    cue = re.search(r'read the|case|source|passage|study the|based on the', text, re.I)
                    case = ((marks or 0) >= 4 and cue) or (marks == 4 and sub >= 2)
                    qtype = 'case' if case else 'long' if (marks or 0) >= 5 else 'short'
                    item.update(type=qtype, text=text, scheme=join([it['t'] for it in m_main if it['k'] == 'text']))
                    if not item['scheme'] and not [it for it in m_main if it['k'] == 'fig']:
                        flags.append('scheme_missing')
            sfigs = [it['file'] for it in m_main if it['k'] == 'fig'] + [f['file'] for f in (msq or {}).get('figs', []) if f.get('map')]
            if figs:
                item['figures'] = figs
            if sfigs:
                item['schemeFigures'] = list(dict.fromkeys(sfigs))
            if vi:
                vtext_items = [it for it in vi if it['k'] == 'text']
                vo, vstem, _ = options_of(vi) if marks == 1 else (None, None, None)
                atext = join(vstem) if vo else join([it['t'] for it in vtext_items])
                atext = re.sub(r'^(?:in\s+)?lieu of Q\.?\s*No\.?\s*\d+[A-Z]?\s*[.:,-]?\s*', '', atext, flags=re.I)
                atext = re.sub(r'^%d[A-Z]?\s+' % q['n'], '', atext)
                access = {'text': atext}
                if vo:
                    access['options'] = vo
                    tagged = [it for it in m_main if it['k'] == 'text' and VI.search(it['t'])]
                    access['answer'] = answer_letter(m_vi) if m_vi else (answer_letter(tagged) if tagged else None)
                    if access['answer'] is None:
                        flags.append('access_answer_missing')
                if m_vi:
                    access['scheme'] = join([it['t'] for it in m_vi if it['k'] == 'text'])
                item['access'] = access
            elif figs and not item.get('optionFigures'):
                flags.append('figure_without_text_version')
            if not marks:
                flags.append('marks_missing')
            if not item['text'].strip():
                flags.append('text_missing')
            name, score, sure = chapters.best(item['text'] + ' ' + item.get('scheme', '') * 2 + ' ' + item.get('access', {}).get('text', ''), here)
            if here:
                item['discipline'] = here
            item['chapter'] = name
            item['chapterScore'] = score
            if not sure:
                flags.append('chapter_unsure')
            item['competency'] = competency(item['text'], item['type'])
            item['flags'] = flags
            item.update(meta)
            out.append(item)
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('paper'); ap.add_argument('scheme'); ap.add_argument('curriculum'); ap.add_argument('out')
    ap.add_argument('--cls'); ap.add_argument('--subject'); ap.add_argument('--session'); ap.add_argument('--source', default='cbse_sqp')
    ap.add_argument('--vocab', default=None)
    ap.add_argument('--ref', default=''); ap.add_argument('--language', default='en'); ap.add_argument('--paper-key', default='')
    a = ap.parse_args()
    meta = {'cls': a.cls, 'subject': a.subject, 'session': a.session, 'source': a.source, 'ref': a.ref, 'language': a.language, 'paper': a.paper_key}
    items = build(json.load(open(a.paper)), json.load(open(a.scheme)), json.load(open(a.curriculum)), meta, json.load(open(a.vocab)) if a.vocab else None)
    json.dump(items, open(a.out, 'w'), indent=1, ensure_ascii=False)
    flags = Counter(f for it in items for f in it['flags'])
    print(a.out.split('/')[-1], 'items', len(items), 'clean', sum(1 for it in items if not it['flags']), dict(flags))
