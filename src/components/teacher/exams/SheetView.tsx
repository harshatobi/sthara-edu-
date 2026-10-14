'use client';

import { useMemo, useRef, useState } from 'react';
import { FileCsvIcon as FileCsv } from '@phosphor-icons/react/dist/ssr/FileCsv';
import { ScanIcon as Scan } from '@phosphor-icons/react/dist/ssr/Scan';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { Skeleton } from '@/components/canon/ui';
import { Workspace } from '@/components/admin/kit';
import Pop, { run } from '@/components/schedule/Pop';
import { MARK_CODES, matchImport, parseCell, parseCsv, type MarkCode } from '@/lib/exams/engine';
import { useApi, type Call } from '@/lib/exams/useApi';

interface SheetData {
  sheet: { id: string; status: 'open' | 'submitted' | 'locked'; maxMarks: number; code: string; assessment: string; termName: string; subject: string; cls: string; returnedNote: string | null; reopenedReason: string | null };
  canEdit: boolean; canReturn: boolean;
  students: { id: string; name: string; admissionNo: string | null; rollNo: string | null; mark: { marks: number | null; code: MarkCode | null; source: string; questions: { n: number; max: number; awarded: number }[] | null } | null }[];
  sources: { id: string; title: string; kind: 'online' | 'script'; totalMarks: number | null; scored: number; due: string | null }[];
}
interface Proposal { assignment?: { id: string; title: string }; source: 'online' | 'script'; rows: { studentId: string; score: number; outOf: number; marks: number; approved: boolean; questions: { n: number; max: number; awarded: number }[] | null }[]; missing: number; error?: string }

const shown = (m: SheetData['students'][number]['mark']) => (!m ? '' : m.code ? m.code : m.marks === null ? '' : String(m.marks));

/**
 * One marks sheet: type marks (or AB / ML / EX) down the class, import a spreadsheet, or fill from a Sthara test
 * or scanned scripts. Nothing is saved until Save; Submit saves and sends it to the class teacher.
 */
