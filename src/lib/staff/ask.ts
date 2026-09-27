/**
 * "Ask the School OS" for teachers and school leadership: the protocol shared by
 * the API route, WhatsApp and the UI. Pure.
 *
 * Every model reply is one JSON object:
 *   say          short answer (markdown on the web, plain on WhatsApp)
 *   ask          at most 1 clarifying question with tappable options
 *   facts        up to 4 figures from the brief that back the answer
 *   actions      reply to a parent, acknowledge a feed item (both confirmed first), or open a page
 *   suggestions  2–4 follow-ups, written as the user would type them
 *
 * Privacy: people are tokens on the way to the model — students [[S1]], parents
 * [[P1]], staff [[T1]] — and conversations [[M1]], feed items [[F1]] refer to rows
 * the brief listed. Nothing else about a person leaves Sthara's servers.
 */

export type StaffRole = 'teacher' | 'leadership';

export const PAGES: Record<StaffRole, Record<string, { href: string; label: string }>> = {
  teacher: {
    feed: { href: '/teacher/feed', label: 'Situational feed' },
    attendance: { href: '/teacher/attendance', label: 'Attendance' },
    homework: { href: '/teacher/homework', label: 'Homework' },
    messages: { href: '/teacher/messages', label: 'Parent messages' },
    mastery: { href: '/teacher/mastery', label: 'Mastery tracker' },
    heatmap: { href: '/teacher/heatmap', label: 'Class heat map' },
    wellness: { href: '/teacher/wellness', label: 'Student wellness' },
    syllabus: { href: '/teacher/syllabus', label: 'Syllabus' },
  },
  leadership: {
    feed: { href: '/admin/feed', label: 'Situational feed' },
    probe: { href: '/admin/probe', label: 'Probe' },
    fees: { href: '/admin/fees', label: 'Fees' },
    admissions: { href: '/admin/admissions', label: 'Admissions' },
    staff: { href: '/admin/staff', label: 'Staff & leave' },
    academic: { href: '/admin/academic', label: 'Academic health' },
    wellness: { href: '/admin/wellness', label: 'CBSE wellness report' },
    messages: { href: '/admin/messages', label: 'Parent messages' },
    compliance: { href: '/admin/compliance', label: 'DPDP & compliance' },
  },
};

export interface AskQuestion { id: string; question: string; options: string[] }
export interface AskFact { label: string; value: string; tone: 'g' | 'a' | 'r' | 'b' | 'n' }
export type StaffAction =
  | { kind: 'open'; page: string; href: string; label: string }
  | { kind: 'reply'; threadId: string; toName: string; subject: string; draft: string }
  | { kind: 'ack'; situationId: string; title: string; note: string };
export interface StaffReply { say: string; ask: AskQuestion[]; facts: AskFact[]; actions: StaffAction[]; suggestions: string[] }
export interface StaffTurn { role: 'me' | 'os'; text: string; reply?: StaffReply; at: number }

// ── Tokens ─────────────────────────────────────────────────────────────────
export interface Book {
  /** S1/P1/T1 -> person; M1 -> conversation; F1 -> feed item. */
  people: Map<string, { id: string; name: string }>;
  threads: Map<string, { id: string; label: string; subject: string }>;
  items: Map<string, { id: string; title: string }>;
}
export const emptyBook = (): Book => ({ people: new Map(), threads: new Map(), items: new Map() });

/** Adds a person (once) and returns their token. */
export function personToken(book: Book, prefix: 'S' | 'P' | 'T', id: string, name: string): string {
  for (const [t, p] of book.people) if (p.id === id && t.startsWith(prefix)) return `[[${t}]]`;
  const n = [...book.people.keys()].filter(k => k.startsWith(prefix)).length + 1;
  const t = `${prefix}${n}`;
  book.people.set(t, { id, name: name || 'Unknown' });
  return `[[${t}]]`;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replaces every known name with its token, longest first. A first name is
 * replaced too when only one person in the book has it.
 */
export function tokenize(text: string, book: Book): string {
  const firsts = new Map<string, string[]>();
  for (const [t, p] of book.people) {
    const f = p.name.trim().split(/\s+/)[0];
    if (f && f !== p.name.trim()) firsts.set(f, [...(firsts.get(f) || []), t]);
  }
  const pairs: [string, string][] = [];
  for (const [t, p] of book.people) pairs.push([p.name.trim(), t]);
  for (const [f, ts] of firsts) if (ts.length === 1 && ![...book.people.values()].some(p => p.name.trim() === f)) pairs.push([f, ts[0]]);
  pairs.sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [name, t] of pairs) {
    if (name.length < 2) continue;
    out = out.replace(new RegExp(`(?<![\\w\\[])${esc(name)}(?![\\w\\]])`, 'g'), `[[${t}]]`);
  }
  return out;
}

