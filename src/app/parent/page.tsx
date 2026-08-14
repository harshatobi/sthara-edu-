'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ParentPortal() {
  const [view, setView] = useState<'dash' | 'tml' | 'msg' | 'fees'>('dash');
  const [waReply, setWaReply] = useState('');
  const [waMessages, setWaMessages] = useState([
    { w: 'them', t: 'Good afternoon Mrs. Iyer 🙏 This is an automated update from DPS Vasundhara via Sthara.', time: '2:14 PM' },
    { w: 'them', t: '<b>Ananya (10A)</b> — Maths homework graded: <b>13/15</b>. TML now 72% (▲6). Full report in the app.', time: '2:14 PM' },
    { w: 'them', t: '<b>Rohan (7B)</b> — Science worksheet is <b>2 days overdue</b>. Reply <b>1</b> to notify his teacher, <b>2</b> to request an extension.', time: '2:15 PM' },
    { w: 'me', t: '2', time: '6:02 PM' },
    { w: 'them', t: 'Extension requested. Mr. Bhatt will confirm by tomorrow morning.', time: '6:02 PM' },
    { w: 'them', t: '📅 Reminder: PTM on Saturday 01 Aug, 10:00 AM. Reply <b>Y</b> to confirm attendance.', time: '6:03 PM' },
    { w: 'me', t: 'Y', time: '6:05 PM' },
    { w: 'them', t: 'Confirmed ✅ Slot 10:20–10:35 with Ms. Menon (Class 10A).', time: '6:05 PM' },
  ]);

  const hmColor = (v: number) => (v >= 75 ? '#10B981' : v >= 55 ? '#5FC79B' : v >= 40 ? '#F5B60B' : v >= 25 ? '#F98A4B' : '#E11D48');
  const bar = (v: number, c?: string) => (
    <div className="bar"><i style={{ width: `${v}%`, background: c || hmColor(v) }} /></div>
  );

  const handleWaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waReply.trim()) return;
    const txt = waReply.trim();
    setWaReply('');
    setWaMessages(prev => [
      ...prev,
      { w: 'me', t: txt, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
      { w: 'them', t: `Received: "${txt}". Your response has been recorded.`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
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
        .kpis { display: grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap: 18px; margin-bottom: 22px; }
        .kpi { background: #fff; border-radius: var(--r); box-shadow: var(--sh); padding: 24px 26px; position: relative; overflow: hidden; }
        .kpi .lb { font-size: 11.5px; font-weight: 800; letter-spacing: .11em; color: var(--mut); }
        .kpi .vl { font-size: 46px; font-weight: 800; line-height: 1; margin-top: 10px; }
        .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .ch { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 8px; font-size: 11px; font-weight: 800; letter-spacing: .04em; }
        .ch.g{background:#DCFCE7;color:#0B7A54}.ch.a{background:#FEF3C7;color:#92600A}
        .ch.r{background:#FFE4EA;color:#B4123C}.ch.b{background:#E6EEFF;color:#1E4FCC}
        .row { display: flex; align-items: center; gap: 14px; padding: 15px 0; border-bottom: 1px solid var(--line); }
        .row:last-child { border-bottom: 0; }
        .av { width: 40px; height: 40px; border-radius: 11px; background: var(--pale); color: var(--blue); display: grid; place-items: center; font-weight: 800; font-size: 15px; flex: 0 0 40px; }
        .bar { height: 8px; background: #EDF1F7; border-radius: 99px; overflow: hidden; flex: 1; min-width: 60px; }
        .bar>i { display: block; height: 100%; border-radius: 99px; }
        .muted { color: var(--mut); font-size: 13px; }
        .note { background: #FFF8E7; border-left: 3px solid var(--amber); border-radius: 10px; padding: 14px 16px; font-size: 13px; color: #7A5A08; line-height: 1.6; }

        /* Mobile Phone Simulator */
        .frames { display: flex; gap: 34px; flex-wrap: wrap; align-items: flex-start; }
        .phone { width: 352px; flex: 0 0 352px; background: var(--nav); border-radius: 42px; padding: 11px; box-shadow: 0 30px 70px rgba(0,33,71,.22); }
        .phone .scr { background: var(--body); border-radius: 32px; overflow: hidden; height: 680px; overflow-y: auto; position: relative; display: flex; flex-direction: column; }
        .notch { height: 26px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; font-size: 11px; font-weight: 700; color: #fff; background: var(--nav); position: sticky; top: 0; z-index: 5; }
        .pbody { padding: 16px; flex: 1; display: flex; flex-direction: column; }
        .wa { background: #ECE5DD; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px; flex: 1; overflow-y: auto; }
        .wa .b { max-width: 82%; padding: 10px 13px; border-radius: 12px; font-size: 13px; line-height: 1.5; box-shadow: 0 1px 1px rgba(0,0,0,.08); }
        .wa .them { background: #fff; align-self: flex-start; border-top-left-radius: 3px; }
        .wa .me { background: #DCF8C6; align-self: flex-end; border-top-right-radius: 3px; }
        .wa .t { display: block; font-size: 10px; color: #7C8B91; text-align: right; margin-top: 4px; }

        .role-sw { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 50; background: var(--ink); border-radius: 99px; padding: 7px; display: flex; gap: 4px; box-shadow: 0 14px 40px rgba(0,33,71,.35); }
        .role-sw a { padding: 10px 20px; border-radius: 99px; color: #93A7C4; font-size: 13px; font-weight: 700; text-decoration: none; }
        .role-sw a.on { background: var(--red); color: #fff; }
      `}</style>

      {/* Sidebar */}
      <aside>
        <div className="brand">
          <b>Sthara</b>
          <i>FAMILY LINE</i>
        </div>
        <nav>
          {[
            ['dash', 'My Children', '🏠'],
            ['tml', 'Mastery & Reports', '📈'],
            ['msg', 'School Messages', '💬'],
            ['fees', 'Fees & Payments', '₹'],
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
        {/* VIEW 1: MY CHILDREN DASHBOARD */}
        {view === 'dash' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">🏠 FAMILY LINE</div>
                <h1>Good evening, Mrs. Iyer</h1>
                <div className="sub">DPS Vasundhara · two children enrolled · Shikhara plan</div>
              </div>
              <div className="acts">
                <span className="ch g">Fees paid to 30 Sep</span>
                <button className="btn pri" onClick={() => alert('Opening teacher message channel...')}>Message class teacher</button>
              </div>
            </div>

            <div className="frames">
              <div style={{ flex: 1, minWidth: 420 }}>
                <div className="g2">
                  {[
                    ['Ananya Iyer', '10A', 'AI', 72, '▲ 6 pts', 'g', '1 assignment due tomorrow'],
                    ['Rohan Iyer', '7B', 'RI', 58, '▼ 3 pts', 'a', 'Science homework overdue'],
                  ].map(([n, c, ini, tml, d, dc, alertMsg]) => (
                    <div key={n as string} className="card">
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 20 }}>
                        <div className="av" style={{ width: 52, height: 52, borderRadius: 14, fontSize: 17 }}>{ini}</div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 18 }}>{n}</div>
                          <div className="muted">Class {c} · DPS Vasundhara</div>
                        </div>
                      </div>

                      <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em' }}>TRUE MASTERY LEVEL</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '8px 0 16px' }}>
                        <div style={{ fontSize: 46, fontWeight: 800, lineHeight: 1, color: hmColor(tml as number) }}>{tml}%</div>
                        <span className={`ch ${dc}`}>{d} this fortnight</span>
                      </div>
                      {bar(tml as number)}

                      <div className="note" style={{ marginTop: 18 }}>{alertMsg}</div>
                      <button className="btn pri" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={() => setView('tml')}>
                        View full report
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live WhatsApp Simulator */}
              <div className="phone">
                <div className="scr">
                  <div className="notch">
                    <span>9:41</span>
                    <span>▪▪▪ ᯤ ▮</span>
                  </div>
                  <div className="pbody">
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--mut)', marginBottom: 12, textTransform: 'uppercase' }}>
                      WhatsApp · Sthara School Line
                    </div>

                    <div className="wa">
                      {waMessages.map((m, idx) => (
                        <div key={idx} className={`b ${m.w}`}>
                          <div dangerouslySetInnerHTML={{ __html: m.t }} />
                          <span className="t">{m.time}</span>
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleWaSubmit} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <input
                        className="btn"
                        style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
                        placeholder="Reply via WhatsApp..."
                        value={waReply}
                        onChange={e => setWaReply(e.target.value)}
                      />
                      <button type="submit" className="btn pri" style={{ padding: '8px 14px' }}>Send</button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: MASTERY & REPORTS */}
        {view === 'tml' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">📈 MASTERY &amp; REPORTS</div>
                <h1>Ananya Iyer · Class 10A</h1>
                <div className="sub">True Mastery Level — a live composite, not a term-end mark.</div>
              </div>
              <div className="acts">
                <button className="btn pri" onClick={() => alert('PDF report generated for Ananya!')}>Download PDF</button>
              </div>
            </div>

            <div className="kpis">
              <div className="kpi">
                <div className="lb">TRUE MASTERY LEVEL</div>
                <div className="vl" style={{ color: 'var(--green)' }}>72%</div>
              </div>
              <div className="kpi">
                <div className="lb">ATTENDANCE</div>
                <div className="vl">96%</div>
              </div>
              <div className="kpi">
                <div className="lb">HOMEWORK ON TIME</div>
                <div className="vl">88%</div>
              </div>
              <div className="kpi">
                <div className="lb">CLASS RANK BAND</div>
                <div className="vl" style={{ fontSize: 34 }}>Top 25%</div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 18 }}>Subject breakdown</h3>
              {[
                ['Mathematics', 78],
                ['Science', 71],
                ['Social Studies', 64],
                ['English', 83],
                ['Hindi', 69],
              ].map(([s, v]) => (
                <div key={s as string} className="row">
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 14.5 }}>{s}</div>
                  {bar(v as number)}
                  <b style={{ width: 46, textAlign: 'right', color: hmColor(v as number) }}>{v}%</b>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 3: SCHOOL MESSAGES */}
        {view === 'msg' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">💬 SCHOOL MESSAGES</div>
                <h1>Message Center</h1>
                <div className="sub">Direct communication with Class 10A &amp; 7B teachers.</div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>Class Teachers</h3>
              <div className="row">
                <div className="av">PM</div>
                <div style={{ flex: 1 }}>
                  <b>Ms. Priya Menon (Mathematics · 10A)</b>
                  <div className="muted">Confirmed PTM slot for Saturday 10:20 AM</div>
                </div>
                <button className="btn pri" onClick={() => alert('Opening chat with Ms. Priya Menon...')}>Chat</button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: FEES & PAYMENTS */}
        {view === 'fees' && (
          <div>
            <div className="pbar">
              <div>
                <div className="eyebrow">₹ FEES &amp; PAYMENTS</div>
                <h1>Fee account</h1>
                <div className="sub">DPS Vasundhara · AY 2026–27 · two children</div>
              </div>
              <div className="acts">
                <span className="ch g">NO DUES</span>
                <button className="btn pri" onClick={() => alert('Redirecting to secure UPI payment gateway...')}>Pay next instalment</button>
              </div>
            </div>

            <div className="kpis">
              <div className="kpi">
                <div className="lb">PAID THIS YEAR</div>
                <div className="vl" style={{ fontSize: 38 }}>₹1,42,000</div>
              </div>
              <div className="kpi">
                <div className="lb">NEXT DUE</div>
                <div className="vl" style={{ fontSize: 38 }}>₹71,000</div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>Instalment History</h3>
              {[
                ['15 Apr 2026', 'Term 1 — Ananya + Rohan', '₹71,000', 'UPI', 'g'],
                ['10 Jul 2026', 'Term 2 — Ananya + Rohan', '₹71,000', 'NetBanking', 'g'],
                ['01 Oct 2026', 'Term 3 — Ananya + Rohan', '₹71,000', '—', 'a'],
              ].map(([d, t, a, m, c]) => (
                <div key={d + t} className="row">
                  <div className="av">{c === 'g' ? '✓' : '⏳'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t}</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{d} · {m}</div>
                  </div>
                  <b style={{ fontSize: 16 }}>{a}</b>
                  <span className={`ch ${c}`}>{c === 'g' ? 'PAID' : 'UPCOMING'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Floating Global Role Switcher */}
      <div className="role-sw">
        <Link href="/student">Student</Link>
        <Link href="/teacher">Teacher</Link>
        <Link href="/admin">Admin</Link>
        <Link href="/parent" className="on">Parent</Link>
      </div>
    </div>
  );
}
