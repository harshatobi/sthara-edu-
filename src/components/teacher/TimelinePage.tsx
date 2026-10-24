'use client';

import { useState } from 'react';
import { ClockCounterClockwiseIcon as Clock } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useGet } from '@/components/canon/useGet';
import Timeline from '@/components/timeline/Timeline';

interface Pick { id: string; name: string; admissionNo: string }

/**
 * A student's timeline for a teacher (brief 08): pick one of your classes, then a student. The class teacher sees the
 * teaching side; a subject teacher attendance and their own subjects. The server decides.
 */
export default function TimelinePage() {
  const { data: me } = useGet<{ classes: string[] }>('/api/teacher/conduct');
  const [cls, setCls] = useState<string>('');
  const [studentId, setStudentId] = useState<string | null>(null);
  const cur = cls || me?.classes[0] || '';
  const { data: list } = useGet<{ students: Pick[] }>(cur ? `/api/teacher/conduct?cls=${encodeURIComponent(cur)}` : null);
  return (
    <>
      <PageBar eyebrow="LIVING RECORD" title="Student timelines" sub="Every school year of a student you teach: attendance, results, mastery and homework, as your role allows." />
      {!me ? <div className="card"><Skeleton h={20} /></div> : !me.classes.length ? (
        <div className="card"><Empty icon={<Clock size={26} weight="duotone" />} title="No classes yet">Once the school sets what you teach, your students appear here.</Empty></div>
      ) : (
        <div className="tl-pick">
          <div className="card">
            <label className="tl-k" htmlFor="tlp-cls">CLASS</label>
            <select id="tlp-cls" className="cmp-in" value={cur} onChange={e => { setCls(e.target.value); setStudentId(null); }} style={{ marginTop: 6, marginBottom: 12 }}>
              {me.classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {!list ? [0, 1, 2].map(i => <Skeleton key={i} h={16} style={{ marginBottom: 10 }} />) : !list.students.length ? <p className="muted" style={{ fontSize: 13.5 }}>No students on this class’s register.</p> : (
              <ul className="tl-roster">{list.students.map(s => (
                <li key={s.id}><button className={studentId === s.id ? 'on' : ''} aria-pressed={studentId === s.id} onClick={() => setStudentId(s.id)}><b>{s.name}</b><span className="muted mono">{s.admissionNo}</span></button></li>
              ))}</ul>
            )}
          </div>
          <div>{studentId ? <Timeline key={studentId} query={`studentId=${studentId}`} /> : <div className="card"><Empty icon={<Clock size={26} weight="duotone" />} title="Pick a student" /></div>}</div>
        </div>
      )}
    </>
  );
}
