/**
 * Proves the catalog's traceability holds, so the workbooks can be trusted:
 *  - ids are unique; every script and scenario points at real requirements and scripts;
 *  - every requirement is covered by a TE.040 script or a TE.050 scenario;
 *  - every automated-test reference matches a real test in the app or in this pack.
 * Exit code 1 on any broken link. Run: npm run check
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES, SCENARIOS, defects, reqId, scriptId, resolveReq } from '../catalog';
import { automatedTests, ROOT } from './inventory';

const tests = automatedTests();
const asPattern = (name: string) => new RegExp('^' + name.split(/\$\{[^}]*\}/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
const compiled = tests.map(t => ({ ...t, re: asPattern(t.name) }));

/** The automated tests an "owner:file::name" reference matches (a leading ~ = prefix; "~file::" = the whole file). */
export function matchTests(ref: string) {
  if (ref.startsWith('cmd:')) return [];
  const prefix = ref.startsWith('~');
  const [file, name = ''] = (prefix ? ref.slice(1) : ref).split('::');
  return compiled.filter(t => t.file === file && (prefix
    ? (!name || t.name.startsWith(name) || t.re.test(name) || asPattern(t.name.split('${')[0] + '${x}').test(name + 'x'))
    : (t.name === name || t.re.test(name))));
}

/** Does the reference match a real test (or, for cmd:, an existing check script in the app)? */
export function resolveAuto(ref: string): { ok: boolean; count: number } {
  if (ref.startsWith('cmd:')) return { ok: fs.existsSync(path.join(ROOT, ref.slice(4))), count: 1 };
  const hits = matchTests(ref);
  return { ok: hits.length > 0, count: hits.length };
}

export function check() {
  const errors: string[] = [];
  const reqs = new Map<string, string>();
  const scripts = new Map<string, string>();
  for (const m of MODULES) {
    for (const r of m.reqs) { const id = reqId(m.code, r.n); if (reqs.has(id)) errors.push(`duplicate ${id}`); reqs.set(id, r.text); }
  }
  for (const m of MODULES) {
    for (const s of m.scripts) {
      const id = scriptId(m.code, s.n);
      if (scripts.has(id)) errors.push(`duplicate ${id}`);
      scripts.set(id, s.title);
      for (const r of s.req) if (!reqs.has(resolveReq(m.code, r))) errors.push(`${id} names unknown requirement ${resolveReq(m.code, r)}`);
      if (!s.steps.length) errors.push(`${id} has no steps`);
    }
  }
  const covered = new Set<string>();
  for (const m of MODULES) for (const s of m.scripts) for (const r of s.req) covered.add(resolveReq(m.code, r));
  const sitIds = new Set<string>();
  for (const sc of SCENARIOS) {
    if (sitIds.has(sc.id)) errors.push(`duplicate ${sc.id}`);
    sitIds.add(sc.id);
    for (const r of sc.req) { if (!reqs.has(r)) errors.push(`${sc.id} names unknown requirement ${r}`); covered.add(r); }
    for (const st of sc.steps) if (st.ref && !scripts.has(`TE040-${st.ref}`)) errors.push(`${sc.id} step refers to unknown script TE040-${st.ref}`);
  }
  for (const id of reqs.keys()) if (!covered.has(id)) errors.push(`${id} has no TE.040 script or TE.050 scenario`);
  const defIds = new Set<string>();
  for (const d of defects) {
    if (defIds.has(d.id)) errors.push(`duplicate ${d.id}`);
    defIds.add(d.id);
    for (const r of d.req ?? []) if (!reqs.has(r)) errors.push(`${d.id} names unknown requirement ${r}`);
  }
  const refs: [string, string][] = [
    ...MODULES.flatMap(m => m.reqs.flatMap(r => (r.auto ?? []).map(a => [reqId(m.code, r.n), a] as [string, string]))),
    ...MODULES.flatMap(m => m.scripts.flatMap(s => (s.auto ?? []).map(a => [scriptId(m.code, s.n), a] as [string, string]))),
    ...SCENARIOS.flatMap(sc => (sc.auto ?? []).map(a => [sc.id, a] as [string, string])),
    ...defects.flatMap(d => (d.auto ?? []).map(a => [d.id, a] as [string, string])),
  ];
  for (const [owner, ref] of refs) if (!resolveAuto(ref).ok) errors.push(`${owner}: no automated test matches "${ref}"`);
  return {
    errors,
    counts: { modules: MODULES.length, requirements: reqs.size, scripts: scripts.size, steps: MODULES.reduce((n, m) => n + m.scripts.reduce((k, s) => k + s.steps.length, 0), 0), scenarios: SCENARIOS.length, scenarioSteps: SCENARIOS.reduce((n, s) => n + s.steps.length, 0), defects: defects.length, automatedTests: tests.length, autoRefs: refs.length },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, counts } = check();
  console.log('Catalog:', counts);
  if (errors.length) { console.error(`\n${errors.length} traceability problem(s):\n  ` + errors.join('\n  ')); process.exit(1); }
  console.log('Traceability OK: every requirement is tested, every reference resolves.');
}
