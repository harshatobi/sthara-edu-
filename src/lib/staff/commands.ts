/**
 * Staff WhatsApp commands. Pure (parsed text in, intent out) so it is unit tested.
 *
 *   STOP / START / HELP        pause, resume, what can I do
 *   TODAY (or DIGEST)          the day at a glance
 *   ACK [note]                 acknowledge the item we just alerted you about
 *   SEND                       send the reply the School OS just drafted
 *   R <text> / REPLY <text>    reply to the last parent message we forwarded
 *   ABSENT 4, 12 LATE 7        mark today's register by roll number, everyone else present
 *   ALL PRESENT                mark everyone present
 *   1 … 9                      pick a numbered option from the last message
 *   anything else              a question for the School OS
 */
export type StaffCommand =
  | { kind: 'stop' } | { kind: 'start' } | { kind: 'help' } | { kind: 'today' } | { kind: 'send' }
  | { kind: 'ack'; note: string }
  | { kind: 'reply'; text: string }
  | { kind: 'register'; absent: string[]; late: string[]; excused: string[] }
  | { kind: 'option'; n: number }
  | { kind: 'ask'; text: string };

const WORD: Record<string, 'absent' | 'late' | 'excused'> = {
  absent: 'absent', absentees: 'absent', abs: 'absent', a: 'absent',
  late: 'late', l: 'late',
  excused: 'excused', leave: 'excused', e: 'excused',
};

export function parseStaffCommand(raw: string): StaffCommand {
  const text = raw.trim();
  const upper = text.toUpperCase().replace(/[^A-Z]/g, '');
  if (['STOP', 'UNSUBSCRIBE', 'STOPALL'].includes(upper)) return { kind: 'stop' };
  if (upper === 'START') return { kind: 'start' };
  if (upper === 'HELP' || !text) return { kind: 'help' };
  if (['TODAY', 'DIGEST', 'MYDAY'].includes(upper)) return { kind: 'today' };
  if (upper === 'SEND') return { kind: 'send' };
  const ack = /^\s*(ack|acknowledge|acknowledged|done)\b[\s:,.-]*(.*)$/is.exec(text);
  if (ack) return { kind: 'ack', note: ack[2].trim().slice(0, 500) };
  const reply = /^\s*(r|reply)\s*[:\-]?\s+(.+)$/is.exec(text);
  if (reply) return { kind: 'reply', text: reply[2].trim() };
  if (/^\s*(all|everyone|everybody)\s+(present|here|in)\s*[.!]?\s*$/i.test(text) || /^\s*present\s+all\s*$/i.test(text)) {
    return { kind: 'register', absent: [], late: [], excused: [] };
  }
  const n = /^\s*(\d)\s*[.)]?\s*$/.exec(text);
  if (n) return { kind: 'option', n: Number(n[1]) };

  // A register: starts with a status word, then only references (roll numbers or single names)
  // and further status words. A question mark or ordinary sentence falls through to Ask.
  if (!text.includes('?')) {
    const parts = text.split(/[\s,;]+/).filter(Boolean);
    const first = WORD[parts[0]?.toLowerCase()];
    if (first && parts.length > 1) {
      const out = { absent: [] as string[], late: [] as string[], excused: [] as string[] };
      let cur: 'absent' | 'late' | 'excused' = first;
      let ok = true;
      for (const p of parts.slice(1)) {
        const w = WORD[p.toLowerCase()];
        if (w && !/^\d/.test(p)) { cur = w; continue; }
        if (!/^[\p{L}\p{N}][\p{L}\p{N}\-/]{0,15}$/u.test(p)) { ok = false; break; }
        out[cur].push(p);
      }
      const refs = out.absent.length + out.late.length + out.excused.length;
      // "absent today" / "late submissions for 10A" are questions, not registers: every
      // reference must be a roll number (contain a digit).
      if (ok && refs && out.absent.concat(out.late, out.excused).every(r => /\d/.test(r))) return { kind: 'register', ...out };
    }
  }
  return { kind: 'ask', text };
}

export interface RegisterStudent { id: string; name: string; rollNo: string }

/**
 * Matches references to students: an exact roll number first, then the position
 * in the register (1 = first), then a unique first name. Unmatched refs are returned
 * so nothing is saved on a typo.
 */
export function resolveRegister(roster: RegisterStudent[], cmd: { absent: string[]; late: string[]; excused: string[] }) {
  const find = (ref: string): RegisterStudent | null => {
    const r = ref.toLowerCase();
    const byRoll = roster.filter(s => s.rollNo && s.rollNo.toLowerCase() === r);
    if (byRoll.length === 1) return byRoll[0];
    if (/^\d{1,3}$/.test(r)) {
      const tail = (x: string) => (/(\d+)\D*$/.exec(x)?.[1] ?? '').replace(/^0+(?=\d)/, '');
      const byNum = roster.filter(s => s.rollNo && tail(s.rollNo) === tail(r));
      if (byNum.length === 1) return byNum[0];
      const i = Number(r) - 1;
      if (!roster.some(s => s.rollNo) && i >= 0 && i < roster.length) return roster[i];
    }
    const byName = roster.filter(s => s.name.split(/\s+/)[0].toLowerCase() === r);
    return byName.length === 1 ? byName[0] : null;
  };
  const status = new Map<string, 'absent' | 'late' | 'excused'>();
  const unknown: string[] = [];
  for (const k of ['absent', 'late', 'excused'] as const) {
    for (const ref of cmd[k]) {
      const s = find(ref);
      if (s) status.set(s.id, k); else unknown.push(ref);
    }
  }
  const marks = roster.map(s => ({ studentId: s.id, status: status.get(s.id) ?? 'present' }));
  return { marks, unknown, named: roster.filter(s => status.has(s.id)).map(s => ({ ...s, status: status.get(s.id)! })) };
}
