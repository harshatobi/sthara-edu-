'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExamIcon as Exam } from '@phosphor-icons/react/dist/ssr/Exam';
import { LockOpenIcon as LockOpen } from '@phosphor-icons/react/dist/ssr/LockOpen';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { CardHead, DeskGate, Kpi } from '@/components/admin/kit';
import ReportCard from '@/components/exams/ReportCard';
import type { AdminDesk } from '@/lib/admin/desk';
import { fmtDate } from '@/lib/admin/format';
import type { Assessment, GradeBand, Rules, Scheme, Term } from '@/lib/exams/engine';
import type { ReportCardSnapshot } from '@/lib/exams/card';
import { useApi, type Call } from '@/lib/exams/useApi';
import ClassTermView from './ClassTerm';
import Setup from './Setup';
import CardSettingsView from './CardSettings';
import '@/styles/exams.css';
import '@/styles/schedule.css';

export interface ExamClass { id: string; name: string; grade: number | null; classTeacherId: string | null; classTeacher: string | null; students: number }
export interface ExamsData {
  session: string; today: string; current: string; sessions: string[];
  can: { manage: boolean; publish: boolean; hold: boolean };
  presets: { key: string; label: string; grades: number[]; summary: string }[];
  schemes: (Scheme & { schoolId: string })[];
  terms: (Term & { schemeId: string })[];
  assessments: (Assessment & { schemeId: string })[];
  classes: ExamClass[];
  subjectsByGrade: Record<string, { key: string; name: string }[]>;
  sheets: { id: string; assessmentId: string; classId: string; classSubjectId: string; status: 'open' | 'submitted' | 'locked' }[];
  classTerms: { termId: string; classId: string; id: string | null; status: 'open' | 'reviewed' | 'published'; version: number; publishedAt: string | null; reopenReason: string | null }[];
  settings: { logo: string | null; accent: string; affiliation: string | null; address: string | null; signatures: string[]; holdOnDues: boolean; holdMinAmount: number };
}
export type Toast = (m: string) => void;
export type { GradeBand, Rules };

type Tab = 'progress' | 'setup' | 'card';
const TABS: [Tab, string][] = [['progress', 'Marks and publishing'], ['setup', 'Assessment schemes'], ['card', 'Report card']];

export default function ExamsPage() {
  return <DeskGate need={['exams.read', 'exams.manage', 'exams.publish']}>{desk => <Exams desk={desk} />}</DeskGate>;
}

/** The exam cell: assessment schemes, marks entry progress, review and publishing, and the report card's look. */
function Exams({ desk }: { desk: AdminDesk }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = TABS.find(t => t[0] === params.get('tab'))?.[0] ?? 'progress';
  const [session, setSession] = useState<string | null>(null);
  const { data, error, reload, call } = useApi<ExamsData>(`/api/admin/exams${session ? `?session=${session}` : ''}`);
  const [toast, toastEl] = useToast(3600);
  const [printSet, setPrintSet] = useState<ReportCardSnapshot[]>([]);
  const go = (t: Tab) => router.replace(`/admin/exams?tab=${t}`, { scroll: false });
  return (
    <>
      {toastEl}
      <PageBar eyebrow="EXAMS & REPORT CARDS" title="Exams and report cards"
        sub="Assessment schemes, marks entry by subject teachers, the class teacher's review, and publishing report cards to families."
        actions={data && data.sessions.length > 1 ? (
          <select className="sch-sel" aria-label="Session" value={data.session} onChange={e => setSession(e.target.value)}>
            {data.sessions.map(s => <option key={s} value={s}>Session {s}</option>)}
          </select>
        ) : undefined} />
      <div className="tabs" role="tablist" aria-label="Exams">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => go(k)}>{l}</button>)}
      </div>
      {error ? <div className="note err" role="alert">Couldn&apos;t load exams: {error}</div>
        : !data ? <div className="card" aria-busy="true">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 12 }} />)}</div> : <>
          {tab === 'progress' && <Progress data={data} call={call} reload={reload} toast={toast} goSetup={() => go('setup')} schoolName={desk.school.name} onPrint={setPrintSet} />}
          {tab === 'setup' && <Setup data={data} call={call} reload={reload} toast={toast} />}
          {tab === 'card' && <CardSettingsView data={data} call={call} reload={reload} toast={toast} schoolName={desk.school.name} />}
        </>}
      <div className="rc-print">{printSet.map(c => <ReportCard key={c.student.id} card={c} />)}</div>
    </>
  );
}

