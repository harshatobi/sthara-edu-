/** Academic sessions, money and dates for the admin ERP. Pure, no I/O. */

// ── Academic session (Indian schools: April to March) ───────────────────────
/** "2026-27" for any date from 1 Apr 2026 to 31 Mar 2027. */
export function sessionOf(d: Date = new Date()): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
export function nextSession(s: string): string {
  const y = Number(s.slice(0, 4)) + 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
/** 1 April of the session's first year, as YYYY-MM-DD. */
export const sessionStart = (s: string) => `${s.slice(0, 4)}-04-01`;
export const isSession = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s)
  && (Number(s.slice(0, 4)) + 1) % 100 === Number(s.slice(5));

/** "Class 10-A" / "10a" / "Grade 9" -> 10 / 10 / 9; null when there's no number (matches app.grade_of). */
export function gradeOf(cls: string | null | undefined): number | null {
  const m = (cls || '').match(/(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? n : null;
}

// ── Dates ───────────────────────────────────────────────────────────────────
export const DAY = 86_400_000;
/** Local calendar date as YYYY-MM-DD (not UTC — a 9am IST receipt is "today"). */
export function isoDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Whole days from a to b (YYYY-MM-DD or ISO timestamps), by calendar date. */
export function daysBetween(a: string, b: string): number {
  const d = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((d(b.slice(0, 10)) - d(a.slice(0, 10))) / DAY);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "09 Apr 2026" (or "09 Apr" with short). */
export function fmtDate(iso: string | null | undefined, short = false): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  const s = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
  return short ? s : `${s} ${d.getFullYear()}`;
}
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : fmtDate(iso);
}

// ── Money (Indian grouping) ─────────────────────────────────────────────────
/** Paise-safe rounding for rupee arithmetic. */
export const r2 = (n: number) => Math.round(n * 100) / 100;
/** "₹1,20,000" (or "₹1,20,000.50" when there are paise). */
export function inr(n: number): string {
  const v = r2(n);
  return `${v < 0 ? '-' : ''}₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
/** Compact: "₹18.4 L", "₹1.25 Cr", "₹42,000". */
export function inrShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 1 : 2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)} L`;
  return inr(n);
}
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A CSV file body; every cell quoted, formula-leading cells defused for spreadsheets. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s) && typeof v === 'string') s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return rows.map(r => r.map(cell).join(',')).join('\r\n');
}
