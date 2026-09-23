'use client';

import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip } from '@/components/canon/ui';
import type { Course } from '@/lib/teacher/useCourse';
import { addDays, fmtDay, fmtDow, weekStart, type Lesson } from '@/lib/teacher/course';
import type { LessonPrefill } from './SyllabusWorkspace';

const STATUS_CHIP: Record<Lesson['status'], { tone: 'n' | 'b' | 'g'; label: string }> = {
  draft: { tone: 'n', label: 'DRAFT' }, ready: { tone: 'b', label: 'READY' }, taught: { tone: 'g', label: 'TAUGHT' },
};

function LessonCard({ l, seq, onOpen }: { l: Lesson; seq: number | undefined; onOpen: () => void }) {
  return (
    <button className={`lcard ${l.status}`} onClick={onOpen}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 11, fontWeight: 800 }}>{l.period ? `P${l.period} · ` : ''}{l.durationMin} MIN</span>
        <Chip tone={STATUS_CHIP[l.status].tone}>{STATUS_CHIP[l.status].label}</Chip>
      </div>
      <b>{l.title}</b>
      <span className="muted" style={{ fontSize: 11.5 }}>{seq ? `${String(seq).padStart(2, '0')} · ` : ''}{l.chapterName}{l.topics.length ? ` · ${l.topics.length} topic${l.topics.length === 1 ? '' : 's'}` : ''}</span>
    </button>
  );
}

/** Lesson planner week view (Planboard-style): Monday–Saturday, lessons by period. */
export default function LessonsView({ course, today, week, onWeek, onOpen }: {
  course: Course; today: string; week: string | null; onWeek: (w: string) => void;
  onOpen: (id: string | 'new', p?: LessonPrefill) => void;
}) {
  const start = weekStart(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const days = Array.from({ length: 6 }, (_, i) => addDays(start, i));
  const seqOf = new Map(course.chapters.map(c => [c.key, c.seq]));
  const onDay = (d: string) => course.lessons.filter(l => l.date === d).sort((a, b) => (a.period ?? 99) - (b.period ?? 99));
  const unscheduled = course.lessons.filter(l => !l.date);
  const later = course.lessons.filter(l => l.date && l.date > days[5]).slice(0, 6);
  const inWeek = days.reduce((n, d) => n + onDay(d).length, 0);
  const weekMinutes = days.reduce((n, d) => n + onDay(d).reduce((m, l) => m + l.durationMin, 0), 0);

  return (
    <>
      <div className="card" style={{ marginBottom: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => onWeek(addDays(start, -7))} aria-label="Previous week"><ArrowLeft size={13} weight="bold" /></button>
        <b style={{ fontSize: 16, minWidth: 150, textAlign: 'center' }}>{fmtDay(days[0])} – {fmtDay(days[5])}</b>
        <button className="btn sm" onClick={() => onWeek(addDays(start, 7))} aria-label="Next week"><ArrowRight size={13} weight="bold" /></button>
        {start !== weekStart(today) && <button className="btn sm" onClick={() => onWeek(weekStart(today))}>This week</button>}
        <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
          {inWeek ? `${inWeek} lesson${inWeek === 1 ? '' : 's'} · ${weekMinutes} min planned` : 'Nothing planned this week'}
          {course.plan.saved ? ` · timetable: ${course.plan.periodsPerWeek} periods/week` : ''}
        </span>
      </div>

      <div className="week">
        {days.map(d => (
          <div key={d} className={`day${d === today ? ' today' : ''}`}>
            <div className="dh"><b>{fmtDow(d)}</b><span>{fmtDay(d)}</span></div>
            {onDay(d).map(l => <LessonCard key={l.id} l={l} seq={seqOf.get(l.chapterKey)} onOpen={() => onOpen(l.id)} />)}
            <button className="add" onClick={() => onOpen('new', { date: d })}><Plus size={12} weight="bold" /> Add lesson</button>
          </div>
        ))}
      </div>

      <div className="g2" style={{ marginTop: 18 }}>
        <div className="card">
          <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>Unscheduled ({unscheduled.length})</h3>
          {unscheduled.length
            ? <div style={{ display: 'grid', gap: 8 }}>{unscheduled.map(l => <LessonCard key={l.id} l={l} seq={seqOf.get(l.chapterKey)} onOpen={() => onOpen(l.id)} />)}</div>
            : <p className="muted" style={{ fontSize: 13 }}>Plans without a date land here, ready to drop into a week.</p>}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>Coming up after this week</h3>
          {later.length
            ? <div style={{ display: 'grid', gap: 8 }}>{later.map(l => (
                <div key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className="muted mono" style={{ fontSize: 12, width: 56 }}>{fmtDay(l.date)}</span>
                  <div style={{ flex: 1 }}><LessonCard l={l} seq={seqOf.get(l.chapterKey)} onOpen={() => onOpen(l.id)} /></div>
                </div>
              ))}</div>
            : <p className="muted" style={{ fontSize: 13 }}>Nothing planned beyond this week yet.</p>}
        </div>
      </div>
    </>
  );
}
