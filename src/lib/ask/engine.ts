import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf, type RateLimitKey } from '@/lib/settings/limits';
import { generateAi, aiConfigured } from '@/lib/ai/generate';
import type { AiFeature } from '@/lib/ai/pricing';
import { callerById, isLeadership, type FeedCaller } from '@/lib/feed/access';
import { normClass } from '@/lib/teacher/scope';
import { istDay } from '@/lib/feed/rules';
import { emptyBook, personToken, restore as restoreStaff, tokenize as tokenizeStaff, PAGES as STAFF_PAGES, type Book } from '@/lib/staff/ask';
import { leadershipBrief, teacherBrief } from '@/lib/staff/brief';
import { loadFamily } from '@/lib/parent/load';
import { probeFamily } from '@/lib/parent/probe';
import { buildBrief, histories, nameBook } from '@/lib/parent/askServer';
import { PAGES as PARENT_PAGES, restore as restoreParent, tokenize as tokenizeParent } from '@/lib/parent/ask';
import type { FamilyView } from '@/lib/parent/family';
import type { TeacherDesk } from '@/lib/teacher/desk';
import type { AdminDesk } from '@/lib/admin/desk';
import { runParentLookups, runStaffLookups, type StaffCtx } from './lookups';
import { emptyActionBook, parseAnswer, parsePlan, Sources, TOOLS, toolsFor, type AskReply, type SourceDef, type ToolKey, type Viewer } from './protocol';

/**
 * Ask the School OS for everyone who has it: teachers, every office role
 * (scoped to their permissions), and parents (their own children). See
 * protocol.ts for how one question runs.
 */

export class AskError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

export type Asker =
  | { kind: 'staff'; viewer: Extract<Viewer, { kind: 'staff' }>; me: FeedCaller }
  | { kind: 'parent'; viewer: Extract<Viewer, { kind: 'parent' }>; parent: { id: string; name: string | null; schoolId: string } };

export function staffViewer(me: FeedCaller): Extract<Viewer, { kind: 'staff' }> {
  const classes = [...new Set([...me.scope.map(e => normClass(e.cls)), me.classTeacherOf].filter(Boolean))];
  return {
    kind: 'staff', id: me.id, name: me.name, schoolId: me.schoolId, role: me.role, classes, classTeacherOf: me.classTeacherOf,
    perms: me.access ? [...me.access.perms] : [], label: me.role === 'teacher' ? 'Teacher' : (me.access?.label || 'School office'),
  };
}

/** Anyone who may ask: a teacher, office staff with at least one role, or a parent. */
export async function askerById(db: SupabaseClient, userId: string): Promise<Asker | null> {
  const { data: row } = await db.from('users').select('id, name, role, school_id').eq('id', userId).maybeSingle();
  if (!row?.school_id) return null;
  if (row.role === 'parent') {
    const { data: links } = await db.from('guardians').select('student_id').eq('parent_id', row.id).eq('verified', true).limit(20);
    return { kind: 'parent', parent: { id: row.id, name: row.name, schoolId: row.school_id }, viewer: { kind: 'parent', id: row.id, name: row.name || 'Parent', schoolId: row.school_id, childIds: (links || []).map(l => l.student_id) } };
  }
  const me = await callerById(db, userId);
  if (!me) return null;
  if (me.role === 'admin' && !me.access?.roles.length && !me.access?.superadmin) return null;
  return { kind: 'staff', me, viewer: staffViewer(me) };
}

/** Signed-in asker for an API route, with the route's rate limit. */
export async function requireAsker(req: NextRequest, limit: RateLimitKey): Promise<{ asker: Asker; db: SupabaseClient } | { res: NextResponse }> {
  const { user, error, blocked } = await verifyApiToken(req.headers.get('authorization'));
  if (blocked) return { res: NextResponse.json({ error, code: blocked }, { status: 403 }) };
  if (!user || error) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!checkRateLimit(`${limit}:${user.id}`, ...limitOf(limit)).allowed) {
    return { res: NextResponse.json({ error: 'That’s a lot of questions in a short time. Wait a few minutes and try again.' }, { status: 429 }) };
  }
  const db = createAdminClient();
  const asker = await askerById(db, user.id);
  if (!asker) return { res: NextResponse.json({ error: 'Ask the School OS is for teachers, school office staff with a role, and parents.' }, { status: 403 }) };
  return { asker, db };
}

