'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { FloppyDiskIcon as FloppyDisk } from '@phosphor-icons/react/dist/ssr/FloppyDisk';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { Skeleton } from '@/components/canon/ui';
import { useApi } from '@/lib/exams/useApi';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { normClass, normSubject } from '@/lib/teacher/scope';
import { practicalSubject, type Practical } from '@/lib/lab/practicals';
import { markSchemeFor, partsTotal, recordShortfall, type MarkScheme } from '@/lib/lab/practicals/marks';
import type { ClassOption } from '../useClassRun';
import { useProgress, type ProgressRow } from './usePracticals';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
type Student = { id: string; name: string; rollNo: string };
type Edit = Partial<Pick<ProgressRow, 'done_on' | 'record' | 'viva'>>;

interface SheetSummary { id: string; status: 'open' | 'submitted' | 'locked'; code: string; assessment: string; term: string; subject: string; cls: string; maxMarks: number }

/** The tracker's column heading: "3" (Class 9-10), "A3", "A3′" (the other half of an OR pair), "Aa2" (activity 2). */
const shortRef = (p: Practical) => p.section ? `${p.section}${p.part === 'activity' ? 'a' : ''}${p.no}${p.orWith && p.id > p.orWith ? '′' : ''}` : String(p.no);
const gradeOf = (cls: string) => Number(/\d{1,2}/.exec(cls)?.[0]);

/**
 * Who has done which practical, whose record is in, and their viva score;
 * then the teacher's mark, saved into the open marks sheet in Exams (the
 * teacher still submits that sheet as usual): Subject Enrichment out of 5 in
 * Class 9-10, the practical out of 30 by its CBSE parts in Class 11-12.
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
  const senior = practicals.some(x => x.section);
  const short = (sid: string) => recordShortfall(practicals, new Set(practicals.filter(x => get(sid, x.id)?.done_on).map(x => x.id)));
  const scheme = markSchemeFor(gradeOf(target.cls), practicalSubject(target.subject) ?? 'Science');

  return (
    <>
      <div className="seg prx-seg" role="tablist" aria-label="Which practical">
        <button role="tab" aria-selected={focus === 'all'} className={focus === 'all' ? 'on' : ''} onClick={() => setFocus('all')}>All</button>
        {practicals.map(x => <button key={x.id} role="tab" aria-selected={focus === x.id} className={focus === x.id ? 'on' : ''} title={x.title} onClick={() => setFocus(x.id)}>{shortRef(x)}</button>)}
      </div>

      <div className="prx-scroll">
        {focus === 'all' || !p ? (
          <table className="prx-grid">
            <thead><tr><th>Student</th>{practicals.map(x => <th key={x.id} title={x.title}>{shortRef(x)}</th>)}<th>Done</th><th>Records</th><th>Viva</th>{senior && <th>Record minimum</th>}</tr></thead>
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
                          <button className={`prx-tick${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${s.name}, practical ${shortRef(x)}: ${on ? `done ${m!.done_on}` : 'not done'}`}
                            title={on ? `Done ${m!.done_on}${m!.record !== 'none' ? ` · record ${m!.record}` : ''}${m!.viva !== null ? ` · viva ${m!.viva}/5` : ''}` : 'Mark done today'}
                            onClick={() => edit(s.id, x.id, { done_on: on ? null : today() })}>
                            {on && <Check size={13} weight="bold" />}
                          </button>
                        </td>
                      );
                    })}
                    <td><b>{done}</b>/{practicals.length}</td><td>{recs}</td><td>{vivas.length ? (vivas.reduce((a, b) => a + b, 0) / vivas.length).toFixed(1) : '–'}</td>
                    {senior && <td>{short(s.id) ? <span className="prx-short">Short: {short(s.id)}</span> : 'Met'}</td>}
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

      {(() => {
        const evidence = (sid: string) => {
          const mine = practicals.map(x => get(sid, x.id));
          const v = mine.map(m => m?.viva).filter((x): x is number => x !== null && x !== undefined);
          const gap = senior ? short(sid) : null;
          return `${mine.filter(m => m?.done_on).length}/${practicals.length} done · ${mine.filter(m => m && m.record !== 'none').length} records · viva ${v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '–'}${gap ? ` · short: ${gap}` : ''}`;
        };
        return scheme.parts
          ? <PartsPanel target={target} students={students} scheme={scheme} evidence={evidence} call={call} />
          : <MarksPanel target={target} students={students} evidence={evidence} />;
      })()}
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
            <button className="btn pri" disabled={!Object.keys(vals).length || busy || sheet.status !== 'open'} onClick={send}><PaperPlaneTilt size={15} weight="fill" /> {busy ? 'Saving…' : 'Save to the marks sheet'}</button>
            {msg && <span className="muted" role="status" style={msg.ok ? undefined : { color: 'var(--red)' }}>{msg.text}</span>}
          </div>
        </>
      )}
    </section>
  );
}

interface PartsRow { student_id: string; parts: Record<string, number>; total: number }

/**
 * Class 11-12: the practical out of 30, scored by its CBSE parts beside the
 * evidence. The parts are kept with the sheet and their total goes into the
 * open PR sheet in Exams (scaled if the school set that sheet to another maximum).
 */
