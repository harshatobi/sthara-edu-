'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ListChecksIcon as ListChecks } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { ChatsCircleIcon as ChatsCircle } from '@phosphor-icons/react/dist/ssr/ChatsCircle';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { Empty, PageBar } from '@/components/canon/ui';
import { fmtDate } from '@/lib/admin/format';
import type { WorkItem } from '@/lib/parent/family';
import { ChildSwitcher, FamilyGate } from './common';
import { contactHref } from './links';

type Filter = 'open' | 'overdue' | 'graded' | 'all';
const TABS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'To do' }, { key: 'overdue', label: 'Overdue' }, { key: 'graded', label: 'Graded' }, { key: 'all', label: 'All' },
];
const STATE: Record<WorkItem['state'], { label: string; tone: string }> = {
  todo: { label: 'To do', tone: 'a' }, overdue: { label: 'Overdue', tone: 'r' }, submitted: { label: 'Handed in, awaiting marks', tone: 'b' }, graded: { label: 'Graded', tone: 'g' },
};

export default function Schoolwork() {
  const [filter, setFilter] = useState<Filter>('open');
  return (
    <FamilyGate>
      {({ child: c }) => {
        const counts: Record<Filter, number> = {
          open: c.work.filter(w => w.state === 'todo' || w.state === 'submitted').length,
          overdue: c.work.filter(w => w.state === 'overdue').length,
          graded: c.work.filter(w => w.state === 'graded').length,
          all: c.work.length,
        };
        const list = c.work.filter(w => filter === 'all' || (filter === 'open' ? w.state === 'todo' || w.state === 'submitted' : w.state === filter));
        const ordered = filter === 'open' ? [...list].sort((a, b) => (a.dueOn || '9').localeCompare(b.dueOn || '9')) : list;
        return (
          <>
            <ChildSwitcher />
            <PageBar eyebrow="SCHOOLWORK" title={`${c.firstName}'s homework and quizzes`} sub="Everything set for the class in the last four months, with marks once a teacher confirms them." />
            <div className="tabs" role="tablist">
              {TABS.map(t => (
                <button key={t.key} role="tab" aria-selected={filter === t.key} className={`tab${filter === t.key ? ' on blue' : ''}`} onClick={() => setFilter(t.key)}>
                  {t.label} <span className="pa-count">{counts[t.key]}</span>
                </button>
              ))}
            </div>
            <div className="card">
              {ordered.length ? ordered.map(w => (
                <div key={w.id} className="row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{w.title}</b>
                    <div className="muted">{w.subject} · {w.type}{w.chapter ? ` · ${w.chapter}` : ''}{w.teacher ? ` · ${w.teacher.name}` : ''}</div>
                    <div className="muted">{w.dueOn ? `Due ${fmtDate(w.dueOn)}` : 'No due date'}{w.submittedAt ? ` · handed in ${fmtDate(w.submittedAt)}` : ''}</div>
                    {w.note && <div className="pa-note">Teacher&apos;s note: &ldquo;{w.note}&rdquo;</div>}
                    {w.state === 'overdue' && (
                      <div className="pa-probe-acts">
                        <Link className="btn sm" href={`/parent/ask?q=${encodeURIComponent(`${c.firstName} hasn't handed in "${w.title}" (${w.subject}). What should we do?`)}`}><ChatsCircle size={14} weight="bold" /> Ask what to do</Link>
                        {w.teacher && <Link className="btn sm" href={contactHref(c.id, { to: w.teacher, audience: 'teacher', topic: 'homework', subject: `${w.title}: late submission` })}><EnvelopeSimple size={14} weight="bold" /> Message {w.teacher.name}</Link>}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', display: 'grid', gap: 6, justifyItems: 'end' }}>
                    <span className={`ch ${STATE[w.state].tone}`}>{STATE[w.state].label}</span>
                    {w.state === 'graded' && <b style={{ fontSize: 18 }}>{w.score}/{w.max}</b>}
                  </div>
                </div>
              )) : (
                <Empty icon={<ListChecks size={32} weight="duotone" />} title={filter === 'overdue' ? 'Nothing overdue' : filter === 'graded' ? 'Nothing graded yet' : 'Nothing here'}>
                  {filter === 'open' ? `${c.firstName} has nothing outstanding right now.` : 'Work set by teachers shows up here as soon as it is published.'}
                </Empty>
              )}
            </div>
          </>
        );
      }}
    </FamilyGate>
  );
}
