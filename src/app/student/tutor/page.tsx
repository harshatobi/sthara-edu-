'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import { CameraIcon as Camera } from '@phosphor-icons/react/dist/ssr/Camera';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr/ClockCounterClockwise';
import { FlagIcon as Flag } from '@phosphor-icons/react/dist/ssr/Flag';
import { PushPinIcon as PushPin } from '@phosphor-icons/react/dist/ssr/PushPin';
import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { PaperPlaneRightIcon as PaperPlaneRight } from '@phosphor-icons/react/dist/ssr/PaperPlaneRight';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { TrendDownIcon as TrendDown } from '@phosphor-icons/react/dist/ssr/TrendDown';
import { TrendUpIcon as TrendUp } from '@phosphor-icons/react/dist/ssr/TrendUp';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import { subjectIcon } from '@/components/canon/subjectIcon';
import { subjectColor } from '@/lib/student/shape';
import { Bar, Chip, Donut, PageBar, Skeleton, hmColor, AiTag } from '@/components/canon/ui';
import DemoNote from '@/components/canon/DemoNote';
import { useAuth } from '@/contexts/AuthContext';
import { useStudentDesk } from '@/lib/student/useStudentDesk';
import { DEMO_TUTOR } from '@/lib/demo/student';
import { compressPhoto } from '@/lib/grading/compress';
import { coreSubjectsForClass, flattenChapters, getCurriculum } from '@/lib/curriculum';

interface Topic { subject: string; name: string; start: number | null; mode?: 'hots' }

export default function TutorPage() {
  return <Suspense fallback={<Skeleton h={600} style={{ borderRadius: 20 }} />}><Tutor /></Suspense>;
}

function Tutor() {
  const { desk } = useStudentDesk();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const fromUrl = params.get('topic');
  const topic: Topic | null = useMemo(() => {
    if (!fromUrl) return null;
    const subject = params.get('subject') || 'General';
    const s = Number(params.get('score'));
    return { subject, name: fromUrl, start: Number.isFinite(s) && params.get('score') !== null ? s : null, ...(params.get('mode') === 'hots' ? { mode: 'hots' as const } : {}) };
  }, [fromUrl, params]);

  const sessionId = params.get('session');
  // A picked topic starts a fresh session (the nonce lets "Retry" start another on the same topic).
  const [nonce, setNonce] = useState(0);
  // History and open assignments (one fetch for the picker's cards and the history list).
  const hist = useHistory(!desk || desk.mode === 'demo');
  const choose = (t: Topic) => {
    const p = new URLSearchParams({ topic: t.name, subject: t.subject });
    if (t.start !== null) p.set('score', String(t.start));
    if (t.mode === 'hots') p.set('mode', 'hots');
    setNonce(n => n + 1);
    router.replace(`${pathname}?${p}`);
  };
  const openSession = (id: string) => { setNonce(n => n + 1); router.replace(`${pathname}?session=${encodeURIComponent(id)}`); };
  // Once a new session exists its id joins the URL, so a reload resumes it instead of starting another.
  // The session component keeps its key (the nonce), so this doesn't remount it.
  const opened = (id: string) => {
    const p = new URLSearchParams(params.toString());
    p.set('session', id);
    window.history.replaceState(null, '', `${pathname}?${p}`);
  };
  const reset = () => router.replace(pathname);

  if (!desk) return <Skeleton h={600} style={{ borderRadius: 20 }} />;
  const demo = desk.mode === 'demo';

  return (
    <>
      {demo && <DemoNote />}
      {demo && topic ? <DemoSession topic={topic} onNew={reset} />
        : sessionId || topic ? <LiveSession key={`live:${nonce}`} sessionId={sessionId} topic={topic} onNew={reset} onPick={choose} onOpened={opened} />
        : <><Picker desk={desk} onPick={choose} demo={demo} assignments={hist.assignments} /><History demo={demo} h={hist} onOpen={openSession} onPick={choose} /></>}
    </>
  );
}

// ── Topic picker: weakest micro-topics first, or any topic typed in ─────────
interface ExamOption { id: string; exam: string; cycle: string; track: string }

