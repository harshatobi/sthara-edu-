'use client';

import { CalendarDotsIcon as CalendarDots } from '@phosphor-icons/react/dist/ssr/CalendarDots';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useAuth } from '@/contexts/AuthContext';
import { isoDay, plural } from '@/lib/admin/format';
import { teacherLoad } from '@/lib/schedule/engine';
import { useSchedule } from '@/lib/schedule/useSchedule';
import MySchedule, { gridVersion } from './MySchedule';

/** A teacher's own schedule (mockup-style canon page): day, week, month, the weekly timetable, and any class or room's timetable. */
export default function TeacherSchedule() {
  const { profile } = useAuth();
  const { rows, error, call, reload } = useSchedule();
  const uid = profile?.uid;
  const gv = rows ? gridVersion(rows, isoDay()) : null;
  const load = rows && gv && uid ? teacherLoad(rows.slots.filter(s => s.version_id === gv.id)).get(uid) ?? 0 : null;

  return (
    <>
      <PageBar eyebrow="MY SCHEDULE" title="Your week"
        sub={load !== null ? `${plural(load, 'period')} a week on ${gv!.name}` : 'Periods, duties, meetings and leave in one place'} />
      {error ? <div className="note err" role="alert">Couldn&apos;t load the schedule: {error}</div>
        : !rows || !uid ? <div className="card" aria-busy="true">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={48} style={{ marginBottom: 12 }} />)}</div>
          : rows.missing.includes('timetable_versions')
            ? <div className="card"><Empty icon={<CalendarDots size={26} weight="duotone" />} title="Scheduling isn't switched on yet">Your school&apos;s timetable shows here once scheduling is set up.</Empty></div>
            : <MySchedule rows={rows} who={{ kind: 'teacher', userId: uid }} schoolName={rows.schoolName} title={profile?.name || 'My timetable'}
              onFlag={async (coverId, note) => { await call('/api/teacher/cover', 'PUT', { coverId, note }); reload(); }} />}
    </>
  );
}
