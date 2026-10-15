'use client';

import { useState } from 'react';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { EyeIcon as Eye } from '@phosphor-icons/react/dist/ssr/Eye';
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import { SealCheckIcon as SealCheck } from '@phosphor-icons/react/dist/ssr/SealCheck';
import { HandPalmIcon as HandPalm } from '@phosphor-icons/react/dist/ssr/HandPalm';
import { Empty, Skeleton } from '@/components/canon/ui';
import { CardHead, Workspace, downloadCsv } from '@/components/admin/kit';
import Pop, { run } from '@/components/schedule/Pop';
import ReportCard, { printCards } from '@/components/exams/ReportCard';
import type { ReportCardSnapshot } from '@/lib/exams/card';
import { RESULT_LABEL } from '@/lib/exams/card';
import type { Term } from '@/lib/exams/engine';
import { useApi, type Call } from '@/lib/exams/useApi';
import type { ExamsData, Toast } from './ExamsPage';

export interface ClassSummary {
  scheme: { id: string; name: string; rules: { showRank: boolean; result: string; coScholastic: { key: string; name: string }[] } };
  term: { id: string; name: string; seq: number; isFinal: boolean };
  cls: { id: string; name: string; classTeacher: string | null };
  classTerm: { id: string | null; status: 'open' | 'reviewed' | 'published'; version: number; reviewedAt: string | null; publishedAt: string | null; reopenReason: string | null };
  sheets: { id: string; code: string; assessment: string; subject: string; status: 'open' | 'submitted' | 'locked'; marked: number; of: number; teachers: string[]; maxMarks: number; returnedNote: string | null; classSubjectId: string }[];
  unopened: { code: string; subject: string }[];
  ready: { sheetsOpen: number; unopened: number; incomplete: number; canReview: boolean };
  students: { id: string; name: string; admissionNo: string | null; rollNo: string | null; complete: boolean; pct: number | null; termPct: number | null; result: 'pass' | 'compartment' | 'fail' | null; toClear: string[]; rank: number | null; remark: string; coscholastic: Record<string, string>;
    subjects: { key: string; name: string; pct: number | null; grade: string | null; missing: string[]; finalPct: number | null; passed: boolean | null }[] }[];
}
interface PublishedCard { id: string; studentId: string; version: number; held: boolean; holdReason: string | null; revised: boolean; publishedAt: string; snapshot: ReportCardSnapshot }

const SHEET = { open: ['OPEN', 'n'], submitted: ['SUBMITTED', 'b'], locked: ['LOCKED', 'g'] } as const;

