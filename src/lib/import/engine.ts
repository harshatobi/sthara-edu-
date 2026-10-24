/**
 * The parts of an import that need no database: read the header, check every row, find repeats, cut the clean
 * rows into chunks for the writer, and build the downloadable template. Pure, so it is unit-tested and the dry
 * run on the server is exactly what the tests check.
 */
import { cell, type Cells, type Dataset, type Lookups, type Problem } from './datasets';
import { headerKey } from './parse';
import type { Sheet } from './xlsx';

/** Problems kept on the job for people to read; the count is always exact. */
export const PROBLEM_CAP = 500;
/** Rows per writer call. Small enough to stay well inside a statement timeout. */
export const CHUNK = 2000;
/** Largest file accepted (rows of data). */
export const MAX_ROWS = 500_000;

export interface Header { at: Map<string, number>; problems: string[] }

/** Which file column holds each dataset column. Unknown, repeated and missing required columns are problems. */
export function readHeader(d: Dataset, header: string[]): Header {
  const at = new Map<string, number>();
  const problems: string[] = [];
  const byName = new Map<string, string>();
  for (const c of d.columns) for (const n of [c.key, ...(c.aliases ?? [])]) byName.set(n, c.key);
  header.forEach((h, i) => {
    if (!h.trim()) return;
    const key = byName.get(headerKey(h));
    if (!key) problems.push(`Column "${h}" isn't part of the ${d.label.toLowerCase()} format. Remove it, or rename it to one of: ${d.columns.map(c => c.key).join(', ')}.`);
    else if (at.has(key)) problems.push(`Two columns mean ${key} ("${header[at.get(key)!]}" and "${h}"). Keep one.`);
    else at.set(key, i);
  });
  for (const c of d.columns) if (c.required && !at.has(c.key)) problems.push(`The file has no ${c.key} column, and it is required.`);
  return { at, problems };
}

export interface Checked {
  /** Clean rows, in writing order: n is the row's line in the file (the header is line 1). */
  rows: { n: number; row: Record<string, unknown> }[];
  problems: Problem[];
  problemCount: number;
  /** Rows with nothing to import (for example marks with neither marks nor a code). */
  skipped: number;
  total: number;
  fileProblems: string[];
}

/** Checks every row of a table (header first). Nothing here touches the database; lookups come in loaded. */
export function checkTable(d: Dataset, table: string[][], look: Lookups, fromXlsx: boolean): Checked {
  const out: Checked = { rows: [], problems: [], problemCount: 0, skipped: 0, total: Math.max(0, table.length - 1), fileProblems: [] };
  if (!table.length) { out.fileProblems.push('The file is empty.'); return out; }
  const head = readHeader(d, table[0]);
  out.fileProblems.push(...head.problems);
  if (out.total === 0) out.fileProblems.push('The file has a header but no rows.');
  if (out.total > MAX_ROWS) out.fileProblems.push(`The file has ${out.total.toLocaleString('en-IN')} rows. Split it into files of at most ${MAX_ROWS.toLocaleString('en-IN')}.`);
  if (out.fileProblems.length) return out;

  const note = (p: Problem) => { out.problemCount++; if (out.problems.length < PROBLEM_CAP) out.problems.push(p); };
  const seen = new Map<string, number>();
  for (let i = 1; i < table.length; i++) {
    const n = i + 1;
    const raw = table[i];
    const cells: Cells = {};
    let bad = false;
    for (const c of d.columns) {
      const idx = head.at.get(c.key);
      const r = cell(c, idx == null ? '' : raw[idx] ?? '', fromXlsx);
      if ('error' in r) { note({ n, column: c.key, error: r.error }); bad = true; } else cells[c.key] = r.value;
    }
    if (bad) continue;
    const id = d.identity(cells);
    if (id != null) {
      const first = seen.get(id);
      if (first != null) { note({ n, error: `Same record as row ${first}. Keep one of them.` }); continue; }
      seen.set(id, n);
    }
    const b = d.build(cells, n, look);
    if (b.ok === 'skip') out.skipped++;
    else if (b.ok) out.rows.push({ n, row: b.row });
    else for (const p of b.problems) note(p);
  }
  if (d.group) {
    // Stable: groups stay in the order their first row appears.
    const order = new Map<string, number>();
    out.rows.forEach((r, i) => { const g = d.group!(r.row); if (!order.has(g)) order.set(g, i); });
    out.rows.sort((a, b) => order.get(d.group!(a.row))! - order.get(d.group!(b.row))! || a.n - b.n);
  }
  return out;
}

/**
 * Cuts rows into writer calls of about `size`, never splitting a group (payments against one instalment are
 * checked together). A group bigger than `size` is a chunk of its own.
 */
export function chunks<T extends { row: Record<string, unknown> }>(rows: T[], size: number, group?: (r: Record<string, unknown>) => string): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  for (let i = 0; i < rows.length; i++) {
    cur.push(rows[i]);
    const next = rows[i + 1];
    const sameGroup = !!(group && next && group(next.row) === group(rows[i].row));
    if (cur.length >= size && !sameGroup) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Highest receipt number per session in Sthara's own format (RCT/2025-26/00041), for import_receipt_floor. */
export function receiptFloors(rows: { row: Record<string, unknown> }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { row } of rows) {
    const m = typeof row.receipt_no === 'string' ? row.receipt_no.match(/^RCT\/(\d{4}-\d{2})\/(\d{1,9})$/) : null;
    if (m) out[m[1]] = Math.max(out[m[1]] ?? 0, Number(m[2]));
  }
  return out;
}

/** The rows a writer receives: the row with its line number. */
export const payload = (rows: { n: number; row: Record<string, unknown> }[]) => rows.map(r => ({ n: r.n, ...r.row }));

// ── Templates ───────────────────────────────────────────────────────────────

/** The template workbook: a header and one example row, then a Guide sheet describing every column. */
export function template(d: Dataset): Sheet[] {
  const cols = d.columns;
  return [
    { name: d.label, rows: [cols.map(c => c.key), cols.map(c => c.example)], widths: cols.map(c => Math.max(12, Math.min(28, c.key.length + 4))) },
    {
      name: 'Guide',
      widths: [20, 12, 90],
      rows: [
        ['Column', 'Required', 'What to put in it'],
        ...cols.map(c => [c.key, c.required ? 'Yes' : 'No', [c.guide, c.aliases?.length ? `Also accepted as a header: ${c.aliases.join(', ')}.` : ''].filter(Boolean).join(' ')]),
        [],
        ['About', '', d.about],
        ['Where it goes', '', d.lands],
        ['Same record', '', `${d.matching} Importing a record again updates it; blank cells leave what is stored alone.`],
        ['Dates', '', 'DD-MM-YYYY (05-06-2024). YYYY-MM-DD also works. Dates that could be read two ways are refused.'],
        ['Example row', '', 'Delete the example row before importing.'],
      ],
    },
  ];
}

/** File name for a dataset's template. */
export const templateName = (d: Dataset) => `sthara-${d.key.replace(/_/g, '-')}-template.xlsx`;