export default function SheetView({ id, call, toast, onChanged, onClose }: { id: string; call: Call; toast: (m: string) => void; onChanged: () => void; onClose: () => void }) {
  const { data, error, reload } = useApi<SheetData>(`/api/teacher/exams?sheet=${id}`);
  // Edits on top of what's saved; cleared after a save, so the grid always starts from the saved marks.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<Record<string, { n: number; max: number; awarded: number }[] | null>>({});
  const [origin, setOrigin] = useState<{ source: 'grid' | 'import' | 'online' | 'script'; ref: string | null }>({ source: 'grid', ref: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [filling, setFilling] = useState(false);
  const [returning, setReturning] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const vals = useMemo(() => ({ ...Object.fromEntries((data?.students ?? []).map(s => [s.id, shown(s.mark)])), ...edits }), [data, edits]);
  const setVals = (v: Record<string, string>) => setEdits(Object.fromEntries(Object.entries(v).filter(([sid, x]) => x !== shown(data?.students.find(s => s.id === sid)?.mark ?? null))));

  const max = data?.sheet.maxMarks ?? 0;
  const problems = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [sid, v] of Object.entries(vals)) { const p = parseCell(v, max); if (!p.ok) out[sid] = p.error; }
    return out;
  }, [vals, max]);
  const dirty = data ? data.students.filter(s => (vals[s.id] ?? '') !== shown(s.mark)) : [];
  const entered = data ? data.students.filter(s => (vals[s.id] ?? '').trim()).length : 0;
  const stats = useMemo(() => {
    const ns = Object.values(vals).map(v => parseCell(v, max)).filter(p => p.ok && p.mark.marks !== null).map(p => (p as any).mark.marks as number);
    if (!ns.length) return null;
    const avg = ns.reduce((a, b) => a + b, 0) / ns.length;
    return { avg: Math.round(avg * 10) / 10, hi: Math.max(...ns), lo: Math.min(...ns), below: ns.filter(n => n < max * 0.33).length };
  }, [vals, max]);

  const save = async (quiet = false) => {
    if (!data) return false;
    if (Object.keys(problems).length) { setErr('Fix the marks in red first.'); return false; }
    if (!dirty.length) return true;
    const ok = await run(setBusy, setErr, () => call('/api/teacher/exams', 'POST', {
      action: 'marks', sheetId: id, source: origin.source, sourceRef: origin.ref,
      rows: dirty.map(s => ({ studentId: s.id, value: vals[s.id] ?? '', questions: questions[s.id] ?? undefined })),
    }));
    if (ok) { if (!quiet) toast(`Saved ${dirty.length} mark${dirty.length === 1 ? '' : 's'}.`); setEdits({}); setQuestions({}); setOrigin({ source: 'grid', ref: null }); reload(); onChanged(); }
    return ok;
  };
  const submit = async () => {
    if (!(await save(true))) return;
    const ok = await run(setBusy, setErr, () => call('/api/teacher/exams', 'POST', { action: 'submit', sheetId: id }));
    if (ok) { toast('Submitted to the class teacher.'); onChanged(); onClose(); }
  };
  const move = (i: number, d: number) => { const el = inputs.current[i + d]; if (el) { el.focus(); el.select(); } };

  const s = data?.sheet;
  return (
    <Workspace wide title={s ? `${s.cls} · ${s.subject}` : 'Marks sheet'} sub={s ? `${s.code} ${s.assessment} (${s.termName}), out of ${s.maxMarks}` : undefined}
      onClose={() => { if (dirty.length) setLeaving(true); else onClose(); }}
      actions={data && <div className="hr-acts">
        {data.canEdit && <button className="btn sm" onClick={() => setImporting(true)}><FileCsv size={14} weight="bold" /> Import</button>}
        {data.canEdit && data.sources.length > 0 && <button className="btn sm" onClick={() => setFilling(true)}><Scan size={14} weight="bold" /> Fill from a Sthara test</button>}
        {data.canReturn && <button className="btn sm" onClick={() => setReturning(true)}>Send back</button>}
      </div>}>
      {error ? <div className="note err" role="alert">{error}</div> : !data ? <div aria-busy="true">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={40} style={{ marginBottom: 10 }} />)}</div> : <>
        {s!.status !== 'open' && <div className="note info" style={{ marginBottom: 14 }}>{s!.status === 'submitted' ? 'Submitted. The class teacher can send it back if something needs changing.' : 'Published on report cards. Only the principal can reopen it.'}</div>}
        {s!.status === 'open' && s!.returnedNote && <div className="note err" style={{ marginBottom: 14 }}>Sent back by the class teacher: {s!.returnedNote}</div>}
        {s!.status === 'open' && s!.reopenedReason && <div className="note" style={{ marginBottom: 14 }}>Reopened by the principal: {s!.reopenedReason}</div>}
        <div className="card">
          <p className="muted" style={{ marginBottom: 12 }}>Type a mark out of {max}, or <b>AB</b> absent (counts zero), <b>ML</b> medical or <b>EX</b> exempt (left out and the rest rescaled). Enter or the arrow keys move down the list.</p>
          <div className="ex-scroll"><table className="ex-grid">
            <thead><tr><th>Roll</th><th>Student</th><th className="n">Marks</th><th>From</th></tr></thead>
            <tbody>{data.students.map((st, i) => {
              const v = vals[st.id] ?? '';
              const bad = problems[st.id];
              const isDirty = v !== shown(st.mark);
              const qs = questions[st.id] ?? st.mark?.questions ?? null;
              return (
                <tr key={st.id}>
                  <td className="muted">{st.rollNo || st.admissionNo || ''}</td>
                  <td><b>{st.name}</b>{qs && qs.length > 0 && <div className="ex-q" aria-label="Marks per question">{qs.map(q => <span key={q.n}>Q{q.n} {q.awarded}/{q.max}</span>)}</div>}</td>
                  <td className="n">
                    <input ref={el => { inputs.current[i] = el; }} className={`ex-cell${bad ? ' err' : isDirty ? ' dirty' : ''}`} value={v} disabled={!data.canEdit} inputMode="decimal"
                      aria-label={`Marks for ${st.name}`} aria-invalid={!!bad} title={bad || undefined}
                      onChange={e => setVals({ ...vals, [st.id]: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); } else if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } }} />
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{isDirty ? (origin.source === 'grid' ? 'typed' : origin.source === 'import' ? 'import' : origin.source === 'script' ? 'scanned scripts' : 'Sthara test') : st.mark ? ({ grid: 'typed', import: 'import', online: 'Sthara test', script: 'scanned scripts' } as Record<string, string>)[st.mark.source] : ''}
                    {v && MARK_CODES[v.trim().toUpperCase() as MarkCode] ? ` · ${MARK_CODES[v.trim().toUpperCase() as MarkCode]}` : ''}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
          {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
          <div className="ex-sticky">
            <span className="muted">{entered} of {data.students.length} entered{stats ? ` · average ${stats.avg} · highest ${stats.hi} · lowest ${stats.lo}${stats.below ? ` · ${stats.below} below 33%` : ''}` : ''}</span>
            <span className="sp" />
            {data.canEdit && <>
              <button className="btn sm" disabled={busy || !dirty.length} onClick={() => save()}>{dirty.length ? `Save ${dirty.length}` : 'Saved'}</button>
              <button className="btn sm pri" disabled={busy || entered < data.students.length || Object.keys(problems).length > 0} onClick={submit} title={entered < data.students.length ? 'Every student needs a mark or a code' : undefined}><PaperPlaneTilt size={14} weight="bold" /> Submit</button>
            </>}
          </div>
        </div>
      </>}

      {importing && data && <ImportPop students={data.students} max={max} onApply={(rows) => { setVals({ ...vals, ...rows }); setOrigin({ source: 'import', ref: null }); setImporting(false); toast(`${Object.keys(rows).length} marks filled in. Check them and save.`); }} onClose={() => setImporting(false)} />}
      {filling && data && <FillPop sheetId={id} sources={data.sources} students={data.students}
        onApply={(p) => {
          const next = { ...vals }, qs = { ...questions };
          for (const r of p.rows) { next[r.studentId] = String(r.marks); qs[r.studentId] = r.questions; }
          setVals(next); setQuestions(qs); setOrigin({ source: p.source, ref: p.assignment?.id ?? null }); setFilling(false);
          toast(`${p.rows.length} marks filled in from ${p.assignment?.title}. Check them and save.`);
        }} onClose={() => setFilling(false)} />}
      {leaving && (
        <Pop title="Unsaved marks" sub={`${dirty.length} mark${dirty.length === 1 ? ' has' : 's have'} not been saved.`} onClose={() => setLeaving(false)}>
          <div className="ex-sticky"><span className="sp" /><button className="btn sm" onClick={onClose}>Leave without saving</button>
            <button className="btn sm pri" disabled={busy} onClick={async () => { if (await save()) onClose(); else setLeaving(false); }}>Save and close</button></div>
        </Pop>
      )}
      {returning && <ReturnPop sheetId={id} call={call} onDone={() => { setReturning(false); toast('Sent back to the subject teacher.'); onChanged(); onClose(); }} onClose={() => setReturning(false)} />}
    </Workspace>
  );
}

