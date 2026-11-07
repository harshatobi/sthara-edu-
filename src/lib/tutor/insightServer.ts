import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { byIds } from '@/lib/ops/page';
import { subjectSlug } from '@/lib/subjects/catalog';
import { chapterKey } from './socraticServer';

/**
 * What the Socratic tutor has seen in one class and subject (PR3, decisions of 2026-11-06): per chapter, how many
 * students worked through it, their average depth, the misconceptions it tagged (with which students), and the
 * chapter's misconception bank for the teacher to curate. Finished sessions only; transcripts are never read.
 */
export interface InsightStudent { id: string; name: string }
export interface InsightChapter {
  chapterKey: string; name: string; level: string;
  sessions: number; students: number; depth: number | null;
  /** Students whose latest session on the chapter scored under 50. */
  struggling: InsightStudent[];
  misconceptions: { id: string; label: string; students: InsightStudent[] }[];
  bank: { id: string; label: string; description: string; status: 'active' | 'retired'; source: 'ai' | 'teacher' }[];
}
export interface Insight { subjectKeys: string[]; level: string | null; chapters: InsightChapter[] }

const levelOf = (cls: string) => cls.match(/\d{1,2}/)?.[0] ?? null;

export async function tutorInsight(db: SupabaseClient, schoolId: string, cls: string, subject: string, roster: InsightStudent[]): Promise<Insight> {
  const level = levelOf(cls);
  const ids = roster.map(s => s.id);
  const nameOf = new Map(roster.map(s => [s.id, s]));
  const esc = subject.replace(/[\\%_]/g, m => `\\${m}`);
  const sessions = ids.length ? await byIds<any>(ids, (chunk, a, b) => db.from('tutor_sessions')
    .select('id, student_id, topic, chapter_key, subject_key, level, depth_score, completed_at')
    .eq('school_id', schoolId).eq('status', 'done').ilike('subject', esc).in('student_id', chunk).order('id').range(a, b)) : { data: [] as any[] };
  const keys = [...new Set([subjectSlug(subject), ...sessions.data.map(s => s.subject_key).filter(Boolean)])];

  const [tags, bank] = await Promise.all([
    ids.length ? byIds<any>(ids, (chunk, a, b) => db.from('tutor_session_misconceptions')
      .select('student_id, chapter_key, misconception_id, tutor_misconceptions(label)')
      .eq('school_id', schoolId).in('subject_key', keys).in('student_id', chunk).order('session_id').order('misconception_id').range(a, b)) : Promise.resolve({ data: [] as any[] }),
    level ? db.from('tutor_misconceptions').select('id, chapter_key, label, description, status, source')
      // bounded: one level and subject's bank, a handful per chapter
      .eq('school_id', schoolId).eq('level', level).in('subject_key', keys).order('created_at').limit(2000) : Promise.resolve({ data: [] as any[] }),
  ]);

  const chapters = new Map<string, InsightChapter>();
  const get = (k: string, name?: string) => {
    let c = chapters.get(k);
    if (!c) { c = { chapterKey: k, name: name ?? k.replace(/\b\w/g, x => x.toUpperCase()), level: level ?? '', sessions: 0, students: 0, depth: null, struggling: [], misconceptions: [], bank: [] }; chapters.set(k, c); }
    if (name && c.name === k.replace(/\b\w/g, x => x.toUpperCase())) c.name = name;
    return c;
  };
  const byChapter = new Map<string, any[]>();
  for (const s of sessions.data) {
    const k = s.chapter_key || chapterKey(s.topic || '');
    byChapter.set(k, [...(byChapter.get(k) || []), s]);
    get(k, s.topic || undefined);
  }
  for (const [k, list] of byChapter) {
    const c = get(k);
    c.sessions = list.length;
    c.students = new Set(list.map(s => s.student_id)).size;
    const d = list.map(s => Number(s.depth_score)).filter(n => Number.isFinite(n) && n > 0);
    c.depth = d.length ? Math.round(d.reduce((x, y) => x + y, 0) / d.length) : null;
    const latest = new Map<string, any>();
    for (const s of list) { const p = latest.get(s.student_id); if (!p || s.completed_at > p.completed_at) latest.set(s.student_id, s); }
    c.struggling = [...latest.values()].filter(s => s.depth_score !== null && Number(s.depth_score) > 0 && Number(s.depth_score) < 50)
      .map(s => nameOf.get(s.student_id)).filter((x): x is InsightStudent => !!x);
  }
  const tagged = new Map<string, Map<string, { label: string; students: Set<string> }>>();
  for (const t of tags.data) {
    const k = t.chapter_key; if (!k) continue;
    const m = tagged.get(k) ?? new Map(); tagged.set(k, m);
    const e = m.get(t.misconception_id) ?? { label: t.tutor_misconceptions?.label ?? 'Misconception', students: new Set<string>() };
    e.students.add(t.student_id); m.set(t.misconception_id, e);
  }
  for (const [k, m] of tagged) {
    get(k).misconceptions = [...m].map(([id, e]) => ({ id, label: e.label, students: [...e.students].map(x => nameOf.get(x)).filter((x): x is InsightStudent => !!x) }))
      .sort((a, b) => b.students.length - a.students.length);
  }
  for (const b of (bank.data || [])) get(b.chapter_key).bank.push({ id: b.id, label: b.label, description: b.description, status: b.status, source: b.source });
  return {
    subjectKeys: keys, level,
    chapters: [...chapters.values()].sort((a, b) => b.misconceptions.length - a.misconceptions.length || b.sessions - a.sessions || a.name.localeCompare(b.name)),
  };
}