/** The student's exam track: exams the school has switched on, and which the student picked. */
function useExamTrack(demo: boolean) {
  const { getAuthToken } = useAuth();
  // getAuthToken is a new function each render; keep the load effect from re-running on it.
  const tokenRef = useRef(getAuthToken);
  useEffect(() => { tokenRef.current = getAuthToken; });
  const [available, setAvailable] = useState<ExamOption[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (demo) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/student/exam-track', { headers: { Authorization: `Bearer ${await tokenRef.current()}` } });
        const d = await res.json().catch(() => ({}));
        if (live && res.ok) { setAvailable(d.available ?? []); setChosen(d.chosen ?? []); }
      } catch { /* the picker works without an exam track */ }
    })();
    return () => { live = false; };
  }, [demo]);
  const toggle = async (id: string) => {
    const next = chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id];
    const before = chosen;
    setChosen(next); setErr(null);
    try {
      const res = await fetch('/api/student/exam-track', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAuthToken()}` }, body: JSON.stringify({ exams: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save your exam track.');
      setChosen(d.chosen ?? next);
    } catch (e) { setChosen(before); setErr(e instanceof Error ? e.message : 'Could not save your exam track.'); }
  };
  return { available, chosen, toggle, err };
}

interface MyChapter { name: string; unit: string; topics: string[]; exams: string[]; formativeOnly: boolean }
interface MySubject { key: string; name: string; level: string; source: string; chapters: MyChapter[] }

/**
 * The subjects the tutor will take for this student: their enrolled subjects from the
 * server (class core subjects and chosen electives). The demo desk has no enrolment, so
 * it shows its class's compulsory subjects from the curriculum.
 */
function useMySubjects(demo: boolean, cls: string) {
  const { getAuthToken } = useAuth();
  const tokenRef = useRef(getAuthToken);
  useEffect(() => { tokenRef.current = getAuthToken; });
  const demoSubjects = useMemo<MySubject[]>(() => !demo ? [] : coreSubjectsForClass(cls).flatMap(name => {
    const c = getCurriculum(cls, name);
    return c ? [{ key: name.toLowerCase(), name: c.subject, level: c.class, source: 'core', chapters: flattenChapters(c).map(ch => ({ name: ch.name, unit: ch.unitName, topics: ch.topics, exams: [], formativeOnly: !!ch.formativeOnly })) }] : [];
  }), [demo, cls]);
  const [live, setLive] = useState<{ subjects: MySubject[]; err: string | null } | null>(null);
  useEffect(() => {
    if (demo) return;
    let on = true;
    (async () => {
      try {
        const res = await fetch('/api/student/subjects', { headers: { Authorization: `Bearer ${await tokenRef.current()}` } });
        const d = await res.json().catch(() => ({}));
        if (on) setLive(res.ok ? { subjects: d.subjects ?? [], err: null } : { subjects: [], err: d.error || 'Could not load your subjects.' });
      } catch { if (on) setLive({ subjects: [], err: 'Could not load your subjects.' }); }
    })();
    return () => { on = false; };
  }, [demo]);
  return demo ? { subjects: demoSubjects, loading: false, err: null } : { subjects: live?.subjects ?? [], loading: !live, err: live?.err ?? null };
}

function Picker({ desk, onPick, demo, assignments }: { desk: NonNullable<ReturnType<typeof useStudentDesk>['desk']>; onPick: (t: Topic) => void; demo: boolean; assignments: TutorAssignment[] }) {
  const track = useExamTrack(demo);
  const mine = useMySubjects(demo, desk.me.cls);
  const taken = new Set(mine.subjects.map(s => s.name.toLowerCase()));
  // Weakest micro-topics first, in subjects the student actually takes.
  const weakest = desk.subjects
    .filter(s => demo || taken.has(s.subject.toLowerCase()))
    .flatMap(s => s.topics.filter(t => t.score !== null).map(t => ({ subject: s.subject, name: t.name, start: t.score })))
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
    .slice(0, 5);
  // Exemplary chapters (90%+) unlock HOTS / Olympiad sessions.
  const exemplary = desk.subjects
    .filter(s => demo || taken.has(s.subject.toLowerCase()))
    .flatMap(s => s.topics.filter(t => t.score !== null && t.score >= 90).map(t => ({ subject: s.subject, name: t.name, start: t.score })))
    .sort((a, b) => (b.start ?? 0) - (a.start ?? 0))
    .slice(0, 5);
  const [subjectName, setSubject] = useState('');
  const subject = mine.subjects.find(s => s.name === subjectName) ?? mine.subjects[0];
  const [chapter, setChapter] = useState('');
  const [micro, setMicro] = useState('');
  const [custom, setCustom] = useState('');
  const OTHER = '__other__';
  const ch = subject?.chapters.find(c => c.name === chapter);
  const units = subject ? [...new Set(subject.chapters.map(c => c.unit))] : [];
  const examNames = (ids: string[]) => ids.map(id => track.available.find(e => e.id === id)?.exam.replace(/ \(.*\)$/, '') ?? id);
  const topicName = chapter === OTHER ? custom.trim() : micro || chapter;

  return (
    <>
      <PageBar eyebrow="SOCRATIC AI TUTOR" title="Pick a micro-topic"
        sub="Diagnose, guided steps if you need them, a problem on your own, then explain it back. Never straight to the answer." />
      {assignments.length > 0 && <Assigned items={assignments} onPick={onPick} />}
      <div className="g2">
        <div className="card">
          <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>Where you&apos;ll gain the most</h3>
          <p className="muted" style={{ marginBottom: 12 }}>Your lowest-scoring micro-topics right now. Reasoning it through, solving one on your own and explaining it back all count.</p>
          {weakest.length === 0 ? <p className="muted">Nothing scored yet — pick a chapter on the right.</p> : weakest.map(t => (
            <button key={`${t.subject}:${t.name}`} className="row" onClick={() => onPick(t)}>
              <div className="av" style={{ background: `color-mix(in srgb, ${subjectColor(t.subject)} 10%, #fff)` }}><InteractiveIcon icon={subjectIcon(t.subject)} color={subjectColor(t.subject)} size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.subject}</div>
              </div>
              <b style={{ color: hmColor(t.start ?? 0), fontSize: 15 }}>{t.start}%</b>
            </button>
          ))}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>From your syllabus</h3>
          <p className="muted" style={{ marginBottom: 18 }}>
            Your subjects, with the chapters and micro-topics of the official CBSE curriculum. The tutor only takes topics from your syllabus.
          </p>
          {mine.loading ? <Skeleton h={180} /> : mine.err ? <div className="note err">{mine.err}</div> : !subject ? (
            <div className="note">Your school hasn&apos;t set up your subjects in Sthara yet, so the tutor can&apos;t start. Please tell your class teacher.</div>
          ) : (
            <form onSubmit={e => { e.preventDefault(); if (topicName) onPick({ subject: subject.name, name: topicName, start: null }); }}>
              <label className="lbl" htmlFor="tp-subj">SUBJECT</label>
              <select id="tp-subj" className="tin" style={{ width: '100%', marginBottom: 14 }} value={subject.name}
                onChange={e => { setSubject(e.target.value); setChapter(''); setMicro(''); }}>
                {mine.subjects.map(s => <option key={s.key} value={s.name}>{s.name}{s.source === 'elective' ? ' (elective)' : ''}</option>)}
              </select>
              <label className="lbl" htmlFor="tp-ch">CHAPTER</label>
              <select id="tp-ch" className="tin" style={{ width: '100%', marginBottom: 14 }} value={chapter} onChange={e => { setChapter(e.target.value); setMicro(''); }}>
                <option value="" disabled>Choose a chapter</option>
                {units.map(u => (
                  <optgroup key={u} label={u}>
                    {subject.chapters.filter(c => c.unit === u).map(c => (
                      <option key={c.name} value={c.name}>{c.name}{c.formativeOnly ? ' (not in board exam)' : ''}{c.exams.length ? ` · ${examNames(c.exams).join(', ')}` : ''}</option>
                    ))}
                  </optgroup>
                ))}
                <option value={OTHER}>Something else from this subject…</option>
              </select>
              {ch && ch.topics.length > 1 && (
                <>
                  <label className="lbl" htmlFor="tp-micro">MICRO-TOPIC</label>
                  <select id="tp-micro" className="tin" style={{ width: '100%', marginBottom: 14 }} value={micro} onChange={e => setMicro(e.target.value)}>
                    <option value="">The whole chapter</option>
                    {ch.topics.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </>
              )}
              {chapter === OTHER && (
                <>
                  <label className="lbl" htmlFor="tp-topic">WHAT DO YOU WANT TO WORK ON?</label>
                  <input id="tp-topic" className="tin" style={{ width: '100%' }} maxLength={120} placeholder="e.g. why pH matters for toothpaste" value={custom} onChange={e => setCustom(e.target.value)} />
                  <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>The tutor checks it belongs to your syllabus first.</p>
                </>
              )}
              <button className="btn ai" style={{ marginTop: 16 }} disabled={!topicName}>Start session <AiTag /><ArrowRight size={15} weight="bold" /></button>
            </form>
          )}
        </div>
      </div>
      {exemplary.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}><Trophy size={18} weight="bold" /> Stretch yourself: HOTS</h3>
          <p className="muted" style={{ marginBottom: 12 }}>You&apos;re at 90% or more on these, so harder Olympiad-style sessions are open. They count toward your mastery like any session.</p>
          {exemplary.map(t => (
            <div key={`${t.subject}:${t.name}`} className="row">
              <div className="av" style={{ background: `color-mix(in srgb, ${subjectColor(t.subject)} 10%, #fff)` }}><InteractiveIcon icon={subjectIcon(t.subject)} color={subjectColor(t.subject)} size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div><div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.subject}</div></div>
              <b style={{ color: hmColor(t.start ?? 0), fontSize: 15, marginRight: 8 }}>{t.start}%</b>
              <button className="btn sm ai" onClick={() => onPick({ ...t, mode: 'hots' })}>HOTS session <ArrowRight size={13} weight="bold" /></button>
            </div>
          ))}
        </div>
      )}
      {track.available.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Exam track</h3>
          <p className="muted" style={{ marginBottom: 12 }}>Preparing for an entrance exam? Pick it and the tutor marks the chapters that feed it and takes sessions to exam depth, including topics beyond the board syllabus.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Exam track">
            {track.available.map(e => (
              <button key={e.id} type="button" className={`ch ${track.chosen.includes(e.id) ? 'b' : ''}`} aria-pressed={track.chosen.includes(e.id)} onClick={() => track.toggle(e.id)}>
                {e.exam.replace(/ \(.*\)$/, '')} <span className="muted" style={{ fontSize: 11 }}>{e.cycle}</span>
              </button>
            ))}
          </div>
          {track.err && <p className="muted" style={{ marginTop: 8, color: '#E11D48' }}>{track.err}</p>}
        </div>
      )}
    </>
  );
}

