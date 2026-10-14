/** Shared workbook styling and helpers (Arial throughout; navy headers; pale yellow = cells testers fill in). */
import ExcelJS from 'exceljs';
import { DOC } from '../../catalog';

export const FONT = 'Arial';
export const NAVY = 'FF062347';
export const INPUT = 'FFFFF7D6';
export const BAND = 'FFEEF3FA';
export const STATUSES = ['Not run', 'Pass', 'Fail', 'Blocked', 'N/A'];
export const TODAY = new Date().toISOString().slice(0, 10);

export type Col = { header: string; key: string; width: number; input?: boolean; wrap?: boolean };

export function book(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = DOC.author;
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

/** A table sheet: styled, frozen header row, filter, wrapped text, input columns shaded. */
export function table(wb: ExcelJS.Workbook, name: string, cols: Col[], tab?: string): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }], properties: { tabColor: tab ? { argb: tab } : undefined } });
  ws.columns = cols.map(c => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.height = 30;
  head.eachCell(c => {
    c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  (ws as unknown as { _qaCols: Col[] })._qaCols = cols;
  return ws;
}

/** Style data rows: font, wrap, input shading. Call after rows are added. */
export function finish(ws: ExcelJS.Worksheet) {
  const cols = (ws as unknown as { _qaCols: Col[] })._qaCols || [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.eachCell({ includeEmpty: true }, (c, j) => {
      const col = cols[j - 1];
      c.font = { name: FONT, size: 10, ...(c.font?.bold ? { bold: true } : {}), ...(c.font?.color ? { color: c.font.color } : {}) };
      c.alignment = { vertical: 'top', wrapText: col?.wrap !== false };
      if (col?.input && !c.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT } };
      c.border = { bottom: { style: 'hair', color: { argb: 'FFD5DCE6' } } };
    });
  });
}

/** Pass/Fail/Blocked dropdowns and colouring on one column, rows 2..last. */
export function statusColumn(ws: ExcelJS.Worksheet, col: string, last: number, dropdown = true) {
  if (last < 2) return;
  if (dropdown) {
    for (let r = 2; r <= last; r++) {
      const c = ws.getCell(`${col}${r}`);
      if (typeof c.value === 'string') {  // step rows start as "Not run"; header rows stay blank
        c.dataValidation = { type: 'list', allowBlank: true, formulae: [`"${STATUSES.join(',')}"`], showErrorMessage: true, errorTitle: 'Status', error: `Pick one of: ${STATUSES.join(', ')}` };
      }
    }
  }
  const tint = (text: string, argb: string) => ({ type: 'containsText' as const, operator: 'containsText' as const, text, priority: 1, style: { fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb } } } });
  ws.addConditionalFormatting({ ref: `${col}2:${col}${last}`, rules: [tint('Pass', 'FFD7F5E3'), tint('Fail', 'FFFBD9DF'), tint('Blocked', 'FFFDEBC8'), tint('In progress', 'FFE3ECFF')] });
}

/** A formula with its value pre-computed, so previewers show a number before Excel recalculates. */
export const f = (formula: string, result: string | number) => ({ formula, result });

/** Quote a sheet name for use in a formula. */
export const q = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`;

/** Document control cover, in the AIM style. */
export function cover(wb: ExcelJS.Workbook, docId: string, title: string, purpose: string, extra: [string, string | number][] = []) {
  const ws = wb.addWorksheet('Cover', { properties: { tabColor: { argb: NAVY } } });
  ws.columns = [{ width: 26 }, { width: 70 }, { width: 18 }, { width: 18 }];
  const put = (r: number, a: string, b: string | number, bold = false) => {
    ws.getCell(`A${r}`).value = a; ws.getCell(`B${r}`).value = b;
    ws.getCell(`A${r}`).font = { name: FONT, bold: true, size: 10, color: { argb: NAVY } };
    ws.getCell(`B${r}`).font = { name: FONT, size: 10, bold };
    ws.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'top' };
  };
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { name: FONT, bold: true, size: 18, color: { argb: NAVY } };
  ws.getCell('A2').value = purpose;
  ws.getCell('A2').font = { name: FONT, size: 10, italic: true };
  ws.mergeCells('A2:D2');
  ws.getCell('A2').alignment = { wrapText: true };
  ws.getRow(2).height = 42;
  const rows: [string, string | number][] = [['Document ID', docId], ['Client', DOC.client], ['Project', DOC.project], ['Release under test', DOC.release], ['Version', DOC.version], ['Generated', TODAY], ['Author', DOC.author], ['Owner', DOC.owner], ...extra];
  rows.forEach(([a, b], i) => put(4 + i, a, b));
  let r = 5 + rows.length;
  ws.getCell(`A${r}`).value = 'Approvals';
  ws.getCell(`A${r}`).font = { name: FONT, bold: true, size: 12, color: { argb: NAVY } };
  r++;
  ['Name', 'Role', 'Signature', 'Date'].forEach((h, i) => { const c = ws.getRow(r).getCell(i + 1); c.value = h; c.font = { name: FONT, bold: true, size: 10, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; });
  for (const role of ['Test lead (Sthara)', 'Product owner (Sthara)', 'School sponsor (Principal)']) {
    r++;
    ws.getRow(r).getCell(2).value = role;
    for (const i of [1, 2, 3, 4]) { const c = ws.getRow(r).getCell(i); c.font = { name: FONT, size: 10 }; if (i !== 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT } }; }
  }
  return ws;
}
