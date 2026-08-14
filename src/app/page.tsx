'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

export default function LandingPage() {
  const [currentRoute, setCurrentRoute] = useState<'home' | 'about' | 'privacy' | 'dpdp' | 'contact'>('home');
  const [currentAnchor, setCurrentAnchor] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [numStudents, setNumStudents] = useState(500);
  const [tierPrice, setTierPrice] = useState(3500);
  const [tierName, setTierName] = useState('Shikhara');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hash Navigation Handler
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash.startsWith('/')) {
        const parts = hash.slice(1).split('#');
        const routeName = (parts[0] || 'home') as any;
        setCurrentRoute(['home', 'about', 'privacy', 'dpdp', 'contact'].includes(routeName) ? routeName : 'home');
        setCurrentAnchor(parts[1] || '');
      } else {
        setCurrentRoute('home');
        setCurrentAnchor(hash);
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Handle Scroll to Anchor
  useEffect(() => {
    if (currentAnchor) {
      setTimeout(() => {
        const el = document.getElementById(currentAnchor);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [currentRoute, currentAnchor]);

  // Particle Canvas Loop
  useEffect(() => {
    if (currentRoute !== 'home') return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, pts: any[] = [];
    const COLS = ['76,141,255', '127,180,255', '199,220,255', '217,165,68'];

    const resize = () => {
      if (!cv.parentElement) return;
      const r = cv.parentElement.getBoundingClientRect();
      if (r.width < 2) return;
      W = cv.width = r.width * window.devicePixelRatio;
      H = cv.height = r.height * window.devicePixelRatio;
      cv.style.width = r.width + 'px';
      cv.style.height = r.height + 'px';
      const n = Math.min(80, Math.floor(r.width / 16));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35 * window.devicePixelRatio,
        vy: (Math.random() - 0.5) * 0.35 * window.devicePixelRatio,
        c: COLS[Math.floor(Math.random() * COLS.length)]
      }));
    };

    resize();
    window.addEventListener('resize', resize);

    let animId: number;
    const loop = () => {
      if (W > 0) {
        ctx.clearRect(0, 0, W, H);
        const D = 130 * window.devicePixelRatio;
        for (const p of pts) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
        }
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const a = pts[i], b = pts[j];
            const dx = a.x - b.x, dy = a.y - b.y;
            const d = Math.hypot(dx, dy);
            if (d < D) {
              ctx.strokeStyle = `rgba(${a.c},${(1 - d / D) * 0.32})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
        for (const p of pts) {
          ctx.fillStyle = `rgba(${p.c},.9)`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.8 * window.devicePixelRatio, 0, 7);
          ctx.fill();
        }
      }
      animId = requestAnimationFrame(loop);
    };

    loop();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, [currentRoute]);

  // Spotlight mouse effect
  const [spotPos, setSpotPos] = useState({ x: -1000, y: -1000 });
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setSpotPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

  return (
    <div className="sthara-landing">
      <style jsx global>{`
        :root {
          --bg:#07111F;
          --bg2:#0B1A2E;
          --oxford:#0F2440;
          --card:rgba(151,183,232,.05);
          --card2:rgba(151,183,232,.09);
          --stroke:rgba(151,183,232,.13);
          --stroke2:rgba(151,183,232,.22);
          --txt:#F2F6FC;
          --dim:#A3B4CD;
          --faint:#5F7290;
          --azure:#4C8DFF;
          --azure2:#7FB4FF;
          --ice:#C7DCFF;
          --gold:#D9A544;
          --cyan:#22D3EE;
          --green:#34D399;
          --amber:#F5B60B;
          --rose:#F45E77;
          --grad:linear-gradient(93deg,#2F6BFF 0%,#4C8DFF 50%,#7FB9FF 100%);
          --gradtxt:linear-gradient(93deg,#8FB8FF 0%,#C7DCFF 60%,#EAF2FF 100%);
          --r:20px;
        }
        .sthara-landing {
          background: var(--bg);
          color: var(--txt);
          font-family: 'Inter', sans-serif;
          font-size: 16.5px;
          line-height: 1.65;
          min-height: 100vh;
          position: relative;
        }
        .sthara-landing a { color: inherit; text-decoration: none; }
        .sthara-landing h1, .sthara-landing h2, .sthara-landing h3, .sthara-landing h4 {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 800;
          letter-spacing: -.02em;
        }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px; position: relative; z-index: 2; }
        @media(max-width:640px){ .wrap { padding: 0 20px; } }
        .grad-txt { background: var(--gradtxt); -webkit-background-clip: text; background-clip: text; color: transparent; }
        section { padding: 100px 0; position: relative; }
        @media(max-width:700px){ section { padding: 70px 0; } }

        /* Header & Nav */
        header { position: fixed; top: 0; left: 0; right: 0; z-index: 90; transition: background .3s, border-color .3s; border-bottom: 1px solid transparent; }
        header.solid, header.scrolled { background: rgba(7,17,31,.88); backdrop-filter: blur(16px); border-color: var(--stroke); }
        .nav { display: flex; align-items: center; justify-content: space-between; height: 76px; gap: 18px; }
        .logo { display: flex; align-items: center; gap: 13px; flex-shrink: 0; }
        .pmark { height: 34px; width: auto; color: #fff; filter: drop-shadow(0 0 12px rgba(127,180,255,.35)); flex-shrink: 0; }
        .wordmark { font-family: 'Plus Jakarta Sans'; font-weight: 800; font-size: 16px; letter-spacing: .34em; color: #fff; }
        .wm-sub { display: block; font-family: 'IBM Plex Mono'; font-size: 8.5px; letter-spacing: .3em; color: var(--faint); margin-top: 3px; }
        .nav-links { display: flex; gap: 26px; }
        .nav-links a { font-size: 14.5px; color: var(--dim); font-weight: 500; transition: color .2s; position: relative; }
        .nav-links a:hover, .nav-links a.active { color: #fff; }
        .nav-links a.active::after { content: ""; position: absolute; left: 0; right: 0; bottom: -7px; height: 2px; background: var(--grad); border-radius: 2px; }
        .nav-cta { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
        .ghost-link { font-size: 14.5px; color: var(--dim); }
        .ghost-link:hover { color: #fff; }
        .menu-t { display: none; background: none; border: 1px solid var(--stroke2); border-radius: 10px; color: #fff; font-size: 18px; width: 42px; height: 42px; cursor: pointer; }
        @media(max-width:1040px){ .nav-links, .ghost-link { display: none; } .menu-t { display: block; } }

        /* Buttons */
        .btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 9px;
          font-family: 'Plus Jakarta Sans'; font-weight: 700; font-size: 15.5px;
          padding: 15px 30px; border-radius: 14px; cursor: pointer; border: 1px solid transparent;
          transition: transform .25s cubic-bezier(.2,.7,.2,1.4), box-shadow .25s; overflow: hidden; white-space: nowrap; }
        .btn-hot { background: var(--grad); color: #fff; box-shadow: 0 6px 30px rgba(47,107,255,.4); }
        .btn-hot:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 12px 44px rgba(76,141,255,.55); }
        .btn-dark { background: rgba(151,183,232,.08); border-color: var(--stroke2); color: #fff; backdrop-filter: blur(8px); }
        .btn-dark:hover { background: rgba(151,183,232,.14); transform: translateY(-3px); }
        .btn-sm { padding: 11px 22px; font-size: 14px; }

        /* Hero */
        .hero { min-height: 90vh; display: flex; flex-direction: column; justify-content: center; padding: 130px 0 0; overflow: hidden; position: relative; }
        #net { position: absolute; inset: 0; z-index: 0; }
        .pill { display: inline-flex; align-items: center; gap: 9px; padding: 9px 18px; border-radius: 99px; background: rgba(151,183,232,.07); border: 1px solid var(--stroke2); font-size: 13.5px; color: var(--dim); backdrop-filter: blur(8px); }
        .pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 10px var(--green); }
        .hero h1 { font-size: clamp(40px, 7vw, 86px); line-height: 1.02; letter-spacing: -.035em; margin: 24px 0 20px; max-width: 14ch; }
        .hero .sub { color: var(--dim); font-size: 18px; max-width: 56ch; line-height: 1.7; }
        .hero-ctas { display: flex; gap: 16px; margin-top: 36px; flex-wrap: wrap; }
        .hero-note { margin-top: 18px; font-size: 12.5px; color: var(--faint); letter-spacing: .14em; text-transform: uppercase; font-family: 'IBM Plex Mono'; }

        /* Stats bar */
        .stats { border-top: 1px solid var(--stroke); border-bottom: 1px solid var(--stroke); margin-top: 80px; background: rgba(151,183,232,.02); backdrop-filter: blur(6px); }
        .stats-g { display: grid; grid-template-columns: repeat(4,1fr); }
        .stat { padding: 30px 24px; border-left: 1px solid var(--stroke); }
        .stat:first-child { border-left: none; }
        @media(max-width:760px){ .stats-g { grid-template-columns: 1fr 1fr; } }
        .stat-n { font-family: 'Plus Jakarta Sans'; font-size: 32px; font-weight: 800; }
        .stat-n span { background: var(--gradtxt); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .stat-l { font-size: 13px; color: var(--faint); margin-top: 4px; }

        /* Section Headings */
        .kick { display: inline-flex; align-items: center; gap: 10px; font-family: 'IBM Plex Mono'; font-size: 12.5px; letter-spacing: .2em; text-transform: uppercase; color: var(--azure2); }
        .kick::before { content: ""; width: 26px; height: 1px; background: var(--azure2); }
        .head { max-width: 760px; margin-bottom: 50px; }
        .head h2 { font-size: clamp(30px, 4.4vw, 50px); line-height: 1.06; letter-spacing: -.03em; margin: 16px 0 16px; }
        .head p { color: var(--dim); font-size: 17.5px; max-width: 56ch; }

        /* Role Panels */
        .tabs { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 36px; }
        .tab { font-family: 'Plus Jakarta Sans'; font-weight: 700; font-size: 15px; padding: 12px 24px; border-radius: 12px; border: 1px solid var(--stroke2); background: transparent; color: var(--dim); cursor: pointer; transition: all .25s; }
        .tab.on { background: var(--grad); border-color: transparent; color: #fff; box-shadow: 0 4px 24px rgba(47,107,255,.45); }
        .panel { display: none; grid-template-columns: 1fr 1.05fr; gap: 50px; align-items: center; }
        .panel.on { display: grid; }
        @media(max-width:900px){ .panel.on { grid-template-columns: 1fr; gap: 32px; } }
        .mock { background: linear-gradient(160deg,rgba(151,183,232,.10),rgba(151,183,232,.03)); border: 1px solid var(--stroke2); border-radius: 22px; padding: 22px; backdrop-filter: blur(12px); box-shadow: 0 24px 70px rgba(2,8,18,.6); }

        /* Pricing Tiers */
        .price-g { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: stretch; }
        @media(max-width:1000px){ .price-g { grid-template-columns: 1fr 1fr; } }
        @media(max-width:620px){ .price-g { grid-template-columns: 1fr; } }
        .pc { border-radius: 22px; padding: 1.5px; background: var(--stroke); position: relative; }
        .pc.hot { background: var(--grad); box-shadow: 0 0 70px rgba(47,107,255,.3); }
        .pc-in { background: var(--bg2); border-radius: 21px; padding: 28px 24px; height: 100%; display: flex; flex-direction: column; }
        .pc .plan { font-family: 'Plus Jakarta Sans'; font-weight: 800; font-size: 19px; text-transform: uppercase; color: #fff; }
        .pc .gloss { font-family: 'IBM Plex Mono'; font-size: 11.5px; text-transform: uppercase; color: var(--azure2); margin-top: 4px; }
        .pc .amt { display: flex; align-items: baseline; gap: 6px; margin: 18px 0 2px; }
        .pc .amt b { font-family: 'Plus Jakarta Sans'; font-size: 36px; font-weight: 800; }
        .pc ul { list-style: none; margin-bottom: 24px; flex: 1; }
        .pc li { display: flex; gap: 9px; padding: 7px 0; font-size: 13.5px; color: var(--dim); }
        .ribbon { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); background: var(--gold); color: #0A1526; font-family: 'Plus Jakarta Sans'; font-weight: 800; font-size: 10.5px; letter-spacing: .16em; padding: 5px 14px; border-radius: 99px; white-space: nowrap; z-index: 2; }

        /* Calculator */
        .calc { background: var(--card); border: 1px solid var(--stroke); border-radius: 22px; padding: 32px; margin-top: 30px; }
        .calc-g { display: grid; grid-template-columns: 1.25fr 1fr; gap: 36px; align-items: center; }
        @media(max-width:820px){ .calc-g { grid-template-columns: 1fr; } }

        /* Drawer */
        #drawer { position: fixed; inset: 0; z-index: 95; background: rgba(4,10,20,.95); backdrop-filter: blur(20px); display: none; flex-direction: column; padding: 90px 28px 40px; }
        #drawer.open { display: flex; }
        #drawer a { font-family: 'Plus Jakarta Sans'; font-weight: 700; font-size: 22px; padding: 14px 0; border-bottom: 1px solid var(--stroke); color: var(--dim); }
      `}</style>

      {/* Spotlight Cursor Effect */}
      <div
        style={{
          position: 'fixed',
          width: '640px',
          height: '640px',
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: 1,
          background: 'radial-gradient(circle,rgba(76,141,255,.13),rgba(47,107,255,.05) 40%,transparent 70%)',
          transform: 'translate(-50%,-50%)',
          left: spotPos.x,
          top: spotPos.y,
        }}
      />

      {/* Sthara Pillar Logo Definition */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <g id="pillar-logo" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="12" y="4" width="72" height="10" />
            <rect x="19" y="14" width="58" height="9" />
            <line x1="27" y1="23" x2="27" y2="93" />
            <line x1="34" y1="23" x2="34" y2="93" />
            <line x1="62" y1="23" x2="62" y2="93" />
            <line x1="69" y1="23" x2="69" y2="93" />
            <rect x="38" y="23" width="20" height="70" rx="10" />
            <path d="M56 29 C45 33 40 40 47 46 C56 51 68 54 65 61 C61 69 48 71 43 79 C40 84 42 90 47 91" />
            <rect x="19" y="93" width="58" height="9" />
            <rect x="12" y="102" width="72" height="10" />
          </g>
        </defs>
      </svg>

      {/* Header */}
      <header id="hd" className="solid">
        <div className="wrap nav">
          <a className="logo" href="#/">
            <svg className="pmark" viewBox="0 0 96 116"><use href="#pillar-logo" /></svg>
            <span><span class="wordmark">STHARA</span><span class="wm-sub">THE UNIFIED SCHOOL OS</span></span>
          </a>
          <nav className="nav-links">
            <a href="#platform" className={currentRoute === 'home' ? 'active' : ''}>Platform</a>
            <a href="#tml">True Mastery</a>
            <a href="#pricing">Pricing</a>
            <a href="#/about" className={currentRoute === 'about' ? 'active' : ''}>About</a>
            <a href="#/dpdp" className={currentRoute === 'dpdp' ? 'active' : ''}>DPDP</a>
            <a href="#/contact" className={currentRoute === 'contact' ? 'active' : ''}>Contact</a>
          </nav>
          <div className="nav-cta">
            <Link href="/login" className="ghost-link">Sign in</Link>
            <a href="#pricing" className="btn btn-hot btn-sm">Book a pilot</a>
          </div>
          <button className="menu-t" onClick={() => setDrawerOpen(true)}>☰</button>
        </div>
      </header>

      {/* Mobile Drawer */}
      <div id="drawer" className={drawerOpen ? 'open' : ''}>
        <button style={{ position: 'absolute', top: 22, right: 24, background: 'none', border: '1px solid var(--stroke2)', borderRadius: 10, color: '#fff', fontSize: 20, width: 42, height: 42, cursor: 'pointer' }} onClick={() => setDrawerOpen(false)}>✕</button>
        <a href="#platform" onClick={() => setDrawerOpen(false)}>Platform</a>
        <a href="#tml" onClick={() => setDrawerOpen(false)}>True Mastery</a>
        <a href="#pricing" onClick={() => setDrawerOpen(false)}>Pricing</a>
        <a href="#/about" onClick={() => setDrawerOpen(false)}>About us</a>
        <a href="#/dpdp" onClick={() => setDrawerOpen(false)}>DPDP Act 2023</a>
        <a href="#/privacy" onClick={() => setDrawerOpen(false)}>Privacy Policy</a>
        <a href="#/contact" onClick={() => setDrawerOpen(false)}>Contact us</a>
        <Link href="/login" className="btn btn-hot" style={{ marginTop: 28 }} onClick={() => setDrawerOpen(false)}>Sign in to Portal →</Link>
      </div>

      <main id="main">
        {/* ==================================== HOME PAGE ==================================== */}
        {currentRoute === 'home' && (
          <div className="page-home">
            <section className="hero">
              <canvas ref={canvasRef} id="net" />
              <div className="wrap">
                <span className="pill"><span className="dot" />The Unified School OS · Powered by Google Gemini</span>
                <h1>
                  Every student.<br />
                  Every teacher.<br />
                  <span className="grad-txt">One system.</span>
                </h1>
                <p className="sub">
                  Sthara gives every child a personal AI tutor, every teacher a copilot that grades handwriting in seconds, the office a full ERP with an AI brain, and every parent real visibility on WhatsApp — all feeding one living record.
                </p>
                <div className="hero-ctas">
                  <a href="#pricing" className="btn btn-hot">Book a paid pilot →</a>
                  <Link href="/login" className="btn btn-dark">Sign in to Workspace</Link>
                </div>
                <div className="hero-note">One grade · One term · 100% credited on conversion</div>
              </div>

              <div className="stats">
                <div className="wrap stats-g">
                  <div className="stat"><div className="stat-n">&lt;<span>30</span>s</div><div className="stat-l">to grade a handwritten paper</div></div>
                  <div class="stat"><div class="stat-n"><span>4</span>→1</div><div class="stat-l">systems replaced by one record</div></div>
                  <div className="stat"><div className="stat-n">₹<span>2000</span></div><div className="stat-l">entry price · per student / year</div></div>
                  <div className="stat"><div className="stat-n"><span>10</span> min</div><div className="stat-l">from signup to fully live</div></div>
                </div>
              </div>
            </section>

            {/* Platform Roles Section */}
            <section id="platform">
              <div className="wrap">
                <div className="head">
                  <span className="kick">The platform</span>
                  <h2>Four roles. Four <span className="grad-txt">superpowers.</span></h2>
                  <p>Sthara is built role-first — tap through what each person actually gets.</p>
                </div>

                <div className="tabs">
                  {['🎓 Student', '✏️ Teacher', '🏛 Admin', '👨‍👩‍👧 Parent'].map((t, idx) => (
                    <button key={t} className={`tab ${activeTab === idx ? 'on' : ''}`} onClick={() => setActiveTab(idx)}>
                      {t}
                    </button>
                  ))}
                </div>

                {activeTab === 0 && (
                  <div className="panel on">
                    <div>
                      <span className="mono" style={{ color: 'var(--azure2)', fontSize: 12.5, textTransform: 'uppercase' }}>For the student</span>
                      <h3 style={{ fontSize: 32, margin: '10px 0 14px' }}>A personal AI tutor that never sleeps.</h3>
                      <p style={{ color: 'var(--dim)', fontSize: 17 }}>Any subject, any hour. When a student asks a question, it asks back what they've already tried before explaining — building real understanding instead of handing over answers.</p>
                    </div>
                    <div className="mock">
                      <div style={{ background: 'var(--grad)', color: '#fff', padding: '12px 16px', borderRadius: 14, marginBottom: 10, fontSize: 14 }}>Why does sin²θ + cos²θ = 1? 😩</div>
                      <div style={{ background: 'rgba(151,183,232,.09)', border: '1px solid var(--stroke)', padding: '12px 16px', borderRadius: 14, fontSize: 14 }}>Great question! Before I explain — what do you already know about a point moving on the unit circle?</div>
                    </div>
                  </div>
                )}

                {activeTab === 1 && (
                  <div className="panel on">
                    <div>
                      <span className="mono" style={{ color: 'var(--azure2)', fontSize: 12.5, textTransform: 'uppercase' }}>For the teacher</span>
                      <h3 style={{ fontSize: 32, margin: '10px 0 14px' }}>A copilot that grades handwriting.</h3>
                      <p style={{ color: 'var(--dim)', fontSize: 17 }}>Lesson plans, exercises and practice papers in seconds. Homework comes back photographed — vision AI reads the handwriting and grades it in under 30 seconds.</p>
                    </div>
                    <div className="mock">
                      <div style={{ padding: 18, background: 'rgba(151,183,232,.06)', borderRadius: 14 }}>
                        <div style={{ fontSize: 12, color: 'var(--faint)', textTransform: 'uppercase' }} className="mono">Avg. grading time</div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>27<span style={{ fontSize: 16 }}>s / paper</span></div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 2 && (
                  <div className="panel on">
                    <div>
                      <span className="mono" style={{ color: 'var(--azure2)', fontSize: 12.5, textTransform: 'uppercase' }}>For the admin office</span>
                      <h3 style={{ fontSize: 32, margin: '10px 0 14px' }}>A full ERP with an AI brain.</h3>
                      <p style={{ color: 'var(--dim)', fontSize: 17 }}>Attendance, fees, admissions and reporting in one dashboard — with AI that drafts the CBSE wellness report and flags at-risk students.</p>
                    </div>
                    <div className="mock">
                      <div style={{ padding: 18, background: 'rgba(244,94,119,.08)', border: '1px solid rgba(244,94,119,.35)', borderRadius: 14 }}>
                        <span style={{ color: 'var(--rose)', fontWeight: 700 }}>⚠️ 3 students flagged at-risk</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 3 && (
                  <div className="panel on">
                    <div>
                      <span className="mono" style={{ color: 'var(--azure2)', fontSize: 12.5, textTransform: 'uppercase' }}>For the parent</span>
                      <h3 style={{ fontSize: 32, margin: '10px 0 14px' }}>Real visibility, on WhatsApp.</h3>
                      <p style={{ color: 'var(--dim)', fontSize: 17 }}>Homework, fees and progress in one view — delivered where parents already are. Zero new apps needed.</p>
                    </div>
                    <div className="mock">
                      <div style={{ background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.3)', borderRadius: 14, padding: 14, fontSize: 14 }}>
                        📚 <b>Maths homework graded:</b> Aarav scored 9/10 — great work on quadratic equations!
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing">
              <div className="wrap">
                <div className="head">
                  <span className="kick">Pricing</span>
                  <h2>Four tiers. <span className="grad-txt">One pillar each.</span></h2>
                  <p>Priced per student, per year, billed annually to the school.</p>
                </div>
                <div className="price-g">
                  <div className="pc">
                    <div className="pc-in">
                      <span className="plan">Aadhara</span>
                      <span className="gloss">The foundation</span>
                      <div className="amt"><b>₹2,000</b></div>
                      <ul>
                        <li><b>✓</b> AI tutor &amp; handwriting grading</li>
                        <li><b>✓</b> Full ERP + parent WhatsApp updates</li>
                      </ul>
                      <a href="#/contact" className="btn btn-dark btn-sm">Enquire →</a>
                    </div>
                  </div>

                  <div className="pc hot">
                    <span className="ribbon">RECOMMENDED</span>
                    <div className="pc-in">
                      <span className="plan">Shikhara</span>
                      <span className="gloss">The summit</span>
                      <div className="amt"><b>₹3,500</b></div>
                      <ul>
                        <li><b>✓</b> The full Sthara promise</li>
                        <li><b>✓</b> Full admin-side AI &amp; at-risk flags</li>
                        <li><b>✓</b> Priority support &amp; staff training</li>
                      </ul>
                      <a href="#/contact" className="btn btn-hot btn-sm">Book a pilot →</a>
                    </div>
                  </div>
                </div>

                {/* Interactive Calculator */}
                <div className="calc">
                  <h4 style={{ fontSize: 20, marginBottom: 20 }}>Live Cost Estimate Calculator</h4>
                  <div className="calc-g">
                    <div>
                      <label className="mono" style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--faint)' }}>
                        Students on platform: <b style={{ color: '#fff', fontSize: 22 }}>{numStudents}</b>
                      </label>
                      <input
                        type="range"
                        min="50"
                        max="5000"
                        step="25"
                        value={numStudents}
                        onChange={e => setNumStudents(Number(e.target.value))}
                        style={{ width: '100%', margin: '16px 0' }}
                      />
                    </div>
                    <div style={{ background: 'var(--bg2)', padding: 24, borderRadius: 18, border: '1px solid var(--stroke2)' }}>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase' }}>Annual invoice to school</div>
                      <div style={{ fontSize: 36, fontWeight: 800, color: '#fff' }}>{inr(numStudents * tierPrice)}</div>
                      <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 6 }}>{tierName} · {inr(tierPrice)} / student</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ==================================== ABOUT PAGE ==================================== */}
        {currentRoute === 'about' && (
          <div className="wrap" style={{ padding: '140px 28px 80px' }}>
            <span className="kick">About us</span>
            <h1 style={{ fontSize: 48, margin: '20px 0' }}>A child falling behind should never be <span className="grad-txt">a surprise.</span></h1>
            <p style={{ color: 'var(--dim)', fontSize: 18, maxWidth: 640 }}>
              Sthara is a unified school operating system for Indian K-12 schools. One living record that student, teacher, office, and parent all read from.
            </p>
          </div>
        )}

        {/* ==================================== CONTACT PAGE ==================================== */}
        {currentRoute === 'contact' && (
          <div className="wrap" style={{ padding: '140px 28px 80px' }}>
            <span className="kick">Contact us</span>
            <h1 style={{ fontSize: 48, margin: '20px 0' }}>Let's talk about <span className="grad-txt">your school.</span></h1>
            <div style={{ background: 'var(--card)', border: '1px solid var(--stroke)', padding: 32, borderRadius: 22, maxWidth: 600 }}>
              <p style={{ color: 'var(--dim)', marginBottom: 20 }}>Reach out directly to book a demo or pilot:</p>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--azure2)' }}>Email: sales@sthara.in</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', marginTop: 10 }}>Business: coo@sthara.in</div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--stroke)', padding: '40px 0', marginTop: 80 }}>
        <div className="wrap" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, fontSize: 13, color: 'var(--faint)' }}>
          <span>© 2026 STHARA · THE UNIFIED SCHOOL OS</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/login">Sign in</Link>
            <a href="#/privacy">Privacy Policy</a>
            <a href="#/dpdp">DPDP Act</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
