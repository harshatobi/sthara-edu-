import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isoDay } from '@/lib/admin/format';
import { byIds, pageAll } from '@/lib/ops/page';
import { currentSession, sessionFor, sessionSettings, sessionStartDay } from '@/lib/students/register';
import { DOC_BUCKET } from '@/lib/students/documentsServer';
import { DOC_MAX_BYTES, cleanFileName } from '@/lib/students/documents';
import { balanceHouses, ccSettings, checkKirti, GROUP_KINDS, tcLines, type GroupKind, type KirtiLite, type MemberLite } from './kirti';

/**
 * Co-curricular (brief 06), server side. The caller has been authorised and passes the school. Teachers record Kirti
 * and propose house points; the academic coordinator, principal or school admin approves; a club's teacher in charge
 * keeps its members. Only approved entries leave the office: portals, the TC.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
export interface Actor { id: string; schoolId: string }

async function schoolSettings(db: Db, schoolId: string) {
  const { data } = await db.from('schools').select('settings').eq('id', schoolId).maybeSingle();
  return (data?.settings as Record<string, any>) || {};
}
async function names(db: Db, ids: (string | null | undefined)[]) {
  const want = [...new Set(ids.filter(Boolean) as string[])];
  if (!want.length) return new Map<string, string>();
  const { data } = await byIds<{ id: string; name: string | null }>(want, (chunk, f, t) => db.from('users').select('id, name').in('id', chunk).order('id').range(f, t));
  return new Map(data.map(u => [u.id, u.name || 'Someone']));
}
async function studentsIn(db: Db, schoolId: string, ids: string[]) {
  const { data } = await byIds<{ id: string; status: string; full_name: string; admission_no: string }>(ids, (chunk, f, t) =>
    db.from('students').select('id, status, full_name, admission_no').eq('school_id', schoolId).in('id', chunk).order('id').range(f, t));
  return new Map(data.map(s => [s.id, s]));
}

// ── Setup ───────────────────────────────────────────────────────────────────

export async function setup(db: Db, schoolId: string) {
  const [houses, groups, settings] = await Promise.all([
    db.from('houses').select('id, name, colour, active').eq('school_id', schoolId).order('name').limit(40),
    db.from('cc_groups').select('id, kind, name, in_charge, active').eq('school_id', schoolId).order('name').limit(500),
    schoolSettings(db, schoolId),
  ]);
  const who = await names(db, (groups.data || []).map(g => g.in_charge));
  return {
    houses: houses.data || [], settings: ccSettings(settings), session: currentSession(settings),
    groups: (groups.data || []).map(g => ({ ...g, inChargeName: g.in_charge ? who.get(g.in_charge) ?? null : null })),
  };
}

export async function saveHouse(db: Db, a: Actor, b: { id?: unknown; name?: unknown; colour?: unknown; active?: unknown }): Promise<Result<{ id: string }>> {
  const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 40) return fail('Name the house, up to 40 characters.');
  const colour = typeof b.colour === 'string' && /^#[0-9A-Fa-f]{6}$/.test(b.colour) ? b.colour : null;
  const row = { name, colour, active: b.active !== false };
  const q = typeof b.id === 'string'
    ? db.from('houses').update(row).eq('id', b.id).eq('school_id', a.schoolId).select('id').maybeSingle()
    : db.from('houses').insert({ ...row, school_id: a.schoolId }).select('id').single();
  const { data, error } = await q;
  if (error) return fail(error.code === '23505' ? 'There is already a house with that name.' : 'Could not save.', error.code === '23505' ? 409 : 500);
  return data ? { ok: true, id: data.id } : fail('House not found.', 404);
}

export async function saveGroup(db: Db, a: Actor, b: { id?: unknown; kind?: unknown; name?: unknown; inCharge?: unknown; active?: unknown }): Promise<Result<{ id: string }>> {
  if (!GROUP_KINDS.includes(b.kind as GroupKind)) return fail('Pick what kind of group it is.');
  const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 80) return fail('Name the club or team, up to 80 characters.');
  let inCharge: string | null = null;
  if (typeof b.inCharge === 'string' && b.inCharge) {
    const { data: t } = await db.from('users').select('id').eq('id', b.inCharge).eq('school_id', a.schoolId).in('role', ['teacher', 'admin']).maybeSingle();
    if (!t) return fail('The teacher in charge must be a teacher of this school.');
    inCharge = t.id;
  }
  const row = { kind: b.kind as GroupKind, name, in_charge: inCharge, active: b.active !== false };
  const q = typeof b.id === 'string'
    ? db.from('cc_groups').update(row).eq('id', b.id).eq('school_id', a.schoolId).select('id').maybeSingle()
    : db.from('cc_groups').insert({ ...row, school_id: a.schoolId, created_by: a.id }).select('id').single();
  const { data, error } = await q;
  if (error) return fail(error.code === '23505' ? 'There is already a club or team with that name.' : 'Could not save.', error.code === '23505' ? 409 : 500);
  return data ? { ok: true, id: data.id } : fail('Not found.', 404);
}

export async function saveSettings(db: Db, a: Actor, b: { houseRule?: unknown; keepSiblings?: unknown }): Promise<Result> {
  if (b.houseRule !== 'lifelong' && b.houseRule !== 'session') return fail('Pick how houses are kept.');
  const s = await schoolSettings(db, a.schoolId);
  const { error } = await db.from('schools').update({ settings: { ...s, cocurricular: { ...(s.cocurricular || {}), houseRule: b.houseRule, keepSiblings: b.keepSiblings !== false } } }).eq('id', a.schoolId);
  return error ? fail('Could not save.', 500) : { ok: true };
}

/** Teachers of the school, for picking a club's in-charge. */
export async function teachers(db: Db, schoolId: string) {
  const { data } = await db.from('users').select('id, name').eq('school_id', schoolId).eq('role', 'teacher').order('name').limit(1000);
  return (data || []).map(t => ({ id: t.id as string, name: (t.name as string) || 'Teacher' }));
}

