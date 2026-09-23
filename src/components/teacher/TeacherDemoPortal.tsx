'use client';

import { useState } from 'react';
import { SquaresFourIcon as SquaresFour } from '@phosphor-icons/react/dist/ssr/SquaresFour';
import { LightningIcon as Lightning } from '@phosphor-icons/react/dist/ssr/Lightning';
import { ClipboardTextIcon as ClipboardText } from '@phosphor-icons/react/dist/ssr/ClipboardText';
import { BrainIcon as Brain } from '@phosphor-icons/react/dist/ssr/Brain';
import { FireIcon as Fire } from '@phosphor-icons/react/dist/ssr/Fire';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { BellIcon as Bell } from '@phosphor-icons/react/dist/ssr/Bell';
import { HeartIcon as Heart } from '@phosphor-icons/react/dist/ssr/Heart';
import { SignOutIcon as SignOut } from '@phosphor-icons/react/dist/ssr/SignOut';
import { CheckSquareIcon as CheckSquare } from '@phosphor-icons/react/dist/ssr/CheckSquare';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import { colorForIcon } from '@/lib/iconColors';
import { useAuth } from '@/contexts/AuthContext';
import { useTeacherDemo } from '@/lib/demo/useTeacherDemo';
import { STUDENTS, TEACHER_SCOPE, TOPICS, isAssignedClass, type ClassId, type DemoAction, type TeacherView } from '@/lib/demo/teacher';

const NAV = [
  ['dash', 'Dashboard', SquaresFour], ['syl', 'Syllabus & Homework', Lightning],
  ['quiz', 'Quiz Creator', ClipboardText], ['ai', 'AI Assistant', Brain],
  ['heat', 'Class Heat Map', Fire], ['mast', 'Mastery Tracker', ChartLineUp],
  ['review', 'Grade Review', CheckSquare], ['feed', 'Activity History', Bell], ['well', 'Student Wellness', Heart],
] as const;
const average = (values: readonly number[]) => Math.round(values.reduce((a,b) => a+b, 0) / values.length);
const heatColor = (v: number) => v >= 75 ? '#10B981' : v >= 55 ? '#5FC79B' : v >= 40 ? '#D9A008' : v >= 25 ? '#F98A4B' : '#E11D48';

