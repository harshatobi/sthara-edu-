'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GraduationCapIcon as GraduationCap } from '@phosphor-icons/react/dist/ssr/GraduationCap';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import { ExamIcon as Exam } from '@phosphor-icons/react/dist/ssr/Exam';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { NotebookIcon as Notebook } from '@phosphor-icons/react/dist/ssr/Notebook';
import { CurrencyInrIcon as CurrencyInr } from '@phosphor-icons/react/dist/ssr/CurrencyInr';
import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { CertificateIcon as Certificate } from '@phosphor-icons/react/dist/ssr/Certificate';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { FirstAidKitIcon as FirstAidKit } from '@phosphor-icons/react/dist/ssr/FirstAidKit';
import { GavelIcon as Gavel } from '@phosphor-icons/react/dist/ssr/Gavel';
import { WarningCircleIcon as WarningCircle } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import { HandHeartIcon as HandHeart } from '@phosphor-icons/react/dist/ssr/HandHeart';
import { SmileyIcon as Smiley } from '@phosphor-icons/react/dist/ssr/Smiley';
import { SignInIcon as SignIn } from '@phosphor-icons/react/dist/ssr/SignIn';
import { ClockCounterClockwiseIcon as Clock } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { PaperPlaneRightIcon as Send } from '@phosphor-icons/react/dist/ssr/PaperPlaneRight';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { useGet } from '@/components/canon/useGet';
import { CardHead } from '@/components/admin/kit';
import PrintFoot from '@/components/ui/PrintFoot';
import { fmtDate, inr } from '@/lib/admin/format';
import { useCall } from '@/lib/exams/useApi';
import { SOURCE_LABEL, type Source, type Timeline as TL, type TimelineEvent, type Year } from '@/lib/timeline/rules';
import '@/styles/timeline.css';

const ICON: Record<Source, ReactNode> = {
  enrolment: <GraduationCap size={16} weight="duotone" />, before: <SignIn size={16} weight="duotone" />, attendance: <CalendarCheck size={16} weight="duotone" />,
  results: <Exam size={16} weight="duotone" />, tml: <ChartLineUp size={16} weight="duotone" />, homework: <Notebook size={16} weight="duotone" />,
  fees: <CurrencyInr size={16} weight="duotone" />, kirti: <Trophy size={16} weight="duotone" />, certificates: <Certificate size={16} weight="duotone" />,
  documents: <FileText size={16} weight="duotone" />, health: <FirstAidKit size={16} weight="duotone" />, discipline: <Gavel size={16} weight="duotone" />,
  incidents: <WarningCircle size={16} weight="duotone" />, counselling: <HandHeart size={16} weight="duotone" />, wellness: <Smiley size={16} weight="duotone" />,
};

interface Student { id: string; name: string; admissionNo: string | null }
interface Data { student: Student; timeline: TL }
interface PrintData extends Data { events: Record<string, TimelineEvent[]> }

const WHO_NOTE: Record<TL['who'], string> = {
  office: 'What your office roles allow. Child-protection cases never appear here.',
  class_teacher: 'The teaching side, as their class teacher.',
  subject_teacher: 'Attendance and your own subjects.',
  parent: 'What the school has recorded for your child. Warnings and detentions clear at the start of each school year.',
  student: 'Your years at school.',
};

/**
 * The unified timeline (Living Record brief 08), the same screen in every portal: a summary per school year, each
 * year's events on demand, Ask (AI) about the timeline, and the printable student file (office and parents). The
 * server decides what the viewer sees; `query` names the student (studentId=… or login=…).
 */