export function restore<T>(value: T, book: Book): T {
  const fix = (x: string) => x.replace(/\[\[([SPTMF]\d{1,4})\]\]/g, (m, t: string) => {
    if (t[0] === 'M') return book.threads.get(t)?.label ?? m;
    if (t[0] === 'F') return book.items.get(t)?.title ?? m;
    return book.people.get(t)?.name ?? m;
  });
  const walk = (v: any): any => (typeof v === 'string' ? fix(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  return walk(value);
}

// ── Sanitising the model's JSON ───────────────────────────────────────────
const s = (v: unknown, n = 4000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const list = (v: unknown, n = 4, len = 160) => (Array.isArray(v) ? v.map(x => s(x, len)).filter(Boolean).slice(0, n) : []);
const tok = (v: unknown) => s(v, 20).replace(/^\[\[|\]\]$/g, '');

/** Raw model JSON -> reply. Reply and ack targets must be rows the brief listed; anything else is dropped. */
export function parseStaffReply(raw: unknown, book: Book, role: StaffRole): StaffReply {
  const r = (raw ?? {}) as any;
  const ask = (Array.isArray(r.ask) ? r.ask : []).slice(0, 1).map((q: any, i: number) => ({
    id: s(q?.id, 30) || `q${i + 1}`, question: s(q?.question, 240), options: list(q?.options, 5, 100),
  })).filter((q: AskQuestion) => q.question && q.options.length >= 2);
  const facts = (Array.isArray(r.facts) ? r.facts : []).slice(0, 4).map((f: any) => ({
    label: s(f?.label, 70), value: s(f?.value, 40), tone: ['g', 'a', 'r', 'b', 'n'].includes(f?.tone) ? f.tone : 'n',
  })).filter((f: AskFact) => f.label && f.value);
  const actions: StaffAction[] = [];
  for (const a of Array.isArray(r.actions) ? r.actions.slice(0, 5) : []) {
    if (a?.kind === 'open' && typeof a.page === 'string' && PAGES[role][a.page]) {
      if (actions.filter(x => x.kind === 'open').length >= 2) continue;
      actions.push({ kind: 'open', page: a.page, href: PAGES[role][a.page].href, label: s(a.label, 40) || PAGES[role][a.page].label });
    } else if (a?.kind === 'reply') {
      const th = book.threads.get(tok(a.thread));
      const draft = s(a.draft, 1500);
      if (th && draft && !actions.some(x => x.kind === 'reply')) actions.push({ kind: 'reply', threadId: th.id, toName: th.label, subject: th.subject, draft });
    } else if (a?.kind === 'ack') {
      const it = book.items.get(tok(a.item));
      if (it && !actions.some(x => x.kind === 'ack' && x.situationId === it.id)) actions.push({ kind: 'ack', situationId: it.id, title: it.title, note: s(a.note, 300) });
    }
  }
  return { say: s(r.say, 5000), ask, facts, actions, suggestions: list(r.suggestions, 4, 120) };
}

/** WhatsApp version: numbered options, and the confirm word for a drafted action. */
export function toWhatsAppText(reply: StaffReply): { text: string; options: string[] } {
  const strip = (md: string) => md
    .replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
  const parts = [strip(reply.say)];
  if (reply.facts.length) parts.push(reply.facts.map(f => `${f.label}: *${f.value}*`).join('\n'));
  const options = reply.ask.length ? reply.ask[0].options : reply.suggestions;
  if (reply.ask.length) parts.push(`*${reply.ask[0].question}*`);
  const rep = reply.actions.find(a => a.kind === 'reply');
  const ack = reply.actions.find(a => a.kind === 'ack');
  if (rep && rep.kind === 'reply') parts.push(`I can send this reply to ${rep.toName}:\n"${rep.draft}"\nReply *SEND* to send it, or tell me what to change.`);
  else if (ack && ack.kind === 'ack') parts.push(`Reply *ACK* to acknowledge "${ack.title}"${ack.note ? ` with the note "${ack.note}"` : ''}.`);
  if (options.length) parts.push(`${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n_Reply with a number._`);
  return { text: parts.filter(Boolean).join('\n\n').slice(0, 3900), options };
}
