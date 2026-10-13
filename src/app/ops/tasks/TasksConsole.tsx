'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckSquareIcon as CheckSquare } from '@phosphor-icons/react/dist/ssr/CheckSquare';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import { Section, Table, errText, fmtDate, num } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Task {
  id: string; title: string; note: string | null; dueOn: string | null; priority: 'high' | 'normal' | 'low'; status: string; doneAt: string | null;
  schoolId: string | null; school: string | null; caseId: string | null; caseRef: string | null; owner: string | null; due: 'overdue' | 'today' | 'upcoming' | 'no_date';
}
interface Data { view: string; open: Task[]; done: Task[]; counts: { overdue: number; today: number }; hasTeam: boolean; canWrite: boolean }
const DUE: Record<Task['due'], { t: string; tone: Tone }> = { overdue: { t: 'OVERDUE', tone: 'r' }, today: { t: 'TODAY', tone: 'a' }, upcoming: { t: 'UPCOMING', tone: 'b' }, no_date: { t: 'NO DATE', tone: 'n' } };

/** Platform Manager > Follow-ups: what you (or your team) owe the schools, most overdue first. */
export default function TasksConsole() {
  const api = useOpsApi();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<'mine' | 'team' | 'all'>('mine');
  const load = useCallback(() => {
    api<Data>(`/tasks?view=${view}`).then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api, view]);
  useEffect(() => { load(); }, [load]);
  const setStatus = async (id: string, status: string) => {
    try { await api('/tasks', { method: 'PATCH', body: { id, status } }); load(); } catch (e) { setErr(errText(e)); }
  };
  const row = (t: Task, finished = false) => (
    <tr key={t.id} style={finished ? { opacity: .65 } : undefined}>
      <td style={{ minWidth: 260 }}><div className="nm">{t.title}{t.priority === 'high' && !finished && <> <Chip tone="r">HIGH</Chip></>}</div>{t.note && <div className="sub" style={{ whiteSpace: 'pre-wrap' }}>{t.note}</div>}</td>
      <td>{t.schoolId ? <Link href={`/ops/schools/${t.schoolId}?tab=crm`} style={{ color: 'var(--blue)' }}>{t.school}</Link> : '—'}{t.caseId && <div className="sub"><Link href={`/ops/desk/${t.caseId}`} className="mono" style={{ color: 'var(--blue)' }}>{t.caseRef}</Link></div>}</td>
      <td style={{ whiteSpace: 'nowrap' }}>{finished ? (t.status === 'done' ? `Done ${fmtDate(t.doneAt)}` : 'Cancelled') : <>{t.dueOn ? fmtDate(t.dueOn) : ''} <Chip tone={DUE[t.due].tone}>{DUE[t.due].t}</Chip></>}</td>
      <td>{t.owner ?? <span className="muted">Nobody</span>}</td>
      {d?.canWrite && <td>{finished ? <button className="btn sm" onClick={() => setStatus(t.id, 'open')}>Reopen</button> : <span className="acts" style={{ gap: 6 }}><button className="btn sm pri" onClick={() => setStatus(t.id, 'done')}>Done</button><button className="btn sm" onClick={() => setStatus(t.id, 'cancelled')}>Cancel</button></span>}</td>}
    </tr>
  );
  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Follow-ups"
        sub={d ? `${num(d.open.length)} open · ${num(d.counts.overdue)} overdue · ${num(d.counts.today)} due today. Add one from a school's Relationship tab.` : 'Loading…'} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      <div className="seg" role="tablist" aria-label="Whose" style={{ marginBottom: 18 }}>
        <button role="tab" aria-selected={view === 'mine'} className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}>Mine</button>
        {d?.hasTeam && <button role="tab" aria-selected={view === 'team'} className={view === 'team' ? 'on' : ''} onClick={() => setView('team')}>My team&apos;s</button>}
        <button role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>Everyone&apos;s</button>
      </div>
      {!d ? <div className="card"><Skeleton h={160} /></div> : (
        <>
          <Section title="Open">
            <Table head={<tr><th>Follow-up</th><th>School</th><th>Due</th><th>Owner</th>{d.canWrite && <th aria-label="Actions" />}</tr>}
              empty={!d.open.length && <Empty icon={<CheckSquare size={28} weight="duotone" />} title="Nothing owed" />}>
              {d.open.map(t => row(t))}
            </Table>
          </Section>
          {d.done.length > 0 && (
            <Section title="Recently finished">
              <Table head={<tr><th>Follow-up</th><th>School</th><th>Outcome</th><th>Owner</th>{d.canWrite && <th aria-label="Actions" />}</tr>}>{d.done.map(t => row(t, true))}</Table>
            </Section>
          )}
        </>
      )}
    </>
  );
}
