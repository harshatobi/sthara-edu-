'use client';

import Link from 'next/link';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { FireIcon as Fire } from '@phosphor-icons/react/dist/ssr/Fire';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { BrainIcon as Brain } from '@phosphor-icons/react/dist/ssr/Brain';
import { TrendDownIcon as TrendDown } from '@phosphor-icons/react/dist/ssr/TrendDown';
import { TrendUpIcon as TrendUp } from '@phosphor-icons/react/dist/ssr/TrendUp';
import { LightbulbIcon as Lightbulb } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { inr } from '@/lib/admin/format';
import type { Lead as LeadData, ChapterNow } from '@/lib/timeline/lead';
import type { MonthPoint, Timeline as TL, TimelineEvent } from '@/lib/timeline/rules';
import { ICON } from './icons';

/**
 * The opening of each role's timeline (Moses, 2026-11-06). Student: warm, visual, one next step. Parent: how the
 * child is doing, what to celebrate, what needs attention and how to help. Teacher: teaching signals and an action.
 * Office: led by the office role (everything, fees, wellbeing and counselling, or the register).
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const when = (on: string) => `${Number(on.slice(8, 10))} ${MONTHS[Number(on.slice(5, 7)) - 1]}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const first = (name: string) => name.trim().split(/\s+/)[0] || name;

interface Props { lead: LeadData; t: TL; series: MonthPoint[]; events: TimelineEvent[]; student: { name: string; userId: string | null } }

export function Lead(p: Props) {
  if (p.lead.who === 'student') return <StudentLead {...p} />;
  if (p.lead.who === 'parent') return <ParentLead {...p} />;
  if (p.lead.who === 'class_teacher' || p.lead.who === 'subject_teacher') return <TeacherLead {...p} />;
  return <OfficeLead {...p} />;
}

/** Mastery now, and its change since the month before. */
function masteryNow(series: MonthPoint[]) {
  const pts = series.filter(x => x.tml);
  const now = pts[pts.length - 1]?.tml ?? null;
  const prev = pts[pts.length - 2]?.tml ?? null;
  return { now, change: now && prev ? now.score - prev.score : null };
}

const BAND_WORDS: Record<string, string> = {
  Exemplary: 'Exemplary. Outstanding.',
  Proficient: 'Proficient. Strong work.',
  Developing: 'Developing. Keep going.',
  'Critical Gap': 'Room to grow. You can do this.',
  'Severe Need': 'Room to grow. One chapter at a time.',
};

function Wins({ wins, empty }: { wins: TimelineEvent[]; empty: string }) {
  if (!wins.length) return <p className="tl-lead-none">{empty}</p>;
  return (
    <ul className="tl-wins">
      {wins.map((w, i) => (
        <li key={i} className={`t-${w.tone}`}>
          <span className="tl-win-ico">{ICON[w.kind]}</span>
          <div><b>{w.title}</b>{w.detail && <span>{w.detail}</span>}</div>
          <time dateTime={w.on}>{when(w.on)}</time>
        </li>
      ))}
    </ul>
  );
}

// ── Student ──────────────────────────────────────────────────────────────────

function StudentLead({ lead, t, series }: Props) {
  const y = t.years[0];
  const { now, change } = masteryNow(series);
  const lifted = lead.wins.filter(w => w.kind === 'tml').length;
  const deep = lead.wins.filter(w => w.kind === 'tutor').length;
  const headline = lifted >= 2 ? `You lifted ${lifted} chapters recently.`
    : lifted === 1 ? lead.wins.find(w => w.kind === 'tml')!.title + '.'
    : deep ? `${plural(deep, 'strong tutor session')} lately. Nice work.`
    : lead.streak >= 2 ? `${lead.streak} months in a row with great attendance.`
    : lead.wins.length ? `${lead.wins[0].title}.`
    : 'Your story this year, so far.';
  const tiles: { icon: React.ReactNode; tone: string; value: string; label: string }[] = [];
  if (y?.attendance?.pct != null) tiles.push({ icon: <CalendarCheck size={22} weight="duotone" />, tone: y.attendance.pct >= 90 ? 'g' : 'a', value: `${y.attendance.pct}%`, label: 'of school days you were here' });
  if (now) tiles.push({ icon: <ChartLineUp size={22} weight="duotone" />, tone: now.score >= 75 ? 'g' : now.score >= 50 ? 'b' : 'a', value: `${now.score}%`, label: `${BAND_WORDS[now.band] ?? now.band}${change ? ` ${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)} since last month.` : ''}` });
  if (lead.streak >= 2) tiles.push({ icon: <Fire size={22} weight="duotone" />, tone: 'a', value: `${lead.streak} months`, label: 'in a row at 95%+ attendance' });
  else if (lead.tutor) tiles.push({ icon: <Brain size={22} weight="duotone" />, tone: 'b', value: plural(lead.tutor.sessions, 'session'), label: `with the AI tutor this month${lead.tutor.depth !== null ? `, depth ${lead.tutor.depth}` : ''}` });
  return (
    <section className="card tl-lead tl-lead-s" aria-label="Your year so far">
      <div className="tl-hello">
        <h2>{headline}</h2>
        <p>{lead.wins.length ? 'Here is where you are, and one thing to try next.' : 'Every chapter you work on and every win shows up here.'}</p>
      </div>
      {tiles.length > 0 && (
        <div className="tl-tiles">
          {tiles.map(x => (
            <div key={x.label} className={`tl-tile t-${x.tone}`}>
              <span className="tl-tile-ico">{x.icon}</span>
              <b>{x.value}</b>
              <span>{x.label}</span>
            </div>
          ))}
        </div>
      )}
      {lead.next && (
        <div className="tl-next">
          <span className="tl-next-ico"><Lightbulb size={20} weight="duotone" /></span>
          <div>
            <b>Your next step</b>
            <p><strong>{lead.next.topic}</strong> ({lead.next.subject}) is at {lead.next.score}%. A session with the AI tutor is the quickest way up.</p>
          </div>
          <Link className="btn ai" href={`/student/tutor?${new URLSearchParams({ topic: lead.next.topic, subject: lead.next.subject })}`}>Practise it <ArrowRight size={14} /></Link>
        </div>
      )}
      <h3 className="tl-lead-h">Your recent wins</h3>
      <Wins wins={lead.wins} empty="Your next win is close. Finish a tutor session or lift a chapter past 50%, and it lands here." />
    </section>
  );
}

