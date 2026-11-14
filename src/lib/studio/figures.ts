/**
 * Pictures that come with a bank question (diagrams and maps cropped from CBSE's own papers by scripts/cbse-bank).
 * Pure, runs in the browser and on the server.
 *   parseFigures   keeps only paths inside the public 'bank-figures' bucket: a question saved by a teacher or posted
 *                  to an assignment can never point a student's screen at another address
 *   figureUrl      the public link for a path
 *   figureWidth    the share of the text column the picture took in the printed paper, so it shows at its own size
 */
export interface BankFigure {
  /** Path inside the bank-figures bucket, e.g. cbse/2026-27/class-10/science/sqp/q2_1.png */
  path: string;
  /** Printed width and height (points) and the paper's text column width, when known. */
  w?: number | null;
  h?: number | null;
  col?: number | null;
}

/** CBSE's own text-only version of a question that relies on a picture (printed for visually impaired candidates). */
export interface TextVersion { text: string; options?: string[]; answer?: number | null; scheme?: string }

const PATH = /^cbse\/[a-z0-9][a-z0-9_.-]*(\/[a-z0-9][a-z0-9_.-]*){1,8}\.png$/;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 5000 ? Math.round(v * 10) / 10 : null);

export function parseFigures(raw: unknown, max = 8): BankFigure[] {
  if (!Array.isArray(raw)) return [];
  const out: BankFigure[] = [];
  for (const r of raw.slice(0, max)) {
    const path = typeof r === 'string' ? r : (r as any)?.path;
    if (typeof path !== 'string' || path.length > 240 || path.includes('..') || !PATH.test(path)) continue;
    out.push({ path, w: num((r as any)?.w), h: num((r as any)?.h), col: num((r as any)?.col) });
  }
  return out;
}

export function parseTextVersion(raw: unknown): TextVersion | null {
  const r = raw as any;
  const text = typeof r?.text === 'string' ? r.text.trim().slice(0, 2000) : '';
  if (!text) return null;
  const out: TextVersion = { text };
  if (Array.isArray(r.options) && r.options.length >= 2 && r.options.every((o: unknown) => typeof o === 'string' && o.trim())) {
    out.options = r.options.slice(0, 6).map((o: string) => o.trim().slice(0, 500));
    out.answer = Number.isInteger(r.answer) && r.answer >= 0 && r.answer < out.options!.length ? r.answer : null;
  }
  if (typeof r.scheme === 'string' && r.scheme.trim()) out.scheme = r.scheme.trim().slice(0, 3000);
  return out;
}

export const FIGURE_BUCKET = 'bank-figures';

export function figureUrl(path: string): string {
  // Same fallback as lib/supabase/client: the env value can be absent in the browser build.
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://nqwvsuyiwswnsqbyhghb.supabase.co').replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${FIGURE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Width as a percentage of the text column, as printed (a small diagram stays small); 100 when unknown. */
export function figureWidth(f: BankFigure): number {
  if (!f.w || !f.col) return 100;
  return Math.max(20, Math.min(100, Math.round((f.w / f.col) * 100)));
}
