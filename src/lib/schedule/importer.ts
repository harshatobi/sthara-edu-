/**
 * Timetable import: aSc Timetables XML, FET timetable CSV, and a spreadsheet (CSV or .xlsx) in
 * either long form (one row per lesson) or grid form (Class, Day, P1..Pn). Everything is parsed
 * in the browser into ImportRows, matched to the school's teachers and rooms, and reviewed
 * before the server writes a draft. Pure except readXlsx (needs DecompressionStream).
 */
import { displayClass, normClass } from '@/lib/teacher/scope';
import { slotPerson, slotTeacher, type RoomKind, type Slot } from './types';

export interface ImportRow {
  class: string; group: string; weekday: number; period: number; subject: string;
  teacher: string; room: string; combined: boolean;
}
export interface Parsed { format: 'asc' | 'fet' | 'long' | 'grid'; rows: ImportRow[]; problems: string[] }

// ── Cells ───────────────────────────────────────────────────────────────────
const DAYS: Record<string, number> = {
  mon: 1, monday: 1, mo: 1, tue: 2, tues: 2, tuesday: 2, tu: 2, wed: 3, wednesday: 3, we: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, th: 4,
  fri: 5, friday: 5, fr: 5, sat: 6, saturday: 6, sa: 6, sun: 7, sunday: 7, su: 7,
};
export function parseDay(v: string): number | null {
  const s = v.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s in DAYS) return DAYS[s];
  const n = Number(s.replace(/^day/, ''));
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null;
}
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
export function parsePeriod(v: string): number | null {
  const s = v.trim().toLowerCase().replace(/^(period|prd|per|p|hour|slot)\s*[-.#:]?\s*/, '');
  if (s in ROMAN) return ROMAN[s];
  const m = s.match(/^(\d{1,2})(st|nd|rd|th)?$/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 16 ? n : null;
}

// ── CSV ─────────────────────────────────────────────────────────────────────
/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF, comma or tab (whichever the header uses). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/\t/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? '\t'
    : (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(Boolean));
}

// ── .xlsx (first sheet) ─────────────────────────────────────────────────────
/** Reads the first worksheet of an .xlsx into rows of strings. No dependency: unzips with DecompressionStream. */
export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(new Uint8Array(buf), n => n === 'xl/sharedStrings.xml' || n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const shared = [...(files.get('xl/sharedStrings.xml') || '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
  // The first sheet in workbook order, via its relationship.
  const firstRel = (files.get('xl/workbook.xml') || '').match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1];
  const target = firstRel && (files.get('xl/_rels/workbook.xml.rels') || '').match(new RegExp(`<Relationship\\b[^>]*Id="${firstRel}"[^>]*Target="([^"]+)"`))?.[1]
    || (files.get('xl/_rels/workbook.xml.rels') || '').match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstRel}"`))?.[1];
  const path = target ? `xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}` : 'xl/worksheets/sheet1.xml';
  const sheet = files.get(path) || files.get('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('That workbook has no worksheet we can read.');
  const rows: string[][] = [];
  for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const out: string[] = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
      const col = ref ? [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : out.length;
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const body = c[2] || '';
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
      const text = type === 's' ? shared[Number(v)] ?? ''
        : type === 'inlineStr' ? decodeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''))
          : decodeXml(v);
      while (out.length < col) out.push('');
      out[col] = text.trim();
    }
    if (out.some(Boolean)) rows.push(out);
  }
  return rows;
}

async function unzip(data: Uint8Array, want: (name: string) => boolean): Promise<Map<string, string>> {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65_557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('That file isn\'t a valid .xlsx workbook.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(data.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = data.subarray(start, start + size);
    if (method === 0) out.set(name, dec.decode(raw));
    else if (method === 8) {
      const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out.set(name, dec.decode(await new Response(stream).arrayBuffer()));
    }
  }
  return out;
}

const decodeXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&');

// ── aSc Timetables XML ──────────────────────────────────────────────────────
function elements(xml: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of xml.matchAll(new RegExp(`<${tag}\\b([^>]*?)\\/?>`, 'g'))) {
    const a: Record<string, string> = {};
    for (const x of m[1].matchAll(/([\w:-]+)="([^"]*)"/g)) a[x[1]] = decodeXml(x[2]);
    out.push(a);
  }
  return out;
}
const ids = (v: string | undefined) => (v || '').split(',').map(s => s.trim()).filter(Boolean);

