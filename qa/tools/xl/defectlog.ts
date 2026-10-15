/** The Defect Log sheet (all workbooks): the probe's findings pre-filled, then blank rows to raise new ones. */
import type ExcelJS from 'exceljs';
import { defects } from '../../catalog';
import { table, finish, TODAY } from './style';

const SEVERITY = ['S1 Critical', 'S2 High', 'S3 Medium', 'S4 Low'];
const STATE = ['Open', 'In fix', 'Ready to retest', 'Fixed', 'Closed', 'Accepted (by design)', 'To verify', 'Rejected'];
const KIND = ['Defect', 'Observation', 'Risk', 'Test debt', 'Change request'];

export function defectLog(wb: ExcelJS.Workbook, blankRows = 60) {
  const ws = table(wb, 'Defect Log', [
    { header: 'Defect ID', key: 'id', width: 11 },
    { header: 'Type', key: 'kind', width: 13, input: true },
    { header: 'Severity', key: 'severity', width: 12, input: true },
    { header: 'Area', key: 'area', width: 20, input: true },
    { header: 'Title', key: 'title', width: 42, input: true },
    { header: 'Detail', key: 'detail', width: 60, input: true },
    { header: 'Evidence / steps to reproduce', key: 'evidence', width: 60, input: true },
    { header: 'Impact', key: 'impact', width: 45, input: true },
    { header: 'Suggested fix', key: 'suggestion', width: 40, input: true },
    { header: 'Requirement', key: 'req', width: 14, input: true },
    { header: 'Script / scenario', key: 'script', width: 16, input: true },
    { header: 'Status', key: 'status', width: 16, input: true },
    { header: 'Owner', key: 'owner', width: 14, input: true },
    { header: 'Raised on', key: 'raised', width: 12, input: true },
    { header: 'Found in', key: 'found', width: 22, input: true },
    { header: 'Closed on', key: 'closed', width: 12, input: true },
    { header: 'Resolution', key: 'fix', width: 50, input: true },
  ], 'FFE11D48');
  for (const d of defects) {
    ws.addRow({ id: d.id, kind: d.kind, severity: d.severity, area: d.area, title: d.title, detail: d.detail, evidence: d.evidence, impact: d.impact, suggestion: d.suggestion, req: (d.req ?? []).join(', '), status: d.status, raised: TODAY, found: d.foundIn, fix: d.fix ?? '' });
  }
  const first = defects.length + 2;
  for (let i = 0; i < blankRows; i++) ws.addRow({ id: `NEW-${String(i + 1).padStart(3, '0')}`, status: '' });
  const last = ws.rowCount;
  for (let r = 2; r <= last; r++) {
    ws.getCell(`B${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${KIND.join(',')}"`] };
    ws.getCell(`C${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${SEVERITY.join(',')}"`] };
    ws.getCell(`L${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${STATE.join(',')}"`] };
  }
  finish(ws);
  ws.getCell(`A${first}`).note = 'Raise new findings from here: keep the NEW-nnn id or replace it with your tracker’s id, and put the same id in the Defect ID column of the failing step.';
  return ws;
}
