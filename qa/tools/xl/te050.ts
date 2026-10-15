/** TE.050 Integration (end-to-end) scenarios: index with roll-up, all steps on one sheet, summary by process. */
import type ExcelJS from 'exceljs';
import { SCENARIOS, PROCESSES } from '../../catalog';
import { table, finish, statusColumn, f, BAND, FONT } from './style';
import { STEP_COLS, rollup } from './te040';

export function te050(wb: ExcelJS.Workbook) {
  const summary = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF10B981' } } });
  const idx = table(wb, 'Scenario Index', [
    { header: 'Scenario', key: 'id', width: 9 }, { header: 'Title', key: 'title', width: 44 }, { header: 'Business processes', key: 'proc', width: 30 },
    { header: 'Roles involved', key: 'roles', width: 34 }, { header: 'Priority', key: 'pri', width: 9 }, { header: 'Objective', key: 'obj', width: 46 },
    { header: 'Pre-conditions', key: 'pre', width: 40 }, { header: 'Test data', key: 'data', width: 32 }, { header: 'Requirements', key: 'req', width: 30 },
    { header: 'Automated core', key: 'auto', width: 40 }, { header: 'Steps', key: 'steps', width: 7 }, { header: 'Pass', key: 'pass', width: 6 },
    { header: 'Fail', key: 'fail', width: 6 }, { header: 'Blocked', key: 'blocked', width: 8 }, { header: 'Status', key: 'status', width: 11 },
    { header: 'Assigned tester', key: 'tester', width: 16, input: true }, { header: 'Planned date', key: 'planned', width: 12, input: true },
  ], 'FF2F6BFF');
  const cols = STEP_COLS.map(c => (c.key === 'data' ? { ...c, header: 'TE.040 script', width: 16 } : c));
  const ws = table(wb, 'Scenarios', cols);
  for (const sc of SCENARIOS) {
    const head = ws.addRow({ id: sc.id, role: sc.roles.join(', '), action: `▶ ${sc.title}`, data: '', expected: `Pre-conditions: ${sc.pre}  ·  Data: ${sc.data}` });
    head.eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }; });
    head.getCell('action').font = { name: FONT, bold: true };
    sc.steps.forEach((st, i) => ws.addRow({ id: sc.id, step: i + 1, role: st.role, action: st.action, data: st.ref ? `TE040-${st.ref}` : '', expected: st.expected, status: 'Not run' }));
    const r = idx.rowCount + 1;
    const R = rollup('Scenarios', `A${r}`, sc.steps.length);
    idx.addRow({
      id: sc.id, title: sc.title, proc: sc.processes.map(p => `${p} ${PROCESSES[p]}`).join('\n'), roles: sc.roles.join(', '), pri: sc.priority,
      obj: sc.objective, pre: sc.pre, data: sc.data, req: sc.req.join(', '),
      auto: (sc.auto ?? []).map(a => a.replace(/^~/, '').replace('::', ' › ')).join('\n') || 'Manual',
      steps: R.steps, pass: R.pass, fail: R.fail, blocked: R.blocked, status: R.status(`L${r}`, `M${r}`, `N${r}`, `K${r}`),
    });
  }
  finish(ws); finish(idx);
  statusColumn(ws, 'H', ws.rowCount);
  statusColumn(idx, 'O', idx.rowCount, false);

  summary.columns = [{ width: 10 }, { width: 50 }, { width: 11 }, { width: 8 }, { width: 8 }, { width: 9 }, { width: 11 }];
  summary.getCell('A1').value = 'TE.050 execution summary';
  summary.getCell('A1').font = { name: FONT, bold: true, size: 16, color: { argb: 'FF062347' } };
  const heads = ['Scenario', 'Title', 'Steps', 'Pass', 'Fail', 'Blocked', 'Status'];
  heads.forEach((h, i) => { const c = summary.getRow(3).getCell(i + 1); c.value = h; c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF062347' } }; });
  const I = "'Scenario Index'";
  SCENARIOS.forEach((sc, i) => {
    const r = 4 + i, src = i + 2;
    summary.getRow(r).values = [sc.id, sc.title, f(`${I}!K${src}`, sc.steps.length), f(`${I}!L${src}`, 0), f(`${I}!M${src}`, 0), f(`${I}!N${src}`, 0), f(`${I}!O${src}`, 'Not run')];
    summary.getRow(r).font = { name: FONT, size: 10 };
  });
  const t = 4 + SCENARIOS.length;
  summary.getRow(t).values = ['', 'Scenarios passed', f(`COUNTA(A4:A${t - 1})`, SCENARIOS.length), f(`COUNTIF(G4:G${t - 1},"Pass")`, 0), f(`COUNTIF(G4:G${t - 1},"Fail")`, 0), f(`COUNTIF(G4:G${t - 1},"Blocked")`, 0), f(`IF(C${t}=0,0,D${t}/C${t})`, 0)];
  summary.getRow(t).font = { name: FONT, size: 10, bold: true };
  summary.getCell(`G${t}`).numFmt = '0%';
  statusColumn(summary, 'G', t - 1, false);
  return { summary, idx, ws };
}