/** aSc Timetables "XML export" (cards placed on days and periods). */
export function parseAsc(xml: string): Parsed {
  const problems: string[] = [];
  const byId = (tag: string) => new Map(elements(xml, tag).map(e => [e.id, e]));
  const subjects = byId('subject'), teachers = byId('teacher'), classes = byId('class'), rooms = byId('classroom'), groups = byId('group'), lessons = byId('lesson');
  const daysdefs = byId('daysdef');
  const periods = elements(xml, 'period').map(p => Number(p.period)).filter(n => n > 0).sort((a, b) => a - b);
  const periodIndex = (v: string) => { const n = Number(v); const i = periods.indexOf(n); return i >= 0 ? i + 1 : n; };
  const rows: ImportRow[] = [];
  let multiTeacher = 0;
  for (const card of elements(xml, 'card')) {
    const lesson = lessons.get(card.lessonid);
    if (!lesson) continue;
    let mask = card.days || daysdefs.get(card.daysdefid || '')?.days || '';
    if (!/^[01]+$/.test(mask)) mask = daysdefs.get(lesson.daysdefid || '')?.days || '';
    const days = [...mask].map((b, i) => (b === '1' ? i + 1 : 0)).filter(Boolean);
    if (!days.length) { problems.push(`A card for lesson ${card.lessonid} has no day.`); continue; }
    const first = periodIndex(card.period);
    const span = Math.max(1, Number(lesson.durationperiods || lesson.periodspercard || 1));
    const tIds = ids(lesson.teacherids);
    if (tIds.length > 1) multiTeacher++;
    const t = teachers.get(tIds[0] || '');
    const teacher = t ? (t.name || [t.firstname, t.lastname].filter(Boolean).join(' ') || t.short || '') : '';
    const subject = subjects.get(lesson.subjectid)?.name || subjects.get(lesson.subjectid)?.short || '';
    const roomName = rooms.get(ids(card.classroomids)[0] || '')?.name || '';
    const cls = ids(lesson.classids);
    const grp = ids(lesson.groupids).map(g => groups.get(g)).filter(g => g && g.entireclass !== '1');
    for (const d of days) {
      for (let k = 0; k < span; k++) {
        for (const cid of cls) {
          const c = classes.get(cid);
          if (!c) continue;
          const g = grp.find(x => x!.classid === cid);
          rows.push({
            class: c.name || c.short, group: g?.name || '', weekday: d, period: first + k, subject,
            teacher, room: roomName, combined: cls.length > 1,
          });
        }
      }
    }
  }
  if (multiTeacher) problems.push(`${multiTeacher} lesson${multiTeacher === 1 ? ' has' : 's have'} more than one teacher; the first teacher is kept.`);
  if (!rows.length) problems.push('No placed lessons (cards) were found. Export from aSc with the timetable generated.');
  return { format: 'asc', rows, problems };
}

// ── Spreadsheets ────────────────────────────────────────────────────────────
const H = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const pick = (header: string[], names: string[]) => header.findIndex(h => names.includes(H(h)));

