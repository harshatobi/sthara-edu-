'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDotsIcon as CalendarDots } from '@phosphor-icons/react/dist/ssr/CalendarDots';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { DeskGate } from '@/components/admin/kit';
import type { AdminDesk } from '@/lib/admin/desk';
import type { Perm } from '@/lib/admin/rbac';
import { useSchedule } from '@/lib/schedule/useSchedule';
import MySchedule from '@/components/schedule/MySchedule';
import TimetableTab from './TimetableTab';
import SetupTab from './SetupTab';
import CalendarTab from './CalendarTab';
import StaffTab from './StaffTab';
import CoverTab from './CoverTab';
import DutiesTab from './DutiesTab';
import '@/styles/schedule.css';

type Tab = 'mine' | 'cover' | 'duties' | 'timetable' | 'setup' | 'calendar' | 'staff';
const TABS: { key: Tab; label: string; see: Perm[] }[] = [
  { key: 'mine', label: 'My schedule', see: [] },
  { key: 'cover', label: 'Cover', see: ['schedule.academic'] },
  { key: 'duties', label: 'Duties', see: ['schedule.workforce', 'schedule.academic'] },
  { key: 'timetable', label: 'Timetable', see: ['schedule.academic', 'academics.read'] },
  { key: 'calendar', label: 'Calendar', see: [] },
  { key: 'setup', label: 'Bells & rooms', see: ['schedule.academic'] },
  { key: 'staff', label: 'Staff register', see: ['schedule.workforce', 'workforce.read'] },
];

export default function SchedulePage() {
  return <DeskGate>{desk => <Schedule desk={desk} />}</DeskGate>;
}

/**
 * Scheduling for the office: everyone's own schedule, and for the roles that run it, the timetable
 * (schedule.academic), bells, rooms and the academic calendar, and the staff register (schedule.workforce).
 */
function Schedule({ desk }: { desk: AdminDesk }) {
  const router = useRouter();
  const params = useSearchParams();
  const a = desk.me.access;
  const tabs = TABS.filter(t => !t.see.length || a.any(...t.see));
  const tab = tabs.find(t => t.key === params.get('tab'))?.key ?? (a.can('schedule.academic') ? 'timetable' : 'mine');
  const { rows, error, reload, call } = useSchedule({ students: true });
  const [toast, toastEl] = useToast();
  const go = (t: Tab) => router.replace(`/admin/schedule${t === 'mine' ? '?tab=mine' : `?tab=${t}`}`, { scroll: false });
  const common = rows ? { rows, call, reload, toast } : null;

  return (
    <>
      {toastEl}
      <PageBar eyebrow="SCHEDULING" title="Schedule"
        sub="The timetable, bells, the academic calendar and the staff register. Every teacher and office account sees their own schedule from it." />
      <div className="tabs" role="tablist" aria-label="Scheduling">
        {tabs.map(t => <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab${tab === t.key ? ' on' : ''}`} onClick={() => go(t.key)}>{t.label}</button>)}
      </div>
      {error ? <div className="note err" role="alert">Couldn&apos;t load the schedule: {error}</div>
        : !common ? <div className="card" aria-busy="true">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 12 }} />)}</div>
          : common.rows.missing.includes('timetable_versions') ? (
            <div className="card"><Empty icon={<CalendarDots size={26} weight="duotone" />} title="Scheduling isn't in this database yet">The scheduling tables arrive with the scheduling migration. Once it&apos;s applied, this page fills in.</Empty></div>
          ) : (
            <>
              {tab === 'mine' && <MySchedule rows={common.rows} who={{ kind: 'office', userId: desk.me.id }} schoolName={desk.school.name} title="My schedule" />}
              {tab === 'cover' && <CoverTab {...common} />}
              {tab === 'duties' && <DutiesTab {...common} canWorkforce={a.can('schedule.workforce')} canAcademic={a.can('schedule.academic')} />}
              {tab === 'timetable' && <TimetableTab {...common} canEdit={a.can('schedule.academic')} />}
              {tab === 'calendar' && <CalendarTab {...common} canEdit={a.can('schedule.academic')} />}
              {tab === 'setup' && <SetupTab {...common} canEdit={a.can('schedule.academic')} />}
              {tab === 'staff' && <StaffTab {...common} canEdit={a.can('schedule.workforce')} />}
            </>
          )}
    </>
  );
}