export default function Timeline({ query }: { query: string }) {
  const { data, error } = useGet<Data>(`/api/timeline?${query}`);
  const [open, setOpen] = useState<string | null>(null);
  const [printing, setPrinting] = useState<PrintData | null>(null);
  const [printErr, setPrintErr] = useState<string | null>(null);
  const call = useCall();

  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div className="card">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={22} style={{ marginBottom: 14 }} />)}</div>;
  const t = data.timeline;
  // The newest year starts open.
  const shown = open ?? t.years[0]?.session ?? '';

  const print = async () => {
    setPrintErr(null);
    try {
      const d = await call<PrintData>(`/api/timeline?${query}&print=1`);
      setPrinting(d);
    } catch (e) { setPrintErr(e instanceof Error ? e.message : 'Could not prepare the student file.'); }
  };

  return (
    <div className="tl">
      <div className="card" style={{ marginBottom: 14 }}>
        <CardHead title="Timeline" sub={WHO_NOTE[t.who]} right={t.print ? <button className="btn sm" onClick={print}><Printer size={14} /> Print the student file</button> : undefined} />
        {printErr && <div className="note err" role="alert" style={{ marginBottom: 10 }}>{printErr}</div>}
        {!t.years.length && !t.before ? <Empty icon={<Clock size={26} weight="duotone" />} title="Nothing recorded yet">Each school year appears here as the school records attendance, results and more.</Empty> : (
          <ol className="tl-years">
            {t.years.map(y => <YearCard key={y.session} y={y} t={t} open={shown === y.session} onToggle={() => setOpen(shown === y.session ? '' : y.session)} query={query} />)}
            {t.before && (
              <li className="tl-year tl-before">
                <div className="tl-head static"><span className="tl-ico">{ICON.before}</span><div><b>Before joining</b>
                  <div className="muted" style={{ fontSize: 13 }}>{[t.before.school, t.before.cls && `last class ${t.before.cls}`, t.before.tcNo && `TC ${t.before.tcNo}`].filter(Boolean).join(' · ') || 'Another school'}{t.before.admittedOn ? ` · admitted ${fmtDate(t.before.admittedOn)}` : ''}</div></div></div>
              </li>
            )}
          </ol>
        )}
      </div>
      {t.years.length > 0 && <Ask query={query} who={t.who} />}
      {printing && <StudentFile d={printing} onDone={() => setPrinting(null)} />}
    </div>
  );
}

function Stats({ y }: { y: Year }) {
  const s: { k: Source; label: string; value: string; tone?: 'g' | 'a' | 'r' | 'b' | 'n' }[] = [];
  if (y.attendance !== undefined) s.push({ k: 'attendance', label: 'Attendance', value: y.attendance?.pct != null ? `${y.attendance.pct}%` : '—', tone: y.attendance?.pct == null ? 'n' : y.attendance.pct >= 90 ? 'g' : y.attendance.pct >= 75 ? 'a' : 'r' });
  if (y.results !== undefined) s.push({ k: 'results', label: y.results?.term ?? 'Results', value: y.results ? (y.results.pct !== null ? `${y.results.pct}%${y.results.grade ? ` ${y.results.grade}` : ''}` : y.results.subjects.map(x => `${x.name.split(' ')[0]} ${x.grade ?? (x.pct !== null ? `${x.pct}%` : '—')}`).join(', ') || '—') : '—' });
  if (y.tml !== undefined) s.push({ k: 'tml', label: 'Mastery', value: y.tml ? `${y.tml.score}% ${y.tml.band}` : '—', tone: !y.tml ? 'n' : y.tml.score >= 75 ? 'g' : y.tml.score >= 50 ? 'a' : 'r' });
  if (y.homework !== undefined) s.push({ k: 'homework', label: 'Homework', value: y.homework ? `${y.homework.done}/${y.homework.set}` : '—' });
  if (y.fees !== undefined) s.push({ k: 'fees', label: 'Fees due', value: y.fees ? inr(y.fees.due) : '—', tone: y.fees && y.fees.due > 0 ? 'a' : 'n' });
  if (y.kirti !== undefined) s.push({ k: 'kirti', label: 'Kirti', value: String(y.kirti), tone: y.kirti ? 'g' : 'n' });
  if (y.discipline !== undefined) s.push({ k: 'discipline', label: 'Discipline', value: String(y.discipline), tone: y.discipline ? 'a' : 'n' });
  if (y.incidents !== undefined) s.push({ k: 'incidents', label: 'Incidents', value: String(y.incidents), tone: y.incidents ? 'a' : 'n' });
  if (y.counselling !== undefined) s.push({ k: 'counselling', label: 'Counselling', value: y.counselling ?? 'None' });
  if (y.wellness !== undefined) s.push({ k: 'wellness', label: 'Wellbeing', value: y.wellness ? `${y.wellness.checkins} check-ins` : '—', tone: y.wellness && y.wellness.low >= 3 ? 'a' : 'n' });
  return (
    <div className="tl-stats">
      {s.map(x => <div key={x.k} className={`tl-stat t-${x.tone ?? 'n'}`}><span className="tl-ico">{ICON[x.k]}</span><div><div className="tl-k">{x.label}</div><div className="tl-v">{x.value}</div></div></div>)}
    </div>
  );
}

