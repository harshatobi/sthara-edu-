'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LifebuoyIcon as Lifebuoy } from '@phosphor-icons/react/dist/ssr/Lifebuoy';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { SlidersHorizontalIcon as SlidersHorizontal } from '@phosphor-icons/react/dist/ssr/SlidersHorizontal';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { Pager, usePaged } from '@/components/canon/Pager';
import { PRIORITIES, PRIORITY_LABEL, QUEUES, QUEUE_LABEL, SOURCES, type CaseStatus, type Priority, type Queue, type SlaState } from '@/lib/ops/desk';
import { Table, errText, fmtDateTime, num } from '../_ui';
import { useOpsApi } from '../useOpsApi';
import { CaseStatusChip, PriorityChip, SlaChip } from './parts';

interface Row {
  id: string; number: number; subject: string; category: string; priority: Priority; status: CaseStatus; school: string; schoolId: string;
  raisedByName: string | null; owner: string | null; createdAt: string; updatedAt: string; reopened: number; awaitingSthara: boolean; sla: SlaState;
}
interface Data {
  queue: Queue; counts: Record<Queue, number>; cases: Row[];
  categories: { key: string; label: string; active: boolean }[];
  schools: { id: string; name: string; code: string | null }[];
  can: { work: boolean; admin: boolean };
}

/** Platform Manager > Service desk: every case from every school in sight, most pressing first. */
export default function DeskConsole() {
  const api = useOpsApi();
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue>('open');
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api<Data>(`/desk?queue=${queue}${applied ? `&q=${encodeURIComponent(applied)}` : ''}`).then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api, queue, applied]);
  useEffect(() => { load(); }, [load]);
  const label = (key: string) => d?.categories.find(c => c.key === key)?.label ?? key;

  const { shown: casePage, pager: casePager } = usePaged(d?.cases ?? [], `${queue}|${applied}`);
  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Service desk"
        sub={d ? `${num(d.counts.open)} open · ${num(d.counts.unassigned)} unassigned · ${num(d.counts.breaching)} late or nearly` : 'Loading…'}
        actions={<>
          <Link className="btn" href="/ops/desk/settings"><SlidersHorizontal size={15} weight="bold" /> Deadlines and replies</Link>
          {d?.can.work && <button className="btn pri" onClick={() => setCreating(c => !c)}><Plus size={15} weight="bold" /> Log a case</button>}
        </>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {creating && d && <NewCase d={d} onCancel={() => setCreating(false)} onCreated={id => router.push(`/ops/desk/${id}`)} />}

      <div className="seg" role="tablist" aria-label="Queue" style={{ marginBottom: 14 }}>
        {QUEUES.map(k => (
          <button key={k} role="tab" aria-selected={queue === k} className={queue === k ? 'on' : ''} onClick={() => setQueue(k)}>
            {QUEUE_LABEL[k]}{d ? <span className="muted" style={{ marginLeft: 6, fontWeight: 600 }}>{d.counts[k]}</span> : null}
          </button>
        ))}
      </div>
      <form className="ops-filters" onSubmit={e => { e.preventDefault(); setApplied(q.trim()); }}>
        <input className="cmp-in" style={{ flex: '1 1 320px', width: 'auto' }} placeholder="Case number, subject, school or who raised it" aria-label="Search cases" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn">Search</button>
      </form>

      <div className="card">
        {!d ? [0, 1, 2].map(i => <Skeleton key={i} h={52} style={{ marginBottom: 10 }} />) : (
          <Table head={<tr><th>Case</th><th>School</th><th>Priority</th><th>Status</th><th>Deadline</th><th>Owner</th><th>Raised</th></tr>}
            empty={!d.cases.length && <Empty icon={<Lifebuoy size={28} weight="duotone" />} title={applied ? 'No case matches' : 'Nothing in this queue'}>{queue === 'open' && !applied ? 'Schools raise cases from Help and support in their office portal.' : undefined}</Empty>}>
            {casePage.map(c => (
              <tr key={c.id} className="click" onClick={() => router.push(`/ops/desk/${c.id}`)}>
                <td style={{ minWidth: 260 }}>
                  <div className="nm"><span className="mono" style={{ fontSize: 12.5 }}>CASE-{c.number}</span> {c.subject}</div>
                  <div className="sub">{label(c.category)}{c.raisedByName ? ` · ${c.raisedByName}` : ''}{c.reopened ? ` · reopened ${c.reopened === 1 ? 'once' : `${c.reopened} times`}` : ''}</div>
                </td>
                <td style={{ maxWidth: 220 }}>{c.school}</td>
                <td><PriorityChip p={c.priority} /></td>
                <td><CaseStatusChip s={c.status} />{c.awaitingSthara && <> <Chip tone="r" title="The school has written since Sthara last replied">SCHOOL REPLIED</Chip></>}</td>
                <td><SlaChip sla={c.sla} /></td>
                <td>{c.owner ?? <span className="muted">Unassigned</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(c.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
        <Pager {...casePager} noun="cases" />
      </div>
    </>
  );
}

function NewCase({ d, onCancel, onCreated }: { d: Data; onCancel: () => void; onCreated: (id: string) => void }) {
  const api = useOpsApi();
  const [f, setF] = useState({ schoolId: '', subject: '', description: '', category: 'other', priority: 'normal' as Priority, source: 'phone', raisedByName: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { onCreated((await api<{ id: string }>('/desk', { method: 'POST', body: f })).id); } catch (x) { setErr(errText(x)); setBusy(false); }
  };
  return (
    <form className="card" style={{ marginBottom: 18 }} onSubmit={submit}>
      <div className="ops-sec-hd"><div>
        <h2 style={{ fontSize: 17, fontWeight: 800 }}>Log a case for a school</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>For something that reached you by phone, email or WhatsApp. It is yours until you hand it on. The school sees the case, not this description.</p>
      </div></div>
      <div className="g2">
        <div>
          <label className="lbl" htmlFor="c-school">SCHOOL</label>
          <select id="c-school" className="cmp-sel" required value={f.schoolId} onChange={e => set('schoolId', e.target.value)}>
            <option value="">Pick a school</option>
            {d.schools.map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="c-who">WHO AT THE SCHOOL ASKED</label>
          <input id="c-who" className="cmp-in" maxLength={120} value={f.raisedByName} onChange={e => set('raisedByName', e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="c-subject">SUBJECT</label>
          <input id="c-subject" className="cmp-in" required minLength={4} maxLength={160} value={f.subject} onChange={e => set('subject', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div>
            <label className="lbl" htmlFor="c-cat">CATEGORY</label>
            <select id="c-cat" className="cmp-sel" value={f.category} onChange={e => set('category', e.target.value)}>
              {d.categories.filter(c => c.active).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="c-pri">PRIORITY</label>
            <select id="c-pri" className="cmp-sel" value={f.priority} onChange={e => set('priority', e.target.value as Priority)}>
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="c-src">CAME IN BY</label>
            <select id="c-src" className="cmp-sel" value={f.source} onChange={e => set('source', e.target.value)}>
              {Object.entries(SOURCES).filter(([k]) => k !== 'school_portal').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
      </div>
      <label className="lbl" htmlFor="c-desc" style={{ marginTop: 16 }}>WHAT IS HAPPENING</label>
      <textarea id="c-desc" className="cmp-in" rows={4} required maxLength={8000} value={f.description} onChange={e => set('description', e.target.value)} />
      {err && <div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 16 }}>
        <button className="btn pri" disabled={busy}>{busy ? 'Logging…' : 'Log the case'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
