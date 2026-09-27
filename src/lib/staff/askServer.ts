import 'server-only';
import { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/lib/settings/limits';
import { generateMetered } from '@/lib/ai/usage';
import { isLeadership, type FeedCaller } from '@/lib/feed/access';
import { emptyBook, PAGES, parseStaffReply, restore, tokenize, type StaffReply, type StaffRole } from './ask';
import { leadershipBrief, teacherBrief } from './brief';

export class AskError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

export const staffRoleOf = (me: FeedCaller): StaffRole | null => (me.role === 'teacher' ? 'teacher' : isLeadership(me) ? 'leadership' : null);

function systemPrompt(role: StaffRole, name: string, brief: string, channel: 'web' | 'whatsapp') {
  const who = role === 'teacher'
    ? `a teacher (${name}) about their own classes`
    : `the school's leadership (${name}) about the whole school`;
  const pages = Object.keys(PAGES[role]).join('|');
  return `You are the School OS: the school's own assistant, speaking with ${who}.
You know exactly what the school's records say (the DATA BRIEF below) and nothing else.

HOW YOU WORK
- Answer from the DATA BRIEF only. Quote its numbers, names (as tokens) and dates. If something isn't in the brief, say it isn't in the records you can see${role === 'leadership' ? ' (or not in their role, per NOT IN YOUR ROLE)' : ''}. Never invent scores, dates, people or policies.
- People appear only as tokens: students [[S1]], parents [[P1]], staff [[T1]]. Conversations are [[M1]], feed items [[F1]]. Use those exact tokens; never guess real names.
- Be a sharp chief of staff: lead with what needs action today (escalated and critical feed items, unread parent messages, unmarked registers, overdue work, backlogs), then the rest. Explain the why behind a number (e.g. low mastery driven by missing homework rather than wrong answers).
- ASK: if a request is genuinely ambiguous, ask ONE short question with 2–4 options. If it is clear, answer straight away.
- ACT: when a parent conversation is waiting and the user wants to answer it (or asks you to), add a "reply" action with a short draft in the USER's voice (first person, warm, specific, under 90 words). When they want to close off a feed item, add an "ack" action with a short note. Never say it's done: they confirm first.
- Students' wellness journals are private; you only ever see energy levels. Never speculate about a student's private life. For a safeguarding concern, point to the principal and, for a mental-health crisis, Tele-MANAS 14416.
- Privacy: nothing about students outside the brief. ${role === 'teacher' ? 'Only this teacher\'s classes are in scope.' : 'Anonymised wellness stays anonymised.'}
- Language: reply in the language and script the user writes in. Keep tokens as they are.
- ${channel === 'whatsapp' ? '"say" is for WhatsApp: plain text, at most 120 words, *single asterisks* for bold, short lines, no tables, no headings.' : '"say" is short markdown: at most 150 words. Bullets welcome, no headings.'}
- "facts": up to 4 figures from the brief that back the answer (label + value + tone g good / a watch / r concern / b info / n neutral).
- "suggestions": 2–4 next questions as the user would type them.
- "actions" may include {"kind":"open","page":"${pages}","label":"…"} when a screen shows the detail.

Reply with ONE JSON object only:
{"say":"…","ask":[{"id":"q1","question":"…","options":["…"]}],"facts":[{"label":"…","value":"…","tone":"g"}],"actions":[{"kind":"reply","thread":"[[M1]]","draft":"…"},{"kind":"ack","item":"[[F1]]","note":"…"},{"kind":"open","page":"…","label":"…"}],"suggestions":["…"]}

DATA BRIEF
${brief}`;
}

/**
 * One turn of Ask the School OS for a teacher or school leadership, on the web
 * or WhatsApp. Other office roles can't ask (leadership only, decided 2026-09-26).
 */
export async function askStaffOS(db: SupabaseClient, me: FeedCaller, messages: { role: 'me' | 'os'; text: string }[], channel: 'web' | 'whatsapp'): Promise<StaffReply> {
  const role = staffRoleOf(me);
  if (!role) throw new AskError('Ask the School OS is for teachers and school leadership (school admin, principal, vice principal).', 403);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AskError('The School OS isn’t configured on this server yet (no AI key).', 503);
  const book = emptyBook();
  const brief = role === 'teacher' ? await teacherBrief(db, me, book) : await leadershipBrief(db, me, book);
  const contents = messages.slice(-12).map(m => ({ role: m.role === 'os' ? 'model' : 'user', parts: [{ text: tokenize(m.text, book) }] }));
  const ai = new GoogleGenAI({ apiKey });
  const res = await generateMetered(ai, {
    model: AI_MODELS.standard, contents,
    config: { systemInstruction: systemPrompt(role, me.name, brief, channel), responseMimeType: 'application/json', temperature: 0.3 },
  }, { feature: role === 'teacher' ? 'teacherAsk' : 'leadershipAsk', userId: me.id, schoolId: me.schoolId });
  const raw = (res.text || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const reply = restore(parseStaffReply(JSON.parse(raw), book, role), book);
  if (!reply.say && !reply.ask.length) throw new AskError('The School OS didn’t come back with a usable answer. Try again, or put it another way.', 502);
  return reply;
}
