/**
 * The tutor's grounding engine, pure part (no I/O).
 *
 * Every student message is checked against the student's own syllabus before
 * the tutor answers: the subjects they take (student_subjects), the official
 * chapters and micro-topics of each, earlier-class chapters of the same subject
 * (prerequisites), and their exam track. Anything outside that is refused.
 *
 * The classifier is shown the scope as short reference codes (S1.C3.t2) and
 * may only answer with a code, so a chapter it invents can't get through:
 * validate() looks every code up and downgrades anything unknown to off-topic.
 */
import { courseChapters, getCurriculum, normaliseClass } from '@/lib/curriculum';
import { examsForChapter } from '@/lib/curriculum/exams';
import { resolveSubject, subjectSlug } from '@/lib/subjects/catalog';

export type GroundKind = 'syllabus' | 'prerequisite' | 'exam' | 'study_skills' | 'wellbeing' | 'safety' | 'greeting' | 'off_topic';
/** Kinds that start or continue a tutor session. */
export const TEACHABLE: GroundKind[] = ['syllabus', 'prerequisite', 'exam', 'study_skills'];

export interface ScopeChapter { name: string; unit: string; topics: string[]; formativeOnly: boolean; exams: string[] }
export interface ScopePrereq { level: string; name: string; chapters: ScopeChapter[] }
export interface ScopeSubject {
  key: string; name: string; level: string;
  source: 'core' | 'elective' | 'class';
  /** Curriculum stream (Language, Science, ...), for ordering suggestions. */
  stream: string | null;
  chapters: ScopeChapter[];
  /** The same subject in earlier classes, nearest first. */
  prereqs: ScopePrereq[];
}
export interface StudentScope { level: string | null; subjects: ScopeSubject[]; exams: string[] }

export interface Grounding {
  kind: GroundKind;
  subjectKey: string | null;
  subjectName: string | null;
  /** Curriculum level the chapter is from (a prerequisite is an earlier class). */
  level: string | null;
  chapter: string | null;
  microTopic: string | null;
  /** For a borderline topic: how the syllabus approaches it, e.g. "WWI's effect on India's national movement". */
  angle: string | null;
}

export const none = (kind: GroundKind, angle: string | null = null): Grounding =>
  ({ kind, subjectKey: null, subjectName: null, level: null, chapter: null, microTopic: null, angle });

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const LOWEST_LEVEL = 6;

/** Class 11-12 subjects and the earlier subject their basics come from. */
const FAMILY: Record<string, string> = {
  physics: 'Science', chemistry: 'Science', biology: 'Science', biotechnology: 'Science',
  'applied-mathematics': 'Mathematics',
  history: 'Social Science', geography: 'Social Science', 'political-science': 'Social Science', economics: 'Social Science', sociology: 'Social Science',
  'english-core': 'English', 'english-elective': 'English',
  'hindi-core': 'Hindi', 'hindi-elective': 'Hindi',
};

// ── Scope ─────────────────────────────────────────────────────────────────────

function chaptersOf(level: string, subjectName: string, exams: string[]): ScopeChapter[] | null {
  const sub = getCurriculum(level, subjectName);
  if (!sub) return null;
  return courseChapters(sub).map(c => ({
    name: c.name, unit: c.unitName, topics: c.topics, formativeOnly: !!c.formativeOnly,
    exams: exams.length ? [...new Set(examsForChapter(sub.class, sub.subject, c.name, exams).map(h => h.exam.id))] : [],
  }));
}

/**
 * The same subject in an earlier class: by key, then by the subject's own name,
 * then by its first word ("English Language and Literature" -> Class 9 "English").
 */
function earlier(level: string, subject: { key: string; name: string }): { name: string } | null {
  const family = FAMILY[subject.key];
  // Senior-school subjects grow out of one earlier subject (Physics -> Class 10 Science).
  if (family) { const o = resolveSubject(level, family); if (o) return { name: o.name }; }
  for (const probe of [subject.name, subject.key.replace(/-/g, ' '), subject.name.split(/\s+/)[0]]) {
    const o = resolveSubject(level, probe);
    if (o && (o.key === subject.key || subjectSlug(o.name).split('-')[0] === subject.key.split('-')[0])) return { name: o.name };
  }
  return null;
}

/** Builds a student's scope from their enrolled subjects (class and level come from the database). */
export function buildScope(input: { className: string | null; subjects: { key: string; name: string; level?: string | null; source: 'core' | 'elective' | 'class' }[]; exams: string[] }): StudentScope {
  const level = normaliseClass(input.className);
  const subjects: ScopeSubject[] = [];
  for (const s of input.subjects) {
    const lvl = s.level || level;
    if (!lvl) continue;
    const chapters = chaptersOf(lvl, s.name, input.exams);
    if (!chapters) continue;
    const prereqs: ScopePrereq[] = [];
    for (let l = Number(lvl) - 1; l >= LOWEST_LEVEL; l--) {
      const e = earlier(String(l), s);
      const ch = e && chaptersOf(String(l), e.name, []);
      if (e && ch) prereqs.push({ level: String(l), name: e.name, chapters: ch });
    }
    subjects.push({ key: s.key, name: s.name, level: lvl, source: s.source, stream: getCurriculum(lvl, s.name)?.stream ?? null, chapters, prereqs });
  }
  return { level, subjects, exams: input.exams };
}

