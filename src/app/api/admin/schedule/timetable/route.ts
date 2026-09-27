import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bad, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { fmtDate, isoDay, isSession, sessionOf } from '@/lib/admin/format';
import { normaliseSubject } from '@/lib/curriculum';
import { defaultTerm } from '@/lib/teacher/course';
import { displayClass, normClass, teachingScope } from '@/lib/teacher/scope';
import { findClashes, minutes, periodsPerWeek, wingOf } from '@/lib/schedule/engine';
import { guessRoomKind } from '@/lib/schedule/importer';
import { cleanSlot, dbError, roomIds, staffIds } from '@/lib/schedule/server';
import { DAY_NAMES, type Slot } from '@/lib/schedule/types';

export const dynamic = 'force-dynamic';

/**
 * Timetable versions and their lessons (schedule.academic).
 *   POST   { action: 'create', name, session?, copyFrom? }          a new draft, empty or copied from another version
 *   POST   { action: 'import', name, slots: Slot[] (room_name for new rooms), newRooms: [{ name, kind }] }
 *   POST   { action: 'publish', id, effectiveFrom }                  refuses while there are clashes; sets pacing; tells each teacher
 *   POST   { action: 'archive', id }                                 retire a published timetable
 *   PATCH  { action: 'rename', id, name, notes? }
 *   PUT    { action: 'cell', versionId, class, weekday, period_no, lessons: [{ group_label, subject, teacher_id, room_id, combined }] }
 *          replaces what one section has in one period (lessons: [] clears it)
 *   PUT    { action: 'swap', versionId, class, a: { weekday, period_no }, b: { weekday, period_no } }   drag and drop within a section
 *   DELETE { id }                                                    a draft only
 * Lessons live only in drafts; a published timetable changes by copying it to a new draft.
 */
const MAX_SLOTS = 6000;