export const featureOf = (a: Asker): AiFeature =>
  a.kind === 'parent' ? 'parentAsk' : a.me.role === 'teacher' ? 'teacherAsk' : isLeadership(a.me) ? 'leadershipAsk' : 'officeAsk';

// ── Brief sources ───────────────────────────────────────────────────────────
const SOURCE_STAFF: Record<'teacher' | 'office', Record<string, (d?: string) => SourceDef>> = {
  teacher: {
    class: d => ({ label: 'Mastery Tracker', detail: d || 'your classes', href: '/teacher/mastery', need: `class:${d || ''}` }),
    homework: () => ({ label: 'Homework desk', detail: 'your work, last two weeks', href: '/teacher/homework', need: 'self|perm:academics.read' }),
    attendance: d => ({ label: 'Attendance register', detail: `${d || 'your class'} · today`, href: '/teacher/attendance', need: `class:${d || ''}` }),
    wellness: () => ({ label: 'Student wellness', detail: 'energy check-ins, 7 days', href: '/teacher/wellness', need: 'self' }),
    feed: () => ({ label: 'Situational feed', detail: 'open items', href: '/teacher/feed', need: 'self|perm:feed.read' }),
    messages: () => ({ label: 'Parent messages', detail: 'open conversations', href: '/teacher/messages', need: 'self|perm:messages.office' }),
  },
  office: {
    probe: () => ({ label: 'Probe', detail: 'what the School OS noticed', href: '/admin/probe', need: 'perm:probe.view' }),
    academics: () => ({ label: 'Academic health', detail: 'school mastery', href: '/admin/academic', need: 'perm:academics.read' }),
    staff: () => ({ label: 'Staff & leave', detail: 'teachers, backlog, leave', href: '/admin/staff', need: 'perm:workforce.read' }),
    fees: () => ({ label: 'Fees', detail: 'ledger this session', href: '/admin/fees', need: 'perm:fees.read' }),
    admissions: () => ({ label: 'Admissions', detail: 'pipeline', href: '/admin/admissions', need: 'perm:admissions.read' }),
    wellness: () => ({ label: 'CBSE wellness report', detail: 'anonymised, 14 days', href: '/admin/wellness', need: 'perm:wellness.read' }),
    compliance: () => ({ label: 'DPDP & compliance', detail: 'flags', href: '/admin/compliance', need: 'perm:compliance.read' }),
    feed: () => ({ label: 'Situational feed', detail: 'school-wide', href: '/admin/feed', need: 'perm:feed.read' }),
    incidents: () => ({ label: 'Incidents', detail: 'open', href: '/admin/feed', need: 'perm:incidents.manage' }),
    attendance: () => ({ label: 'Attendance', detail: 'today, all classes', href: '/admin/attendance', need: 'perm:attendance.read' }),
    messages: () => ({ label: 'Parent messages', detail: 'to the office', href: '/admin/messages', need: 'perm:messages.office' }),
  },
};

// ── Prompts ─────────────────────────────────────────────────────────────────
function plannerPrompt(viewer: Viewer, tools: ToolKey[], outline: string) {
  return `You choose which live lookups to run before the School OS answers a question. TODAY: ${istDay()} (IST).
PERSON: ${viewer.kind === 'parent' ? 'a parent (only their own children, tokens like [[C1]])' : viewer.label}.
People are tokens: students [[S1]], staff [[T1]], children [[C1]]. Classes look like 9-B.

ALREADY IN THE SUMMARY (no lookup needed for these):
${outline}

LOOKUPS THIS PERSON MAY USE:
${tools.map(t => `- ${t}(${Object.entries(TOOLS[t].args).map(([k, v]) => `${k}: ${v}`).join('; ')}): ${TOOLS[t].use}`).join('\n')}

Pick 0 to 4 lookups needed to answer the LATEST question with specific evidence (a named student, a class, a period of time, a cause, a comparison). Pick none for greetings, drafting a reply to a listed message, or questions the summary already answers. Prefer the narrowest lookup. Turn relative dates ("since August", "last week") into dates.
Reply with ONE JSON object: {"lookups":[{"tool":"…","args":{"…":"…"}}]}`;
}

