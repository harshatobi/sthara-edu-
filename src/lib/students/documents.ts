import { GRADES, gradeLabel } from './register';

/**
 * Documents in (brief 04): the kinds a school keeps on a student's record, who may see each kind, the admission
 * checklist (Sthara's default, which the school admin changes per grade), and the checks on what is uploaded.
 * Pure, so the admin screens, the parent portal, the importer and the tests share one set of rules.
 */

export type DocGroup = 'identity' | 'academic' | 'category' | 'medical' | 'other';
export const DOC_GROUP_LABEL: Record<DocGroup, string> = {
  identity: 'Identity and address', academic: 'Earlier schooling', category: 'Category and income', medical: 'Medical and disability', other: 'Forms and other',
};

export const DOC_KINDS = {
  birth_certificate: { label: 'Birth certificate', group: 'identity' },
  aadhaar_card: { label: 'Aadhaar card', group: 'identity' },
  address_proof: { label: 'Address proof', group: 'identity' },
  parent_id: { label: 'Parent ID proof', group: 'identity' },
  passport: { label: 'Passport or OCI card', group: 'identity' },
  transfer_certificate: { label: 'Transfer certificate', group: 'academic' },
  report_card: { label: 'Previous report card', group: 'academic' },
  migration_certificate: { label: 'Migration certificate', group: 'academic' },
  board_marksheet: { label: 'Board marksheet', group: 'academic' },
  caste_certificate: { label: 'Caste certificate', group: 'category' },
  income_certificate: { label: 'Income certificate', group: 'category' },
  ews_certificate: { label: 'EWS certificate', group: 'category' },
  ration_card: { label: 'Ration card (BPL or AAY)', group: 'category' },
  medical_certificate: { label: 'Medical certificate', group: 'medical' },
  disability_certificate: { label: 'Disability certificate (UDID)', group: 'medical' },
  vaccination_record: { label: 'Vaccination record', group: 'medical' },
  signed_form: { label: 'Signed form', group: 'other' },
  other: { label: 'Other document', group: 'other' },
} as const satisfies Record<string, { label: string; group: DocGroup }>;
export type DocKind = keyof typeof DOC_KINDS;
export const DOC_KIND_KEYS = Object.keys(DOC_KINDS) as DocKind[];
export const isDocKind = (k: unknown): k is DocKind => typeof k === 'string' && k in DOC_KINDS;
export const docLabel = (k: string) => (isDocKind(k) ? DOC_KINDS[k].label : k);

/** Medical and disability documents: the health officer, principal and school admin only (health.read). */
export const isMedical = (k: string) => isDocKind(k) && DOC_KINDS[k].group === 'medical';

/** What the viewer may see: register readers everything but medical, health.read the medical kinds. */
export function canSeeKind(kind: string, can: { students: boolean; health: boolean }) {
  return isMedical(kind) ? can.health : can.students;
}
/** Who may upload, verify, reject or remove: the registrar (students.manage); medical kinds also the health officer. */
export function canManageKind(kind: string, can: { students: boolean; health: boolean }) {
  return can.students || (isMedical(kind) && can.health);
}

// ── The admission checklist ─────────────────────────────────────────────────

/** One required kind, from a grade up to a grade (inclusive). */
export interface ChecklistItem { kind: DocKind; from: number; to: number }

/** Sthara's default: what most schools ask for at admission. The transfer certificate from Class 2 on. */
export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { kind: 'birth_certificate', from: -2, to: 12 },
  { kind: 'aadhaar_card', from: -2, to: 12 },
  { kind: 'transfer_certificate', from: 2, to: 12 },
  { kind: 'report_card', from: 1, to: 12 },
  { kind: 'address_proof', from: -2, to: 12 },
  { kind: 'parent_id', from: -2, to: 12 },
];

/** The school's checklist from its settings, or the default; anything malformed is dropped, never guessed. */
export function checklistOf(settings: unknown): ChecklistItem[] {
  const raw = (settings as { documents?: { checklist?: unknown } } | null)?.documents?.checklist;
  if (!Array.isArray(raw)) return DEFAULT_CHECKLIST;
  return raw.flatMap(x => {
    const r = checkItem(x);
    return 'error' in r ? [] : [r.value];
  });
}

function checkItem(x: unknown): { value: ChecklistItem } | { error: string } {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  if (!isDocKind(o.kind)) return { error: 'Pick a kind of document.' };
  const from = Number(o.from), to = Number(o.to);
  if (!GRADES.includes(from) || !GRADES.includes(to)) return { error: `${docLabel(o.kind)}: pick the classes it is needed for.` };
  if (from > to) return { error: `${docLabel(o.kind)}: the first class comes after the last.` };
  return { value: { kind: o.kind, from, to } };
}

