'use client';

import { useMemo, useState } from 'react';
import { EyeIcon as Eye } from '@phosphor-icons/react/dist/ssr/Eye';
import { SealCheckIcon as SealCheck } from '@phosphor-icons/react/dist/ssr/SealCheck';
import { Skeleton } from '@/components/canon/ui';
import { CardHead, Workspace } from '@/components/admin/kit';
import Pop, { run } from '@/components/schedule/Pop';
import ReportCard from '@/components/exams/ReportCard';
import type { ClassSummary } from '@/components/admin/exams/ClassTerm';
import { RESULT_LABEL, type ReportCardSnapshot } from '@/lib/exams/card';
import { useApi, type Call } from '@/lib/exams/useApi';
import type { MyExams } from './TeacherExams';

const SHEET = { open: ['NOT SUBMITTED', 'a'], submitted: ['SUBMITTED', 'b'], locked: ['PUBLISHED', 'g'] } as const;

/**
 * The class teacher's review of a term: every subject's sheet in, each student's standing, remarks and
 * co-scholastic grades, a preview of each card, then "reviewed" for the principal to publish.
 */
export default function ReviewView({ termId, myClass, call, toast, onChanged, onClose }: {
  termId: string; myClass: NonNullable<MyExams['myClass']>; call: Call; toast: (m: string) => void; onChanged: () => void; onClose: () => void;
}) {
  const { data: s, error, reload } = useApi<ClassSummary>(`/api/teacher/exams?review=${termId}`);
  type Extra = { remark: string; coscholastic: Record<string, string> };
  // Edits on top of what's saved; cleared after a save.
  const [edits, setEdits] = useState<Record<string, Extra>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReportCardSnapshot | null>(null);
  const [returning, setReturning] = useState<ClassSummary['sheets'][number] | null>(null);
  const extras = useMemo<Record<string, Extra>>(() => ({ ...Object.fromEntries((s?.students ?? []).map(x => [x.id, { remark: x.remark, coscholastic: x.coscholastic }])), ...edits }), [s, edits]);
  const setExtras = (v: Record<string, Extra>) => setEdits(Object.fromEntries(Object.entries(v).filter(([id]) => v[id] !== extras[id] || edits[id])));

  const areas = myClass.scheme?.coScholastic ?? [];
  const grades = myClass.scheme?.coGrades ?? [];
  const locked = s?.classTerm.status === 'published';
  const dirty = s ? s.students.filter(x => { const e = extras[x.id]; return e && (e.remark !== x.remark || JSON.stringify(e.coscholastic) !== JSON.stringify(x.coscholastic)); }) : [];
  const missingCo = s ? s.students.filter(x => areas.some(a => !extras[x.id]?.coscholastic?.[a.key])).length : 0;

  const saveExtras = async (quiet = false) => {
    if (!dirty.length) return true;
    const ok = await run(setBusy, setErr, () => call('/api/teacher/exams', 'POST', { action: 'extras', termId, rows: dirty.map(x => ({ studentId: x.id, ...extras[x.id] })) }));
    if (ok) { if (!quiet) toast(`Saved for ${dirty.length} student${dirty.length === 1 ? '' : 's'}.`); setEdits({}); reload(); }
    return ok;
  };
  const review = async () => {
    if (!(await saveExtras(true))) return;
    const ok = await run(setBusy, setErr, () => call('/api/teacher/exams', 'POST', { action: 'review', termId }));
    if (ok) { toast('Marked reviewed. The principal can publish it now.'); reload(); onChanged(); }
  };
  const showPreview = async (id: string) => {
    if (!(await saveExtras(true))) return;
    try { const r = await call<{ cards: { snapshot: ReportCardSnapshot }[] }>(`/api/teacher/exams?review=${termId}&preview=${id}`); setPreview(r.cards[0].snapshot); }
    catch (e: any) { toast(e.message); }
  };
  const fillCo = (area: string, grade: string) => setExtras(Object.fromEntries(Object.entries(extras).map(([id, e]) => [id, e.coscholastic[area] ? e : { ...e, coscholastic: { ...e.coscholastic, [area]: grade } }])));

  return (
    <Workspace wide title={`${myClass.name} · ${s?.term.name ?? 'Review'}`} sub={s ? `${s.scheme.name}. ${s.classTerm.status === 'published' ? `Published, version ${s.classTerm.version}.` : s.classTerm.status === 'reviewed' ? 'Reviewed: waiting for the principal to publish.' : 'Check the marks, add remarks and grades, then mark it reviewed.'}` : undefined} onClose={onClose}
      actions={s && !locked && <div className="hr-acts">
        <button className="btn sm" disabled={busy || !dirty.length} onClick={() => saveExtras()}>{dirty.length ? `Save ${dirty.length}` : 'Saved'}</button>
        {s.classTerm.status === 'open' && <button className="btn sm pri" disabled={busy || !s.ready.canReview || missingCo > 0} title={!s.ready.canReview ? 'Every sheet must be submitted first' : missingCo ? 'Give every co-scholastic grade first' : undefined} onClick={review}><SealCheck size={14} weight="bold" /> Mark reviewed</button>}
      </div>}>
      {error ? <div className="note err" role="alert">{error}</div> : !s ? <div aria-busy="true">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 10 }} />)}</div> : <>
        {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
        {s.classTerm.reopenReason && !locked && <div className="note" style={{ marginBottom: 14 }}>Reopened by the principal: {s.classTerm.reopenReason}</div>}

        <div className="card" style={{ marginBottom: 18 }}>
          <CardHead title="Subjects" sub={s.ready.sheetsOpen || s.ready.unopened ? `${s.ready.sheetsOpen + s.ready.unopened} sheet${s.ready.sheetsOpen + s.ready.unopened === 1 ? '' : 's'} still to come in.` : 'Every sheet is in.'} />
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Subject</th><th>Assessment</th><th>Teacher</th><th>Entered</th><th>Status</th><th /></tr></thead>
            <tbody>
              {s.sheets.map(sh => (
                <tr key={sh.id}>
                  <td><b>{sh.subject}</b></td><td>{sh.code} <span className="muted">{sh.assessment}</span></td><td className="muted">{sh.teachers.join(', ') || '—'}</td>
                  <td className="muted">{sh.marked}/{sh.of}</td>
                  <td><span className={`ex-pill ${SHEET[sh.status][1]}`}>{SHEET[sh.status][0]}</span></td>
                  <td>{sh.status === 'submitted' && !locked && <button className="btn sm" onClick={() => setReturning(sh)}>Send back</button>}</td>
                </tr>
              ))}
              {s.unopened.map(u => <tr key={`${u.subject}${u.code}`}><td><b>{u.subject}</b></td><td>{u.code}</td><td colSpan={4} className="muted">Not opened for marks entry yet. Ask the exam cell.</td></tr>)}
            </tbody>
          </table></div>
        </div>

        <div className="card">
          <CardHead title="Students" sub={areas.length ? `Remarks are optional. Every co-scholastic grade is needed before you mark the term reviewed${missingCo ? ` (${missingCo} student${missingCo === 1 ? '' : 's'} to go)` : ''}.` : 'Remarks are optional.'}
            right={!locked && areas.length > 0 && <div className="hr-acts">{areas.map(a => (
              <select key={a.key} className="sch-sel" aria-label={`Fill blank ${a.name} grades`} value="" onChange={e => e.target.value && fillCo(a.key, e.target.value)}>
                <option value="">Fill blank {a.name.toLowerCase()}…</option>{grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            ))}</div>} />
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Student</th><th className="c">Term %</th>{s.term.isFinal && <th>Result</th>}{areas.map(a => <th key={a.key} title={a.name}>{a.name.split(' ')[0]}</th>)}<th>Remark</th><th /></tr></thead>
            <tbody>{s.students.map(x => {
              const e = extras[x.id] ?? { remark: '', coscholastic: {} };
              const missing = x.subjects.filter(y => y.missing.length).map(y => y.name);
              return (
                <tr key={x.id}>
                  <td style={{ minWidth: 160 }}><b>{x.name}</b><div className="muted" style={{ fontSize: 12 }}>{x.rollNo || x.admissionNo || ''}{missing.length ? ` · missing ${missing.join(', ')}` : ''}</div></td>
                  <td className="c">{x.termPct ?? '—'}</td>
                  {s.term.isFinal && <td>{x.result ? <span className={`ex-pill ${x.result === 'pass' ? 'g' : x.result === 'compartment' ? 'a' : 'r'}`}>{RESULT_LABEL[x.result]}</span> : '—'}</td>}
                  {areas.map(a => (
                    <td key={a.key}>
                      <select className="sch-sel" style={{ padding: '6px 8px' }} aria-label={`${a.name} for ${x.name}`} disabled={locked} value={e.coscholastic[a.key] ?? ''}
                        onChange={ev => setExtras({ ...extras, [x.id]: { ...e, coscholastic: { ...e.coscholastic, [a.key]: ev.target.value } } })}>
                        <option value="">—</option>{grades.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                  ))}
                  <td style={{ minWidth: 240 }}><textarea className="ex-in" rows={2} maxLength={600} aria-label={`Remark for ${x.name}`} disabled={locked} value={e.remark} onChange={ev => setExtras({ ...extras, [x.id]: { ...e, remark: ev.target.value } })} /></td>
                  <td><button className="btn sm" disabled={!x.complete} title={x.complete ? undefined : 'Marks are missing'} onClick={() => showPreview(x.id)}><Eye size={14} weight="bold" /> Card</button></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
      </>}
      {preview && <Pop wide title={`${preview.student.name}: preview`} sub="As it would publish now. Nothing is sent." onClose={() => setPreview(null)}><ReportCard card={preview} doc={false} preview /></Pop>}
      {returning && <ReturnSheet sheet={returning} call={call} onDone={() => { setReturning(null); toast('Sent back.'); reload(); onChanged(); }} onClose={() => setReturning(null)} />}
    </Workspace>
  );
}

function ReturnSheet({ sheet, call, onDone, onClose }: { sheet: ClassSummary['sheets'][number]; call: Call; onDone: () => void; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={`Send back ${sheet.subject} ${sheet.code}`} sub={`${sheet.teachers.join(', ') || 'The subject teacher'} sees your note and can change the marks.`} onClose={onClose}>
      <textarea className="ex-in" rows={3} aria-label="What needs changing" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="ex-sticky"><span className="sp" /><button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn sm pri" disabled={busy || !note.trim()} onClick={() => run(setBusy, setErr, () => call('/api/teacher/exams', 'POST', { action: 'return', sheetId: sheet.id, note })).then(ok => ok && onDone())}>Send back</button></div>
    </Pop>
  );
}
