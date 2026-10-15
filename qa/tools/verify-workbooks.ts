/**
 * Recalculates every formula in the built workbooks with HyperFormula (no Excel or LibreOffice needed):
 *  1. no formula evaluates to an error;
 *  2. every pre-computed value (what previewers show) equals the recalculated one;
 *  3. the roll-ups are right: marking steps Pass / Fail changes the script, module and summary statuses as designed.
 * Run: npm run verify (after npm run docs). Exit 1 on any problem.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { HyperFormula, type CellValue } from 'hyperformula';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../workbooks');
const problems: string[] = [];

async function load(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(DIR, file));
  const sheets: Record<string, (string | number | boolean | null)[][]> = {};
  const cached: { sheet: string; addr: string; row: number; col: number; want: unknown }[] = [];
  wb.eachSheet(ws => {
    const grid: (string | number | boolean | null)[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const line: (string | number | boolean | null)[] = [];
      row.eachCell({ includeEmpty: true }, (c, col) => {
        const v = c.value as unknown;
        if (v && typeof v === 'object' && 'formula' in (v as object)) {
          const fv = v as { formula: string; result?: unknown };
          line[col - 1] = `=${fv.formula}`;
          cached.push({ sheet: ws.name, addr: c.address, row: r - 1, col: col - 1, want: fv.result });
        } else if (v === null || v === undefined || typeof v === 'object') line[col - 1] = typeof v === 'object' && v ? String((v as { text?: string }).text ?? '') : null;
        else line[col - 1] = v as string | number | boolean;
      });
      grid[r - 1] = line;
    });
    sheets[ws.name] = grid.map(l => l ?? []);
  });
  const hf = HyperFormula.buildFromSheets(sheets, { licenseKey: 'gpl-v3' });
  return { hf, cached };
}

const isErr = (v: CellValue) => typeof v === 'object' && v !== null && 'type' in (v as object);
const near = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b);

async function checkBook(file: string) {
  const { hf, cached } = await load(file);
  let errs = 0, diffs = 0, zeros = 0;
  for (const c of cached) {
    const id = hf.getSheetId(c.sheet)!;
    const got = hf.getCellValue({ sheet: id, row: c.row, col: c.col });
    // exceljs writes a cached 0 as <v>0</v> but reads it back as undefined: count it apart, it is not stale.
    if (c.want === undefined && got === 0) { zeros++; continue; }
    if (isErr(got)) { errs++; if (errs <= 10) problems.push(`${file} ${c.sheet}!${c.addr}: ${(got as { value?: string }).value ?? 'error'}`); }
    else if (!near(got, c.want)) { diffs++; if (diffs <= 10) problems.push(`${file} ${c.sheet}!${c.addr}: shows ${JSON.stringify(c.want)}, recalculates to ${JSON.stringify(got)}`); }
  }
  console.log(`${file}: ${cached.length} formulas, ${errs} errors, ${diffs} stale values (${zeros} cached zeros)`);
  return hf;
}

/** Drives statuses on the first script of TE.040 and checks every level of the roll-up follows. */
function rollupScenario(hf: HyperFormula) {
  const idx = hf.getSheetId('Script Index')!, sum = hf.getSheetId('Summary')!;
  const firstId = hf.getCellValue({ sheet: idx, row: 1, col: 0 }) as string;
  const mod = hf.getCellValue({ sheet: idx, row: 1, col: 1 }) as string;
  const stepsSheet = hf.getSheetNames().find(n => n.startsWith(`${mod} `))!;
  const ss = hf.getSheetId(stepsSheet)!;
  const rows: number[] = [];
  for (let r = 1; r < hf.getSheetDimensions(ss).height; r++) {
    if (hf.getCellValue({ sheet: ss, row: r, col: 0 }) === firstId && typeof hf.getCellValue({ sheet: ss, row: r, col: 1 }) === 'number') rows.push(r);
  }
  const status = () => hf.getCellValue({ sheet: idx, row: 1, col: 16 });
  const sumRow = 3; // first module row on Summary (row 4)
  const expect = (label: string, got: unknown, want: unknown) => { if (got !== want) problems.push(`roll-up: ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
  expect('untouched script', status(), 'Not run');
  hf.setCellContents({ sheet: ss, row: rows[0], col: 7 }, 'Pass');
  expect('one step passed', status(), 'In progress');
  rows.forEach(r => hf.setCellContents({ sheet: ss, row: r, col: 7 }, 'Pass'));
  expect('all steps passed', status(), 'Pass');
  expect('summary Pass count', hf.getCellValue({ sheet: sum, row: sumRow, col: 4 }), 1);
  hf.setCellContents({ sheet: ss, row: rows[rows.length - 1], col: 7 }, 'N/A');
  expect('pass with one N/A', status(), 'Pass');
  hf.setCellContents({ sheet: ss, row: rows[0], col: 7 }, 'Blocked');
  expect('a blocked step', status(), 'Blocked');
  hf.setCellContents({ sheet: ss, row: rows[1] ?? rows[0], col: 7 }, 'Fail');
  expect('a failed step wins', status(), 'Fail');
  expect('summary Fail count', hf.getCellValue({ sheet: sum, row: sumRow, col: 5 }), 1);
  console.log(`roll-up check on ${firstId} (${rows.length} steps): ${problems.some(p => p.startsWith('roll-up')) ? 'FAILED' : 'ok'}`);
}

async function main() {
  await checkBook('Sthara_BR030_Solution_Matrix.xlsx');
  rollupScenario(await checkBook('Sthara_TE040_System_Test_Scripts.xlsx'));
  await checkBook('Sthara_TE050_Integration_Test_Scripts.xlsx');
  await checkBook('Sthara_TE130_UAT_Scripts.xlsx');
  if (problems.length) { console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`); process.exit(1); }
  console.log('All workbook formulas recalculate without errors and match what they show.');
}

main().catch(e => { console.error(e); process.exit(1); });