// ── One Socratic session ─────────────────────────────────────────────────────
/** Why a session didn't start (or stopped): the grounding engine's verdict, for the student. */
interface Stopped { kind: 'refused' | 'safety' | 'wellbeing' | 'warning' | 'paused'; text: string; suggestions?: { subject: string; chapter: string }[]; href?: string }

type StageKey = 'diagnose' | 'scaffold' | 'transfer' | 'teachback' | 'done';
interface Msg { role: 'tutor' | 'student'; stage: StageKey; kind: string; text: string }
interface Rubric { independence: number; reasoning: number; transfer: number; teachback: number; depth: number }
interface SessionSummary { strengths: string[]; toFix: string[]; next: string }
interface SessionView {
  id: string; subject: string; topic: string; mode: 'standard' | 'hots'; status: 'open' | 'done'; stage: StageKey; seq: number;
  grounded: { subject: string; chapter: string; microTopic: string | null; level: string | null; kind: string | null };
  progress: { stage: Exclude<StageKey, 'done'>; status: 'done' | 'current' | 'todo' | 'skipped' }[] | null;
  step: { n: number; total: number } | null; hintsOnStep: number; messages: Msg[];
  result: { depth: number | null; rubric: Rubric | null; summary: SessionSummary | null; topicScore: number | null; band: string | null; misconceptions: string[] } | null;
  purged: boolean;
}

