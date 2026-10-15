/** TE.010 Test Strategy content, written as a sheet into the TE.040 and TE.130 workbooks. */
import type ExcelJS from 'exceljs';
import { FONT, NAVY } from './style';

const S: [string, string[][]][] = [
  ['1. Objectives', [
    ['Prove every business requirement in the Solution Matrix works end to end, for every role, before schools rely on it.'],
    ['Catch regressions on every release with automated checks, and keep manual effort for judgement and acceptance.'],
    ['Give the school sponsor evidence to sign off (TE.130) against their own day-to-day work.'],
  ]],
  ['2. Scope', [
    ['In', 'All portals (Student, Teacher, Parent, Admin office roles), the Platform Manager, WhatsApp, sign-in and access, fees, admissions, scheduling (timetable, auto-build, cover, duties, staff attendance, shifts, load), feed and incidents, wellness and DPDP, AI features (tutor, copilot, grading, Ask the School OS).'],
    ['Out', 'The marketing site’s content (covered by its own tests), third-party services themselves (Supabase, Gemini, Meta), load testing beyond a school’s normal use.'],
  ]],
  ['3. Test phases (Oracle AIM mapping)', [
    ['TE.020 / TE.070 Unit', 'The app’s own unit suites (src/lib/**.test.ts, 157 tests) plus this pack’s regression unit tests (npm run unit). Automated, every change.'],
    ['TE.040 / TE.110 System', 'Module scripts in the TE.040 workbook, run by the Sthara test team in the test school; automated parts run by npm run e2e:prod.'],
    ['TE.050 / TE.120 Integration', 'End-to-end scenarios across roles and modules (TE.050 workbook); the core of six run automatically (npm run e2e:journeys).'],
    ['TE.130 Acceptance', 'UAT workbook, by role, run by the school’s key users with Sthara alongside; signed off on the Sign-off sheet.'],
    ['Regression', 'npm run regression: unit + traceability check + API gate sweep + public and signed-in sweeps, before every release.'],
  ]],
  ['4. Entry criteria', [
    ['System test', 'Release deployed to the test environment; test school set up (SIT-01); migrations applied (Platform Manager › System health all green); automated regression green.'],
    ['UAT', 'System test complete with no open S1 and no open S2 without an agreed workaround; key users trained; UAT data loaded.'],
  ]],
  ['5. Exit criteria', [
    ['System test', '100% of Critical and High scripts executed; 95% passed; no open S1; S2s have fixes scheduled.'],
    ['UAT', 'Every UAT script executed; sponsor signs off; open defects accepted in writing with dates.'],
  ]],
  ['6. Severity', [
    ['S1 Critical', 'Data loss, wrong money, a security or privacy breach, or a role blocked from its core job. Fix before release.'],
    ['S2 High', 'A key function fails with no reasonable workaround. Fix before sign-off or agree a workaround.'],
    ['S3 Medium', 'A function fails with a workaround, or a rule is wrong in an edge case. Fix in a planned release.'],
    ['S4 Low', 'Cosmetic, wording, or minor inconvenience.'],
  ]],
  ['7. Status of a step or script', [
    ['Not run', 'Not yet executed.'], ['Pass', 'The actual result matches the expected result.'], ['Fail', 'It does not: raise or link a defect (Defect ID column).'],
    ['Blocked', 'Cannot be run (a defect or missing data upstream): say why in Evidence / notes.'], ['N/A', 'Not applicable to this school (say why).'],
    ['Script status', 'Worked out from its steps: any Fail → Fail; else any Blocked → Blocked; all Pass/N/A → Pass; some → In progress.'],
  ]],
  ['8. Environments and data', [
    ['Local', 'next dev from the app folder, no database: sign-in form, routing, API gate sweep, demo portals.'],
    ['Test school (production)', 'A dedicated school in production whose name contains TEST (the automation refuses any other school). Accounts per role in e2e.env. Writes only with E2E_ALLOW_WRITES=1; AI-costing steps only with E2E_ALLOW_AI=1. Every record a run writes carries its run id (E2E-yyyymmddhhmm).'],
  ]],
  ['9. Roles', [
    ['Test lead (Sthara)', 'Plans, assigns, tracks, reports; owns the defect log.'],
    ['Testers (Sthara)', 'Execute TE.040 and TE.050; record evidence.'],
    ['Key users (school)', 'Execute TE.130 for their role; raise issues in their words.'],
    ['Sponsor (principal)', 'Signs off UAT.'],
  ]],
  ['10. Risks', [
    ['AI variability', 'AI answers differ run to run: steps check behaviour (answers from the right records, confirm before acting), not exact wording.'],
    ['Shared production', 'Tests run in production: the test school guard, run ids and write/AI flags keep real schools untouched.'],
    ['Known defects', 'See the Defect Log (DEF-001 tutor filter, DEF-002 password reset, OBS-004 session cookie, OBS-006 legacy pages).'],
  ]],
];

export function strategy(wb: ExcelJS.Workbook, name = 'TE.010 Strategy') {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: 'FF4C8DFF' } } });
  ws.columns = [{ width: 30 }, { width: 110 }];
  let r = 1;
  ws.getCell('A1').value = 'TE.010 Test Strategy — Sthara School OS';
  ws.getCell('A1').font = { name: FONT, bold: true, size: 16, color: { argb: NAVY } };
  r = 3;
  for (const [head, rows] of S) {
    ws.getCell(`A${r}`).value = head;
    ws.getCell(`A${r}`).font = { name: FONT, bold: true, size: 12, color: { argb: NAVY } };
    r++;
    for (const row of rows) {
      const [a, b] = row.length === 1 ? ['', row[0]] : row;
      ws.getCell(`A${r}`).value = a; ws.getCell(`B${r}`).value = b;
      ws.getCell(`A${r}`).font = { name: FONT, bold: true, size: 10 };
      ws.getCell(`B${r}`).font = { name: FONT, size: 10 };
      ws.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' };
      r++;
    }
    r++;
  }
  return ws;
}