// ── Houses ──────────────────────────────────────────────────────────────────

/** Puts one student in a house from a date: the open placement closes the day before (kept as history). */
export async function placeInHouse(db: Db, a: Actor, studentId: string, houseId: string, from: string, reason: string): Promise<Result> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return fail('Give the date.');
  const [st, h, cur] = await Promise.all([
    db.from('students').select('id, status').eq('id', studentId).eq('school_id', a.schoolId).maybeSingle(),
    db.from('houses').select('id, active').eq('id', houseId).eq('school_id', a.schoolId).maybeSingle(),
    db.from('house_members').select('id, house_id, from_date').eq('student_id', studentId).is('to_date', null).maybeSingle(),
  ]);
  if (!st.data || st.data.status === 'cancelled') return fail('Student not found.', 404);
  if (!h.data?.active) return fail('Pick a house in use.');
  if (cur.data?.house_id === houseId) return fail('Already in that house.', 409);
  if (cur.data) {
    if (reason.trim().length < 3) return fail('Say why the student is moving house.');
    if (from <= cur.data.from_date) return fail('The move must be after the student joined the current house.');
    const prev = new Date(`${from}T00:00:00Z`); prev.setUTCDate(prev.getUTCDate() - 1);
    const { error } = await db.from('house_members').update({ to_date: prev.toISOString().slice(0, 10) }).eq('id', cur.data.id);
    if (error) return fail('Could not move the student.', 500);
  }
  const { error } = await db.from('house_members').insert({ school_id: a.schoolId, student_id: studentId, house_id: houseId, from_date: from, reason: reason.trim().slice(0, 200) || null, set_by: a.id });
  return error ? fail('Could not place the student.', 500) : { ok: true };
}

/**
 * Places every active student with no house (or, `all`, everyone again: the "new house every session" rule) across the
 * houses in use, keeping confirmed siblings together when the school asks for it. Returns how many were placed.
 */