function YearCard({ y, t, open, onToggle, query }: { y: Year; t: TL; open: boolean; onToggle: () => void; query: string }) {
  const id = `tl-${y.session}`;
  return (
    <li className={`tl-year${open ? ' on' : ''}`}>
      <button className="tl-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="tl-ico">{ICON.enrolment}</span>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <b>{y.session}</b> <span className="muted">· {y.cls ?? 'class not recorded'}</span>
          {y.outcome ? <Chip tone={y.outcome.startsWith('Promoted') ? 'g' : 'a'} className="tl-chip">{y.outcome.toUpperCase()}</Chip> : null}
        </div>
        <CaretDown size={16} className="tl-caret" />
      </button>
      <Stats y={y} />
      {open && <div id={id}><Events session={y.session} query={query} subjects={t.subjects} /></div>}
    </li>
  );
}

function Events({ session, query, subjects }: { session: string; query: string; subjects: string[] | null }) {
  const { data, error } = useGet<{ events: TimelineEvent[] }>(`/api/timeline?${query}&session=${session}`);
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div style={{ padding: '6px 0' }}>{[0, 1, 2].map(i => <Skeleton key={i} h={16} style={{ marginBottom: 10 }} />)}</div>;
  if (!data.events.length) return <p className="muted" style={{ fontSize: 13.5, padding: '6px 0' }}>Nothing recorded this year{subjects ? ' in your subjects' : ''}.</p>;
  return <EventList events={data.events} />;
}

function EventList({ events }: { events: TimelineEvent[] }) {
  return (
    <ul className="tl-events">
      {events.map((e, i) => (
        <li key={i} className={`tl-ev t-${e.tone}`}>
          <span className="tl-ico" title={SOURCE_LABEL[e.kind]}>{ICON[e.kind]}</span>
          <div className="tl-when">{fmtDate(e.on, true)}</div>
          <div><div className="tl-title">{e.title}</div>{e.detail && <div className="muted tl-detail">{e.detail}</div>}</div>
        </li>
      ))}
    </ul>
  );
}

const STARTERS: Record<TL['who'], string[]> = {
  office: ['How has attendance changed over the years?', 'Which subjects have improved most?', 'Anything we should follow up this year?'],
  class_teacher: ['How has attendance changed over the years?', 'Which subjects need attention this year?'],
  subject_teacher: ['How is my subject going compared with last year?', 'Is homework being handed in?'],
  parent: ['How has my child’s attendance changed?', 'Which subjects have improved most?', 'What should we work on at home?'],
  student: ['How have I improved since last year?', 'Which subject should I work on?'],
};

