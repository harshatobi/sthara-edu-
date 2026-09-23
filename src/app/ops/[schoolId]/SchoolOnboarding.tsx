'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { BooksIcon as Books } from '@phosphor-icons/react/dist/ssr/Books';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { KeyIcon as Key } from '@phosphor-icons/react/dist/ssr/Key';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { UploadSimpleIcon as UploadSimple } from '@phosphor-icons/react/dist/ssr/UploadSimple';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { subjectsForClass } from '@/lib/curriculum';
import { CSV_TEMPLATE, PERSON_ROLES, normClass, parsePeopleCsv, validatePeople, type PersonInput, type PersonRole, type RowIssue } from '@/lib/ops/people';
import { useOpsApi } from '../useOpsApi';
import OpsFrame from '../OpsFrame';

interface ClassRow { id?: string; name: string; metadata?: { grade?: string | null; section?: string | null; subjects?: string[] } }
interface Person {
  id: string; role: PersonRole | 'superadmin'; name: string; email: string; student_class: string | null; custom_student_id: string | null;
  teacher_class: string | null; assignments: { class: string; subject: string }[] | null; metadata: any;
}
interface Issued { name: string; email: string; role: string; detail: string; tempPassword: string }

const STEPS = [
  { key: 'classes', label: '1. Classes & subjects' },
  { key: 'people', label: '2. Add people' },
  { key: 'teaching', label: '3. Teacher assignments' },
  { key: 'roster', label: '4. Roster & credentials' },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

const ROLE_TONE: Record<string, Tone> = { admin: 'n', teacher: 'b', student: 'g', parent: 'p' };
const BATCH = 25;

/** Suggested subjects for a grade: the ingested CBSE 2026-27 subjects for 9-12, plus languages. */
function suggestedSubjects(grade: string): string[] {
  const g = Number(grade);
  const official = g >= 9 ? subjectsForClass(String(g)) : [];
  if (g >= 11) return [...new Set(['English', ...official])];
  if (g >= 9) return [...new Set(['English', 'Hindi', ...official])];
  if (g >= 6) return ['English', 'Hindi', 'Mathematics', 'Science', 'Social Science'];
  return ['English', 'Hindi', 'Mathematics', 'EVS'];
}

function downloadCsv(filename: string, rows: string[][]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const url = URL.createObjectURL(new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SchoolOnboarding({ schoolId, devPreview }: { schoolId: string; devPreview: boolean }) {
  const api = useOpsApi();
  const [school, setSchool] = useState<any>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<StepKey>('classes');
  const [issued, setIssued] = useState<Issued[]>([]);
  const [downloaded, setDownloaded] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api<{ school: any; classes: ClassRow[]; people: Person[] }>(`/schools/${schoolId}`);
      setSchool(d.school); setClasses(d.classes); setPeople(d.people); setErr(null);
    } catch (e: any) { setErr(e.message); }
    finally { setLoaded(true); }
  }, [api, schoolId]);
  useEffect(() => { void load(); }, [load]);

  // Temporary passwords exist only in this tab: warn before leaving without the handover file.
  useEffect(() => {
    if (downloaded) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [downloaded]);

  const addIssued = (list: Issued[]) => { if (list.length) { setIssued(prev => [...prev, ...list]); setDownloaded(false); } };
  const exportCredentials = () => {
    downloadCsv(`${school?.settings?.code || 'school'}-credentials.csv`,
      [['role', 'name', 'email', 'class / roll / children', 'temporary password', 'school code'],
        ...issued.map(i => [i.role, i.name, i.email, i.detail, i.tempPassword, school?.settings?.code || ''])]);
    setDownloaded(true);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    people.forEach(p => { c[p.role] = (c[p.role] ?? 0) + 1; });
    return c;
  }, [people]);

  return (
    <OpsFrame devPreview={devPreview}>
      <Link href="/ops" className="ws-back" style={{ marginBottom: 10 }}><ArrowLeft size={15} weight="bold" /> All schools</Link>
      <PageBar eyebrow="ONBOARDING" title={school?.name || (loaded ? 'School' : 'Loading…')}
        sub={school ? <><span className="mono">{school.settings?.code}</span> · {school.settings?.curriculum || 'Curriculum not set'} · {classes.length} classes · {counts.admin ?? 0} admins, {counts.teacher ?? 0} teachers, {counts.student ?? 0} students, {counts.parent ?? 0} parents</> : undefined}
        actions={issued.length ? (
          <button className={`btn ${downloaded ? '' : 'red'}`} onClick={exportCredentials}>
            <DownloadSimple size={15} weight="bold" /> {downloaded ? 'Download credentials again' : `Download ${issued.length} new credential${issued.length === 1 ? '' : 's'}`}
          </button>
        ) : undefined} />

      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {!downloaded && (
        <div className="note" style={{ marginBottom: 18 }} role="status">
          Temporary passwords are shown once and are not stored anywhere. Download the credentials file before leaving this page, and hand it over securely.
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Onboarding steps">
        {STEPS.map(s => (
          <button key={s.key} role="tab" aria-selected={step === s.key} className={`tab${step === s.key ? ' on blue' : ''}`} onClick={() => setStep(s.key)}>{s.label}</button>
        ))}
      </div>

      {!loaded ? <Skeleton h={320} style={{ borderRadius: 20 }} /> : (
        <>
          {step === 'classes' && <ClassesStep schoolId={schoolId} classes={classes} onSaved={load} next={() => setStep('people')} />}
          {step === 'people' && <PeopleStep schoolId={schoolId} classes={classes} people={people} onCreated={(list) => { addIssued(list); void load(); }} />}
          {step === 'teaching' && <TeachingStep schoolId={schoolId} classes={classes} people={people} onSaved={load} />}
          {step === 'roster' && <RosterStep schoolId={schoolId} people={people} onIssued={(i) => addIssued([i])} />}
        </>
      )}
    </OpsFrame>
  );
}

// ── Step 1: classes & subjects ───────────────────────────────────────────────
function ClassesStep({ schoolId, classes, onSaved, next }: { schoolId: string; classes: ClassRow[]; onSaved: () => Promise<void>; next: () => void }) {
  const api = useOpsApi();
  const [draft, setDraft] = useState<ClassRow[]>(classes);
  const [grade, setGrade] = useState('10');
  const [sections, setSections] = useState('A, B');
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(classes); }, [classes]);

  const addGrade = () => {
    const secs = sections.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    const names = (secs.length ? secs : ['']).map(s => (s ? `${grade}-${s}` : grade));
    setDraft(d => {
      const have = new Set(d.map(c => normClass(c.name)));
      return [...d, ...names.filter(n => !have.has(normClass(n))).map(n => ({ name: n, metadata: { grade, section: n.split('-')[1] || null, subjects: suggestedSubjects(grade) } }))];
    });
  };
  const setSubjects = (i: number, subjects: string[]) => setDraft(d => d.map((c, j) => (j === i ? { ...c, metadata: { ...c.metadata, subjects } } : c)));

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await api<{ created: number; updated: number }>(`/schools/${schoolId}/classes`, {
        method: 'PUT',
        body: { classes: draft.map(c => ({ name: c.name, grade: c.metadata?.grade, section: c.metadata?.section, subjects: c.metadata?.subjects ?? [] })) },
      });
      setMsg(`Saved: ${r.created} new, ${r.updated} updated.`);
      await onSaved();
    } catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>Classes and subjects</h3>
      <p className="muted" style={{ marginBottom: 18 }}>
        Add each grade with its sections. Subjects are pre-filled from the CBSE 2026-27 curriculum for Classes 9-12 (plus languages); edit them to match the school.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <label className="lbl" htmlFor="c-grade">GRADE</label>
          <select id="c-grade" className="tin" value={grade} onChange={e => setGrade(e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(g => <option key={g} value={g}>Class {g}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="c-sec">SECTIONS</label>
          <input id="c-sec" className="tin" style={{ width: 160 }} value={sections} onChange={e => setSections(e.target.value)} placeholder="A, B, C" />
        </div>
        <button type="button" className="btn" onClick={addGrade}><Plus size={15} weight="bold" /> Add</button>
      </div>

      {draft.length === 0 ? <Empty icon={<Books size={30} weight="duotone" />} title="No classes yet">Add a grade and its sections above.</Empty> : draft.map((c, i) => (
        <div key={c.name} className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 90 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{c.name}</div>
            {!c.id && <Chip tone="a" className="xs">NEW</Chip>}
          </div>
          <SubjectEditor subjects={c.metadata?.subjects ?? []} onChange={s => setSubjects(i, s)} />
        </div>
      ))}

      <div className="acts" style={{ marginTop: 18 }}>
        <button className="btn pri" onClick={save} disabled={saving || draft.length === 0}>{saving ? 'Saving…' : 'Save classes'}</button>
        {classes.length > 0 && <button className="btn" onClick={next}>Next: add people</button>}
        {msg && <span className="muted">{msg}</span>}
      </div>
    </div>
  );
}

function SubjectEditor({ subjects, onChange }: { subjects: string[]; onChange: (s: string[]) => void }) {
  const [add, setAdd] = useState('');
  return (
    <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {subjects.map(s => (
        <button key={s} type="button" className="ch b" title={`Remove ${s}`} aria-label={`Remove ${s}`} onClick={() => onChange(subjects.filter(x => x !== s))}>{s} <X size={11} weight="bold" /></button>
      ))}
      <form onSubmit={e => { e.preventDefault(); const v = add.trim(); if (v && !subjects.includes(v)) onChange([...subjects, v]); setAdd(''); }}>
        <input className="tin" style={{ width: 150, padding: '6px 10px', fontSize: 13 }} placeholder="Add subject" value={add} onChange={e => setAdd(e.target.value)} />
      </form>
    </div>
  );
}

// ── Step 2: add people (single + bulk CSV) ───────────────────────────────────
function PeopleStep({ schoolId, classes, people, onCreated }: {
  schoolId: string; classes: ClassRow[]; people: Person[]; onCreated: (issued: Issued[]) => void;
}) {
  const api = useOpsApi();
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [one, setOne] = useState<PersonInput>({ role: 'teacher', name: '', email: '' });
  const [csv, setCsv] = useState('');
  const [rows, setRows] = useState<PersonInput[]>([]);
  const [issues, setIssues] = useState<RowIssue[]>([]);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [results, setResults] = useState<{ row: number; name: string; email: string; status: string; message?: string }[]>([]);

  const ctx = useMemo(() => ({
    classes: classes.map(c => c.name),
    existingEmails: new Set(people.map(p => p.email?.toLowerCase()).filter(Boolean)),
    existingRollNos: new Set(people.filter(p => p.custom_student_id).map(p => String(p.custom_student_id).toLowerCase())),
  }), [classes, people]);

  const detail = (r: PersonInput) => r.role === 'student' ? `${r.className} / roll ${r.rollNo}` : r.role === 'parent' ? `children: ${(r.children ?? []).join(' ')}` : r.role === 'teacher' ? (r.subjects ?? []).map(s => `${s.class} ${s.subject}`).join('; ') : '';

  const submit = async (batch: PersonInput[]) => {
    const local = validatePeople(batch, ctx);
    setIssues(local);
    if (local.length) return;
    setBusy(true); setResults([]);
    const issued: Issued[] = [];
    const all: typeof results = [];
    try {
      for (let i = 0; i < batch.length; i += BATCH) {
        const chunk = batch.slice(i, i + BATCH);
        setProgress(`Creating ${Math.min(i + BATCH, batch.length)} of ${batch.length}…`);
        try {
          const r = await api<{ results: any[] }>(`/schools/${schoolId}/people`, { method: 'POST', body: { people: chunk } });
          r.results.forEach(x => {
            all.push({ ...x, row: x.row + i });
            if (x.status === 'created') issued.push({ name: x.name, email: x.email, role: x.role, detail: detail(chunk[x.row - 1]), tempPassword: x.tempPassword });
          });
        } catch (e: any) {
          if (e.data?.issues) { setIssues(e.data.issues.map((x: RowIssue) => ({ ...x, row: x.row + i }))); break; }
          throw e;
        }
      }
    } catch (e: any) {
      setParseErr(e.message);
    } finally {
      setBusy(false); setProgress(null); setResults(all);
      if (issued.length) onCreated(issued);
    }
  };

  const preview = () => {
    const { rows: parsed, error } = parsePeopleCsv(csv);
    setParseErr(error ?? null); setRows(parsed); setIssues(error ? [] : validatePeople(parsed, ctx)); setResults([]);
  };
  const readFile = (f: File | undefined) => { if (f) f.text().then(t => { setCsv(t); setRows([]); setIssues([]); }); };

  const classOptions = classes.map(c => <option key={c.name} value={c.name}>{c.name}</option>);
  const issueFor = (row: number) => issues.filter(i => i.row === row);

  return (
    <div className="card">
      <div className="tabs" style={{ boxShadow: 'none', background: 'var(--body)' }}>
        <button className={`tab${mode === 'single' ? ' on blue' : ''}`} onClick={() => setMode('single')}>One person</button>
        <button className={`tab${mode === 'bulk' ? ' on blue' : ''}`} onClick={() => setMode('bulk')}>Bulk import (CSV)</button>
      </div>
      {classes.length === 0 && <div className="note" style={{ marginBottom: 16 }}>Set up classes first: students and teacher assignments are checked against them.</div>}

      {mode === 'single' ? (
        <form onSubmit={e => { e.preventDefault(); void submit([one]); }}>
          <div className="g2">
            <div>
              <label className="lbl" htmlFor="p-role">ROLE</label>
              <select id="p-role" className="tin" style={{ width: '100%' }} value={one.role} onChange={e => setOne({ role: e.target.value as PersonRole, name: one.name, email: one.email })}>
                {PERSON_ROLES.map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="p-name">FULL NAME</label>
              <input id="p-name" className="tin" style={{ width: '100%' }} required value={one.name} onChange={e => setOne({ ...one, name: e.target.value })} />
            </div>
            <div>
              <label className="lbl" htmlFor="p-email">EMAIL (LOGIN)</label>
              <input id="p-email" type="email" className="tin" style={{ width: '100%' }} required value={one.email} onChange={e => setOne({ ...one, email: e.target.value })} />
            </div>
            {one.role === 'student' && (<>
              <div>
                <label className="lbl" htmlFor="p-class">CLASS</label>
                <select id="p-class" className="tin" style={{ width: '100%' }} value={one.className || ''} onChange={e => setOne({ ...one, className: e.target.value })}>
                  <option value="" disabled>Choose a class</option>{classOptions}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="p-roll">ADMISSION / ROLL NO.</label>
                <input id="p-roll" className="tin mono" style={{ width: '100%' }} value={one.rollNo || ''} onChange={e => setOne({ ...one, rollNo: e.target.value })} />
              </div>
            </>)}
            {one.role === 'parent' && (
              <div>
                <label className="lbl" htmlFor="p-kids">CHILDREN&apos;S ROLL NOS.</label>
                <input id="p-kids" className="tin mono" style={{ width: '100%' }} placeholder="1042; 1043" value={(one.children ?? []).join('; ')}
                  onChange={e => setOne({ ...one, children: e.target.value.split(/[;,]/).map(s => s.trim()).filter(Boolean) })} />
              </div>
            )}
            {one.role === 'teacher' && (
              <div>
                <label className="lbl" htmlFor="p-ct">CLASS TEACHER OF (OPTIONAL)</label>
                <select id="p-ct" className="tin" style={{ width: '100%' }} value={one.classTeacherOf || ''} onChange={e => setOne({ ...one, classTeacherOf: e.target.value || undefined })}>
                  <option value="">None</option>{classOptions}
                </select>
              </div>
            )}
          </div>
          {one.role === 'teacher' && (
            <>
              <label className="lbl" style={{ marginTop: 16 }}>TEACHES</label>
              <AssignmentPicker classes={classes} value={one.subjects ?? []} onChange={s => setOne({ ...one, subjects: s })} />
            </>
          )}
          {issues.length > 0 && <div className="note err" style={{ marginTop: 14 }}>{issues.map(i => i.message).join(' · ')}</div>}
          <div className="acts" style={{ marginTop: 18 }}>
            <button className="btn pri" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
          </div>
        </form>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 12 }}>
            One person per line. Columns: <span className="mono">role, name, email, class, roll_no, subjects, class_teacher_of, children</span>.
            Subjects as <span className="mono">10-A:Mathematics; 10-B:Mathematics</span>; children as roll numbers. Students and parents can be in the same file.
          </p>
          <div className="acts" style={{ marginBottom: 10 }}>
            <button type="button" className="btn sm" onClick={() => { setCsv(CSV_TEMPLATE); setRows([]); setIssues([]); }}>Load example</button>
            <label className="btn sm" style={{ cursor: 'pointer' }}>
              <UploadSimple size={14} weight="bold" /> Choose .csv
              <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => readFile(e.target.files?.[0])} />
            </label>
          </div>
          <textarea className="qta mono" style={{ minHeight: 160, fontSize: 12.5 }} value={csv} onChange={e => { setCsv(e.target.value); setRows([]); }} placeholder={CSV_TEMPLATE} />
          <div className="acts" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={preview} disabled={!csv.trim()}>Check {csv.trim() ? 'file' : ''}</button>
            {rows.length > 0 && issues.length === 0 && (
              <button type="button" className="btn pri" disabled={busy} onClick={() => submit(rows)}>{busy ? progress : `Create ${rows.length} account${rows.length === 1 ? '' : 's'}`}</button>
            )}
          </div>
          {parseErr && <div className="note err" style={{ marginTop: 12 }}>{parseErr}</div>}
          {rows.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {issues.length > 0 && <div className="note err" style={{ marginBottom: 10 }}>{issues.length} problem{issues.length === 1 ? '' : 's'} to fix before anything is created. Nothing has been saved.</div>}
              {rows.map((r, i) => {
                const ri = issueFor(i + 1);
                return (
                  <div key={i} className="row" style={{ padding: '10px 0' }}>
                    <span className="muted mono" style={{ width: 28 }}>{i + 1}</span>
                    <Chip tone={ROLE_TONE[r.role] ?? 'r'}>{(r.role || '?').toUpperCase()}</Chip>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.name || '—'} <span className="muted">{r.email}</span></div>
                      <div className="muted" style={{ fontSize: 12 }}>{detail(r)}</div>
                      {ri.map((x, k) => <div key={k} style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700 }}>{x.field}: {x.message}</div>)}
                    </div>
                    {ri.length === 0 && <CheckCircle size={18} weight="fill" color="#10B981" />}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="note info">
            {results.filter(r => r.status === 'created').length} created{results.some(r => r.status !== 'created') ? `, ${results.filter(r => r.status !== 'created').length} failed` : ''}. Their temporary passwords are in the credentials download at the top.
          </div>
          {results.filter(r => r.status !== 'created').map(r => (
            <div key={r.row} className="note err" style={{ marginTop: 8 }}>Row {r.row} ({r.email}): {r.message}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Class x subject checkboxes, from each class's subject list. */
function AssignmentPicker({ classes, value, onChange }: { classes: ClassRow[]; value: { class: string; subject: string }[]; onChange: (v: { class: string; subject: string }[]) => void }) {
  const has = (c: string, s: string) => value.some(v => normClass(v.class) === normClass(c) && v.subject === s);
  const toggle = (c: string, s: string) => onChange(has(c, s) ? value.filter(v => !(normClass(v.class) === normClass(c) && v.subject === s)) : [...value, { class: c, subject: s }]);
  if (!classes.length) return <p className="muted">No classes set up yet.</p>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {classes.map(c => (
        <div key={c.name} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ width: 60, fontSize: 13 }}>{c.name}</b>
          {(c.metadata?.subjects ?? []).length === 0 && <span className="muted" style={{ fontSize: 12 }}>No subjects on this class</span>}
          {(c.metadata?.subjects ?? []).map(s => (
            <button key={s} type="button" className={`ch ${has(c.name, s) ? 'b' : 'n'}`} aria-pressed={has(c.name, s)} onClick={() => toggle(c.name, s)}>
              {has(c.name, s) && <Check size={11} weight="bold" />}{s}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Step 3: teacher assignments ──────────────────────────────────────────────
function TeachingStep({ schoolId, classes, people, onSaved }: { schoolId: string; classes: ClassRow[]; people: Person[]; onSaved: () => Promise<void> }) {
  const api = useOpsApi();
  const teachers = people.filter(p => p.role === 'teacher');
  const [open, setOpen] = useState<string | null>(teachers[0]?.id ?? null);
  const [edits, setEdits] = useState<Record<string, { subjects: { class: string; subject: string }[]; classTeacherOf: string | null }>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});

  // Classes with no teacher for a subject: the gap list an operator needs before handover.
  const uncovered = useMemo(() => {
    const covered = new Set(teachers.flatMap(t => (edits[t.id]?.subjects ?? t.assignments ?? []).map(a => `${normClass(a.class)}|${a.subject}`)));
    return classes.flatMap(c => (c.metadata?.subjects ?? []).filter(s => !covered.has(`${normClass(c.name)}|${s}`)).map(s => `${c.name} ${s}`));
  }, [teachers, classes, edits]);

  const save = async (t: Person) => {
    const e = edits[t.id] ?? { subjects: t.assignments ?? [], classTeacherOf: t.teacher_class };
    try {
      await api(`/schools/${schoolId}/people/${t.id}`, { method: 'PATCH', body: e });
      setMsg(m => ({ ...m, [t.id]: 'Saved.' }));
      await onSaved();
    } catch (err: any) { setMsg(m => ({ ...m, [t.id]: err.message })); }
  };

  if (!teachers.length) return <div className="card"><Empty icon={<UsersThree size={30} weight="duotone" />} title="No teachers yet">Add teachers in step 2, then assign their classes and subjects here.</Empty></div>;
  return (
    <div className="card">
      <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>Who teaches what</h3>
      <p className="muted" style={{ marginBottom: 12 }}>Teachers see homework, mastery and wellness only for the classes assigned here.</p>
      {uncovered.length > 0
        ? <div className="note" style={{ marginBottom: 14 }}><b>{uncovered.length} class subject{uncovered.length === 1 ? '' : 's'} without a teacher:</b> {uncovered.slice(0, 12).join(', ')}{uncovered.length > 12 ? '…' : ''}</div>
        : <div className="note info" style={{ marginBottom: 14 }}>Every class subject has a teacher.</div>}
      {teachers.map(t => {
        const e = edits[t.id] ?? { subjects: t.assignments ?? [], classTeacherOf: t.teacher_class };
        const set = (patch: Partial<typeof e>) => setEdits(x => ({ ...x, [t.id]: { ...e, ...patch } }));
        return (
          <div key={t.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }} onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
              <b style={{ flex: 1 }}>{t.name} <span className="muted" style={{ fontWeight: 500 }}>{t.email}</span></b>
              <span className="muted" style={{ fontSize: 12 }}>{e.subjects.length} assignment{e.subjects.length === 1 ? '' : 's'}{e.classTeacherOf ? ` · class teacher ${e.classTeacherOf}` : ''}</span>
            </button>
            {open === t.id && (
              <div style={{ marginTop: 12 }}>
                <AssignmentPicker classes={classes} value={e.subjects} onChange={s => set({ subjects: s })} />
                <div className="acts" style={{ marginTop: 12 }}>
                  <label className="muted" htmlFor={`ct-${t.id}`}>Class teacher of</label>
                  <select id={`ct-${t.id}`} className="tin" value={e.classTeacherOf || ''} onChange={ev => set({ classTeacherOf: ev.target.value || null })}>
                    <option value="">None</option>{classes.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                  <button className="btn pri" onClick={() => save(t)}>Save</button>
                  {msg[t.id] && <span className="muted">{msg[t.id]}</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 4: roster & credentials ─────────────────────────────────────────────
function RosterStep({ schoolId, people, onIssued }: { schoolId: string; people: Person[]; onIssued: (i: Issued) => void }) {
  const api = useOpsApi();
  const [filter, setFilter] = useState<'all' | PersonRole>('all');
  const [shown, setShown] = useState<Record<string, string>>({});
  const rollToName = useMemo(() => new Map(people.filter(p => p.custom_student_id).map(p => [String(p.custom_student_id), p.name])), [people]);
  const list = people.filter(p => filter === 'all' || p.role === filter);

  const reset = async (p: Person) => {
    try {
      const r = await api<{ tempPassword: string }>(`/schools/${schoolId}/people/${p.id}`, { method: 'POST', body: { action: 'reset-password' } });
      setShown(s => ({ ...s, [p.id]: r.tempPassword }));
      onIssued({ name: p.name, email: p.email, role: p.role, detail: 'password reset', tempPassword: r.tempPassword });
    } catch (e: any) { setShown(s => ({ ...s, [p.id]: `Error: ${e.message}` })); }
  };
  const detail = (p: Person) => p.role === 'student' ? `${p.student_class || 'No class'} · roll ${p.custom_student_id || '—'}`
    : p.role === 'teacher' ? `${(p.assignments ?? []).map(a => `${a.class} ${a.subject}`).join(', ') || 'No assignments'}${p.teacher_class ? ` · class teacher ${p.teacher_class}` : ''}`
      : p.role === 'parent' ? `Children: ${((p.metadata?.linkedStudents as string[]) ?? []).map(r => rollToName.get(r) ? `${rollToName.get(r)} (${r})` : r).join(', ') || 'none linked'}` : '';

  return (
    <div className="card">
      <div className="tabs" style={{ boxShadow: 'none', background: 'var(--body)' }}>
        {(['all', ...PERSON_ROLES] as const).map(r => (
          <button key={r} className={`tab${filter === r ? ' on blue' : ''}`} onClick={() => setFilter(r)}>
            {r === 'all' ? `Everyone (${people.length})` : `${r[0].toUpperCase() + r.slice(1)}s (${people.filter(p => p.role === r).length})`}
          </button>
        ))}
      </div>
      {list.length === 0 ? <Empty icon={<UsersThree size={30} weight="duotone" />} title="Nobody here yet">Add people in step 2.</Empty> : list.map(p => (
        <div key={p.id} className="row">
          <Chip tone={ROLE_TONE[p.role] ?? 'n'}><span style={{ minWidth: 56, textAlign: 'center' }}>{p.role.toUpperCase()}</span></Chip>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name} <span className="muted" style={{ fontWeight: 500 }}>{p.email}</span></div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{detail(p)}</div>
          </div>
          {p.metadata?.mustChangePassword && <Chip tone="a" title="Still on the temporary password">TEMP PASSWORD</Chip>}
          {shown[p.id]
            ? <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{shown[p.id]}</span>
            : p.role !== 'superadmin' && <button className="btn sm" onClick={() => reset(p)}><Key size={13} weight="bold" /> New password</button>}
        </div>
      ))}
    </div>
  );
}
