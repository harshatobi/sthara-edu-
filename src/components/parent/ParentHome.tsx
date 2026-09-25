'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChatsCircleIcon as ChatsCircle } from '@phosphor-icons/react/dist/ssr/ChatsCircle';
import { PaperPlaneRightIcon as PaperPlaneRight } from '@phosphor-icons/react/dist/ssr/PaperPlaneRight';
import { WhatsappLogoIcon as WhatsappLogo } from '@phosphor-icons/react/dist/ssr/WhatsappLogo';
import { ListChecksIcon as ListChecks } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { HeartIcon as Heart } from '@phosphor-icons/react/dist/ssr/Heart';
import { CurrencyInrIcon as CurrencyInr } from '@phosphor-icons/react/dist/ssr/CurrencyInr';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { BellIcon as Bell } from '@phosphor-icons/react/dist/ssr/Bell';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { CalendarBlankIcon as CalendarBlank } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import { Bar, Donut, Empty } from '@/components/canon/ui';
import { ago, fmtDate, inr } from '@/lib/admin/format';
import { ENERGY_LABEL, upcoming, workDone } from '@/lib/parent/family';
import { BandChip, ChildSwitcher, FamilyGate, TONE_COLOR, Trend } from './common';
import { contactHref } from './links';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function ParentHome() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const ask = (text: string) => router.push(`/parent/ask?q=${encodeURIComponent(text)}`);

  return (
    <FamilyGate>
      {({ view, child: c, findings }) => {
        const mine = findings.filter(f => f.childId === c.id);
        const starters = [...new Set([
          ...mine.slice(0, 2).map(f => f.ask),
          `How is ${c.firstName} doing this week?`,
          `What should ${c.firstName} focus on next?`,
        ])].slice(0, 3);
        const done = workDone(c);
        const next = upcoming(c, 7);
        const overdue = c.work.filter(w => w.state === 'overdue');
        const graded = c.work.filter(w => w.state === 'graded').slice(0, 5);
        const notices = view.notices.filter(n => !n.studentId || n.studentId === c.id).slice(0, 5);
        const unread = view.threads.filter(t => t.unread).length;
        return (
          <>
            <ChildSwitcher />
            <section className="hero pa-hero">
              <div className="pa-hero-top">
                <div>
                  <div className="pa-eyebrow">{view.parent.schoolName.toUpperCase()}</div>
                  <h1>{greeting()}, {view.parent.name.split(' ')[0]}</h1>
                  <div className="hsub">{c.name} · {c.cls}{c.classTeacher ? ` · Class teacher ${c.classTeacher.name}` : ''}</div>
                </div>
                {view.whatsapp.linked && (
                  <span className="pa-wa-on"><WhatsappLogo size={16} weight="fill" /> On WhatsApp{view.whatsapp.mode === 'simulated' ? ' (test mode)' : ''}</span>
                )}
              </div>
              <form className="pa-ask" onSubmit={e => { e.preventDefault(); if (q.trim()) ask(q.trim()); }}>
                <ChatsCircle size={22} weight="duotone" aria-hidden="true" />
                <label htmlFor="pa-ask-in" className="sr-only">Ask the School OS</label>
                <input id="pa-ask-in" value={q} onChange={e => setQ(e.target.value)} placeholder={`Ask the School OS anything about ${c.firstName}…`} autoComplete="off" />
                <button className="btn red" type="submit" disabled={!q.trim()}><PaperPlaneRight size={16} weight="fill" /> Ask</button>
              </form>
              <div className="pa-starters">
                {starters.map(s => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}
              </div>
            </section>

            <div className="kpis">
              <div className="kpi">
                <div className="lb">MASTERY (TML)</div>
                <div className="pa-kpi-row">
                  <Donut value={c.tml ?? 0} color={c.band?.color ?? '#E8EDF4'} size={78} />
                  <div>
                    <div className="vl" style={{ fontSize: 38, color: c.band?.color }}>{c.tml === null ? '—' : `${c.tml}%`}</div>
                    <div className="nt"><BandChip band={c.band} /></div>
                  </div>
                </div>
              </div>
              <Link href="/parent/schoolwork" className="kpi kpi-link">
                <div className="lb">SCHOOLWORK</div>
                <div className="vl">{done.due ? `${done.done}/${done.due}` : '—'}</div>
                <div className="nt" style={{ color: overdue.length ? '#E11D48' : '#10B981' }}>
                  {overdue.length ? <><ListChecks size={16} weight="bold" /> {overdue.length} overdue</> : <><CheckCircle size={16} weight="bold" /> {done.due ? 'All caught up' : 'Nothing due yet'}</>}
                </div>
              </Link>
              <div className="kpi">
                <div className="lb">WELLBEING · 14 DAYS</div>
                {c.wellness.consented ? (
                  <>
                    <div className="vl">{c.wellness.avgEnergy ?? '—'}<small className="pa-of">/5</small></div>
                    <div className="nt" style={{ color: c.wellness.lowDays >= 3 ? '#E11D48' : '#7A8699' }}>
                      <Heart size={16} weight="bold" /> {c.wellness.checkins ? `${c.wellness.checkins} check-ins${c.wellness.latestEnergy ? `, latest ${ENERGY_LABEL[c.wellness.latestEnergy].toLowerCase()}` : ''}` : 'No check-ins yet'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="vl" style={{ fontSize: 26, marginTop: 14 }}>Not shared</div>
                    <div className="nt"><Link className="pa-link" href="/parent/settings#privacy">Give consent to see energy trends</Link></div>
                  </>
                )}
              </div>
              <Link href="/parent/fees" className="kpi kpi-link">
                <div className="lb">FEES</div>
                <div className="vl" style={{ fontSize: 34, marginTop: 14, color: c.fees.overdue ? '#E11D48' : undefined }}>{c.fees.invoices.length ? inr(c.fees.outstanding) : '—'}</div>
                <div className="nt">
                  <CurrencyInr size={16} weight="bold" />
                  {!c.fees.invoices.length ? 'No invoices this session' : c.fees.overdue ? `${inr(c.fees.overdue)} overdue` : c.fees.nextDue ? `Next due ${fmtDate(c.fees.nextDue.dueOn, true)}` : 'All paid'}
                </div>
              </Link>
            </div>

            <div className="g2">
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="pa-card-hd">
                  <div><h3><Sparkle size={18} weight="duotone" color="#7C5CFC" /> Probe: worth a look</h3><p className="muted">What the School OS noticed about {c.firstName}, most important first.</p></div>
                </div>
                {mine.length ? mine.slice(0, 5).map(f => (
                  <div key={f.id} className="pa-probe">
                    <span className="probe-sev" style={{ background: TONE_COLOR[f.tone] }} aria-hidden="true" />
                    <div className="pa-probe-bd">
                      <b>{f.title}</b>
                      <p>{f.detail}</p>
                      <div className="pa-probe-acts">
                        <button className="btn sm" onClick={() => ask(f.ask)}><ChatsCircle size={14} weight="bold" /> Ask about this</button>
                        {f.contact && (
                          <Link className="btn sm" href={contactHref(c.id, f.contact)}>
                            <EnvelopeSimple size={14} weight="bold" /> Message {f.contact.to?.name ?? 'the office'}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )) : (
                  <Empty icon={<CheckCircle size={30} weight="duotone" />} title="Nothing needs your attention">
                    No overdue work, no gaps under 50% and no unanswered messages for {c.firstName} right now.
                  </Empty>
                )}
              </div>

              <div className="card">
                <div className="pa-card-hd flat">
                  <div><h3>Subjects</h3><p className="muted">Mastery per subject, from graded work and tutor sessions.</p></div>
                  <Link className="btn sm" href="/parent/progress">Full report</Link>
                </div>
                {c.subjects.length ? c.subjects.map(s => (
                  <Link key={s.subject} href={`/parent/progress?subject=${encodeURIComponent(s.subject)}`} className="pa-subj">
                    <div className="pa-subj-hd">
                      <b>{s.subject}</b>
                      <span className="muted">{s.teacher?.name ?? ''}</span>
                      <span className="pa-subj-v" style={{ color: s.score === null ? undefined : undefined }}>{s.score ?? '—'}%<Trend delta={s.delta} /></span>
                    </div>
                    <Bar value={s.score ?? 0} />
                  </Link>
                )) : (
                  <Empty icon={<Sparkle size={30} weight="duotone" />} title="No graded work yet">
                    Mastery appears once teachers grade {c.firstName}&apos;s first homework or quiz.
                  </Empty>
                )}
              </div>
            </div>

            <div className="g2" style={{ marginTop: 18 }}>
              <div className="card">
                <div className="pa-card-hd flat"><div><h3><CalendarBlank size={18} weight="duotone" color="#2F6BFF" /> Coming up</h3><p className="muted">Due in the next seven days.</p></div></div>
                {[...overdue.slice(0, 3), ...next].slice(0, 6).map(w => (
                  <div key={w.id} className="row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b className="pa-trunc">{w.title}</b>
                      <div className="muted">{w.subject} · {w.type}{w.teacher ? ` · ${w.teacher.name}` : ''}</div>
                    </div>
                    <span className={`ch ${w.state === 'overdue' ? 'r' : 'a'}`}>{w.state === 'overdue' ? `Overdue ${fmtDate(w.dueOn, true)}` : `Due ${fmtDate(w.dueOn, true)}`}</span>
                  </div>
                ))}
                {!overdue.length && !next.length && <p className="muted" style={{ padding: '14px 0' }}>Nothing due this week.</p>}
              </div>
              <div className="card">
                <div className="pa-card-hd flat"><div><h3><CheckCircle size={18} weight="duotone" color="#10B981" /> Recently graded</h3><p className="muted">Marks teachers have confirmed.</p></div></div>
                {graded.length ? graded.map(w => (
                  <div key={w.id} className="row" style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b className="pa-trunc">{w.title}</b>
                      <div className="muted">{w.subject}{w.teacher ? ` · ${w.teacher.name}` : ''}</div>
                      {w.note && <div className="pa-note">&ldquo;{w.note}&rdquo;</div>}
                    </div>
                    <span className={`ch ${w.pct === null ? 'n' : w.pct >= 80 ? 'g' : w.pct >= 60 ? 'a' : 'r'}`}>{w.score}/{w.max}</span>
                  </div>
                )) : <p className="muted" style={{ padding: '14px 0' }}>No graded work yet.</p>}
              </div>
            </div>

            <div className="card" style={{ marginTop: 18 }}>
              <div className="pa-card-hd flat">
                <div><h3><Bell size={18} weight="duotone" color="#F59E0B" /> From school</h3><p className="muted">Grades, alerts and reminders sent to you.</p></div>
                <Link className="btn sm" href="/parent/messages"><EnvelopeSimple size={14} weight="bold" /> Messages{unread ? ` (${unread} new)` : ''}</Link>
              </div>
              {notices.length ? notices.map(n => (
                <div key={n.id} className="row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b className="pa-trunc">{n.title}</b>
                    <div className="muted pa-trunc">{n.body}</div>
                  </div>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>{ago(n.at)}</span>
                </div>
              )) : <p className="muted" style={{ padding: '14px 0' }}>Nothing yet. Grades, alerts and fee reminders will appear here.</p>}
            </div>
          </>
        );
      }}
    </FamilyGate>
  );
}
