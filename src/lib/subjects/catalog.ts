/**
 * The subject catalogue: every subject a school tracks is an official
 * curriculum subject, identified the same way everywhere (TML, tutor, teacher
 * desk, timetable). Pure (no I/O); shared by the console and the server.
 *
 *   key    class-independent slug of the curriculum name: 'mathematics',
 *          'english-language-and-literature', 'telugu-telangana'
 *   name   the curriculum document's own name: 'English Language and Literature'
 *   level  the curriculum class it is taught at: '8' .. '12'
 */
import { coreSubjectsForClass, getCurriculum, normaliseClass, subjectsByStream, subjectsForClass } from '@/lib/curriculum';

export type SubjectKind = 'core' | 'elective';

export interface OfficialSubject { key: string; name: string; level: string; stream: string | null; codes: string[] }

export const subjectSlug = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The curriculum level of a class name: "Class 10-A" -> "10". Null when it isn't a class Sthara has a curriculum for. */
export const levelOf = (className: string | null | undefined) => normaliseClass(className);

/** Maps a subject as written ("Maths", "English", "SST") to the official subject of that class, or null. */
export function resolveSubject(className: string | null | undefined, raw: string | null | undefined): OfficialSubject | null {
  const level = levelOf(className);
  if (!level || !raw?.trim()) return null;
  const sub = getCurriculum(level, raw.trim());
  return sub ? { key: subjectSlug(sub.subject), name: sub.subject, level, stream: sub.stream ?? null, codes: sub.codes } : null;
}

/** Every official subject of a level, grouped for pickers. */
export function officialSubjects(className: string | null | undefined): { stream: string; subjects: OfficialSubject[] }[] {
  const level = levelOf(className);
  if (!level) return [];
  return subjectsByStream(level).map(g => ({
    stream: g.stream,
    subjects: g.subjects.map(n => resolveSubject(level, n)).filter((s): s is OfficialSubject => !!s),
  }));
}

/**
 * Core (every student of the class takes it) or elective (chosen per student).
 * Up to Class 10 the board's compulsory subjects are core and the rest (skill
 * subjects, extra languages) are electives; Classes 11-12 are stream-based,
 * so only the core language is compulsory.
 */
export function defaultKind(className: string | null | undefined, subjectName: string): SubjectKind {
  const level = levelOf(className);
  if (!level) return 'core';
  const core = coreSubjectsForClass(level);
  if (core.includes(subjectName)) return 'core';
  if (Number(level) <= 8) {
    // Middle school takes the whole NCERT set except the extra classical language.
    return /sanskrit/i.test(subjectName) ? 'elective' : 'core';
  }
  return 'elective';
}

/** The official subjects a class takes by default when it is set up. */
export function suggestedClassSubjects(className: string | null | undefined): { name: string; kind: SubjectKind }[] {
  const level = levelOf(className);
  if (!level) return [];
  const all = Number(level) <= 8 ? subjectsForClass(level) : coreSubjectsForClass(level);
  return all.map(name => ({ name, kind: defaultKind(level, name) }));
}

// ── Linking what a school already has ─────────────────────────────────────────

export interface LinkedRow { classId: string; subjectKey: string; subjectName: string; kind: SubjectKind }
export interface LegacyClass { id: string; name: string; subjects: string[] }
export interface LegacyTeacher { id: string; name: string; assignments: { class: string; subject: string }[] }

export type LinkStatus = 'linked' | 'will-link' | 'unknown-class' | 'no-match';
export interface ClassLinkPlan {
  classId: string; className: string; level: string | null;
  items: { raw: string; status: LinkStatus; official?: OfficialSubject; kind?: SubjectKind }[];
}
export interface TeacherLinkPlan {
  teacherId: string; name: string;
  items: { cls: string; raw: string; status: LinkStatus; official?: OfficialSubject; classId?: string }[];
}

const norm = (c: string) => c.toLowerCase().replace(/class|[^a-z0-9]/g, '');

/**
 * What linking would do: each legacy class subject and teacher assignment,
 * mapped to its official subject, or why it can't be. A teacher's subject is
 * linked into the class's offering too when the class doesn't list it yet.
 */
export function planLinking(classes: LegacyClass[], linked: LinkedRow[], teachers: LegacyTeacher[]): { classes: ClassLinkPlan[]; teachers: TeacherLinkPlan[] } {
  const have = new Set(linked.map(l => `${l.classId}|${l.subjectKey}`));
  const byNorm = new Map(classes.map(c => [norm(c.name), c]));
  const classPlans: ClassLinkPlan[] = classes.map(c => {
    const level = levelOf(c.name);
    const seen = new Set<string>();
    const items = c.subjects.filter(s => s.trim()).map(raw => {
      if (!level) return { raw, status: 'unknown-class' as const };
      const official = resolveSubject(c.name, raw);
      if (!official) return { raw, status: 'no-match' as const };
      const k = `${c.id}|${official.key}`;
      const status: LinkStatus = have.has(k) || seen.has(k) ? 'linked' : 'will-link';
      seen.add(k);
      return { raw, status, official, kind: linked.find(l => l.classId === c.id && l.subjectKey === official.key)?.kind ?? defaultKind(c.name, official.name) };
    });
    return { classId: c.id, className: c.name, level, items };
  });
  const teacherPlans: TeacherLinkPlan[] = teachers.map(t => ({
    teacherId: t.id, name: t.name,
    items: t.assignments.filter(a => a.subject?.trim()).map(a => {
      const cls = byNorm.get(norm(a.class));
      if (!cls || !levelOf(cls.name)) return { cls: a.class, raw: a.subject, status: 'unknown-class' as const };
      const official = resolveSubject(cls.name, a.subject);
      if (!official) return { cls: cls.name, raw: a.subject, status: 'no-match' as const, classId: cls.id };
      return { cls: cls.name, raw: a.subject, status: 'will-link' as const, official, classId: cls.id };
    }),
  }));
  return { classes: classPlans, teachers: teacherPlans };
}

/**
 * The name to store for a subject a teacher module writes (planner, syllabus progress,
 * lessons, homework): the official name when it resolves for the class, else as given
 * (classes Sthara has no curriculum for yet).
 */
export const officialName = (className: string | null | undefined, subject: string) =>
  resolveSubject(className, subject)?.name ?? subject.trim();
