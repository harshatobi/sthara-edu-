'use client';

import { useMemo, useState } from 'react';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { FloppyDiskIcon as FloppyDisk } from '@phosphor-icons/react/dist/ssr/FloppyDisk';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { Skeleton } from '@/components/canon/ui';
import { useApi } from '@/lib/exams/useApi';
import { normClass, normSubject } from '@/lib/teacher/scope';
import type { Practical } from '@/lib/lab/practicals';
import type { ClassOption } from '../useClassRun';
import { useProgress, type ProgressRow } from './usePracticals';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
type Student = { id: string; name: string; rollNo: string };
type Edit = Partial<Pick<ProgressRow, 'done_on' | 'record' | 'viva'>>;

interface SheetSummary { id: string; status: 'open' | 'submitted' | 'locked'; code: string; assessment: string; term: string; subject: string; cls: string; maxMarks: number }

/**
 * Who has done which practical, whose record is in, and their viva score;
 * then the teacher's Subject Enrichment mark out of 5, saved into the open
 * marks sheet in Exams (the teacher still submits that sheet as usual).
 */
export default function Tracker({ target, practicals, students, call }: {
  target: ClassOption; practicals: Practical[]; students: Student[];
  call: <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
}) {
  const { rows, byKey, error, reload } = useProgress(target.cls, target.subject);
  const [focus, setFocus] = useState<string>('all');
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const get = (sid: string, pid: string): ProgressRow | undefined => {
    const base = byKey.get(`${sid}|${pid}`), e = edits[`${sid}|${pid}`];
    return base || e ? { student_id: sid, practical: pid, done_on: null, record: 'none', viva: null, ...base, ...e } as ProgressRow : undefined;
  };
  const edit = (sid: string, pid: string, patch: Edit) => setEdits(x => ({ ...x, [`${sid}|${pid}`]: { ...x[`${sid}|${pid}`], ...patch } }));
  const dirty = Object.keys(edits).length;

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const out = Object.entries(edits).map(([k, e]) => {
        const [studentId, practical] = k.split('|');
        return { studentId, practical, ...('done_on' in e ? { done: e.done_on } : {}), ...('record' in e ? { record: e.record } : {}), ...('viva' in e ? { viva: e.viva } : {}) };
      });
      await call('/api/teacher/practicals', 'POST', { class: target.cls, subject: target.subject, rows: out });
      setEdits({}); reload();
      setMsg({ ok: true, text: `Saved ${out.length} change${out.length === 1 ? '' : 's'}.` });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not save.' }); }
    finally { setBusy(false); }
  };

  if (error) return <p className="muted" style={{ color: 'var(--red)' }}>{error}</p>;
  if (!rows) return <Skeleton h={240} />;
  if (!students.length) return <p className="muted">No students are linked to {target.cls} yet.</p>;
  const p = practicals.find(x => x.id === focus);

  return (
    <>
      <div className="seg prx-seg" role="tablist" aria-label="Which practical">
        <button role="tab" aria-selected={focus === 'all'} className={focus === 'all' ? 'on' : ''} onClick={() => setFocus('all')}>All</button>
        {practicals.map(x => <button key={x.id} role="tab" aria-selected={focus === x.id} className={focus === x.id ? 'on' : ''} title={x.title} onClick={() => setFocus(x.id)}>{x.no}</button>)}
      </div>

      <div className="prx-scroll">
        {focus === 'all' || !p ? (
          <table className="prx-grid">
            <thead><tr><th>Student</th>{practicals.map(x => <th key={x.id} title={x.title}>{x.no}</th>)}<th>Done</th><th>Records</th><th>Viva</th></tr></thead>
            <tbody>
              {students.map(s => {
                const mine = practicals.map(x => get(s.id, x.id));
                const done = mine.filter(m => m?.done_on).length, recs = mine.filter(m => m && m.record !== 'none').length;
                const vivas = mine.map(m => m?.viva).filter((v): v is number => v !== null && v !== undefined);
                return (
                  <tr key={s.id}>
                    <td className="prx-name">{s.name}{s.rollNo ? <span className="muted"> · {s.rollNo}</span> : null}</td>
                    {practicals.map((x, k) => {
                      const m = mine[k], on = !!m?.done_on;
                      return (
                        <td key={x.id}>
                          <button className={`prx-tick${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${s.name}, practical ${x.no}: ${on ? `done ${m!.done_on}` : 'not done'}`}
                            title={on ? `Done ${m!.done_on}${m!.record !== 'none' ? ` · record ${m!.record}` : ''}${m!.viva !== null ? ` · viva ${m!.viva}/5` : ''}` : 'Mark done today'}
                            onClick={() => edit(s.id, x.id, { done_on: on ? null : today() })}>
                            {on && <Check size={13} weight="bold" />}
                          </button>
                        </td>
                      );
                    })}
                    <td><b>{done}</b>/{practicals.length}</td><td>{recs}</td><td>{vivas.length ? (vivas.reduce((a, b) => a + b, 0) / vivas.length).toFixed(1) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="prx-grid prx-focus">
            <thead><tr><th>Student</th><th>Done on</th><th>Record</th><th>Viva (out of 5)</th></tr></thead>
            <tbody>
              {students.map(s => {
                const m = get(s.id, p.id);
                return (
                  <tr key={s.id}>
                    <td className="prx-name">{s.name}</td>
                    <td><input type="date" value={m?.done_on ?? ''} aria-label={`${s.name}: date done`} onChange={e => edit(s.id, p.id, { done_on: e.target.value || null })} /></td>
                    <td>
                      <select value={m?.record ?? 'none'} aria-label={`${s.name}: record`} onChange={e => edit(s.id, p.id, { record: e.target.value as ProgressRow['record'] })}>
                        <option value="none">Not in</option><option value="submitted">Handed in</option><option value="checked">Checked</option>
                      </select>
                    </td>
                    <td>
                      <select value={m?.viva ?? ''} aria-label={`${s.name}: viva`} onChange={e => edit(s.id, p.id, { viva: e.target.value === '' ? null : Number(e.target.value) })}>
                        <option value="">–</option>{[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="lab-transport" style={{ marginTop: 12 }}>
        <button className="btn pri" disabled={!dirty || busy} onClick={save}><FloppyDisk size={15} weight="bold" /> {busy ? 'Saving…' : dirty ? `Save ${dirty} change${dirty === 1 ? '' : 's'}` : 'Saved'}</button>
        {dirty > 0 && <button className="btn" onClick={() => setEdits({})} disabled={busy}>Undo changes</button>}
        {msg && <span className="muted" role="status" style={msg.ok ? undefined : { color: 'var(--red)' }}>{msg.text}</span>}
      </div>

      <MarksPanel target={target} students={students} evidence={(sid) => {
        const mine = practicals.map(x => get(sid, x.id));
        const v = mine.map(m => m?.viva).filter((x): x is number => x !== null && x !== undefined);
        return `${mine.filter(m => m?.done_on).length}/${practicals.length} done · ${mine.filter(m => m && m.record !== 'none').length} records · viva ${v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '–'}`;
      }} />
    </>
  );
}

/** The Subject Enrichment (Practical Work) mark, typed by the teacher, saved into the open SE sheet in Exams. */
function MarksPanel({ target, students, evidence }: { target: ClassOption; students: Student[]; evidence: (sid: string) => string }) {
  const { data, error, call } = useApi<{ sheets: SheetSummary[] }>('/api/teacher/exams');
  const sheets = useMemo(() => (data?.sheets ?? []).filter(s => /^SE\d/.test(s.code) && normClass(s.cls) === normClass(target.cls) && normSubject(s.subject) === normSubject(target.subject)), [data, target]);
  const [pick, setPick] = useState<string | null>(null);
  const sheet = sheets.find(s => s.id === pick) ?? sheets.find(s => s.status === 'open') ?? sheets[0] ?? null;
  const { data: detail, reload } = useApi<{ students: { id: string; mark: { marks: number | null; code: string | null; source: string } | null }[]; canEdit: boolean }>(sheet ? `/api/teacher/exams?sheet=${sheet.id}` : null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const current = (sid: string) => {
    if (sid in vals) return vals[sid];
    const m = detail?.students.find(x => x.id === sid)?.mark;
    return m ? (m.code ?? (m.marks === null ? '' : String(m.marks))) : '';
  };
  const send = async () => {
    if (!sheet) return;
    setBusy(true); setMsg(null);
    try {
      const rows = Object.entries(vals).map(([studentId, value]) => ({ studentId, value }));
      await call('/api/teacher/exams', 'POST', { action: 'marks', sheetId: sheet.id, rows, source: 'practical' });
      setVals({}); reload();
      setMsg({ ok: true, text: `Saved to ${sheet.assessment}. Submit the sheet in Exams when the class is complete.` });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not save the marks.' }); }
    finally { setBusy(false); }
  };

  return (
    <section style={{ marginTop: 28 }}>
      <h2 className="lab-section">Subject Enrichment (Practical Work) mark</h2>
      <p className="muted" style={{ fontSize: 13, margin: '-4px 0 12px' }}>Your mark out of 5, from the evidence beside each name. It goes into the Exams marks sheet for {target.cls} {target.subject}; you submit that sheet in Exams as usual.</p>
      {error && <p className="muted" style={{ color: 'var(--red)' }}>{error}</p>}
      {!data && !error && <Skeleton h={80} />}
      {data && !sheets.length && <p className="muted">The exam cell hasn&apos;t opened a Subject Enrichment sheet for {target.cls} {target.subject} yet. Once it does, you can enter the marks here.</p>}
      {sheets.length > 0 && sheet && (
        <>
          <div className="seg" role="tablist" aria-label="Term" style={{ marginBottom: 10 }}>
            {sheets.map(s => <button key={s.id} role="tab" aria-selected={s.id === sheet.id} className={s.id === sheet.id ? 'on' : ''} onClick={() => { setPick(s.id); setVals({}); }}>{s.assessment}{s.status !== 'open' ? ` (${s.status})` : ''}</button>)}
          </div>
          {sheet.status !== 'open' && <p className="muted">This sheet is {sheet.status}: {sheet.status === 'locked' ? 'the term is published' : 'waiting for the class teacher'}, so it can&apos;t be changed here.</p>}
          {!detail ? <Skeleton h={160} /> : (
            <div className="prx-scroll">
              <table className="prx-grid prx-focus">
                <thead><tr><th>Student</th><th>Evidence</th><th>Mark (out of {sheet.maxMarks})</th></tr></thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id}>
                      <td className="prx-name">{s.name}</td>
                      <td className="muted" style={{ fontSize: 12.5 }}>{evidence(s.id)}</td>
                      <td><input className="prx-mark" inputMode="decimal" value={current(s.id)} disabled={!detail.canEdit || sheet.status !== 'open'} aria-label={`${s.name}: mark`}
                        placeholder="–" onChange={e => setVals(v => ({ ...v, [s.id]: e.target.value }))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="lab-transport" style={{ marginTop: 12 }}>
            <button className="btn red" disabled={!Object.keys(vals).length || busy || sheet.status !== 'open'} onClick={send}><PaperPlaneTilt size={15} weight="fill" /> {busy ? 'Saving…' : 'Save to the marks sheet'}</button>
            {msg && <span className="muted" role="status" style={msg.ok ? undefined : { color: 'var(--red)' }}>{msg.text}</span>}
          </div>
        </>
      )}
    </section>
  );
}