const SHARED_RULES = (channelWords: number) => `- CITE: every block of data below ends its heading with a source number like [3]. Put the matching [n] right after each fact or number you use, e.g. "hand-ins fell to 58% [2]". Never cite a number that isn't on a block.
- "table": when comparing 3 or more rows (students, classes, weeks, subjects), add {"title":"…","columns":["…"],"rows":[["…"]],"note":"…"} with at most 12 rows, values copied from the data. Don't repeat the table in "say".
- "chart": when showing change over time or one measure across a few groups, add {"title":"…","unit":"%" or "₹" or "","points":[{"label":"…","value":58,"warn":true}]} with at most 12 points; warn=true marks a concerning value. Leave out table/chart when they add nothing.
- "say" is short markdown, at most ${channelWords} words, bullets welcome, no headings. Lead with the answer, then the why.
- "facts": up to 4 key figures (label, value, tone g good / a watch / r concern / b info / n neutral).
- "suggestions": 2–4 next questions as the person would type them.
- Language: reply in the language and script the person writes in. Keep tokens exactly as they are.
- Never invent numbers, names, dates or policies. If the data doesn't cover it, say so plainly and suggest who would know.`;

function staffSystem(a: Extract<Asker, { kind: 'staff' }>, brief: string, lookups: string) {
  const teacher = a.me.role === 'teacher';
  const pages = Object.keys(STAFF_PAGES[teacher ? 'teacher' : 'leadership']).join('|');
  return `You are the School OS: the school's own assistant, speaking with ${teacher ? `a teacher (${a.me.name}) about their own classes` : `${a.me.name}, ${a.viewer.label}, about the school, only within what their office role covers`}.
You know what the school's records say (the DATA below) and nothing else.

HOW YOU WORK
- Be a sharp chief of staff: what needs action first, then the rest. Explain the why behind a number (missing work vs wrong answers, a timetable change, absences).
- People appear only as tokens: students [[S1]], parents [[P1]], staff [[T1]], conversations [[M1]], feed items [[F1]].
- ASK: if a request is genuinely ambiguous, ask ONE short question with 2–4 options instead of answering.
- ACT: to answer a waiting parent conversation, add {"kind":"reply","thread":"[[M1]]","draft":"…"} (first person, the user's voice, warm, specific, under 90 words). To close a feed item, {"kind":"ack","item":"[[F1]]","note":"…"}. Never say it's done: they confirm first. {"kind":"open","page":"${pages}","label":"…"} when a screen shows the detail.
- Students' wellness journals are private (only energy levels exist). For a safeguarding concern point to the principal; for a mental-health crisis, Tele-MANAS 14416.
- If asked about something outside this person's role (see OUTSIDE THIS PERSON'S OFFICE ROLE), say so and who can see it.
${SHARED_RULES(170)}

Reply with ONE JSON object only:
{"say":"…","ask":[],"facts":[],"table":null,"chart":null,"actions":[],"suggestions":[]}

DATA: SUMMARY
${brief}

DATA: LIVE LOOKUPS FOR THIS QUESTION
${lookups || 'none'}`;
}

function parentSystem(view: FamilyView, brief: string, lookups: string, sourceList: string) {
  const kids = view.children.length;
  return `You are the School OS of ${view.parent.schoolName}: the school's own assistant, speaking with a parent about their ${kids === 1 ? 'child' : 'children'}.
You know what the school's records say (the DATA below) and nothing else about the family.

HOW YOU WORK
- Children appear only as tokens like [[C1]], teachers as [[T1]].${kids > 1 ? ' If a question could be about more than one child and it matters, ask which (options are the child tokens).' : ''}
- Explain the why behind a number in plain words. Mastery (TML): 90+ exemplary, 75–89 proficient, 50–74 developing, 35–49 a gap the tutor works on, under 35 needs support now. "Provisional" means too little evidence to be sure.
- Help at home: concrete, 10–15 minutes, doable by a parent who may not know the subject. No tuition sales, no blame.
- COMMUNICATE: when the parent wants to tell or ask the school something, or talking to a teacher is the next step, add {"kind":"message","to":"[[T1]] or office","child":"[[C1]]","topic":"general|academics|homework|wellbeing|fees|meeting|leave","subject":"…","draft":"…"} in the parent's voice (first person, polite, under 90 words). Never say it has been sent. {"kind":"open","page":"progress|schoolwork|fees|messages|settings","label":"…"} when a page shows the detail.
- Wellbeing: gentle, never diagnose; journals are private to the child. For bullying, self-harm, abuse or a crisis: urge speaking to the class teacher or counsellor today, add a message action to the class teacher (topic wellbeing), and give Tele-MANAS 14416.
- Privacy: you only know this family's children. Never discuss other students.
- SUMMARY SOURCES (cite these numbers for facts from the summary): ${sourceList}
${SHARED_RULES(150)}

Reply with ONE JSON object only:
{"say":"…","ask":[],"facts":[],"table":null,"chart":null,"actions":[],"suggestions":[]}

DATA: SUMMARY
${brief}

DATA: LIVE LOOKUPS FOR THIS QUESTION
${lookups || 'none'}`;
}