// ── Deterministic matching (a chapter or micro-topic picked from the list) ────

/** Grounds a subject + topic picked from the syllabus list, without the classifier. Null when it isn't an exact pick. */
export function matchPicked(scope: StudentScope, subject: string, topic: string): Grounding | null {
  const s = scope.subjects.find(x => key(x.name) === key(subject) || x.key === subjectSlug(subject));
  if (!s) return null;
  const t = key(topic);
  for (const c of s.chapters) {
    if (key(c.name) === t) return { kind: c.exams.length ? 'exam' : 'syllabus', subjectKey: s.key, subjectName: s.name, level: s.level, chapter: c.name, microTopic: null, angle: null };
    const m = c.topics.find(x => key(x) === t);
    if (m) return { kind: 'syllabus', subjectKey: s.key, subjectName: s.name, level: s.level, chapter: c.name, microTopic: m, angle: null };
  }
  return null;
}

export const isEnrolled = (scope: StudentScope, subject: string) =>
  scope.subjects.some(x => key(x.name) === key(subject) || x.key === subjectSlug(subject));

// ── The scope as the classifier sees it ───────────────────────────────────────

/**
 * Reference codes: S<n> subject, S<n>.C<m> chapter, S<n>.C<m>.t<k> micro-topic,
 * S<n>.P<level>.C<m> an earlier-class chapter. Earlier classes list chapter names only.
 */
export function scopeDigest(scope: StudentScope, only?: { subjectKey: string; chapter?: string }): string {
  const lines: string[] = [];
  // Codes keep their place in the whole scope, so a focused digest validates the same way.
  scope.subjects.forEach((s, i) => {
    if (only && s.key !== only.subjectKey) {
      // Focused on one subject: the others show chapter names only, so a topic from another
      // subject the student takes can still be placed there.
      if (!only.chapter) lines.push(`S${i + 1} ${s.name} (Class ${s.level}): ${s.chapters.map((c, j) => `S${i + 1}.C${j + 1} ${c.name}`).join('; ')}`);
      return;
    }
    const S = `S${i + 1}`;
    lines.push(`${S} ${s.name} (Class ${s.level}${s.source === 'elective' ? ', elective' : ''})`);
    s.chapters.forEach((c, j) => {
      if (only?.chapter && key(c.name) !== key(only.chapter)) return;
      const tps = c.topics.map((t, k) => `t${k + 1} ${t}`).join('; ');
      lines.push(`  ${S}.C${j + 1} ${c.name}${c.exams.length ? ` [exam: ${c.exams.join(', ')}]` : ''}${tps ? `: ${tps}` : ''}`);
    });
    if (!only?.chapter) {
      for (const p of s.prereqs) {
        lines.push(`  earlier, Class ${p.level} ${p.name}:`);
        p.chapters.forEach((c, j) => lines.push(`    ${S}.P${p.level}.C${j + 1} ${c.name}${c.topics.length ? `: ${c.topics.slice(0, 6).join('; ')}` : ''}`));
      }
    }
  });
  return lines.join('\n');
}

export interface RawClassification { kind?: unknown; ref?: unknown; angle?: unknown }

/**
 * Turns the classifier's reply into a grounding the tutor may act on. A teaching
 * kind must carry a code that exists in this student's scope; otherwise it is
 * off-topic, whatever the model said.
 */
export function validate(scope: StudentScope, raw: RawClassification): Grounding {
  const kinds: GroundKind[] = ['syllabus', 'prerequisite', 'exam', 'study_skills', 'wellbeing', 'safety', 'greeting', 'off_topic'];
  const kind = kinds.includes(raw.kind as GroundKind) ? (raw.kind as GroundKind) : 'off_topic';
  const angle = typeof raw.angle === 'string' && raw.angle.trim() ? raw.angle.trim().slice(0, 200) : null;
  if (kind === 'wellbeing' || kind === 'safety' || kind === 'greeting' || kind === 'off_topic') return none(kind);
  if (kind === 'study_skills') return none('study_skills', angle);

  const ref = typeof raw.ref === 'string' ? raw.ref.trim() : '';
  const m = ref.match(/^S(\d+)\.(?:P(\d{1,2})\.)?C(\d+)(?:\.t(\d+))?$/);
  if (!m) return none('off_topic');
  const s = scope.subjects[Number(m[1]) - 1];
  if (!s) return none('off_topic');
  if (m[2]) {
    const p = s.prereqs.find(x => x.level === m[2]);
    const c = p?.chapters[Number(m[3]) - 1];
    if (!p || !c) return none('off_topic');
    return { kind: 'prerequisite', subjectKey: s.key, subjectName: s.name, level: p.level, chapter: c.name, microTopic: null, angle };
  }
  const c = s.chapters[Number(m[3]) - 1];
  if (!c) return none('off_topic');
  const t = m[4] ? c.topics[Number(m[4]) - 1] ?? null : null;
  if (m[4] && !t) return none('off_topic');
  return { kind: kind === 'exam' && !c.exams.length ? 'syllabus' : kind, subjectKey: s.key, subjectName: s.name, level: s.level, chapter: c.name, microTopic: t, angle };
}

