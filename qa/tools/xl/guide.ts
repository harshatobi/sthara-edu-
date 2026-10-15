/** "How to use" (legend + a worked example row) and "Test Data" sheets. */
import type ExcelJS from 'exceljs';
import { FONT, NAVY, INPUT, table, finish } from './style';

export function howTo(wb: ExcelJS.Workbook, kind: 'TE.040' | 'TE.050' | 'TE.130') {
  const ws = wb.addWorksheet('How to use', { properties: { tabColor: { argb: 'FF10B981' } } });
  ws.columns = [{ width: 24 }, { width: 100 }];
  const lines: [string, string][] = [
    ['What this is', kind === 'TE.130' ? 'User acceptance scripts, grouped by role. Each school key user runs the sheet for their role, then the sponsor signs the Sign-off sheet.'
      : kind === 'TE.050' ? 'End-to-end integration scenarios. Each crosses roles and modules; run a scenario top to bottom, signing in as the role named on each step.'
      : 'System test scripts, one sheet per module. Pre-conditions and data are on the Script Index and on each script’s header row.'],
    ['Which cells to fill', 'Only the pale yellow cells: Actual result, Status, Tester, Date, Defect ID, Evidence / notes. Everything else is generated from the catalog; change it there (sthara-qa/catalog) and run npm run docs.'],
    ['Status', 'Pick from the list: Not run, Pass, Fail, Blocked, N/A. Script and summary statuses work themselves out from the steps.'],
    ['A failed step', 'Status Fail, then raise the problem on the Defect Log (or use an existing id such as DEF-001) and put its id in the Defect ID column.'],
    ['Evidence', 'A screenshot file name, a link, or a short note. For money and marks, write the numbers you saw.'],
    ['Automated', 'Where the index shows an automated test, the same check also runs in the regression suite; still run the manual step for acceptance.'],
    ['Accounts and data', 'Use the Test Data sheet. Never use a real school or real families’ records.'],
  ];
  ws.getCell('A1').value = `How to use this ${kind} workbook`;
  ws.getCell('A1').font = { name: FONT, bold: true, size: 16, color: { argb: NAVY } };
  lines.forEach(([a, b], i) => {
    const r = 3 + i;
    ws.getCell(`A${r}`).value = a; ws.getCell(`B${r}`).value = b;
    ws.getCell(`A${r}`).font = { name: FONT, bold: true, size: 10 };
    ws.getCell(`B${r}`).font = { name: FONT, size: 10 };
    ws.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'top' };
  });
  const r = 4 + lines.length;
  ws.getCell(`A${r}`).value = 'Example of a filled step';
  ws.getCell(`A${r}`).font = { name: FONT, bold: true, size: 12, color: { argb: NAVY } };
  const ex: [string, string][] = [
    ['Action', 'Cashier: Family accounts › Iyer family › Record payment: 24000, today, UPI, UTR123.'],
    ['Expected result', 'Receipt issued; the invoice shows Paid, balance ₹0.'],
    ['Actual result', 'Receipt R-0042 issued; invoice Paid; balance ₹0.'],
    ['Status', 'Pass'], ['Tester', 'Anita K (Sthara)'], ['Date', '2026-10-05'], ['Defect ID', ''], ['Evidence / notes', 'fee-receipt-R0042.png'],
  ];
  ex.forEach(([a, b], i) => {
    const row = r + 1 + i;
    ws.getCell(`A${row}`).value = a; ws.getCell(`B${row}`).value = b;
    ws.getCell(`A${row}`).font = { name: FONT, size: 10, bold: true };
    ws.getCell(`B${row}`).font = { name: FONT, size: 10 };
    if (i >= 2) ws.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT } };
  });
  return ws;
}

const ACCOUNTS: [string, string, string, string][] = [
  ['Sthara operator', 'E2E_OPERATOR_EMAIL', 'Platform Manager (/ops)', 'Operator access (users.role superadmin or public.superadmins)'],
  ['School admin', 'E2E_ADMIN_EMAIL', 'Admin', 'First admin of the test school (School admin role, all permissions)'],
  ['Principal', '—', 'Admin', 'Office account with the Principal role'],
  ['Finance head / Accountant / Cashier', 'E2E_CASHIER_EMAIL (cashier)', 'Admin', 'One office account per fee role (or re-assign roles to one account)'],
  ['Admissions officer, HR manager, Academic coordinator, Counsellor, DPO', '—', 'Admin', 'One office account per role'],
  ['Teacher (class teacher of the test class)', 'E2E_TEACHER_EMAIL', 'Teacher', 'Teaches the test class (E2E_CLASS) and is its class teacher'],
  ['Second teacher', 'E2E_TEACHER2_EMAIL', 'Teacher', 'Free in some periods, to take cover'],
  ['Student', 'E2E_STUDENT_EMAIL', 'Student', 'On the roll of the test class'],
  ['Parent', 'E2E_PARENT_EMAIL', 'Parent', 'Verified guardian of the test student (two children for PAR-01)'],
  ['Register staff (driver)', '—', 'WhatsApp', 'On the staff register with WhatsApp consent, no login'],
];

export function testData(wb: ExcelJS.Workbook) {
  const ws = table(wb, 'Test Data', [
    { header: 'Who', key: 'who', width: 34 }, { header: 'e2e.env key (automation)', key: 'env', width: 28 },
    { header: 'Portal', key: 'portal', width: 18 }, { header: 'What the account needs', key: 'need', width: 60 },
    { header: 'Login (email) used in this cycle', key: 'login', width: 34, input: true }, { header: 'Notes', key: 'notes', width: 30, input: true },
  ], 'FF7C5CFC');
  ACCOUNTS.forEach(([who, env, portal, need]) => ws.addRow({ who, env, portal, need }));
  ws.addRow({});
  ws.addRow({ who: 'Test school', need: 'Name must contain TEST (the automation refuses any other school). Code in E2E_SCHOOL_CODE. Classes 10-A, 10-B, Grade 6 (6-A); subjects Mathematics, Science, English; a published timetable; fee structure for Grade 6.' });
  ws.addRow({ who: 'Passwords', need: 'Never written in this workbook. Testers keep their own; the automation reads them from sthara-qa/e2e.env (gitignored).' });
  finish(ws);
  return ws;
}
