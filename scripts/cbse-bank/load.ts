// Load parsed CBSE papers (scripts/cbse-bank/work/items/*.json, made by segment.py + parse.py, no AI) into the
// Sthara starter bank: one bank_items row per question (scope 'sthara', status 'unreviewed' until a Sthara reviewer
// approves it in Platform Manager > Question bank) and its cropped figures in the public 'bank-figures' bucket.
//
//   npx tsx scripts/cbse-bank/load.ts            dry run: checks every item and figure, writes nothing
//   npx tsx scripts/cbse-bank/load.ts --write    uploads figures and inserts or updates the rows
//
// --write needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, read from the environment or .env.local
// (put the key in the file yourself; it never needs to be typed into a chat). Re-running is safe: a question
// already in the bank (same wording and options) is updated in place, figures are overwritten.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fingerprint } from '../../src/lib/studio/fingerprint';
import { topicKey } from '../../src/lib/tml/engine';

const ROOT = join(__dirname, 'work');
const BUCKET = 'bank-figures';

/** Each parsed file: the paper's segment outputs (figures live beside them) and how it is named. */
const PAPERS = [
  { items: 'X_sci', sqp: 'Science-SQP', ms: 'Science-MS', name: 'Science', slug: 'science' },
  { items: 'X_sst', sqp: 'SocialScience-SQP', ms: 'SocialScience-MS', name: 'Social Science', slug: 'social-science' },
  { items: 'X_maths', sqp: 'MathsStandard-SQP', ms: 'MathsStandard-MS', name: 'Mathematics (Standard)', slug: 'mathematics-standard' },
];

/** Parser flags, as the reviewer reads them. Blocking ones mark the item 'flagged': it can't be assigned until fixed. */
const FLAG_NOTE: Record<string, { note: string; blocks: boolean }> = {
  chapter_unsure: { note: 'The chapter was matched from the wording; check it.', blocks: false },
  figure_without_text_version: { note: 'CBSE printed no text-only version of this figure question.', blocks: false },
  access_answer_missing: { note: 'The answer to CBSE’s text-only version wasn’t found in the marking scheme.', blocks: false },
  text_in_picture: { note: 'The options are printed inside CBSE’s picture; the options here are its letters.', blocks: false },
  stem_missing: { note: 'The question wording wasn’t found.', blocks: true },
  answer_missing: { note: 'The answer wasn’t found in the marking scheme.', blocks: true },
  scheme_missing: { note: 'The marking scheme for this question wasn’t found.', blocks: true },
  text_missing: { note: 'The question wording wasn’t found.', blocks: true },
  marks_missing: { note: 'The marks weren’t found.', blocks: true },
  maths_garbled: { note: 'Some maths in the wording didn’t come out cleanly from the PDF; compare with the paper.', blocks: true },
};

type Fig = { file: string; w: number; h: number; col: number };
type Parsed = Record<string, any>;

function env() {
  const out: Record<string, string> = {};
  const f = join(__dirname, '..', '..', '.env.local');
  if (existsSync(f)) for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  const get = (k: string) => process.env[k]?.trim() || out[k] || '';
  return { url: get('NEXT_PUBLIC_SUPABASE_URL'), key: get('SUPABASE_SERVICE_ROLE_KEY') };
}

/** Printed sizes of every figure the segmenter cropped for one PDF. */
function figSizes(seg: string): Map<string, Fig> {
  const j = JSON.parse(readFileSync(join(ROOT, 'seg', `${seg}.json`), 'utf8'));
  const m = new Map<string, Fig>();
  for (const q of j.questions) for (const f of q.figs ?? []) m.set(f.file, { file: f.file, w: f.w, h: f.h, col: f.col });
  return m;
}

/** A root sign or operator left dangling at the end of a line is maths the PDF text layer lost. */
const garbled = (t: string) => /[√∑∫=+−×÷^]\s*$/m.test(t);

const write = process.argv.includes('--write');
const plan: { row: Record<string, any>; uploads: { local: string; path: string }[] }[] = [];
const problems: string[] = [];

