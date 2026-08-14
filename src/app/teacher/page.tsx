'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function TeacherPortal() {
  const [view, setView] = useState<'dash' | 'syl' | 'quiz' | 'ai' | 'heat' | 'mast' | 'feed' | 'well'>('dash');

  // Energy Check-in State
  const [journalFilter, setJournalFilter] = useState('ALL');

  // Helper functions
  const hmColor = (v: number) => (v >= 75 ? '#10B981' : v >= 55 ? '#5FC79B' : v >= 40 ? '#F5B60B' : v >= 25 ? '#F98A4B' : '#E11D48');
  const bar = (v: number, c?: string) => (
    <div className="bar"><i style={{ width: `${v}%`, background: c || hmColor(v) }} /></div>
  );

  return (
    <div className="portal-shell">
      <style jsx global>{`
        :root {
          --nav:#062347; --nav2:#0A2C57; --navActive:#14365E;
          --ink:#002147; --body:#F7F9FB; --line:#E8EDF4;
          --red:#E11D48; --blue:#2F6BFF; --sky:#4C8DFF;
          --green:#10B981; --amber:#F59E0B; --purple:#7C5CFC; --coral:#F45E77;
          --mut:#7A8699; --mut2:#9AA6B8; --pale:#EAF2FF;
          --r:20px; --sh:0 1px 2px rgba(0,33,71,.05),0 10px 30px rgba(0,33,71,.05);
        }
        .portal-shell { display: flex; min-height: 100vh; background: var(--body); color: var(--ink); font-family: 'Plus Jakarta Sans', sans-serif; }
        aside { width: 264px; flex: 0 0 264px; background: var(--nav); min-height: 100vh; padding: 26px 18px; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; }
        .brand { padding: 0 10px 26px; }
        .brand b { display: block; color: #fff; font-size: 26px; font-weight: 800; letter-spacing: -.02em; }
        .brand i { display: block; color: var(--red); font-size: 11px; font-weight: 800; letter-spacing: .14em; font-style: normal; margin-top: 2px; }
        nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
        .nv { display: flex; align-items: center; gap: 13px; padding: 12px 14px; border-radius: 12px; color: #93A7C4; font-size: 14.5px; font-weight: 500; text-align: left; position: relative; transition: .15s; background: none; border: none; cursor: pointer; width: 100%; }
        .nv:hover { background: rgba(255,255,255,.05); color: #D5E1F2; }
        .nv.on { background: var(--navActive); color: #fff; font-weight: 600; }
        .nv.on:before { content: ""; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px; background: var(--red); border-radius: 0 3px 3px 0; }
        .nv-out { border-top: 1px solid rgba(255,255,255,.08); padding-top: 14px; margin-top: 14px; }
        main { flex: 1; min-width: 0; padding: 26px 34px 70px; max-width: 1560px; }

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
        .role-sw a { padding: 10px 20px; border-radius: 99px; color: #93A7C4; font-size: 13px; font-weight: 700; text-decoration: none; }
        .role-sw a.on { background: var(--red); color: #fff; }
      `}</style>

      {/* Sidebar */}
      <aside>
        <div className="brand">
          <b>Sthara</b>
          <i>DIAGNOSTIC ENGINE</i>
        </div>
        <nav>
          {[
            ['dash', 'Dashboard', '📊'],
            ['syl', 'Syllabus & Homework', '⚡'],
            ['quiz', 'Quiz Creator', '📋'],
            ['ai', 'AI Assistant', '👥'],
            ['heat', 'Class Heat Map', '🔥'],
            ['mast', 'Mastery Tracker', '📈'],
            ['feed', 'Situational Feed', '🔔'],
            ['well', 'Student Wellness', '💚'],
          ].map(([k, n, ic]) => (
            <button
              key={k}
              className={`nv ${view === k ? 'on' : ''}`}
              onClick={() => setView(k as any)}
            >
              <span>{ic}</span>
              <span>{n}</span>
            </button>
          ))}
          <div className="nv-out">
            <Link href="/login" className="nv">
              <span>🚪</span>
              <span>Sign Out</span>
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main>
        {/* VIEW 1: DASHBOARD */}
        {view === 'dash' && (
          <div>
            <div className="hero">
              <div style={{ display: 'flex', justifyBetween: 'space-between', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
                <div>
                  <h1>Good Morning, Priya</h1>
                  <div className="hsub">
                    Teacher Portal · Mathematics <span className="chip mono">sch-vsn-2026</span> <span className="chip">4 classes · 148 students</span>
                  </div>
                </div>
                <Link href="/login" className="btn" style={{ background: 'rgba(255,255,255,.14)', color: '#fff', borderColor: 'rgba(255,255,255,.2)' }}>
                  ↪ Sign Out
                </Link>
              </div>

              <div className="hgrid">
                <div className="hstat">
                  <div>
                    <div className="lb">PLATFORM AVERAGE TML</div>
                    <div className="vl">64%</div>
                    <div className="nt">▲ 3 pts vs last fortnight</div>
                  </div>
                  <div className="ic">👥</div>
                </div>
                <div className="hstat" style={{ background: 'rgba(225,29,72,.16)', borderColor: 'rgba(225,29,72,.3)' }}>
                  <div>
                    <div className="lb">PROCTORING ALERTS</div>
                    <div className="vl">2</div>
                    <div className="nt">Tab-switch flags · Class 10B</div>
                  </div>
                  <div className="ic" style={{ background: 'rgba(225,29,72,.3)' }}>⚠</div>
                </div>
                <div className="hstat">
                  <div>
                    <div className="lb">AWAITING YOUR REVIEW</div>
                    <div className="vl">17</div>
                    <div className="nt">AI-graded, needs confirmation</div>
                  </div>
                  <div className="ic">✎</div>
                </div>
              </div>
            </div>

            <h3 className="sec"><span className="dot" style={{ background: '#FFE4EA', color: 'var(--red)' }}>📖</span>Your Assigned Classes</h3>
            <div className="g3">
              {[
                ['10A', 'Mathematics', 38, 72, '2 at-risk', 'a'],
                ['10B', 'Mathematics', 36, 61, '2 proctoring flags', 'r'],
                ['9C', 'Mathematics', 37, 68, 'All clear', 'g'],
                ['9D', 'Mathematics', 37, 55, '5 below 40% TML', 'r'],
              ].map(([c, s, n, tml, note, col]) => (
                <div key={c} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div>
                      <h3 style={{ fontSize: 26, fontWeight: 800 }}>Class {c}</h3>
                      <div className="muted">{s} · {n} students</div>
                    </div>
                    <span className={`ch ${col}`}>{note}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em' }}>CLASS TRUE MASTERY LEVEL</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '8px 0 14px' }}>
                    <div style={{ fontSize: 38, fontWeight: 800, color: hmColor(tml as number) }}>{tml}%</div>
                    {bar(tml as number)}
                  </div>
                  <div style={{ display: 'flex', gap: 9 }}>
                    <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setView('heat')}>Heat map</button>
                    <button className="btn pri" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setView('syl')}>Open class</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="g2" style={{ marginTop: 22 }}>
              <div className="card">
                <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>Today's timetable</h3>
                {[
                  ['08:20', '10A', 'Quadratic Equations — Level 2', 'now'],
                  ['09:10', '9C', 'Linear Equations recap', ''],
                  ['11:00', '10B', 'Chapter test — proctored', ''],
                  ['12:40', '9D', 'Remedial · Algebra basics', ''],
                ].map(([t, c, s, n]) => (
                  <div key={t} className="row">
                    <b className="mono" style={{ fontSize: 14, width: 52 }}>{t}</b>
                    <div className="av" style={{ width: 34, height: 34, flex: '0 0 34px', fontSize: 12 }}>{c}</div>
                    <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{s}</div>
                    {n ? <span className="ch r">NOW</span> : null}
                  </div>
                ))}
              </div>

              <div className="card">
                <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>Needs you today</h3>
                {[
                  ['17 AI-graded submissions awaiting confirmation', 'Class 10A · Quadratic Equations', 'r', 'syl'],
                  ['2 proctoring flags to adjudicate', 'Class 10B · chapter test', 'r', 'syl'],
                  ['3 unresolved energy check-ins', 'Class 10A wellness', 'a', 'well'],
                  ['5 students below 40% TML', 'Class 9D · remedial group', 'a', 'heat'],
                ].map(([t, s, c, targetView]) => (
                  <div key={t} className="row">
                    <div className="av" style={{ background: c === 'r' ? '#FFE4EA' : '#FEF3C7', color: c === 'r' ? 'var(--red)' : '#92600A' }}>!</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{t}</div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{s}</div>
                    </div>
                    <button className="btn" onClick={() => setView(targetView as any)}>Open</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: SYLLABUS & HOMEWORK */}
        {view === 'syl' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">⚡ SYLLABUS &amp; HOMEWORK</div>
                <h1>Class Task Manager</h1>
                <div className="sub">Class 10A · Mathematics · NCERT mapped</div>
              </div>
              <div className="acts">
                <button className="btn" onClick={() => alert('NCERT Chapter imported!')}>Import NCERT chapter</button>
                <button className="btn red" onClick={() => alert('New assignment created!')}>+ Assign homework</button>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                <div style={{ width: 300, flex: '0 0 300px', borderRight: '1px solid var(--line)', padding: 24, background: '#FCFDFE' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <b style={{ fontSize: 16 }}>Assigned Tasks</b>
                    <span className="ch n">4</span>
                  </div>
                  {[
                    ['Quadratic Equations L2', 'HOMEWORK', 'PENDING', 'a', true],
                    ['Polynomials worksheet', 'HOMEWORK', 'GRADED', 'g', false],
                    ['Trigonometry quiz', 'QUIZ', 'GRADED', 'g', false],
                    ['Circles — map work', 'CLASSWORK', 'DRAFT', 'n', false],
                  ].map(([t, ty, st, c, on]) => (
                    <div key={t} style={{ border: on ? '2px solid var(--ink)' : '1px solid var(--line)', borderRadius: 14, padding: 15, marginBottom: 10, cursor: 'pointer', background: '#fff' }}>
                      <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 8 }}>{t}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>{ty}</span>
                        <span className={`ch ${c}`}>{st}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ flex: 1, minWidth: 340, padding: 28 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
                    <div>
                      <span className="ch n">HOMEWORK</span>
                      <h2 style={{ fontSize: 32, fontWeight: 800, margin: '10px 0 4px' }}>Quadratic Equations — Level 2</h2>
                      <div className="muted">Due: 28/07/2026 · Factoring &amp; the quadratic formula</div>
                    </div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: '14px 20px', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--red)' }}>21<span style={{ color: 'var(--mut2)', fontSize: 18 }}>/38</span></div>
                      <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em' }}>SUBMITTED</div>
                    </div>
                  </div>

                  <div className="g2" style={{ gap: 24 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontWeight: 800, fontSize: 16, borderBottom: '1px solid #BBF7D0', paddingBottom: 10, marginBottom: 14 }}>
                        ☑ Completed (21)
                      </div>
                      {['Ananya Iyer · 13/15', 'Vikram Rao · 15/15', 'Meera Nair · 11/15', 'Aditya Sharma · 14/15', 'Sana Qureshi · 9/15'].map(s => (
                        <div key={s} className="row" style={{ padding: '10px 0' }}>
                          <div className="av" style={{ width: 30, height: 30, flex: '0 0 30px', fontSize: 11, background: '#DCFCE7', color: 'var(--green)' }}>✓</div>
                          <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{s}</div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber)', fontWeight: 800, fontSize: 16, borderBottom: '1px solid #FDE68A', paddingBottom: 10, marginBottom: 14 }}>
                        ⚠ Not completed (17)
                      </div>
                      {['Rahul Menon', 'Divya Krishnan', 'Arjun Pillai', 'Fatima Sheikh', 'Karthik Reddy'].map(s => (
                        <div key={s} className="row" style={{ padding: '10px 0' }}>
                          <div className="av" style={{ width: 30, height: 30, flex: '0 0 30px', fontSize: 11, background: '#FEF3C7', color: '#92600A' }}>!</div>
                          <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{s}</div>
                          <button className="btn" style={{ padding: '6px 12px', fontSize: 11.5 }} onClick={() => alert(`WhatsApp nudge sent to ${s}'s parents!`)}>
                            Nudge
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="note" style={{ marginTop: 24 }}>
                    <b>One tap sends a WhatsApp nudge</b> to all 17 parents in the not-completed column. Average recovery within 24h across pilot schools: 61%.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: QUIZ CREATOR */}
        {view === 'quiz' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">📋 QUIZ CREATOR</div>
                <h1>Create a Quiz</h1>
                <div className="sub">Class 10A · Social Studies · Nationalism in India</div>
              </div>
              <div className="acts">
                <button className="btn red" onClick={() => alert('Quiz successfully posted to Class 10A!')}>✈ Post Quiz to Students</button>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 18, display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                ['Questions', '10'],
                ['Difficulty mix', '3 easy · 4 med · 3 hard'],
                ['Source', 'NCERT Ch 2'],
                ['Est. time', '18 min'],
                ['Generated by', 'Gemini · 4.2s'],
              ].map(([l, v]) => (
                <div key={l}>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em' }}>{l.toUpperCase()}</div>
                  <div style={{ fontWeight: 800, fontSize: 15, marginTop: 4 }}>{v}</div>
                </div>
              ))}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div className="av" style={{ background: 'var(--ink)', color: '#fff', borderRadius: '50%' }}>10</div>
                  <h3 style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.5, maxWidth: 820 }}>
                    The revolutionary wars initiated by France, particularly after 1792, had a profound impact on the rest of Europe. Which of the following best describes how these wars affected the political landscape of other European monarchies?
                  </h3>
                </div>
                <span className="ch r">HARD</span>
              </div>
              <div className="g2" style={{ gap: 14 }}>
                <div className="qopt"><b>A</b><span>They encouraged other European monarchs to adopt more liberal reforms to appease their own populations.</span></div>
                <div className="qopt ok"><b>✓</b><span>They led to a widespread alliance of European monarchies to collectively invade France and restore the Ancien Régime.</span></div>
                <div className="qopt"><b>C</b><span>They primarily resulted in the expansion of French colonial territories overseas.</span></div>
                <div className="qopt"><b>D</b><span>They inspired immediate and successful democratic revolutions across most of Europe.</span></div>
              </div>
              <div className="note" style={{ marginTop: 18 }}>
                ⚡ <b>Explanation:</b> The revolutionary wars were largely a response by European monarchies who feared the spread of revolutionary ideas, forming coalitions to crush the revolution.
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: AI ASSISTANT */}
        {view === 'ai' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">👥 AI ASSISTANT · GENERATED OUTPUT</div>
                <h1>Teacher Copilot</h1>
                <div className="sub">Lesson plans, worksheets and exercises generated against your syllabus.</div>
              </div>
              <div className="acts">
                <button className="btn" onClick={() => alert('Worksheet copied to clipboard!')}>⧉ Copy</button>
                <button className="btn pri" onClick={() => alert('PDF export generated!')}>⤓ Export PDF</button>
              </div>
            </div>

            <div className="g2" style={{ gridTemplateColumns: '300px 1fr' }}>
              <div className="card" style={{ height: 'fit-content' }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>Generate</h3>
                {['Worksheet', 'Lesson plan', 'Exercise set', 'Remedial pack', 'Answer key', 'Parent note'].map((t, idx) => (
                  <div
                    key={t}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 11,
                      marginBottom: 7,
                      fontSize: 14,
                      fontWeight: idx === 0 ? 700 : 500,
                      background: idx === 0 ? 'var(--pale)' : 'transparent',
                      color: idx === 0 ? 'var(--blue)' : 'var(--mut)',
                      cursor: 'pointer',
                    }}
                  >
                    {t}
                  </div>
                ))}
                <button className="btn red" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={() => alert('Regenerating worksheet using Gemini AI...')}>
                  ✦ Regenerate
                </button>
              </div>

              <div className="card">
                <h2 style={{ fontSize: 34, fontWeight: 800, textAlign: 'center', marginBottom: 26 }}>NCERT Class 10 Mathematics Assessment</h2>
                <div className="g2" style={{ gap: 34, marginBottom: 30 }}>
                  <div><b>Name:</b><div style={{ borderBottom: '1.5px solid var(--line)', height: 30 }} /></div>
                  <div><b>Date:</b><div style={{ borderBottom: '1.5px solid var(--line)', height: 30 }} /></div>
                </div>
                <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>Directions</h3>
                <p className="muted" style={{ fontSize: 14, marginBottom: 28 }}>Select the one best answer for each question. All questions are based on the NCERT Class 10 Mathematics syllabus.</p>
                {[
                  ['1. The HCF of two numbers is 23 and their LCM is 1449. If one of the numbers is 161, what is the other number?', ['23', '1449', '207', '184']],
                  ['2. If α and β are the zeroes of quadratic polynomial f(x) = x² − 5x + 4, what is 1/α + 1/β − 2αβ?', ['5/4', '−27/4', '27/4', '−5/4']],
                  ['3. The distance of the point (−3, 4) from the origin is:', ['5 units', '7 units', '1 unit', '25 units']],
                ].map(([q, o]) => (
                  <div key={q as string} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 24, marginBottom: 24 }}>
                    <h4 style={{ fontSize: 16.5, fontWeight: 800, lineHeight: 1.6, marginBottom: 16 }}>{q}</h4>
                    <div className="g2" style={{ gap: 12 }}>
                      {(o as string[]).map((x, i) => (
                        <div key={x} style={{ display: 'flex', gap: 11, alignItems: 'center', fontSize: 14.5 }}>
                          <b style={{ width: 24, height: 24, borderRadius: '50%', border: '1.5px solid #CBD5E1', display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--mut)', fontWeight: 600 }}>{'abcd'[i]}</b>
                          {x}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 5: CLASS HEAT MAP */}
        {view === 'heat' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">🔥 CLASS HEAT MAP</div>
                <h1>Topic-level TML · Class 10A</h1>
                <div className="sub">Every cell is a live True Mastery Level, not a test score.</div>
              </div>
              <div className="acts">
                <button className="btn pri" onClick={() => alert('Remedial assignments created for students below 40% TML!')}>
                  Assign remedial to red
                </button>
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: 19, fontWeight: 800 }}>Student × micro-topic</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700, color: 'var(--mut)' }}>
                  <span>Low</span>
                  {[15, 30, 48, 65, 85].map(v => <span key={v} style={{ width: 26, height: 14, borderRadius: 4, background: hmColor(v) }} />)}
                  <span>High</span>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="hm">
                  <thead>
                    <tr>
                      <th />
                      {['Real Numbers', 'Polynomials', 'Linear Eqns', 'Quadratics', 'Triangles'].map(t => <th key={t} style={{ textAlign: 'center' }}>{t}</th>)}
                      <th style={{ textAlign: 'center' }}>Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Ananya Iyer', 88, 72, 64, 41, 79],
                      ['Vikram Rao', 94, 86, 81, 72, 90],
                      ['Meera Nair', 62, 58, 49, 33, 61],
                      ['Aditya Sharma', 79, 74, 68, 55, 71],
                      ['Sana Qureshi', 48, 41, 37, 22, 44],
                      ['Rahul Menon', 71, 66, 59, 44, 68],
                      ['Divya Krishnan', 35, 29, 24, 18, 31],
                      ['Arjun Pillai', 83, 77, 70, 61, 80],
                    ].map(([n, ...v]) => {
                      const nums = v as number[];
                      const avg = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
                      return (
                        <tr key={n as string}>
                          <td className="nm">{n}</td>
                          {nums.map((x, idx) => (
                            <td key={idx} className="cell" style={{ background: hmColor(x) }}>{x}</td>
                          ))}
                          <td className="cell" style={{ background: hmColor(avg), opacity: 0.85 }}>{avg}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 6: MASTERY TRACKER */}
        {view === 'mast' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">📈 MASTERY TRACKER</div>
                <h1>Subject Knowledge Graph</h1>
                <div className="sub">Deep-dive structural analysis of student conceptual understanding.</div>
              </div>
            </div>

            <div className="g2" style={{ gridTemplateColumns: '340px 1fr' }}>
              <div>
                <div className="card" style={{ background: 'var(--ink)', color: '#fff', marginBottom: 18 }}>
                  <div className="av" style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 22, marginBottom: 16 }}>A</div>
                  <h2 style={{ fontSize: 29, fontWeight: 800 }}>Ananya Iyer</h2>
                  <div style={{ color: '#9FBBE0', fontSize: 14, marginTop: 4 }}>10A · Mathematics</div>
                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', color: '#9FBBE0' }}>OVERALL STRUCTURAL MASTERY</div>
                    <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1, marginTop: 6 }}>72%</div>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: 23, fontWeight: 800, marginBottom: 16 }}>Knowledge Hierarchy</h3>
                <div style={{ border: '2px solid var(--blue)', borderRadius: 16, padding: 20, marginBottom: 12, background: '#FAFCFF' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                    <div className="av" style={{ background: 'var(--blue)', color: '#fff' }}>1</div>
                    <div style={{ flex: 1 }}><b style={{ fontSize: 18 }}>Algebra</b><div className="muted">4 Micro-topics</div></div>
                    <b style={{ fontSize: 22, color: 'var(--green)' }}>78%</b>
                  </div>
                  {[
                    ['Linear Equations', 86, 'g'],
                    ['Quadratic Equations', 41, 'r'],
                    ['Polynomials', 82, 'g'],
                    ['Factoring', 74, 'g'],
                  ].map(([t, v, c]) => (
                    <div key={t as string} className="row" style={{ border: 0, padding: '11px 0' }}>
                      <span style={{ color: c === 'r' ? 'var(--red)' : 'var(--green)', fontSize: 15 }}>{c === 'r' ? '⊘' : '⊙'}</span>
                      <b style={{ flex: '0 0 180px', fontSize: 14 }}>{t}</b>
                      {bar(v as number)}
                      <b style={{ width: 46, textAlign: 'right', fontSize: 14, color: hmColor(v as number) }}>{v}%</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 7: SITUATIONAL FEED */}
        {view === 'feed' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">🔔 SITUATIONAL FEED</div>
                <h1>What changed while you were teaching</h1>
                <div className="sub">Class 10A · last 24 hours · ranked by intervention value</div>
              </div>
            </div>

            {[
              ['09:12', 'TML DROP', 'Divya Krishnan fell below the 25% threshold on Quadratics after a failed retake.', 'r', 'Assign remedial'],
              ['09:40', 'PROCTORING', 'Two tab-switch events during the 10B chapter test. Recording flagged for your review.', 'r', 'Adjudicate'],
              ['10:05', 'AI GRADE', '17 submissions graded by AI on Quadratic Equations L2. Awaiting your confirmation.', 'a', 'Review batch'],
              ['11:22', 'BREAKTHROUGH', 'Sana Qureshi completed a 3-step Socratic sequence unaided. Circles moved 22% → 34%.', 'g', 'Send praise note'],
              ['12:48', 'WELLNESS', 'Three unresolved energy check-ins below 40%. One student flagged twice this week.', 'a', 'Open wellness'],
            ].map(([t, tag, d, c, act]) => (
              <div key={t} className="card" style={{ marginBottom: 12, padding: '20px 24px', display: 'flex', gap: 18, alignItems: 'center', borderLeft: `4px solid ${c === 'r' ? 'var(--red)' : c === 'a' ? 'var(--amber)' : 'var(--green)'}` }}>
                <b className="mono" style={{ fontSize: 13, color: 'var(--mut)', width: 48 }}>{t}</b>
                <span className={`ch ${c}`} style={{ minWidth: 104, justifyContent: 'center' }}>{tag}</span>
                <div style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>{d}</div>
                <button className={`btn ${c === 'r' ? 'red' : ''}`} onClick={() => alert(`Action executed: ${act}`)}>{act}</button>
              </div>
            ))}
          </div>
        )}

        {/* VIEW 8: STUDENT WELLNESS */}
        {view === 'well' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">💚 CLASSROOM PULSE</div>
                <h1>Wellness Dashboard</h1>
                <div className="sub">CBSE 2026 wellness mandate · reporting-ready</div>
              </div>
              <div className="acts">
                <span className="ch g">🛡 DPDP: consent on file for 38/38</span>
              </div>
            </div>

            <div className="g2">
              <div className="card">
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Unreviewed Journals</h3>
                {[
                  ['Divya Krishnan', '26/07/2026, 08:14', 'LOW ENERGY', 'a', "I can't seem to focus in the mornings. Everything is a blur."],
                  ['Ananya Iyer', '26/07/2026, 08:22', 'REFLECTIVE', 'b', "I'm starting to enjoy literature more. The new book is interesting."],
                  ['Sana Qureshi', '26/07/2026, 08:31', 'LOW ENERGY', 'a', "Too much homework this week. I keep falling behind and it stresses me out."],
                ].map(([n, d, tag, c, txt]) => (
                  <div key={n} style={{ borderLeft: `3px solid ${c === 'a' ? 'var(--amber)' : 'var(--purple)'}`, background: '#FAFCFE', padding: '16px 18px', marginBottom: 12, borderRadius: '0 14px 14px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <b>{n}</b>
                      <span className={`ch ${c}`}>{tag}</span>
                    </div>
                    <p style={{ fontSize: 14, marginTop: 8, color: '#33465F' }}>"{txt}"</p>
                  </div>
                ))}
              </div>

              <div className="card">
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Unresolved Energy Check-ins</h3>
                {[
                  [35, 'Divya Krishnan', '26/07/2026, 08:14', 'Check-in', 'r'],
                  [28, 'Sana Qureshi', '26/07/2026, 08:31', 'Check-in', 'r'],
                  [38, 'Rahul Menon', '26/07/2026, 08:44', 'Check-in', 'r'],
                ].map(([v, n, d, act, c]) => (
                  <div key={n as string} className="row">
                    <b style={{ fontSize: 18, color: hmColor(v as number) }}>{v}%</b>
                    <div style={{ flex: 1, fontWeight: 600 }}>{n}</div>
                    <button className="btn red" onClick={() => alert(`Initiating check-in with ${n}`)}>Check-in</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Global Role Switcher */}
      <div className="role-sw">
        <Link href="/student">Student</Link>
        <Link href="/teacher" className="on">Teacher</Link>
        <Link href="/admin">Admin</Link>
        <Link href="/parent">Parent</Link>
      </div>
    </div>
  );
}
