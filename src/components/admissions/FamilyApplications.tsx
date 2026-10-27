'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { StudentIcon as Student } from '@phosphor-icons/react/dist/ssr/Student';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { CardHead, Field } from '@/components/admin/kit';
import { CHECK_LABEL, CHECK_TONE } from '@/components/admin/students/DocumentsPanel';
import { DocumentForm, uploadDocument, type Call } from '@/components/students/documentForms';
import ApplicationFields, { draftToForm, toDraft, type Draft } from './ApplicationFields';
import type { ApplicationForm } from '@/lib/admin/application';
import type { FamilyStatus } from '@/lib/admin/familyAccess';
import { fmtDate } from '@/lib/admin/format';
import { DOC_KIND_KEYS, type DocStatus } from '@/lib/students/documents';
import { GRADES, gradeLabel } from '@/lib/students/register';
import { rupees } from '@/lib/admin/rteFees';

/**
 * A family's own admission applications: the list, starting one, filling it in, sending documents and sending it to
 * the school. Shared by the school's apply page (no login) and the parent portal; `send` posts one action to the
 * route that serves them (lib/admin/familyServer familyAction).
 */
export type Send = <T = any>(body: Record<string, unknown>) => Promise<T>;

interface Listed { id: string; name: string; grade: number; session: string; createdAt: string; submittedAt: string | null; status: FamilyStatus }
interface Loaded {
  id: string; name: string; grade: number; dob: string | null; session: string; channel: string; submittedAt: string | null;
  status: FamilyStatus; canEdit: boolean; canSend: boolean; canEditBasics: boolean;
  assessment: null | { booking: { slot: FamSlot | null } | null; sat: boolean | null; open: FamSlot[] };
  fees: null | { lines: { kind: string; label: string; amount: number; why: string | null; paid: boolean; receiptNo: string | null }[]; depositDue: string | null };
  form: ApplicationForm; completeness: { missing: string[]; done: boolean }; age: string;
  checklist: { kind: string; label: string; state: keyof typeof CHECK_LABEL }[];
  docs: { id: string; kind: string; label: string; title: string; file_name: string; status: DocStatus; reject_note: string | null; source: 'office' | 'family'; created_at: string; canRemove: boolean }[];
}

interface FamSlot { id: string; when: string; place: string | null; note: string | null }

const DOC_TONE: Record<DocStatus, 'g' | 'b' | 'r'> = { verified: 'g', awaiting: 'b', rejected: 'r' };
const DOC_LABEL: Record<DocStatus, string> = { verified: 'VERIFIED', awaiting: 'WITH THE SCHOOL', rejected: 'SEND AGAIN' };

