import { NextResponse, type NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope, normClass, normSubject } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { courseChapters, getCurriculum, CURRENT_SESSION } from '@/lib/curriculum';
import { topicKey } from '@/lib/teacher/desk';
import { parseReply, restoreNames, STUDIO, type StudioKind } from '@/lib/teacher/copilot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const str = (v: unknown, n = 4000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/**
 * POST /api/teacher/copilot
 * { class, subject, chapter?, studio?: { kind, count?, difficulty?, durationMin? },
 *   messages: [{ role: 'teacher' | 'copilot', text }] }
 *
 * Grounds every answer in the teacher's own class data (roster TML by chapter,
 * assignments and results, syllabus coverage, upcoming lessons, the official
 * curriculum). Students are sent to the model as [[S1]]…[[Sn]] tokens and the
 * names are restored in the reply — no student name ever leaves the server.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`copilot:${staff.id}`, 40, 10 * 60_000).allowed) {
    return NextResponse.json({ error: 'The Copilot needs a short break. Try again in a few minutes.' }, { status: 429 });
  }
  const b = await req.json().catch(() => null);
  const cls = str(b?.class, 40), subject = str(b?.subject, 60);
  if (!cls || !subject) return NextResponse.json({ error: 'Pick a class and subject.' }, { status: 400 });
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) return NextResponse.json({ error: `You don't teach ${subject} to ${cls}.` }, { status: 403 });
  const messages = (Array.isArray(b?.messages) ? b.messages : []).slice(-12)
    .map((m: any) => ({ role: m?.role === 'copilot' ? 'model' : 'user', text: str(m?.text, 6000) })).filter((m: any) => m.text);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return NextResponse.json({ error: 'Ask the Copilot something.' }, { status: 400 });
  const studioKind = STUDIO.some(x => x.kind === b?.studio?.kind) ? (b.studio.kind as StudioKind) : null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'The Copilot isn’t configured on this server (no AI key).' }, { status: 503 });

  // ── The brief: this class + subject, from the database ────────────────────
  const [{ data: users }, { data: assignments }, { data: progress }, { data: lessons }] = await Promise.all([
    db.from('users').select('id, name, student_class').eq('school_id', staff.schoolId).eq('role', 'student'),
    db.from('assignments').select('id, title, type, status, due_date, units, class, subject, total_marks').eq('school_id', staff.schoolId),
    db.from('syllabus_progress').select('chapter_key, topic, status').eq('school_id', staff.schoolId).eq('class', cls).eq('subject', subject).eq('session', CURRENT_SESSION),
    db.from('lesson_plans').select('title, chapter_name, lesson_date, status').eq('school_id', staff.schoolId).eq('class', cls).eq('subject', subject)
      .gte('lesson_date', new Date().toISOString().slice(0, 10)).order('lesson_date').limit(5),
  ]);
  const roster = (users || []).filter(u => normClass(u.student_class) === normClass(cls)).sort((x, y) => (x.name || '').localeCompare(y.name || ''));
  const token = new Map(roster.map((u, i) => [u.id, `S${i + 1}`]));
  const names = new Map(roster.map((u, i) => [`S${i + 1}`, u.name || `Student ${i + 1}`]));
  const work = (assignments || []).filter(a => normClass(a.class) === normClass(cls) && normSubject(a.subject) === normSubject(subject));

  const [{ data: tml }, { data: subs }] = await Promise.all([
    roster.length ? db.from('tml_scores').select('student_id, subject, topic_name, score, components, computed_at').in('student_id', roster.map(u => u.id)).order('computed_at', { ascending: false }).limit(3000) : Promise.resolve({ data: [] as any[] }),
    work.length ? db.from('submissions').select('assignment_id, student_id, score, max_score, teacher_approved').in('assignment_id', work.map(a => a.id)) : Promise.resolve({ data: [] as any[] }),
  ]);

  const latest = new Map<string, any>();
  for (const r of tml || []) {
    if (normSubject(r.subject) !== normSubject(subject)) continue;
    const k = `${r.student_id}::${topicKey(r.topic_name)}`;
    if (!latest.has(k)) latest.set(k, r);
  }
  const byChapter = new Map<string, { name: string; rows: { s: string; score: number; hw: number | null; qz: number | null; tu: number | null }[] }>();
  for (const r of latest.values()) {
    const k = topicKey(r.topic_name);
    if (!byChapter.has(k)) byChapter.set(k, { name: r.topic_name, rows: [] });
    const c = r.components || {};
    const n = (v: any) => (v === null || v === undefined ? null : Math.round(Number(v)));
    byChapter.get(k)!.rows.push({ s: token.get(r.student_id)!, score: Math.round(Number(r.score)), hw: n(c.homework?.score), qz: n(c.quiz?.score), tu: n(c.tutor?.score) });
  }

  const cur = getCurriculum(cls, subject);
  const chapters = cur ? courseChapters(cur) : [];
  const focus = chapters.find(c => topicKey(c.name) === topicKey(str(b?.chapter, 200)));
  const taughtBy = new Map<string, number>();
  for (const p of progress || []) if (p.topic && p.status === 'taught') taughtBy.set(p.chapter_key, (taughtBy.get(p.chapter_key) || 0) + 1);

  const brief: string[] = [];
  brief.push(`CLASS: ${cls} · SUBJECT: ${subject} · CBSE ${CURRENT_SESSION} · ${roster.length} students (${roster.map(u => `[[${token.get(u.id)}]]`).join(' ') || 'none enrolled'})`);
  brief.push(`TEACHER: ${staff.name}`);
  if (chapters.length) {
    brief.push(`CHAPTERS (teaching order; taught topics / total):\n${chapters.map(c => `${c.seq}. ${c.name} — ${taughtBy.get(topicKey(c.name)) || 0}/${c.topics.length} taught${c.formativeOnly ? ' (internal assessment only)' : ''}`).join('\n')}`);
  } else brief.push('CURRICULUM: not loaded for this class and subject.');
  if (focus) {
    brief.push(`FOCUS CHAPTER: ${focus.name}${focus.number ? ` (NCERT ch ${focus.number})` : ''}\nContent points:\n${focus.topics.map(t => `- ${t}`).join('\n')}\nLearning outcomes:\n${focus.outcomes.map(o => `- ${o}`).join('\n') || '- none listed'}${focus.notes?.length ? `\nExcluded / restricted:\n${focus.notes.map(x => `- ${x}`).join('\n')}` : ''}`);
  }
  if (byChapter.size) {
    brief.push(`TML BY CHAPTER (per student: TML, then homework/quiz/tutor components; — = no evidence):\n${[...byChapter.values()].map(c => {
      const avg = Math.round(c.rows.reduce((n, r) => n + r.score, 0) / c.rows.length);
      return `${c.name} — class avg ${avg}% over ${c.rows.length}: ${c.rows.map(r => `[[${r.s}]] ${r.score} (${r.hw ?? '—'}/${r.qz ?? '—'}/${r.tu ?? '—'})`).join('; ')}`;
    }).join('\n')}`);
  } else brief.push('TML: no graded evidence yet for this class and subject.');
  if (work.length) {
    brief.push(`ASSIGNMENTS:\n${work.slice(0, 15).map(a => {
      const ss = (subs || []).filter(x => x.assignment_id === a.id);
      const graded = ss.filter(x => x.teacher_approved && x.score !== null && x.max_score);
      const avg = graded.length ? Math.round(graded.reduce((n, x) => n + (x.score / x.max_score) * 100, 0) / graded.length) : null;
      const missing = roster.filter(u => !ss.some(x => x.student_id === u.id)).map(u => `[[${token.get(u.id)}]]`);
      return `- ${a.type} "${a.title}" (${a.status}, due ${a.due_date || '—'}, chapter ${Array.isArray(a.units) ? a.units[0] : '—'}): ${ss.length}/${roster.length} in, ${graded.length} graded${avg !== null ? `, avg ${avg}%` : ''}${a.status === 'published' && missing.length && missing.length < roster.length ? `; not in: ${missing.join(' ')}` : ''}`;
    }).join('\n')}`);
  } else brief.push('ASSIGNMENTS: none set yet for this class and subject.');
  if (lessons?.length) brief.push(`UPCOMING LESSONS:\n${lessons.map(l => `- ${l.lesson_date}: ${l.title} (${l.chapter_name}, ${l.status})`).join('\n')}`);
  if (studioKind) {
    const t = STUDIO.find(x => x.kind === studioKind)!;
    const targets: string[] = (Array.isArray(b?.studio?.targets) ? b.studio.targets : []).filter((id: unknown) => typeof id === 'string' && token.has(id)).slice(0, 60);
    if (targets.length) brief.push(`FOR THESE STUDENTS ONLY: ${targets.map(id => `[[${token.get(id)}]]`).join(' ')} — pitch it to their scores above.`);
    brief.push(`STUDIO REQUEST: ${t.label}${b?.studio?.count ? ` · ${Math.min(20, Number(b.studio.count) || 0)} items` : ''}${b?.studio?.difficulty ? ` · difficulty ${str(b.studio.difficulty, 20)}` : ''}${b?.studio?.durationMin ? ` · ${Math.min(120, Number(b.studio.durationMin) || 40)} minutes` : ''}`);
  }

  const system = `You are Sthara Copilot, a sharp, warm senior ${subject} teacher and instructional coach working beside ${staff.name}, a CBSE teacher in India.
You are not a chatbot: you think with the teacher's real class data (below) and you produce things they can use today.

HOW YOU WORK
- Ground every claim in the DATA BRIEF. Quote numbers from it. If the brief has no data for something, say so plainly; never invent scores, students or results.
- Students appear ONLY as tokens like [[S3]]. Refer to them with those exact tokens. Never guess or invent names.
- ASK: if something that materially changes the output is missing (which students, how many items, difficulty, format, time available), ask up to 3 short questions in "ask", each with 2–5 concrete options — and do not produce the artifact in that same reply. If the teacher already gave the details, or says "just do it", do not ask; make sensible choices and state them in one line.
- PROBE: when the request conflicts with the evidence, say so before acting and offer the choice (e.g. a hard quiz for a chapter the class averages 34% on; a new chapter while the last one is untaught or unassessed; remedial work for students who are actually fine). Be direct, never preachy.
- When you spot something the teacher didn't ask about but should know (a student slipping, a quiz/homework gap, missing submissions), mention it in one sentence.
- Stay inside the CBSE ${CURRENT_SESSION} curriculum for this class; respect exclusions listed for the chapter. Indian classroom context: ~40 students, blackboard, limited devices.
- "say" is short: at most 120 words of markdown. Put substance in the artifact.
- Always offer 2–4 "suggestions": short next steps written as the teacher would type them (e.g. "Make it easier for [[S2]]", "Turn this into a quiz").

ARTIFACTS (at most one per reply; omit when asking questions or just discussing)
- Practice / quiz / remedial / exit tickets: {"kind":"questions","purpose":"worksheet|quiz|remedial|exit_tickets","title":"…","chapter":"exact chapter name","notes":"marking guidance or answer notes","questions":[{"type":"mcq","questionText":"…","options":["…","…","…","…"],"answer":0,"marks":1,"level":"EASY|MEDIUM|HARD","why":"one-line explanation"},{"type":"short","questionText":"…","marks":3,"why":"model answer / marking points"}]}
  Quizzes and exit tickets: MCQ only. Worksheets: mix MCQ and short. Remedial: start concrete and easy, build up, include worked hints in "why".
- Lesson plan: {"kind":"lesson","title":"…","chapter":"…","topics":["exact content points"],"durationMin":40,"objectives":["Students will be able to …"],"successCriteria":["I can …"],"priorKnowledge":"…","materials":[{"label":"…"}],"stages":[{"name":"…","minutes":5,"teacher":"…","students":"…"}],"differentiation":{"support":"…","stretch":"…"},"checkForUnderstanding":"exit check with expected answer"} — stage minutes must sum to durationMin.
- Rubric: {"kind":"rubric","title":"…","criteria":[{"name":"…","levels":[{"label":"Exceeds","descriptor":"…","points":4}]}]}
- Anything else (parent note, explanations three ways, discussion prompts, marking scheme, feedback): {"kind":"document","title":"…","audience":"teacher|parent|student","markdown":"…"}. Parent notes: warm, specific, one concrete thing to do at home, under 150 words, sign off as ${staff.name}.

Reply with ONE JSON object only: {"say":"…","ask":[{"id":"q1","question":"…","options":["…"],"multi":false}],"artifact":{…} or null,"suggestions":["…"]}

DATA BRIEF
${brief.join('\n\n')}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text }] })),
      config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 0.5 },
    });
    const raw = (res.text || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const reply = restoreNames(parseReply(JSON.parse(raw)), names);
    if (!reply.say && !reply.artifact && !reply.ask.length) throw new Error('empty reply');
    return NextResponse.json({ reply, context: { students: roster.length, chaptersWithEvidence: byChapter.size, assignments: work.length } });
  } catch (e: any) {
    console.error('[copilot]', e?.message);
    return NextResponse.json({ error: 'The Copilot didn’t come back with a usable answer. Try again, or rephrase.' }, { status: 502 });
  }
}