// ── Parent ───────────────────────────────────────────────────────────────────

function ParentLead({ lead, t, series, student }: Props) {
  const name = first(student.name);
  const y = t.years[0];
  const { now, change } = masteryNow(series);
  const lines: string[] = [];
  if (now) lines.push(`${name}’s mastery is ${now.score}% (${now.band})${change ? `, ${change > 0 ? 'up' : 'down'} ${Math.abs(change)} since last month` : ''}.`);
  if (y?.attendance?.pct != null) lines.push(`Attendance this year is ${y.attendance.pct}%.`);
  if (y?.homework) lines.push(`${y.homework.done} of ${y.homework.set} homework handed in.`);
  if (lead.tutor) lines.push(`${plural(lead.tutor.sessions, 'session')} with the AI tutor in the last month.`);
  return (
    <section className="card tl-lead" aria-label={`How ${name} is doing`}>
      <h2 className="tl-lead-title">How {name} is doing</h2>
      <p className="tl-summary">{lines.join(' ') || 'The school hasn’t recorded much yet this year.'}</p>
      <div className="tl-cols">
        <div>
          <h3 className="tl-lead-h">Worth celebrating</h3>
          <Wins wins={lead.wins} empty="Nothing new in the last six weeks." />
        </div>
        <div>
          <h3 className="tl-lead-h">Needs attention</h3>
          <Attention items={lead.attention} empty="Nothing needs attention right now." />
        </div>
      </div>
    </section>
  );
}

function Attention({ items, empty }: { items: LeadData['attention']; empty: string }) {
  if (!items.length) return <p className="tl-lead-none ok">{empty}</p>;
  return (
    <ul className="tl-attn">
      {items.map(a => (
        <li key={a.key} className={`t-${a.tone}`}>
          <b>{a.title}</b>
          <span>{a.detail}</span>
          {a.help && <em>At home: {a.help}</em>}
        </li>
      ))}
    </ul>
  );
}

// ── Teacher ──────────────────────────────────────────────────────────────────

function Chapters({ list, dir }: { list: ChapterNow[]; dir: 'up' | 'down' }) {
  if (!list.length) return <p className="tl-lead-none">{dir === 'down' ? 'No chapter has dropped 8 points or more in the last month.' : 'No chapter has risen 8 points or more in the last month.'}</p>;
  return (
    <ul className="tl-chs">
      {list.map(c => (
        <li key={`${c.subject}-${c.topic}`}>
          <div><b>{c.topic}</b><span>{c.subject}</span></div>
          <span className={`tl-ch-d ${dir}`}>{c.prev}% to {c.score}%</span>
        </li>
      ))}
    </ul>
  );
}

