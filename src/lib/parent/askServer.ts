import 'server-only';
import { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/lib/settings/limits';
import { fmtDate, inr } from '@/lib/admin/format';
import { ENERGY_LABEL, type FamilyView } from './family';
import { probeFamily, type ProbeFinding } from './probe';
import { loadFamily } from './load';
import { parseAskReply, restore, tokenize, type AskReply, type NameBook } from './ask';
import type { ParentCaller } from './serverAuth';

const CONSENT_LABEL: Record<string, string> = {
  ai_tutor: 'AI tutor', wellness_checkin: 'wellness check-ins', data_processing: 'data processing', proctoring: 'proctored tests',
};

export function nameBook(view: FamilyView): NameBook {
  const children = new Map(view.children.map((c, i) => [`C${i + 1}`, { id: c.id, name: c.name, first: c.firstName }]));
  const staffIds = new Map<string, string>();
  for (const c of view.children) for (const t of c.teachers) staffIds.set(t.id, t.name);
  for (const t of view.threads) if (t.staff) staffIds.set(t.staff.id, t.staff.name);
  const staff = new Map([...staffIds].map(([id, name], i) => [`T${i + 1}`, { id, name }]));
  return { children, staff };
}

/** The data brief: only this family's children, every name as a token. */
export function buildBrief(view: FamilyView, findings: ProbeFinding[], book: NameBook): string {
  const tokOfStaff = new Map([...book.staff].map(([t, s]) => [s.id, `[[${t}]]`]));
  const tokOfChild = new Map([...book.children].map(([t, c]) => [c.id, `[[${t}]]`]));
  const staff = (id: string | null | undefined) => (id ? tokOfStaff.get(id) ?? 'a teacher' : 'no teacher on record');
  const today = new Date().toISOString().slice(0, 10);
  const out: string[] = [`TODAY: ${today} · SCHOOL: ${view.parent.schoolName} (CBSE, India)`];
  out.push(`STAFF TOKENS: ${[...book.staff].map(([t]) => `[[${t}]]`).join(' ') || 'none'} · office = the school office (fees, admissions, leave, anything else)`);

  for (const c of view.children) {
    const k = tokOfChild.get(c.id)!;
    const lines: string[] = [`CHILD ${k} · ${c.cls || 'class not set'}${c.relationship ? ` · you are their ${c.relationship}` : ''}`];
    lines.push(`Class teacher: ${c.classTeacher ? staff(c.classTeacher.id) : 'not on record'}. Teachers: ${c.teachers.map(t => `${staff(t.id)} (${t.subjects.join(', ') || 'class teacher'})`).join('; ') || 'none on record'}.`);
    lines.push(`Overall mastery (TML): ${c.tml === null ? 'no graded evidence yet' : `${c.tml}% · ${c.band?.band}`}`);
    for (const s of c.subjects) {
      const weak = s.chapters.slice(0, 3).map(ch => `${ch.name} ${ch.score}% [hw ${ch.homework ?? '—'} / quiz ${ch.quiz ?? '—'} / tutor ${ch.tutor ?? '—'}; ${ch.confidence || 'unknown'} confidence, ${ch.items} items]`);
      const strong = s.chapters.length > 3 ? s.chapters.slice(-2).map(ch => `${ch.name} ${ch.score}%`) : [];
      lines.push(`- ${s.subject} (${staff(s.teacher?.id)}): ${s.score ?? '—'}%${s.delta !== null ? `, ${s.delta >= 0 ? 'up' : 'down'} ${Math.abs(s.delta)} points in three weeks on the same chapters` : ''}. Lowest: ${weak.join('; ')}${strong.length ? `. Strongest: ${strong.join('; ')}` : ''}`);
    }
    const overdue = c.work.filter(w => w.state === 'overdue');
    const todo = c.work.filter(w => w.state === 'todo');
    const waiting = c.work.filter(w => w.state === 'submitted');
    const graded = c.work.filter(w => w.state === 'graded').slice(0, 8);
    lines.push(`Work overdue: ${overdue.map(w => `${w.type} "${w.title}" (${w.subject}, due ${w.dueOn}, set by ${staff(w.teacher?.id)})`).join('; ') || 'none'}`);
    lines.push(`Work to do: ${todo.slice(0, 8).map(w => `${w.type} "${w.title}" (${w.subject}, due ${w.dueOn ?? 'no date'})`).join('; ') || 'none'}`);
    lines.push(`Handed in, awaiting teacher review: ${waiting.length}`);
    lines.push(`Recently graded: ${graded.map(w => `"${w.title}" (${w.subject}) ${w.score}/${w.max}${w.note ? `, teacher note: "${w.note.slice(0, 200)}"` : ''}`).join('; ') || 'none yet'}`);
    lines.push(c.wellness.consented
      ? `Wellbeing (last 14 days, energy 1–5; journal text is private and never shown): ${c.wellness.checkins} check-ins, average ${c.wellness.avgEnergy ?? '—'}, ${c.wellness.lowDays} low days, latest ${c.wellness.latestEnergy ? ENERGY_LABEL[c.wellness.latestEnergy] : '—'}${c.wellness.latestAt ? ` on ${c.wellness.latestAt.slice(0, 10)}` : ''}`
      : 'Wellbeing: not shared — the parent has not consented to wellness check-ins (they can in Settings).');
    lines.push(c.fees.invoices.length
      ? `Fees: ${inr(c.fees.outstanding)} outstanding, ${inr(c.fees.overdue)} overdue. ${c.fees.nextDue ? `Next: ${c.fees.nextDue.label} ${inr(c.fees.nextDue.balance)} due ${fmtDate(c.fees.nextDue.dueOn)} (${c.fees.nextDue.invoiceNo}).` : 'Nothing further due.'} Paid so far: ${inr(c.fees.invoices.reduce((n, i) => n + i.paid, 0))}.`
      : 'Fees: no invoices raised this session.');
    lines.push(`Consents: ${Object.entries(CONSENT_LABEL).map(([key, label]) => `${label} ${c.consents[key] === undefined ? 'not decided' : c.consents[key] ? 'granted' : 'declined'}`).join(', ')}`);
    out.push(lines.join('\n'));
  }
  if (view.threads.length) {
    out.push(`CONVERSATIONS WITH SCHOOL:\n${view.threads.slice(0, 8).map(t => `- about ${tokOfChild.get(t.studentId) ?? 'a child'} with ${t.staff ? staff(t.staff.id) : 'office'}: "${t.subject}" (${t.status}${t.unread ? ', unread reply' : ''}, last ${t.lastAt.slice(0, 10)})`).join('\n')}`);
  }
  if (findings.length) {
    out.push(`PROBE (what the School OS noticed, most important first):\n${findings.slice(0, 10).map(f => `- [${f.severity}] ${tokOfChild.get(f.childId)}: ${f.title}. ${f.detail}`).join('\n')}`);
  }
  return tokenize(out.join('\n\n'), book);
}

function systemPrompt(view: FamilyView, brief: string, channel: 'web' | 'whatsapp') {
  const kids = view.children.length;
  return `You are the School OS of ${view.parent.schoolName}: the school's own assistant, speaking with a parent about their ${kids === 1 ? 'child' : 'children'}.
You know exactly what the school's records say (the DATA BRIEF below) and nothing else about the family.

HOW YOU WORK
- Answer from the DATA BRIEF only. Quote its numbers and dates. If the brief doesn't cover something (attendance, timetable, exam dates, transport, events), say the school hasn't shared that here and offer to ask the right person. Never invent scores, dates, teachers or policies.
- Children appear only as tokens like [[C1]], teachers as [[T1]]. Use those exact tokens; never guess names.
- ASK: ${kids > 1 ? 'if the question could be about more than one child and it matters, ask which child (options are the child tokens) before answering. ' : ''}If a request is too vague to answer well, ask ONE short question with 2–4 options. If it is clear, answer straight away.
- PROBE: explain the why behind a number, not just the number (e.g. a low chapter score driven by missing homework rather than wrong answers; a dip after a run of overdue work). After answering, if the PROBE list has something serious (severity 60+) the parent hasn't heard in this conversation, raise it in one sentence.
- Mastery (TML) in plain words: 90+ exemplary, 75–89 proficient, 50–74 developing, 35–49 a gap the tutor works on, under 35 needs support now. It blends homework and quizzes (time-weighted, recent counts more) with how independently the child works in the AI tutor. "Provisional" or "insufficient" confidence means too little evidence to be sure — say so.
- Help at home: concrete, 10–15 minutes, doable by a parent who may not know the subject. No tuition sales, no blame.
- COMMUNICATE: when the parent wants to tell or ask the school something (a question for a teacher, a meeting, a leave note, a fee query, a concern), or when talking to a teacher is clearly the next step, add a "message" action with a short draft IN THE PARENT'S VOICE (first person, polite, specific, under 90 words), addressed to the right teacher token or "office". Never say it has been sent: the parent confirms first.
- Wellbeing: gentle, never diagnose. Journal entries are private to the child; never speculate about them. If the parent mentions bullying, self-harm, abuse or a crisis: urge them to speak to the class teacher or school counsellor today, add a "message" action to the class teacher (topic wellbeing), and give Tele-MANAS 14416 (free, 24x7) for a mental-health crisis.
- Privacy: you only know this family's children. Never discuss or compare with other named students.
- Language: reply in the language and script the parent writes in (English, Hindi, Hinglish, Tamil, and so on). Keep tokens as they are.
- ${channel === 'whatsapp' ? '"say" is for WhatsApp: plain text, at most 110 words, *single asterisks* for bold, short lines, no tables, no headings.' : '"say" is short markdown: at most 130 words. Bullets welcome, no headings.'}
- "facts": up to 4 figures from the brief that back your answer (label + value + tone g good / a watch / r concern / b info / n neutral).
- "suggestions": 2–4 next questions as the parent would type them.
- "actions" may also include {"kind":"open","page":"progress|schoolwork|fees|messages|settings","label":"…"} when a page shows the detail.

Reply with ONE JSON object only:
{"say":"…","ask":[{"id":"q1","question":"…","options":["…"]}],"facts":[{"label":"…","value":"…","tone":"g"}],"actions":[{"kind":"message","to":"[[T1]] or office","child":"[[C1]]","topic":"general|academics|homework|wellbeing|fees|meeting|leave","subject":"…","draft":"…"}],"suggestions":["…"]}

DATA BRIEF
${brief}`;
}

export interface AskResult { reply: AskReply; view: FamilyView; findings: ProbeFinding[] }

/**
 * One turn of Ask the School OS for a parent, on the web or WhatsApp.
 * Throws with a user-facing message.
 */
export async function askSchoolOS(db: SupabaseClient, parent: ParentCaller, messages: { role: 'parent' | 'os'; text: string }[], channel: 'web' | 'whatsapp'): Promise<AskResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('The School OS isn’t configured on this server yet (no AI key).');
  const view = await loadFamily(db, parent);
  if (!view.children.length) {
    return {
      view, findings: [],
      reply: { say: 'Your account isn’t linked to a child yet. The school office links parents to students after checking; once that’s done I can answer anything about schoolwork, progress, wellbeing and fees.', ask: [], facts: [], actions: [{ kind: 'message', audience: 'office', to: null, toName: 'School office', childId: null, topic: 'general', subject: 'Please link my child to my account', draft: 'Hello, could you please link my child to my parent account on Sthara? Thank you.' }], suggestions: [] },
    };
  }
  const findings = probeFamily(view);
  const book = nameBook(view);
  const system = systemPrompt(view, buildBrief(view, findings, book), channel);
  const contents = messages.slice(-12).map(m => ({ role: m.role === 'os' ? 'model' : 'user', parts: [{ text: tokenize(m.text, book) }] }));
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model: AI_MODELS.standard, contents,
    config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 0.4 },
  });
  const raw = (res.text || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const reply = restore(parseAskReply(JSON.parse(raw), book), book);
  if (!reply.say && !reply.ask.length) throw new Error('empty reply');
  return { reply, view, findings };
}