for (const p of PAPERS) {
  const items: Parsed[] = JSON.parse(readFileSync(join(ROOT, 'items', `${p.items}.json`), 'utf8'));
  const sizes = { sqp: figSizes(p.sqp), ms: figSizes(p.ms) };
  for (const it of items) {
    const session: string = it.session;
    const base = `cbse/${session}/class-10/${p.slug}`;
    const uploads: { local: string; path: string }[] = [];
    const fig = (file: string, from: 'sqp' | 'ms') => {
      const local = join(ROOT, 'seg', `fig_${from === 'sqp' ? p.sqp : p.ms}`, file);
      if (!existsSync(local)) { problems.push(`${p.items} Q${it.q}: figure ${file} missing`); return null; }
      const path = `${base}/${from}/${file}`;
      uploads.push({ local, path });
      const s = sizes[from].get(file);
      return { path, w: s?.w ?? null, h: s?.h ?? null, col: s?.col ?? null };
    };
    const flags: string[] = [...(it.flags ?? [])];
    if (garbled(it.text) || garbled(it.scheme ?? '')) flags.push('maths_garbled');
    const unknown = flags.filter(f => !FLAG_NOTE[f]);
    if (unknown.length) problems.push(`${p.items} Q${it.q}: unknown flags ${unknown.join(', ')}`);
    const notes = flags.filter(f => FLAG_NOTE[f]).map(f => FLAG_NOTE[f].note);
    const blocked = flags.some(f => FLAG_NOTE[f]?.blocks);

    const body: Record<string, any> = {
      text: it.text,
      scheme: it.scheme ?? '',
      paper: { session, q: it.q, name: p.name },
    };
    if (it.options) { body.options = it.options; body.answer = it.answer; }
    if (it.optionsInFigure) body.optionsInFigure = true;
    if (it.figures?.length) body.figures = it.figures.map((f: string) => fig(f, 'sqp')).filter(Boolean);
    if (it.schemeFigures?.length) body.schemeFigures = it.schemeFigures.map((f: string) => fig(f, 'ms')).filter(Boolean);
    if (it.optionFigures) body.optionFigures = Object.fromEntries(Object.entries(it.optionFigures).map(([k, f]) => [k, fig(f as string, 'sqp')]));
    if (it.access) body.access = it.access;

    if (!it.chapter) problems.push(`${p.items} Q${it.q}: no chapter`);
    if (!['mcq', 'assertion_reason', 'short', 'long', 'case', 'numerical', 'diagram'].includes(it.type)) problems.push(`${p.items} Q${it.q}: type ${it.type}`);
    if (!(it.marks >= 1 && it.marks <= 10)) problems.push(`${p.items} Q${it.q}: marks ${it.marks}`);
    if (it.options && !(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < it.options.length)) problems.push(`${p.items} Q${it.q}: answer out of range`);

    plan.push({
      uploads,
      row: {
        scope: 'sthara', school_id: null, class: it.cls, subject: it.subject, chapter_key: topicKey(it.chapter || ''),
        topic: null, outcome_code: null, competency: it.competency, qtype: it.type, marks: it.marks, language: it.language || 'en',
        body, status: 'unreviewed', source: it.source, session,
        source_ref: `CBSE Sample Question Paper ${session}, Class X ${p.name}, Q${it.q}`,
        checks: { status: blocked ? 'flagged' : 'passed', notes },
        fingerprint: fingerprint(it.text, it.options ?? []),
        created_by: null,
      },
    });
  }
}

// The same question twice in one load (an internal choice printed identically) keeps the first.
const seen = new Map<string, string>();
for (const x of [...plan]) {
  const k = `${x.row.language}|${x.row.fingerprint}`;
  if (seen.has(k)) { problems.push(`${x.row.source_ref}: same wording as ${seen.get(k)}, skipped`); plan.splice(plan.indexOf(x), 1); }
  else seen.set(k, x.row.source_ref);
}

const count = (f: (r: any) => string) => plan.reduce((m, x) => m.set(f(x.row), (m.get(f(x.row)) ?? 0) + 1), new Map<string, number>());
console.log(`${plan.length} questions, ${plan.reduce((n, x) => n + x.uploads.length, 0)} figures, ${plan.filter(x => x.row.checks.status === 'flagged').length} flagged (can't be assigned until a reviewer fixes them)`);
for (const [k, n] of count(r => `${r.subject} / ${r.chapter_key}`)) console.log(`  ${n.toString().padStart(3)}  ${k}`);
if (problems.length) { console.log('\nProblems:'); problems.forEach(p => console.log('  ' + p)); }

async function main() {
  if (!write) { console.log('\nDry run: nothing written. Run with --write to load.'); return; }
  if (problems.some(p => !p.includes('skipped'))) throw new Error('Fix the problems above before loading.');
  const { url, key } = env();
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (environment or .env.local).');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const uploads = [...new Map(plan.flatMap(x => x.uploads).map(u => [u.path, u])).values()];
  for (const u of uploads) {
    const { error } = await db.storage.from(BUCKET).upload(u.path, readFileSync(u.local), { contentType: 'image/png', upsert: true });
    if (error) throw new Error(`upload ${u.path}: ${error.message}`);
  }
  console.log(`${uploads.length} figures uploaded`);

  const { data: have, error: e1 } = await db.from('bank_items').select('id, language, fingerprint').is('school_id', null)
    .in('fingerprint', plan.map(x => x.row.fingerprint));
  if (e1) throw new Error(e1.message);
  const byFp = new Map((have ?? []).map(r => [`${r.language}|${r.fingerprint}`, r.id as string]));
  let added = 0, updated = 0;
  for (const x of plan) {
    const id = byFp.get(`${x.row.language}|${x.row.fingerprint}`);
    // An update keeps a reviewer's decision (status, approval) and only refreshes what the pipeline owns.
    const { error } = id
      ? await db.from('bank_items').update({ ...x.row, status: undefined }).eq('id', id)
      : await db.from('bank_items').insert(x.row);
    if (error) throw new Error(`${x.row.source_ref}: ${error.message}`);
    id ? updated++ : added++;
  }
  console.log(`${added} added, ${updated} updated`);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
