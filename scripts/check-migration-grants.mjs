#!/usr/bin/env node
// Fails when a migration creates a table or view in public without granting API access to it in the same file.
//
// From 2026-10-30 Supabase stops granting new public tables to anon / authenticated / service_role by default.
// A table without a grant answers "permission denied" to every server route (they run as service_role), so the
// first sign would be a broken feature in production. Each new table or view needs, in its own migration:
//
//   GRANT ALL ON public.x TO service_role;                                    always
//   GRANT SELECT, INSERT, UPDATE, DELETE ON public.x TO authenticated;        only if users reach it through RLS
//   GRANT USAGE ON SEQUENCE public.x_id_seq TO authenticated;                 serial ids that users insert
//
// anon (signed-out visitors) almost never needs a table: a grant to anon fails the check unless the line above it
// says why, as `-- anon: <reason>`.
//
//   node scripts/check-migration-grants.mjs              check every file in supabase/migrations
//   node scripts/check-migration-grants.mjs <file>...    check these files only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'supabase/migrations');
const files = process.argv.length > 2
  ? process.argv.slice(2).map(f => path.resolve(f))
  : fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(f => path.join(dir, f));

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const NAME = String.raw`(?:${IDENT}\s*\.\s*)?${IDENT}`;
const unquote = s => s.replace(/"/g, '').replace(/\s+/g, '').toLowerCase();
/** public.x for a bare or public-qualified name; null for any other schema. */
const inPublic = n => { const q = unquote(n); return !q.includes('.') ? `public.${q}` : q.startsWith('public.') ? q : null; };

// Comments out, string literals and dollar-quoted bodies blanked (a CREATE TABLE inside a function body is not one).
function strip(sql) {
  return sql
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/'(?:[^']|'')*'/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

const problems = [];
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const sql = strip(raw);
  const rel = path.relative(root, file);
  const lineOf = i => sql.slice(0, i).split('\n').length;

  // What the file creates.
  const created = new Map();
  const create = new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:UNLOGGED\s+)?(TABLE|VIEW|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(${NAME})`, 'gi');
  for (const m of sql.matchAll(create)) {
    const name = inPublic(m[2]);
    if (!name) continue;
    const kind = m[1].toUpperCase().replace(/\s+/, ' ');
    let body = '';
    if (kind === 'TABLE') { const open = sql.indexOf('(', m.index + m[0].length); body = open < 0 ? '' : sql.slice(open, sql.indexOf(';', open)); }
    created.set(name, { kind, line: lineOf(m.index), serial: /\b(?:small|big)?serial\b/i.test(body) });
  }

  // What the file grants. GRANT ... ON [TABLE|SEQUENCE] a, b TO r1, r2 / ON ALL TABLES IN SCHEMA public TO ...
  const granted = new Map();
  const seqGranted = new Set();
  const grant = new RegExp(String.raw`\bGRANT\s+([\w\s,()"]+?)\s+ON\s+(?:(TABLE|SEQUENCE)\s+)?((?:${NAME}\s*,\s*)*${NAME}|ALL\s+(?:TABLES|SEQUENCES)\s+IN\s+SCHEMA\s+${IDENT})\s+TO\s+([\w\s,"]+?)\s*(?:WITH\s+GRANT\s+OPTION\s*)?;`, 'gi');
  for (const m of sql.matchAll(grant)) {
    const roles = m[4].split(',').map(unquote);
    const target = m[3];
    if (/^ALL\s+SEQUENCES/i.test(target)) { if (/public/i.test(target)) roles.forEach(r => seqGranted.add(r)); continue; }
    if (m[2]?.toUpperCase() === 'SEQUENCE') { roles.forEach(r => seqGranted.add(r)); continue; }
    const names = /^ALL\s+TABLES/i.test(target)
      ? (/public/i.test(target) ? [...created.keys()] : [])
      : target.split(',').map(inPublic).filter(Boolean);
    for (const n of names) {
      const set = granted.get(n) || new Set();
      roles.forEach(r => set.add(r));
      granted.set(n, set);
    }
    // A grant to anon has to say why, on the line above it.
    if (roles.includes('anon')) {
      const line = lineOf(m.index);
      const above = raw.split('\n').slice(Math.max(0, line - 3), line - 1).join('\n');
      // The baseline is live as it stood on 2026-10-20 (18 old SELECT grants to anon, no anon policies behind them).
      if (!rel.endsWith('_baseline.sql') && !/--\s*anon:\s*\S/i.test(above) && !/^ALL\s/i.test(target)) {
        problems.push(`${rel}:${line}  grants ${names.join(', ')} to anon. Signed-out visitors rarely need a table; if this one does, say why on the line above: -- anon: <reason>`);
      }
    }
  }

  for (const [name, t] of created) {
    const roles = granted.get(name) || new Set();
    if (!roles.has('service_role')) {
      problems.push(`${rel}:${t.line}  ${t.kind.toLowerCase()} ${name} has no GRANT to service_role in this migration. Add: GRANT ALL ON ${name} TO service_role;`);
    }
    if (t.serial && roles.has('authenticated') && !seqGranted.has('authenticated')) {
      problems.push(`${rel}:${t.line}  ${name} has a serial id and authenticated is granted on it, but no GRANT USAGE ON SEQUENCE ... TO authenticated.`);
    }
  }
}

if (problems.length) {
  console.error(`Migration grants: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n`);
  for (const p of problems) console.error('  ' + p);
  console.error('\nSee the top of scripts/check-migration-grants.mjs for the grants each new table needs.');
  process.exit(1);
}
console.log(`Migration grants: ${files.length} file${files.length === 1 ? '' : 's'} checked, every new table and view is granted.`);