export async function balance(db: Db, a: Actor, all: boolean): Promise<Result<{ placed: number }>> {
  const s = await schoolSettings(db, a.schoolId);
  const cfg = ccSettings(s);
  if (all && cfg.houseRule !== 'session') return fail('This school keeps houses for the whole school life. Change the rule first, or move students one by one.', 409);
  const { data: houses } = await db.from('houses').select('id, name').eq('school_id', a.schoolId).eq('active', true).limit(40);
  if (!houses?.length) return fail('Add the houses first.', 409);
  const [st, open, sib] = await Promise.all([
    pageAll<{ id: string; full_name: string }>((f, t) => db.from('students').select('id, full_name').eq('school_id', a.schoolId).eq('status', 'active').order('id').range(f, t), 100_000),
    pageAll<{ id: string; student_id: string; house_id: string }>((f, t) => db.from('house_members').select('id, student_id, house_id').eq('school_id', a.schoolId).is('to_date', null).order('id').range(f, t), 100_000),
    pageAll<{ a: string; b: string }>((f, t) => db.from('sibling_links').select('a, b').eq('school_id', a.schoolId).eq('status', 'confirmed').order('id').range(f, t), 100_000),
  ]);
  if (st.error || open.error || sib.error) return fail('Could not read the houses.', 500);
  const today = isoDay();
  const start = all ? sessionStartDay(currentSession(s), sessionSettings(s).startMonth) : today;
  const placed = new Map(all ? [] : open.data.map(m => [m.student_id, m.house_id]));
  const todo = st.data.filter(x => !placed.has(x.id)).sort((x, y) => x.full_name.localeCompare(y.full_name)).map(x => x.id);
  if (!todo.length) return { ok: true, placed: 0 };
  const counts = new Map<string, number>();
  for (const h of placed.values()) counts.set(h, (counts.get(h) ?? 0) + 1);
  const sibHouse = new Map<string, string>();
  for (const l of sib.data) {
    if (placed.has(l.a) && !placed.has(l.b)) sibHouse.set(l.b, placed.get(l.a)!);
    if (placed.has(l.b) && !placed.has(l.a)) sibHouse.set(l.a, placed.get(l.b)!);
  }
  // Siblings both being placed now: the second follows the first.
  const sibOf = new Map<string, string[]>();
  for (const l of sib.data) { sibOf.set(l.a, [...(sibOf.get(l.a) ?? []), l.b]); sibOf.set(l.b, [...(sibOf.get(l.b) ?? []), l.a]); }
  const out = new Map<string, string>();
  for (const id of todo) {
    if (cfg.keepSiblings) for (const o of sibOf.get(id) ?? []) if (out.has(o)) sibHouse.set(id, out.get(o)!);
    const one = balanceHouses(houses, counts, [id], sibHouse, cfg.keepSiblings);
    const h = one.get(id)!;
    out.set(id, h);
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  if (all) {
    const prev = new Date(`${start}T00:00:00Z`); prev.setUTCDate(prev.getUTCDate() - 1);
    const closeOn = prev.toISOString().slice(0, 10);
    const ids = open.data.map(m => m.id);
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500);
      const { error } = await db.from('house_members').update({ to_date: closeOn }).in('id', part).lte('from_date', closeOn);
      if (error) return fail('Could not close last session’s houses.', 500);
      // A placement made after this session began is replaced by the new one.
      const del = await db.from('house_members').delete().in('id', part).is('to_date', null);
      if (del.error) return fail('Could not close last session’s houses.', 500);
    }
  }
  const rows = [...out].map(([student_id, house_id]) => ({ school_id: a.schoolId, student_id, house_id, from_date: start, reason: all ? 'New session' : 'Placed by Sthara (balanced)', set_by: a.id }));
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from('house_members').insert(rows.slice(i, i + 1000));
    if (error) return fail('Could not place the students.', 500);
  }
  return { ok: true, placed: rows.length };
}

/** Each house: members now, and points this session (approved Kirti points plus the house's own). */
export async function standings(db: Db, schoolId: string, session: string) {
  const [houses, open, k, hp] = await Promise.all([
    db.from('houses').select('id, name, colour, active').eq('school_id', schoolId).order('name').limit(40),
    pageAll<{ house_id: string }>((f, t) => db.from('house_members').select('house_id').eq('school_id', schoolId).is('to_date', null).order('id').range(f, t), 100_000),
    pageAll<{ house_id: string; house_points: number }>((f, t) => db.from('kirti_entries').select('house_id, house_points').eq('school_id', schoolId).eq('session', session).eq('status', 'approved').not('house_points', 'is', null).order('id').range(f, t), 200_000),
    pageAll<{ house_id: string; points: number }>((f, t) => db.from('house_points').select('house_id, points').eq('school_id', schoolId).eq('session', session).eq('status', 'approved').order('id').range(f, t), 50_000),
  ]);
  const members = new Map<string, number>(), points = new Map<string, number>();
  for (const m of open.data) members.set(m.house_id, (members.get(m.house_id) ?? 0) + 1);
  for (const e of k.data) if (e.house_id) points.set(e.house_id, (points.get(e.house_id) ?? 0) + Number(e.house_points));
  for (const e of hp.data) points.set(e.house_id, (points.get(e.house_id) ?? 0) + Number(e.points));
  return (houses.data || []).map(h => ({ ...h, members: members.get(h.id) ?? 0, points: points.get(h.id) ?? 0 })).sort((x, y) => y.points - x.points || x.name.localeCompare(y.name));
}

