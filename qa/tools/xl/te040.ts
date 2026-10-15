/** TE.040 System Test Scripts: index (with status roll-up), one step sheet per module, summary. */
import type ExcelJS from 'exceljs';
import { MODULES, resolveReq, scriptId } from '../../catalog';
import { table, finish, statusColumn, f, q, BAND, FONT } from './style';

const SHORT: Record<string, string> = {
  AUTH: 'Sign-in & access', OPS: 'Platform Manager', SUP: 'School Manager support', OFF: 'Command Centre & Probe', ACC: 'Roles & Directory', STF: 'Staff & Leave',
  MSG: 'Messages', FEE: 'Fees', ADM: 'Admissions', SCH: 'Bells & Calendar', TT: 'Timetable & Auto-build', COV: 'Cover & Duties',
  ATT: 'Staff Attendance', LOAD: 'Load & My Schedule', FEED: 'Feed & Incidents', ACA: 'Academic, Wellness, DPDP',
  TCH: 'Teacher Desk & Register', HW: 'Homework & Quizzes', GRD: 'Grading & Capture', SYL: 'Syllabus & Lessons',
  COP: 'Copilot & Insights', STU: 'Student & Tutor', PAR: 'Parent Portal', WA: 'WhatsApp', NFR: 'Security & Quality',
};
/** Tab name for a module's step sheet: code plus a short label, within Excel's 31 characters. */
export const sheetName = (code: string, name: string) => `${code} ${SHORT[code] ?? name}`.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim();

export const STEP_COLS = [
  { header: 'Script ID', key: 'id', width: 15 }, { header: 'Step', key: 'step', width: 6 }, { header: 'Role', key: 'role', width: 18 },
  { header: 'Action', key: 'action', width: 58 }, { header: 'Test data', key: 'data', width: 26 }, { header: 'Expected result', key: 'expected', width: 58 },
  { header: 'Actual result', key: 'actual', width: 36, input: true }, { header: 'Status', key: 'status', width: 11, input: true },
  { header: 'Tester', key: 'tester', width: 14, input: true }, { header: 'Date', key: 'date', width: 11, input: true },
  { header: 'Defect ID', key: 'defect', width: 11, input: true }, { header: 'Evidence / notes', key: 'evidence', width: 30, input: true },
];

/** Status roll-up formulas for one script whose steps live on `sheet` (Script ID in A, step no. in B, status in H). */
export function rollup(sheet: string, idCell: string, steps: number) {
  const S = q(sheet);
  const n = (status: string) => `COUNTIFS(${S}!$A:$A,${idCell},${S}!$H:$H,"${status}")`;
  return {
    steps: f(`COUNTIFS(${S}!$A:$A,${idCell},${S}!$B:$B,">0")`, steps),
    pass: f(n('Pass'), 0), fail: f(n('Fail'), 0), blocked: f(n('Blocked'), 0),
    status: (p: string, fl: string, b: string, st: string) => f(`IF(${fl}>0,"Fail",IF(${b}>0,"Blocked",IF(${p}+${n('N/A')}=${st},"Pass",IF(${p}+${n('N/A')}>0,"In progress","Not run"))))`, 'Not run'),
  };
}

