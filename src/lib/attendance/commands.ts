/**
 * WhatsApp attendance words. Pure (text in, intent out), so they're unit tested.
 *   IN / CHECK IN / REACHED          check in now
 *   OUT / CHECK OUT / LEAVING        check out now
 *   LEAVE 12 Oct [to 14 Oct] reason  ask for leave (staff with no login; the office approves it)
 *   LEAVE TODAY|TOMORROW reason
 */
import { addDays } from '@/lib/schedule/engine';

export type AttendanceWord = { kind: 'check_in' } | { kind: 'check_out' };

export function parseAttendanceWord(raw: string): AttendanceWord | null {
  const t = raw.trim().toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
  if (/^(in|check ?in|checked in|checking in|i'?m in|i am in|reached|present)$/.test(t)) return { kind: 'check_in' };
  if (/^(out|check ?out|checked out|checking out|leaving|going home)$/.test(t)) return { kind: 'check_out' };
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "12 oct", "12/10", "12-10-2026", "today", "tomorrow" -> YYYY-MM-DD (the next such date on or after today). */
export function parseDateWord(word: string, today: string): string | null {
  const w = word.trim().toLowerCase();
  if (w === 'today') return today;
  if (w === 'tomorrow' || w === 'tmrw') return addDays(today, 1);
  let d: number, m: number, y: number | null = null;
  const a = w.match(/^(\d{1,2})\s*([a-z]{3})[a-z]*(?:\s+(\d{4}))?$/);
  const b = w.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (a && MONTHS.includes(a[2])) { d = Number(a[1]); m = MONTHS.indexOf(a[2]) + 1; y = a[3] ? Number(a[3]) : null; }
  else if (b) { d = Number(b[1]); m = Number(b[2]); y = b[3] ? Number(b[3].length === 2 ? `20${b[3]}` : b[3]) : null; }
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const year = y ?? Number(today.slice(0, 4));
  let iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) || new Date(`${iso}T00:00:00Z`).getUTCDate() !== d) return null;
  if (!y && iso < today) iso = `${year + 1}${iso.slice(4)}`;
  return iso;
}

export type LeaveWord = { kind: 'leave'; from: string; to: string; reason: string } | { kind: 'leave_help' };

/** "LEAVE 12 Oct to 14 Oct sister's wedding", "leave tomorrow fever". */
export function parseLeaveWord(raw: string, today: string): LeaveWord | null {
  const m = raw.trim().match(/^leave\b\s*(.*)$/i);
  if (!m) return null;
  const rest = m[1].trim();
  if (!rest) return { kind: 'leave_help' };
  const DATE = '(today|tomorrow|tmrw|\\d{1,2}\\s*[a-z]{3,9}(?:\\s+\\d{4})?|\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?)';
  const re = new RegExp(`^${DATE}(?:\\s*(?:to|-|till|until)\\s*${DATE})?\\s*(.*)$`, 'i');
  const x = rest.match(re);
  if (!x) return { kind: 'leave_help' };
  const from = parseDateWord(x[1], today);
  const to = x[2] ? parseDateWord(x[2], today) : from;
  const reason = (x[3] || '').replace(/^[-:,\s]+/, '').trim();
  if (!from || !to || to < from || !reason) return { kind: 'leave_help' };
  return { kind: 'leave', from, to, reason: reason.slice(0, 500) };
}