/** One class's term: are the marks in, the students' standing, review, publish, reopen, preview and print. */
export default function ClassTermView({ data, classId, term, call, toast, onChanged, onClose, schoolName, onPrint }: {
  data: ExamsData; classId: string; term: Term; call: Call; toast: Toast; onChanged: () => void; onClose: () => void; schoolName: string; onPrint: (c: ReportCardSnapshot[]) => void;
}) {
  const base = `/api/admin/exams?session=${data.session}&term=${term.id}&class=${classId}`;
  const { data: s, error, reload } = useApi<ClassSummary>(base);
  const published = s?.classTerm.version ? s.classTerm.version : 0;
  const cards = useApi<{ cards: PublishedCard[] }>(published ? `${base}&cards=1&v=${published}` : null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ReportCardSnapshot | null>(null);
  const [reopen, setReopen] = useState(false);
  const [returning, setReturning] = useState<ClassSummary['sheets'][number] | null>(null);
  const [holding, setHolding] = useState<PublishedCard | null>(null);
  const cls = data.classes.find(c => c.id === classId);
  const changed = () => { reload(); cards.reload(); onChanged(); };

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const r = await call<any>('/api/admin/exams', 'POST', body);
      if (r.failed?.length) toast(r.failed.map((f: any) => f.error).join(' '));
      else toast(done);
      changed();
    } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const showPreview = async (studentId: string) => {
    try { const r = await call<{ cards: { snapshot: ReportCardSnapshot }[] }>(`${base}&preview=${studentId}`); setPreview(r.cards[0].snapshot); }
    catch (e: any) { toast(e.message); }
  };
  const print = (list: ReportCardSnapshot[]) => { onPrint(list); setTimeout(printCards, 50); };
  const printDrafts = async () => {
    try { const r = await call<{ cards: { snapshot: ReportCardSnapshot }[] }>(`${base}&preview=all`); print(r.cards.map(c => c.snapshot)); }
    catch (e: any) { toast(e.message); }
  };

  const st = s?.classTerm.status ?? 'open';
  return (
    <Workspace wide title={`${cls?.name ?? 'Class'} · ${term.name}`} sub={s ? `${s.scheme.name}. Class teacher: ${s.cls.classTeacher ?? 'none set'}.` : undefined} onClose={onClose}
      actions={s && <div className="hr-acts">
        {st !== 'published' && s.ready.canReview && <button className="btn sm" onClick={printDrafts}><Printer size={14} weight="bold" /> Print drafts</button>}
        {published > 0 && cards.data && <button className="btn sm" onClick={() => print(cards.data!.cards.map(c => c.snapshot))}><Printer size={14} weight="bold" /> Print published cards</button>}
        {data.can.publish && st === 'open' && s.ready.canReview && !s.cls.classTeacher && <button className="btn sm" disabled={busy} onClick={() => act({ action: 'review', termId: term.id, classId }, 'Marked as reviewed.')}>Mark reviewed</button>}
        {data.can.publish && st === 'reviewed' && <button className="btn sm pri" disabled={busy} onClick={() => act({ action: 'publish', termId: term.id, classIds: [classId] }, published ? 'Revised report cards published. Families have been told.' : 'Report cards published. Families have been told.')}><SealCheck size={14} weight="bold" /> {published ? 'Publish revision' : 'Publish report cards'}</button>}
        {data.can.publish && st === 'published' && <button className="btn sm" onClick={() => setReopen(true)}><ArrowCounterClockwise size={14} weight="bold" /> Reopen</button>}
      </div>}>
      {error ? <div className="note err" role="alert">{error}</div> : !s ? <div aria-busy="true">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 12 }} />)}</div> : <>
        <Steps s={s} />

        <div className="card" style={{ marginBottom: 18 }}>
          <CardHead title="Marks sheets" sub="Subject teachers enter and submit; the class teacher checks the class and can send a sheet back with a note." />
          {s.unopened.length > 0 && <div className="note" style={{ marginBottom: 12 }}>Not opened for marks entry yet: {s.unopened.map(u => `${u.subject} ${u.code}`).join(', ')}. Open them from the board.</div>}
          {s.sheets.length === 0 ? <Empty icon={<Eye size={26} weight="duotone" />} title="No sheets yet">Open marks entry for this term&apos;s assessments from the board.</Empty> : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Subject</th><th>Assessment</th><th>Teacher</th><th>Entered</th><th>Status</th><th /></tr></thead>
              <tbody>{s.sheets.map(sh => (
                <tr key={sh.id}>
                  <td><b>{sh.subject}</b></td>
                  <td>{sh.code} <span className="muted">{sh.assessment}, out of {sh.maxMarks}</span></td>
                  <td className="muted">{sh.teachers.join(', ') || 'No teacher assigned'}</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="ex-meter" style={{ width: 70 }}><i style={{ width: `${sh.of ? (sh.marked / sh.of) * 100 : 0}%` }} /></div><span className="muted">{sh.marked}/{sh.of}</span></div></td>
                  <td><span className={`ex-pill ${SHEET[sh.status][1]}`}>{SHEET[sh.status][0]}</span>{sh.status === 'open' && sh.returnedNote && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Sent back: {sh.returnedNote}</div>}</td>
                  <td>{data.can.manage && sh.status === 'submitted' && st !== 'published' && <button className="btn sm" onClick={() => setReturning(sh)}>Send back</button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>

        <Students s={s} onPreview={showPreview} cards={cards.data?.cards ?? []} canHold={data.can.hold} onHold={c => setHolding(c)} onRelease={c => act({ action: 'release', cardId: c.id }, 'Released. The family can see it now.')}
          onCsv={() => downloadCsv(`${schoolName.replace(/\W+/g, '-')}-${s.cls.name.replace(/\W+/g, '-')}-${s.term.name.replace(/\W+/g, '-')}.csv`, [
            ['Roll', 'Admission no.', 'Student', ...s.students[0]?.subjects.map(x => x.name) ?? [], 'Term %', ...(s.term.isFinal ? ['Overall %', 'Result'] : []), 'Rank'],
            ...s.students.map(x => [x.rollNo ?? '', x.admissionNo ?? '', x.name, ...x.subjects.map(y => y.pct ?? ''), x.termPct ?? '', ...(s.term.isFinal ? [x.pct ?? '', x.result ? RESULT_LABEL[x.result] : ''] : []), x.rank ?? '']),
          ])} />
      </>}

      {preview && (
        <Pop wide title={`${preview.student.name}: preview`} sub="What the card will look like if published now. Nothing is sent." onClose={() => setPreview(null)}>
          <ReportCard card={preview} doc={false} preview />
        </Pop>
      )}
      {reopen && s && <ReopenPop s={s} call={call} termId={term.id} classId={classId} onDone={() => { setReopen(false); toast('Reopened. Teachers can correct the sheets you picked; publish again when it is reviewed.'); changed(); }} onClose={() => setReopen(false)} />}
      {returning && <ReturnPop sheet={returning} call={call} onDone={() => { setReturning(null); toast('Sent back to the subject teacher.'); changed(); }} onClose={() => setReturning(null)} />}
      {holding && <HoldPop card={holding} call={call} onDone={() => { setHolding(null); toast('Held. The family sees that the card is with the office.'); changed(); }} onClose={() => setHolding(null)} />}
    </Workspace>
  );
}

function Steps({ s }: { s: ClassSummary }) {
  const st = s.classTerm.status;
  const sheetsDone = s.sheets.length > 0 && !s.ready.sheetsOpen && !s.ready.unopened;
  const steps: [string, boolean, string][] = [
    ['Marks entered and submitted', sheetsDone && !s.ready.incomplete, sheetsDone ? (s.ready.incomplete ? `${s.ready.incomplete} students missing marks` : 'All sheets in') : `${s.ready.sheetsOpen + s.ready.unopened} sheet${s.ready.sheetsOpen + s.ready.unopened === 1 ? '' : 's'} to go`],
    ['Class teacher reviewed', st !== 'open', st !== 'open' ? 'Remarks and co-scholastic grades in' : s.cls.classTeacher ? `Waiting for ${s.cls.classTeacher}` : 'No class teacher: the principal marks it reviewed'],
    ['Published', st === 'published', st === 'published' ? `Version ${s.classTerm.version}` : 'Principal publishes'],
  ];
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        {steps.map(([t, done, note], i) => (
          <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span className={`ex-pill ${done ? 'g' : 'n'}`} style={{ minWidth: 28, justifyContent: 'center' }}>{i + 1}</span>
            <div><b>{t}</b><div className="muted" style={{ fontSize: 12.5 }}>{note}</div></div>
          </div>
        ))}
      </div>
      {s.classTerm.reopenReason && st !== 'published' && <div className="note" style={{ marginTop: 14 }}>Reopened: {s.classTerm.reopenReason}</div>}
    </div>
  );
}

function Students({ s, onPreview, cards, canHold, onHold, onRelease, onCsv }: {
  s: ClassSummary; onPreview: (id: string) => void; cards: PublishedCard[]; canHold: boolean; onHold: (c: PublishedCard) => void; onRelease: (c: PublishedCard) => void; onCsv: () => void;
}) {
  const byStudent = new Map(cards.map(c => [c.studentId, c]));
  const showRank = s.scheme.rules.showRank;
  return (
    <div className="card">
      <CardHead title="Students" sub={s.term.isFinal ? 'The term, the year, and the result the scheme decides.' : 'This term\'s percentage across subjects. Preview any card before it goes out.'}
        right={<button className="btn sm" onClick={onCsv}>Download CSV</button>} />
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Roll</th><th>Student</th><th className="c">Term %</th>{s.term.isFinal && <><th className="c">Overall %</th><th>Result</th></>}<th className="c">Rank{showRank ? '' : ' (staff only)'}</th><th>Card</th><th /></tr></thead>
        <tbody>{s.students.map(x => {
          const card = byStudent.get(x.id);
          const missing = x.subjects.filter(y => y.missing.length).map(y => y.name);
          return (
            <tr key={x.id}>
              <td className="muted">{x.rollNo || x.admissionNo || ''}</td>
              <td><b>{x.name}</b>{missing.length > 0 && <div className="muted" style={{ fontSize: 12 }}>Missing: {missing.join(', ')}</div>}</td>
              <td className="c">{x.termPct ?? '—'}</td>
              {s.term.isFinal && <><td className="c">{x.pct ?? '—'}</td><td>{x.result ? <span className={`ex-pill ${x.result === 'pass' ? 'g' : x.result === 'compartment' ? 'a' : 'r'}`}>{RESULT_LABEL[x.result]}</span> : '—'}{x.toClear.length > 0 && <div className="muted" style={{ fontSize: 12 }}>{x.subjects.filter(y => x.toClear.includes(y.key)).map(y => y.name).join(', ')}</div>}</td></>}
              <td className="c">{x.rank ?? '—'}</td>
              <td>{card ? (card.held ? <span className="ex-pill r" title={card.holdReason ?? ''}>HELD</span> : <span className="ex-pill g">v{card.version}</span>) : <span className="muted">—</span>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn sm" onClick={() => onPreview(x.id)} disabled={!x.complete} title={x.complete ? undefined : 'Marks are missing'}><Eye size={14} weight="bold" /> Preview</button>{' '}
                {card && canHold && (card.held ? <button className="btn sm" onClick={() => onRelease(card)}>Release</button> : <button className="btn sm" onClick={() => onHold(card)}><HandPalm size={14} weight="bold" /> Hold</button>)}
              </td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </div>
  );
}

function ReopenPop({ s, call, termId, classId, onDone, onClose }: { s: ClassSummary; call: Call; termId: string; classId: string; onDone: () => void; onClose: () => void }) {
  const subjects = [...new Map(s.sheets.map(x => [x.classSubjectId, x.subject])).entries()];
  const [reason, setReason] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title="Reopen this term" sub="Pick the subjects whose marks need correcting. Remarks and co-scholastic grades open too. Publishing again issues revised cards and tells families why." onClose={onClose}>
      <div className="ex-form" style={{ gridTemplateColumns: '1fr' }}>
        <div><label htmlFor="ro-r">Reason (families see it)</label><textarea id="ro-r" className="ex-in" rows={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Correction to the Mathematics half-yearly total after re-checking" /></div>
        <div>
          <label>Subjects to reopen</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 6 }}>
            {subjects.map(([id, name]) => <label key={id} className="ex-chk" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13.5, color: 'var(--ink)' }}><input type="checkbox" checked={picked.has(id)} onChange={e => { const n = new Set(picked); if (e.target.checked) n.add(id); else n.delete(id); setPicked(n); }} />{name}</label>)}
          </div>
        </div>
      </div>
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="ex-sticky"><span className="sp" /><button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn sm pri" disabled={busy || !reason.trim()} onClick={() => run(setBusy, setErr, () => call('/api/admin/exams', 'POST', { action: 'reopen', termId, classId, reason, classSubjectIds: [...picked] })).then(ok => ok && onDone())}>Reopen</button></div>
    </Pop>
  );
}

function ReturnPop({ sheet, call, onDone, onClose }: { sheet: ClassSummary['sheets'][number]; call: Call; onDone: () => void; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={`Send back ${sheet.subject} ${sheet.code}`} sub={`${sheet.teachers.join(', ') || 'The subject teacher'} will see your note and can change the marks.`} onClose={onClose}>
      <label className="muted" htmlFor="rt-n" style={{ display: 'block', marginBottom: 6 }}>What needs changing</label>
      <textarea id="rt-n" className="ex-in" rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="ex-sticky"><span className="sp" /><button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn sm pri" disabled={busy || !note.trim()} onClick={() => run(setBusy, setErr, () => call('/api/admin/exams', 'POST', { action: 'return_sheet', sheetId: sheet.id, note })).then(ok => ok && onDone())}>Send back</button></div>
    </Pop>
  );
}

function HoldPop({ card, call, onDone, onClose }: { card: PublishedCard; call: Call; onDone: () => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={`Hold ${card.snapshot.student.name}'s card`} sub="The family sees that the card is ready and with the office, not the card itself. Release it when it can go out." onClose={onClose}>
      <label className="muted" htmlFor="hd-r" style={{ display: 'block', marginBottom: 6 }}>Reason (kept in the record, not shown to the family)</label>
      <input id="hd-r" className="ex-in" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="Fees overdue" />
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="ex-sticky"><span className="sp" /><button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn sm pri" disabled={busy || !reason.trim()} onClick={() => run(setBusy, setErr, () => call('/api/admin/exams', 'POST', { action: 'hold', cardId: card.id, reason })).then(ok => ok && onDone())}>Hold</button></div>
    </Pop>
  );
}