export default function FamilyApplications({ send, canCreate, closedNote, startOpen }: {
  send: Send; canCreate: boolean; closedNote?: string | null; startOpen?: boolean;
}) {
  const [apps, setApps] = useState<Listed[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => setNonce(n => n + 1), []);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    let cancelled = false;
    send<{ applications: Listed[] }>({ action: 'list' })
      .then(r => { if (!cancelled) setApps(r.applications); })
      .catch(e => { if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not load your applications.'); });
    return () => { cancelled = true; };
  }, [send, nonce]);
  // An access code is for one applicant: go straight to it, once.
  if (startOpen && !opened && apps?.length === 1) { setOpened(true); setOpen(apps[0].id); }

  if (open) return <ApplicationView id={open} send={send} onBack={() => { setOpen(null); load(); }} />;
  if (err) return <div className="note err" role="alert">{err}</div>;
  if (!apps) return <div className="card">{[0, 1].map(i => <Skeleton key={i} h={22} style={{ marginBottom: 14 }} />)}</div>;
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <CardHead title="Your applications"
          right={canCreate && !starting && <button className="btn pri" onClick={() => setStarting(true)}><Plus size={15} weight="bold" /> Apply for a child</button>} />
        {starting && <StartForm send={send} onCancel={() => setStarting(false)} onStarted={id => { setStarting(false); setOpen(id); }} />}
        {!apps.length && !starting ? (
          <Empty icon={<Student size={30} weight="duotone" />} title="No applications yet">
            {canCreate ? 'Start one for each child you are applying for. You can save it and come back before sending it.' : closedNote || 'The school isn’t taking applications online at the moment.'}
          </Empty>
        ) : apps.map(a => (
          <div className="row" key={a.id} style={{ alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <b>{a.name}</b>
              <div className="muted" style={{ fontSize: 13 }}>{gradeLabel(a.grade)} · AY {a.session.replace('-', '–')} · {a.submittedAt ? `sent ${fmtDate(a.submittedAt)}` : `started ${fmtDate(a.createdAt)}`}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{a.status.detail}</div>
            </div>
            <Chip tone={a.status.tone}>{a.status.label.toUpperCase()}</Chip>
            <button className="btn sm" onClick={() => setOpen(a.id)}>{a.status.key === 'draft' ? 'Carry on' : 'Open'}</button>
          </div>
        ))}
        {!canCreate && apps.length > 0 && closedNote && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{closedNote}</p>}
      </div>
    </>
  );
}

function GradeSelect({ id, value, set, disabled }: { id: string; value: string; set: (v: string) => void; disabled?: boolean }) {
  return (
    <select id={id} className="cmp-sel" value={value} disabled={disabled} onChange={e => set(e.target.value)}>
      <option value="">Pick a class</option>
      {GRADES.map(g => <option key={g} value={String(g)}>{gradeLabel(g)}</option>)}
    </select>
  );
}

function StartForm({ send, onCancel, onStarted }: { send: Send; onCancel: () => void; onStarted: (id: string) => void }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { const r = await send<{ id: string }>({ action: 'create', name, grade: Number(grade), dob: dob || null }); onStarted(r.id); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not start the application.'); setBusy(false); }
  };
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginBottom: 6 }}>
      <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Field label="CHILD’S FULL NAME" htmlFor="st-name" hint="As on the birth certificate."><input id="st-name" className="cmp-in" maxLength={120} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="CLASS APPLYING FOR" htmlFor="st-grade"><GradeSelect id="st-grade" value={grade} set={setGrade} /></Field>
        <Field label="DATE OF BIRTH" htmlFor="st-dob"><input id="st-dob" type="date" className="cmp-in" value={dob} onChange={e => setDob(e.target.value)} /></Field>
      </div>
      {err && <div className="err" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={busy || !name.trim() || grade === ''} onClick={go}>{busy ? 'Starting…' : 'Start the application'}</button>
      </div>
    </div>
  );
}

function ApplicationView({ id, send, onBack }: { id: string; send: Send; onBack: () => void }) {
  const [app, setApp] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => setNonce(n => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    send<{ application: Loaded }>({ action: 'load', id })
      .then(r => { if (!cancelled) setApp(r.application); })
      .catch(e => { if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not load the application.'); });
    return () => { cancelled = true; };
  }, [send, id, nonce]);
  const back = <button className="btn sm" onClick={onBack} style={{ marginBottom: 14 }}><ArrowLeft size={14} /> All applications</button>;
  if (err) return <>{back}<div className="note err" role="alert">{err}</div></>;
  if (!app) return <>{back}<div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={20} style={{ marginBottom: 14 }} />)}</div></>;
  const changed = (m: string) => { setFlash(m); load(); };
  return (
    <>
      {back}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800 }}>{app.name}</h2>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{gradeLabel(app.grade)} · AY {app.session.replace('-', '–')}{app.submittedAt ? ` · sent ${fmtDate(app.submittedAt)}` : ''}</p>
            <p style={{ fontSize: 14, marginTop: 8 }}>{app.status.detail}</p>
          </div>
          <Chip tone={app.status.tone}>{app.status.label.toUpperCase()}</Chip>
        </div>
      </div>
      {flash && <div className="note" role="status" style={{ marginBottom: 16 }}>{flash}</div>}
      {app.fees && app.fees.lines.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <CardHead title="Fees" sub={app.fees.depositDue ? `Pay the seat deposit by ${fmtDate(app.fees.depositDue)} to keep the place: after that the offer lapses.` : 'Paid at the school’s admissions office, which gives you a receipt.'} />
          {app.fees.lines.map(l => (
            <div className="row" key={l.kind} style={{ gap: 10 }}>
              <span style={{ flex: 1, fontSize: 14 }}><b>{l.label}</b> {rupees(l.amount)}{l.why ? <span className="muted" style={{ fontSize: 12.5 }}> ({l.why})</span> : null}
                {l.receiptNo && <span className="muted" style={{ fontSize: 12.5 }}> · receipt {l.receiptNo}</span>}</span>
              <Chip tone={l.paid ? 'g' : 'a'}>{l.paid ? 'PAID' : 'TO PAY'}</Chip>
            </div>
          ))}
        </div>
      )}
      {app.assessment && <AssessmentBooking app={app} send={send} onChanged={changed} />}
      <Details app={app} send={send} onSaved={changed} />
      <Documents app={app} send={send} onChanged={changed} />
    </>
  );
}