export function te040(wb: ExcelJS.Workbook) {
  const summary = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF10B981' } } });
  const idx = table(wb, 'Script Index', [
    { header: 'Script ID', key: 'id', width: 15 }, { header: 'Module', key: 'mod', width: 8 }, { header: 'Title', key: 'title', width: 46 },
    { header: 'Role', key: 'role', width: 22 }, { header: 'Permission', key: 'perm', width: 18 }, { header: 'Priority', key: 'pri', width: 9 },
    { header: 'Type', key: 'type', width: 11 }, { header: 'Requirements', key: 'req', width: 22 }, { header: 'Pre-conditions', key: 'pre', width: 44 },
    { header: 'Test data', key: 'data', width: 30 }, { header: 'Automated by', key: 'auto', width: 44 }, { header: 'UAT', key: 'uat', width: 6 },
    { header: 'Steps', key: 'steps', width: 7 }, { header: 'Pass', key: 'pass', width: 6 }, { header: 'Fail', key: 'fail', width: 6 },
    { header: 'Blocked', key: 'blocked', width: 8 }, { header: 'Status', key: 'status', width: 11 },
    { header: 'Assigned tester', key: 'tester', width: 16, input: true }, { header: 'Planned date', key: 'planned', width: 12, input: true },
  ], 'FF2F6BFF');

  for (const m of MODULES) {
    const name = sheetName(m.code, m.name);
    const ws = table(wb, name, STEP_COLS);
    for (const s of m.scripts) {
      const id = scriptId(m.code, s.n);
      const head = ws.addRow({ id, role: s.role, action: `▶ ${s.title}`, data: s.data ?? '', expected: `Pre-conditions: ${s.pre}` });
      head.eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }; });
      head.getCell('action').font = { name: FONT, bold: true };
      s.steps.forEach((st, i) => ws.addRow({ id, step: i + 1, role: s.role, action: st[0], data: st[2] ?? '', expected: st[1], status: 'Not run' }));
      const r = idx.rowCount + 1;
      const R = rollup(name, `A${r}`, s.steps.length);
      idx.addRow({
        id, mod: m.code, title: s.title, role: s.role, perm: s.perm ?? '', pri: s.priority, type: s.type,
        req: s.req.map(x => resolveReq(m.code, x)).join(', '), pre: s.pre, data: s.data ?? '',
        auto: (s.auto ?? []).map(a => a.replace(/^~/, '').replace('::', ' › ')).join('\n') || 'Manual', uat: s.uat ? 'Yes' : '',
        steps: R.steps, pass: R.pass, fail: R.fail, blocked: R.blocked, status: R.status(`N${r}`, `O${r}`, `P${r}`, `M${r}`),
      });
    }
    finish(ws);
    statusColumn(ws, 'H', ws.rowCount);
  }
  finish(idx);
  statusColumn(idx, 'Q', idx.rowCount, false);

  // Summary by module (formulas over the index).
  summary.columns = [{ width: 8 }, { width: 38 }, { width: 9 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 9 }, { width: 11 }, { width: 9 }, { width: 11 }, { width: 11 }];
  const heads = ['Module', 'Name', 'Scripts', 'Steps', 'Pass', 'Fail', 'Blocked', 'In progress', 'Not run', '% executed', '% passed'];
  summary.getCell('A1').value = 'TE.040 execution summary';
  summary.getCell('A1').font = { name: FONT, bold: true, size: 16, color: { argb: 'FF062347' } };
  const hr = summary.getRow(3);
  heads.forEach((h, i) => { const c = hr.getCell(i + 1); c.value = h; c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF062347' } }; });
  const I = "'Script Index'";
  MODULES.forEach((m, i) => {
    const r = 4 + i, n = m.scripts.length, steps = m.scripts.reduce((k, s) => k + s.steps.length, 0);
    const cnt = (st: string) => f(`COUNTIFS(${I}!$B:$B,$A${r},${I}!$Q:$Q,"${st}")`, st === 'Not run' ? n : 0);
    const row = summary.getRow(r);
    row.values = [m.code, m.name, f(`COUNTIF(${I}!$B:$B,$A${r})`, n), f(`SUMIF(${I}!$B:$B,$A${r},${I}!$M:$M)`, steps), cnt('Pass'), cnt('Fail'), cnt('Blocked'), cnt('In progress'), cnt('Not run'),
      f(`IF(C${r}=0,0,(C${r}-I${r})/C${r})`, 0), f(`IF(C${r}-I${r}=0,0,E${r}/(C${r}-I${r}))`, 0)];
  });
  const t = 4 + MODULES.length, last = t - 1;
  const total = summary.getRow(t);
  const sum = (col: string, v: number) => f(`SUM(${col}4:${col}${last})`, v);
  const allS = MODULES.reduce((k, m) => k + m.scripts.length, 0), allSt = MODULES.reduce((k, m) => k + m.scripts.reduce((j, s) => j + s.steps.length, 0), 0);
  total.values = ['', 'Total', sum('C', allS), sum('D', allSt), sum('E', 0), sum('F', 0), sum('G', 0), sum('H', 0), sum('I', allS), f(`IF(C${t}=0,0,(C${t}-I${t})/C${t})`, 0), f(`IF(C${t}-I${t}=0,0,E${t}/(C${t}-I${t}))`, 0)];
  total.font = { name: FONT, bold: true };
  for (let r = 4; r <= t; r++) { summary.getCell(`J${r}`).numFmt = '0%'; summary.getCell(`K${r}`).numFmt = '0%'; summary.getRow(r).font = { name: FONT, size: 10, bold: r === t }; }
  return { summary, idx };
}
