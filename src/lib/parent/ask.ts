/**
 * "Ask the School OS" protocol, shared by the API route, WhatsApp and the UI. Pure.
 *
 * Every model reply is one JSON object:
 *   say          short answer (markdown on the web, plain on WhatsApp)
 *   ask          at most 2 clarifying questions with tappable options
 *   facts        up to 4 numbers from the brief that back the answer
 *   actions      write to a teacher / the office (a draft the parent confirms), or open a page
 *   suggestions  2–4 follow-ups, written as the parent would type them
 */

export interface AskQuestion { id: string; question: string; options: string[] }
export interface AskFact { label: string; value: string; tone: 'g' | 'a' | 'r' | 'b' | 'n' }

export type ParentPage = 'progress' | 'schoolwork' | 'fees' | 'messages' | 'settings';

export type AskAction =
  | { kind: 'message'; audience: 'teacher' | 'office'; to: string | null; toName: string; childId: string | null; topic: string; subject: string; draft: string }
  | { kind: 'open'; page: ParentPage; label: string };

export interface AskReply { say: string; ask: AskQuestion[]; facts: AskFact[]; actions: AskAction[]; suggestions: string[] }

export interface AskTurn { role: 'parent' | 'os'; text: string; reply?: AskReply; at: number }

export const TOPICS = ['general', 'academics', 'homework', 'wellbeing', 'fees', 'meeting', 'leave'] as const;
export type Topic = (typeof TOPICS)[number];
export const TOPIC_LABEL: Record<Topic, string> = {
  general: 'General', academics: 'Academics', homework: 'Homework', wellbeing: 'Wellbeing', fees: 'Fees', meeting: 'Meeting request', leave: 'Leave / absence',
};
export const PAGES: Record<ParentPage, string> = {
  progress: '/parent/progress', schoolwork: '/parent/schoolwork', fees: '/parent/fees', messages: '/parent/messages', settings: '/parent/settings',
};

// ── Privacy: names are tokens on the way to the model ──────────────────────
export interface NameBook {
  /** C1 -> child id / name, T1 -> staff id / name. */
  children: Map<string, { id: string; name: string; first: string }>;
  staff: Map<string, { id: string; name: string }>;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replaces every known name (longest first) with its [[token]]. */
export function tokenize(text: string, book: NameBook): string {
  const pairs: [string, string][] = [];
  for (const [t, c] of book.children) { pairs.push([c.name, t]); if (c.first && c.first !== c.name) pairs.push([c.first, t]); }
  for (const [t, s] of book.staff) pairs.push([s.name, t]);
  pairs.sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [name, t] of pairs) {
    if (name.trim().length < 2) continue;
    out = out.replace(new RegExp(`\\b${esc(name)}\\b`, 'g'), `[[${t}]]`);
  }
  return out;
}

export function restore<T>(value: T, book: NameBook, firstNames = true): T {
  const fix = (x: string) => x.replace(/\[\[([CT]\d{1,2})\]\]/g, (m, t) =>
    t.startsWith('C') ? (book.children.get(t) ? (firstNames ? book.children.get(t)!.first : book.children.get(t)!.name) : m) : book.staff.get(t)?.name ?? m);
  const walk = (v: any): any => (typeof v === 'string' ? fix(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  return walk(value);
}

// ── Sanitising what the model returns ──────────────────────────────────────
const s = (v: unknown, n = 4000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const list = (v: unknown, n = 4, len = 160) => (Array.isArray(v) ? v.map(x => s(x, len)).filter(Boolean).slice(0, n) : []);

/**
 * Turns the raw model JSON into a reply, resolving [[T1]]/[[C1]] targets of a
 * message action to real ids. Tokens in text are restored separately.
 */
export function parseAskReply(raw: unknown, book: NameBook): AskReply {
  const r = (raw ?? {}) as any;
  const ask = (Array.isArray(r.ask) ? r.ask : []).slice(0, 2).map((q: any, i: number) => ({
    id: s(q?.id, 30) || `q${i + 1}`, question: s(q?.question, 240), options: list(q?.options, 5, 100),
  })).filter((q: AskQuestion) => q.question && q.options.length >= 2);
  const facts = (Array.isArray(r.facts) ? r.facts : []).slice(0, 4).map((f: any) => ({
    label: s(f?.label, 70), value: s(f?.value, 40), tone: ['g', 'a', 'r', 'b', 'n'].includes(f?.tone) ? f.tone : 'n',
  })).filter((f: AskFact) => f.label && f.value);
  const tok = (v: unknown) => s(v, 20).replace(/^\[\[|\]\]$/g, '');
  const actions: AskAction[] = [];
  for (const a of Array.isArray(r.actions) ? r.actions.slice(0, 5) : []) {
    if (a?.kind === 'message') {
      const office = a.to === 'office' || a.audience === 'office';
      const staff = office ? null : book.staff.get(tok(a.to));
      if (!office && !staff) continue;
      const child = book.children.get(tok(a.child));
      const topic = (TOPICS as readonly string[]).includes(a.topic) ? a.topic : 'general';
      const draft = s(a.draft, 1500);
      if (!draft) continue;
      actions.push({
        kind: 'message', audience: office ? 'office' : 'teacher', to: staff?.id ?? null, toName: staff ? `[[${tok(a.to)}]]` : 'School office',
        childId: child?.id ?? (book.children.size === 1 ? [...book.children.values()][0].id : null),
        topic, subject: s(a.subject, 120) || TOPIC_LABEL[topic as Topic], draft,
      });
    } else if (a?.kind === 'open' && a.page in PAGES) {
      actions.push({ kind: 'open', page: a.page, label: s(a.label, 40) || 'Open' });
    }
  }
  let opens = 0;
  const kept = actions.filter(x => x.kind !== 'open' || ++opens <= 2);
  return { say: s(r.say, 5000), ask, facts, actions: kept, suggestions: list(r.suggestions, 4, 120) };
}

/** WhatsApp has no buttons for free-form replies: numbered options instead. */
export function toWhatsAppText(reply: AskReply): { text: string; options: string[] } {
  const strip = (md: string) => md
    .replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
  const parts = [strip(reply.say)];
  if (reply.facts.length) parts.push(reply.facts.map(f => `${f.label}: *${f.value}*`).join('\n'));
  const options = reply.ask.length ? reply.ask[0].options : reply.suggestions;
  if (reply.ask.length) parts.push(`*${reply.ask[0].question}*`);
  const msg = reply.actions.find(a => a.kind === 'message');
  if (msg && msg.kind === 'message') parts.push(`I can send this to ${msg.toName}:\n"${msg.draft}"\nReply *SEND* to send it, or tell me what to change.`);
  if (options.length) parts.push(`${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n_Reply with a number._`);
  return { text: parts.filter(Boolean).join('\n\n').slice(0, 3900), options };
}