/** A long table (one lesson per row), a FET timetable CSV, or a grid (Class, Day, P1..Pn). */
export function parseTable(table: string[][]): Parsed {
  if (table.length < 2) return { format: 'long', rows: [], problems: ['The file has no rows under the header.'] };
  const header = table[0];
  const body = table.slice(1);
  const problems: string[] = [];
  const rows: ImportRow[] = [];

  // FET: "Activity Id","Day","Hour","Students Sets","Subject","Teachers","Activity Tags","Room"
  if (pick(header, ['studentssets']) >= 0 && pick(header, ['hour']) >= 0) {
    const [iDay, iHour, iSets, iSubj, iTeach, iRoom] = ['day', 'hour', 'studentssets', 'subject', 'teachers', 'room'].map(n => pick(header, [n]));
    const hours = [...new Set(body.map(r => r[iHour]))];
    const order = hours.every(h => /^\d{1,2}[:.]\d{2}/.test(h)) ? [...hours].sort((a, b) => toMin(a) - toMin(b)) : hours;
    for (const r of body) {
      const d = parseDay(r[iDay] || '');
      const p = parsePeriod(r[iHour] || '') ?? order.indexOf(r[iHour]) + 1;
      const sets = (r[iSets] || '').split('+').map(s => s.trim()).filter(Boolean);
      if (!d || !p || !sets.length) { problems.push(`Skipped a FET row: ${r.join(', ').slice(0, 80)}`); continue; }
      for (const set of sets) {
        const [cls, ...grp] = set.split(/\s+/);
        rows.push({ class: cls, group: grp.join(' '), weekday: d, period: p, subject: r[iSubj] || '', teacher: (r[iTeach] || '').split('+')[0].trim(), room: r[iRoom] || '', combined: sets.length > 1 });
      }
    }
    return { format: 'fet', rows, problems: capProblems(problems) };
  }

  // "Grade" + "Section" as two columns become one class ("10" + "A" -> "10-A").
  const iGrade = pick(header, ['grade', 'std', 'standard', 'class']);
  const iSection = pick(header, ['section', 'sec', 'division', 'div']);
  if (iGrade >= 0 && iSection >= 0 && iGrade !== iSection && body.every(r => /^[a-z]{0,2}$/i.test(r[iSection] || ''))) {
    for (const r of body) r[iGrade] = r[iSection] ? `${r[iGrade]}-${r[iSection]}` : r[iGrade];
  }
  const iClass = iGrade >= 0 ? iGrade : pick(header, ['classsection', 'section']);
  const iDay = pick(header, ['day', 'weekday']);
  const iPeriod = pick(header, ['period', 'periodno', 'hour', 'slot']);
  const iSubj = pick(header, ['subject']);
  const iTeach = pick(header, ['teacher', 'teachername', 'faculty', 'staff']);
  const iRoom = pick(header, ['room', 'classroom', 'venue']);
  const iGroup = pick(header, ['group', 'batch']);

  if (iClass >= 0 && iDay >= 0 && iPeriod >= 0 && iSubj >= 0) {
    for (const [n, r] of body.entries()) {
      const d = parseDay(r[iDay] || ''), p = parsePeriod(r[iPeriod] || '');
      if (!r[iClass] || !d || !p || !r[iSubj]) { problems.push(`Row ${n + 2}: needs a class, day, period and subject.`); continue; }
      rows.push({ class: r[iClass], group: iGroup >= 0 ? r[iGroup] || '' : '', weekday: d, period: p, subject: r[iSubj], teacher: iTeach >= 0 ? r[iTeach] || '' : '', room: iRoom >= 0 ? r[iRoom] || '' : '', combined: false });
    }
    return { format: 'long', rows, problems: capProblems(problems) };
  }

  // Grid: Class, Day, then one column per period ("P1", "1", "Period 1", "I").
  const periodCols = header.map((h, i) => ({ i, p: i === iClass || i === iDay ? null : parsePeriod(h) })).filter(c => c.p !== null) as { i: number; p: number }[];
  if (iClass >= 0 && iDay >= 0 && periodCols.length) {
    for (const [n, r] of body.entries()) {
      const d = parseDay(r[iDay] || '');
      if (!r[iClass] || !d) { problems.push(`Row ${n + 2}: needs a class and a day.`); continue; }
      for (const c of periodCols) {
        const cell = parseCell(r[c.i] || '');
        if (cell) rows.push({ class: r[iClass], group: '', weekday: d, period: c.p, ...cell, combined: false });
      }
    }
    return { format: 'grid', rows, problems: capProblems(problems) };
  }
  return {
    format: 'long', rows: [],
    problems: ['Couldn\'t recognise the columns. Use either Class, Day, Period, Subject, Teacher, Room (one lesson per row) or Class, Day, P1, P2, ... with "Subject / Teacher / Room" in each cell.'],
  };
}
const toMin = (s: string) => { const m = s.match(/^(\d{1,2})[:.](\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
const capProblems = (p: string[]) => (p.length > 12 ? [...p.slice(0, 12), `and ${p.length - 12} more`] : p);

/** A grid cell: "Maths / Anita Rao / Lab 1", "Maths - Anita Rao", "Maths (Anita Rao)", or just "Maths". Empty and break cells are skipped. */
export function parseCell(v: string): { subject: string; teacher: string; room: string } | null {
  const s = v.trim();
  if (!s || /^(-+|free|break|lunch|recess|x)$/i.test(s)) return null;
  const paren = s.match(/^(.+?)\s*\((.+?)\)\s*(?:\[(.+?)\])?$/);
  if (paren) return { subject: paren[1].trim(), teacher: paren[2].trim(), room: (paren[3] || '').trim() };
  const parts = s.split(/\s*(?:\/|\||\n|\s-\s)\s*/).filter(Boolean);
  return { subject: parts[0] || s, teacher: parts[1] || '', room: parts[2] || '' };
}

// ── Matching to the school ──────────────────────────────────────────────────
const TITLES = /\b(mr|mrs|ms|miss|dr|prof|sir|madam|smt|shri|sri)\b\.?/g;
export const personKey = (s: string) => s.toLowerCase().replace(TITLES, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Match an imported teacher name to a school account: full name, email, then first initial + surname, then initials. */
export function matchTeacher(raw: string, people: { id: string; name: string; email?: string | null }[]): string | null {
  const k = personKey(raw);
  if (!k) return null;
  const email = raw.trim().toLowerCase();
  const byEmail = people.find(p => p.email && (p.email.toLowerCase() === email || p.email.toLowerCase().split('@')[0] === email));
  if (byEmail) return byEmail.id;
  const full = people.filter(p => personKey(p.name) === k);
  if (full.length === 1) return full[0].id;
  const parts = k.split(' ');
  const surname = parts[parts.length - 1];
  const initial = parts[0][0];
  const bySurname = people.filter(p => { const q = personKey(p.name).split(' '); return q[q.length - 1] === surname && q[0][0] === initial; });
  if (bySurname.length === 1) return bySurname[0].id;
  // aSc short codes: "AR" for Anita Rao.
  if (/^[a-z]{2,4}$/.test(k)) {
    const byInitials = people.filter(p => personKey(p.name).split(' ').map(w => w[0]).join('') === k);
    if (byInitials.length === 1) return byInitials[0].id;
  }
  return null;
}
const roomKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const guessRoomKind = (name: string): RoomKind =>
  /lab/i.test(name) ? 'lab' : /hall|auditorium/i.test(name) ? 'hall' : /librar/i.test(name) ? 'library' : /ground|field|court/i.test(name) ? 'ground' : 'classroom';

export interface Resolved {
  slots: Slot[];
  unmatchedTeachers: { raw: string; lessons: number }[];
  newRooms: { name: string; kind: RoomKind; lessons: number }[];
  problems: string[];
}

/**
 * Turns import rows into lessons: teachers matched to accounts or register members (people ids are person keys:
 * a user id, or "s:" + register id), or `teacherMap` from the review screen (raw name -> person key, or '' for
 * "no teacher"); rooms matched by name (unknown ones listed to create).
 * Duplicate lessons in one cell are dropped and reported.
 */
export function resolve(rows: ImportRow[], people: { id: string; name: string; email?: string | null }[], rooms: { id: string; name: string }[],
  teacherMap: Record<string, string> = {}): Resolved {
  const unmatched = new Map<string, number>();
  const newRooms = new Map<string, { name: string; kind: RoomKind; lessons: number }>();
  const seen = new Set<string>();
  const problems: string[] = [];
  let dup = 0;
  const cache = new Map<string, string | null>();
  const slots: Slot[] = [];
  for (const r of rows) {
    const key = `${normClass(r.class)}|${r.group.toLowerCase()}|${r.weekday}|${r.period}`;
    if (seen.has(key)) { dup++; continue; }
    seen.add(key);
    let teacher: string | null = null;
    const raw = r.teacher.trim();
    if (raw) {
      if (raw in teacherMap) teacher = teacherMap[raw] || null;
      else {
        if (!cache.has(raw)) cache.set(raw, matchTeacher(raw, people));
        teacher = cache.get(raw)!;
        if (!teacher) unmatched.set(raw, (unmatched.get(raw) || 0) + 1);
      }
    }
    let roomId: string | null = null;
    if (r.room.trim()) {
      const hit = rooms.find(x => roomKey(x.name) === roomKey(r.room));
      if (hit) roomId = hit.id;
      else {
        const n = newRooms.get(roomKey(r.room)) ?? { name: r.room.trim(), kind: guessRoomKind(r.room), lessons: 0 };
        n.lessons++;
        newRooms.set(roomKey(r.room), n);
      }
    }
    slots.push({
      class: displayClass(r.class), group_label: r.group.trim().slice(0, 40), weekday: r.weekday, period_no: r.period,
      subject: r.subject.trim().slice(0, 80), ...slotTeacher(teacher), room_id: roomId, combined: r.combined,
      // Rooms still to be created travel by name until the server creates them.
      ...(roomId || !r.room.trim() ? {} : { room_name: r.room.trim() }),
    } as Slot);
  }
  // The same teacher and subject in two sections at once came from a combined lesson in the source.
  const byTeacher = new Map<string, Slot[]>();
  for (const x of slots) { const p = slotPerson(x); if (p) { const k = `${p}|${x.weekday}|${x.period_no}`; byTeacher.set(k, [...(byTeacher.get(k) || []), x]); } }
  for (const xs of byTeacher.values()) {
    if (xs.length > 1 && new Set(xs.map(x => x.subject.toLowerCase())).size === 1) xs.forEach(x => { x.combined = true; });
  }
  if (dup) problems.push(`${dup} duplicate lesson${dup === 1 ? '' : 's'} in the same class and period were dropped.`);
  return { slots, unmatchedTeachers: [...unmatched].map(([raw, lessons]) => ({ raw, lessons })).sort((a, b) => b.lessons - a.lessons), newRooms: [...newRooms.values()], problems };
}
