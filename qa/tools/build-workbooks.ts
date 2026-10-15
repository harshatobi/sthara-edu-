/**
 * Builds the Oracle AIM test documents from the catalog (npm run docs):
 *   BR.030 Solution Matrix · TE.040 System Test Scripts · TE.050 Integration Scenarios · TE.130 UAT
 * and a copy of every automated script, into ./workbooks. Refuses to build when the traceability check fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES, SCENARIOS, defects } from '../catalog';
import { check } from './check-catalog';
import { book, cover } from './xl/style';
import { strategy } from './xl/strategy';
import { defectLog } from './xl/defectlog';
import { howTo, testData } from './xl/guide';
import { te040 } from './xl/te040';
import { te050 } from './xl/te050';
import { te130 } from './xl/te130';
import { matrix } from './xl/matrix-a';
import { rbacSheets, inventorySheets } from './xl/matrix-b';
import { scriptsBook, scriptFileCount } from './xl/scripts';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../workbooks');

async function main() {
  const { errors, counts } = check();
  if (errors.length) { console.error(`Not building: ${errors.length} traceability problem(s). Run npm run check.`); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const nScripts = MODULES.reduce((n, m) => n + m.scripts.length, 0);
  const nUat = MODULES.reduce((n, m) => n + m.scripts.filter(s => s.uat).length, 0);
  const out: string[] = [];

  let wb = book();
  cover(wb, 'STH-BR030', 'BR.030 Solution Matrix', 'Every requirement of the platform, where it lives (screen, API, data, permission), whether it fits, and which system scripts, end-to-end scenarios, UAT scripts and automated tests prove it.',
    [['Requirements', counts.requirements], ['Modules', counts.modules], ['Automated tests traced', counts.automatedTests]]);
  matrix(wb); rbacSheets(wb); inventorySheets(wb); defectLog(wb, 20);
  out.push(await save(wb, 'Sthara_BR030_Solution_Matrix.xlsx'));

  wb = book();
  cover(wb, 'STH-TE040', 'TE.040 System Test Scripts', 'Module-by-module system test scripts with expected results, for the Sthara test team to execute in the test school. Status rolls up from the steps.',
    [['Scripts', nScripts], ['Steps', counts.steps], ['Modules', MODULES.length]]);
  howTo(wb, 'TE.040'); strategy(wb); te040(wb); testData(wb); defectLog(wb);
  out.push(await save(wb, 'Sthara_TE040_System_Test_Scripts.xlsx'));

  wb = book();
  cover(wb, 'STH-TE050', 'TE.050 Integration Test Scripts (end to end)', 'Business journeys that cross roles and modules, from the first click to the last effect (money, marks, messages, payroll). Run each scenario top to bottom.',
    [['Scenarios', SCENARIOS.length], ['Steps', counts.scenarioSteps]]);
  howTo(wb, 'TE.050'); te050(wb); testData(wb); defectLog(wb);
  out.push(await save(wb, 'Sthara_TE050_Integration_Test_Scripts.xlsx'));

  wb = book();
  cover(wb, 'STH-TE130', 'TE.130 User Acceptance Test Scripts', 'Acceptance scripts for the school’s key users, by role, plus the end-to-end scenarios run jointly, and the sponsor’s sign-off.',
    [['UAT scripts (by role)', nUat], ['End-to-end scenarios', SCENARIOS.length], ['Known defects at start', defects.length]]);
  howTo(wb, 'TE.130'); strategy(wb); te130(wb); testData(wb); defectLog(wb);
  out.push(await save(wb, 'Sthara_TE130_UAT_Scripts.xlsx'));

  wb = book();
  const sb = { files: 0, tests: 0 };
  cover(wb, 'STH-AUTO', 'Automated Test Scripts (copies)', 'A copy of every automated test script in the sthara-qa pack: what each covers, how to run it, what it proves, every test by name, and each script’s code line by line.',
    [['Script files', scriptFileCount()], ['Tests defined in them', 'see All Tests']]);
  Object.assign(sb, scriptsBook(wb));
  out.push(await save(wb, 'Sthara_Automated_Test_Scripts.xlsx') + `  [${sb.files} scripts, ${sb.tests} tests]`);

  console.log('Built:\n  ' + out.join('\n  '));
  console.log('Catalog:', counts);
}

async function save(wb: import('exceljs').Workbook, name: string) {
  const file = path.join(OUT, name);
  await wb.xlsx.writeFile(file);
  return `${name}  (${wb.worksheets.length} sheets, ${(fs.statSync(file).size / 1024).toFixed(0)} KB)`;
}

main().catch(e => { console.error(e); process.exit(1); });
