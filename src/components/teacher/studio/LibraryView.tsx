'use client';

import { useEffect, useMemo, useState } from 'react';
import { SealCheckIcon as SealCheck } from '@phosphor-icons/react/dist/ssr/SealCheck';
import { ClockIcon as Clock } from '@phosphor-icons/react/dist/ssr/Clock';
import { Skeleton } from '@/components/canon/ui';
import { useStudioApi } from './api';
import { KIND_LABEL, StatusChip } from './HomeView';

interface Row {
  id: string; teacher: string; teacher_id: string; class: string; subject: string; chapter_name: string | null; kind: string; title: string;
  status: string; share: string; common_test: boolean; moderation: string; handedIn: number; graded: number; average: number | null; updated_at: string; assignment_ids: string[];
}

/** My materials, or the department's shared ones (with what's waiting for the subject lead). */
export default function LibraryView({ view, cls, subject, onOpen, onAnalysis }: { view: 'mine' | 'department'; cls: string; subject: string; onOpen: (id: string) => void; onAnalysis?: (assignmentId: string) => void }) {
  const api = useStudioApi();
  const [got, setGot] = useState<{ key: string; rows: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [allClasses, setAllClasses] = useState(false);
  const query = new URLSearchParams({ view, subject, ...(allClasses || view === 'department' ? {} : { class: cls }) }).toString();
  useEffect(() => {
    let live = true;
    api<{ materials: Row[] }>(`/api/teacher/studio/materials?${query}`)
      .then(r => { if (live) setGot({ key: query, rows: r.materials }); }).catch(e => { if (live) setError(e?.message); });
    return () => { live = false; };
  }, [api, query]);
  const rows = got?.key === query ? got.rows : null;
  const shown = useMemo(() => (rows ?? []).filter(r => !q || `${r.title} ${r.chapter_name ?? ''} ${r.teacher}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const pending = shown.filter(r => r.moderation === 'pending');

  return (
    <section className="sd-card sd-pad" aria-label={view === 'mine' ? 'My materials' : 'Department'}>
      <div className="sd-hd">
        <div><h2>{view === 'mine' ? 'My materials' : `${subject} department`}</h2>
          <p>{view === 'mine' ? 'Everything you made, with how it went.' : 'Shared by teachers of this subject. Open one to use it or make your own copy.'}</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {view === 'mine' && <label style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={allClasses} onChange={e => setAllClasses(e.target.checked)} /> All my classes</label>}
          <input className="cmp-in" style={{ width: 220 }} placeholder="Search" aria-label="Search materials" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      {error ? <div className="note err" role="alert">{error}</div> : !rows ? <Skeleton h={220} /> : (
        <>
          {view === 'department' && pending.length > 0 && (
            <div className="note info" style={{ marginBottom: 10 }}><Clock size={14} weight="bold" /> {pending.length} waiting for the subject lead&apos;s approval.</div>
          )}
          {shown.length ? (
            <table className="sd-tbl">
              <thead><tr><th>MATERIAL</th><th>STATUS</th><th>HOW IT WENT</th><th /></tr></thead>
              <tbody>{shown.map(r => (
                <tr key={r.id}>
                  <td><b>{r.title}</b><small>{KIND_LABEL[r.kind] ?? r.kind}, {r.class}{view === 'department' ? `, by ${r.teacher}` : ''}</small></td>
                  <td style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <StatusChip status={r.status} />
                    {r.moderation === 'approved' && <span className="sd-chip t"><SealCheck size={13} weight="bold" /> Approved</span>}
                    {r.moderation === 'pending' && <span className="sd-chip a"><Clock size={13} weight="bold" /> Awaiting approval</span>}
                    {r.moderation === 'changes_requested' && <span className="sd-chip r">Changes asked</span>}
                    {r.common_test && <span className="sd-chip">Common test</span>}
                  </td>
                  <td>{r.handedIn ? <>{r.handedIn} handed in{r.average !== null ? <>, average <b className="mono" style={{ display: 'inline' }}>{r.average}%</b></> : ''}</> : <span className="sd-mut">Not used yet</span>}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {onAnalysis && r.handedIn > 0 && r.assignment_ids?.length > 0 && <button className="btn sm" style={{ marginRight: 6 }} onClick={() => onAnalysis(r.assignment_ids[r.assignment_ids.length - 1])}>How it went</button>}
                    <button className="btn sm" onClick={() => onOpen(r.id)}>Open</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="sd-mut" style={{ fontSize: 14 }}>{view === 'mine' ? 'Nothing here yet. Things you make in the Studio are saved here.' : 'Nothing shared with the department yet.'}</p>}
        </>
      )}
    </section>
  );
}
