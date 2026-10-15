/** TE.130 User Acceptance: scripts grouped by the role that runs them, the end-to-end scenarios, and sign-off. */
import type ExcelJS from 'exceljs';
import { MODULES, SCENARIOS, scriptId } from '../../catalog';
import { table, finish, statusColumn, f, q, BAND, FONT, INPUT } from './style';
import { STEP_COLS, rollup } from './te040';

export const GROUPS: { code: string; name: string; match: RegExp }[] = [
  { code: 'OPS', name: 'Sthara operator', match: /operator/i },
  { code: 'LEAD', name: 'School leadership', match: /school admin|principal|every office role/i },
  { code: 'FIN', name: 'Finance and fees', match: /finance|accountant|cashier/i },
  { code: 'ADM', name: 'Admissions', match: /admissions/i },
  { code: 'HR', name: 'HR and scheduling', match: /hr manager|academic coordinator/i },
  { code: 'WELL', name: 'Wellbeing and DPDP', match: /counsellor|data protection/i },
  { code: 'TCH', name: 'Teacher', match: /teacher|any school user|each role/i },
  { code: 'STU', name: 'Student', match: /student|any school user|each role/i },
  { code: 'PAR', name: 'Parent', match: /parent|any school user|each role/i },
];

export function te130(wb: ExcelJS.Workbook) {
  const signoff = wb.addWorksheet('Sign-off', { properties: { tabColor: { argb: 'FF10B981' } } });
  const idx = table(wb, 'UAT Index', [
    { header: 'UAT ID', key: 'id', width: 14 }, { header: 'Group', key: 'group', width: 20 }, { header: 'Title', key: 'title', width: 46 },
    { header: 'Source script', key: 'src', width: 15 }, { header: 'Priority', key: 'pri', width: 9 }, { header: 'Pre-conditions', key: 'pre', width: 44 },
    { header: 'Steps', key: 'steps', width: 7 }, { header: 'Pass', key: 'pass', width: 6 }, { header: 'Fail', key: 'fail', width: 6 },
    { header: 'Blocked', key: 'blocked', width: 8 }, { header: 'Status', key: 'status', width: 11 },
    { header: 'Key user', key: 'user', width: 16, input: true }, { header: 'Planned date', key: 'planned', width: 12, input: true },
  ], 'FF2F6BFF');
  const cols = STEP_COLS.map(c => (c.key === 'role' ? { ...c, header: 'Source script', key: 'role', width: 15 } : c.key === 'defect' ? { ...c, header: 'Issue ID' } : c.key === 'evidence' ? { ...c, header: 'Comments' } : c));
  const add = (ws: ExcelJS.Worksheet, sheet: string, group: string, id: string, src: string, title: string, pre: string, pri: string, steps: [string, string, string?][]) => {
    const head = ws.addRow({ id, role: src, action: `▶ ${title}`, expected: `Before you start: ${pre}` });
    head.eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }; });
    head.getCell('action').font = { name: FONT, bold: true };
    steps.forEach((st, i) => ws.addRow({ id, step: i + 1, role: src, action: st[0], data: st[2] ?? '', expected: st[1], status: 'Not run' }));
    const r = idx.rowCount + 1, R = rollup(sheet, `A${r}`, steps.length);
    idx.addRow({ id, group, title, src, pri, pre, steps: R.steps, pass: R.pass, fail: R.fail, blocked: R.blocked, status: R.status(`H${r}`, `I${r}`, `J${r}`, `G${r}`) });
  };
  const counts: Record<string, number> = {};
  for (const g of GROUPS) {
    const sheet = `UAT ${g.name}`.slice(0, 31);
    const ws = table(wb, sheet, cols);
    let n = 0;
    for (const m of MODULES) for (const s of m.scripts) {
      if (!s.uat || !g.match.test(s.role)) continue;
      add(ws, sheet, g.name, `UAT-${g.code}-${String(++n).padStart(2, '0')}`, scriptId(m.code, s.n), s.title, s.pre, s.priority, s.steps);
    }
    counts[g.name] = n;
    finish(ws); statusColumn(ws, 'H', ws.rowCount);
  }
  const e2e = table(wb, 'UAT End-to-end', cols.map(c => (c.key === 'role' ? { ...c, header: 'Role' } : c)));
  for (const sc of SCENARIOS) {
    add(e2e, 'UAT End-to-end', 'End-to-end (joint)', `UAT-${sc.id}`, sc.id, sc.title, `${sc.pre} Data: ${sc.data}`, sc.priority,
      sc.steps.map(st => [`${st.role}: ${st.action}`, st.expected, st.ref ? `TE040-${st.ref}` : ''] as [string, string, string]));
  }
  counts['End-to-end (joint)'] = SCENARIOS.length;
  finish(e2e); statusColumn(e2e, 'H', e2e.rowCount);
  finish(idx); statusColumn(idx, 'K', idx.rowCount, false);

  signoff.columns = [{ width: 22 }, { width: 9 }, { width: 8 }, { width: 8 }, { width: 22 }, { width: 36 }, { width: 20 }, { width: 16 }, { width: 12 }];
  signoff.getCell('A1').value = 'TE.130 acceptance sign-off';
  signoff.getCell('A1').font = { name: FONT, bold: true, size: 16, color: { argb: 'FF062347' } };
  signoff.getCell('A2').value = 'Each group’s key user records the decision once their scripts are run. "Accept with conditions" lists the open issues and agreed dates.';
  signoff.getCell('A2').font = { name: FONT, size: 10, italic: true };
  const heads = ['Group', 'Scripts', 'Passed', 'Failed', 'Decision', 'Conditions / open issues', 'Key user', 'Signature', 'Date'];
  heads.forEach((h, i) => { const c = signoff.getRow(4).getCell(i + 1); c.value = h; c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF062347' } }; });
  const I = q('UAT Index');
  Object.entries(counts).forEach(([g, n], i) => {
    const r = 5 + i;
    signoff.getRow(r).values = [g, f(`COUNTIF(${I}!$B:$B,$A${r})`, n), f(`COUNTIFS(${I}!$B:$B,$A${r},${I}!$K:$K,"Pass")`, 0), f(`COUNTIFS(${I}!$B:$B,$A${r},${I}!$K:$K,"Fail")`, 0)];
    signoff.getRow(r).font = { name: FONT, size: 10 };
    for (const c of ['E', 'F', 'G', 'H', 'I']) signoff.getCell(`${c}${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT } };
    signoff.getCell(`E${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Accept,Accept with conditions,Reject"'] };
  });
  return { counts };
}