/** Ask (AI) about the timeline. The answer comes only from what this viewer can already see. */
function Ask({ query, who }: { query: string; who: TL['who'] }) {
  const call = useCall();
  const [turns, setTurns] = useState<{ role: 'me' | 'os'; text: string }[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [more, setMore] = useState<string[]>(STARTERS[who]);
  const send = async (q: string) => {
    const msg = q.trim();
    if (!msg || busy) return;
    const next = [...turns, { role: 'me' as const, text: msg }];
    setTurns(next); setText(''); setBusy(true); setErr(null);
    try {
      const params = Object.fromEntries(new URLSearchParams(query));
      const r = await call<{ answer: { say: string; suggestions: string[] } }>('/api/timeline', 'POST', { ...params, messages: next });
      setTurns([...next, { role: 'os', text: r.answer.say }]);
      setMore(r.answer.suggestions);
    } catch (e) { setErr(e instanceof Error ? e.message : 'No answer came back.'); setTurns(turns); setText(msg); }
    finally { setBusy(false); }
  };
  return (
    <div className="card tl-ask">
      <CardHead title="Ask about this timeline" sub={<span className="tl-ai"><Sparkle size={13} weight="fill" /> AI · answers only from what you can see above</span>} />
      {turns.length > 0 && (
        <div className="tl-turns" aria-live="polite">
          {turns.map((m, i) => <div key={i} className={`tl-turn ${m.role}`}>{m.role === 'os' && <span className="tl-ai sm"><Sparkle size={11} weight="fill" /> AI</span>}<div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div></div>)}
          {busy && <Skeleton h={16} w="60%" />}
        </div>
      )}
      {err && <div className="note err" role="alert" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="tl-suggest">{more.map(s => <button key={s} className="btn sm" disabled={busy} onClick={() => send(s)}>{s}</button>)}</div>
      <form className="tl-form" onSubmit={e => { e.preventDefault(); void send(text); }}>
        <label htmlFor="tl-q" className="tl-sr">Your question</label>
        <input id="tl-q" className="cmp-in" value={text} maxLength={1500} onChange={e => setText(e.target.value)} placeholder="Ask a question about these years" />
        <button className="btn pri" disabled={busy || !text.trim()}><Send size={15} /> Ask</button>
      </form>
    </div>
  );
}

/** The student file: every year's summary and events on A4, printed from a document of its own. */
function StudentFile({ d, onDone }: { d: PrintData; onDone: () => void }) {
  useEffect(() => {
    document.body.classList.add('print-tl');
    const done = () => { document.body.classList.remove('print-tl'); window.removeEventListener('afterprint', done); onDone(); };
    window.addEventListener('afterprint', done);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    return () => { cancelAnimationFrame(raf); window.removeEventListener('afterprint', done); document.body.classList.remove('print-tl'); };
  }, [onDone]);
  const t = d.timeline;
  return createPortal(
    <div className="tl-doc" aria-hidden="true">
      <PrintFoot />
      <header className="tl-doc-head">
        <div><div className="tl-doc-eyebrow">STUDENT FILE</div><h1>{d.student.name}</h1>
          <div>{d.student.admissionNo ? `Admission no. ${d.student.admissionNo} · ` : ''}Printed {fmtDate(new Date().toISOString())}</div></div>
        <div className="tl-doc-scope">{t.sources.filter(s => s !== 'enrolment').map(s => SOURCE_LABEL[s]).join(' · ')}{t.subjects ? ` (${t.subjects.join(', ')})` : ''}</div>
      </header>
      {t.years.map(y => (
        <section key={y.session} className="tl-doc-year">
          <h2>{y.session} · {y.cls ?? 'class not recorded'}{y.outcome ? ` · ${y.outcome}` : ''}</h2>
          <Stats y={y} />
          <EventList events={d.events[y.session] || []} />
        </section>
      ))}
      {t.before && <section className="tl-doc-year"><h2>Before joining</h2><p>{[t.before.school, t.before.cls && `last class ${t.before.cls}`, t.before.tcNo && `TC ${t.before.tcNo}`].filter(Boolean).join(' · ')}</p></section>}
    </div>,
    document.body,
  );
}