const STAGE_LABEL: Record<Exclude<StageKey, 'done'>, string> = { diagnose: 'Diagnose', scaffold: 'Guided steps', transfer: 'On your own', teachback: 'Explain it back' };
const STAGE_HELP: Record<Exclude<StageKey, 'done'>, string> = {
  diagnose: 'Answer and say why. A strong answer skips the guided steps.',
  scaffold: 'Work through it step by step. Two hints per step, then I’ll show you.',
  transfer: 'A new problem on the same idea. No hints this time: show your reasoning.',
  teachback: 'Explain the idea in your own words, as if to a classmate.',
};
const STUCK_LABEL: Record<Exclude<StageKey, 'done'>, string> = {
  diagnose: 'I’m not sure — guide me', scaffold: 'I’m stuck — show me this step', transfer: 'Show me the solution', teachback: 'Skip the explanation',
};
const MAX_STEP_HINTS = 2;

async function readPhoto(file: File): Promise<{ data: string; url: string }> {
  const blob = await compressPhoto(file, 1600, 0.8);
  const data = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:image\/\w+;base64,/, ''));
    r.onerror = () => rej(new Error('The photo couldn’t be read.'));
    r.readAsDataURL(blob);
  });
  return { data, url: URL.createObjectURL(blob) };
}

