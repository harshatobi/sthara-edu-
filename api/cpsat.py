"""
The timetable solver on Google OR-Tools CP-SAT, as a Vercel Python function (POST /api/cpsat).

It takes the same input the in-browser solver takes (src/lib/schedule/solver.ts: SolverInput) and answers in the
same shape (SolverResult), so the page can use either. This one searches exhaustively: it proves a timetable is the
best there is, or says how close it got, where the in-browser one only improves by trial.

Hard rules (never broken): no teacher, section or room in two places at once (by clock time); teachers' times off
and caps a day, a week, in a row and days in school; a subject at most `maxPerDay` times a day; doubles in
back-to-back periods; the right room; lessons that may never be the last period.
Soft rules (weighed, see WEIGHTS): the class teacher in period 1, subjects spread over the week, teachers' days
without gaps and evenly loaded, morning or afternoon subjects, a subject not straight after another, teachers who
would rather not take the first or last period, no free periods inside a section's day, and (when re-solving)
as few lessons moved as possible.

The function holds no data: the caller's Supabase session is checked, the input is solved, the answer returned.
Run locally with `npm run dev:solver` (serves on 127.0.0.1:8787; next dev forwards /api/cpsat to it).
"""
import json
import math
import os
import re
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

from ortools.sat.python import cp_model

BACK_TO_BACK = 5          # minutes between two lessons that still count as "in a row"
BORROW = 4                # other classes' rooms a split group may borrow when theirs are empty
UNPLACED = 100_000        # cost of one period left unplaced: above any sum of soft costs
LEVEL = [0, 1, 2, 4]      # a priority's level (off, low, normal, high) as a multiplier; normal = 2
# Soft costs at the normal level, before the multiplier.
WEIGHTS = {'classTeacher': 30, 'spreadDay': 18, 'spreadAdjacent': 6, 'gaps': 2, 'balance': 2,
           'timePref': 4, 'edge': 4, 'notAfter': 8, 'studentGap': 20}
MAX_BODY = 4_000_000
MAX_UNITS = 6000


def norm(s):
    return re.sub(r'class|[^a-z0-9]', '', (s or '').lower())


def subj(s):
    return (s or '').strip().lower()


