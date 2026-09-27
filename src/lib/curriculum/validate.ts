/**
 * Integrity checks for the ingested curriculum. Run:
 *   npx tsx src/lib/curriculum/validate.ts
 * Exits non-zero on any failure, so it can gate CI once CI exists.
 */
import { CURRICULUM, flattenChapters, getCurriculum } from './index';
import { EXAMS } from './exams';

let failures = 0;
const fail = (id: string, msg: string) => { failures++; console.error(`  FAIL ${id}: ${msg}`); };

for (const s of CURRICULUM) {
  const id = `${s.board} ${s.session} class ${s.class} ${s.subject}`;
  // Either/or units (alternativeTo) stand in for others and don't add to the paper.
  const main = s.units.filter(u => !u.alternativeTo && !u.practical);
  const practicalMarks = s.units.filter(u => u.practical).reduce((a, u) => a + (u.marks ?? 0), 0);
  if (practicalMarks > s.assessment.internal) fail(id, `practical units carry ${practicalMarks}, more than the internal total ${s.assessment.internal}`);
  const unitMarks = main.map(u => u.marks);
  const published = unitMarks.every(m => m !== null);

  // Classes 9-12 come from CBSE's own documents; Class 8 (no CBSE middle-stage syllabus) from the NCERT textbooks CBSE prescribes.
  const official = s.source.url.startsWith('https://cbseacademic.nic.in/') || (Number(s.class) <= 8 && s.source.url.startsWith('https://ncert.nic.in/'));
  if (!official) fail(id, 'source URL is not the official CBSE (or, for Class 8, NCERT) site');
  if (s.assessment.theory !== null) {
    if (!published) fail(id, 'theory total is set but some unit marks are null');
    const sum = unitMarks.reduce<number>((a, m) => a + (m ?? 0), 0);
    if (sum !== s.assessment.theory) fail(id, `unit marks sum to ${sum}, theory total is ${s.assessment.theory}`);
  } else if (unitMarks.some(m => m !== null)) {
    fail(id, 'unit marks present while theory total is null');
  }
  const ia = s.assessment.internalBreakdown.reduce((a, c) => a + c.marks, 0);
  if (ia !== s.assessment.internal) fail(id, `internal components sum to ${ia}, internal total is ${s.assessment.internal}`);
  const total = s.assessment.total ?? 100;
  if (s.assessment.theory !== null && s.assessment.theory + s.assessment.internal !== total) fail(id, `theory + internal is not ${total}`);
  const codes = new Set(s.units.map(u => u.code));
  if (codes.size !== s.units.length) fail(id, 'duplicate unit code');
  for (const u of s.units) {
    for (const a of u.alternativeTo ?? []) if (!codes.has(a)) fail(id, `unit ${u.code} is an alternative to unknown unit ${a}`);
    const alt = u.alternativeTo?.reduce((n, a) => n + (s.units.find(x => x.code === a)?.marks ?? 0), 0);
    if (alt !== undefined && u.marks !== null && alt !== u.marks) fail(id, `alternative unit ${u.code} carries ${u.marks}, the units it replaces carry ${alt}`);
  }

  const names = new Set<string>();
  for (const u of s.units) {
    if (u.chapters.length === 0) fail(id, `unit ${u.code} has no chapters`);
    if (u.marks !== null && u.marks > 0 && u.chapters.every(c => c.formativeOnly)) fail(id, `unit ${u.code} carries marks but has only formative chapters`);
    for (const c of u.chapters) {
      if (names.has(c.name)) fail(id, `duplicate chapter "${c.name}"`);
      names.add(c.name);
      if (c.topics.length === 0) fail(id, `chapter "${c.name}" has no topics`);
      if (c.topics.some(t => !t.trim())) fail(id, `chapter "${c.name}" has an empty topic`);
    }
  }
  const altCodes = new Set(s.units.filter(u => u.alternativeTo || u.practical).map(u => u.code));
  const approx = flattenChapters(s).filter(c => c.approxMarks !== null && !altCodes.has(c.unitCode)).reduce((a, c) => a + (c.approxMarks ?? 0), 0);
  if (published && s.assessment.theory !== null && Math.abs(approx - s.assessment.theory) > 1) {
    fail(id, `approximate chapter marks sum to ${approx}, expected about ${s.assessment.theory}`);
  }
  console.log(`${failures ? ' ' : 'ok'} ${id}: ${s.units.length} units, ${flattenChapters(s).length} chapters`);
}

// Lookup behaves for the class/subject strings the app actually stores.
const probes: [string, string, string, string][] = [
  ['Class 10-A', 'Maths', '10', 'Mathematics'], ['10A', 'Social Studies', '10', 'Social Science'], ['XII', 'Physics', '12', 'Physics'], ['Class 9', 'Science', '9', 'Science'],
  ['12-B', 'English', '12', 'English Core'], ['10', 'Hindi', '10', 'Hindi Course A'], ['11', 'Biotechnology', '11', 'Biotechnology'], ['11', 'Bio', '11', 'Biology'],
  ['12', 'Accounts', '12', 'Accountancy'], ['12', 'BST', '12', 'Business Studies'], ['11', 'IP', '11', 'Informatics Practices'], ['9', 'Science at Advanced Level', '9', 'Science at Advanced Level'],
  ['12', 'Pol Science', '12', 'Political Science'], ['10', 'हिंदी (ब)', '10', 'Hindi Course B'],
  ['9', 'Telugu', '9', 'Telugu (AP)'], ['11', 'Telugu TS', '11', 'Telugu (Telangana)'], ['12', 'Urdu', '12', 'Urdu Core'],
  ['10', 'Oriya', '10', 'Odia'], ['9', 'Bangla', '9', 'Bengali'], ['9', 'Tili Kannada', '9', 'Tili Kannada'],
];
for (const [cls, subj, want, name] of probes) {
  const hit = getCurriculum(cls, subj);
  if (!hit || hit.class !== want || hit.subject !== name) fail('lookup', `getCurriculum("${cls}", "${subj}") gave ${hit ? hit.subject : 'nothing'}, expected class ${want} ${name}`);
}
const ids = new Set<string>();
for (const s of CURRICULUM) { const id = `${s.class}|${s.subject}`; if (ids.has(id)) fail('registry', `duplicate subject ${id}`); ids.add(id); }

// Exam syllabi: every link must name a real chapter; ids unique.
const chapterSet = new Set(CURRICULUM.flatMap(s => flattenChapters(s).map(c => `${s.class}|${s.subject}|${c.name}`)));
const examIds = new Set<string>();
for (const e of EXAMS) {
  if (examIds.has(e.id)) fail('exams', `duplicate exam id ${e.id}`);
  examIds.add(e.id);
  let units = 0, links = 0;
  for (const s of e.subjects) for (const u of s.units) {
    units++;
    if (!u.topics.length) fail(e.id, `${s.subject} unit ${u.code} has no topics`);
    if (!u.mapsTo.length && !u.beyondBoard?.length) fail(e.id, `${s.subject} unit ${u.code} maps to no chapter and says nothing about the board`);
    for (const r of u.mapsTo) { links++; if (!chapterSet.has(`${r.class}|${r.subject}|${r.chapter}`)) fail(e.id, `${s.subject} unit ${u.code} links to unknown chapter ${r.class} ${r.subject} "${r.chapter}"`); }
  }
  console.log(`${failures ? ' ' : 'ok'} exam ${e.id} (${e.cycle}): ${units} units, ${links} chapter links`);
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log(`\nAll ${CURRICULUM.length} subjects valid.`);
