/**
 * Integrity checks for the ingested curriculum. Run:
 *   npx tsx src/lib/curriculum/validate.ts
 * Exits non-zero on any failure, so it can gate CI once CI exists.
 */
import { CURRICULUM, flattenChapters, getCurriculum } from './index';

let failures = 0;
const fail = (id: string, msg: string) => { failures++; console.error(`  FAIL ${id}: ${msg}`); };

for (const s of CURRICULUM) {
  const id = `${s.board} ${s.session} class ${s.class} ${s.subject}`;
  const unitMarks = s.units.map(u => u.marks);
  const published = unitMarks.every(m => m !== null);

  if (!s.source.url.startsWith('https://cbseacademic.nic.in/')) fail(id, 'source URL is not the official CBSE academic site');
  if (s.assessment.theory !== null) {
    if (!published) fail(id, 'theory total is set but some unit marks are null');
    const sum = unitMarks.reduce<number>((a, m) => a + (m ?? 0), 0);
    if (sum !== s.assessment.theory) fail(id, `unit marks sum to ${sum}, theory total is ${s.assessment.theory}`);
  } else if (unitMarks.some(m => m !== null)) {
    fail(id, 'unit marks present while theory total is null');
  }
  const ia = s.assessment.internalBreakdown.reduce((a, c) => a + c.marks, 0);
  if (ia !== s.assessment.internal) fail(id, `internal components sum to ${ia}, internal total is ${s.assessment.internal}`);
  if (s.assessment.theory !== null && s.assessment.theory + s.assessment.internal !== 100) fail(id, 'theory + internal is not 100');

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
  const approx = flattenChapters(s).filter(c => c.approxMarks !== null).reduce((a, c) => a + (c.approxMarks ?? 0), 0);
  if (published && s.assessment.theory !== null && Math.abs(approx - s.assessment.theory) > 1) {
    fail(id, `approximate chapter marks sum to ${approx}, expected about ${s.assessment.theory}`);
  }
  console.log(`${failures ? ' ' : 'ok'} ${id}: ${s.units.length} units, ${flattenChapters(s).length} chapters`);
}

// Lookup behaves for the class/subject strings the app actually stores.
const probes: [string, string, string][] = [['Class 10-A', 'Maths', '10'], ['10A', 'Social Studies', '10'], ['XII', 'Physics', '12'], ['Class 9', 'Science', '9']];
for (const [cls, subj, want] of probes) {
  const hit = getCurriculum(cls, subj);
  if (!hit || hit.class !== want) fail('lookup', `getCurriculum("${cls}", "${subj}") did not resolve to class ${want}`);
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log(`\nAll ${CURRICULUM.length} subjects valid.`);
