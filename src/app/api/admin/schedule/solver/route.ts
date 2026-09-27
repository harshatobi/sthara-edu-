import { NextResponse, type NextRequest } from 'next/server';
import { bad, deny, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { isSession, sessionOf } from '@/lib/admin/format';
import { displayClass, normClass } from '@/lib/teacher/scope';
import { findClashes } from '@/lib/schedule/engine';
import { cleanSlot, dbError, roomIds, staffIds } from '@/lib/schedule/server';
import { personCols, type Slot } from '@/lib/schedule/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The auto-solver's inputs, and saving what it built.
 *   PUT  { entity: 'settings', defaultTargetPerWeek, defaultMaxPerDay, defaultMaxConsecutive, classTeacherFirst, subjectSpread }  (schedule.academic)
 *   PUT  { entity: 'requirement', id?, session?, class, subject, groupLabel?, teacher?, periodsPerWeek, doubles?, roomKind?, roomId?, maxPerDay?, combinedKey?, notes? }  (schedule.academic)
 *   PUT  { entity: 'rule', person, targetPerWeek?, maxPerDay?, maxPerWeek?, maxConsecutive?, unavailable? }  (schedule.academic or schedule.workforce)
 *   POST { action: 'fill', session?, rows: [requirement...], replace?: boolean }   a whole sheet at once (replace clears the session's first)
 *   POST { action: 'save', name, session?, lessons: Slot[] (with locked), report }  the solver's timetable as a new draft
 *   DELETE { entity: 'requirement' | 'rule', id }
 * The solver itself runs in the browser; the server checks what it saves (staff, rooms, clashes) like any import.
 */
const ROOM_KINDS = ['classroom', 'lab', 'hall', 'library', 'ground', 'other'];
const int = (v: unknown, lo: number, hi: number): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : NaN;
};

/** One requirement from a request body, checked; a message when it isn't valid. */
function cleanRequirement(b: Record<string, unknown>, staff: Set<string>, rooms: Set<string>) {
  const cls = displayClass(str(b.class, 40));
  if (!normClass(cls)) return 'Pick the section.';
  const subject = str(b.subject, 80);
  if (!subject) return 'Name the subject.';
  const periods = int(b.periodsPerWeek, 1, 20);
  if (periods === null || Number.isNaN(periods)) return `${cls} ${subject}: periods a week is 1 to 20.`;
  const doubles = int(b.doubles ?? 0, 0, 10);
  if (doubles === null || Number.isNaN(doubles) || doubles * 2 > periods) return `${cls} ${subject}: at most ${Math.floor(periods / 2)} double periods.`;
  const maxPerDay = int(b.maxPerDay ?? 1, 1, 4);
  if (maxPerDay === null || Number.isNaN(maxPerDay)) return `${cls} ${subject}: times a day is 1 to 4.`;
  const teacher = typeof b.teacher === 'string' && b.teacher ? b.teacher : null;
  if (teacher && !staff.has(teacher)) return `${cls} ${subject}: that teacher isn't on this school's staff.`;
  const roomKind = typeof b.roomKind === 'string' && b.roomKind ? b.roomKind : null;
  if (roomKind && !ROOM_KINDS.includes(roomKind)) return 'Unknown room kind.';
  const roomId = typeof b.roomId === 'string' && b.roomId ? b.roomId : null;
  if (roomId && !rooms.has(roomId)) return 'That room isn\'t in this school.';
  return {
    class: cls, subject, group_label: str(b.groupLabel, 40), ...(teacher ? personCols(teacher) : { user_id: null, staff_member_id: null }),
    periods_per_week: periods, doubles, room_kind: roomKind, room_id: roomId, max_per_day: maxPerDay,
    combined_key: str(b.combinedKey, 40) || null, notes: str(b.notes, 500) || null,
  };
}
const asRow = (r: Exclude<ReturnType<typeof cleanRequirement>, string>) => {
  const { user_id, ...rest } = r;
  return { ...rest, teacher_id: user_id };
};

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ['schedule.academic', 'schedule.workforce']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const now = new Date().toISOString();

  if (b.entity === 'rule') {
    const [staff] = await Promise.all([staffIds(db, admin.schoolId)]);
    const person = String(b.person || '');
    if (!staff.has(person)) return bad('Pick a member of staff.');
    const fields = { target_per_week: int(b.targetPerWeek, 0, 60), max_per_day: int(b.maxPerDay, 1, 12), max_per_week: int(b.maxPerWeek, 1, 60), max_consecutive: int(b.maxConsecutive, 1, 12) };
    if (Object.values(fields).some(v => Number.isNaN(v))) return bad('Target 0-60 a week; caps 1-12 a day, 1-60 a week, 1-12 in a row.');
    if (fields.max_per_week !== null && fields.max_per_day !== null && fields.max_per_week < fields.max_per_day) return bad('The weekly cap is below the daily cap.');
    const unavailable = (Array.isArray(b.unavailable) ? b.unavailable : []).slice(0, 14).map((u: { weekday?: unknown; periods?: unknown }) => ({
      weekday: Number(u?.weekday), periods: [...new Set((Array.isArray(u?.periods) ? u.periods : []).map(Number))].filter(p => Number.isInteger(p) && p >= 1 && p <= 16).sort((x, y) => x - y),
    }));
    if (unavailable.some((u: { weekday: number }) => !Number.isInteger(u.weekday) || u.weekday < 1 || u.weekday > 7)) return bad('Pick the days they are not in.');
    const cols = personCols(person);
    const col = cols.user_id ? 'user_id' : 'staff_member_id';
    const row: Record<string, unknown> = { school_id: admin.schoolId, ...cols, ...fields, unavailable, updated_by: admin.id, updated_at: now };
    const { data: existing } = await db.from('teacher_load_rules').select('id').eq(col, cols.user_id ?? cols.staff_member_id).maybeSingle();
    const { error } = existing ? await db.from('teacher_load_rules').update(row).eq('id', existing.id) : await db.from('teacher_load_rules').insert(row);
    return error ? dbError(error, 'Could not save their load.') : NextResponse.json({ ok: true });
  }

  // Everything else is the timetable builder's.
  const denied = deny(admin, 'schedule.academic');
  if (denied) return denied;

  if (b.entity === 'settings') {
    const row = {
      school_id: admin.schoolId,
      default_target_per_week: int(b.defaultTargetPerWeek ?? 30, 1, 60), default_max_per_day: int(b.defaultMaxPerDay ?? 7, 1, 12),
      default_max_consecutive: int(b.defaultMaxConsecutive ?? 4, 1, 12), class_teacher_first: b.classTeacherFirst !== false, subject_spread: b.subjectSpread !== false,
      updated_by: admin.id, updated_at: now,
    };
    if ([row.default_target_per_week, row.default_max_per_day, row.default_max_consecutive].some(v => v === null || Number.isNaN(v))) return bad('Target 1-60 a week, at most 1-12 a day and 1-12 in a row.');
    const { error } = await db.from('sched_solver_settings').upsert(row, { onConflict: 'school_id' });
    return error ? dbError(error, 'Could not save the rules.') : NextResponse.json({ ok: true });
  }

  if (b.entity === 'requirement') {
    const [staff, rooms] = await Promise.all([staffIds(db, admin.schoolId), roomIds(db, admin.schoolId)]);
    const r = cleanRequirement(b, staff, rooms);
    if (typeof r === 'string') return bad(r);
    const session = isSession(b.session) ? b.session : sessionOf();
    const row: Record<string, unknown> = { school_id: admin.schoolId, session, ...asRow(r), updated_by: admin.id, updated_at: now };
    const { error } = isUuid(b.id)
      ? await db.from('sched_requirements').update(row).eq('id', b.id).eq('school_id', admin.schoolId)
      : await db.from('sched_requirements').insert(row);
    if (error?.code === '23505') return bad(`${r.class} already has ${r.subject}${r.group_label ? ` (${r.group_label})` : ''}. Edit that row instead.`, 409);
    return error ? dbError(error, 'Could not save the requirement.') : NextResponse.json({ ok: true });
  }
  return bad('Unknown item.');
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const session = isSession(b.session) ? b.session : sessionOf();
  const [staff, rooms] = await Promise.all([staffIds(db, admin.schoolId), roomIds(db, admin.schoolId)]);

  if (b.action === 'fill') {
    const raw = Array.isArray(b.rows) ? b.rows.slice(0, 2000) : [];
    if (!raw.length) return bad('There is nothing to add.');
    const rows = [];
    const seen = new Set<string>();
    for (const x of raw) {
      const r = cleanRequirement(x ?? {}, staff, rooms);
      if (typeof r === 'string') return bad(r);
      const k = `${normClass(r.class)}|${r.subject.toLowerCase()}|${r.group_label}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ school_id: admin.schoolId, session, ...asRow(r), updated_by: admin.id });
    }
    // Replacing: keep a copy of the sheet so a failure part-way puts it back rather than leaving it empty or partial.
    let backup: Record<string, unknown>[] | null = null;
    if (b.replace) {
      const { data: old, error: readErr } = await db.from('sched_requirements').select('*').eq('school_id', admin.schoolId).eq('session', session);
      if (readErr) return dbError(readErr, 'Could not read the sheet.');
      backup = (old || []).map(r => { const x: Record<string, unknown> = { ...r }; delete x.class_key; return x; });
      const { error } = await db.from('sched_requirements').delete().eq('school_id', admin.schoolId).eq('session', session);
      if (error) return dbError(error, 'Could not clear the sheet.');
    } else {
      // Keep what's there: only add sections and subjects the sheet doesn't have yet.
      const { data: have } = await db.from('sched_requirements').select('class_key, subject, group_label').eq('school_id', admin.schoolId).eq('session', session);
      const known = new Set((have || []).map(h => `${h.class_key}|${h.subject.toLowerCase()}|${h.group_label}`));
      for (let i = rows.length - 1; i >= 0; i--) if (known.has(`${normClass(rows[i].class)}|${rows[i].subject.toLowerCase()}|${rows[i].group_label}`)) rows.splice(i, 1);
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('sched_requirements').insert(rows.slice(i, i + 500));
      if (error) {
        if (backup) {
          await db.from('sched_requirements').delete().eq('school_id', admin.schoolId).eq('session', session);
          for (let j = 0; j < backup.length; j += 500) {
            const { error: e } = await db.from('sched_requirements').insert(backup.slice(j, j + 500));
            if (e) console.error('[solver] could not restore the requirements sheet after a failed replace:', e.message);
          }
        }
        return dbError(error, backup ? 'Could not save the requirements. The sheet is as it was.' : 'Could not save the requirements.');
      }
    }
    return NextResponse.json({ ok: true, added: rows.length });
  }

  if (b.action === 'save') {
    const name = str(b.name, 80);
    if (!name) return bad('Name the timetable.');
    const raw = Array.isArray(b.lessons) ? b.lessons : [];
    if (!raw.length) return bad('The solver placed no lessons.');
    if (raw.length > 6000) return bad('That is over 6000 lessons.');
    const slots: (Slot & { locked: boolean })[] = [];
    for (const r of raw) {
      const s = cleanSlot(r, staff, rooms);
      if (typeof s === 'string') return bad(s);
      slots.push({ ...s, locked: !!r?.locked });
    }
    const { data: roomRows } = await db.from('rooms').select('id, name, kind, capacity, home_class, active').eq('school_id', admin.schoolId);
    const clashes = findClashes(slots, roomRows || []);
    if (clashes.length) return bad(`The solver's timetable has ${clashes.length} clash${clashes.length === 1 ? '' : 'es'}; it was not saved. Run it again.`, 409);
    const reportText = b.report && typeof b.report === 'object' ? JSON.stringify(b.report) : null;
    const report = !reportText ? null : reportText.length <= 20000 ? JSON.parse(reportText) : { truncated: true, score: b.report.score ?? null, stats: b.report.stats ?? null };
    const { data: v, error } = await db.from('timetable_versions').insert({
      school_id: admin.schoolId, session, name, status: 'draft', source: 'solver', created_by: admin.id, solver_report: report, notes: str(b.notes, 2000) || null,
    }).select('id').single();
    if (error) return dbError(error, 'Could not create the timetable.');
    for (let i = 0; i < slots.length; i += 500) {
      const { error: e } = await db.from('timetable_slots').insert(slots.slice(i, i + 500).map(s => ({ ...s, version_id: v.id, school_id: admin.schoolId })));
      if (e) { await db.from('timetable_versions').delete().eq('id', v.id); return dbError(e, 'Could not save the lessons.'); }
    }
    return NextResponse.json({ ok: true, id: v.id, lessons: slots.length });
  }
  return bad('Unknown action.');
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ['schedule.academic', 'schedule.workforce']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.id)) return bad('Pick something to remove.');
  if (b.entity === 'requirement') {
    const denied = deny(admin, 'schedule.academic');
    if (denied) return denied;
    const { error } = await db.from('sched_requirements').delete().eq('id', b.id).eq('school_id', admin.schoolId);
    return error ? dbError(error, 'Could not remove it.') : NextResponse.json({ ok: true });
  }
  if (b.entity === 'rule') {
    const { error } = await db.from('teacher_load_rules').delete().eq('id', b.id).eq('school_id', admin.schoolId);
    return error ? dbError(error, 'Could not remove it.') : NextResponse.json({ ok: true });
  }
  return bad('Unknown item.');
}