// ── Kirti: recording and approving ──────────────────────────────────────────

/** A one-time link for a certificate or photo that goes with a Kirti entry (kept as a student document). */
export async function attachmentUrl(db: Db, a: Actor, studentId: string, b: { fileName?: unknown; fileBytes?: unknown }): Promise<Result<{ url: string; path: string }>> {
  const { data: st } = await db.from('students').select('id').eq('id', studentId).eq('school_id', a.schoolId).maybeSingle();
  if (!st) return fail('Student not found.', 404);
  if (!cleanFileName(b.fileName)) return fail('Choose a file.');
  const bytes = Number(b.fileBytes);
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > DOC_MAX_BYTES) return fail('Files can be up to 25 MB.');
  const path = `${a.schoolId}/${studentId}/${randomUUID()}`;
  const up = await db.storage.from(DOC_BUCKET).createSignedUploadUrl(path);
  return up.error || !up.data ? fail('Could not prepare the upload.', 500) : { ok: true, url: up.data.signedUrl, path };
}

/**
 * Records one achievement or participation for one or more students (an event many took part in). Each waits for
 * approval. A file, for a single student, becomes a student document that awaits the same approval.
 */
export async function record(db: Db, a: Actor, b: { studentIds?: unknown; entry?: unknown; groupId?: unknown; attachment?: unknown }): Promise<Result<{ added: number }>> {
  const ids = Array.isArray(b.studentIds) ? [...new Set(b.studentIds.filter((x): x is string => typeof x === 'string'))] : [];
  if (!ids.length || ids.length > 300) return fail('Pick between 1 and 300 students.');
  const e = checkKirti((b.entry && typeof b.entry === 'object' ? b.entry : {}) as Record<string, unknown>, isoDay());
  if ('error' in e) return fail(e.error);
  const st = await studentsIn(db, a.schoolId, ids);
  if (st.size !== ids.length || [...st.values()].some(s => s.status === 'cancelled')) return fail('Every student must be on this school’s register.', 404);
  let groupId: string | null = null;
  if (typeof b.groupId === 'string' && b.groupId) {
    const { data: g } = await db.from('cc_groups').select('id').eq('id', b.groupId).eq('school_id', a.schoolId).maybeSingle();
    if (!g) return fail('Club or team not found.', 404);
    groupId = g.id;
  }
  let documentId: string | null = null;
  const att = b.attachment as { path?: unknown; fileName?: unknown } | null | undefined;
  if (att && typeof att.path === 'string') {
    if (ids.length !== 1) return fail('Attach a certificate to one student’s entry at a time.');
    const folder = `${a.schoolId}/${ids[0]}`;
    const key = att.path.startsWith(`${folder}/`) ? att.path.slice(folder.length + 1) : '';
    const { data: found } = key ? await db.storage.from(DOC_BUCKET).list(folder, { search: key, limit: 2 }) : { data: null };
    const obj = found?.find(f => f.name === key);
    if (!obj) return fail('The file hasn’t arrived yet. Try again.', 409);
    const { data: d, error } = await db.from('student_documents').insert({
      school_id: a.schoolId, student_id: ids[0], kind: 'other', title: `Kirti: ${e.value.title}`.slice(0, 120), issued_on: e.value.on_date,
      storage_path: att.path, file_name: cleanFileName(att.fileName) ?? 'certificate', size_bytes: Number((obj.metadata as { size?: number } | null)?.size ?? 0) || null,
      status: 'awaiting', source: 'office', uploaded_by: a.id,
    }).select('id').single();
    if (error || !d) return fail('Could not keep the file.', 500);
    documentId = d.id;
  }
  // The session the day falls in (not the one open now: an entry can be from last year).
  const session = sessionFor(new Date(`${e.value.on_date}T00:00:00Z`), sessionSettings(await schoolSettings(db, a.schoolId)).startMonth);
  const { error } = await db.from('kirti_entries').insert(ids.map(id => ({
    school_id: a.schoolId, student_id: id, session, ...e.value, group_id: groupId, document_id: documentId, recorded_by: a.id,
  })));
  return error ? fail('Could not save.', 500) : { ok: true, added: ids.length };
}

