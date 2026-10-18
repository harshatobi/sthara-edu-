'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { FlaskIcon as Flask } from '@phosphor-icons/react/dist/ssr/Flask';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { practicalsForClass } from '@/lib/lab/practicals';
import { usePracticalClass, useProgress } from './usePracticals';
import Tracker from './Tracker';
import '@/styles/lab.css';

/** The class's CBSE practicals: the list, and the tracker with the Subject Enrichment marks. */
export default function PracticalsHome() {
  const { desk, options, target, choose, students, loading } = usePracticalClass();
  const sp = useSearchParams(), router = useRouter(), path = usePathname();
  const tab = sp.get('tab') === 'tracker' ? 'tracker' : 'list';
  const setTab = (t: string) => { const q = new URLSearchParams(sp.toString()); q.set('tab', t); router.replace(`${path}?${q}`); };
  const practicals = target ? practicalsForClass(target.cls) : [];
  const { rows } = useProgress(target?.cls ?? null, target?.subject ?? null);

  return (
    <>
      <PageBar eyebrow="LIVE LAB · PRACTICALS" title="CBSE practicals"
        sub="The official Class 9 and 10 Science practicals: rehearse each on the board, print every student their own readings, track records and viva, and send the Subject Enrichment mark to Exams."
        actions={<Link className="btn" href="/teacher/lab"><ArrowLeft size={15} weight="bold" /> Live Lab</Link>} />
      {loading ? <Skeleton h={200} /> : !options.length ? (
        <Empty icon={<Flask size={28} weight="duotone" />} title="No Class 9 or 10 science class yet">Practicals appear here for the Class 9 and 10 science classes you teach.</Empty>
      ) : target && (
        <>
          <div className="prx-bar">
            <div className="lab-ctl" style={{ minWidth: 240 }}>
              <label htmlFor="prx-class">Class</label>
              <select id="prx-class" value={target.key} onChange={e => choose(e.target.value)}>{options.map(o => <option key={o.key} value={o.key}>{o.cls} · {o.subject}</option>)}</select>
            </div>
            <div className="seg" role="tablist" aria-label="View">
              <button role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>Practicals ({practicals.length})</button>
              <button role="tab" aria-selected={tab === 'tracker'} className={tab === 'tracker' ? 'on' : ''} onClick={() => setTab('tracker')}>Tracker and marks</button>
            </div>
          </div>
          {tab === 'list' ? (
            <div className="lab-grid">
              {practicals.map(p => {
                const done = (rows ?? []).filter(r => r.practical === p.id && r.done_on).length;
                return (
                  <Link key={p.id} className="lab-card" href={`/teacher/lab/practicals/${p.id}?class=${encodeURIComponent(target.key)}`}>
                    <span className="prx-no">{p.no}</span>
                    <h3>{p.title}</h3>
                    <p>{p.aim}</p>
                    <div className="lab-chips">
                      <span className="lab-chip">{p.chapter}</span>
                      <span className="lab-chip">{p.kind === 'numeric' ? 'Readings and result' : 'Observation'}</span>
                      {rows && students.length > 0 && <span className="lab-chip">{done} of {students.length} done</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : desk && <Tracker target={target} practicals={practicals} students={students} call={desk.call} />}
        </>
      )}
    </>
  );
}
