/**
 * "Automated Test Scripts" workbook: a copy of every automated script in this pack. An index (what
 * each covers, taken from the script's own header comment; its suite; how to run it; which
 * requirements and scripts it proves), every test by name, and each script's code on its own sheet.
 */
import fs from 'node:fs';
import path from 'node:path';
import type ExcelJS from 'exceljs';
import { MODULES, SCENARIOS, defects, reqId, scriptId } from '../../catalog';
import { QA, automatedTests } from '../inventory';
import { matchTests } from '../check-catalog';
import { table, finish, FONT } from './style';

const SUITES: [RegExp, string, string, string][] = [
  [/^regression\/unit\//, 'Unit regression (node:test)', 'Nothing (imports the app’s modules read-only)', 'npm run unit'],
  [/^e2e\/public\//, 'E2E public', 'A running app (local next dev is started for you)', 'npm run e2e:local'],
  [/^e2e\/api\//, 'E2E API', 'A running app', 'npm run e2e:local'],
  [/^e2e\/demo\//, 'E2E demo (local only)', 'Local next dev', 'npm run e2e:demo'],
  [/^e2e\/warmup\//, 'E2E warm-up (local only)', 'Local next dev', 'runs before e2e:demo'],
  [/^e2e\/prod\//, 'E2E test school (read-only)', 'e2e.env: test school code and accounts', 'npm run e2e:prod'],
  [/^e2e\/journeys\//, 'E2E journeys (write records)', 'e2e.env + E2E_ALLOW_WRITES=1, test school only', 'npm run e2e:journeys'],
  [/^e2e\/support\//, 'Shared helpers', '—', 'used by the E2E suites'],
  [/^regression\/shims\//, 'Shared helpers', '—', 'used by the unit suite'],
  [/^tools\/inventory/, 'Route and page discovery', 'The app’s source folder', 'npm run inventory'],
  [/^playwright\.config/, 'Runner configuration', '—', '—'],
  [/^run-regression/, 'One-command regression', 'Everything above', 'bash run-regression.sh'],
];

function files(): string[] {
  const out: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(path.join(QA, d), { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|sh)$/.test(e.name)) out.push(p); } };
  walk('regression'); walk('e2e');
  return [...out.sort(), 'tools/inventory.ts', 'playwright.config.ts', 'run-regression.sh'];
}

/** The script's opening doc comment, as one paragraph. */
function about(src: string) {
  const m = src.match(/\/\*\*([\s\S]*?)\*\//) ?? src.match(/^((?:#.*\n)+)/m);
  return (m?.[1] ?? '').split('\n').map(l => l.replace(/^\s*(\*|#!?)\s?/, '').trim()).filter(l => l && !l.startsWith('/usr/bin')).join(' ').replace(/\s+/g, ' ').trim();
}

export function scriptsBook(wb: ExcelJS.Workbook) {
  const traces = new Map<string, Set<string>>();
  const link = (owner: string, ref: string) => { for (const t of matchTests(ref)) (traces.get(t.file) ?? traces.set(t.file, new Set()).get(t.file)!).add(owner); };
  for (const m of MODULES) { for (const r of m.reqs) (r.auto ?? []).forEach(a => link(reqId(m.code, r.n), a)); for (const s of m.scripts) (s.auto ?? []).forEach(a => link(scriptId(m.code, s.n), a)); }
  for (const sc of SCENARIOS) (sc.auto ?? []).forEach(a => link(sc.id, a));
  for (const d of defects) (d.auto ?? []).forEach(a => link(d.id, a));
  const tests = automatedTests().filter(t => t.owner === 'qa');

  const idx = table(wb, 'Script Index', [
    { header: 'Sheet', key: 'sheet', width: 22 }, { header: 'Script file', key: 'file', width: 40 }, { header: 'Suite', key: 'suite', width: 26 },
    { header: 'What it covers', key: 'about', width: 80 }, { header: 'Test definitions', key: 'n', width: 11 }, { header: 'Needs', key: 'needs', width: 30 },
    { header: 'Run with', key: 'run', width: 22 }, { header: 'Proves (requirements, scripts, scenarios, defects)', key: 'proves', width: 60 },
  ], 'FF2F6BFF');
  const all = table(wb, 'All Tests', [{ header: 'Script file', key: 'file', width: 40 }, { header: 'Test', key: 'name', width: 100 }], 'FF2F6BFF');
  for (const t of tests) all.addRow({ file: t.file.replace(/^qa:/, ''), name: t.name });
  finish(all);

  const used = new Set<string>();
  for (const f of files()) {
    const src = fs.readFileSync(path.join(QA, f), 'utf8');
    const [, suite, needs, run] = SUITES.find(([re]) => re.test(f)) ?? [null, 'Other', '—', '—'];
    let sheet = path.basename(f).replace(/\.(ts|sh)$/, '').slice(0, 28);
    if (used.has(sheet)) sheet = `${path.basename(path.dirname(f))}-${sheet}`.slice(0, 31);
    used.add(sheet);
    const n = tests.filter(t => t.file === `qa:${f}`).length;
    const generated = /auth-gates/.test(f) ? ' The sweep generates one test per route, method and credential at run time (about 280).' : '';
    const row = idx.addRow({ sheet, file: f, suite, about: about(src) + generated, n: n || '', needs, run, proves: [...(traces.get(`qa:${f}`) ?? [])].sort().join(', ') });
    row.getCell('sheet').value = { text: sheet, hyperlink: `#'${sheet}'!A1` };
    const ws = wb.addWorksheet(sheet, { properties: { tabColor: { argb: /^e2e/.test(f) ? 'FF7C5CFC' : 'FF94A3B8' } } });
    ws.columns = [{ header: 'Line', key: 'n', width: 6 }, { header: f, key: 'code', width: 160 }];
    ws.getRow(1).font = { name: FONT, bold: true };
    src.replace(/\n$/, '').split('\n').forEach((line, i) => {
      const r = ws.addRow({ n: i + 1, code: line });
      r.getCell('code').font = { name: 'Courier New', size: 9 };
      r.getCell('n').font = { name: FONT, size: 8, color: { argb: 'FF8A96A8' } };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  finish(idx);
  idx.eachRow((r, i) => { if (i > 1) r.getCell('sheet').font = { name: FONT, size: 10, color: { argb: 'FF2F6BFF' }, underline: true }; });
  return { files: files().length, tests: tests.length };
}

/** How many script files the workbook copies (for the cover). */
export const scriptFileCount = () => files().length;
