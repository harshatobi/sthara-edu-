'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { ChatsCircleIcon as ChatsCircle } from '@phosphor-icons/react/dist/ssr/ChatsCircle';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { InfoIcon as Info } from '@phosphor-icons/react/dist/ssr/Info';
import { Bar, Empty, PageBar } from '@/components/canon/ui';
import { ago } from '@/lib/admin/format';
import { bandOf } from '@/lib/parent/family';
import { BAND_KEY, BandChip, ChildSwitcher, FamilyGate, Trend } from './common';
import { contactHref } from './links';

const CONF: Record<string, { label: string; tone: string; hint: string }> = {
  firm: { label: 'Firm', tone: 'g', hint: 'Five or more pieces of evidence' },
  provisional: { label: 'Provisional', tone: 'a', hint: 'Two to four pieces of evidence: about ±8%' },
  insufficient: { label: 'Too early', tone: 'n', hint: 'Fewer than two pieces of evidence' },
};
const cell = (v: number | null) => (v === null ? <span className="muted">—</span> : `${v}%`);

export default function Progress() {
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(params.get('subject'));
  return (
    <FamilyGate>
      {({ child: c }) => (
        <>
          <ChildSwitcher />
          <PageBar eyebrow="MASTERY & REPORTS" title={`${c.firstName}'s mastery`}
            sub="True Mastery Level blends homework and quizzes (recent work counts more) with how independently your child works in the AI tutor."
            actions={<Link className="btn" href={`/parent/ask?q=${encodeURIComponent(`Explain ${c.firstName}'s report in simple words`)}`}><ChatsCircle size={16} weight="bold" /> Explain this report</Link>} />
          <div className="kpis">
            <div className="kpi"><div className="lb">OVERALL</div><div className="vl" style={{ color: c.band?.color }}>{c.tml === null ? '—' : `${c.tml}%`}</div><div className="nt"><BandChip band={c.band} /></div></div>
            <div className="kpi"><div className="lb">SUBJECTS WITH EVIDENCE</div><div className="vl">{c.subjects.length}</div><div className="nt muted">{c.subjects.reduce((n, s) => n + s.chapters.length, 0)} chapters measured</div></div>
            <div className="kpi"><div className="lb">NEEDS WORK</div><div className="vl" style={{ color: '#F98A4B' }}>{c.subjects.reduce((n, s) => n + s.chapters.filter(ch => ch.score < 50 && ch.confidence !== 'insufficient').length, 0)}</div><div className="nt muted">chapters under 50%</div></div>
          </div>

          {c.subjects.length ? c.subjects.map(s => {
            const isOpen = open === s.subject || c.subjects.length === 1;
            const b = bandOf(s.score);
            return (
              <section key={s.subject} className="card pa-subject">
                <button className="pa-subject-hd" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.subject)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3>{s.subject}</h3>
                    <div className="muted">{s.teacher ? `${s.teacher.name} · ` : ''}{s.chapters.length} chapter{s.chapters.length === 1 ? '' : 's'} measured</div>
                  </div>
                  <div className="pa-subject-score">
                    <b style={{ color: b?.color }}>{s.score ?? '—'}%</b><Trend delta={s.delta} />
                    <BandChip band={b} />
                  </div>
                </button>
                <Bar value={s.score ?? 0} color={b?.color} />
                {isOpen && (
                  <>
                    <div className="pa-tbl-wrap">
                      <table className="tbl pa-tbl">
                        <thead><tr><th>Chapter</th><th>Mastery</th><th>Homework</th><th>Quiz</th><th>Tutor depth</th><th>Confidence</th><th>Updated</th></tr></thead>
                        <tbody>
                          {s.chapters.map(ch => {
                            const cb = bandOf(ch.score);
                            const conf = CONF[ch.confidence || ''] ?? { label: ch.confidence || '—', tone: 'n', hint: '' };
                            return (
                              <tr key={ch.name}>
                                <td><b>{ch.name}</b></td>
                                <td><span className="pa-band" style={{ ['--b' as string]: cb?.color }}><i aria-hidden="true" />{ch.score}%</span></td>
                                <td>{cell(ch.homework)}</td><td>{cell(ch.quiz)}</td><td>{cell(ch.tutor)}</td>
                                <td><span className={`ch ${conf.tone} xs`} title={conf.hint}>{conf.label}</span></td>
                                <td className="muted">{ago(ch.at)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="pa-subject-ft">
                      <Link className="btn sm" href={`/parent/ask?q=${encodeURIComponent(`How can I help ${c.firstName} with ${s.subject} at home?`)}`}><ChatsCircle size={14} weight="bold" /> Ideas for home</Link>
                      {s.teacher && <Link className="btn sm" href={contactHref(c.id, { to: s.teacher, audience: 'teacher', topic: 'academics', subject: `${s.subject}: ${c.firstName}'s progress` })}><EnvelopeSimple size={14} weight="bold" /> Message {s.teacher.name}</Link>}
                    </div>
                  </>
                )}
              </section>
            );
          }) : (
            <div className="card"><Empty icon={<ChartLineUp size={34} weight="duotone" />} title="No mastery evidence yet">
              Mastery appears after teachers confirm marks on {c.firstName}&apos;s homework and quizzes, and after AI tutor sessions.
            </Empty></div>
          )}

          <div className="card" style={{ marginTop: 18 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><Info size={18} weight="duotone" color="#2F6BFF" /> What the bands mean</h3>
            <div className="pa-key">
              {BAND_KEY.map(k => (
                <div key={k.band}><i style={{ background: k.color }} aria-hidden="true" /><b>{k.band}</b><span className="muted">{k.range}%</span><p>{k.meaning}</p></div>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 12 }}>Homework and quiz marks count once a teacher confirms them. Tutor depth is higher when your child solves problems with fewer hints. Attendance isn&apos;t recorded in Sthara yet, so it isn&apos;t shown.</p>
          </div>
        </>
      )}
    </FamilyGate>
  );
}