export default function TeacherDemoPortal({ initialView = 'dash' }: { initialView?: TeacherView }) {
  const { profile, user, startDemo, signOut } = useAuth();
  const { state, dispatch } = useTeacherDemo(profile?.name || 'Demo teacher');
  const [view, setView] = useState<TeacherView>(initialView);
  const [classId, setClassId] = useState<ClassId>('10A');
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('s1');
  const [gradeScore, setGradeScore] = useState('');
  const [reason, setReason] = useState('');
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizPosted, setQuizPosted] = useState(false);
  const [documentType, setDocumentType] = useState('Worksheet');
  const [edition, setEdition] = useState(1);
  const roster = STUDENTS.filter(s => s.classId === classId);
  const student = roster.find(s => s.id === selectedStudent) || roster[0];
  const grade = state.grades.find(g => g.studentId === student.id)!;
  const tasks = state.tasks.filter(t => t.classId === classId);
  const pending = state.grades.filter(g => g.status === 'pending');
  const events = state.events.filter(e => e.classId === classId);
  const wellness = roster.filter(s => s.energy < 40 && !state.resolved.includes(s.id));
  const worksheet = `${documentType} · Class ${classId} Mathematics\nSample content · Version ${edition}\n\n${documentType === 'Answer key' ? '1. x = 3\n2. 7 × 8 = 56\n3. Triangle angles total 180 degrees.' : documentType === 'Parent note' ? 'Dear parent, we are practising algebra this week. Please encourage your child to explain each step of their working.' : documentType === 'Lesson plan' ? 'Learning objective: solve a linear equation.\nWarm-up: number facts (5 minutes).\nModel: solve 2x + 4 = 10 (10 minutes).\nGuided practice and exit ticket (15 minutes).' : `1. Solve 2x + ${edition + 3} = ${edition + 9}.\n2. Explain why 7 × 8 = 56.\n3. Show that the angles in a triangle total 180 degrees.`}`;

  function changeClass(next: string) {
    if (!isAssignedClass(next)) { setMessage('This class is outside your assigned scope.'); return; }
    setClassId(next); setSelectedStudent(STUDENTS.find(s => s.classId === next)!.id);
    setGradeScore(''); setReason(''); setQuizAnswer(null); setQuizPosted(false); setMessage('');
  }
  function act(action: DemoAction, success: string) {
    try {
      const saved = dispatch(action);
      setMessage(saved ? success : `${success} Browser storage is unavailable; changes may be lost on refresh.`);
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Action could not complete.'); return false; }
  }
  function createTask(kind: 'Homework' | 'Quiz' | 'Remedial', taskTitle: string) {
    return act({ type: 'task', classId, title: taskTitle, kind }, `${kind} added to the local demo for ${classId}.`);
  }
  async function copyDocument() {
    try { await navigator.clipboard.writeText(worksheet); setMessage('Sample document copied.'); }
    catch { setMessage('Clipboard is unavailable. Select the document text to copy it.'); }
  }
  function downloadDocument() {
    const url = URL.createObjectURL(new Blob([worksheet], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `sthara-${classId}-${documentType.toLowerCase().replaceAll(' ', '-')}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Sample document downloaded.');
  }
  const bar = (v: number) => <div className="bar"><i style={{ width: `${v}%`, background: heatColor(v) }} /></div>;

  return <div className="portal-shell teacher-demo">
      <style jsx>{`
        .portal-shell {
          --nav:#062347; --nav2:#0A2C57; --navActive:#14365E;
          --ink:#002147; --body:#F7F9FB; --line:#E8EDF4;
          --red:#E11D48; --blue:#2F6BFF; --sky:#4C8DFF;
          --green:#10B981; --amber:#F59E0B; --purple:#7C5CFC; --coral:#F45E77;
          --mut:#7A8699; --mut2:#9AA6B8; --pale:#EAF2FF;
          --r:20px; --sh:0 1px 2px rgba(0,33,71,.05),0 10px 30px rgba(0,33,71,.05);
        }
        .portal-shell { display: flex; min-height: 100vh; background: var(--body); color: var(--ink); font-family: 'Plus Jakarta Sans', sans-serif; }
        .portal-shell > aside { width: 264px; flex: 0 0 264px; background: var(--nav); min-height: 100vh; padding: 26px 18px; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; }
        .brand { padding: 0 10px 26px; }
        .brand b { display: block; color: #fff; font-size: 26px; font-weight: 800; letter-spacing: -.02em; }
        .brand i { display: block; color: var(--red); font-size: 11px; font-weight: 800; letter-spacing: .14em; font-style: normal; margin-top: 2px; }
        .portal-shell nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
        .nv { display: flex; align-items: center; gap: 13px; padding: 12px 14px; border-radius: 12px; color: #93A7C4; font-size: 14.5px; font-weight: 500; text-align: left; position: relative; transition: .15s; background: none; border: none; cursor: pointer; width: 100%; }
        .nv:hover { background: rgba(255,255,255,.05); color: #D5E1F2; }
        .nv.on { background: var(--navActive); color: #fff; font-weight: 600; }
        .nv.on:before { content: ""; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px; background: var(--red); border-radius: 0 3px 3px 0; }
        .nv-out { border-top: 1px solid rgba(255,255,255,.08); padding-top: 14px; margin-top: 14px; }
        .portal-shell > main { flex: 1; min-width: 0; padding: 26px 34px 70px; max-width: 1560px; }

        .card { background: #fff; border-radius: var(--r); box-shadow: var(--sh); padding: 26px; }
        .pbar { display: flex; align-items: center; justify-content: space-between; background: #fff; border-radius: var(--r); box-shadow: var(--sh); padding: 20px 26px; margin-bottom: 22px; gap: 16px; flex-wrap: wrap; }
        .pbar .eyebrow { display: flex; align-items: center; gap: 8px; color: var(--red); font-size: 12px; font-weight: 800; letter-spacing: .13em; }
        .pbar h1 { font-size: 31px; font-weight: 800; margin-top: 5px; }
        .pbar .sub { color: var(--mut); font-size: 13.5px; margin-top: 4px; }
        .acts { display: flex; gap: 10px; align-items: center; }
        .btn { padding: 11px 18px; border-radius: 12px; font-size: 13.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: #fff; cursor: pointer; transition: .15s; }
        .btn:hover { border-color: #C9D6E8; }
        .btn.pri { background: var(--ink); color: #fff; border-color: var(--ink); }
        .btn.red { background: var(--red); color: #fff; border-color: var(--red); }
        .hero { border-radius: 24px; padding: 34px 36px; color: #fff; background: linear-gradient(103deg,#072044 0%,#123F84 52%,#0F5AB8 100%); margin-bottom: 22px; position: relative; overflow: hidden; }
        .hero h1 { font-size: 40px; font-weight: 800; }
        .hero .hsub { color: #A9C4E8; font-size: 14.5px; margin-top: 7px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .chip { display: inline-block; background: rgba(255,255,255,.14); border-radius: 8px; padding: 4px 11px; font-size: 12px; font-weight: 600; color: #DCE9FA; }
        .hgrid { display: grid; grid-template-columns: repeat(auto-fit,minmax(250px,1fr)); gap: 16px; margin-top: 26px; }
        .hstat { background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.12); border-radius: 16px; padding: 20px 22px; display: flex; justify-content: space-between; align-items: flex-start; }
        .hstat .lb { font-size: 11.5px; font-weight: 800; letter-spacing: .11em; color: #9FBBE0; }
        .hstat .vl { font-size: 34px; font-weight: 800; margin-top: 6px; line-height: 1; }
        .hstat .nt { font-size: 12.5px; color: #8FAED6; margin-top: 6px; }
        .hstat .ic { width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,.14); display: grid; place-items: center; font-size: 18px; }
        .kpis { display: grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap: 18px; margin-bottom: 22px; }
        .kpi { background: #fff; border-radius: var(--r); box-shadow: var(--sh); padding: 24px 26px; position: relative; overflow: hidden; }
        .kpi .lb { font-size: 11.5px; font-weight: 800; letter-spacing: .11em; color: var(--mut); }
        .kpi .vl { font-size: 46px; font-weight: 800; line-height: 1; margin-top: 10px; }
        .kpi .nt { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; margin-top: 10px; }
        .sec { display: flex; align-items: center; gap: 11px; font-size: 20px; font-weight: 800; margin: 30px 0 16px; }
        .sec .dot { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; font-size: 14px; }
        .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .g3 { display: grid; grid-template-columns: repeat(auto-fit,minmax(280px,1fr)); gap: 18px; }
        @media(max-width:1100px){.g2{grid-template-columns:1fr}}
        .ch { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 8px; font-size: 11px; font-weight: 800; letter-spacing: .04em; }
        .ch.g{background:#DCFCE7;color:#0B7A54}.ch.a{background:#FEF3C7;color:#92600A}
        .ch.r{background:#FFE4EA;color:#B4123C}.ch.b{background:#E6EEFF;color:#1E4FCC}
        .ch.p{background:#EFE9FF;color:#5B3DD1}.ch.n{background:#F1F5F9;color:#556378}
        .row { display: flex; align-items: center; gap: 14px; padding: 15px 0; border-bottom: 1px solid var(--line); }
        .row:last-child { border-bottom: 0; }
        .av { width: 40px; height: 40px; border-radius: 11px; background: var(--pale); color: var(--blue); display: grid; place-items: center; font-weight: 800; font-size: 15px; flex: 0 0 40px; }
        .bar { height: 8px; background: #EDF1F7; border-radius: 99px; overflow: hidden; flex: 1; min-width: 60px; }
        .bar>i { display: block; height: 100%; border-radius: 99px; }
        .muted { color: var(--mut); font-size: 13px; }
        .hm { border-collapse: separate; border-spacing: 4px; width: 100%; }
        .hm th { font-size: 11px; font-weight: 800; color: var(--mut); text-align: left; padding: 0 4px 6px; letter-spacing: .04em; }
        .hm td.nm { font-size: 13px; font-weight: 700; white-space: nowrap; padding-right: 10px; }
        .hm .cell { border-radius: 8px; text-align: center; font-size: 12px; font-weight: 800; padding: 11px 4px; color: #fff; }
        .qopt { border: 1.5px solid var(--line); border-radius: 14px; padding: 15px 17px; display: flex; gap: 12px; align-items: flex-start; font-size: 14px; line-height: 1.5; }
        .qopt.ok { border-color: var(--green); background: #F0FDF7; }
        .qopt b { width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid #CBD5E1; display: grid; place-items: center; font-size: 11px; flex: 0 0 24px; color: var(--mut); }
        .qopt.ok b { background: var(--green); border-color: var(--green); color: #fff; }
        .note { background: #FFF8E7; border-left: 3px solid var(--amber); border-radius: 10px; padding: 14px 16px; font-size: 13px; color: #7A5A08; line-height: 1.6; }

        /* Floating Role Switcher */
        .role-sw { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 50; background: var(--ink); border-radius: 99px; padding: 7px; display: flex; gap: 4px; box-shadow: 0 14px 40px rgba(0,33,71,.35); }
        .role-sw button { padding: 10px 20px; border-radius: 99px; color: #93A7C4; font-size: 13px; font-weight: 700; text-decoration: none; }
        .role-sw button.on { background: var(--red); color: #fff; }
        @media(max-width:760px) {
          .portal-shell { flex-direction: column; }
          .portal-shell > aside { width: 100%; flex-basis: auto; min-height: auto; height: auto; position: static; padding: 16px; }
          .portal-shell .brand { padding-bottom: 12px; }
          .portal-shell nav { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }
          .portal-shell .nv { font-size: 12px; gap: 10px; padding: 10px; }
          .portal-shell .nv-out { margin: 0; padding: 0; border: 0; }
          .portal-shell > main { padding: 18px 16px 100px; width: 100%; }
          .portal-shell .hero { padding: 24px 20px; }
          .portal-shell .hero h1 { font-size: 28px; }
          .portal-shell .g2, .portal-shell .g3, .portal-shell .hgrid { grid-template-columns: minmax(0,1fr); }
          .portal-shell .card { padding: 18px; overflow-x: auto; }
          .portal-shell .role-sw button { padding: 8px 12px; }
        }

        .demo-toolbar { display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between; margin-bottom:22px; }
        .demo-message { background:#e7f5ee; color:#154b35; padding:14px 18px; border-radius:12px; margin-bottom:18px; display:flex; justify-content:space-between; gap:12px; }
        .demo-message button { cursor:pointer; font-size:22px; }
        h2 { font-size:20px; font-weight:750; margin-bottom:12px; }
        h3 { font-size:24px; font-weight:750; }
        label { display:block; font-size:13px; font-weight:650; margin-bottom:12px; }
        input, select, textarea { display:block; width:100%; border:1px solid #cbd5e1; border-radius:10px; background:white; color:#002147; padding:10px 12px; margin-top:6px; }
        textarea { min-height:90px; }
        form { margin:16px 0; }
        button:disabled { opacity:.5; cursor:not-allowed; }
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline:3px solid #4c8dff; outline-offset:3px; }
        .demo-score { display:flex; align-items:center; gap:16px; font-size:36px; font-weight:800; margin:18px 0; }
        .demo-review-row { width:100%; justify-content:space-between; text-align:left; cursor:pointer; }
        .demo-review-row[aria-pressed="true"] { background:#edf4ff; padding:14px; border-radius:12px; }
        .student-link { text-decoration:underline; cursor:pointer; }
        .table-scroll { overflow-x:auto; }
        .hm { min-width:650px; }
        .demo-document pre { white-space:pre-wrap; font:inherit; line-height:1.9; }
        .row { flex-wrap:wrap; }
        @media print { aside, .demo-toolbar, .role-sw, .pbar, .demo-message { display:none !important; } main { padding:0 !important; } .g2 { display:block; } .g2:has(.demo-document) > :not(.demo-document) { display:none; } }
      `}</style>
    <aside>
      <div className="brand"><b>Sthara</b><i>TEACHING COPILOT</i></div>
      <nav aria-label="Teacher navigation">
        {NAV.map(([key, label, Icon]) => <button key={key} className={`nv ${view === key ? 'on' : ''}`} aria-current={view === key ? 'page' : undefined} onClick={() => { setView(key); setMessage(''); }}>
          <InteractiveIcon icon={Icon} color={colorForIcon(Icon)} active={view === key} /><span>{label}</span>
        </button>)}
        <div className="nv-out"><button className="nv" onClick={() => void signOut()}><InteractiveIcon icon={SignOut} color={colorForIcon(SignOut)} /><span>Sign Out</span></button></div>
      </nav>
    </aside>
    <main>
      <div className="demo-toolbar">
        <div><b>Interactive demo</b><p className="muted">Sample records · saved in this browser · no messages are sent</p></div>
        <label>Assigned class <select aria-label="Assigned class" value={classId} onChange={e => changeClass(e.target.value)}>{TEACHER_SCOPE.map(s => <option key={s.classId} value={s.classId}>{s.classId} · {s.subject}</option>)}</select></label>
      </div>
      {message && <div className="demo-message" role="status">{message}<button aria-label="Dismiss message" onClick={() => setMessage('')}>×</button></div>}

      {view === 'dash' && <>
        <div className="hero"><h1>Welcome, {profile?.name?.split(' ')[0] || 'Teacher'}</h1><div className="hsub">Mathematics · 4 assigned classes · 8 sample students</div>
          <div className="hgrid">
            <div className="hstat"><div><div className="lb">SAMPLE MASTERY</div><div className="vl">{average(STUDENTS.map(s => average(s.scores)))}%</div><div className="nt">Illustrative topic scores</div></div></div>
            <div className="hstat"><div><div className="lb">AWAITING YOUR APPROVAL</div><div className="vl">{pending.length}</div><div className="nt">AI suggestions are not official grades</div></div></div>
            <div className="hstat"><div><div className="lb">ASSIGNED TASKS</div><div className="vl">{state.tasks.length}</div><div className="nt">Local demo records</div></div></div>
          </div>
        </div>
        <h2 className="sec">Your assigned classes</h2><div className="g2">{TEACHER_SCOPE.map(s => {
          const students = STUDENTS.filter(p => p.classId === s.classId); const score = average(students.map(p => average(p.scores)));
          return <div key={s.classId} className="card"><h3>Class {s.classId}</h3><p className="muted">Mathematics · {students.length} sample students</p><div className="demo-score">{score}%{bar(score)}</div><div className="acts"><button className="btn" onClick={() => { changeClass(s.classId); setView('heat'); }}>Heat map · {s.classId}</button><button className="btn pri" onClick={() => { changeClass(s.classId); setView('syl'); }}>Open class · {s.classId}</button></div></div>;
        })}</div>
        <div className="card" style={{ marginTop: 20 }}><h2>Needs your review</h2><p className="muted">{pending.length} AI-suggested grades await teacher approval across your assigned classes.</p><button className="btn pri" onClick={() => setView('review')}>Review grades · {classId}</button></div>
      </>}

      {view === 'syl' && <>
        <div className="pbar"><div><div className="eyebrow">SYLLABUS & HOMEWORK</div><h1>Class Task Manager</h1><p className="sub">Class {classId} · Mathematics · sample curriculum</p></div></div>
        <div className="g2"><section className="card"><h2>Create homework</h2><form onSubmit={e => { e.preventDefault(); if (createTask('Homework', title)) setTitle(''); }}><label>Assignment title<input aria-label="Assignment title" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} placeholder="For example, linear equations practice" required /></label><button className="btn red" type="submit">Assign homework</button></form><button className="btn" onClick={() => setTitle('Sample chapter: Algebra foundations')}>Use sample chapter</button></section>
          <section className="card"><h2>Assigned tasks ({tasks.length})</h2>{tasks.map(t => <div className="row" key={t.id}><div style={{ flex: 1 }}><b>{t.title}</b><p className="muted">{t.type} · {t.classId} · Mathematics</p></div><span className="ch b">DEMO</span></div>)}</section></div>
        <section className="card" style={{ marginTop: 20 }}><h2>Class roster</h2>{roster.map(s => <div className="row" key={s.id}><b style={{ flex: 1 }}>{s.name}</b><button className="btn" onClick={() => act({ type: 'note', classId, text: `Reminder drafted for ${s.name}; not sent` }, 'Reminder recorded in demo history. No message was sent.')}>Draft reminder</button></div>)}</section>
      </>}

      {view === 'quiz' && <>
        <div className="pbar"><div><div className="eyebrow">QUIZ CREATOR</div><h1>Create a Quiz</h1><p className="sub">Class {classId} · Mathematics · linear equations</p></div><button className="btn red" disabled={quizPosted} onClick={() => { if (createTask('Quiz', 'Linear equations quiz')) setQuizPosted(true); }}>{quizPosted ? 'Posted in demo' : 'Post Quiz to Students'}</button></div>
        <section className="card"><span className="ch b">SAMPLE QUESTION · 1 MARK</span><h2 style={{ margin: '20px 0' }}>Solve 2x + 4 = 10. What is x?</h2><div className="g2">{['2', '3', '5', '7'].map((answer, i) => <button key={answer} className={`qopt ${quizAnswer === i ? 'ok' : ''}`} aria-pressed={quizAnswer === i} onClick={() => setQuizAnswer(i)}><b>{'ABCD'[i]}</b>{answer}</button>)}</div>{quizAnswer !== null && <p className="note" role="status" style={{ marginTop: 20 }}>{quizAnswer === 1 ? 'Correct.' : 'Try again.'} Subtract 4 from both sides, then divide by 2. The answer is 3.</p>}</section>
      </>}

      {view === 'ai' && <>
        <div className="pbar"><div><div className="eyebrow">AI ASSISTANT · OFFLINE SAMPLE</div><h1>Teacher Copilot</h1><p className="sub">Preview document workflows without an AI or backend connection.</p></div><div className="acts"><button className="btn" onClick={() => void copyDocument()}>Copy</button><button className="btn pri" onClick={downloadDocument}>Download text</button><button className="btn" onClick={() => window.print()}>Print / Save PDF</button></div></div>
        <div className="g2"><section className="card"><h2>Document type</h2>{['Worksheet', 'Lesson plan', 'Exercise set', 'Remedial pack', 'Answer key', 'Parent note'].map(t => <button key={t} className={`btn ${documentType === t ? 'pri' : ''}`} style={{ margin: '6px 6px 6px 0' }} aria-pressed={documentType === t} onClick={() => setDocumentType(t)}>{t}</button>)}<button className="btn red" onClick={() => { setEdition(n => n+1); setMessage('Another local sample is ready. No AI request was made.'); }}>Generate sample</button></section><section className="card demo-document"><pre>{worksheet}</pre></section></div>
      </>}

      {view === 'heat' && <>
        <div className="pbar"><div><div className="eyebrow">CLASS HEAT MAP</div><h1>Topic-level TML · Class {classId}</h1><p className="sub">Illustrative mastery scores for the selected assigned class.</p></div><button className="btn pri" disabled={!roster.some(s => s.scores.some(v => v < 40))} onClick={() => createTask('Remedial', 'Targeted practice for topics below 40%')}>Assign remedial to red</button></div>
        <section className="card table-scroll"><table className="hm"><caption className="sr-only">Sample mastery by student and topic</caption><thead><tr><th>Student</th>{TOPICS.map(t => <th key={t}>{t}</th>)}<th>Average</th></tr></thead><tbody>{roster.map(s => <tr key={s.id}><th scope="row"><button className="student-link" onClick={() => { setSelectedStudent(s.id); setView('mast'); }}>{s.name}</button></th>{s.scores.map((v,i) => <td key={i} className="cell" style={{ background: heatColor(v), color: v >= 25 && v < 75 ? '#002147' : '#fff' }}>{v}%</td>)}<td>{average(s.scores)}%</td></tr>)}</tbody></table></section>
      </>}

      {view === 'mast' && <>
        <div className="pbar"><div><div className="eyebrow">MASTERY TRACKER</div><h1>Subject Knowledge Graph</h1><p className="sub">Mathematics · Class {classId} · sample topic evidence</p></div><label>Student<select aria-label="Mastery student" value={student.id} onChange={e => setSelectedStudent(e.target.value)}>{roster.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label></div>
        <div className="g2"><section className="card"><h2>{student.name}</h2><div className="demo-score">{average(student.scores)}%</div><p className="muted">Sample topic mastery. Teacher-approved grades are tracked separately.</p><p>Grade: {grade.status === 'approved' ? `${grade.score}/15 · Official in demo` : 'Awaiting teacher approval'}</p></section><section className="card"><h2>Knowledge hierarchy</h2>{TOPICS.map((t,i) => <div className="row" key={t}><b style={{ flex: 1 }}>{t}</b>{bar(student.scores[i])}<b>{student.scores[i]}%</b></div>)}</section></div>
      </>}

      {view === 'review' && <>
        <div className="pbar"><div><div className="eyebrow">TEACHER APPROVAL</div><h1>Grade Review</h1><p className="sub">AI suggests; you approve. Amendments require a reason.</p></div></div>
        <div className="g2"><section className="card"><h2>Class {classId} review queue</h2>{roster.map(s => { const g = state.grades.find(g => g.studentId === s.id)!; return <button className="row demo-review-row" key={s.id} aria-pressed={student.id === s.id} onClick={() => { setSelectedStudent(s.id); setGradeScore(''); setReason(''); setMessage(''); }}><b>{s.name}</b><span className={`ch ${g.status === 'approved' ? 'g' : 'a'}`}>{g.status === 'approved' ? 'APPROVED' : 'PENDING'}</span></button>; })}</section>
          <section className="card"><h2>{student.name}</h2><p className="muted">Algebra practice · maximum 15 marks</p><p className="note">{grade.status === 'approved' ? 'Official demo grade' : 'AI-suggested grade · not official'}: {grade.score}/15</p><form onSubmit={e => { e.preventDefault(); const score = gradeScore.trim() ? Number(gradeScore) : grade.score; if (act({ type: 'grade', classId, studentId: student.id, score, reason }, 'Grade saved with before/after history in this browser.')) { setGradeScore(''); setReason(''); } }}><label>Score out of 15<input aria-label="Score out of 15" type="number" min="0" max="15" step="0.5" value={gradeScore || String(grade.score)} onChange={e => setGradeScore(e.target.value)} required /></label><label>{grade.status === 'approved' ? 'Reason for amendment (required)' : 'Review note (optional)'}<textarea aria-label="Review reason" value={reason} onChange={e => setReason(e.target.value)} required={grade.status === 'approved'} maxLength={1000} /></label><button className="btn red" type="submit">{grade.status === 'approved' ? 'Save amendment' : 'Approve grade'}</button></form></section></div>
        <p className="muted" style={{ marginTop: 20 }}>Approval history is saved only in this browser.</p>
      </>}

      {view === 'feed' && <>
        <div className="pbar"><div><div className="eyebrow">ACTIVITY HISTORY</div><h1>What changed in Class {classId}</h1><p className="sub">Local demo actions · actor, time, and grade changes</p></div></div>
        {events.length === 0 ? <section className="card"><h2>No activity yet</h2><p className="muted">Create an assignment, approve a grade, or review a check-in to see its history here.</p></section> : events.map(e => <article className="card" key={e.id} style={{ marginBottom: 12 }}><h2>{e.action}</h2><p className="muted">{e.actor} · {new Date(e.at).toLocaleString()} · {e.classId} · Mathematics</p>{e.before !== undefined && <p>Previous: {e.before}/15 → Approved: {e.after}/15</p>}{e.reason && <p>Reason: {e.reason}</p>}</article>)}
      </>}

      {view === 'well' && <>
        <div className="pbar"><div><div className="eyebrow">CLASSROOM PULSE</div><h1>Wellness Dashboard</h1><p className="sub">Class {classId} · fictional check-ins for workflow demonstration</p></div></div>
        <section className="card"><h2>Unreviewed check-ins ({wellness.length})</h2>{wellness.length === 0 && <p className="muted">No low-energy check-ins awaiting review in this class.</p>}{wellness.map(s => <div className="row" key={s.id}><b>{s.name}</b><span className="ch a">Energy {s.energy}%</span><button className="btn" onClick={() => act({ type: 'resolve', classId, studentId: s.id }, 'Check-in marked reviewed in the demo. No student or parent was contacted.')}>Mark reviewed</button></div>)}</section>
      </>}
    </main>
    {process.env.NODE_ENV === 'development' && !user && <div className="role-sw" aria-label="Local demo roles">{(['student','teacher','admin','parent'] as const).map(role => <button key={role} className={role === 'teacher' ? 'on' : ''} onClick={() => startDemo(role)}>{role[0].toUpperCase()+role.slice(1)}</button>)}</div>}
  </div>;
}