/** Booking the admission assessment, when the school lets families book. The score stays with the school. */
function AssessmentBooking({ app, send, onChanged }: { app: Loaded; send: Send; onChanged: (m: string) => void }) {
  const a = app.assessment!;
  const [slot, setSlot] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true); setErr(null);
    try { await send({ ...body, applicantId: app.id }); setSlot(''); onChanged(msg); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  const booked = a.booking?.slot;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <CardHead title="Admission assessment"
        sub={a.sat !== null && !booked ? (a.sat ? 'Done. The admissions office will contact you about the next step.' : 'Marked as not attended. Book another slot if one is open, or contact the office.')
          : booked ? `Booked: ${booked.when}${booked.place ? `, ${booked.place}` : ''}.` : 'Pick a time for your child to sit the assessment.'} />
      {booked?.note && <p style={{ fontSize: 13.5, marginTop: -6 }}>{booked.note}</p>}
      {err && <div className="note err" role="alert" style={{ marginBottom: 10 }}>{err}</div>}
      {a.open.length > 0 && a.sat !== true ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <Field label={booked ? 'CHANGE TO' : 'SLOT'} htmlFor="fa-slot">
            <select id="fa-slot" className="cmp-sel" value={slot} onChange={e => setSlot(e.target.value)}>
              <option value="">Pick a time</option>
              {a.open.filter(s => s.id !== booked?.id).map(s => <option key={s.id} value={s.id}>{s.when}{s.place ? `, ${s.place}` : ''}</option>)}
            </select>
          </Field>
          <button className="btn pri" disabled={busy || !slot} onClick={() => run({ action: 'book', slotId: slot }, 'Booked. Please arrive ten minutes early.')}>{booked ? 'Change' : 'Book'}</button>
          {booked && <button className="btn" disabled={busy} onClick={() => run({ action: 'cancel-booking' }, 'Booking cancelled')}>Cancel booking</button>}
        </div>
      ) : !booked && a.sat !== true ? <p className="muted" style={{ fontSize: 13.5 }}>No times are open right now. The admissions office will contact you.</p> : null}
    </div>
  );
}

