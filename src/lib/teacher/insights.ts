/**
 * The Copilot's "probe": observations computed from the teacher's real data —
 * never generated — each with the actions that follow from it. Pure.
 */
import type { TeacherDesk } from './desk';
import { chapterStats, chaptersFor, scoreFor } from './mastery';
import { normClass, normSubject } from './scope';
import type { StudioKind } from './copilot';

export interface InsightAction {
  label: string; href?: string;
  /** Opens the Studio preset (the teacher sees the example and settings before anything is generated). */
  studio?: { kind: StudioKind; cls: string; subject: string; chapter?: string; note: string; who?: 'all' | 'below'; student?: string };
}
export interface Insight { id: string; tone: 'r' | 'a' | 'b' | 'g'; title: string; detail: string; cls: string; actions: InsightAction[] }

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const first = (n: string) => n.split(' ')[0];
const listNames = (names: string[], max = 3) => `${names.slice(0, max).join(', ')}${names.length > max ? ` and ${names.length - max} more` : ''}`;

export function buildInsights(desk: TeacherDesk, today = new Date().toISOString().slice(0, 10)): Insight[] {
  const out: Insight[] = [];

  // 1. Work waiting on the teacher.
  const pending = desk.assignments.filter(a => a.pendingCount > 0);
  if (pending.length) {
    const n = pending.reduce((x, a) => x + a.pendingCount, 0);
    const a = pending[0];
    out.push({
      id: 'pending', tone: 'r', cls: a.cls,
      title: `${n} submission${n === 1 ? '' : 's'} waiting for your marks`,
      detail: `None of it counts toward TML until you confirm it. Most waiting: ${a.title} (${a.cls}).`,
      actions: [{ label: 'Review now', href: `/teacher/${a.type === 'quiz' ? 'quiz' : 'homework'}?${new URLSearchParams({ class: a.cls, a: a.id, s: a.submissions.find(s => s.state === 'pending')!.id })}` }],
    });
  }

  for (const c of desk.classes) {
    for (const subject of c.subjects.length ? c.subjects : ['']) {
      if (!subject) continue;
      const chapters = chaptersFor(c.cls, subject, c.students);
      const stats = chapterStats(chapters, c.students, subject).filter(x => x.scored > 0);

      // 2. The weakest chapter across the class.
      const weakest = [...stats].sort((x, y) => x.avg! - y.avg!)[0];
      if (weakest && weakest.avg! < 60) {
        const low = c.students.filter(s => (scoreFor(s, subject, weakest.key)?.score ?? 101) < 40);
        out.push({
          id: `weak-${c.cls}-${subject}`, tone: weakest.avg! < 40 ? 'r' : 'a', cls: c.cls,
          title: `${weakest.name} is ${c.cls}'s weakest ${subject} chapter`,
          detail: `Class average ${weakest.avg}% across ${weakest.scored} student${weakest.scored === 1 ? '' : 's'}${low.length ? `; ${listNames(low.map(s => first(s.name)))} below 40%` : ''}.`,
          actions: [
            { label: 'Plan a re-teach', studio: { kind: 'lesson', cls: c.cls, subject, chapter: weakest.name, note: `Re-teach lesson for ${weakest.name}: the class averages ${weakest.avg}%. Start from the most common misconception.` } },
            ...(low.length ? [{ label: `Remedial pack for ${low.length}`, studio: { kind: 'remedial' as const, cls: c.cls, subject, chapter: weakest.name, who: 'below' as const, note: `Remedial practice on ${weakest.name} for the ${low.length} student${low.length === 1 ? '' : 's'} below 40%: scaffolded, easiest first.` } }] : []),
          ],
        });
      }

      // 3. Quiz trailing homework on a chapter: a recall / transfer gap.
      for (const ch of stats) {
        const rows = c.students.map(s => scoreFor(s, subject, ch.key)).filter(t => t && t.homework !== null && t.quiz !== null);
        if (rows.length < 2) continue;
        const hw = Math.round(rows.reduce((n, t) => n + t!.homework!, 0) / rows.length);
        const qz = Math.round(rows.reduce((n, t) => n + t!.quiz!, 0) / rows.length);
        if (hw - qz >= 20) {
          out.push({
            id: `gap-${c.cls}-${ch.key}`, tone: 'a', cls: c.cls,
            title: `${c.cls}: quizzes trail homework on ${ch.name}`,
            detail: `Homework ${hw}% vs quiz ${qz}%. They can do it with time and notes, but not recall it under pressure.`,
            actions: [{ label: 'Retrieval quiz', studio: { kind: 'quiz', cls: c.cls, subject, chapter: ch.name, note: `Short low-stakes retrieval quiz on ${ch.name}; homework averages ${hw}% but quizzes ${qz}%.` } }],
          });
          break;
        }
      }

      // 4. Nothing coming: no posted work due in the next 7 days for this class + subject.
      const soon = desk.assignments.filter(a => a.status === 'published' && normClass(a.cls) === normClass(c.cls) && normSubject(a.subject) === normSubject(subject)
        && a.dueAt && a.dueAt >= today && a.dueAt <= new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10));
      if (!soon.length && c.students.length) {
        out.push({
          id: `quiet-${c.cls}-${subject}`, tone: 'b', cls: c.cls,
          title: `No ${subject} evidence due from ${c.cls} this week`,
          detail: 'TML only moves on graded work. A 5-question quiz is the quickest way to see where they are.',
          actions: [{ label: 'Draft a quick quiz', studio: { kind: 'quiz', cls: c.cls, subject, note: `A 5-question check on what ${c.cls} is studying right now.` } }],
        });
      }
    }

    // 5. Students missing work that's already due.
    const due = desk.assignments.filter(a => a.status === 'published' && normClass(a.cls) === normClass(c.cls) && a.dueAt && a.dueAt < today);
    if (due.length >= 2) {
      const missing = c.students.map(s => ({ s, n: due.filter(a => a.roster.some(r => r.id === s.id) && !a.submissions.some(x => x.studentId === s.id)).length }))
        .filter(x => x.n >= 2).sort((x, y) => y.n - x.n);
      if (missing.length) {
        const top = missing[0];
        out.push({
          id: `missing-${c.cls}`, tone: 'a', cls: c.cls,
          title: `${missing.length} student${missing.length === 1 ? '' : 's'} in ${c.cls} missing 2+ due tasks`,
          detail: `${listNames(missing.map(x => `${first(x.s.name)} (${x.n}/${due.length})`))}. Worth a word before it becomes a pattern.`,
          actions: [{ label: `Note to ${first(top.s.name)}'s parents`, studio: { kind: 'parent_note', cls: c.cls, subject: c.subjects[0] ?? '', student: top.s.id, note: `Hasn't handed in ${top.n} of the last ${due.length} tasks. Keep it warm and specific, and suggest one thing to do at home.` } }],
        });
      }
    }

    // 6. A class doing well: say so (teachers need the good news too).
    const strong = c.students.length && c.tml !== null && c.tml >= 75;
    if (strong) {
      out.push({
        id: `strong-${c.cls}`, tone: 'g', cls: c.cls,
        title: `${c.cls} is at ${c.tml}% TML`,
        detail: `${pct(c.evidenced, c.students.length)}% of the class has graded evidence. Ready for stretch work.`,
        actions: [{ label: 'Stretch discussion', studio: { kind: 'discussion', cls: c.cls, subject: c.subjects[0] ?? '', note: `Stretch discussion prompts for a strong class (${c.tml}% TML).` } }],
      });
    }
  }

  const rank = { r: 0, a: 1, b: 2, g: 3 };
  return out.sort((x, y) => rank[x.tone] - rank[y.tone]).slice(0, 8);
}
