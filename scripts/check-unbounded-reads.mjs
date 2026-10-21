#!/usr/bin/env node
// Fails when code adds a database read that can silently stop at the 1,000-row ceiling.
//
// The database API answers at most 1,000 rows per request and says nothing when it cuts a list short. A read of a
// table that grows with a school (students, submissions, attendance, logs...) or of a set-returning database function must be
// bounded: .range() (or through all()/allByIds()/pageAll()/byIds()), .limit(), .single()/.maybeSingle(), or a
// head-only count. Lists people look at then page 200 rows at a time (src/components/canon/Pager.tsx).
//
// Reads that were already there are listed in scripts/unbounded-reads.baseline.json (file + table: how many).
// Most are a few rows by id, or a query built here and paged further down. A new one fails the check. If it is
// genuinely small, put `// bounded: <why>` on the line above it.
//
//   node scripts/check-unbounded-reads.mjs            check against the baseline
//   node scripts/check-unbounded-reads.mjs --update   rewrite the baseline (after removing or vetting reads)

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(root, 'package.json'))('typescript');
const BASELINE = path.join(root, 'scripts/unbounded-reads.baseline.json');

/** Tables that grow with a school's size or with time. */
const GROWING = new Set(`
  users guardians student_subjects attendance submissions submission_items tml_scores fee_invoices fee_payments
  fee_reminders consents wellness_logs notifications syllabus_progress timetable_slots request_log audit_log
  app_errors admission_events admission_applicants pay_run_lines exam_marks exam_sheets tutor_sessions
  tutor_session_turns assignments engagement_scores leave_requests school_messages school_threads staff_punches
  materials incidents whatsapp_log practical_progress situations lesson_plans report_cards class_subjects
  ops_accounts ops_cases ops_case_messages ops_activities ops_contacts ops_opportunities enquiries ai_usage import_jobs legacy_results students enrolments student_changes
`.split(/\s+/).filter(Boolean));

/**
 * Database functions that return a set of rows (pg_proc.proretset in public). One that returns a single value
 * can't be cut, so it isn't checked. Add a new set-returning function here.
 */
const SET_RPCS = new Set(`
  admin_teacher_work exam_attendance exam_fee_dues ops_registry_counts ops_school_metrics ops_subject_metrics import_claim
  ops_tml_stale parent_wellness_summary school_attendance_summary school_wellness_aggregates school_wellness_report
  teacher_wellness_feed
`.split(/\s+/).filter(Boolean));

const PAGERS = /^(all|allByIds|pageAll|byIds|everyRow)$/;
const BOUNDED = new Set(['range', 'limit', 'single', 'maybeSingle', 'csv']);
const WRITES = new Set(['insert', 'update', 'upsert', 'delete']);

function files(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(f.name) && !/\.test\./.test(f.name)) out.push(p);
  }
  return out;
}

function scan() {
  const found = [];
  for (const file of files(path.join(root, 'src'))) {
    const src = fs.readFileSync(file, 'utf8');
    if (!/\.(from|rpc)\(/.test(src)) continue;
    const lines = src.split('\n');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = node => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node)) {
        const names = []; let select = ''; let target = null;
        for (let n = node; ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression); n = n.expression.expression) {
          const name = n.expression.name.text;
          names.push(name);
          if (name === 'select') select = n.arguments.map(a => a.getText(sf)).join(',');
          if (name === 'from' || name === 'rpc') {
            const arg = n.arguments[0];
            const t = arg && ts.isStringLiteralLike(arg) ? arg.text : null;
            target = t && (name === 'rpc' ? `rpc ${t}` : t);
          }
        }
        const read = names.includes('rpc') || (names.includes('from') && names.includes('select') && !names.some(x => WRITES.has(x)));
        const growing = target && (target.startsWith('rpc ') ? SET_RPCS.has(target.slice(4)) : GROWING.has(target));
        if (read && growing && !names.some(x => BOUNDED.has(x)) && !/head:\s*true/.test(select)) {
          let paged = false;
          for (let p = node.parent, i = 0; p && i < 8; p = p.parent, i++) {
            if (ts.isCallExpression(p) && PAGERS.test(p.expression.getText(sf))) { paged = true; break; }
          }
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
          const vetted = /\/\/\s*bounded:/.test(lines[line - 1] || '') || /\/\/\s*bounded:/.test(lines[line] || '');
          if (!paged && !vetted) found.push({ key: `${path.relative(root, file)} :: ${target}`, at: `${path.relative(root, file)}:${line + 1}` });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return found;
}

const found = scan();
const counts = {};
for (const f of found) counts[f.key] = (counts[f.key] || 0) + 1;

if (process.argv.includes('--update')) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`baseline: ${found.length} reads in ${Object.keys(sorted).length} places`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
const over = Object.entries(counts).filter(([k, n]) => n > (baseline[k] || 0));
if (!over.length) {
  console.log(`ok: no new unbounded reads (${found.length} known, in the baseline)`);
  process.exit(0);
}
console.error('New database reads that can silently stop at 1,000 rows:\n');
for (const [k, n] of over) {
  for (const f of found.filter(x => x.key === k).slice(baseline[k] || 0)) console.error(`  ${f.at}  (${k.split(' :: ')[1]})`);
}
console.error('\nPage them (.range() via all()/pageAll()), add .limit(), use a head-only count, or mark a read that is');
console.error('genuinely small with `// bounded: <why>` on the line above. Lists people look at page 200 rows at a time.');
process.exit(1);