// ── Refusals ──────────────────────────────────────────────────────────────────

export interface Suggestion { subject: string; chapter: string }

/** Two or three chapters to offer instead: weakest first when mastery is known, else the start of each subject. */
export function suggestions(scope: StudentScope, weak: { subject: string; topic: string; score: number }[] = [], n = 3): Suggestion[] {
  const out: Suggestion[] = [];
  const has = (s: string, c: string) => out.some(x => key(x.subject) === key(s) && key(x.chapter) === key(c));
  for (const w of [...weak].sort((a, b) => a.score - b.score)) {
    const s = scope.subjects.find(x => key(x.name) === key(w.subject));
    const c = s?.chapters.find(x => key(x.name) === key(w.topic));
    if (s && c && !has(s.name, c.name)) out.push({ subject: s.name, chapter: c.name });
    if (out.length >= n) return out;
  }
  // No mastery to go on: concept subjects first (a language's first "chapter" is usually a skills section).
  const ordered = [...scope.subjects].sort((a, b) => Number(a.stream === 'Language') - Number(b.stream === 'Language'));
  for (let i = 0; out.length < n && i < 3; i++) {
    for (const s of ordered) {
      const c = s.chapters.filter(x => !x.formativeOnly)[i];
      if (c && !has(s.name, c.name)) out.push({ subject: s.name, chapter: c.name });
      if (out.length >= n) break;
    }
  }
  return out;
}

export const REFUSAL = 'I can only help with your school subjects. That one is outside your syllabus, so I will leave it.';
export const WELLBEING_REPLY = 'That sounds important, and it deserves more than a maths tutor. The Wellness Centre is the place for how you are feeling, and your school counsellor is there to listen.';
export const SAFETY_REPLY = 'Thank you for telling me. You do not have to deal with this alone. Someone you trust at school will reach out to you soon. If you feel unsafe right now, please talk to a teacher or a family member, or call Tele-MANAS on 14416 (free, any time).';
/** Gemini's quota ran out (HTTP 429): an honest message, not "something went wrong". */
export const QUOTA_REPLY = 'The AI tutor has reached its limit for now. Please try again in a little while.';
export const isQuotaError = (e: unknown) => {
  const x = e as { status?: unknown; code?: unknown; message?: unknown } | null;
  return x?.status === 429 || x?.code === 429 || /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(String(x?.message ?? ''));
};
export const NO_SUBJECTS = 'Your school has not set up your subjects in Sthara yet, so the tutor cannot start. Please tell your class teacher.';
export const redirectTo = (g: { chapter: string | null; microTopic: string | null }) =>
  `Let's stay with ${g.microTopic ?? g.chapter ?? 'this topic'}. Try the question again, or ask for a hint.`;

// ── Which session messages are worth checking ─────────────────────────────────

const STOP = new Set(['the', 'and', 'of', 'in', 'on', 'to', 'a', 'an', 'is', 'are', 'its', 'it', 'for', 'with', 'by', 'as', 'at', 'or', 'from', 'their', 'into', 'about', 'using', 'uses', 'use', 'life', 'everyday', 'importance', 'examples']);

/**
 * An answer inside a session usually is one: a number, a formula, a short phrase.
 * Those skip the classifier. A question back, a long message, or chatter with no
 * working in it gets checked for drifting off the topic.
 */
export function needsTurnCheck(text: string, chapterWords: string[] = []): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.includes('?')) return true;
  if (t.length > 120) return true;
  if (/[0-9=+\-×÷*/^√π²³%<>()]/.test(t)) return false;
  const words = key(t).split(' ');
  if (words.length <= 3) return false;
  // Short subject words count ("pH", "DNA"); everyday glue words don't.
  const vocab = new Set(chapterWords.flatMap(w => key(w).split(' ')).filter(w => w.length >= 2 && !STOP.has(w)));
  return !words.some(w => vocab.has(w));
}

/**
 * The model's JSON, even when it puts a raw line break or tab inside a string
 * (Gemini does this with multi-line tutor text; strict JSON.parse refuses it).
 */
export function parseModelJson(text: string): Record<string, unknown> {
  try { return JSON.parse(text); } catch { /* repair below */ }
  let out = '', inStr = false, esc = false;
  for (const ch of text) {
    if (inStr) {
      if (esc) { esc = false; out += ch; continue; }
      if (ch === '\\') { esc = true; out += ch; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      const code = ch.charCodeAt(0);
      out += code < 0x20 ? (ch === '\n' ? '\\n' : ch === '\t' ? '\\t' : ch === '\r' ? '' : ' ') : ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return JSON.parse(out);
}