/** A teacher proposes points for a whole house (an inter-house event). */
export async function proposePoints(db: Db, a: Actor, b: { houseId?: unknown; points?: unknown; reason?: unknown; onDate?: unknown }, approved: boolean): Promise<Result> {
  const { data: h } = typeof b.houseId === 'string' ? await db.from('houses').select('id').eq('id', b.houseId).eq('school_id', a.schoolId).maybeSingle() : { data: null };
  if (!h) return fail('Pick a house.');
  const pts = Number(b.points);
  if (!Number.isInteger(pts) || pts === 0 || pts < -1000 || pts > 5000) return fail('Points are a whole number, not zero.');
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (reason.length < 2 || reason.length > 160) return fail('Say what the points are for.');
  const on = typeof b.onDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.onDate) ? b.onDate : isoDay();
  const session = sessionFor(new Date(`${on}T00:00:00Z`), sessionSettings(await schoolSettings(db, a.schoolId)).startMonth);
  const { error } = await db.from('house_points').insert({ school_id: a.schoolId, house_id: h.id, session, on_date: on, points: pts, reason, recorded_by: a.id,
    ...(approved ? { status: 'approved', approved_by: a.id, approved_at: new Date().toISOString() } : {}) });
  return error ? fail('Could not save.', 500) : { ok: true };
}

/** What waits for the coordinator: Kirti entries and house points. */
export async function pending(db: Db, schoolId: string) {
  const [k, hp] = await Promise.all([
    pageAll<any>((f, t) => db.from('kirti_entries').select('id, student_id, on_date, title, category, level, position, position_note, house_points, notes, document_id, recorded_by, created_at, students!inner(full_name, admission_no)')
      .eq('school_id', schoolId).eq('status', 'pending').order('created_at').order('id').range(f, t), 5_000),
    db.from('house_points').select('id, house_id, on_date, points, reason, recorded_by, created_at, houses!inner(name)').eq('school_id', schoolId).eq('status', 'pending').order('created_at').limit(500),
  ]);
  if (k.error) throw new Error(k.error.message);
  const who = await names(db, [...k.data.map(x => x.recorded_by), ...(hp.data || []).map(x => x.recorded_by)]);
  return {
    kirti: k.data.map(x => ({ ...x, student: x.students.full_name, admissionNo: x.students.admission_no, students: undefined, recordedBy: who.get(x.recorded_by) ?? null })),
    points: (hp.data || []).map((x: any) => ({ ...x, house: x.houses.name, houses: undefined, recordedBy: who.get(x.recorded_by) ?? null })),
  };
}

/** Approves or rejects Kirti entries (and their attachments); approved points go to the house the student was in that day. */
export async function decideKirti(db: Db, a: Actor, ids: unknown, approve: boolean, note: string): Promise<Result<{ done: number }>> {
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];
  if (!list.length) return fail('Pick the entries.');
  if (!approve && note.trim().length < 3) return fail('Say why, so the teacher knows.');
  const { data: rows } = await byIds<{ id: string; student_id: string; on_date: string; house_points: number | null; document_id: string | null }>(list, (chunk, f, t) =>
    db.from('kirti_entries').select('id, student_id, on_date, house_points, document_id').eq('school_id', a.schoolId).eq('status', 'pending').in('id', chunk).order('id').range(f, t));
  if (!rows.length) return fail('Nothing waiting among those.', 409);
  const now = new Date().toISOString();
  if (!approve) {
    const { error } = await db.from('kirti_entries').update({ status: 'rejected', reject_note: note.trim().slice(0, 300) }).in('id', rows.map(r => r.id)).eq('status', 'pending');
    return error ? fail('Could not save.', 500) : { ok: true, done: rows.length };
  }
  // The house on the day, for entries that carry points.
  const withPts = rows.filter(r => r.house_points != null);
  const houseOf = new Map<string, string>();
  if (withPts.length) {
    const { data: hm } = await byIds<{ student_id: string; house_id: string; from_date: string; to_date: string | null }>([...new Set(withPts.map(r => r.student_id))], (chunk, f, t) =>
      db.from('house_members').select('student_id, house_id, from_date, to_date').in('student_id', chunk).order('id').range(f, t));
    for (const r of withPts) {
      const m = hm.find(x => x.student_id === r.student_id && x.from_date <= r.on_date && (!x.to_date || x.to_date >= r.on_date));
      if (m) houseOf.set(r.id, m.house_id);
    }
  }
  for (const r of rows) {
    const { error } = await db.from('kirti_entries').update({ status: 'approved', approved_by: a.id, approved_at: now, reject_note: null, house_id: houseOf.get(r.id) ?? null }).eq('id', r.id).eq('status', 'pending');
    if (error) return fail('Could not save.', 500);
  }
  const docs = rows.map(r => r.document_id).filter(Boolean) as string[];
  if (docs.length) await db.from('student_documents').update({ status: 'verified', verified_by: a.id, verified_at: now }).in('id', docs).eq('status', 'awaiting');
  return { ok: true, done: rows.length };
}