const json = (t: string) => {
  const raw = (t || '{}').replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; }
};
const outlineOf = (brief: string) => brief.split('\n').filter(l => /^[A-Z][A-Z ()0-9,'’–\-.&/]{3,}/.test(l)).map(l => `- ${l.slice(0, 90)}`).slice(0, 30).join('\n');

export interface Turn { role: 'me' | 'os'; text: string }
export interface AskOutcome { reply: AskReply; needs: string[] }

async function plan(asker: Asker, outline: string, contents: { role: 'user' | 'model'; parts: { text: string }[] }[]) {
  const tools = toolsFor(asker.viewer);
  try {
    const res = await generateAi({
      model: AI_MODELS.fast, contents: contents.slice(-6),
      config: { systemInstruction: plannerPrompt(asker.viewer, tools, outline), responseMimeType: 'application/json', temperature: 0 },
    }, { feature: 'askPlan', userId: asker.viewer.id, schoolId: asker.viewer.schoolId });
    return parsePlan(json(res.text), tools);
  } catch (e) {
    // No plan is not fatal: the answer still comes from the summary.
    console.warn('[ask] plan', e instanceof Error ? e.message : e);
    return [];
  }
}

/** One question. `history` is the conversation so far, oldest first, ending with the new question. */
export async function askOS(db: SupabaseClient, asker: Asker, history: Turn[]): Promise<AskOutcome> {
  if (!aiConfigured()) throw new AskError('The School OS isn’t configured on this server yet (no AI key).', 503);
  return asker.kind === 'staff' ? askStaff(db, asker, history) : askParent(db, asker, history);
}

async function askStaff(db: SupabaseClient, a: Extract<Asker, { kind: 'staff' }>, history: Turn[]): Promise<AskOutcome> {
  const teacher = a.me.role === 'teacher';
  const book: Book = emptyBook();
  const sources = new Sources();
  const keep: { teacher?: TeacherDesk; admin?: AdminDesk } = {};
  const defs = SOURCE_STAFF[teacher ? 'teacher' : 'office'];
  const src = (key: string, detail?: string) => (defs[key] ? ` [${sources.add(defs[key](detail))}]` : '');
  const brief = teacher ? await teacherBrief(db, a.me, book, { src, keep }) : await leadershipBrief(db, a.me, book, { src, keep });
  // Everyone this person can look up becomes a token, so a name in the question reaches the planner as [[S12]].
  if (keep.teacher) for (const c of keep.teacher.classes) for (const s of c.students) personToken(book, 'S', s.id, s.name);
  if (keep.admin) {
    for (const s of keep.admin.students) personToken(book, 'S', s.id, s.name);
    for (const t of keep.admin.workforce.teachers) personToken(book, 'T', t.id, t.name);
  }
  const contents = history.slice(-12).map(m => ({ role: m.role === 'os' ? 'model' as const : 'user' as const, parts: [{ text: tokenizeStaff(m.text, book) }] }));
  const planned = await plan(a, outlineOf(brief), contents);
  const ctx: StaffCtx = { db, me: a.me, viewer: a.viewer, book, sources, teacher: keep.teacher, admin: keep.admin };
  const looked = planned.length ? await runStaffLookups(ctx, planned) : { text: '', labels: [] };
  const res = await generateAi({
    model: AI_MODELS.standard, contents,
    config: { systemInstruction: staffSystem(a, brief, tokenizeStaff(looked.text, book)), responseMimeType: 'application/json', temperature: 0.3 },
  }, { feature: featureOf(a), userId: a.me.id, schoolId: a.me.schoolId });
  const actionBook = emptyActionBook(STAFF_PAGES[teacher ? 'teacher' : 'leadership']);
  for (const [k, v] of book.threads) actionBook.threads.set(k, v);
  for (const [k, v] of book.items) actionBook.items.set(k, v);
  const { reply, needs } = parseAnswer(json(res.text), sources, actionBook, looked.labels);
  const out = restoreStaff(reply, book);
  if (!out.say && !out.ask.length) throw new AskError('The School OS didn’t come back with a usable answer. Try again, or put it another way.', 502);
  return { reply: out, needs };
}

async function askParent(db: SupabaseClient, a: Extract<Asker, { kind: 'parent' }>, history: Turn[]): Promise<AskOutcome> {
  const view = await loadFamily(db, a.parent);
  if (!view.children.length) {
    return {
      needs: ['self'],
      reply: {
        say: 'Your account isn’t linked to a child yet. The school office links parents to students after checking; once that’s done I can answer anything about schoolwork, progress, attendance and fees.',
        ask: [], facts: [], table: null, chart: null, sources: [], suggestions: [], lookups: [],
        actions: [{ kind: 'message', audience: 'office', to: null, toName: 'School office', childId: null, topic: 'general', subject: 'Please link my child to my account', draft: 'Hello, could you please link my child to my parent account on Sthara? Thank you.' }],
      },
    };
  }
  const book = nameBook(view);
  const viewer = { ...a.viewer, childIds: view.children.map(c => c.id) };
  const sources = new Sources();
  const summary = [
    sources.add({ label: 'Progress', detail: 'mastery by subject and chapter', href: '/parent/progress', need: 'self' }),
    sources.add({ label: 'Schoolwork', detail: 'homework and marks', href: '/parent/schoolwork', need: 'self' }),
    sources.add({ label: 'Fees', detail: 'invoices and payments', href: '/parent/fees', need: 'self' }),
    sources.add({ label: 'Messages', detail: 'conversations with the school', href: '/parent/messages', need: 'self' }),
    sources.add({ label: 'Wellbeing', detail: 'check-ins (energy only)', href: '/parent/wellness', need: 'self' }),
    sources.add({ label: 'Timeline', detail: 'year by year', href: '/parent/timeline', need: 'self' }),
  ];
  const sourceList = `[${summary[0]}] mastery and subjects, [${summary[1]}] work and marks, [${summary[2]}] fees, [${summary[3]}] conversations, [${summary[4]}] wellbeing, [${summary[5]}] year by year`;
  const brief = buildBrief(view, probeFamily(view), book, await histories(db, a.parent, view));
  const contents = history.slice(-12).map(m => ({ role: m.role === 'os' ? 'model' as const : 'user' as const, parts: [{ text: tokenizeParent(m.text, book) }] }));
  const asker: Asker = { ...a, viewer };
  const planned = await plan(asker, outlineOf(brief), contents);
  const tokenOfChild = (id: string) => `[[${[...book.children].find(([, c]) => c.id === id)?.[0] ?? 'C1'}]]`;
  const looked = planned.length
    ? await runParentLookups({ db, viewer, view, sources, tokenOfChild, childOf: t => book.children.get(t)?.id ?? null }, planned)
    : { text: '', labels: [] };
  const res = await generateAi({
    model: AI_MODELS.standard, contents,
    config: { systemInstruction: parentSystem(view, brief, looked.text, sourceList), responseMimeType: 'application/json', temperature: 0.4 },
  }, { feature: 'parentAsk', userId: a.parent.id, schoolId: a.parent.schoolId, studentId: view.children.length === 1 ? view.children[0].id : null });
  const actionBook = emptyActionBook(Object.fromEntries(Object.entries(PARENT_PAGES).map(([k, href]) => [k, { href, label: k[0].toUpperCase() + k.slice(1) }])));
  for (const [k, v] of book.children) actionBook.children.set(k, { id: v.id, name: v.name });
  for (const [k, v] of book.staff) actionBook.staff.set(k, v);
  const { reply, needs } = parseAnswer(json(res.text), sources, actionBook, looked.labels);
  const out = restoreParent(reply, book);
  if (!out.say && !out.ask.length) throw new AskError('The School OS didn’t come back with a usable answer. Try again, or put it another way.', 502);
  return { reply: out, needs: needs.length ? needs : ['self'] };
}