function TeacherLead({ lead, t, student }: Props) {
  const name = first(student.name);
  const cls = t.years[0]?.cls;
  const target = lead.slipping[0] ?? (lead.next && lead.next.score < 50 ? lead.next : null);
  const href = cls && student.userId ? `/teacher/mastery?${new URLSearchParams({ class: cls, student: student.userId })}` : null;
  return (
    <section className="card tl-lead" aria-label="Teaching signals">
      <h2 className="tl-lead-title">Teaching signals: {name}</h2>
      <p className="tl-who">{t.who === 'subject_teacher' ? `In your subjects${t.subjects ? ` (${t.subjects.join(', ')})` : ''}, over the last month.` : 'Across the class’s subjects, over the last month.'}</p>
      <div className="tl-cols three">
        <div>
          <h3 className="tl-lead-h"><TrendDown size={15} weight="bold" /> Slipping</h3>
          <Chapters list={lead.slipping} dir="down" />
        </div>
        <div>
          <h3 className="tl-lead-h"><TrendUp size={15} weight="bold" /> Improving</h3>
          <Chapters list={lead.improving} dir="up" />
        </div>
        <div>
          <h3 className="tl-lead-h">Lately</h3>
          <dl className="tl-mini">
            <div><dt>AI tutor, 30 days</dt><dd>{lead.tutor ? `${plural(lead.tutor.sessions, 'session')}${lead.tutor.depth !== null ? `, depth ${lead.tutor.depth}` : ''}` : 'None'}</dd></div>
            <div><dt>Homework, 60 days</dt><dd>{lead.homework ? `${lead.homework.done} of ${lead.homework.set}` : 'None set'}</dd></div>
            <div><dt>Attendance streak</dt><dd>{lead.streak ? `${plural(lead.streak, 'month')} at 95%+` : 'None'}</dd></div>
          </dl>
        </div>
      </div>
      <div className="tl-act">
        <Lightbulb size={18} weight="duotone" />
        {target ? (
          <p><b>Suggested:</b> assign a tutor session on <b>{target.topic}</b> ({target.subject}, {target.score}%).</p>
        ) : lead.homework && lead.homework.done / lead.homework.set < 0.75 ? (
          <p><b>Suggested:</b> check in with {name} about homework; {lead.homework.set - lead.homework.done} not handed in recently.</p>
        ) : <p><b>On track.</b> Nothing needs action right now.</p>}
        {target && href && <Link className="btn sm" href={href}>Open in Mastery Tracker <ArrowRight size={13} /></Link>}
      </div>
      {lead.attention.length > 0 && <><h3 className="tl-lead-h">Worth a look</h3><Attention items={lead.attention} empty="" /></>}
    </section>
  );
}

// ── Office ───────────────────────────────────────────────────────────────────

const FOCUS_TITLE = { all: 'At a glance', fees: 'Fees', care: 'Wellbeing and counselling', register: 'The register' } as const;

function OfficeLead({ lead, t, events, student }: Props) {
  const focus = lead.focus ?? 'all';
  const name = first(student.name);
  return (
    <section className="card tl-lead" aria-label={FOCUS_TITLE[focus]}>
      <h2 className="tl-lead-title">{FOCUS_TITLE[focus]}: {name}</h2>
      {focus === 'fees' && (
        lead.fees ? (
          <div className="tl-big3">
            <div><span>Billed this year</span><b>{inr(lead.fees.billed)}</b></div>
            <div><span>Paid</span><b className="g">{inr(lead.fees.paid)}</b></div>
            <div><span>Due</span><b className={lead.fees.due > 0 ? 'a' : 'g'}>{inr(lead.fees.due)}</b></div>
          </div>
        ) : <p className="tl-lead-none">No fees billed this year.</p>
      )}
      {focus === 'care' && lead.care && (
        <div className="tl-care">
          <div>
            <h3 className="tl-lead-h">Check-ins, last six months</h3>
            {lead.care.months.length ? (
              <ul className="tl-carebars" aria-label="Check-ins and low days by month">
                {lead.care.months.map(m => {
                  const max = Math.max(...lead.care!.months.map(x => x.checkins), 1);
                  return (
                    <li key={m.month} title={`${LONG[Number(m.month.slice(5, 7)) - 1]}: ${m.checkins} check-ins, ${m.low} low`}>
                      <span className="bar"><i style={{ height: `${(m.checkins / max) * 100}%` }} /><i className="low" style={{ height: `${(m.low / max) * 100}%` }} /></span>
                      <small>{MONTHS[Number(m.month.slice(5, 7)) - 1]}</small>
                      <em>{m.low} low</em>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="tl-lead-none">No check-ins recorded.</p>}
          </div>
          {lead.care.counselling !== null && <dl className="tl-mini"><div><dt>Counselling</dt><dd>{lead.care.counselling}</dd></div></dl>}
        </div>
      )}
      {focus === 'register' && (
        <dl className="tl-reg">
          {t.years.map(y => <div key={y.session}><dt>{y.session}</dt><dd>{y.cls ?? 'Class not recorded'}{y.outcome ? `, ${y.outcome}` : ''}</dd></div>)}
          {t.before && <div><dt>Before</dt><dd>{[t.before.school, t.before.cls].filter(Boolean).join(', ') || 'Another school'}</dd></div>}
          <div><dt>Certificates</dt><dd>{events.filter(e => e.kind === 'certificates').length}</dd></div>
          <div><dt>Documents</dt><dd>{events.filter(e => e.kind === 'documents').length} on file</dd></div>
        </dl>
      )}
      <div className="tl-cols">
        <div>
          <h3 className="tl-lead-h">Needs attention</h3>
          <Attention items={lead.attention} empty="Nothing needs attention right now." />
        </div>
        {focus === 'all' && (
          <div>
            <h3 className="tl-lead-h">Recent milestones</h3>
            <Wins wins={lead.wins} empty="Nothing new in the last six weeks." />
          </div>
        )}
      </div>
    </section>
  );
}