export async function decidePoints(db: Db, a: Actor, ids: unknown, approve: boolean, note: string): Promise<Result<{ done: number }>> {
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];
  if (!list.length) return fail('Pick the points.');
  if (!approve && note.trim().length < 3) return fail('Say why.');
  const { data, error } = await db.from('house_points').update(approve
    ? { status: 'approved', approved_by: a.id, approved_at: new Date().toISOString() }
    : { status: 'rejected', reject_note: note.trim().slice(0, 300) }).eq('school_id', a.schoolId).eq('status', 'pending').in('id', list).select('id');
  return error ? fail('Could not save.', 500) : { ok: true, done: data?.length ?? 0 };
}

// ── Memberships (the in-charge or the coordinator) ──────────────────────────

export async function groupMembers(db: Db, schoolId: string, groupId: string, session: string) {
  const { data } = await db.from('cc_memberships').select('id, student_id, role, left_on, students!inner(full_name, admission_no)').eq('school_id', schoolId).eq('group_id', groupId).eq('session', session).order('created_at').limit(1000);
  return (data || []).map((m: any) => ({ id: m.id as string, studentId: m.student_id as string, role: m.role as string | null, leftOn: m.left_on as string | null, name: m.students.full_name as string, admissionNo: m.students.admission_no as string }));
}

export async function addMembers(db: Db, a: Actor, groupId: string, studentIds: unknown, role: unknown): Promise<Result<{ added: number }>> {
  const ids = Array.isArray(studentIds) ? [...new Set(studentIds.filter((x): x is string => typeof x === 'string'))].slice(0, 300) : [];
  if (!ids.length) return fail('Pick the students.');
  const st = await studentsIn(db, a.schoolId, ids);
  if (st.size !== ids.length) return fail('Every student must be on this school’s register.', 404);
  const session = currentSession(await schoolSettings(db, a.schoolId));
  const r = typeof role === 'string' ? role.trim().slice(0, 40) || null : null;
  const { data, error } = await db.from('cc_memberships').upsert(ids.map(id => ({ school_id: a.schoolId, group_id: groupId, student_id: id, session, role: r, added_by: a.id, left_on: null })),
    { onConflict: 'group_id,student_id,session' }).select('id');
  return error ? fail('Could not add them.', 500) : { ok: true, added: data?.length ?? 0 };
}

export async function updateMember(db: Db, a: Actor, groupId: string, memberId: string, b: { role?: unknown; leave?: unknown }): Promise<Result> {
  const patch: Record<string, unknown> = {};
  if (b.role !== undefined) patch.role = typeof b.role === 'string' ? b.role.trim().slice(0, 40) || null : null;
  if (b.leave === true) patch.left_on = isoDay();
  if (b.leave === false) patch.left_on = null;
  if (!Object.keys(patch).length) return fail('Nothing to change.');
  const { data, error } = await db.from('cc_memberships').update(patch).eq('id', memberId).eq('group_id', groupId).eq('school_id', a.schoolId).select('id');
  return error ? fail('Could not save.', 500) : data?.length ? { ok: true } : fail('Member not found.', 404);
}

// ── Reading a student's co-curricular life ──────────────────────────────────

