/** BR.030 Solution Matrix: requirement traceability, and a summary by business process (formulas). */
import type ExcelJS from 'exceljs';
import { MODULES, SCENARIOS, PROCESSES, defects, reqId, scriptId, resolveReq } from '../../catalog';
import { table, finish, f, FONT, NAVY } from './style';

export function matrix(wb: ExcelJS.Workbook) {
  const sum = wb.addWorksheet('Process Summary', { properties: { tabColor: { argb: 'FF10B981' } } });
  const ws = table(wb, 'Solution Matrix', [
    { header: 'Req ID', key: 'id', width: 13 }, { header: 'Process', key: 'proc', width: 8 }, { header: 'Module', key: 'mod', width: 8 },
    { header: 'Requirement', key: 'text', width: 70 }, { header: 'Priority', key: 'pri', width: 9 }, { header: 'Fit', key: 'fit', width: 12 },
    { header: 'Note', key: 'note', width: 34 }, { header: 'Where (screen)', key: 'nav', width: 30 }, { header: 'API', key: 'api', width: 32 },
    { header: 'Data (tables)', key: 'tables', width: 22 }, { header: 'Permission', key: 'perm', width: 20 }, { header: 'TE.040 scripts', key: 'te040', width: 26 },
    { header: 'TE.050 scenarios', key: 'te050', width: 18 }, { header: 'UAT', key: 'uat', width: 18 }, { header: 'Automated tests', key: 'auto', width: 60 },
    { header: 'Automated?', key: 'isAuto', width: 11 }, { header: 'Defects', key: 'defects', width: 14 },
  ], 'FF2F6BFF');
  for (const m of MODULES) for (const r of m.reqs) {
    const id = reqId(m.code, r.n);
    const scripts = m.scripts.filter(s => s.req.some(x => resolveReq(m.code, x) === id));
    const others = MODULES.flatMap(o => o === m ? [] : o.scripts.filter(s => s.req.some(x => resolveReq(o.code, x) === id)).map(s => scriptId(o.code, s.n)));
    const sits = SCENARIOS.filter(s => s.req.includes(id)).map(s => s.id);
    const autos = [...(r.auto ?? []), ...scripts.flatMap(s => s.auto ?? [])];
    ws.addRow({
      id, proc: r.process, mod: m.code, text: r.text, pri: r.priority, fit: r.fit ?? 'Fit', note: r.note ?? '', nav: m.nav, api: r.api ?? '', tables: r.tables ?? '', perm: r.perm ?? '',
      te040: [...scripts.map(s => scriptId(m.code, s.n)), ...others].join(', '), te050: sits.join(', '),
      uat: scripts.filter(s => s.uat).map(s => scriptId(m.code, s.n)).join(', ') || (sits.length ? 'via end-to-end' : ''),
      auto: [...new Set(autos.map(a => a.replace(/^~/, '').replace('::', ' › ')))].join('\n'), isAuto: autos.length ? 'Yes' : 'No',
      defects: defects.filter(d => d.req?.includes(id)).map(d => d.id).join(', '),
    });
  }
  finish(ws);
  const last = ws.rowCount;

  sum.columns = [{ width: 7 }, { width: 56 }, { width: 13 }, { width: 8 }, { width: 13 }, { width: 8 }, { width: 13 }, { width: 13 }];
  sum.getCell('A1').value = 'Solution coverage by business process';
  sum.getCell('A1').font = { name: FONT, bold: true, size: 16, color: { argb: NAVY } };
  const heads = ['Process', 'Name', 'Requirements', 'Fit', 'Fit with note', 'Gap', 'Automated', '% automated'];
  heads.forEach((h, i) => { const c = sum.getRow(3).getCell(i + 1); c.value = h; c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; });
  const M = "'Solution Matrix'";
  const all = MODULES.flatMap(m => m.reqs);
  const pids = Object.keys(PROCESSES) as (keyof typeof PROCESSES)[];
  pids.forEach((p, i) => {
    const r = 4 + i, rs = all.filter(x => x.process === p);
    const autoN = MODULES.flatMap(m => m.reqs.filter(x => x.process === p).map(x => (x.auto?.length || m.scripts.some(s => s.req.some(k => resolveReq(m.code, k) === reqId(m.code, x.n)) && s.auto?.length)) ? 1 : 0)).reduce((a: number, b) => a + b, 0);
    const cnt = (fit: string, v: number) => f(`COUNTIFS(${M}!$B$2:$B$${last},$A${r},${M}!$F$2:$F$${last},"${fit}")`, v);
    sum.getRow(r).values = [p, PROCESSES[p], f(`COUNTIF(${M}!$B$2:$B$${last},$A${r})`, rs.length),
      cnt('Fit', rs.filter(x => (x.fit ?? 'Fit') === 'Fit').length), cnt('Fit with note', rs.filter(x => x.fit === 'Fit with note').length), cnt('Gap', rs.filter(x => x.fit === 'Gap').length),
      f(`COUNTIFS(${M}!$B$2:$B$${last},$A${r},${M}!$P$2:$P$${last},"Yes")`, autoN), f(`IF(C${r}=0,0,G${r}/C${r})`, rs.length ? autoN / rs.length : 0)];
    sum.getRow(r).font = { name: FONT, size: 10 };
    sum.getCell(`H${r}`).numFmt = '0%';
  });
  const t = 4 + pids.length;
  const cached = (col: number) => pids.reduce((n, _, i) => n + Number((sum.getRow(4 + i).getCell(col).value as { result?: number })?.result ?? 0), 0);
  const tot = (c: string, col: number) => f(`SUM(${c}4:${c}${t - 1})`, cached(col));
  const [nReq, nAuto] = [cached(3), cached(7)];
  sum.getRow(t).values = ['', 'Total', tot('C', 3), tot('D', 4), tot('E', 5), tot('F', 6), tot('G', 7), f(`IF(C${t}=0,0,G${t}/C${t})`, nReq ? nAuto / nReq : 0)];
  sum.getRow(t).font = { name: FONT, size: 10, bold: true };
  sum.getCell(`H${t}`).numFmt = '0%';
  return { ws, sum };
}
