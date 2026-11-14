/**
 * Paper quizzes on bubble sheets (decision 2026-11-10, round 6). Pure: runs in the browser and on the server.
 *   sheetCodes     a short code per student for one assignment ("K7Q2-14"): the prefix names the assignment, the
 *                  number the student (register order), so a photo of any sheet says whose it is
 *   readSheets     the vision model's reply, checked against the codes and question counts that exist
 *   scoreSheet     a student's picks against their own questions' key
 */
import type { Question } from '@/lib/teacher/questions';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1: they read alike on paper

/** Four characters from the assignment id: the same assignment always gets the same prefix. */
export function sheetPrefix(assignmentId: string): string {
  let h = 2166136261;
  for (const c of assignmentId.replace(/-/g, '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let out = '';
  for (let i = 0; i < 4; i++) { out += ALPHA[h % ALPHA.length]; h = Math.floor(h / ALPHA.length) || (h ^ 0x9e3779b9) >>> 0; }
  return out;
}

export function sheetCodes(assignmentId: string, studentIds: string[]): { studentId: string; code: string }[] {
  const p = sheetPrefix(assignmentId);
  return studentIds.map((id, i) => ({ studentId: id, code: `${p}-${i + 1}` }));
}

/** What a printed code looks like once read: upper case, the usual misreadings mapped back. */
export function normCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/\s+/g, '').replace(/[–—_]/g, '-');
  const m = /^([A-Z0-9]{4})-?(\d{1,3})$/.exec(s);
  if (!m) return null;
  const prefix = m[1].replace(/O/g, 'Q').replace(/0/g, 'Q').replace(/I/g, 'J').replace(/1/g, 'J');
  return `${prefix}-${Number(m[2])}`;
}

export interface SheetRead {
  code: string;
  studentId: string | null;
  /** One entry per question on that student's sheet: the option index, or null for blank. */
  picks: (number | null)[];
  /** Question numbers (1-based) where more than one circle was filled or the mark was unclear. */
  unclear: number[];
}

/**
 * The model's reply -> sheets the teacher can confirm. A code that isn't on this assignment is kept (studentId null)
 * so the teacher sees it and can pick the student; answers beyond a sheet's question count are dropped.
 */
export function readSheets(raw: unknown, codes: Map<string, { studentId: string; questions: number; options: number[] }>): SheetRead[] {
  const list = Array.isArray((raw as any)?.sheets) ? (raw as any).sheets : [];
  const out: SheetRead[] = [];
  for (const s of list.slice(0, 40)) {
    const code = normCode(s?.code);
    if (!code) continue;
    const known = codes.get(code);
    const n = known?.questions ?? Math.min(60, Object.keys(s?.answers ?? {}).length);
    const picks: (number | null)[] = Array.from({ length: n }, () => null);
    const unclear: number[] = [];
    for (let q = 1; q <= n; q++) {
      const v = s?.answers?.[String(q)] ?? s?.answers?.[q];
      if (v === null || v === undefined || v === '') continue;
      const letter = String(v).trim().toUpperCase();
      const k = 'ABCDEF'.indexOf(letter);
      const max = known?.options[q - 1] ?? 4;
      if (letter.length === 1 && k >= 0 && k < max) picks[q - 1] = k;
      else unclear.push(q);
    }
    // The same sheet in two photos: keep the reading with fewer blanks and unclear marks.
    const dup = out.findIndex(x => x.code === code);
    const score = (r: SheetRead) => r.picks.filter(p => p !== null).length - r.unclear.length;
    const row: SheetRead = { code, studentId: known?.studentId ?? null, picks, unclear };
    if (dup >= 0) { if (score(row) > score(out[dup])) out[dup] = row; }
    else out.push(row);
  }
  return out;
}

/** Marks for one student's picks against their own questions. Only choice questions score; others stay at 0 of their marks. */
export function scoreSheet(questions: Question[], picks: (number | null)[]): { items: { question_index: number; score: number; max_score: number }[]; score: number; max: number } {
  const items = questions.map((q, i) => {
    const max = Number(q.marks) > 0 ? Number(q.marks) : 1;
    const right = q.type === 'mcq' && typeof q.answer === 'number' && picks[i] === q.answer;
    return { question_index: i, score: right ? max : 0, max_score: max };
  });
  return { items, score: items.reduce((n, x) => n + x.score, 0), max: items.reduce((n, x) => n + x.max_score, 0) };
}
