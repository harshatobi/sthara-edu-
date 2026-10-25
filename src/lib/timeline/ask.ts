import 'server-only';
import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/lib/settings/limits';
import { generateMetered } from '@/lib/ai/usage';
import { SOURCE_LABEL, timelineText, type Timeline } from './rules';

/**
 * Ask about one student's timeline (brief 08): the model gets the year-by-year summary the viewer may already see,
 * with no names (the student is [[S]]), and answers from it alone. Never counselling notes or child protection: the
 * summary never carries them.
 */
export interface TimelineAnswer { say: string; suggestions: string[] }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The student's full name and first name become [[S]] on the way to the model. */
export function hideName(text: string, fullName: string): string {
  let out = text;
  const first = fullName.trim().split(/\s+/)[0];
  for (const n of [fullName.trim(), first]) if (n.length >= 2) out = out.replace(new RegExp(`(?<![\\w])${esc(n)}(?![\\w])`, 'gi'), '[[S]]');
  return out;
}

const VIEWER: Record<Timeline['who'], string> = {
  office: 'a member of the school office', class_teacher: 'the class teacher', subject_teacher: 'a subject teacher', parent: 'the student’s parent', student: 'the student themself',
};

export async function askTimeline(t: Timeline, fullName: string, messages: { role: 'me' | 'os'; text: string }[], meta: { userId: string; schoolId: string }): Promise<TimelineAnswer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Asking isn’t set up on this server yet (no AI key).');
  const first = fullName.trim().split(/\s+/)[0] || 'the student';
  const system = `You answer questions about one student's school record over the years, for ${VIEWER[t.who]}.
The student is written [[S]]. Use [[S]] for them; never guess a name.
Answer only from the TIMELINE below. It covers: ${t.sources.map(s => SOURCE_LABEL[s]).join(', ')}${t.subjects ? ` (subjects: ${t.subjects.join(', ')} only)` : ''}. If a question needs anything else, say it isn't on this timeline for you.
Quote numbers and school years (sessions like 2025-26). Compare years when asked how something has changed. Never invent figures.
Be kind and practical; never diagnose. ${t.who === 'student' ? 'Speak to the student as "you".' : ''}
Reply in the language the question is written in. At most 120 words of plain markdown, no headings.
Reply with ONE JSON object: {"say":"…","suggestions":["2 or 3 short follow-up questions"]}

TIMELINE (newest year first)
${timelineText(t)}`;
  const contents = messages.slice(-10).map(m => ({ role: m.role === 'os' ? 'model' : 'user', parts: [{ text: hideName(m.text, fullName) }] }));
  const ai = new GoogleGenAI({ apiKey });
  const res = await generateMetered(ai, {
    model: AI_MODELS.standard, contents,
    config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 0.3 },
  }, { feature: 'timelineAsk', userId: meta.userId, schoolId: meta.schoolId });
  const raw = JSON.parse((res.text || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim());
  const put = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n).replace(/\[\[S\]\]/g, t.who === 'student' ? 'you' : first) : '');
  const say = put(raw?.say, 3000);
  if (!say) throw new Error('empty reply');
  return { say, suggestions: (Array.isArray(raw?.suggestions) ? raw.suggestions : []).map((x: unknown) => put(x, 120)).filter(Boolean).slice(0, 3) };
}