/** For the office (everything, with status) or, approvedOnly, for the student and parent portals and the TC. */
export async function studentRecord(db: Db, schoolId: string, studentId: string, approvedOnly: boolean) {
  const [houses, members, kirti] = await Promise.all([
    db.from('house_members').select('id, from_date, to_date, reason, houses!inner(name, colour)').eq('student_id', studentId).eq('school_id', schoolId).order('from_date', { ascending: false }).limit(40),
    db.from('cc_memberships').select('id, session, role, left_on, cc_groups!inner(kind, name)').eq('student_id', studentId).eq('school_id', schoolId).order('session', { ascending: false }).limit(200),
    (approvedOnly ? db.from('kirti_entries').select('id, session, on_date, title, category, level, position, position_note, house_points, status, reject_note, document_id').eq('status', 'approved')
      : db.from('kirti_entries').select('id, session, on_date, title, category, level, position, position_note, house_points, status, reject_note, document_id'))
      .eq('student_id', studentId).eq('school_id', schoolId).order('on_date', { ascending: false }).limit(500),
  ]);
  return {
    houses: (houses.data || []).map((h: any) => ({ id: h.id, from: h.from_date, to: h.to_date, reason: h.reason, name: h.houses.name, colour: h.houses.colour })),
    memberships: (members.data || []).map((m: any) => ({ id: m.id, session: m.session, role: m.role, leftOn: m.left_on, kind: m.cc_groups.kind as GroupKind, name: m.cc_groups.name as string })),
    kirti: kirti.data || [],
  };
}

/** TC fields 16 and 17 from approved records. */
export async function tcFields(db: Db, schoolId: string, studentId: string) {
  const r = await studentRecord(db, schoolId, studentId, true);
  return tcLines(r.memberships.map(m => ({ kind: m.kind, name: m.name, role: m.role, session: m.session } as MemberLite)), r.kirti as KirtiLite[]);
}

/** A searchable log of Kirti for the office. */
export async function kirtiLog(db: Db, schoolId: string, session: string) {
  const { data, error } = await pageAll<any>((f, t) => db.from('kirti_entries').select('id, student_id, on_date, title, category, level, position, position_note, house_points, status, students!inner(full_name, admission_no)')
    .eq('school_id', schoolId).eq('session', session).neq('status', 'pending').order('on_date', { ascending: false }).order('id').range(f, t), 50_000);
  if (error) throw new Error(error.message);
  return data.map(x => ({ ...x, student: x.students.full_name, admissionNo: x.students.admission_no, students: undefined }));
}

/** For a teacher: the classes they can pick from (their scope), the groups they run, houses, and what they recorded. */
export async function teacherView(db: Db, staff: { id: string; schoolId: string }) {
  const s = await schoolSettings(db, staff.schoolId);
  const session = currentSession(s);
  const [groups, houses, mine] = await Promise.all([
    db.from('cc_groups').select('id, kind, name').eq('school_id', staff.schoolId).eq('in_charge', staff.id).eq('active', true).order('name').limit(50),
    db.from('houses').select('id, name, colour').eq('school_id', staff.schoolId).eq('active', true).order('name').limit(40),
    db.from('kirti_entries').select('id, on_date, title, level, position, position_note, status, reject_note, students!inner(full_name)').eq('school_id', staff.schoolId).eq('recorded_by', staff.id).order('created_at', { ascending: false }).limit(100),
  ]);
  return {
    session, groups: groups.data || [], houses: houses.data || [], settings: ccSettings(s),
    mine: (mine.data || []).map((m: any) => ({ ...m, student: m.students.full_name, students: undefined })),
  };
}

/** Students a teacher can pick: a class roster this session, or a name/admission number search across the school. */
export async function findStudents(db: Db, schoolId: string, q: { cls?: string; search?: string }) {
  const s = await schoolSettings(db, schoolId);
  if (q.cls) {
    const { data } = await db.from('enrolments').select('student_id, class_name, roll_no, students!inner(full_name, admission_no, status)').eq('school_id', schoolId)
      .eq('session', currentSession(s)).is('ends_on', null).eq('class_name', q.cls).order('roll_no').limit(200);
    return (data || []).filter((e: any) => e.students.status === 'active').map((e: any) => ({ id: e.student_id as string, name: e.students.full_name as string, admissionNo: e.students.admission_no as string, cls: e.class_name as string }));
  }
  const t = (q.search ?? '').trim();
  if (t.length < 2) return [];
  const safe = t.replace(/[%_,()]/g, ' ');
  const { data } = await db.from('students').select('id, full_name, admission_no').eq('school_id', schoolId).eq('status', 'active')
    .or(`full_name.ilike.%${safe}%,admission_no.ilike.%${safe}%`).order('full_name').limit(20);
  return (data || []).map(x => ({ id: x.id as string, name: x.full_name as string, admissionNo: x.admission_no as string, cls: null }));
}