/** The child's details and the application form, saved as a draft and then sent. */
function Details({ app, send, onSaved }: { app: Loaded; send: Send; onSaved: (m: string) => void }) {
  const [name, setName] = useState(app.name);
  const [grade, setGrade] = useState(String(app.grade));
  const [dob, setDob] = useState(app.dob ?? '');
  const [d, setD] = useState<Draft>(() => toDraft(app.form));
  const [busy, setBusy] = useState<null | 'save' | 'send'>(null);
  const [err, setErr] = useState<string | null>(null);
  const ro = !app.canEdit;
  const save = async () => send({ action: 'save', id: app.id, name, grade: Number(grade), dob: dob || null, form: draftToForm(d) });
  const run = async (what: 'save' | 'send') => {
    setBusy(what); setErr(null);
    try {
      await save();
      if (what === 'send') await send({ action: 'submit', id: app.id });
      onSaved(what === 'send' ? 'Sent to the school. The admissions office will contact you about the next step.' : 'Saved. You can come back and carry on before sending it.');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(null); }
  };
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <CardHead title="The application"
        sub={ro ? 'Sent to the school. To correct anything, contact the admissions office.' : 'What the school needs for its admission register and, later, the transfer certificate. Save as you go; send it when it is complete.'} />
      <div className="g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 6 }}>
        <Field label="CHILD’S FULL NAME" htmlFor="ap-name"><input id="ap-name" className="cmp-in" maxLength={120} value={name} disabled={!app.canEditBasics} onChange={e => setName(e.target.value)} /></Field>
        <Field label="CLASS APPLYING FOR" htmlFor="ap-grade"><GradeSelect id="ap-grade" value={grade} set={setGrade} disabled={!app.canEditBasics} /></Field>
        <Field label="DATE OF BIRTH" htmlFor="ap-dob"><input id="ap-dob" type="date" className="cmp-in" value={dob} disabled={ro || (!app.canEditBasics && !!app.dob)} onChange={e => setDob(e.target.value)} /></Field>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>{app.age}</p>
      <ApplicationFields d={d} setD={setD} disabled={ro} />
      {!ro && !app.completeness.done && <div className="note" style={{ marginTop: 14 }}>Still to fill in before sending: {app.completeness.missing.join(', ')}. (Save first if you have just filled them.)</div>}
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      {!ro && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
          <button className="btn" disabled={!!busy} onClick={() => run('save')}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
          <button className="btn pri" disabled={!!busy} onClick={() => run('send')}><PaperPlaneTilt size={15} /> {busy === 'send' ? 'Sending…' : 'Send to the school'}</button>
        </div>
      )}
    </div>
  );
}

function Documents({ app, send, onChanged }: { app: Loaded; send: Send; onChanged: (m: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // documentForms speaks path + method + body; here every call is one POST to the family route.
  const call: Call = useCallback(<T,>(_p: string, _m: 'POST', body: unknown) => send<T>(body as Record<string, unknown>), [send]);
  const remove = async (docId: string) => {
    setErr(null);
    try { await send({ action: 'remove-doc', applicantId: app.id, docId }); onChanged('Document removed'); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not remove it.'); }
  };
  return (
    <div className="card">
      <CardHead title="Documents"
        sub="Photos or scans of each document. The school checks them against the originals, so bring those when you visit."
        right={app.canSend && <button className="btn sm pri" onClick={() => setAdding(true)}><Plus size={14} weight="bold" /> Send a document</button>} />
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {app.checklist.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }} aria-label="What the school asks for">
          {app.checklist.map(c => <span key={c.kind} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 10px', fontSize: 13 }}>{c.label} <Chip tone={CHECK_TONE[c.state]}>{CHECK_LABEL[c.state]}</Chip></span>)}
        </div>
      )}
      {!app.docs.length ? (
        <Empty icon={<FileText size={26} weight="duotone" />} title="Nothing sent yet">Send what the school asks for above. Photos from your phone are fine if they are clear.</Empty>
      ) : app.docs.map(doc => (
        <div className="row" key={doc.id} style={{ alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <b>{doc.title}</b>
            <div className="muted" style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{doc.file_name} · {doc.source === 'office' ? 'added by the school' : `sent ${fmtDate(doc.created_at)}`}</div>
            {doc.status === 'rejected' && doc.reject_note && <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 4 }}>{doc.reject_note}</div>}
          </div>
          <Chip tone={DOC_TONE[doc.status]}>{DOC_LABEL[doc.status]}</Chip>
          {doc.canRemove && <button className="btn sm" onClick={() => remove(doc.id)}>Remove</button>}
        </div>
      ))}
      {adding && <DocumentForm kinds={DOC_KIND_KEYS} office={false} busyLabel="Sending" onClose={() => setAdding(false)}
        onSend={async (file, meta) => { await uploadDocument(call, '', { applicantId: app.id }, file, meta); setAdding(false); onChanged('Document sent. The school will check it.'); }} />}
    </div>
  );
}