function LiveSession({ topic, sessionId, onNew, onPick, onOpened }: {
  topic: Topic | null; sessionId: string | null; onNew: () => void; onPick: (t: Topic) => void; onOpened: (id: string) => void;
}) {
  const { getAuthToken } = useAuth();
  const tokenRef = useRef(getAuthToken);
  useEffect(() => { tokenRef.current = getAuthToken; });
  const [s, setS] = useState<SessionView | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [stopped, setStopped] = useState<Stopped | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [safety, setSafety] = useState(false);
  const [economy, setEconomy] = useState(false);
  const [input, setInput] = useState('');
  const [photo, setPhoto] = useState<{ data: string; url: string } | null>(null);
  const [pending, setPending] = useState<Msg | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const start = topic?.start ?? null;

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [s?.messages.length, busy, pending]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const authed = async (url: string, init?: RequestInit) => {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenRef.current()}`, ...(init?.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const load = async (id: string) => {
    const { res, data } = await authed(`/api/tutor/sessions/${id}`);
    if (!res.ok) throw new Error(data.error || 'Could not open that session.');
    setS(data.session);
  };

  // Open an existing session, or start a new one on the picked topic.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        if (sessionId) { await load(sessionId); return; }
        if (!topic) return;
        const { res, data } = await authed('/api/tutor/session', { method: 'POST', body: JSON.stringify({ action: 'start', subject: topic.subject, topic: topic.name, mode: topic.mode ?? 'standard' }) });
        if (!res.ok) throw new Error(data.error || 'The tutor had trouble starting. Try again.');
        if (data.verdict !== 'session') { setStopped({ kind: data.verdict, text: data.text, suggestions: data.suggestions, href: data.href }); return; }
        setS(data.session); setEconomy(!!data.economy);
        onOpened(data.session.id);
      } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); }
      finally { setBusy(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (action: 'answer' | 'stuck' | 'finish') => {
    if (!s || busy || s.status !== 'open') return;
    const text = input.trim();
    if (action === 'answer' && !text && !photo) return;
    setErr(null); setNotice(null); setBusy(true);
    if (action === 'answer') setPending({ role: 'student', stage: s.stage, kind: photo ? 'photo' : 'answer', text: photo ? [text, 'Photo of working attached'].filter(Boolean).join('\n') : text });
    try {
      const { res, data } = await authed('/api/tutor/session', {
        method: 'POST',
        body: JSON.stringify({ action, id: s.id, seq: s.seq, ...(action === 'answer' ? { answer: text, photo: photo?.data } : {}) }),
      });
      if (!res.ok) {
        if (data.reload) await load(s.id);
        throw new Error(data.error || 'The tutor had trouble answering. Try again.');
      }
      if (data.verdict === 'safety') { setNotice(data.text); setSafety(true); return; }
      if (data.verdict !== 'session') {
        // Warning, off-topic redirect or wellbeing: the session stays where it was.
        setNotice(data.verdict === 'wellbeing' ? `${data.text} (Open Wellness from the menu.)` : data.text);
        return;
      }
      setEconomy(!!data.economy);
      setS(prev => prev ? { ...data.session, messages: [...prev.messages, ...data.session.messages] } : data.session);
      if (action === 'answer') { setInput(''); setPhoto(null); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setPending(null); setBusy(false);
    }
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    try { setPhoto(await readPhoto(file)); } catch (e) { setErr(e instanceof Error ? e.message : 'The photo couldn’t be prepared.'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  if (stopped) {
    return (
      <>
        <PageBar eyebrow="SOCRATIC AI TUTOR" title={stopped.kind === 'safety' ? 'You are not alone' : stopped.kind === 'wellbeing' ? 'Let’s get you to the right place' : stopped.kind === 'paused' ? 'Tutor sessions are paused' : 'Let’s pick something from your syllabus'}
          actions={<button className="btn" onClick={onNew}>Back to topics</button>} />
        <div className="card">
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>{stopped.text}</p>
          {stopped.kind === 'safety' && <SafetyNote />}
          {stopped.kind === 'wellbeing' && stopped.href && <a className="btn pri" style={{ marginTop: 14 }} href={stopped.href}>Open the Wellness Centre</a>}
          {!!stopped.suggestions?.length && (
            <>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: '18px 0 8px' }}>Try one of these instead</h3>
              {stopped.suggestions.map(sg => (
                <button key={`${sg.subject}:${sg.chapter}`} className="row" onClick={() => onPick({ subject: sg.subject, name: sg.chapter, start: null })}>
                  <div className="av" style={{ background: `color-mix(in srgb, ${subjectColor(sg.subject)} 10%, #fff)` }}><InteractiveIcon icon={subjectIcon(sg.subject)} color={subjectColor(sg.subject)} size={18} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{sg.chapter}</div><div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{sg.subject}</div></div>
                  <ArrowRight size={15} weight="bold" />
                </button>
              ))}
            </>
          )}
        </div>
      </>
    );
  }

  if (!s) {
    return (
      <>
        <PageBar eyebrow="SOCRATIC AI TUTOR" title={topic?.name ?? 'Your session'} actions={<button className="btn" onClick={onNew}>Back to topics</button>} />
        {err ? <div className="note err" role="alert">{err}</div> : <Skeleton h={520} style={{ borderRadius: 20 }} />}
      </>
    );
  }

  const open = s.status === 'open';
  const stage = s.stage === 'done' ? null : s.stage;
  const r = s.result;
  const teachback = stage === 'teachback';

  return (
    <>
      <PageBar eyebrow={s.mode === 'hots' ? 'SOCRATIC AI TUTOR · HOTS' : 'SOCRATIC AI TUTOR'} title={s.topic}
        sub={stage ? STAGE_HELP[stage] : 'Session complete.'}
        actions={<>
          {stage === 'scaffold' && <Chip tone="p">HINTS ON THIS STEP: {s.hintsOnStep} OF {MAX_STEP_HINTS}</Chip>}
          {!open && <Chip tone="g">ALL DONE</Chip>}
          <button className="btn" onClick={onNew}>{open ? 'Save and leave' : 'Back to topics'}</button>
        </>}
      />

      {s.progress && (
        <ol className="tstages" aria-label="Session stages">
          {s.progress.map((p, i) => (
            <li key={p.stage} className={`tstage ${p.status}`} aria-current={p.status === 'current' ? 'step' : undefined}>
              <span className="n">{p.status === 'done' ? <Check size={12} weight="bold" /> : i + 1}</span>
              <span>{STAGE_LABEL[p.stage]}{p.stage === 'scaffold' && s.step && p.status === 'current' ? ` · ${s.step.n} of ${s.step.total}` : ''}{p.status === 'skipped' ? ' · skipped' : ''}</span>
            </li>
          ))}
        </ol>
      )}

      {economy && open && <div className="note" style={{ marginBottom: 14 }}>You have used most of this year&apos;s AI allowance, so the tutor is running in a lighter mode for the rest of the year.</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 15 }}>{stage ? STAGE_LABEL[stage] : 'Transcript'}</b>
          <span className="muted" style={{ fontSize: 12 }}>
            {s.grounded.kind === 'prerequisite' ? `Basics from Class ${s.grounded.level} · ` : ''}{s.grounded.subject} › {s.grounded.chapter}{s.grounded.microTopic ? ` › ${s.grounded.microTopic}` : ''}
          </span>
        </div>
        <div className="tlog" ref={logRef} aria-live="polite">
          {s.purged && <div className="note">This session&apos;s conversation was cleared at the end of the academic session. Its score and summary are kept below.</div>}
          {s.messages.map((m, i) => m.role === 'student'
            ? <div key={i} className="bub-me">{m.kind === 'photo' && <Camera size={13} weight="bold" style={{ marginRight: 6, verticalAlign: '-2px' }} />}{m.text}</div>
            : <div key={i} className={`bub-ai${m.kind === 'summary' ? ' bub-done good' : ''}`}><div className="av">{m.kind === 'summary' ? <Check size={17} weight="bold" /> : <Sparkle size={17} weight="fill" />}</div><div>{m.text}</div></div>)}
          {pending && <div className="bub-me">{pending.text}</div>}
          {busy && <div className="bub-ai"><div className="av"><Sparkle size={17} weight="fill" /></div><div><span className="typing" aria-label="Tutor is thinking"><i /><i /><i /></span></div></div>}
        </div>
        {open && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {err && <div className="note err" role="alert">{err}</div>}
            {notice && <div className="note" role="status">{notice}</div>}
            {safety && <SafetyNote />}
            {photo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="Your working" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} />
                <span className="muted" style={{ fontSize: 12, flex: 1 }}>The tutor reads your working, then the photo is discarded. Only what it read is kept.</span>
                <button type="button" className="btn sm" onClick={() => setPhoto(null)} aria-label="Remove photo"><X size={13} weight="bold" /> Remove</button>
              </div>
            )}
            <form style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }} onSubmit={e => { e.preventDefault(); void act('answer'); }}>
              <textarea className="tin" value={input} onChange={e => setInput(e.target.value)} maxLength={1500} rows={teachback ? 4 : 2}
                aria-label="Your answer" style={{ flex: 1, resize: 'vertical', minHeight: 44 }}
                placeholder={teachback ? 'Explain it in your own words…' : 'Your answer, and why…'}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !teachback) { e.preventDefault(); void act('answer'); } }}
                disabled={busy} />
              {!teachback && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={e => void pickPhoto(e.target.files?.[0])} />
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Add a photo of your working" title="Add a photo of your working"><Camera size={16} weight="bold" /></button>
                </>
              )}
              <button className="btn ai" disabled={busy || (!input.trim() && !photo)}><PaperPlaneRight size={15} weight="fill" /> Send <AiTag /></button>
            </form>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {stage && <button className="btn sm" onClick={() => void act('stuck')} disabled={busy}>{STUCK_LABEL[stage]}</button>}
              <button className="btn sm" onClick={() => void act('finish')} disabled={busy} title="Your score counts only what you have done so far"><Flag size={13} weight="bold" /> End session now</button>
            </div>
          </div>
        )}
      </div>

      {!open && r && <ResultCard s={s} start={start} onRetry={() => onPick({ subject: s.subject, name: s.topic, start: r.topicScore ?? start })} />}
    </>
  );
}

