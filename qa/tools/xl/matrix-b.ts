/** BR.030 companions: Role × Permission, Menu by role, API and screen inventories, automated tests. */
import type ExcelJS from 'exceljs';
import { ROLES, PERMS, Access, type RoleKey } from '@/lib/admin/rbac';
import { MODULES, SCENARIOS, defects, reqId, scriptId } from '../../catalog';
import { apiRoutes, pages, navOf, automatedTests } from '../inventory';
import { matchTests } from '../check-catalog';
import { table, finish } from './style';

const KEYS = Object.keys(ROLES) as RoleKey[];

export function rbacSheets(wb: ExcelJS.Workbook) {
  const rp = table(wb, 'Role x Permission', [{ header: 'Permission', key: 'p', width: 26 }, { header: 'What it allows', key: 'd', width: 50 },
    ...KEYS.map(k => ({ header: ROLES[k].label, key: k, width: 12, wrap: false }))], 'FF7C5CFC');
  for (const [p, d] of Object.entries(PERMS)) rp.addRow({ p, d, ...Object.fromEntries(KEYS.map(k => [k, ROLES[k].perms.includes(p as never) ? '●' : ''])) });
  finish(rp);
  rp.eachRow((row, i) => { if (i > 1) for (let c = 3; c <= 2 + KEYS.length; c++) row.getCell(c).alignment = { horizontal: 'center' }; });

  const nav = navOf('src/app/admin/layout.tsx', 'admin');
  const menu = table(wb, 'Menu by Role', [{ header: 'Menu entry', key: 'm', width: 26 }, { header: 'Page', key: 'h', width: 20 }, { header: 'Needs any of', key: 'n', width: 32 },
    ...KEYS.map(k => ({ header: ROLES[k].label, key: k, width: 12, wrap: false }))], 'FF7C5CFC');
  for (const item of nav) {
    const sees = (k: RoleKey) => {
      const a = new Access([k]);
      if (item.need.length && !item.need.some(p => a.can(p as never))) return '';
      if (item.href === '/admin/admissions' && a.can('fees.read')) return '';
      return item.href === '/admin/fees' && !a.can('admissions.read') ? 'as "Fees"' : '●';
    };
    menu.addRow({ m: item.label, h: item.href, n: item.need.join(', '), ...Object.fromEntries(KEYS.map(k => [k, sees(k)])) });
  }
  finish(menu);
}

export function inventorySheets(wb: ExcelJS.Workbook) {
  const api = table(wb, 'API Inventory', [
    { header: 'Route', key: 'r', width: 40 }, { header: 'Methods', key: 'm', width: 20 }, { header: 'Gate', key: 'g', width: 11 },
    { header: 'Office permissions checked', key: 'p', width: 36 }, { header: 'A stranger gets', key: 'a', width: 22 }, { header: 'Source file', key: 'f', width: 46 },
    { header: 'Automated gate test', key: 't', width: 34 },
  ], 'FF94A3B8');
  for (const r of apiRoutes()) api.addRow({ r: r.route, m: r.methods.join(', '), g: r.guard, p: r.perms.join(', '), a: Object.entries(r.anonymous).map(([k, v]) => `${k} ${v.join('/')}`).join('; '), f: r.file, t: 'e2e/api/auth-gates.spec.ts (every method)' });
  finish(api);

  const scr = table(wb, 'Screen Inventory', [
    { header: 'Address', key: 'r', width: 36 }, { header: 'Portal', key: 'p', width: 10 }, { header: 'Menu label', key: 'n', width: 24 },
    { header: 'Kind', key: 'k', width: 10 }, { header: 'Redirects to', key: 'to', width: 22 }, { header: 'Source file', key: 'f', width: 50 }, { header: 'Note', key: 'note', width: 40 },
  ], 'FF94A3B8');
  for (const p of pages()) {
    const legacy = /^\/admin\/(results|heatmap|vault|paper-gen)$/.test(p.route);
    scr.addRow({ r: p.route, p: p.portal, n: p.nav ?? '', k: p.kind, to: p.redirectsTo ?? '', f: p.file, note: legacy ? 'Off the menu; open by typed address (OBS-006)' : '' });
  }
  finish(scr);

  const refs = new Map<string, Set<string>>();
  const link = (owner: string, ref: string) => {
    for (const t of matchTests(ref)) { const key = `${t.file}::${t.name}`; (refs.get(key) ?? refs.set(key, new Set()).get(key)!).add(owner); }
  };
  for (const m of MODULES) { for (const r of m.reqs) (r.auto ?? []).forEach(a => link(reqId(m.code, r.n), a)); for (const s of m.scripts) (s.auto ?? []).forEach(a => link(scriptId(m.code, s.n), a)); }
  for (const sc of SCENARIOS) (sc.auto ?? []).forEach(a => link(sc.id, a));
  for (const d of defects) (d.auto ?? []).forEach(a => link(d.id, a));
  const at = table(wb, 'Automated Tests', [
    { header: 'Suite', key: 'o', width: 8 }, { header: 'Kind', key: 'k', width: 7 }, { header: 'File', key: 'f', width: 44 },
    { header: 'Test', key: 'n', width: 80 }, { header: 'Traces to', key: 't', width: 40 },
  ], 'FF94A3B8');
  for (const t of automatedTests()) at.addRow({ o: t.owner === 'app' ? 'App' : 'QA pack', k: t.kind, f: t.file.replace(/^(app|qa):/, ''), n: t.name, t: [...(refs.get(`${t.file}::${t.name}`) ?? [])].join(', ') });
  finish(at);
}
