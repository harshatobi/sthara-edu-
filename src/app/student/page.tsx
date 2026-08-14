'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function StudentPortal() {
  const [view, setView] = useState<'dash' | 'hw' | 'vid' | 'tutor' | 'well'>('dash');
  const [energy, setEnergy] = useState<string>('🚀');
  const [tutorStep, setTutorStep] = useState(2);
  const [userMsg, setUserMsg] = useState('');
  const [chatLog, setChatLog] = useState([
    { w: 'me', t: "I don't get question 3. What is the length of the tangent?" },
    { w: 'ai', t: "Before I answer — what do we know about the angle between a tangent and the radius at the point of contact?" },
    { w: 'me', t: "Is it 90 degrees?" },
    { w: 'ai', t: "Exactly. So if you draw the radius to the point of contact, what kind of triangle have you just made with the centre, the point of contact, and the external point?" },
    { w: 'me', t: "A right triangle?" },
    { w: 'ai', t: "<b>Hint 2 of 3.</b> Right triangle, correct. You know the radius (5 cm) and the distance from centre to external point (13 cm). Which theorem lets you find the third side? Try it — tell me the number you get and I will check it." },
    { w: 'me', t: "13² − 5² = 144, so 12 cm?" },
    { w: 'ai-ok', t: "<b>12 cm is right.</b> You got there without me giving the answer — that is worth more to your TML than a correct copy. Circles moved 31% → 38%." }
  ]);

  const hmColor = (v: number) => (v >= 75 ? '#10B981' : v >= 55 ? '#5FC79B' : v >= 40 ? '#F5B60B' : v >= 25 ? '#F98A4B' : '#E11D48');
  const bar = (v: number, c?: string) => (
    <div className="bar"><i style={{ width: `${v}%`, background: c || hmColor(v) }} /></div>
  );

  const handleSendTutor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userMsg.trim()) return;
    const msg = userMsg.trim();
    setUserMsg('');
    setChatLog(prev => [
      ...prev,
      { w: 'me', t: msg },
      { w: 'ai', t: `Great reasoning! You've analyzed the problem step by step. Keep going!` }
    ]);
  };

  return (
    <div className="portal-shell">
      <style jsx global>{`
        :root {
          --nav:#062347; --nav2:#0A2C57; --navActive:#14365E;
          --ink:#002147; --body:#F7F9FB; --line:#E8EDF4;
          --red:#E11D48; --blue:#2F6BFF; --sky:#4C8DFF;
          --green:#10B981; --amber:#F59E0B; --purple:#7C5CFC;
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
        .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .g3 { display: grid; grid-template-columns: repeat(auto-fit,minmax(280px,1fr)); gap: 18px; }
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
        .energy { display: flex; gap: 8px; background: rgba(255,255,255,.12); border-radius: 14px; padding: 9px 14px; align-items: center; }
        .energy b { font-size: 11px; letter-spacing: .11em; color: #A9C4E8; font-weight: 800; }
        .energy button { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.1); font-size: 16px; display: grid; place-items: center; transition: .15s; border: none; cursor: pointer; }
        .energy button.on { background: var(--amber); box-shadow: 0 0 0 3px rgba(245,182,11,.35); }

        .role-sw { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 50; background: var(--ink); border-radius: 99px; padding: 7px; display: flex; gap: 4px; box-shadow: 0 14px 40px rgba(0,33,71,.35); }
        .role-sw a { padding: 10px 20px; border-radius: 99px; color: #93A7C4; font-size: 13px; font-weight: 700; text-decoration: none; }
        .role-sw a.on { background: var(--red); color: #fff; }
      `}</style>

      {/* Sidebar */}
      <aside>
        <div className="brand">
          <b>Sthara</b>
          <i>HONEST DESK</i>
        </div>
        <nav>
          {[
            ['dash', 'Dashboard', '🏠'],
            ['hw', 'Homework (Proctored)', '✎'],
            ['vid', 'Video Library', '▶'],
            ['tutor', 'AI Tutor', '💬'],
            ['well', 'Wellness Center', '☺'],
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <span className="chip mono">STU1042</span>
                    <span className="chip">Class: 10A</span>
                    <span className="chip">DPS Vasundhara</span>
                  </div>
                  <h1>Welcome back, <span style={{ color: '#F5B60B' }}>Ananya</span>!</h1>
                  <div className="hsub">Ready to unleash yourself today? Your personalised learning path awaits.</div>
                </div>

                <div className="energy">
                  <b>ENERGY</b>
                  {['😴', '😐', '🚀'].map(e => (
                    <button key={e} className={energy === e ? 'on' : ''} onClick={() => setEnergy(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hgrid">
                <div className="hstat">
                  <div>
                    <div className="lb">TRUE MASTERY LEVEL</div>
                    <div className="vl">72%</div>
                    <div className="nt">▲ 6 pts this fortnight</div>
                  </div>
                  <div className="ic">📈</div>
                </div>
                <div className="hstat">
                  <div>
                    <div className="lb">PENDING TASKS</div>
                    <div className="vl">3</div>
                    <div className="nt">1 due tomorrow</div>
                  </div>
                  <div className="ic">🎯</div>
                </div>
                <div className="hstat">
                  <div>
                    <div className="lb">RECENT SCORE</div>
                    <div className="vl">18<span style={{ fontSize: 20, color: '#8FAED6' }}>/20</span></div>
                    <div className="nt">Trigonometry quiz</div>
                  </div>
                  <div className="ic">🏅</div>
                </div>
              </div>
            </div>

            <div className="g2">
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <h3 style={{ fontSize: 19, fontWeight: 800 }}>Your TML by subject</h3>
                  <span className="ch b">LIVE</span>
                </div>
                <p className="muted" style={{ marginBottom: 18 }}>True Mastery Level blends classwork, graded homework, quizzes, tutor depth and attendance.</p>
                {[
                  ['Mathematics', 78, 'Strong on Algebra, weak on Circles'],
                  ['Science', 71, 'Chemical Reactions needs revision'],
                  ['Social Studies', 64, 'Nationalism topics improving'],
                  ['English', 83, 'Consistently strong'],
                  ['Hindi', 69, 'Grammar drills recommended'],
                ].map(([s, v, n]) => (
                  <div key={s as string} className="row">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{s}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{n}</div>
                    </div>
                    {bar(v as number)}
                    <b style={{ width: 44, textAlign: 'right', fontSize: 15, color: hmColor(v as number) }}>{v}%</b>
                  </div>
                ))}
              </div>

              <div>
                <div className="card" style={{ marginBottom: 18 }}>
                  <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>Due next</h3>
                  {[
                    ['MATHEMATICS', 'Quadratic Equations — Level 2', 'Due 28 Jul', 'r'],
                    ['SCIENCE', 'Periodic Classification worksheet', 'Due 30 Jul', 'a'],
                    ['SOCIAL STUDIES', 'Nationalism in India — map work', 'Due 02 Aug', 'n'],
                  ].map(([sub, t, d, c]) => (
                    <div key={t} className="row">
                      <div className="av">📄</div>
                      <div style={{ flex: 1 }}>
                        <span className="ch n" style={{ fontSize: 10 }}>{sub}</span>
                        <div style={{ fontWeight: 700, fontSize: 14, marginTop: 5 }}>{t}</div>
                      </div>
                      <span className={`ch ${c}`}>{d}</span>
                    </div>
                  ))}
                </div>

                <div className="card" style={{ background: 'linear-gradient(120deg,#123F84,#0F5AB8)', color: '#fff' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,.16)', display: 'grid', placeItems: 'center', fontSize: 19 }}>🧠</div>
                    <div>
                      <h3 style={{ fontSize: 18, fontWeight: 800 }}>Your AI Learning Path</h3>
                      <p style={{ color: '#BBD3F2', fontSize: 13.5, lineHeight: 1.65, marginTop: 8 }}>
                        Circles is your lowest micro-topic at <b style={{ color: '#F5B60B' }}>31%</b>. Clear the 3-step Socratic module before Friday's chapter test.
                      </p>
                      <button className="btn" style={{ background: '#fff', color: 'var(--ink)', marginTop: 16 }} onClick={() => setView('tutor')}>
                        Start with the AI Tutor →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: HOMEWORK */}
        {view === 'hw' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">✎ PROCTORED HOMEWORK</div>
                <h1>Assignments</h1>
                <div className="sub">Camera + tab-focus proctoring active during timed submissions.</div>
              </div>
              <div className="acts">
                <span className="ch g">✓ Integrity: clean</span>
                <button className="btn pri" onClick={() => alert('Photo upload initiated!')}>Upload work</button>
              </div>
            </div>

            <div className="g3">
              {[
                ['MATHEMATICS', 'Quadratic Equations — Level 2', 'Factoring & the quadratic formula. 6 questions.', '28 Jul', 'PENDING', 'a', '#E11D48'],
                ['SCIENCE', 'Periodic Classification', 'Short answers + one diagram. OCR graded.', '30 Jul', 'PENDING', 'a', '#F59E0B'],
                ['SOCIAL STUDIES', 'Nationalism in India', 'Map work, upload a photo of your atlas page.', '02 Aug', 'NOT STARTED', 'n', '#7C5CFC'],
              ].map(([s, t, d, due, st, c, col]) => (
                <div key={t} className="card" style={{ borderTop: `4px solid ${col}`, paddingTop: 22 }}>
                  <span className="ch n" style={{ fontSize: 10 }}>{s}</span>
                  <h3 style={{ fontSize: 19, fontWeight: 800, margin: '9px 0 6px' }}>{t}</h3>
                  <p className="muted">{d}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', marginTop: 18, paddingTop: 16 }}>
                    <div>
                      <div className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em' }}>DUE</div>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{due}</div>
                    </div>
                    <button className="btn pri" onClick={() => alert(`Opening assignment: ${t}`)}>Open →</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 3: VIDEO LIBRARY */}
        {view === 'vid' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">▶ VIDEO LIBRARY</div>
                <h1>Mathematics · Class 10A</h1>
                <div className="sub">Uploaded by your school and mapped to the NCERT syllabus.</div>
              </div>
            </div>

            <div className="g3">
              {[
                ['Quadratic Equations — Factoring', '12:40', 'Ch 4 · Watched', 100],
                ['The Quadratic Formula', '15:02', 'Ch 4 · 60% watched', 60],
                ['Nature of Roots & Discriminant', '09:18', 'Ch 4 · Not started', 0],
                ['Introduction to Trigonometry', '18:25', 'Ch 8 · Watched', 100],
                ['Circles — Tangents', '14:11', 'Ch 10 · Not started', 0],
              ].map(([t, d, m, p]) => (
                <div key={t as string} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ height: 132, background: 'linear-gradient(130deg,#123F84,#0F5AB8)', display: 'grid', placeItems: 'center', position: 'relative' }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,.22)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 19, cursor: 'pointer' }} onClick={() => alert(`Playing video: ${t}`)}>
                      ▶
                    </div>
                    <span className="chip mono" style={{ position: 'absolute', bottom: 10, right: 12 }}>{d}</span>
                  </div>
                  <div style={{ padding: '18px 20px' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800 }}>{t}</h3>
                    <div className="muted" style={{ marginTop: 6 }}>{m}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: AI TUTOR */}
        {view === 'tutor' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">💬 SOCRATIC AI TUTOR</div>
                <h1>Circles — Tangents</h1>
                <div className="sub">Probe → hint → answer. The tutor will not hand you the answer on the first ask.</div>
              </div>
              <div className="acts">
                <span className="ch p">ESCALATION: HINT (2 of 3)</span>
              </div>
            </div>

            <div className="g2">
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
                  <b>Session · 12 min · depth score 0.78</b>
                  <span className="ch g">FEEDS TML</span>
                </div>

                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 440, overflowY: 'auto' }}>
                  {chatLog.map((c, i) => (
                    <div key={i} style={{ alignSelf: c.w === 'me' ? 'flex-end' : 'flex-start', maxWidth: c.w === 'me' ? '74%' : '80%' }}>
                      <div
                        style={{
                          background: c.w === 'me' ? 'var(--ink)' : c.w === 'ai-ok' ? '#F0FDF7' : '#F4F7FC',
                          color: c.w === 'me' ? '#fff' : '#000',
                          border: c.w === 'ai-ok' ? '1px solid #BBF7D0' : 'none',
                          borderRadius: 16,
                          padding: '13px 17px',
                          fontSize: 14,
                          lineHeight: 1.6,
                        }}
                        dangerouslySetInnerHTML={{ __html: c.t }}
                      />
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSendTutor} style={{ padding: '16px 24px', borderTop: '1px solid var(--line)', display: 'flex', gap: 10 }}>
                  <input
                    className="btn"
                    style={{ flex: 1, textInput: 'left' } as any}
                    placeholder="Ask a follow-up…"
                    value={userMsg}
                    onChange={e => setUserMsg(e.target.value)}
                  />
                  <button type="submit" className="btn red">Send</button>
                </form>
              </div>

              <div className="card">
                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Session impact</h3>
                <div style={{ fontSize: 38, fontWeight: 800, color: 'var(--amber)' }}>38%</div>
                <div className="ch g" style={{ marginTop: 8 }}>▲ 7 pts this session</div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 5: WELLNESS CENTER */}
        {view === 'well' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">☺ WELLNESS CENTER</div>
                <h1>How are you doing today?</h1>
                <div className="sub">Private by default. Your teacher sees trends, not your words.</div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>Daily energy check-in</h3>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                {['😫', '😴', '😐', '🙂', '🚀'].map(e => (
                  <button
                    key={e}
                    style={{
                      flex: 1,
                      fontSize: 28,
                      padding: 16,
                      borderRadius: 16,
                      border: energy === e ? '2px solid var(--amber)' : '1px solid var(--line)',
                      background: energy === e ? '#FFFBEB' : '#fff',
                      cursor: 'pointer',
                    }}
                    onClick={() => setEnergy(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Global Role Switcher */}
      <div className="role-sw">
        <Link href="/student" className="on">Student</Link>
        <Link href="/teacher">Teacher</Link>
        <Link href="/admin">Admin</Link>
        <Link href="/parent">Parent</Link>
      </div>
    </div>
  );
}