function ResultCard({ s, start, onRetry }: { s: SessionView; start: number | null; onRetry: () => void }) {
  const r = s.result!;
  const depth = r.depth ?? 0;
  const parts: [string, keyof Rubric, string][] = [
    ['Independence', 'independence', 'How far you got without hints'],
    ['Reasoning', 'reasoning', 'How well you explained why'],
    ['On your own', 'transfer', 'The new problem, unaided'],
    ['Explain it back', 'teachback', 'Your own-words explanation'],
  ];
  return (
    <div className="g2">
      <div className="card">
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>What this session showed</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
          <Donut value={depth} color={hmColor(depth)} />
          <div>
            <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em' }}>TUTOR DEPTH</div>
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, margin: '8px 0' }}>{Math.round(depth)}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {r.topicScore !== null && start !== null && (
                <Chip tone={r.topicScore >= start ? 'g' : 'a'}>{r.topicScore >= start ? <TrendUp size={13} weight="bold" /> : <TrendDown size={13} weight="bold" />} topic {Math.round(start)}% to {Math.round(r.topicScore)}%</Chip>
              )}
              {r.topicScore !== null && start === null && <Chip tone="b">Topic now {Math.round(r.topicScore)}%</Chip>}
              {r.band && <Chip tone="n">{r.band}</Chip>}
            </div>
          </div>
        </div>
        {r.rubric && parts.map(([label, k, help]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><b>{label}</b><span className="muted">{Math.round(r.rubric![k])}</span></div>
            <Bar value={r.rubric![k]} />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{help}</div>
          </div>
        ))}
        {!r.rubric && <p className="muted" style={{ fontSize: 13 }}>An earlier-style session, scored by hints used.</p>}
        <button className="btn ai" style={{ marginTop: 8 }} onClick={onRetry}><ArrowCounterClockwise size={15} weight="bold" /> Retry this topic</button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Your notes from the tutor <AiTag /></h3>
        {r.summary?.strengths.length ? <><div className="lbl">YOU SHOWED</div><ul style={{ margin: '0 0 14px 18px', lineHeight: 1.6, fontSize: 14 }}>{r.summary.strengths.map(x => <li key={x}>{x}</li>)}</ul></> : null}
        {(r.summary?.toFix.length || r.misconceptions.length) ? (
          <>
            <div className="lbl">TO FIX</div>
            <ul style={{ margin: '0 0 14px 18px', lineHeight: 1.6, fontSize: 14 }}>
              {r.summary?.toFix.map(x => <li key={x}>{x}</li>)}
              {r.misconceptions.filter(m => !r.summary?.toFix.some(t => t.toLowerCase().includes(m.toLowerCase()))).map(m => <li key={m}>{m}</li>)}
            </ul>
          </>
        ) : null}
        {r.summary?.next && <><div className="lbl">NEXT</div><p style={{ fontSize: 14, lineHeight: 1.6 }}>{r.summary.next}</p></>}
        {!r.summary && <p className="muted" style={{ fontSize: 13 }}>No notes for this session.</p>}
      </div>
    </div>
  );
}

