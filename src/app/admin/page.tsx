'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function AdminPortal() {
  const [view, setView] = useState<'dash' | 'adm' | 'staff' | 'acad' | 'cbse' | 'dpdp'>('dash');

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
        .kpis { display: grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap: 18px; margin-bottom: 22px; }
        .kpi { background: #fff; border-radius: var(--r); box-shadow: var(--sh); padding: 24px 26px; position: relative; overflow: hidden; }
        .kpi .lb { font-size: 11.5px; font-weight: 800; letter-spacing: .11em; color: var(--mut); }
        .kpi .vl { font-size: 46px; font-weight: 800; line-height: 1; margin-top: 10px; }
        .kpi .nt { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; margin-top: 10px; }
        .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .ch { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 8px; font-size: 11px; font-weight: 800; letter-spacing: .04em; }
        .ch.g{background:#DCFCE7;color:#0B7A54}.ch.a{background:#FEF3C7;color:#92600A}
        .ch.r{background:#FFE4EA;color:#B4123C}.ch.b{background:#E6EEFF;color:#1E4FCC}
        .ch.n{background:#F1F5F9;color:#556378}
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
        .note { background: #FFF8E7; border-left: 3px solid var(--amber); border-radius: 10px; padding: 14px 16px; font-size: 13px; color: #7A5A08; line-height: 1.6; }

        .role-sw { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 50; background: var(--ink); border-radius: 99px; padding: 7px; display: flex; gap: 4px; box-shadow: 0 14px 40px rgba(0,33,71,.35); }
        .role-sw a { padding: 10px 20px; border-radius: 99px; color: #93A7C4; font-size: 13px; font-weight: 700; text-decoration: none; }
        .role-sw a.on { background: var(--red); color: #fff; }
      `}</style>

      {/* Sidebar */}
      <aside>
        <div className="brand">
          <b>Sthara</b>
          <i>COMMAND CENTRE</i>
        </div>
        <nav>
          {[
            ['dash', 'Dashboard', '📊'],
            ['adm', 'Admissions & Fees', '₹'],
            ['staff', 'Staff & Timetable', '📅'],
            ['acad', 'Academic Health', '📈'],
            ['cbse', 'CBSE Wellness Report', '💚'],
            ['dpdp', 'DPDP & Compliance', '🛡'],
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
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
                <div>
                  <h1>DPS Vasundhara</h1>
                  <div className="hsub">
                    Command Centre · AY 2026–27 <span className="chip mono">sch-vsn-2026</span> <span className="chip">Shikhara plan · 812 students</span>
                  </div>
                </div>
                <button className="btn" style={{ background: '#fff', color: 'var(--ink)' }} onClick={() => alert('Board pack PDF export generated!')}>
                  ⤓ Export board pack
                </button>
              </div>

              <div className="hgrid">
                <div className="hstat">
                  <div>
                    <div className="lb">SCHOOL-WIDE TML</div>
                    <div className="vl">66%</div>
                    <div className="nt">▲ 4 pts vs Term 1</div>
                  </div>
                  <div className="ic">📈</div>
                </div>
                <div className="hstat">
                  <div>
                    <div className="lb">FEE COLLECTION</div>
                    <div className="vl">91%</div>
                    <div className="nt">₹18.4L outstanding</div>
                  </div>
                  <div className="ic">₹</div>
                </div>
                <div className="hstat" style={{ background: 'rgba(245,182,11,.16)', borderColor: 'rgba(245,182,11,.3)' }}>
                  <div>
                    <div className="lb">CBSE WELLNESS FILING</div>
                    <div className="vl" style={{ fontSize: 26 }}>Due 15 Sep</div>
                    <div className="nt">Report 84% auto-populated</div>
                  </div>
                  <div className="ic" style={{ background: 'rgba(245,182,11,.28)' }}>♡</div>
                </div>
              </div>
            </div>

            <div className="kpis">
              <div className="kpi">
                <div className="lb">ENROLMENT</div>
                <div className="vl">812</div>
                <div className="nt" style={{ color: 'var(--green)' }}>▲ 44 vs last year</div>
              </div>
              <div className="kpi">
                <div className="lb">TEACHING STAFF</div>
                <div className="vl">47</div>
                <div className="nt" style={{ color: 'var(--mut)' }}>1:17 ratio</div>
              </div>
              <div className="kpi">
                <div className="lb">ATTENDANCE TODAY</div>
                <div className="vl">94%</div>
                <div className="nt" style={{ color: 'var(--amber)' }}>49 absent</div>
              </div>
              <div className="kpi">
                <div className="lb">STUDENTS AT RISK</div>
                <div className="vl" style={{ color: 'var(--red)' }}>61</div>
                <div className="nt" style={{ color: 'var(--red)' }}>TML below 40%</div>
              </div>
            </div>

            <div className="g2">
              <div className="card">
                <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>TML by grade</h3>
                <p className="muted" style={{ marginBottom: 20 }}>Where the school is structurally weak — visible before term-end results, not after.</p>
                {[
                  ['Grade 6', 74],
                  ['Grade 7', 69],
                  ['Grade 8', 66],
                  ['Grade 9', 58],
                  ['Grade 10', 63],
                  ['Grade 11', 71],
                  ['Grade 12', 68],
                ].map(([g, v]) => (
                  <div key={g as string} className="row">
                    <b style={{ flex: '0 0 84px', fontSize: 14 }}>{g}</b>
                    {bar(v as number)}
                    <b style={{ width: 46, textAlign: 'right', color: hmColor(v as number) }}>{v}%</b>
                  </div>
                ))}
              </div>

              <div className="card">
                <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>Admin AI · what needs a decision</h3>
                {[
                  ['Grade 9 Maths underperformance across 3 sections', 'Reallocate senior staff or add remedial block', 'r', 'acad'],
                  ['61 students below 40% TML school-wide', 'Auto-generate remedial cohorts', 'r', 'acad'],
                  ['₹18.4L fees outstanding, 74 families', 'Stage WhatsApp reminders', 'a', 'adm'],
                  ['CBSE wellness report due 15 Sep', '84% auto-populated, review and file', 'a', 'cbse'],
                ].map(([t, s, c, targetView]) => (
                  <div key={t} className="row">
                    <div className="av" style={{ background: c === 'r' ? '#FFE4EA' : '#FEF3C7', color: c === 'r' ? 'var(--red)' : '#92600A' }}>✦</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{t}</div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{s}</div>
                    </div>
                    <button className="btn" onClick={() => setView(targetView as any)}>Act</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: ADMISSIONS & FEES */}
        {view === 'adm' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">₹ ADMISSIONS &amp; FEES</div>
                <h1>Fee ledger</h1>
                <div className="sub">AY 2026–27 · 812 students · Shikhara ₹3,500/student/yr platform cost</div>
              </div>
              <div className="acts">
                <button className="btn red" onClick={() => alert('74 WhatsApp reminders staged and sent!')}>Stage 74 WhatsApp reminders</button>
              </div>
            </div>

            <div className="kpis">
              <div className="kpi">
                <div className="lb">BILLED YTD</div>
                <div className="vl" style={{ fontSize: 36 }}>₹2.04 Cr</div>
              </div>
              <div className="kpi">
                <div className="lb">COLLECTED</div>
                <div className="vl" style={{ fontSize: 36, color: 'var(--green)' }}>₹1.86 Cr</div>
              </div>
              <div className="kpi">
                <div className="lb">OUTSTANDING</div>
                <div className="vl" style={{ fontSize: 36, color: 'var(--red)' }}>₹18.4 L</div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: STAFF & TIMETABLE */}
        {view === 'staff' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">📅 STAFF &amp; TIMETABLE</div>
                <h1>Workforce</h1>
                <div className="sub">47 teaching · 18 non-teaching · 1:17 student-teacher ratio</div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>Teacher effectiveness · Mathematics department</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Teacher', 'Classes', 'Students', 'Class TML', 'Δ fortnight', 'Copilot use', 'Grading backlog'].map((h, idx) => (
                        <th key={h} style={{ textAlign: idx > 1 ? 'center' : 'left', fontSize: 11, fontWeight: 800, color: 'var(--mut)', padding: '0 12px 12px' }}>
                          {h.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Priya Menon', 4, 148, 64, '+3', 'High', 17, 'g'],
                      ['Sanjay Bhatt', 4, 142, 58, '−1', 'Medium', 41, 'a'],
                      ['Ritu Agarwal', 3, 109, 71, '+5', 'High', 6, 'g'],
                      ['Mohan Das', 4, 151, 52, '−4', 'None', 88, 'r'],
                    ].map(([n, c, s, t, d, u, b, col]) => (
                      <tr key={n as string} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '14px 12px', fontWeight: 700 }}>{n}</td>
                        <td style={{ padding: '14px 12px' }}>{c}</td>
                        <td style={{ padding: '14px 12px', textAlign: 'center' }}>{s}</td>
                        <td style={{ padding: '14px 12px', textAlign: 'center', color: hmColor(t as number), fontWeight: 800 }}>{t}%</td>
                        <td style={{ padding: '14px 12px', textAlign: 'center' }}>{d}</td>
                        <td style={{ padding: '14px 12px', textAlign: 'center' }}><span className={`ch ${col}`}>{u}</span></td>
                        <td style={{ padding: '14px 12px', textAlign: 'center', fontWeight: 800 }}>{b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: ACADEMIC HEALTH */}
        {view === 'acad' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">📈 ACADEMIC HEALTH</div>
                <h1>School-wide diagnostics</h1>
                <div className="sub">Live TML across 812 students · updated continuously</div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>Grade × subject TML</h3>
              <table className="hm">
                <thead>
                  <tr>
                    <th />
                    {['Maths', 'Science', 'Social', 'English', 'Hindi'].map(t => <th key={t} style={{ textAlign: 'center' }}>{t}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Grade 6', [78, 74, 71, 80, 68]],
                    ['Grade 7', [70, 68, 64, 76, 66]],
                    ['Grade 8', [64, 66, 62, 73, 64]],
                    ['Grade 9', [48, 55, 58, 68, 61]],
                    ['Grade 10', [61, 63, 60, 72, 59]],
                  ].map(([g, v]) => (
                    <tr key={g as string}>
                      <td className="nm">{g}</td>
                      {(v as number[]).map((x, idx) => (
                        <td key={idx} className="cell" style={{ background: hmColor(x) }}>{x}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 5: CBSE WELLNESS REPORT */}
        {view === 'cbse' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">💚 CBSE 2026 WELLNESS MANDATE</div>
                <h1>Wellness Report — AY 2026–27</h1>
                <div className="sub">Filing due 15 Sep 2026 · 84% auto-populated from live check-in data</div>
              </div>
              <div className="acts">
                <button className="btn red" onClick={() => alert('CBSE Wellness PDF Report downloaded!')}>⤓ Generate CBSE PDF</button>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>Filing checklist</h3>
              {[
                ['Student wellbeing measurement framework', 'Auto — TML energy check-ins', 'done'],
                ['Participation and coverage evidence', 'Auto — 89% across 7 grades', 'done'],
                ['At-risk identification protocol', 'Auto — threshold rules documented', 'done'],
                ['Intervention log with outcomes', 'Auto — 147 entries, 118 resolved', 'done'],
                ['Staff wellness training hours', 'Manual entry required', 'todo'],
              ].map(([t, s, st]) => (
                <div key={t} className="row">
                  <div className="av" style={{ background: st === 'done' ? '#DCFCE7' : '#FEF3C7', color: st === 'done' ? 'var(--green)' : '#92600A' }}>
                    {st === 'done' ? '✓' : '✎'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t}</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{s}</div>
                  </div>
                  <span className={`ch ${st === 'done' ? 'g' : 'a'}`}>{st === 'done' ? 'AUTO' : 'ACTION'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 6: DPDP & COMPLIANCE */}
        {view === 'dpdp' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">🛡 DPDP ACT 2023</div>
                <h1>Data Protection &amp; Compliance</h1>
                <div className="sub">Indian data residency · Role-based access · Audit trail active</div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>Compliance Architecture</h3>
              <p className="muted" style={{ marginBottom: 20 }}>
                All student data hosted in India with enterprise multi-tenant isolation, encrypted storage, and parental consent logs.
              </p>
              <div className="ch g" style={{ fontSize: 14, padding: '10px 18px' }}>
                100% DPDP Act 2023 Compliant
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Global Role Switcher */}
      <div className="role-sw">
        <Link href="/student">Student</Link>
        <Link href="/teacher">Teacher</Link>
        <Link href="/admin" className="on">Admin</Link>
        <Link href="/parent">Parent</Link>
      </div>
    </div>
  );
}