const CT_LABEL = { open: ['IN PROGRESS', 'n'], reviewed: ['REVIEWED', 'b'], published: ['PUBLISHED', 'g'] } as const;

function Progress({ data, call, reload, toast, goSetup, schoolName, onPrint }: {
  data: ExamsData; call: Call; reload: () => void; toast: Toast; goSetup: () => void; schoolName: string; onPrint: (c: ReportCardSnapshot[]) => void;
}) {
  const active = data.schemes.filter(s => s.status === 'active');
  const [schemeId, setSchemeId] = useState<string | null>(null);
  const scheme = active.find(s => s.id === schemeId) ?? active[0] ?? null;
  const terms = data.terms.filter(t => t.schemeId === scheme?.id).sort((a, b) => a.seq - b.seq);
  // Default to the term running today, else the latest that has started.
  const [termId, setTermId] = useState<string | null>(null);
  const term = terms.find(t => t.id === termId) ?? terms.find(t => t.startsOn <= data.today && t.endsOn >= data.today) ?? [...terms].reverse().find(t => t.startsOn <= data.today) ?? terms[0] ?? null;
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  if (!active.length) {
    return (
      <div className="card">
        <Empty icon={<Exam size={26} weight="duotone" />} title={`No assessment scheme for ${data.session} yet`}>
          {data.can.manage ? <>Start from a Sthara CBSE preset for each stage (foundational, primary, middle, secondary, senior), then adjust it. <button className="btn sm pri" style={{ marginTop: 12 }} onClick={goSetup}>Set up schemes</button></>
            : 'The exam cell (academic coordinator) sets up the assessment schemes.'}
        </Empty>
      </div>
    );
  }

  const classes = data.classes.filter(c => c.grade !== null && scheme!.grades.includes(c.grade)).sort((a, b) => (a.grade! - b.grade!) || a.name.localeCompare(b.name, 'en', { numeric: true }));
  const termAs = term ? data.assessments.filter(a => a.termId === term.id).sort((a, b) => a.seq - b.seq) : [];
  const ctOf = (classId: string) => data.classTerms.find(c => c.termId === term?.id && c.classId === classId);
  const cell = (aId: string, classId: string) => {
    const xs = data.sheets.filter(s => s.assessmentId === aId && s.classId === classId);
    return { total: xs.length, done: xs.filter(s => s.status !== 'open').length };
  };
  const unopened = termAs.filter(a => !data.sheets.some(s => s.assessmentId === a.id));
  const statuses = classes.map(c => ctOf(c.id)?.status ?? 'open');
  const reviewed = classes.filter(c => ctOf(c.id)?.status === 'reviewed');

  const openFor = async (ids: string[]) => {
    setBusy(true);
    try { const r = await call<{ created: number }>('/api/admin/exams', 'POST', { action: 'open', assessmentIds: ids }); toast(r.created ? `Opened ${r.created} marks sheet${r.created === 1 ? '' : 's'}. Subject teachers can enter marks now.` : 'Those sheets were already open.'); reload(); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const publish = async (classIds: string[]) => {
    if (!term) return;
    setBusy(true);
    try {
      const r = await call<{ done: { cls: string; published: number; held: number }[]; failed: { cls: string; error: string }[] }>('/api/admin/exams', 'POST', { action: 'publish', termId: term.id, classIds });
      const n = r.done.reduce((s, d) => s + d.published, 0), held = r.done.reduce((s, d) => s + d.held, 0);
      toast(r.failed.length ? `Published ${r.done.length} class${r.done.length === 1 ? '' : 'es'}. ${r.failed.map(f => `${f.cls}: ${f.error}`).join(' ')}` : `Published ${n} report cards in ${r.done.length} class${r.done.length === 1 ? '' : 'es'}${held ? `, ${held} held for fees` : ''}. Families have been told.`);
      setPicked(new Set());
      reload();
    } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="sch-bar">
        {active.length > 1 && (
          <select className="sch-sel" aria-label="Scheme" value={scheme!.id} onChange={e => { setSchemeId(e.target.value); setTermId(null); setPicked(new Set()); }}>
            {active.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {terms.length > 0 && (
          <div className="tabs" role="tablist" aria-label="Term" style={{ marginBottom: 0 }}>
            {terms.map(t => <button key={t.id} role="tab" aria-selected={t.id === term?.id} className={`tab${t.id === term?.id ? ' on blue' : ''}`} onClick={() => { setTermId(t.id); setPicked(new Set()); }}>{t.name}</button>)}
          </div>
        )}
      </div>

      {term && <>
        <div className="kpis">
          <Kpi label="CLASSES" value={classes.length} note={`${classes.reduce((s, c) => s + c.students, 0)} students`} />
          <Kpi label="SHEETS SUBMITTED" value={(() => { const xs = data.sheets.filter(s => termAs.some(a => a.id === s.assessmentId)); return xs.length ? `${Math.round((xs.filter(s => s.status !== 'open').length / xs.length) * 100)}%` : '—'; })()}
            note={unopened.length ? `${unopened.length} assessment${unopened.length === 1 ? '' : 's'} not opened` : 'Every assessment is open'} noteColor={unopened.length ? 'var(--amber)' : undefined} />
          <Kpi label="REVIEWED" value={statuses.filter(s => s === 'reviewed').length} note="Waiting for the principal" />
          <Kpi label="PUBLISHED" value={statuses.filter(s => s === 'published').length} note={`of ${classes.length} classes`} valueColor={statuses.every(s => s === 'published') ? 'var(--green)' : undefined} />
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <CardHead title={`${term.name}: marks by class`} sub={`${fmtDate(term.startsOn)} to ${fmtDate(term.endsOn)}. Each cell is the subjects submitted out of the subjects assessed. Open a class to see its sheets, review and publish.`}
            right={<div className="hr-acts">
              {data.can.manage && unopened.length > 0 && <button className="btn sm pri" disabled={busy} onClick={() => openFor(unopened.map(a => a.id))}><LockOpen size={14} weight="bold" /> Open marks entry ({unopened.map(a => a.code).join(', ')})</button>}
              {data.can.publish && reviewed.length > 0 && <button className="btn sm pri" disabled={busy || !picked.size} onClick={() => publish([...picked])}>Publish {picked.size || ''} selected</button>}
            </div>} />
          {termAs.length === 0 ? <Empty icon={<Exam size={26} weight="duotone" />} title="No assessments in this term">Add them under Assessment schemes.</Empty> : (
            <div className="tbl-wrap">
              <table className="ex-board">
                <thead>
                  <tr>
                    {data.can.publish && <th aria-label="Select" />}
                    <th>Class</th><th>Class teacher</th>
                    {termAs.map(a => <th key={a.id} title={a.name}>{a.code}</th>)}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(c => {
                    const ct = ctOf(c.id);
                    const st = ct?.status ?? 'open';
                    return (
                      <tr key={c.id} className="hr-row" tabIndex={0} onClick={() => setOpen(c.id)} onKeyDown={e => { if (e.key === 'Enter') setOpen(c.id); }}>
                        {data.can.publish && <td onClick={e => e.stopPropagation()}>
                          {st === 'reviewed' && <input type="checkbox" aria-label={`Publish ${c.name}`} checked={picked.has(c.id)} onChange={e => { const n = new Set(picked); if (e.target.checked) n.add(c.id); else n.delete(c.id); setPicked(n); }} />}
                        </td>}
                        <th scope="row">{c.name}</th>
                        <td className="muted">{c.classTeacher ?? 'None set'}</td>
                        {termAs.map(a => {
                          const x = cell(a.id, c.id);
                          if (!x.total) return <td key={a.id}><span className="ex-pill n">not open</span></td>;
                          const tone = x.done === x.total ? 'g' : x.done ? 'a' : 'n';
                          return <td key={a.id}><span className={`ex-pill ${tone}`}>{x.done}/{x.total}</span></td>;
                        })}
                        <td><span className={`ex-pill ${CT_LABEL[st][1]}`}>{CT_LABEL[st][0]}{ct && ct.version > 1 ? ` v${ct.version}` : ''}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>}
      {!term && <div className="card"><Empty icon={<Exam size={26} weight="duotone" />} title="No terms in this scheme">Add a term under Assessment schemes.</Empty></div>}
      {open && term && <ClassTermView data={data} classId={open} term={term} call={call} toast={toast} onChanged={reload} onClose={() => setOpen(null)} schoolName={schoolName} onPrint={onPrint} />}
    </>
  );
}