// ── The demo desk: a scripted session (no live model) ───────────────────────
function DemoSession({ topic, onNew }: { topic: Topic; onNew: () => void }) {
  const [log, setLog] = useState<{ who: 'ai' | 'me'; text: string }[]>([{ who: 'ai', text: DEMO_TUTOR.steps[0].prompt }]);
  const [step, setStep] = useState(0);
  const [hints, setHints] = useState(0);
  const [done, setDone] = useState(false);
  const [input, setInput] = useState('');
  const send = () => {
    const text = input.trim();
    if (!text || done) return;
    setInput('');
    const s = DEMO_TUTOR.steps[step];
    const next: { who: 'ai' | 'me'; text: string }[] = [{ who: 'me', text }];
    if (s.accept.test(text)) {
      if (step + 1 < DEMO_TUTOR.steps.length) { next.push({ who: 'ai', text: DEMO_TUTOR.steps[step + 1].prompt }); setStep(step + 1); }
      else { next.push({ who: 'ai', text: `${DEMO_TUTOR.answer} is right. In a live session you would now get a new problem to solve on your own, then explain the idea back in your own words.` }); setDone(true); }
    } else {
      const h = Math.min(hints + 1, MAX_STEP_HINTS); setHints(h);
      next.push({ who: 'ai', text: `Hint ${h} of ${MAX_STEP_HINTS}. ${s.hint}` });
    }
    setLog(l => [...l, ...next]);
  };
  return (
    <>
      <PageBar eyebrow="SOCRATIC AI TUTOR" title={DEMO_TUTOR.topic} sub="A scripted example. Sign in for a live session that diagnoses, guides, checks you on your own and asks you to explain it back."
        actions={<button className="btn" onClick={onNew}>Back to topics</button>} />
      {topic.name !== DEMO_TUTOR.topic && <div className="note" style={{ marginBottom: 18 }}>Routed here from <b>{topic.name}</b>. Without a live session the tutor runs its scripted Circles · Tangents example instead.</div>}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="tlog" aria-live="polite">
          {log.map((l, i) => l.who === 'me' ? <div key={i} className="bub-me">{l.text}</div> : <div key={i} className="bub-ai"><div className="av"><Sparkle size={17} weight="fill" /></div><div>{l.text}</div></div>)}
        </div>
        <form style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--line)' }} onSubmit={e => { e.preventDefault(); send(); }}>
          <input className="tin" value={input} onChange={e => setInput(e.target.value)} aria-label="Your answer" placeholder={done ? 'Example finished' : 'Type your answer…'} disabled={done} />
          <button className="btn ai" disabled={done || !input.trim()}><PaperPlaneRight size={15} weight="fill" /> Send</button>
        </form>
      </div>
    </>
  );
}

// ── History: resume, read back, retry ───────────────────────────────────────
interface TutorAssignment {
  id: string; subject: string; topic: string; mode: 'standard' | 'hots'; source: 'critical_gap' | 'teacher';
  dueOn: string | null; note: string | null; score: number | null; assignedAt: string; by: string | null;
}

/** Sessions the student has to do: Critical Gap ones (automatic) and teacher-set ones. */
function Assigned({ items, onPick }: { items: TutorAssignment[]; onPick: (t: Topic) => void }) {
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--purple)' }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}><PushPin size={18} weight="fill" /> Assigned to you</h3>
      <p className="muted" style={{ marginBottom: 8 }}>Finish the whole session (all four stages) to complete it.</p>
      {items.map(a => (
        <div key={a.id} className="row">
          <div className="av" style={{ background: `color-mix(in srgb, ${subjectColor(a.subject)} 10%, #fff)` }}><InteractiveIcon icon={subjectIcon(a.subject)} color={subjectColor(a.subject)} size={18} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{a.topic}{a.mode === 'hots' ? ' · HOTS' : ''}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {a.subject} · {a.source === 'critical_gap' ? `Needed: this chapter is at ${a.score !== null ? Math.round(a.score) : '–'}%` : `From ${a.by ?? 'your teacher'}`}
              {a.dueOn ? ` · due ${new Date(`${a.dueOn}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
            </div>
            {a.note && <div style={{ fontSize: 12.5, marginTop: 4 }}>{a.note}</div>}
          </div>
          <Chip tone={a.source === 'critical_gap' ? 'r' : 'b'}>{a.source === 'critical_gap' ? 'CRITICAL GAP' : 'TEACHER'}</Chip>
          <button className="btn sm ai" style={{ marginLeft: 8 }} onClick={() => onPick({ subject: a.subject, name: a.topic, start: a.score, ...(a.mode === 'hots' ? { mode: 'hots' as const } : {}) })}>Start <ArrowRight size={13} weight="bold" /></button>
        </div>
      ))}
    </div>
  );
}

