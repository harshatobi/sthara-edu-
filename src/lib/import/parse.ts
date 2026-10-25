/**
 * Cells and files for bulk imports. Reads CSV/TSV (parseCsv) and .xlsx (readXlsx) from the timetable
 * importer, and turns header rows and cells into typed values with plain-English problems. Pure, so
 * the server runs exactly what the tests check.
 */
import { parseCsv, readXlsx } from '@/lib/schedule/importer';

export { parseCsv, readXlsx };

export type FileKind = 'csv' | 'xlsx';

export function kindOf(fileName: string): FileKind | null {
  const ext = fileName.toLowerCase().split('.').pop();
  return ext === 'csv' || ext === 'tsv' || ext === 'txt' ? 'csv' : ext === 'xlsx' ? 'xlsx' : null;
}

/** Rows of strings from a file's bytes. The first row is the header. */
export async function readTable(bytes: ArrayBuffer, kind: FileKind): Promise<string[][]> {
  if (kind === 'xlsx') return readXlsx(bytes);
  return parseCsv(new TextDecoder('utf-8').decode(bytes));
}

/** A header cell as a column key: "Admission No." -> "admission_no". */
export const headerKey = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// ── Dates ───────────────────────────────────────────────────────────────────

export type DateResult = { ok: true; iso: string } | { ok: false; error: string };

const pad = (n: number) => String(n).padStart(2, '0');

function real(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Excel stores dates as days since 1899-12-30 (the 1900 leap-year bug folded in). */
export function fromExcelSerial(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 73050) return null;
  const t = new Date(Date.UTC(1899, 11, 30) + n * 86_400_000);
  return real(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * Templates use DD-MM-YYYY. Also accepted: YYYY-MM-DD, DD.MM.YYYY, and DD/MM/YYYY when the day is
 * above 12 (so it can't be a US-style month first). From .xlsx, a date cell arrives as a serial
 * number. Anything else, two-digit years included, is refused rather than guessed.
 */
export function parseDate(raw: string, fromXlsx = false): DateResult {
  const v = raw.trim();
  const bad = { ok: false as const, error: `"${v}" isn't a date we can read. Write it as DD-MM-YYYY, for example 05-06-2024.` };
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) { const iso = real(+m[1], +m[2], +m[3]); return iso ? { ok: true, iso } : bad; }
  m = v.match(/^(\d{1,2})([-./])(\d{1,2})\2(\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[3];
    if (m[2] === '/' && d <= 12 && mo <= 12 && d !== mo) {
      return { ok: false, error: `"${v}" could be read two ways. Write it as DD-MM-YYYY, for example ${pad(d)}-${pad(mo)}-${m[4]}.` };
    }
    const iso = real(+m[4], mo, d);
    return iso ? { ok: true, iso } : bad;
  }
  if (fromXlsx && /^\d{3,5}(\.0+)?$/.test(v)) {
    const iso = fromExcelSerial(Math.floor(Number(v)));
    return iso ? { ok: true, iso } : bad;
  }
  return bad;
}

/** "2024-25" style session, also accepting "2024-2025" and "2024/25". */
export function parseSession(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const end = Number(m[2].length === 4 ? m[2].slice(2) : m[2]);
  return end === (y + 1) % 100 ? `${y}-${pad((y + 1) % 100)}` : null;
}

/** A number written by a person: commas and a leading rupee sign allowed, at most two decimals. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/^(₹|rs\.?|inr)\s*/i, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}