function PartsPanel({ target, students, scheme, evidence, call }: {
  target: ClassOption; students: Student[]; scheme: MarkScheme; evidence: (sid: string) => string;
  call: <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
}) {
  const parts = scheme.parts!;
  const { profile } = useAuth();
  const { data, error } = useApi<{ sheets: SheetSummary[] }>('/api/teacher/exams');
  const sheets = useMemo(() => (data?.sheets ?? []).filter(s => scheme.sheet.test(s.code) && normClass(s.cls) === normClass(target.cls) && normSubject(s.subject) === normSubject(target.subject)), [data, target, scheme]);
  const [pick, setPick] = useState<string | null>(null);
  const sheet = sheets.find(s => s.id === pick) ?? sheets.find(s => s.status === 'open') ?? sheets[0] ?? null;
  const [nonce, setNonce] = useState(0);
  // The saved parts, tagged with the sheet and load they belong to: a different sheet shows the skeleton until it loads.
  const [loaded, setLoaded] = useState<{ key: string; rows: Map<string, PartsRow> } | null>(null);
  const loadKey = sheet ? `${sheet.id}|${nonce}` : '';
  const saved = loaded?.key === loadKey ? loaded.rows : null;
  const [vals, setVals] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!sheet || !profile?.schoolId) return;
    let cancelled = false;
    createClient().from('practical_assessment').select('student_id, parts, total').eq('school_id', profile.schoolId).eq('sheet_id', sheet.id).limit(1000)
      .then(({ data: d, error: e }) => {
        if (cancelled) return;
        if (e) { setMsg({ ok: false, text: 'Could not load the saved marks.' }); setLoaded({ key: loadKey, rows: new Map() }); return; }
        setLoaded({ key: loadKey, rows: new Map(((d ?? []) as PartsRow[]).map(r => [r.student_id, r])) });
      });
    return () => { cancelled = true; };
  }, [sheet, profile?.schoolId, loadKey]);

  const value = (sid: string, key: string) => vals[sid]?.[key] ?? (saved?.get(sid)?.parts[key] !== undefined ? String(saved!.get(sid)!.parts[key]) : '');
  const totalOf = (sid: string) => {
    const xs = parts.map(p => value(sid, p.key));
    if (xs.every(x => x === '')) return null;
    return xs.some(x => x === '' || !Number.isFinite(Number(x))) ? NaN : partsTotal(Object.fromEntries(parts.map((p, i) => [p.key, Number(xs[i])])));
  };
  const open = sheet?.status === 'open';

  const send = async () => {
    if (!sheet) return;
    const rows: { studentId: string; parts: Record<string, number> | null }[] = [];
    for (const sid of Object.keys(vals)) {
      const xs = parts.map(p => value(sid, p.key)), name = students.find(s => s.id === sid)?.name ?? 'A student';
      if (xs.every(x => x === '')) { if (saved?.has(sid)) rows.push({ studentId: sid, parts: null }); continue; }
      if (xs.some(x => x === '')) { setMsg({ ok: false, text: `${name}: fill in every part, or clear them all.` }); return; }
      rows.push({ studentId: sid, parts: Object.fromEntries(parts.map((p, i) => [p.key, Number(xs[i])])) });
    }
    if (!rows.length) { setVals({}); return; }
    setBusy(true); setMsg(null);
    try {
      await call('/api/teacher/practicals', 'POST', { action: 'assess', class: target.cls, subject: target.subject, sheetId: sheet.id, rows });
      setVals({}); setNonce(n => n + 1);
      setMsg({ ok: true, text: `Saved to ${sheet.assessment}. Submit the sheet in Exams when the class is complete.` });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not save the marks.' }); }
    finally { setBusy(false); }
  };

  return (
    <section style={{ marginTop: 28 }}>
      <h2 className="lab-section">Practical mark (out of {scheme.total})</h2>
      <p className="muted" style={{ fontSize: 13, margin: '-4px 0 12px' }}>Score each CBSE part from the evidence beside each name ({parts.map(p => `${p.label.toLowerCase()} ${p.max}`).join(', ')}). The total goes into the Exams practical sheet for {target.cls} {target.subject}; you submit that sheet in Exams as usual.</p>
      {error && <p className="muted" style={{ color: 'var(--red)' }}>{error}</p>}
      {!data && !error && <Skeleton h={80} />}
      {data && !sheets.length && <p className="muted">The exam cell hasn&apos;t opened a practical sheet (PR1 or PR2) for {target.cls} {target.subject} yet. Once it does, you can enter the marks here.</p>}
      {sheets.length > 0 && sheet && (
        <>
          <div className="seg" role="tablist" aria-label="Term" style={{ marginBottom: 10 }}>
            {sheets.map(s => <button key={s.id} role="tab" aria-selected={s.id === sheet.id} className={s.id === sheet.id ? 'on' : ''} onClick={() => { setPick(s.id); setVals({}); setMsg(null); }}>{s.assessment}{s.status !== 'open' ? ` (${s.status})` : ''}</button>)}
          </div>
          {!open && <p className="muted">This sheet is {sheet.status}: {sheet.status === 'locked' ? 'the term is published' : 'waiting for the class teacher'}, so it can&apos;t be changed here.</p>}
          {!saved ? <Skeleton h={160} /> : (
            <div className="prx-scroll">
              <table className="prx-grid prx-focus prx-parts">
                <thead><tr><th>Student</th><th>Evidence</th>{parts.map(p => <th key={p.key} title={p.label}>{p.label} ({p.max})</th>)}<th>Total</th>{sheet.maxMarks !== scheme.total && <th>On the sheet (/{sheet.maxMarks})</th>}</tr></thead>
                <tbody>
                  {students.map(s => {
                    const t = totalOf(s.id);
                    return (
                      <tr key={s.id}>
                        <td className="prx-name">{s.name}</td>
                        <td className="muted prx-ev">{evidence(s.id)}</td>
                        {parts.map(p => (
                          <td key={p.key}><input className="prx-mark" inputMode="decimal" value={value(s.id, p.key)} disabled={!open} placeholder="–" aria-label={`${s.name}: ${p.label}, out of ${p.max}`}
                            onChange={e => setVals(v => ({ ...v, [s.id]: { ...Object.fromEntries(parts.map(q => [q.key, value(s.id, q.key)])), [p.key]: e.target.value } }))} /></td>
                        ))}
                        <td><b>{t === null ? '–' : Number.isNaN(t) ? '…' : t}</b></td>
                        {sheet.maxMarks !== scheme.total && <td>{t === null || Number.isNaN(t) ? '–' : Math.round((t * sheet.maxMarks / scheme.total) * 2) / 2}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="lab-transport" style={{ marginTop: 12 }}>
            <button className="btn pri" disabled={!Object.keys(vals).length || busy || !open} onClick={send}><PaperPlaneTilt size={15} weight="fill" /> {busy ? 'Saving…' : 'Save to the marks sheet'}</button>
            {Object.keys(vals).length > 0 && <button className="btn" onClick={() => setVals({})} disabled={busy}>Undo changes</button>}
            {msg && <span className="muted" role="status" style={msg.ok ? undefined : { color: 'var(--red)' }}>{msg.text}</span>}
          </div>
        </>
      )}
    </section>
  );
}