interface HistoryRow {
  id: string; subject: string; topic: string; microTopic: string | null; mode: string; status: 'open' | 'done'; stage: StageKey | null;
  depth: number | null; legacy: boolean; hints: number; revealed: boolean; startedAt: string; completedAt: string | null; updatedAt: string; previousDepth: number | null;
}

function useHistory(demo: boolean) {
  const { getAuthToken } = useAuth();
  const tokenRef = useRef(getAuthToken);
  useEffect(() => { tokenRef.current = getAuthToken; });
  const [state, setState] = useState<{ rows: HistoryRow[]; assignments: TutorAssignment[]; paused: boolean; err: string | null } | null>(null);
  useEffect(() => {
    if (demo) return;
    let on = true;
    (async () => {
      try {
        const res = await fetch('/api/tutor/sessions', { headers: { Authorization: `Bearer ${await tokenRef.current()}` } });
        const d = await res.json().catch(() => ({}));
        if (on) setState(res.ok ? { rows: d.sessions ?? [], assignments: d.assignments ?? [], paused: d.allowance?.level === 'paused', err: null } : { rows: [], assignments: [], paused: false, err: d.error || 'Could not load your sessions.' });
      } catch { if (on) setState({ rows: [], assignments: [], paused: false, err: 'Could not load your sessions.' }); }
    })();
    return () => { on = false; };
  }, [demo]);
  return demo ? { rows: [], assignments: [] as TutorAssignment[], paused: false, err: null, loading: false }
    : { rows: state?.rows ?? [], assignments: state?.assignments ?? [], paused: !!state?.paused, err: state?.err ?? null, loading: !state };
}

const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function History({ demo, h, onOpen, onPick }: { demo: boolean; h: ReturnType<typeof useHistory>; onOpen: (id: string) => void; onPick: (t: Topic) => void }) {
  const [all, setAll] = useState(false);
  if (demo) return null;
  const open = h.rows.filter(r => r.status === 'open');
  const done = h.rows.filter(r => r.status === 'done');
  const shown = all ? done : done.slice(0, 8);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}><ClockCounterClockwise size={18} weight="bold" /> Your sessions</h3>
      <p className="muted" style={{ marginBottom: 12 }}>Pick up where you left off, read back a session, or try a topic again.</p>
      {h.paused && <div className="note" style={{ marginBottom: 12 }}>{PAUSED_NOTE}</div>}
      {h.loading ? <Skeleton h={120} /> : h.err ? <div className="note err">{h.err}</div> : h.rows.length === 0 ? (
        <p className="muted">No sessions yet. Your first one will show up here.</p>
      ) : (
        <>
          {open.map(r => (
            <div key={r.id} className="row">
              <div className="av" style={{ background: `color-mix(in srgb, ${subjectColor(r.subject)} 10%, #fff)` }}><InteractiveIcon icon={subjectIcon(r.subject)} color={subjectColor(r.subject)} size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.topic}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{r.subject} · unfinished, at {r.stage && r.stage !== 'done' ? STAGE_LABEL[r.stage].toLowerCase() : 'the start'} · {when(r.updatedAt)}</div>
              </div>
              <button className="btn sm ai" onClick={() => onOpen(r.id)}>Resume <ArrowRight size={13} weight="bold" /></button>
            </div>
          ))}
          {shown.map(r => (
            <div key={r.id} className="row">
              <div className="av" style={{ background: `color-mix(in srgb, ${subjectColor(r.subject)} 10%, #fff)` }}><InteractiveIcon icon={subjectIcon(r.subject)} color={subjectColor(r.subject)} size={18} /></div>
              <button style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }} onClick={() => onOpen(r.id)}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.topic}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {r.subject} · {when(r.completedAt ?? r.startedAt)}{r.previousDepth !== null ? ` · before: ${Math.round(r.previousDepth)}` : ''}
                </div>
              </button>
              {r.depth !== null ? <b style={{ color: hmColor(r.depth), fontSize: 15 }}>{Math.round(r.depth)}</b> : <span className="muted" style={{ fontSize: 12 }}>{r.revealed ? 'revealed' : r.hints === 1 ? '1 hint' : `${r.hints} hints`}</span>}
              <button className="btn sm" onClick={() => onPick({ subject: r.subject, name: r.topic, start: null })} aria-label={`Retry ${r.topic}`} title="Retry this topic"><ArrowCounterClockwise size={13} weight="bold" /></button>
            </div>
          ))}
          {done.length > 8 && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setAll(x => !x)}>{all ? 'Show fewer' : `Show all ${done.length}`}</button>}
        </>
      )}
    </div>
  );
}
const PAUSED_NOTE = 'You have used this year’s AI tutor allowance, so new sessions are paused until the next academic session. Your past sessions and scores are all still here.';

/** Shown whenever the tutor stops for a safety reason. */
function SafetyNote() {
  return (
    <div className="note" role="status" style={{ marginTop: 14, lineHeight: 1.6 }}>
      <b>Tele-MANAS: 14416</b> (free, any time, in your language) · <b>Childline: 1098</b><br />
      Someone at your school whose job is to help has been told, and will reach out to you. You can also talk to any teacher you trust.
    </div>
  );
}