def solve(inp):
    t0 = time.time()
    warnings = []
    sections = {norm(s['cls']): s for s in inp.get('sections', [])}
    display = {k: s['cls'] for k, s in sections.items()}
    days_of = {k: {d['weekday']: d for d in s['days']} for k, s in sections.items()}
    reqs = inp.get('requirements', [])
    req_by_id = {r['id']: r for r in reqs}
    rules = {r['person']: r for r in inp.get('rules', [])}
    defaults = inp.get('defaults', {})
    levels = defaults.get('weights') or {}

    def mult(key):
        lv = levels.get(key, 2)
        return LEVEL[lv] if isinstance(lv, int) and 0 <= lv <= 3 else 2

    def max_day(p):
        v = rules.get(p, {}).get('maxPerDay')
        return v if v is not None else defaults.get('maxPerDay', 7)

    def max_week(p):
        return rules.get(p, {}).get('maxPerWeek')

    def max_run(p):
        v = rules.get(p, {}).get('maxConsecutive')
        return v if v is not None else defaults.get('maxConsecutive', 4)

    def off(p, day, period, iv):
        for u in rules.get(p, {}).get('unavailable', []):
            if u.get('weekday') != day:
                continue
            w = u.get('window')
            if w:
                if w[0] < iv[1] and iv[0] < w[1]:
                    return True
            elif not u.get('periods') or period in u['periods']:
                return True
        return False

    # Clock: a section's own bells, else what any section rings for that period that day, else a band of its own.
    any_time = {}
    for s in sections.values():
        for d in s['days']:
            for p, t in (d.get('times') or {}).items():
                any_time.setdefault((d['weekday'], int(p)), (t[0], t[1]))

    def time_of(sk, day, p):
        d = days_of.get(sk, {}).get(day)
        t = (d.get('times') or {}).get(str(p)) if d else None
        if t is None and d:
            t = (d.get('times') or {}).get(p)
        if t is not None:
            return (t[0], t[1])
        return any_time.get((day, p), (-100_000 + p * 45, -100_000 + p * 45 + 45))

    # Home rooms: only when the school has set its classrooms up.
    rooms = [r for r in inp.get('rooms', []) if r.get('active')]
    home_room = {norm(r['homeClass']): r['id'] for r in rooms if r.get('homeClass')}
    homes_known = len(home_room) > 0

    def home_of(sk):
        return home_room.get(sk, 'home:' + sk)

    def kind_rooms(kind):
        return [r['id'] for r in rooms if r['kind'] == kind and not r.get('homeClass')]

    spare_classrooms = kind_rooms('classroom')
    all_homes = list(dict.fromkeys(home_room.values()))

    # ── Locked lessons: they hold their places and count towards their requirement. ──
    def req_key(cls, subject, group):
        return (norm(cls), subj(subject), (group or '').lower())

    req_by_lesson = {req_key(r['cls'], r['subject'], r.get('group', '')): r for r in reqs}
    locked = inp.get('locked', [])
    locked_cell = {}          # (sk, day, period) -> set of groups ('' = whole class)
    locked_teacher = {}       # (teacher, day) -> set of (a, b)
    locked_room = {}          # room -> list of (day, a, b)
    locked_req = {}           # req id -> lessons
    locked_req_day = {}       # (req id, day) -> occurrences (a double counts once)
    locked_first = set()      # (sk, day, period, teacher)
    locked_subject_at = set() # (sk, day, period, subject)
    seen = set()
    for l in locked:
        ck = norm(l['cls'])
        day, p = l['weekday'], l['period']
        locked_cell.setdefault((ck, day, p), set()).add((l.get('group') or '').lower())
        iv = time_of(ck, day, p)
        if l.get('teacher'):
            locked_teacher.setdefault((l['teacher'], day), set()).add(iv)
            locked_first.add((ck, day, p, l['teacher']))
        locked_subject_at.add((ck, day, p, subj(l['subject'])))
        lr = l.get('roomId') or (home_of(ck) if homes_known else None)
        if lr:
            locked_room.setdefault(lr, []).append((day, iv[0], iv[1]))
        r = req_by_lesson.get(req_key(l['cls'], l['subject'], l.get('group', '')))
        if r:
            locked_req[r['id']] = locked_req.get(r['id'], 0) + 1
            if (r['id'], day, p - 1) not in seen:
                locked_req_day[(r['id'], day)] = locked_req_day.get((r['id'], day), 0) + 1
            seen.add((r['id'], day, p))

    if not homes_known and any(r.get('group') and not r.get('roomId') and not r.get('roomKind') for r in reqs):
        warnings.append("Classrooms aren't set up (Bells & rooms), so split groups without a room are not given one. "
                        "Add each class's home room so the second group gets a free classroom.")

    # ── Units: requirements sharing a combined key are one lesson; otherwise one requirement each. ──
    groups = {}
    for r in reqs:
        if norm(r['cls']) not in sections:
            warnings.append(f"{r['cls']} has no bells set up, so {r['subject']} can't be placed.")
            continue
        k = 'c:' + r['combinedKey'].lower() if r.get('combinedKey') else 'r:' + r['id']
        groups.setdefault(k, []).append(r)
    units = []
    for k, rs in groups.items():
        r = rs[0]
        if k.startswith('c:') and len({x.get('teacher') for x in rs}) > 1:
            warnings.append(f"The combined lesson \"{r['combinedKey']}\" has different teachers in its sections; {r['cls']}'s teacher is used for all.")
        already = min(locked_req.get(x['id'], 0) for x in rs)
        need = max(0, r['periods'] - already)
        doubles = min(r.get('doubles', 0), need // 2)
        for i in range(need - doubles):
            units.append({
                'id': len(units), 'req': r, 'reqIds': [x['id'] for x in rs], 'gkey': k,
                'sections': list(dict.fromkeys(norm(x['cls']) for x in rs)), 'group': (r.get('group') or '').lower(),
                'len': 2 if i < doubles else 1, 'teacher': r.get('teacher'),
                'neverLast': any(x.get('neverLast') for x in rs),
            })
    if len(units) > MAX_UNITS:
        raise ValueError('That is more lessons than one run can place. Solve one wing at a time.')

    def room_pool(u):
        r = u['req']
        if r.get('roomId'):
            return [r['roomId']]
        if r.get('roomKind'):
            return kind_rooms(r['roomKind'])
        if not homes_known:
            return None
        if u['group'] == '':
            return list(dict.fromkeys(home_of(sk) for sk in u['sections']))
        own = home_of(u['sections'][0])
        grade = re.sub(r'[^0-9]', '', u['sections'][0])
        near = sorted((k for k in home_room if home_room[k] != own), key=lambda k: (re.sub(r'[^0-9]', '', k) != grade, k))
        return [own] + spare_classrooms + [home_room[k] for k in near[:BORROW]]

    # ── Positions: where each unit could go, with what makes the rest impossible counted for the explanation. ──
    def shapes(u):
        secs = [sections[k] for k in u['sections']]
        out, why = [], {}

        def no(reason):
            why[reason] = why.get(reason, 0) + 1

        for d in secs[0]['days']:
            day = d['weekday']
            others = [days_of[k].get(day) for k in u['sections'][1:]]
            if any(o is None for o in others):
                continue
            pairs = [tuple(x) for x in d.get('pairs', [])]
            for p in d['periods']:
                if u['len'] == 1:
                    periods = [p]
                else:
                    pr = next((x for x in pairs if x[0] == p), None)
                    if not pr:
                        continue
                    periods = [pr[0], pr[1]]
                if any(not all(q in o['periods'] for q in periods) for o in others):
                    continue
                if u['len'] == 2 and any(tuple(periods) not in [tuple(x) for x in o.get('pairs', [])] for o in others):
                    continue
                ivs = [time_of(u['sections'][0], day, q) for q in periods]
                if len(u['sections']) > 1 and any(time_of(k, day, q) != ivs[i] for i, q in enumerate(periods) for k in u['sections'][1:]):
                    continue
                if u['neverLast'] and any(periods[-1] == days_of[k][day]['periods'][-1] for k in u['sections']):
                    no('never last')
                    continue
                blocked = False
                for q in periods:
                    for sk in u['sections']:
                        g = locked_cell.get((sk, day, q))
                        if g and (u['group'] == '' or '' in g or u['group'] in g):
                            blocked = True
                if blocked:
                    no('section')
                    continue
                t = u['teacher']
                if t:
                    if any(off(t, day, q, ivs[i]) for i, q in enumerate(periods)):
                        no('teacher off')
                        continue
                    if any(a < iv[1] and iv[0] < b for iv in ivs for (a, b) in locked_teacher.get((t, day), ())):
                        no('teacher')
                        continue
                out.append({'day': day, 'start': p, 'periods': periods, 'ivs': ivs})
        return out, why

    model = cp_model.CpModel()
    x = []            # x[u][k]: unit u sits at its k-th position
    pos = []
    static_why = []
    placed = []
    for u in units:
        ps, why = shapes(u)
        pool = room_pool(u)
        u['pool'] = pool
        if pool is not None and not pool:
            why = {'no ' + (u['req'].get('roomKind') or 'named'): len(ps) or 1}
            ps = []
        pos.append(ps)
        static_why.append(why)
        lits = [model.NewBoolVar(f"x{u['id']}_{k}") for k in range(len(ps))]
        x.append(lits)
        b = model.NewBoolVar(f"p{u['id']}")
        model.Add(sum(lits) == b)
        placed.append(b)

    objective = []
    offset = [0]       # constants the objective leaves out, so the reported soft cost starts at zero
    for u in units:
        objective.append((UNPLACED * u['len'], placed[u['id']].Not()))

    # Interchangeable lessons of one requirement: keep them in order (each timetable is then built one way, not n! ways).
    order_key = lambda p: p['day'] * 100 + p['start']
    by_kind = {}
    for u in sorted(units, key=lambda u: -u['len']):
        by_kind.setdefault((u['gkey'], u['len']), []).append(u['id'])
    for ids in by_kind.values():
        for a, b in zip(ids, ids[1:]):
            model.AddImplication(placed[b], placed[a])
            big = 1000
            ea = sum(order_key(p) * x[a][k] for k, p in enumerate(pos[a]))
            eb = sum(order_key(p) * x[b][k] for k, p in enumerate(pos[b]))
            model.Add(ea <= eb + big * (1 - placed[b]))

    # ── A section is in one place at a time (two different groups may share a period). ──
    cells = {}
    for u in units:
        for k, p in enumerate(pos[u['id']]):
            for q in p['periods']:
                for sk in u['sections']:
                    cells.setdefault((sk, p['day'], q), {}).setdefault(u['group'], []).append(x[u['id']][k])
    for groups_here in cells.values():
        whole = groups_here.get('', [])
        named = [g for g in groups_here if g != '']
        if not named:
            if len(whole) > 1:
                model.AddAtMostOne(whole)
        for g in named:
            both = whole + groups_here[g]
            if len(both) > 1:
                model.AddAtMostOne(both)

    # ── Teachers: one lesson at a time, caps a day and a week, runs, days in school. ──
    teachers = sorted({u['teacher'] for u in units if u['teacher']})
    t_day = {}          # (teacher, day) -> [(lit, a, b, unit, k)] one entry per period the lesson covers
    t_units = {}
    for u in units:
        t = u['teacher']
        if not t:
            continue
        t_units.setdefault(t, []).append(u)
        for k, p in enumerate(pos[u['id']]):
            for iv in p['ivs']:
                t_day.setdefault((t, p['day']), []).append((x[u['id']][k], iv[0], iv[1]))
    school_days = sorted({d['weekday'] for s in sections.values() for d in s['days']})
    load_expr = {}
    for t in teachers:
        week = []
        locked_week = 0
        for day in school_days:
            entries = t_day.get((t, day), [])
            fixed = locked_teacher.get((t, day), set())
            locked_week += len(fixed)
            for start in sorted({a for _, a, _ in entries}):
                here = [lit for lit, a, b in entries if a <= start < b]
                if len(here) > 1:
                    model.AddAtMostOne(here)
            load = sum(lit for lit, _, _ in entries)
            load_expr[(t, day)] = (load, len(fixed), len(entries))
            if entries:
                model.Add(load <= max(0, max_day(t) - len(fixed)))
                week.append(load)
            # Runs: any chain of back-to-back periods longer than the cap may not be all taught.
            cap = max_run(t)
            ivs = sorted({(a, b) for _, a, b in entries} | set(fixed))
            if len(ivs) > cap:
                busy = {iv: (sum(lit for lit, a, b in entries if (a, b) == iv), 1 if iv in fixed else 0) for iv in ivs}
                nxt = {iv: [j for j in ivs if 0 <= j[0] - iv[1] <= BACK_TO_BACK] for iv in ivs}
                chains, budget = [], [4000]

                def walk(path):
                    if budget[0] <= 0:
                        return
                    if len(path) == cap + 1:
                        budget[0] -= 1
                        chains.append(list(path))
                        return
                    for j in nxt[path[-1]]:
                        path.append(j)
                        walk(path)
                        path.pop()

                for iv in ivs:
                    walk([iv])
                for chain in chains:
                    const = sum(busy[iv][1] for iv in chain)
                    model.Add(sum(busy[iv][0] for iv in chain) <= cap - const)
        mw = max_week(t)
        if mw is not None and week:
            model.Add(sum(week) <= max(0, mw - locked_week))
        md = rules.get(t, {}).get('maxDays')
        if md:
            used = []
            for day in school_days:
                entries = t_day.get((t, day), [])
                if locked_teacher.get((t, day)):
                    used.append(1)
                elif entries:
                    b = model.NewBoolVar(f'td_{len(used)}_{day}_{teachers.index(t)}')
                    for lit, _, _ in entries:
                        model.AddImplication(lit, b)
                    used.append(b)
            model.Add(sum(used) <= md)

    # ── A subject at most so many times a day (a double counts once). ──
    req_day = {}
    for u in units:
        for k, p in enumerate(pos[u['id']]):
            for rid in u['reqIds']:
                req_day.setdefault((rid, p['day']), []).append(x[u['id']][k])
    for (rid, day), lits in req_day.items():
        cap = req_by_id[rid].get('maxPerDay', 1) - locked_req_day.get((rid, day), 0)
        if len(lits) > cap:
            model.Add(sum(lits) <= max(0, cap))

    # ── Rooms: each lesson that needs one gets one, and a room holds one lesson at a time. ──
    DAY = 1_000_000
    SHIFT = 200_000
    room_intervals = {}
    room_choice = {}       # unit id -> {room: literal}
    # A class's own room needs no bookkeeping while only its own whole-class lessons use it (the section rule covers them).
    contested = set(locked_room)
    for u in units:
        pool = u['pool'] or []
        if len(pool) != 1 or u['group'] != '' or u['req'].get('roomId') or u['req'].get('roomKind'):
            contested.update(pool)
    for u in units:
        pool = u['pool']
        ps = pos[u['id']]
        if not pool or not ps:
            continue
        if len(pool) == 1 and pool[0] not in contested:
            room_choice[u['id']] = {pool[0]: placed[u['id']]}
            continue
        uid = u['id']
        starts = [p['day'] * DAY + p['ivs'][0][0] + SHIFT for p in ps]
        ends = [p['day'] * DAY + p['ivs'][-1][1] + SHIFT for p in ps]
        s = model.NewIntVar(0, max(ends), f's{uid}')
        e = model.NewIntVar(0, max(ends), f'e{uid}')
        d = model.NewIntVar(0, max(b - a for a, b in zip(starts, ends)), f'd{uid}')
        model.Add(s == sum(v * x[uid][k] for k, v in enumerate(starts)))
        model.Add(e == sum(v * x[uid][k] for k, v in enumerate(ends)))
        model.Add(d == e - s)
        if len(pool) == 1:
            choice = {pool[0]: placed[uid]}
        else:
            choice = {r: model.NewBoolVar(f'y{uid}_{i}') for i, r in enumerate(pool)}
            model.Add(sum(choice.values()) == placed[uid])
        room_choice[uid] = choice
        for r, lit in choice.items():
            room_intervals.setdefault(r, []).append(model.NewOptionalIntervalVar(s, d, e, lit, f'i{uid}_{len(room_intervals.get(r, []))}'))
    for r, ivs in room_intervals.items():
        fixed = [model.NewIntervalVar(day * DAY + a + SHIFT, b - a, day * DAY + b + SHIFT, f'l{r}_{i}')
                 for i, (day, a, b) in enumerate(locked_room.get(r, [])) if b > a]
        if len(ivs) + len(fixed) > 1:
            model.AddNoOverlap(ivs + fixed)

    # ── Soft rules ──────────────────────────────────────────────────────────
    first_period = {(sk, d['weekday']): d['periods'][0] for sk, s in sections.items() for d in s['days'] if d['periods']}
    last_period = {(sk, d['weekday']): d['periods'][-1] for sk, s in sections.items() for d in s['days'] if d['periods']}

    # The class teacher takes period 1.
    w = WEIGHTS['classTeacher'] * mult('classTeacher') // 2
    if defaults.get('classTeacherFirst') and w:
        for sk, s in sections.items():
            ct = s.get('classTeacher')
            if not ct:
                continue
            theirs = sum(1 for u in units if u['teacher'] == ct and sk in u['sections']) + sum(1 for l in locked if norm(l['cls']) == sk and l.get('teacher') == ct)
            if theirs < len(s['days']):
                warnings.append(f"{s['cls']}: the class teacher has {theirs} lesson{'' if theirs == 1 else 's'} a week with the class, so can't take period 1 on all {len(s['days'])} days.")
            for d in s['days']:
                fp = first_period.get((sk, d['weekday']))
                if fp is None or (sk, d['weekday'], fp, ct) in locked_first:
                    continue
                lits = [x[u['id']][k] for u in units if u['teacher'] == ct and sk in u['sections']
                        for k, p in enumerate(pos[u['id']]) if p['day'] == d['weekday'] and fp in p['periods']]
                if not lits:
                    continue
                miss = model.NewBoolVar('ct')
                model.Add(miss + sum(lits) >= 1)
                objective.append((w, miss))

    # A subject spread across the week.
    ws, wa = WEIGHTS['spreadDay'] * mult('spread') // 2, WEIGHTS['spreadAdjacent'] * mult('spread') // 2
    if defaults.get('spread') and ws:
        by_req = {}
        for u in units:
            by_req.setdefault(u['req']['id'], []).append(u)
        for rid, us in by_req.items():
            if len(us) < 2:
                continue
            day_lits = {}
            for u in us:
                for k, p in enumerate(pos[u['id']]):
                    day_lits.setdefault(p['day'], []).append(x[u['id']][k])
            used = {}
            offset[0] += ws * min(len(us), 6, len(day_lits))
            for day, lits in day_lits.items():
                b = model.NewBoolVar('sd')
                model.Add(b <= sum(lits))
                for lit in lits:
                    model.AddImplication(lit, b)
                used[day] = b
                objective.append((-ws, b))
            if len(us) <= 3:
                for day in used:
                    if day + 1 in used:
                        adj = model.NewBoolVar('sa')
                        model.Add(adj >= used[day] + used[day + 1] - 1)
                        objective.append((wa, adj))

    # Teachers' days: no idle periods between lessons, and no day far above the average.
    wg, wb = WEIGHTS['gaps'] * mult('gaps') // 2, WEIGHTS['balance'] * mult('balance') // 2
    day_grid = {}
    for sk, s in sections.items():
        for d in s['days']:
            g = day_grid.setdefault(d['weekday'], set())
            for p in d['periods']:
                g.add(time_of(sk, d['weekday'], p))
    for t in teachers:
        total = sum(u['len'] for u in t_units[t]) + sum(len(v) for (who, _), v in locked_teacher.items() if who == t)
        days_in = [d for d in school_days if t_day.get((t, d)) or locked_teacher.get((t, d))]
        avg = math.ceil(total / max(1, len(days_in)))
        for day in days_in:
            entries = t_day.get((t, day), [])
            fixed = locked_teacher.get((t, day), set())
            if wb and entries:
                load, const, top = load_expr[(t, day)]
                over = model.NewIntVar(0, top + const, 'ov')
                model.Add(over >= load + const - avg)
                objective.append((wb, over))
            if not wg:
                continue
            grid = sorted(day_grid.get(day, ()))
            busy = []
            for (a, b) in grid:
                if any(fa < b and a < fb for fa, fb in fixed):
                    busy.append(1)
                    continue
                lits = [lit for lit, la, lb in entries if la < b and a < lb]
                if not lits:
                    busy.append(0)
                    continue
                v = model.NewBoolVar('b')
                model.Add(v <= sum(lits))
                for lit in lits:
                    model.AddImplication(lit, v)
                busy.append(v)
            n = len(grid)
            pre, suf = [0] * n, [0] * n
            for i in range(1, n):
                if isinstance(pre[i - 1], int) and isinstance(busy[i - 1], int):
                    pre[i] = max(pre[i - 1], busy[i - 1])
                else:
                    v = model.NewBoolVar('pr')
                    model.Add(v >= pre[i - 1])
                    model.Add(v >= busy[i - 1])
                    pre[i] = v
            for i in range(n - 2, -1, -1):
                if isinstance(suf[i + 1], int) and isinstance(busy[i + 1], int):
                    suf[i] = max(suf[i + 1], busy[i + 1])
                else:
                    v = model.NewBoolVar('su')
                    model.Add(v >= suf[i + 1])
                    model.Add(v >= busy[i + 1])
                    suf[i] = v
            for i in range(1, n - 1):
                if isinstance(busy[i], int) and busy[i] == 1:
                    continue
                if isinstance(pre[i], int) and pre[i] == 0 or isinstance(suf[i], int) and suf[i] == 0:
                    continue
                gap = model.NewBoolVar('g')
                model.Add(gap >= pre[i] + suf[i] - 1 - busy[i])
                objective.append((wg, gap))

    # Position costs: morning or afternoon subjects, teachers who'd rather not open or close the day.
    wt, we = WEIGHTS['timePref'] * mult('prefs') // 2, WEIGHTS['edge'] * mult('prefs') // 2
    for u in units:
        pref = u['req'].get('timePref')
        rule = rules.get(u['teacher'], {}) if u['teacher'] else {}
        for k, p in enumerate(pos[u['id']]):
            cost = 0
            sk = u['sections'][0]
            periods = days_of[sk][p['day']]['periods']
            i = periods.index(p['periods'][0])
            half = len(periods) / 2
            if pref == 'morning' and i >= math.ceil(half):
                cost += wt
            if pref == 'afternoon' and i < math.floor(half):
                cost += wt
            if rule.get('avoidFirst') and first_period.get((sk, p['day'])) in p['periods']:
                cost += we
            if rule.get('avoidLast') and last_period.get((sk, p['day'])) in p['periods']:
                cost += we
            if cost:
                objective.append((cost, x[u['id']][k]))

    # A subject not straight after another (Mathematics after Physical Education).
    wn = WEIGHTS['notAfter'] * mult('prefs') // 2
    if wn:
        covering = {}       # (sk, day, period, subject) -> lits covering it
        starting = {}       # (req id, sk, day, period) -> lits starting there
        for u in units:
            for k, p in enumerate(pos[u['id']]):
                for sk in u['sections']:
                    for q in p['periods']:
                        covering.setdefault((sk, p['day'], q, subj(u['req']['subject'])), []).append(x[u['id']][k])
                    for rid in u['reqIds']:
                        starting.setdefault((rid, sk, p['day'], p['periods'][0]), []).append(x[u['id']][k])
        for r in reqs:
            after = subj(r.get('notAfter') or '')
            sk = norm(r['cls'])
            if not after or sk not in sections:
                continue
            for d in sections[sk]['days']:
                for a, b in zip(d['periods'], d['periods'][1:]):
                    mine = starting.get((r['id'], sk, d['weekday'], b), [])
                    if not mine:
                        continue
                    const = 1 if (sk, d['weekday'], a, after) in locked_subject_at else 0
                    theirs = covering.get((sk, d['weekday'], a, after), [])
                    if not const and not theirs:
                        continue
                    v = model.NewBoolVar('na')
                    model.Add(v >= sum(mine) + sum(theirs) + const - 1)
                    objective.append((wn, v))

    # No free period inside a section's day: lessons run from period 1 with free periods only at the end.
    wsg = WEIGHTS['studentGap'] * mult('prefs') // 2
    if defaults.get('noStudentGaps') and wsg:
        for sk, s in sections.items():
            for d in s['days']:
                occ = []
                for p in d['periods']:
                    if locked_cell.get((sk, d['weekday'], p)):
                        occ.append(1)
                        continue
                    lits = [lit for g in cells.get((sk, d['weekday'], p), {}).values() for lit in g]
                    if not lits:
                        occ.append(0)
                        continue
                    v = model.NewBoolVar('o')
                    model.Add(v <= sum(lits))
                    for lit in lits:
                        model.AddImplication(lit, v)
                    occ.append(v)
                for a, b in zip(occ, occ[1:]):
                    if isinstance(a, int) and a == 1 or isinstance(b, int) and b == 0:
                        continue
                    hole = model.NewBoolVar('h')
                    model.Add(hole >= b - a)
                    objective.append((wsg, hole))

    # Re-solving: keep each lesson where the timetable had it, and start the search from there.
    start = inp.get('start') or []
    stay = int(inp.get('stability') or 0)
    seed_lessons = inp.get('hint') or start
    by_req_start = {}
    for l in start:
        r = req_by_lesson.get(req_key(l['cls'], l['subject'], l.get('group', '')))
        if r:
            by_req_start.setdefault(r['id'], []).append((l['weekday'], l['period']))
    if seed_lessons:
        was, was_room = {}, {}
        for l in seed_lessons:
            if l.get('locked'):
                continue
            r = req_by_lesson.get(req_key(l['cls'], l['subject'], l.get('group', '')))
            if r:
                was.setdefault(r['id'], set()).add((l['weekday'], l['period']))
                was_room[(r['id'], l['weekday'], l['period'])] = l.get('roomId') or home_of(norm(l['cls']))
        hinted = set()
        fixes = []
        for (gkey, ln), ids in by_kind.items():
            first = units[ids[0]]
            cells_was = was.get(first['req']['id'], set())
            # Doubles claim their pairs first; a single never takes half of a pair a double could use.
            options = sorted((k for k, p in enumerate(pos[ids[0]]) if all((p['day'], q) in cells_was for q in p['periods'])),
                             key=lambda k: order_key(pos[ids[0]][k]))
            used_cells = set()
            n = 0
            for k in options:
                p = pos[ids[0]][k]
                if n >= len(ids) or any((p['day'], q) in used_cells or (first['req']['id'], p['day'], q, 'x') in hinted for q in p['periods']):
                    continue
                uid = ids[n]
                n += 1
                for q in p['periods']:
                    used_cells.add((p['day'], q))
                    hinted.add((first['req']['id'], p['day'], q, 'x'))
                for k2, lit in enumerate(x[uid]):
                    fixes.append((lit, 1 if k2 == k else 0))
                want = was_room.get((first['req']['id'], p['day'], p['periods'][0]))
                choice = room_choice.get(uid, {})
                if len(choice) > 1:
                    pick = want if want in choice else next(iter(choice))
                    for r, lit in choice.items():
                        fixes.append((lit, 1 if r == pick else 0))
            for uid in ids[n:]:
                for lit in x[uid]:
                    fixes.append((lit, 0))
    if start:
        if stay:
            for (gkey, ln), ids in by_kind.items():
                rid = units[ids[0]]['req']['id']
                cells_was = set(by_req_start.get(rid, []))
                spots = {}
                for uid in ids:
                    for k, p in enumerate(pos[uid]):
                        if all((p['day'], q) in cells_was for q in p['periods']):
                            spots.setdefault((p['day'], p['start']), []).append(x[uid][k])
                for lits in spots.values():
                    moved = model.NewBoolVar('mv')
                    model.Add(moved + sum(lits) >= 1)
                    objective.append((stay * ln, moved))

    model.Minimize(sum(c * v for c, v in objective))
    limit = max(1.0, min(110.0, (inp.get('timeLimitMs') or 15000) / 1000.0))
    workers = max(1, min(8, int(os.environ.get('SOLVER_WORKERS', os.cpu_count() or 2))))

    # Warm start: pin the lessons to the timetable handed in, let the solver fill in everything that follows from it
    # (a second or two), and give the whole of that to the real search as its first solution. A start with only the
    # lessons' places named is often never completed, and the search then begins from nothing.
    started = False
    if seed_lessons and fixes:
        pinned = model.Clone()
        for lit, v in fixes:
            pinned.Add(pinned.GetBoolVarFromProtoIndex(lit.Index()) == v)
        first = cp_model.CpSolver()
        first.parameters.max_time_in_seconds = max(1.0, min(limit / 4, 15.0))
        first.parameters.num_search_workers = workers
        first.parameters.stop_after_first_solution = True
        if first.Solve(pinned) in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            values = first.ResponseProto().solution
            hint = model.Proto().solution_hint
            for i, v in enumerate(values):
                hint.vars.append(i)
                hint.values.append(v)
            started = True
        else:
            for lit, v in fixes:
                model.AddHint(lit, v)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(1.0, limit - (time.time() - t0))
    solver.parameters.num_search_workers = workers
    solver.parameters.random_seed = int(inp.get('seed') or 1) % 2_000_000_000
    status = solver.Solve(model)
    status_name = {cp_model.OPTIMAL: 'optimal', cp_model.FEASIBLE: 'feasible', cp_model.INFEASIBLE: 'infeasible'}.get(status, 'unknown')
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError('The solver found no timetable in the time given. Give it more time.')

    # ── Result ──
    lessons = [dict(l, locked=True) for l in locked]
    where = {}
    teacher_busy, section_busy, room_busy = {}, {}, {}
    for u in units:
        uid = u['id']
        k = next((k for k, lit in enumerate(x[uid]) if solver.Value(lit)), None)
        if k is None:
            continue
        p = pos[uid][k]
        room = next((r for r, lit in room_choice.get(uid, {}).items() if solver.Value(lit)), None)
        where[uid] = (p, room)
        for i, q in enumerate(p['periods']):
            if u['teacher']:
                teacher_busy.setdefault((u['teacher'], p['day']), []).append(p['ivs'][i])
            if room:
                room_busy.setdefault((room, p['day']), []).append(p['ivs'][i])
            for sk in u['sections']:
                section_busy.setdefault((sk, p['day'], q), set()).add(u['group'])
                r = next((req_by_id[i2] for i2 in u['reqIds'] if norm(req_by_id[i2]['cls']) == sk), u['req'])
                room_id = None if (not room or room.startswith('home:') or room == home_room.get(sk)) else room
                lessons.append({'cls': display.get(sk, r['cls']), 'group': r.get('group') or '', 'subject': u['req']['subject'],
                                'weekday': p['day'], 'period': q, 'teacher': u['teacher'], 'roomId': room_id, 'combined': len(u['sections']) > 1})

    REASONS = {
        'teacher': 'The teacher is teaching elsewhere at every free period.',
        'teacher off': 'The teacher is off at the periods the section is free.',
        'teacher cap': 'The teacher would go over their caps (periods a day, a week, in a row, or days in school).',
        'per day': 'The subject already meets as often as allowed on every free day.',
        'section': 'The section is full at every period the teacher is free.',
        'never last': 'It may not be the last period, and no other period is free.',
        'busy': 'Every free period clashes with another lesson.',
        'free': 'It ran out of time; run again with more time.',
        'proved': 'No timetable can fit it with the rules as they are. Loosen a cap, a time off or the periods asked for.',
    }

    def explain(u):
        ps = pos[u['id']]
        counts = dict(static_why[u['id']])
        for p in ps:
            why = 'free'
            for i, q in enumerate(p['periods']):
                for sk in u['sections']:
                    g = section_busy.get((sk, p['day'], q))
                    if g and (u['group'] == '' or '' in g or u['group'] in g):
                        why = 'section'
                if why == 'free' and u['teacher'] and any(a < p['ivs'][i][1] and p['ivs'][i][0] < b for a, b in teacher_busy.get((u['teacher'], p['day']), [])):
                    why = 'teacher'
            if why == 'free' and u['teacher']:
                n = len(teacher_busy.get((u['teacher'], p['day']), [])) + len(locked_teacher.get((u['teacher'], p['day']), ()))
                if n + u['len'] > max_day(u['teacher']):
                    why = 'teacher cap'
            if why == 'free' and u['pool'] and all(any(a < iv[1] and iv[0] < b for iv in p['ivs'] for a, b in room_busy.get((r, p['day']), [])) for r in u['pool']):
                why = 'room'
            counts[why] = counts.get(why, 0) + 1
        if not ps and not counts:
            return 'No two back-to-back periods without a break in between.' if u['len'] == 2 else 'The section has no teaching periods.'
        top = max(counts.items(), key=lambda kv: kv[1])[0]
        if top.startswith('no '):
            return f"The school has no {top[3:]} room set up (Bells & rooms)."
        if top == 'room':
            r = u['req']
            if r.get('roomKind') or r.get('roomId'):
                return f"Every {r.get('roomKind') or 'named'} room is taken at the free periods."
            return 'No classroom is free for this group at the free periods.' if u['group'] else "The class's room is in use by another group at the free periods."
        if top == 'free':
            top = 'proved' if status == cp_model.OPTIMAL else 'free'
        return REASONS.get(top, 'No free period fits.')

    unplaced = {}
    for u in units:
        if u['id'] in where:
            continue
        r = u['req']
        e = unplaced.setdefault(r['id'], {'requirementId': r['id'], 'cls': r['cls'], 'subject': r['subject'], 'group': r.get('group') or '', 'periods': 0, 'reason': explain(u)})
        e['periods'] += u['len']
    unplaced_periods = sum(e['periods'] for e in unplaced.values())
    soft = max(0, round(solver.ObjectiveValue()) + offset[0] - UNPLACED * unplaced_periods)
    bound = solver.BestObjectiveBound()
    return {
        'lessons': lessons,
        'unplaced': list(unplaced.values()),
        'score': {'total': unplaced_periods * 1000 + soft, 'soft': {'all': soft}},
        'stats': {'units': len(units), 'placed': len(where), 'iterations': int(solver.NumBranches()), 'ms': int((time.time() - t0) * 1000), 'moved': 0},
        'warnings': warnings,
        'engine': 'cpsat',
        'proof': {'status': status_name, 'gap': max(0, round(solver.ObjectiveValue() - bound)), 'warmStart': started},
    }


# ── HTTP ────────────────────────────────────────────────────────────────────
def signed_in(authorization):
    """The caller's Supabase session, checked with Supabase itself (the function holds no secret of its own)."""
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') or os.environ.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    if not url or not key:
        return os.environ.get('SOLVER_DEV') == '1'      # local dev without the env file: the dev server only
    if not authorization or not authorization.lower().startswith('bearer '):
        return False
    try:
        req = urllib.request.Request(url.rstrip('/') + '/auth/v1/user', headers={'Authorization': authorization, 'apikey': key})
        with urllib.request.urlopen(req, timeout=8) as res:
            return res.status == 200 and bool(json.loads(res.read()).get('id'))
    except Exception:
        return False


class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {'ok': True, 'engine': 'cpsat'})

    def do_POST(self):
        try:
            if not signed_in(self.headers.get('Authorization')):
                return self._send(401, {'error': 'Your session has expired. Sign in again.'})
            n = int(self.headers.get('Content-Length') or 0)
            if n <= 0 or n > MAX_BODY:
                return self._send(413, {'error': 'That timetable is too large for one run.'})
            inp = json.loads(self.rfile.read(n))
            if not isinstance(inp, dict) or not isinstance(inp.get('sections'), list) or not isinstance(inp.get('requirements'), list):
                return self._send(400, {'error': 'Invalid request.'})
            self._send(200, {'ok': True, 'result': solve(inp)})
        except (ValueError, RuntimeError) as e:
            self._send(422, {'error': str(e)})
        except Exception as e:     # noqa: BLE001 - the page falls back to the in-browser solver on any failure
            print('[cpsat]', repr(e))
            self._send(500, {'error': 'The solver stopped unexpectedly.'})

    def log_message(self, *_):
        pass


if __name__ == '__main__':
    os.environ.setdefault('SOLVER_DEV', '1')
    port = int(os.environ.get('SOLVER_PORT', '8787'))
    print(f'cpsat: listening on http://127.0.0.1:{port}')
    HTTPServer(('127.0.0.1', port), handler).serve_forever()
