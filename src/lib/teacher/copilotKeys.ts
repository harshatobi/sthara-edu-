/**
 * Keys that say "this is the same Copilot request again", so what was made once is served from the saved copy
 * instead of being written again (2026-11-14). Pure, so it is unit-tested; the hash is done by the caller.
 *
 * Two requests match when, after normalising (case, spacing, punctuation, the order of selected students), they ask
 * the same thing of the same class and subject: same chapter, same Studio settings, same conversation so far.
 */

/** Lower case, punctuation and repeated spaces dropped: "Make a Worksheet!" and "make a worksheet" match. */
export function normText(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[‘’“”"'`.,!?;:()[\]{}…\-–—]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** "Class 9-B" and "9b" are one class. */
export const normCls = (c: string) => c.toLowerCase().replace(/class|[^a-z0-9]/g, '');

export interface ReplyKeyInput {
  cls: string;
  subject: string;
  chapter?: string | null;
  studio?: { kind?: string; count?: number; difficulty?: string; durationMin?: number; targets?: string[]; design?: string } | null;
  messages: { role: string; text: string }[];
}

/** The canonical text of a chat request (hash it for the key). */
export function replyKeySource(i: ReplyKeyInput): string {
  const st = i.studio && i.studio.kind ? {
    kind: i.studio.kind, count: i.studio.count ?? null, difficulty: i.studio.difficulty ? normText(i.studio.difficulty) : null,
    durationMin: i.studio.durationMin ?? null, targets: [...(i.studio.targets ?? [])].sort(), design: i.studio.design ?? null,
  } : null;
  return JSON.stringify({
    v: 1, cls: normCls(i.cls), subject: normText(i.subject), chapter: i.chapter ? normText(i.chapter) : null, studio: st,
    messages: i.messages.map(m => [m.role === 'copilot' || m.role === 'model' ? 'c' : 't', normText(m.text)]),
  });
}

/** A board paper: one per design for a class level and subject, shared across the school's teachers. */
export const paperKeySource = (designKey: string, cls: string, subject: string) =>
  JSON.stringify({ v: 1, paper: designKey, grade: normCls(cls).replace(/[a-z]+$/, ''), subject: normText(subject) });

/** A picture: the same description for the same class level and subject. */
export const imageKeySource = (prompt: string, cls: string, subject: string) =>
  JSON.stringify({ v: 1, image: normText(prompt), grade: normCls(cls).replace(/[a-z]+$/, ''), subject: normText(subject) });

/** How long a saved chat answer stands in for a new one (class data moves on; papers and pictures don't age). */
export const REPLY_REUSE_DAYS = 30;