/** A checklist the school admin saves: each kind once, with its classes. */
export function checkChecklist(list: unknown): { value: ChecklistItem[] } | { error: string } {
  if (!Array.isArray(list) || list.length > DOC_KIND_KEYS.length) return { error: 'Pick the documents the school asks for.' };
  const out: ChecklistItem[] = [];
  for (const x of list) {
    const r = checkItem(x);
    if ('error' in r) return r;
    if (out.some(o => o.kind === r.value.kind)) return { error: `${docLabel(r.value.kind)} is in the list twice.` };
    out.push(r.value);
  }
  return { value: out };
}

export const checklistRange = (i: ChecklistItem) =>
  i.from === GRADES[0] && i.to === GRADES[GRADES.length - 1] ? 'Every class' : i.from === i.to ? gradeLabel(i.from) : `${gradeLabel(i.from)} to ${gradeLabel(i.to)}`;

export type DocStatus = 'awaiting' | 'verified' | 'rejected';
export interface DocLite { kind: string; status: DocStatus; valid_until: string | null }
export type CheckState = 'verified' | 'expired' | 'awaiting' | 'rejected' | 'missing';

/**
 * Where a student stands against the checklist for their grade (the class admitted to, else the current one).
 * Only a verified document still in date counts; an awaiting or rejected one is shown as such, not as done.
 */
export function checklistFor(items: ChecklistItem[], grade: number | null, docs: DocLite[], today: string) {
  const need = grade == null ? items : items.filter(i => grade >= i.from && grade <= i.to);
  return need.map(i => {
    const mine = docs.filter(d => d.kind === i.kind);
    const good = mine.find(d => d.status === 'verified' && (!d.valid_until || d.valid_until >= today));
    const state: CheckState = good ? 'verified'
      : mine.some(d => d.status === 'verified') ? 'expired'
        : mine.some(d => d.status === 'awaiting') ? 'awaiting'
          : mine.some(d => d.status === 'rejected') ? 'rejected' : 'missing';
    return { kind: i.kind, label: docLabel(i.kind), state };
  });
}

// ── What is uploaded ────────────────────────────────────────────────────────

export const DOC_MAX_BYTES = 25 * 1024 * 1024;

export interface DocMeta { kind: DocKind; title: string; document_no: string | null; issued_on: string | null; valid_until: string | null }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** The details typed with an upload. The title defaults to the kind's name. */
export function checkMeta(input: Record<string, unknown>, today: string): { value: DocMeta } | { error: string } {
  if (!isDocKind(input.kind)) return { error: 'Pick the kind of document.' };
  const title = typeof input.title === 'string' ? input.title.trim().replace(/\s+/g, ' ') : '';
  if (title.length > 120) return { error: 'Keep the title under 120 characters.' };
  const no = typeof input.document_no === 'string' ? input.document_no.trim() : '';
  if (no.length > 60) return { error: 'The document number is longer than 60 characters.' };
  const date = (k: 'issued_on' | 'valid_until') => {
    const v = input[k];
    if (v == null || v === '') return null;
    return typeof v === 'string' && realDay(v) ? v : undefined;
  };
  const issued = date('issued_on'), valid = date('valid_until');
  if (issued === undefined || valid === undefined) return { error: 'Check the dates.' };
  if (issued && issued > today) return { error: 'The issue date is in the future.' };
  if (issued && valid && valid < issued) return { error: 'It can’t expire before it was issued.' };
  return { value: { kind: input.kind, title: title || DOC_KINDS[input.kind].label, document_no: no || null, issued_on: issued, valid_until: valid } };
}

/** A file name as it is kept: no folders, no control characters, at most 200 characters. */
export function cleanFileName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const base = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(-200);
  return base || null;
}

/**
 * What the file really is, from its first bytes. Only PDFs and images open in the browser; anything else (or a file
 * that only claims to be one) is always served as a download, so an uploaded page or script can never run.
 */
export function inlineType(head: Uint8Array): string | null {
  const s = (a: number, b: number) => String.fromCharCode(...head.subarray(a, b));
  if (s(0, 5) === '%PDF-') return 'application/pdf';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && s(1, 4) === 'PNG') return 'image/png';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'image/webp';
  if (s(0, 4) === 'GIF8') return 'image/gif';
  return null;
}