function ImportPop({ students, max, onApply, onClose }: { students: SheetData['students']; max: number; onApply: (rows: Record<string, string>) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const res = useMemo(() => (text.trim() ? matchImport(parseCsv(text), students.map(s => ({ id: s.id, name: s.name, admissionNo: s.admissionNo, rollNo: s.rollNo })), max) : null), [text, students, max]);
  const load = async (f: File | undefined) => { if (f) setText(await f.text()); };
  return (
    <Pop wide title="Import marks" sub="A CSV from Excel or Google Sheets, or paste the columns. Rows are matched by admission number, then roll number, then exact name. The marks column is the one headed Marks (or the last column)." onClose={onClose}>
      <label className="btn sm" style={{ cursor: 'pointer', marginBottom: 10 }}><FileCsv size={14} weight="bold" /> Choose a CSV file<input type="file" accept=".csv,text/csv,.txt" hidden onChange={e => load(e.target.files?.[0])} /></label>
      <textarea className="ex-in" rows={8} aria-label="Pasted marks" value={text} onChange={e => setText(e.target.value)} placeholder={'Admission no,Name,Marks\nVN1001,Aarav Sharma,34\nVN1002,Diya Rao,AB'} style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 12.5 }} />
      {res && (
        <div style={{ marginTop: 12 }}>
          <p><b>{res.matched.length}</b> matched of {students.length} students.{res.problems.length ? ` ${res.problems.length} row${res.problems.length === 1 ? '' : 's'} couldn't be used:` : ''}</p>
          {res.problems.length > 0 && <ul className="muted" style={{ fontSize: 12.5, paddingLeft: 18, maxHeight: 140, overflow: 'auto' }}>{res.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        </div>
      )}
      <div className="ex-sticky"><span className="sp" /><button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn sm pri" disabled={!res?.matched.length} onClick={() => onApply(Object.fromEntries(res!.matched.map(m => [m.studentId, m.mark.code ?? (m.mark.marks === null ? '' : String(m.mark.marks))])))}>Use {res?.matched.length ?? 0} marks</button></div>
    </Pop>
  );
}

function FillPop({ sheetId, sources, students, onApply, onClose }: { sheetId: string; sources: SheetData['sources']; students: SheetData['students']; onApply: (p: Proposal) => void; onClose: () => void }) {
  const [pick, setPick] = useState(sources[0]?.id ?? '');
  const q = useApi<Proposal>(pick ? `/api/teacher/exams?sheet=${sheetId}&from=${pick}` : null);
  const p = q.data && !q.data.error ? q.data : null;
  const err = q.error ?? q.data?.error ?? null;
  const busy = !!pick && !q.data && !q.error;
  const names = new Map(students.map(s => [s.id, s.name]));
  const unapproved = p?.rows.filter(r => !r.approved).length ?? 0;
  return (
    <Pop wide title="Fill from a Sthara test" sub="Scores from an online quiz, or from answer scripts photographed and graded in Sthara, scaled to this sheet's maximum. Question marks come across from scanned scripts." onClose={onClose}>
      <select className="ex-in" aria-label="Test" value={pick} onChange={e => setPick(e.target.value)}>
        {sources.map(s => <option key={s.id} value={s.id}>{s.title} · {s.kind === 'script' ? 'scanned scripts' : 'online'} · {s.scored} scored</option>)}
      </select>
      {busy && <Skeleton h={80} style={{ marginTop: 12 }} />}
      {p && (
        <div style={{ marginTop: 12 }}>
          <p><b>{p.rows.length}</b> students have a score.{p.missing ? ` ${p.missing} have none and stay as they are.` : ''}{unapproved ? ` ${unapproved} AI-graded scores aren't confirmed by a teacher yet.` : ''}</p>
          <div className="ex-scroll" style={{ maxHeight: 260 }}><table className="ex-grid">
            <thead><tr><th>Student</th><th className="n">Score</th><th className="n">On this sheet</th></tr></thead>
            <tbody>{p.rows.map(r => <tr key={r.studentId}><td>{names.get(r.studentId)}{!r.approved && <span className="ex-pill a" style={{ marginLeft: 8 }}>NOT CONFIRMED</span>}</td><td className="n">{r.score}/{r.outOf}</td><td className="n"><b>{r.marks}</b></td></tr>)}</tbody>
          </table></div>
        </div>
      )}
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="ex-sticky"><span className="sp" /><button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn sm pri" disabled={!p?.rows.length} onClick={() => onApply(p!)}>Use {p?.rows.length ?? 0} marks</button></div>
    </Pop>
  );
}

function ReturnPop({ sheetId, call, onDone, onClose }: { sheetId: string; call: Call; onDone: () => void; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title="Send back to the subject teacher" sub="They see your note and can change the marks, then submit again." onClose={onClose}>
      <textarea className="ex-in" rows={3} aria-label="What needs changing" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="ex-sticky"><span className="sp" /><button className="btn sm" onClick={onClose}>Cancel</button>
        <button className="btn sm pri" disabled={busy || !note.trim()} onClick={() => run(setBusy, setErr, () => call('/api/teacher/exams', 'POST', { action: 'return', sheetId, note })).then(ok => ok && onDone())}>Send back</button></div>
    </Pop>
  );
}