async function draftOf(db: SupabaseClient, schoolId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const { data } = await db.from('timetable_versions').select('id, status, session, name').eq('id', id).eq('school_id', schoolId).maybeSingle();
  return data;
}
const clashWords = (c: ReturnType<typeof findClashes>[number], names: Map<string, string>) =>
  `${DAY_NAMES[c.weekday]} period ${c.period_no}: ${c.kind === 'teacher' ? `${names.get(c.key) || 'a teacher'} is in ${c.slots.map(s => s.class).join(' and ')}`
    : c.kind === 'room' ? `${c.slots.map(s => s.class).join(' and ')} share a room` : `${c.slots[0].class} has two lessons`}`;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');

  if (b.action === 'create') {
    const name = str(b.name, 80);
    if (!name) return bad('Name the timetable.');
    const session = isSession(b.session) ? b.session : sessionOf();
    let copy: any[] = [];
    if (b.copyFrom) {
      const src = await draftOf(db, admin.schoolId, b.copyFrom);
      if (!src) return bad('Unknown timetable to copy.');
      const { data } = await db.from('timetable_slots').select('class, group_label, weekday, period_no, subject, teacher_id, room_id, combined').eq('version_id', src.id).limit(MAX_SLOTS);
      copy = data || [];
    }
    const { data: v, error } = await db.from('timetable_versions')
      .insert({ school_id: admin.schoolId, session, name, status: 'draft', source: b.copyFrom ? 'copy' : 'manual', created_by: admin.id }).select('id').single();
    if (error) return dbError(error, 'Could not create the timetable.');
    for (let i = 0; i < copy.length; i += 500) {
      const { error: e } = await db.from('timetable_slots').insert(copy.slice(i, i + 500).map(s => ({ ...s, version_id: v.id, school_id: admin.schoolId })));
      if (e) { await db.from('timetable_versions').delete().eq('id', v.id); return dbError(e, 'Could not copy the lessons.'); }
    }
    return NextResponse.json({ ok: true, id: v.id });
  }

  if (b.action === 'import') {
    const name = str(b.name, 80) || `Imported ${fmtDate(isoDay())}`;
    const raw = Array.isArray(b.slots) ? b.slots : [];
    if (!raw.length) return bad('There are no lessons to import.');
    if (raw.length > MAX_SLOTS) return bad(`That's over ${MAX_SLOTS} lessons. Import one wing at a time.`);
    // Create the rooms the file names that the school doesn't have yet.
    const { data: existingRooms } = await db.from('rooms').select('id, name').eq('school_id', admin.schoolId);
    const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const roomByKey = new Map((existingRooms || []).map(r => [key(r.name), r.id]));
    const wanted: string[] = (Array.isArray(b.newRooms) ? b.newRooms : []).slice(0, 300).map((r: any) => str(r?.name, 60)).filter(Boolean);
    const create = [...new Set(wanted.map(key))].filter(k => !roomByKey.has(k))
      .map(k => wanted.find(n => key(n) === k)!).map(n => ({ school_id: admin.schoolId, name: n, kind: guessRoomKind(n) }));
    if (create.length) {
      const { data, error } = await db.from('rooms').insert(create).select('id, name');
      if (error) return dbError(error, 'Could not create the rooms from the file.');
      for (const r of data || []) roomByKey.set(key(r.name), r.id);
    }
    const [staff, rooms] = await Promise.all([staffIds(db, admin.schoolId), roomIds(db, admin.schoolId)]);
    const slots: Slot[] = [];
    for (const r of raw) {
      const withRoom = r?.room_name && !r.room_id ? { ...r, room_id: roomByKey.get(key(String(r.room_name))) ?? null } : r;
      const s = cleanSlot(withRoom, staff, rooms);
      if (typeof s === 'string') return bad(`${s} (${r?.class || '?'} ${DAY_NAMES[Number(r?.weekday)] || ''} period ${r?.period_no || '?'})`);
      slots.push(s);
    }
    const { data: roomRows } = await db.from('rooms').select('id, name, kind, capacity, home_class, active').eq('school_id', admin.schoolId);
    const clashes = findClashes(slots, roomRows || []);
    if (clashes.length) return NextResponse.json({ error: `${clashes.length} clash${clashes.length === 1 ? '' : 'es'} in the file. Resolve them on the review screen first.`, clashes: clashes.length }, { status: 409 });
    const { data: v, error } = await db.from('timetable_versions')
      .insert({ school_id: admin.schoolId, session: sessionOf(), name, status: 'draft', source: 'import', created_by: admin.id }).select('id').single();
    if (error) return dbError(error, 'Could not create the timetable.');
    for (let i = 0; i < slots.length; i += 500) {
      const { error: e } = await db.from('timetable_slots').insert(slots.slice(i, i + 500).map(s => ({ ...s, version_id: v.id, school_id: admin.schoolId })));
      if (e) { await db.from('timetable_versions').delete().eq('id', v.id); return dbError(e, 'Could not import the lessons.'); }
    }
    return NextResponse.json({ ok: true, id: v.id, lessons: slots.length, roomsCreated: create.length });
  }

  if (b.action === 'publish') {
    const v = await draftOf(db, admin.schoolId, b.id);
    if (!v) return bad('Unknown timetable.', 404);
    if (v.status !== 'draft') return bad('Only a draft can be published.', 409);
    const from = String(b.effectiveFrom || '');
    if (!ISO_DAY.test(from)) return bad('Pick the date it takes effect.');
    if (from < isoDay()) return bad('A timetable takes effect today or later. Past days keep the timetable they had.');
    const [{ data: slots }, { data: rooms }, { data: people }, { data: wings }, { data: bells }] = await Promise.all([
      db.from('timetable_slots').select('*').eq('version_id', v.id).limit(MAX_SLOTS),
      db.from('rooms').select('id, name, kind, capacity, home_class, active').eq('school_id', admin.schoolId),
      db.from('users').select('id, name, role, assignments, teacher_class, teacher_subject').eq('school_id', admin.schoolId).in('role', ['teacher', 'admin']),
      db.from('sched_wings').select('id, name, grade_from, grade_to').eq('school_id', admin.schoolId),
      db.from('bell_schedules').select('id, wing_id, kind, bell_periods(period_no, starts_at, ends_at)').eq('school_id', admin.schoolId).eq('kind', 'regular'),
    ]);
    if (!slots?.length) return bad('This timetable has no lessons yet.');
    const names = new Map((people || []).map(p => [p.id, p.name || 'A teacher']));
    const clashes = findClashes(slots as Slot[], rooms || []);
    if (clashes.length) {
      return NextResponse.json({ error: `Fix ${clashes.length} clash${clashes.length === 1 ? '' : 'es'} first. ${clashWords(clashes[0], names)}.`, clashes: clashes.length }, { status: 409 });
    }
    const { error } = await db.from('timetable_versions')
      .update({ status: 'published', effective_from: from, published_by: admin.id, published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', v.id).eq('school_id', admin.schoolId).eq('status', 'draft');
    if (error) return dbError(error, 'Could not publish the timetable.');

    const synced = await syncPacing(db, admin.schoolId, v.session, slots as Slot[], people || [], wings || [], bells || []);

    // Tell each teacher their week.
    const perTeacher = new Map<string, number>();
    const seen = new Set<string>();
    for (const s of slots as Slot[]) {
      if (!s.teacher_id || seen.has(`${s.teacher_id}|${s.weekday}|${s.period_no}`)) continue;
      seen.add(`${s.teacher_id}|${s.weekday}|${s.period_no}`);
      perTeacher.set(s.teacher_id, (perTeacher.get(s.teacher_id) || 0) + 1);
    }
    if (perTeacher.size) {
      await db.from('notifications').insert([...perTeacher].map(([uid, n]) => ({
        school_id: admin.schoolId, user_id: uid, type: 'schedule', title: 'New timetable',
        body: `${v.name} takes effect ${fmtDate(from)}. You have ${n} period${n === 1 ? '' : 's'} a week. See My Schedule.`,
        metadata: { versionId: v.id, effectiveFrom: from },
      }))).then(({ error: e }) => { if (e) console.warn('[schedule] notifications failed:', e.message); });
    }
    return NextResponse.json({ ok: true, teachers: perTeacher.size, pacing: synced });
  }

  if (b.action === 'archive') {
    const v = await draftOf(db, admin.schoolId, b.id);
    if (!v) return bad('Unknown timetable.', 404);
    if (v.status !== 'published') return bad('Only a published timetable can be retired.', 409);
    const { error } = await db.from('timetable_versions').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', v.id).eq('school_id', admin.schoolId);
    return error ? dbError(error, 'Could not retire the timetable.') : NextResponse.json({ ok: true });
  }
  return bad('Unknown action.');
}

/**
 * Periods per week (and minutes, from the section's regular bells) into course_plans for every
 * section + subject in the timetable, so pacing reads the timetable. Existing plans keep their term;
 * new ones get the default term. The subject is stored in the spelling the teacher's scope uses,
 * which is what the syllabus workspace looks up.
 */
async function syncPacing(db: SupabaseClient, schoolId: string, session: string, slots: Slot[], people: any[], wings: any[], bells: any[]): Promise<number> {
  const scopeSpelling = new Map<string, { cls: string; subject: string }>();
  for (const p of people) for (const e of teachingScope(p)) if (e.subject) scopeSpelling.set(`${normClass(e.cls)}::${normaliseSubject(e.subject)}`, { cls: e.cls, subject: e.subject });
  const { data: plans } = await db.from('course_plans').select('id, class, subject').eq('school_id', schoolId).eq('session', session);
  const planByKey = new Map((plans || []).map(p => [`${normClass(p.class)}::${normaliseSubject(p.subject)}`, p]));
  const minutesFor = (cls: string) => {
    const wing = wingOf(cls, wings)?.id ?? null;
    const sched = bells.find(b => b.wing_id === wing) ?? bells.find(b => b.wing_id === null);
    const lens = (sched?.bell_periods || []).filter((p: any) => p.period_no).map((p: any) => minutes(p.ends_at) - minutes(p.starts_at)).sort((a: number, b: number) => a - b);
    const median = lens.length ? lens[Math.floor(lens.length / 2)] : 40;
    return Math.max(20, Math.min(120, median));
  };
  const term = defaultTerm(session);
  let n = 0;
  for (const e of periodsPerWeek(slots)) {
    const k = `${normClass(e.cls)}::${normaliseSubject(e.subject)}`;
    const ppw = Math.max(1, Math.min(20, e.periods));
    const mins = minutesFor(e.cls);
    const existing = planByKey.get(k);
    const { error } = existing
      ? await db.from('course_plans').update({ periods_per_week: ppw, period_minutes: mins, periods_source: 'timetable', updated_at: new Date().toISOString() }).eq('id', existing.id)
      : await db.from('course_plans').insert({
        school_id: schoolId, session, class: scopeSpelling.get(k)?.cls ?? displayClass(e.cls), subject: scopeSpelling.get(k)?.subject ?? e.subject,
        term_start: term.termStart, term_end: term.termEnd, periods_per_week: ppw, period_minutes: mins, periods_source: 'timetable',
      });
    if (error) console.warn('[schedule] pacing sync failed for', e.cls, e.subject, error.message);
    else n++;
  }
  return n;
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (b?.action !== 'rename' || !isUuid(b.id)) return bad('Unknown action.');
  const name = str(b.name, 80);
  if (!name) return bad('Name the timetable.');
  const { error } = await db.from('timetable_versions').update({ name, notes: str(b.notes, 2000) || null, updated_at: new Date().toISOString() }).eq('id', b.id).eq('school_id', admin.schoolId);
  return error ? dbError(error, 'Could not rename the timetable.') : NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  const v = await draftOf(db, admin.schoolId, b?.versionId);
  if (!v) return bad('Unknown timetable.', 404);
  if (v.status !== 'draft') return bad('This timetable is published. Copy it to a new draft to change it.', 409);
  const cls = displayClass(str(b.class, 40));
  const ck = normClass(cls);
  if (!ck) return bad('Pick a section.');
  const [staff, rooms] = await Promise.all([staffIds(db, admin.schoolId), roomIds(db, admin.schoolId)]);
  const { data: roomRows } = await db.from('rooms').select('id, name, kind, capacity, home_class, active').eq('school_id', admin.schoolId);
  const cellOf = async (weekday: number, period: number) =>
    (await db.from('timetable_slots').select('*').eq('version_id', v.id).eq('class_key', ck).eq('weekday', weekday).eq('period_no', period)).data || [];

  // Replace cells, checking clashes against the rest of the version first; on a database refusal, put the old lessons back.
  const replace = async (cells: { weekday: number; period_no: number; lessons: Slot[] }[]) => {
    const old = (await Promise.all(cells.map(c => cellOf(c.weekday, c.period_no)))).flat();
    for (const c of cells) {
      const { data: others } = await db.from('timetable_slots').select('*').eq('version_id', v.id).eq('weekday', c.weekday).eq('period_no', c.period_no).neq('class_key', ck);
      const clash = findClashes([...(others || []), ...c.lessons] as Slot[], roomRows || []).find(x => x.slots.some(s => c.lessons.includes(s)));
      if (clash) {
        const { data: people } = await db.from('users').select('id, name').eq('school_id', admin.schoolId).in('role', ['teacher', 'admin']);
        return NextResponse.json({ error: `Clash on ${clashWords(clash, new Map((people || []).map(p => [p.id, p.name])))}.` }, { status: 409 });
      }
    }
    if (old.length) {
      const { error } = await db.from('timetable_slots').delete().in('id', old.map(o => o.id));
      if (error) return dbError(error, 'Could not change the timetable.');
    }
    const rows = cells.flatMap(c => c.lessons.map(l => ({ ...l, version_id: v.id, school_id: admin.schoolId })));
    if (rows.length) {
      const { error } = await db.from('timetable_slots').insert(rows);
      if (error) {
        if (old.length) await db.from('timetable_slots').insert(old.map(o => { const r = { ...o }; delete r.class_key; return r; }));
        return dbError(error, 'Could not change the timetable.');
      }
    }
    await db.from('timetable_versions').update({ updated_at: new Date().toISOString() }).eq('id', v.id);
    return NextResponse.json({ ok: true });
  };

  if (b.action === 'cell') {
    const weekday = Number(b.weekday), period = Number(b.period_no);
    const raw = Array.isArray(b.lessons) ? b.lessons.slice(0, 8) : [];
    const lessons: Slot[] = [];
    for (const l of raw) {
      const s = cleanSlot({ ...l, class: cls, weekday, period_no: period }, staff, rooms);
      if (typeof s === 'string') return bad(s);
      lessons.push(s);
    }
    if (!Number.isInteger(weekday) || !Number.isInteger(period)) return bad('Pick a day and period.');
    const within = findClashes(lessons, roomRows || []);
    if (within.length) {
      const k = within[0].kind;
      return bad(k === 'section' ? 'Two lessons in one period need different group names (for example Biology and Computer Science).'
        : k === 'teacher' ? 'One teacher can\'t take two groups in the same period.' : 'Two groups can\'t use the same room in the same period.');
    }
    return replace([{ weekday, period_no: period, lessons }]);
  }

  if (b.action === 'swap') {
    const a = { weekday: Number(b.a?.weekday), period_no: Number(b.a?.period_no) };
    const c = { weekday: Number(b.b?.weekday), period_no: Number(b.b?.period_no) };
    if (![a.weekday, a.period_no, c.weekday, c.period_no].every(Number.isInteger)) return bad('Pick the two periods to swap.');
    if (a.weekday === c.weekday && a.period_no === c.period_no) return NextResponse.json({ ok: true });
    const strip = (rows: any[], to: { weekday: number; period_no: number }): Slot[] => rows.map(r => ({
      class: r.class, group_label: r.group_label, subject: r.subject, teacher_id: r.teacher_id, room_id: r.room_id, combined: r.combined, ...to,
    }));
    const [ra, rc] = await Promise.all([cellOf(a.weekday, a.period_no), cellOf(c.weekday, c.period_no)]);
    // A combined lesson spans sections; moving it for one section alone would split it.
    if ([...ra, ...rc].some(r => r.combined)) return bad('Combined lessons move together. Edit each section\'s period instead.');
    return replace([{ ...a, lessons: strip(rc, a) }, { ...c, lessons: strip(ra, c) }]);
  }
  return bad('Unknown action.');
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  const v = await draftOf(db, admin.schoolId, b?.id);
  if (!v) return bad('Unknown timetable.', 404);
  if (v.status !== 'draft') return bad('A published timetable is kept for the record. Retire it instead.', 409);
  const { error } = await db.from('timetable_versions').delete().eq('id', v.id).eq('school_id', admin.schoolId).eq('status', 'draft');
  return error ? dbError(error, 'Could not delete the draft.') : NextResponse.json({ ok: true });
}
