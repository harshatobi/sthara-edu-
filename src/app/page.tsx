'use client';

import { useEffect } from 'react';

export default function LandingPage() {
  useEffect(() => {
    /* =========================================================
       1 · HASH ROUTER
       ========================================================= */
    const ROUTES = ['home', 'about', 'privacy', 'dpdp', 'contact'];
    const pages = Array.from(document.querySelectorAll<HTMLElement>('.page'));
    const hd = document.getElementById('hd');
    const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('#navlinks a'));
    const drawerLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('#drawer a'));

    function parseHash() {
      const h = window.location.hash.replace(/^#/, '');
      if (h.startsWith('/')) {
        const p = h.slice(1).split('#');
        return { route: p[0] || 'home', anchor: p[1] || '' };
      }
      return { route: 'home', anchor: h || '' };
    }

    function setNav(route: string) {
      navLinks.forEach(a => a.classList.toggle('active', a.dataset.nav === route && route !== 'home'));
      const path = route === 'home' ? '' : '/' + route;
      drawerLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + path));
      if (hd) hd.classList.toggle('solid', route !== 'home');
    }

    function render(initial: boolean) {
      const { route, anchor } = parseHash();
      const r = ROUTES.includes(route) ? route : 'home';
      const el = document.getElementById('page-' + r);
      if (!el) return;
      pages.forEach(p => p.classList.toggle('on', p === el));
      setNav(r);
      closeDrawer();

      if (r === 'home') sizeCv();

      if (anchor) {
        requestAnimationFrame(() => {
          const t = document.getElementById(anchor);
          if (t) t.scrollIntoView({ behavior: initial ? 'auto' : 'smooth', block: 'start' });
          else window.scrollTo(0, 0);
        });
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      kick(el);
    }

    /* =========================================================
       2 · REVEALS & COUNTERS
       ========================================================= */
    const obs = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
    }), { threshold: .15 });

    const nObs = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target as HTMLElement;
      nObs.unobserve(el);
      if (el.dataset.done) return;
      el.dataset.done = '1';
      const t = +(el.dataset.count || 0), t0 = performance.now();
      (function tick(now) {
        const p = Math.min((now - t0) / 1200, 1);
        el.textContent = Math.round(t * (1 - Math.pow(1 - p, 3))).toLocaleString('en-IN');
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    }), { threshold: .6 });

    function kick(scope: HTMLElement) {
      requestAnimationFrame(() => {
        scope.querySelectorAll('.rv').forEach(el => {
          if (el.classList.contains('in')) return;
          if (el.getBoundingClientRect().top < window.innerHeight * .95) el.classList.add('in');
          else obs.observe(el);
        });
        scope.querySelectorAll('[data-count]').forEach(n => { if (!(n as HTMLElement).dataset.done) nObs.observe(n); });
      });
    }

    /* =========================================================
       3 · MOBILE DRAWER
       ========================================================= */
    const drawer = document.getElementById('drawer');
    function openDrawer() { if (drawer) drawer.classList.add('open'); document.body.style.overflow = 'hidden'; }
    function closeDrawer() { if (drawer) drawer.classList.remove('open'); document.body.style.overflow = ''; }

    const menuT = document.getElementById('menuT');
    const drClose = document.getElementById('drClose');
    if (menuT) menuT.addEventListener('click', openDrawer);
    if (drClose) drClose.addEventListener('click', closeDrawer);
    drawerLinks.forEach(a => a.addEventListener('click', closeDrawer));

    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', handleKey);

    /* =========================================================
       4 · SCROLL PROGRESS & HEADER
       ========================================================= */
    const prog = document.getElementById('prog');
    const handleScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      if (prog) prog.style.width = (max > 0 ? h.scrollTop / max * 100 : 0) + '%';
      if (hd) hd.classList.toggle('scrolled', h.scrollTop > 30);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    /* =========================================================
       5 · SPOTLIGHT
       ========================================================= */
    const spot = document.getElementById('spot');
    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && spot) {
        spot.style.left = e.clientX + 'px';
        spot.style.top = e.clientY + 'px';
      }
    };
    window.addEventListener('pointermove', handlePointerMove);

    /* =========================================================
       6 · HERO PARTICLE NETWORK
       ========================================================= */
    const cv = document.getElementById('net') as HTMLCanvasElement | null;
    let ctx = cv ? cv.getContext('2d') : null;
    let W = 0, H = 0, pts: any[] = [];
    const COLS = ['76,141,255', '127,180,255', '199,220,255', '217,165,68'];

    function sizeCv() {
      if (!cv || !cv.parentElement) return;
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
        vx: (Math.random() - .5) * .35 * window.devicePixelRatio,
        vy: (Math.random() - .5) * .35 * window.devicePixelRatio,
        c: COLS[Math.floor(Math.random() * COLS.length)]
      }));
    }

    const handleResize = () => {
      const pageHome = document.getElementById('page-home');
      if (pageHome && pageHome.classList.contains('on')) sizeCv();
    };
    window.addEventListener('resize', handleResize);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let animId: number;
    function loop() {
      if (cv && ctx && W > 0 && document.getElementById('page-home')?.classList.contains('on')) {
        ctx.clearRect(0, 0, W, H);
        const D = 130 * window.devicePixelRatio;
        for (const p of pts) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
        }
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const a = pts[i], b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
            if (d < D) {
              ctx.strokeStyle = `rgba(${a.c},${(1 - d / D) * .32})`;
              ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
          }
        }
        for (const p of pts) {
          ctx.fillStyle = `rgba(${p.c},.9)`;
          ctx.beginPath(); ctx.arc(p.x, p.y, 1.8 * window.devicePixelRatio, 0, 7); ctx.fill();
        }
      }
      if (!reduced) animId = requestAnimationFrame(loop);
    }
    loop();

    /* =========================================================
       7 · ROLE TABS
       ========================================================= */
    const tabs = Array.from(document.querySelectorAll<HTMLElement>('.tab'));
    const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'));
    let ti = 0;
    function go(i: number) {
      ti = i;
      tabs.forEach((t, k) => t.classList.toggle('on', k === i));
      panels.forEach((p, k) => p.classList.toggle('on', k === i));
    }
    const auto = setInterval(() => go((ti + 1) % 4), 5200);
    tabs.forEach((t, i) => t.addEventListener('click', () => { clearInterval(auto); go(i); }));

    /* =========================================================
       8 · GRADING DEMO LOOP
       ========================================================= */
    const paper = document.getElementById('paper');
    function playDemo() {
      if (!paper) return;
      paper.classList.remove('play');
      void paper.offsetWidth;
      paper.classList.add('play');
    }
    if (paper) {
      const dObs = new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { playDemo(); setInterval(playDemo, 6800); dObs.unobserve(paper); }
      }), { threshold: .4 });
      dObs.observe(paper);
    }

    /* =========================================================
       9 · TML CLASS HEATMAP
       ========================================================= */
    const hm = document.getElementById('hm');
    if (hm && hm.children.length === 0) {
      const levels = [3,3,2,3,2,3,3, 2,3,3,1,2,3,2, 3,2,3,3,0,2,3, 1,3,2,3,3,2,3];
      levels.forEach((l, i) => {
        const c = document.createElement('i');
        c.className = 'lv' + l;
        c.style.transitionDelay = (i * 28) + 'ms';
        c.title = ['Struggling', 'Developing', 'Strong', 'Mastered'][l];
        hm.appendChild(c);
      });
    }

    /* =========================================================
       10 · PRICING CALCULATOR
       ========================================================= */
    const rStu = document.getElementById('rStu') as HTMLInputElement | null;
    const cStu = document.getElementById('cStu');
    const cSeg = document.getElementById('cSeg');
    const cTotal = document.getElementById('cTotal');
    const cTier = document.getElementById('cTier');
    const cPm = document.getElementById('cPm');
    const cPy = document.getElementById('cPy');
    const cUsd = document.getElementById('cUsd');
    const cNote = document.getElementById('cNote');

    let tierP = 3500, tierN = 'Shikhara';
    const formatInr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

    function calc() {
      if (!rStu || !cStu || !cTotal || !cTier || !cPm || !cPy || !cUsd || !cNote) return;
      const s = +rStu.value;
      cStu.textContent = s.toLocaleString('en-IN');
      if (tierP === 0) {
        cTotal.textContent = 'Custom';
        cTier.textContent = 'Mandala · volume priced';
        cPm.textContent = '—'; cPy.textContent = '—'; cUsd.textContent = '—';
        cNote.textContent = 'Mandala is quoted per group. Multi-campus pricing is set against total enrolment, token usage and rollout scope — talk to sales for a figure.';
      } else {
        const total = s * tierP;
        cTotal.textContent = formatInr(total);
        cTier.textContent = tierN + ' · ' + formatInr(tierP);
        cPm.textContent = formatInr(tierP / 12);
        cPy.textContent = formatInr(tierP);
        cUsd.textContent = formatInr(tierP * 40);
        cNote.textContent = 'Indicative list pricing, billed annually to the school. Final quotation depends on term, tier and rollout scope.';
      }
    }

    if (rStu) rStu.addEventListener('input', calc);
    if (cSeg) {
      Array.from(cSeg.children).forEach(b => b.addEventListener('click', () => {
        Array.from(cSeg.children).forEach(x => x.classList.remove('on'));
        (b as HTMLElement).classList.add('on');
        tierP = +((b as HTMLElement).dataset.p || 3500);
        tierN = (b as HTMLElement).dataset.n || 'Shikhara';
        calc();
      }));
    }
    calc();

    /* =========================================================
       11 · CONTACT FORM ROUTER
       ========================================================= */
    const DESKS: Record<string, string> = {
      sales: 'sales@sthara.in',
      ops: 'Operations@sthara.in',
      coo: 'coo@sthara.in',
      cfo: 'cfo@sthara.in'
    };
    const cform = document.getElementById('cform');
    const fType = document.getElementById('fType') as HTMLSelectElement | null;

    if (cform && fType) {
      cform.addEventListener('submit', e => {
        e.preventDefault();
        const [k, label] = fType.value.split('|');
        const deskTo = DESKS[k] || 'sales@sthara.in';
        const v = (id: string) => ((document.getElementById(id) as HTMLInputElement)?.value || '—').trim();
        const orgVal = v('fOrg');
        const body = [
          'Enquiry type: ' + label,
          '',
          'Name: ' + v('fName'),
          'Role: ' + v('fRole'),
          'School / organisation: ' + orgVal,
          'Approx. students: ' + v('fCount'),
          'Email: ' + v('fEmail'),
          'Phone: ' + v('fPhone'),
          '',
          'Message:',
          v('fMsg'),
          '',
          '— Sent from sthara.in'
        ].join('\n');

        window.location.href = 'mailto:' + deskTo
          + '?subject=' + encodeURIComponent('[Sthara] ' + label + (orgVal !== '—' ? ' — ' + orgVal : ''))
          + '&body=' + encodeURIComponent(body);
      });
    }

    /* =========================================================
       12 · 3D TILT EFFECT
       ========================================================= */
    if (window.matchMedia('(hover:hover)').matches) {
      document.querySelectorAll<HTMLElement>('.tilt').forEach(card => {
        card.addEventListener('pointermove', e => {
          const r = card.getBoundingClientRect();
          const rx = ((e.clientY - r.top) / r.height - .5) * -8;
          const ry = ((e.clientX - r.left) / r.width - .5) * 8;
          card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
        });
        card.addEventListener('pointerleave', () => card.style.transform = '');
      });
    }

    /* =========================================================
       13 · BOOT & CLEANUP
       ========================================================= */
    const handleHashChange = () => render(false);
    window.addEventListener('hashchange', handleHashChange);
    render(true);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKey);
      clearInterval(auto);
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="sthara-v2-container">
      {/* Dynamic CSS Styles */}
      <style jsx global>{`
        :root{
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
        .sthara-v2-container {
          background:var(--bg);color:var(--txt);
          font-family:'Inter',sans-serif;font-size:16.5px;line-height:1.65;
          -webkit-font-smoothing:antialiased;overflow-x:hidden;
          min-height: 100vh;
        }
        .sthara-v2-container *{box-sizing:border-box;margin:0;padding:0;}
        .sthara-v2-container a{color:inherit;text-decoration:none;}
        .sthara-v2-container h1,.sthara-v2-container h2,.sthara-v2-container h3,.sthara-v2-container h4{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;letter-spacing:-.02em;}
        .mono{font-family:'IBM Plex Mono',monospace;}
        .wrap{max-width:1180px;margin:0 auto;padding:0 28px;position:relative;z-index:2;}
        @media(max-width:640px){.wrap{padding:0 20px;}}
        .grad-txt{background:var(--gradtxt);-webkit-background-clip:text;background-clip:text;color:transparent;}
        section{padding:120px 0;position:relative;}
        @media(max-width:700px){section{padding:84px 0;}}

        .page{display:none;}
        .page.on{display:block;animation:pageIn .45s cubic-bezier(.2,.7,.2,1);}
        @keyframes pageIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}

        #prog{position:fixed;top:0;left:0;height:3px;width:0;background:var(--grad);z-index:100;border-radius:0 3px 3px 0;}
        #spot{position:fixed;width:640px;height:640px;border-radius:50%;pointer-events:none;z-index:1;
          background:radial-gradient(circle,rgba(76,141,255,.13),rgba(47,107,255,.05) 40%,transparent 70%);
          transform:translate(-50%,-50%);opacity:0;transition:opacity .4s;}
        @media(hover:hover){#spot{opacity:1;}}

        header{position:fixed;top:0;left:0;right:0;z-index:90;transition:background .3s,border-color .3s;border-bottom:1px solid transparent;}
        header.scrolled,header.solid{background:rgba(7,17,31,.85);backdrop-filter:blur(16px);border-color:var(--stroke);}
        .nav{display:flex;align-items:center;justify-content:space-between;height:76px;gap:18px;}
        .logo{display:flex;align-items:center;gap:13px;flex-shrink:0;}
        .pmark{height:34px;width:auto;color:#fff;filter:drop-shadow(0 0 12px rgba(127,180,255,.35));flex-shrink:0;}
        .wordmark{font-family:'Plus Jakarta Sans';font-weight:800;font-size:16px;letter-spacing:.34em;color:#fff;}
        .wm-sub{display:block;font-family:'IBM Plex Mono';font-size:8.5px;letter-spacing:.3em;color:var(--faint);margin-top:3px;}
        .nav-links{display:flex;gap:26px;}
        .nav-links a{font-size:14.5px;color:var(--dim);font-weight:500;transition:color .2s;position:relative;}
        .nav-links a:hover{color:#fff;}
        .nav-links a.active{color:#fff;}
        .nav-links a.active::after{content:"";position:absolute;left:0;right:0;bottom:-7px;height:2px;background:var(--grad);border-radius:2px;}
        .nav-cta{display:flex;align-items:center;gap:14px;flex-shrink:0;}
        .ghost-link{font-size:14.5px;color:var(--dim);}
        .ghost-link:hover{color:#fff;}
        .menu-t{display:none;background:none;border:1px solid var(--stroke2);border-radius:10px;color:#fff;font-size:18px;width:42px;height:42px;cursor:pointer;}
        @media(max-width:1040px){.nav-links,.ghost-link{display:none;}.menu-t{display:block;}}

        #drawer{position:fixed;inset:0;z-index:95;background:rgba(4,10,20,.94);backdrop-filter:blur(20px);
          display:none;flex-direction:column;padding:96px 28px 40px;}
        #drawer.open{display:flex;animation:pageIn .3s ease;}
        #drawer a{font-family:'Plus Jakarta Sans';font-weight:700;font-size:24px;padding:15px 0;border-bottom:1px solid var(--stroke);color:var(--dim);}
        #drawer a:hover,#drawer a.active{color:#fff;}
        #drawer a.dr-cta{margin-top:28px;font-size:16px;padding:16px 30px;border-bottom:none;color:#fff;
          align-self:flex-start;border-radius:14px;}
        .dr-close{position:absolute;top:22px;right:24px;background:none;border:1px solid var(--stroke2);border-radius:10px;color:#fff;font-size:20px;width:42px;height:42px;cursor:pointer;}

        .btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:9px;
          font-family:'Plus Jakarta Sans';font-weight:700;font-size:15.5px;
          padding:15px 30px;border-radius:14px;cursor:pointer;border:1px solid transparent;
          transition:transform .25s cubic-bezier(.2,.7,.2,1.4),box-shadow .25s;overflow:hidden;white-space:nowrap;}
        .btn-hot{background:var(--grad);color:#fff;box-shadow:0 6px 30px rgba(47,107,255,.4);}
        .btn-hot:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 12px 44px rgba(76,141,255,.55);}
        .btn-hot::after{content:"";position:absolute;top:0;left:-70%;width:45%;height:100%;
          background:linear-gradient(105deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg);transition:left .6s;}
        .btn-hot:hover::after{left:130%;}
        .btn-dark{background:rgba(151,183,232,.08);border-color:var(--stroke2);color:#fff;backdrop-filter:blur(8px);}
        .btn-dark:hover{background:rgba(151,183,232,.14);transform:translateY(-3px);}
        .btn-sm{padding:11px 22px;font-size:14px;}

        .hero{min-height:100svh;display:flex;flex-direction:column;justify-content:center;padding:150px 0 0;overflow:hidden;}
        #net{position:absolute;inset:0;z-index:0;}
        .hero-blob{position:absolute;border-radius:50%;filter:blur(110px);opacity:.5;z-index:0;animation:blob 14s ease-in-out infinite alternate;}
        .hb1{width:500px;height:500px;background:rgba(47,107,255,.22);top:-130px;left:-130px;}
        .hb2{width:540px;height:540px;background:rgba(127,180,255,.16);bottom:-170px;right:-150px;animation-delay:-6s;}
        .hb3{width:380px;height:380px;background:rgba(217,165,68,.10);top:30%;right:14%;animation-delay:-3s;}
        @keyframes blob{to{transform:translate(40px,-40px) scale(1.12);}}
        .pill{display:inline-flex;align-items:center;gap:9px;padding:9px 18px;border-radius:99px;
          background:rgba(151,183,232,.07);border:1px solid var(--stroke2);font-size:13.5px;color:var(--dim);
          backdrop-filter:blur(8px);}
        .pill .dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green);animation:pulse 2s infinite;}
        @keyframes pulse{50%{opacity:.4;}}
        .hero h1{font-size:clamp(44px,7.4vw,94px);line-height:1.02;letter-spacing:-.035em;margin:28px 0 24px;max-width:14ch;}
        .hero h1 .l{display:block;opacity:0;transform:translateY(40px);animation:rise .9s cubic-bezier(.2,.7,.2,1) forwards;}
        .hero h1 .l:nth-child(2){animation-delay:.12s;}
        .hero h1 .l:nth-child(3){animation-delay:.24s;}
        @keyframes rise{to{opacity:1;transform:none;}}
        .hero .sub{color:var(--dim);font-size:18.5px;max-width:56ch;line-height:1.7;opacity:0;animation:rise .9s ease forwards .4s;}
        .hero-ctas{display:flex;gap:16px;margin-top:38px;flex-wrap:wrap;opacity:0;animation:rise .9s ease forwards .55s;}
        .hero-note{margin-top:18px;font-size:13px;color:var(--faint);letter-spacing:.14em;text-transform:uppercase;font-family:'IBM Plex Mono';opacity:0;animation:rise .9s ease forwards .65s;}
        .chips{display:flex;gap:12px;flex-wrap:wrap;margin-top:44px;opacity:0;animation:rise .9s ease forwards .75s;}
        .chip{display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:14px;
          background:var(--card2);border:1px solid var(--stroke2);backdrop-filter:blur(10px);
          font-size:14px;animation:floaty 5s ease-in-out infinite;}
        .chip:nth-child(2){animation-delay:-1.6s;}
        .chip:nth-child(3){animation-delay:-3.2s;}
        @keyframes floaty{50%{transform:translateY(-7px);}}
        .chip b{font-family:'Plus Jakarta Sans';font-weight:700;}
        .c-g{color:var(--green);} .c-c{color:var(--azure2);} .c-s{color:var(--gold);}

        .stats{border-top:1px solid var(--stroke);border-bottom:1px solid var(--stroke);margin-top:90px;background:rgba(151,183,232,.02);backdrop-filter:blur(6px);}
        .stats-g{display:grid;grid-template-columns:repeat(4,1fr);}
        .stat{padding:34px 26px;border-left:1px solid var(--stroke);}
        .stat:first-child{border-left:none;}
        @media(max-width:760px){.stats-g{grid-template-columns:1fr 1fr;}.stat:nth-child(3){border-left:none;border-top:1px solid var(--stroke);}.stat:nth-child(4){border-top:1px solid var(--stroke);}}
        .stat-n{font-family:'Plus Jakarta Sans';font-size:34px;font-weight:800;letter-spacing:-.02em;}
        .stat-n span{background:var(--gradtxt);-webkit-background-clip:text;background-clip:text;color:transparent;}
        .stat-l{font-size:13.5px;color:var(--faint);margin-top:4px;}

        .marq{border-bottom:1px solid var(--stroke);overflow:hidden;padding:20px 0;background:var(--bg2);}
        .marq-track{display:flex;gap:54px;width:max-content;animation:marq 26s linear infinite;}
        .marq span{font-family:'IBM Plex Mono';font-size:13px;letter-spacing:.18em;color:var(--faint);text-transform:uppercase;white-space:nowrap;}
        .marq b{color:var(--gold);font-weight:400;margin-right:54px;}
        @keyframes marq{to{transform:translateX(-50%);}}

        .kick{display:inline-flex;align-items:center;gap:10px;font-family:'IBM Plex Mono';font-size:12.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--azure2);}
        .kick::before{content:"";width:26px;height:1px;background:var(--azure2);}
        .head{max-width:760px;margin-bottom:64px;}
        .head h2{font-size:clamp(32px,4.6vw,54px);line-height:1.06;letter-spacing:-.03em;margin:18px 0 18px;}
        .head p{color:var(--dim);font-size:18px;max-width:56ch;}

        .chaos{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px;}
        @media(max-width:860px){.chaos{grid-template-columns:1fr 1fr;}}
        .silo{position:relative;background:var(--card);border:1px solid var(--stroke);border-radius:var(--r);padding:26px 22px;transition:transform .3s;}
        .silo:hover{transform:translateY(-4px);}
        .silo .ic{font-size:24px;}
        .silo h4{font-size:16px;margin:14px 0 6px;font-weight:700;}
        .silo p{font-size:13.5px;color:var(--faint);}
        .silo .tag{display:inline-block;margin-top:12px;font-family:'IBM Plex Mono';font-size:10px;letter-spacing:.18em;
          color:var(--rose);border:1px solid rgba(244,94,119,.35);border-radius:99px;padding:3px 9px;}
        .silo .x{position:absolute;top:16px;right:18px;font-family:'Plus Jakarta Sans';font-weight:800;color:var(--rose);
          font-size:22px;opacity:0;transform:scale(2) rotate(-14deg);transition:all .45s cubic-bezier(.2,.8,.3,1.3);}
        .in .silo .x{opacity:1;transform:scale(1) rotate(-8deg);}
        .in .silo:nth-child(2) .x{transition-delay:.15s;} .in .silo:nth-child(3) .x{transition-delay:.3s;} .in .silo:nth-child(4) .x{transition-delay:.45s;}
        .merge{display:flex;align-items:center;justify-content:center;gap:18px;margin:26px 0;color:var(--faint);}
        .merge .arrow{font-size:22px;color:var(--azure);animation:drop 1.6s ease-in-out infinite;}
        @keyframes drop{50%{transform:translateY(6px);}}
        .one{position:relative;border-radius:22px;padding:2px;background:var(--grad);box-shadow:0 0 60px rgba(47,107,255,.28);}
        .one-in{background:var(--bg2);border-radius:20px;padding:34px 36px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;}
        .one h3{font-size:26px;letter-spacing:-.02em;}
        .one p{color:var(--dim);font-size:15.5px;max-width:52ch;margin-top:6px;}
        .one .badge{font-family:'IBM Plex Mono';font-size:12px;letter-spacing:.16em;color:var(--azure2);border:1px solid rgba(127,180,255,.45);padding:8px 14px;border-radius:99px;white-space:nowrap;}
        .live-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green);
          box-shadow:0 0 12px var(--green);animation:pulse 1.8s infinite;margin-right:9px;vertical-align:2px;}

        .tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:38px;}
        .tab{font-family:'Plus Jakarta Sans';font-weight:700;font-size:15px;padding:12px 24px;border-radius:12px;
          border:1px solid var(--stroke2);background:transparent;color:var(--dim);cursor:pointer;transition:all .25s;}
        .tab:hover{color:#fff;border-color:rgba(199,220,255,.4);}
        .tab.on{background:var(--grad);border-color:transparent;color:#fff;box-shadow:0 4px 24px rgba(47,107,255,.45);}
        .panel{display:none;grid-template-columns:1fr 1.05fr;gap:60px;align-items:center;}
        .panel.on{display:grid;animation:panelIn .5s cubic-bezier(.2,.7,.2,1);}
        @keyframes panelIn{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}
        @media(max-width:900px){.panel.on{grid-template-columns:1fr;gap:36px;}}
        .panel h3{font-size:clamp(26px,3vw,36px);letter-spacing:-.025em;margin-bottom:14px;}
        .panel .who{font-family:'IBM Plex Mono';font-size:12.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--azure2);margin-bottom:14px;display:block;}
        .panel p.d{color:var(--dim);font-size:17px;max-width:48ch;}
        .feat{display:flex;gap:9px;flex-wrap:wrap;margin-top:24px;}
        .feat span{font-size:13px;color:var(--dim);border:1px solid var(--stroke2);padding:7px 14px;border-radius:10px;background:var(--card);}

        .mock{background:linear-gradient(160deg,rgba(151,183,232,.10),rgba(151,183,232,.03));
          border:1px solid var(--stroke2);border-radius:22px;padding:22px;backdrop-filter:blur(12px);
          box-shadow:0 24px 70px rgba(2,8,18,.6);transform-style:preserve-3d;transition:transform .2s ease;}
        .mock-bar{display:flex;gap:6px;margin-bottom:18px;}
        .mock-bar i{width:9px;height:9px;border-radius:50%;background:var(--stroke2);}
        .mock-bar i:first-child{background:var(--rose);} .mock-bar i:nth-child(2){background:var(--amber);} .mock-bar i:nth-child(3){background:var(--green);}
        .bubble{max-width:85%;padding:13px 17px;border-radius:16px;font-size:14.5px;line-height:1.55;margin-bottom:12px;}
        .bu{background:var(--grad);color:#fff;margin-left:auto;border-bottom-right-radius:4px;}
        .ba{background:rgba(151,183,232,.09);border:1px solid var(--stroke);border-bottom-left-radius:4px;color:#E3EBF7;}
        .typing{display:inline-flex;gap:5px;padding:14px 18px;background:rgba(151,183,232,.09);border-radius:16px;border-bottom-left-radius:4px;}
        .typing i{width:6px;height:6px;border-radius:50%;background:var(--dim);animation:ty 1.2s infinite;}
        .typing i:nth-child(2){animation-delay:.15s;} .typing i:nth-child(3){animation-delay:.3s;}
        @keyframes ty{30%{transform:translateY(-5px);opacity:1;}0%,60%,100%{opacity:.4;}}
        .tile-g{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        .tile{background:rgba(151,183,232,.06);border:1px solid var(--stroke);border-radius:14px;padding:18px;}
        .tile .tl{font-size:12px;color:var(--faint);letter-spacing:.06em;text-transform:uppercase;font-family:'IBM Plex Mono';}
        .tile .tv{font-family:'Plus Jakarta Sans';font-size:24px;font-weight:800;margin-top:6px;}
        .bar{height:6px;background:rgba(151,183,232,.1);border-radius:99px;margin-top:12px;overflow:hidden;}
        .bar i{display:block;height:100%;border-radius:99px;background:var(--grad);width:0;transition:width 1.2s ease .3s;}
        .panel.on .bar i{width:var(--w);}
        .alert{grid-column:1/-1;display:flex;align-items:center;gap:12px;background:rgba(244,94,119,.08);border:1px solid rgba(244,94,119,.35);border-radius:14px;padding:15px 18px;font-size:14px;}
        .alert .pulse{width:9px;height:9px;border-radius:50%;background:var(--rose);box-shadow:0 0 12px var(--rose);animation:pulse 1.6s infinite;flex-shrink:0;}
        .gen{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(76,141,255,.09);border:1px solid rgba(76,141,255,.4);border-radius:14px;padding:15px 18px;font-size:14px;}
        .gen b{color:var(--azure2);}
        .wamsg{display:flex;flex-direction:column;gap:10px;}
        .wa{background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.3);border-radius:14px;border-top-left-radius:4px;padding:13px 16px;font-size:14px;max-width:92%;}
        .wa .t{display:block;font-size:11px;color:var(--faint);margin-top:6px;text-align:right;font-family:'IBM Plex Mono';}

        .demo-wrap{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;}
        @media(max-width:900px){.demo-wrap{grid-template-columns:1fr;gap:40px;}}
        .paper{position:relative;background:#0C1930;border:1px solid var(--stroke2);border-radius:20px;padding:34px 30px;overflow:hidden;
          box-shadow:0 30px 80px rgba(2,8,18,.65);}
        .hw-line{display:flex;align-items:center;gap:14px;margin-bottom:20px;}
        .hw-line svg{flex:1;height:16px;}
        .hw-line path{stroke:#7E93B6;stroke-width:1.7;fill:none;stroke-linecap:round;opacity:.75;}
        .mark{width:24px;font-family:'Plus Jakarta Sans';font-weight:800;font-size:17px;opacity:0;transform:scale(1.8);transition:all .35s cubic-bezier(.2,.8,.3,1.4);}
        .mk-g{color:var(--green);} .mk-r{color:var(--rose);}
        .play .mark{opacity:1;transform:scale(1);}
        .play .m1{transition-delay:1.35s;} .play .m2{transition-delay:1.6s;} .play .m3{transition-delay:1.85s;}
        .play .m4{transition-delay:2.1s;} .play .m5{transition-delay:2.35s;} .play .m6{transition-delay:2.6s;}
        .scan{position:absolute;left:0;right:0;top:-8%;height:3px;background:linear-gradient(90deg,transparent,var(--azure2),transparent);
          box-shadow:0 0 24px var(--azure2),0 0 60px rgba(127,180,255,.5);opacity:0;}
        .play .scan{animation:scan 1.5s cubic-bezier(.5,0,.5,1) forwards;}
        @keyframes scan{0%{top:-4%;opacity:1;}95%{opacity:1;}100%{top:104%;opacity:0;}}
        .stampd{position:absolute;bottom:22px;right:22px;font-family:'Plus Jakarta Sans';font-weight:800;font-size:15px;
          color:var(--green);border:2px solid var(--green);border-radius:10px;padding:9px 16px;transform:rotate(-6deg) scale(2.4);opacity:0;
          transition:all .4s cubic-bezier(.2,.8,.3,1.4) 2.95s;background:rgba(52,211,153,.08);backdrop-filter:blur(4px);}
        .play .stampd{opacity:1;transform:rotate(-6deg) scale(1);}
        .score-line{display:flex;align-items:center;gap:14px;margin-top:26px;font-family:'IBM Plex Mono';font-size:13px;color:var(--faint);}

        .tml{background:radial-gradient(900px 500px at 80% 20%,rgba(47,107,255,.14),transparent 60%),var(--bg2);
          border-top:1px solid var(--stroke);border-bottom:1px solid var(--stroke);}
        .tml-g{display:grid;grid-template-columns:1fr 1fr;gap:70px;align-items:center;}
        @media(max-width:920px){.tml-g{grid-template-columns:1fr;gap:44px;}}
        .tm-badge{display:inline-block;font-family:'IBM Plex Mono';font-size:12px;letter-spacing:.16em;color:var(--gold);
          border:1px solid rgba(217,165,68,.45);padding:7px 14px;border-radius:99px;margin-bottom:20px;}
        .gauge-card{background:var(--card2);border:1px solid var(--stroke2);border-radius:24px;padding:38px;backdrop-filter:blur(12px);}
        @media(max-width:520px){.gauge-card{padding:26px 20px;}}
        .gauge-top{display:flex;align-items:center;gap:34px;flex-wrap:wrap;}
        .gauge{position:relative;width:180px;height:180px;flex-shrink:0;}
        .gauge svg{transform:rotate(-90deg);}
        .g-bg{stroke:rgba(151,183,232,.12);stroke-width:12;fill:none;}
        .g-fg{stroke:url(#gg);stroke-width:12;fill:none;stroke-linecap:round;stroke-dasharray:439.8;stroke-dashoffset:439.8;transition:stroke-dashoffset 1.6s cubic-bezier(.3,.7,.2,1) .2s;}
        .in .g-fg{stroke-dashoffset:57.2;}
        .g-num{position:absolute;inset:0;display:grid;place-items:center;text-align:center;}
        .g-num b{font-family:'Plus Jakarta Sans';font-size:44px;font-weight:800;display:block;line-height:1;}
        .g-num span{font-size:12px;color:var(--faint);font-family:'IBM Plex Mono';letter-spacing:.12em;}
        .g-meta{flex:1;min-width:200px;}
        .g-meta li{list-style:none;display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px dashed var(--stroke);font-size:14.5px;color:var(--dim);}
        .g-meta li:last-child{border:none;}
        .g-meta b{color:#fff;font-weight:600;}
        .hm-title{font-family:'IBM Plex Mono';font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:30px 0 14px;}
        .hm{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;}
        .hm i{aspect-ratio:1;border-radius:7px;opacity:0;transform:scale(.5);transition:all .4s cubic-bezier(.2,.8,.3,1.3);cursor:default;}
        .in .hm i{opacity:1;transform:scale(1);}
        .hm i:hover{transform:scale(1.16);box-shadow:0 0 18px currentColor;}
        .lv0{background:rgba(244,94,119,.85);color:var(--rose);} .lv1{background:rgba(245,182,11,.8);color:var(--amber);}
        .lv2{background:rgba(52,211,153,.8);color:var(--green);} .lv3{background:rgba(76,141,255,.9);color:var(--azure);}
        .legend{display:flex;align-items:center;gap:10px;margin-top:16px;font-size:12px;color:var(--faint);font-family:'IBM Plex Mono';flex-wrap:wrap;}
        .legend i{width:12px;height:12px;border-radius:4px;display:inline-block;}

        .bento{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;}
        @media(max-width:760px){.bento{grid-template-columns:1fr;}}
        .b-card{background:var(--card);border:1px solid var(--stroke);border-radius:var(--r);padding:30px 28px;transition:transform .3s,border-color .3s,background .3s;}
        .b-card:hover{transform:translateY(-5px);border-color:rgba(199,220,255,.3);background:var(--card2);}
        .b-card .ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-size:20px;margin-bottom:18px;background:rgba(151,183,232,.08);border:1px solid var(--stroke2);}
        .b-card h4{font-size:18px;margin-bottom:8px;font-weight:700;}
        .b-card p{font-size:14.5px;color:var(--dim);}
        .mandate-line{margin-top:34px;font-family:'Plus Jakarta Sans';font-size:clamp(20px,2.6vw,28px);font-weight:800;letter-spacing:-.02em;}
        .mandate-line em{font-style:normal;background:var(--gradtxt);-webkit-background-clip:text;background-clip:text;color:transparent;}

        .steps-g{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;position:relative;}
        @media(max-width:880px){.steps-g{grid-template-columns:1fr 1fr;}}
        @media(max-width:540px){.steps-g{grid-template-columns:1fr;}}
        .st{position:relative;background:var(--card);border:1px solid var(--stroke);border-radius:var(--r);padding:28px 24px;
          opacity:0;transform:translateY(24px);transition:all .6s ease;}
        .in .st{opacity:1;transform:none;}
        .in .st:nth-child(2){transition-delay:.12s;} .in .st:nth-child(3){transition-delay:.24s;} .in .st:nth-child(4){transition-delay:.36s;}
        .st .n{width:38px;height:38px;border-radius:11px;background:var(--grad);display:grid;place-items:center;
          font-family:'Plus Jakarta Sans';font-weight:800;font-size:16px;box-shadow:0 4px 18px rgba(47,107,255,.45);}
        .st h4{font-size:16.5px;margin:16px 0 7px;font-weight:700;}
        .st p{font-size:14px;color:var(--dim);}

        .price-g{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:stretch;}
        @media(max-width:1000px){.price-g{grid-template-columns:1fr 1fr;}}
        @media(max-width:620px){.price-g{grid-template-columns:1fr;}}
        .pc{border-radius:22px;padding:1.5px;background:var(--stroke);transition:transform .3s;position:relative;}
        .pc:hover{transform:translateY(-4px);}
        .pc.hot{background:var(--grad);box-shadow:0 0 70px rgba(47,107,255,.3);}
        .pc-in{background:var(--bg2);border-radius:21px;padding:30px 26px;height:100%;display:flex;flex-direction:column;}
        .pc .plan{font-family:'Plus Jakarta Sans';font-weight:800;font-size:19px;letter-spacing:.02em;text-transform:uppercase;color:#fff;}
        .pc .gloss{font-family:'IBM Plex Mono';font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--azure2);margin-top:5px;display:block;}
        .pc.hot .gloss{color:var(--gold);}
        .pc .amt{display:flex;align-items:baseline;gap:7px;margin:20px 0 3px;}
        .pc .amt b{font-family:'Plus Jakarta Sans';font-size:38px;font-weight:800;letter-spacing:-.03em;line-height:1;}
        .pc .amt span{color:var(--dim);font-size:13px;}
        .pc .inr{font-size:12px;color:var(--faint);font-family:'IBM Plex Mono';margin-bottom:22px;padding-bottom:20px;border-bottom:1px solid var(--stroke);}
        .pc ul{list-style:none;margin-bottom:26px;flex:1;}
        .pc li{display:flex;gap:10px;padding:8px 0;font-size:14px;color:var(--dim);line-height:1.5;}
        .pc li b{color:var(--green);font-weight:700;flex-shrink:0;}
        .pc li.no b{color:var(--faint);}
        .pc li.no{color:var(--faint);}
        .ribbon{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:var(--gold);color:#0A1526;
          font-family:'Plus Jakarta Sans';font-weight:800;font-size:10.5px;letter-spacing:.16em;padding:5px 14px;border-radius:99px;white-space:nowrap;z-index:2;}
        .trust-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:30px;}
        .trust-row span{font-size:12.5px;font-family:'IBM Plex Mono';color:var(--faint);border:1px solid var(--stroke);padding:7px 13px;border-radius:99px;}

        .pilot{margin-top:26px;border-radius:20px;padding:1.5px;background:linear-gradient(93deg,rgba(217,165,68,.6),rgba(76,141,255,.5));}
        .pilot-in{background:var(--bg2);border-radius:19px;padding:30px 32px;display:flex;align-items:center;justify-content:space-between;gap:26px;flex-wrap:wrap;}
        .pilot h4{font-size:21px;margin-bottom:7px;}
        .pilot p{color:var(--dim);font-size:15px;max-width:60ch;}
        .pilot .mk{font-family:'IBM Plex Mono';font-size:11.5px;letter-spacing:.16em;color:var(--gold);text-transform:uppercase;display:block;margin-bottom:11px;}

        .calc{margin-top:26px;background:var(--card);border:1px solid var(--stroke);border-radius:22px;padding:34px 32px;}
        @media(max-width:560px){.calc{padding:26px 20px;}}
        .calc-h{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:26px;}
        .calc-h h4{font-size:20px;}
        .calc-h span{font-family:'IBM Plex Mono';font-size:11.5px;letter-spacing:.16em;color:var(--faint);text-transform:uppercase;}
        .calc-g{display:grid;grid-template-columns:1.25fr 1fr;gap:38px;align-items:center;}
        @media(max-width:820px){.calc-g{grid-template-columns:1fr;gap:28px;}}
        .ctl{margin-bottom:24px;}
        .ctl label{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:var(--faint);
          font-family:'IBM Plex Mono';letter-spacing:.12em;text-transform:uppercase;margin-bottom:12px;}
        .ctl label b{font-family:'Plus Jakarta Sans';font-size:22px;color:#fff;letter-spacing:-.01em;}
        input[type=range]{width:100%;-webkit-appearance:none;appearance:none;height:6px;border-radius:99px;
          background:rgba(151,183,232,.15);outline:none;cursor:pointer;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;
          background:var(--grad);border:2px solid #0B1A2E;box-shadow:0 3px 14px rgba(47,107,255,.6);cursor:pointer;}
        input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#4C8DFF;border:2px solid #0B1A2E;cursor:pointer;}
        .seg{display:flex;gap:8px;flex-wrap:wrap;}
        .seg button{flex:1;min-width:88px;font-family:'Plus Jakarta Sans';font-weight:700;font-size:13.5px;padding:11px 8px;
          border-radius:11px;border:1px solid var(--stroke2);background:transparent;color:var(--dim);cursor:pointer;transition:all .22s;}
        .seg button:hover{color:#fff;border-color:rgba(199,220,255,.4);}
        .seg button.on{background:var(--grad);border-color:transparent;color:#fff;box-shadow:0 4px 18px rgba(47,107,255,.4);}
        .calc-out{background:var(--bg2);border:1px solid var(--stroke2);border-radius:18px;padding:28px;}
        .calc-out .big{font-family:'Plus Jakarta Sans';font-size:clamp(30px,4.4vw,42px);font-weight:800;letter-spacing:-.03em;line-height:1.05;}
        .calc-out .cap{font-family:'IBM Plex Mono';font-size:11.5px;letter-spacing:.16em;color:var(--faint);text-transform:uppercase;}
        .calc-out ul{list-style:none;margin-top:20px;}
        .calc-out li{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed var(--stroke);font-size:14px;color:var(--dim);}
        .calc-out li:last-child{border:none;}
        .calc-out li b{color:#fff;font-weight:600;font-family:'IBM Plex Mono';font-size:13.5px;}
        .calc-note{font-size:12.5px;color:var(--faint);margin-top:18px;line-height:1.6;}

        .p-hero{padding:170px 0 70px;position:relative;overflow:hidden;border-bottom:1px solid var(--stroke);}
        .p-hero::before{content:"";position:absolute;left:-10%;top:-60%;width:70%;height:200%;
          background:radial-gradient(circle at 40% 50%,rgba(47,107,255,.16),transparent 60%);filter:blur(20px);}
        .p-hero h1{font-size:clamp(36px,5.6vw,64px);line-height:1.05;letter-spacing:-.035em;margin:18px 0 18px;max-width:22ch;}
        .p-hero p{color:var(--dim);font-size:18px;max-width:62ch;}
        .p-meta{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px;}
        .p-meta span{font-family:'IBM Plex Mono';font-size:11.5px;letter-spacing:.14em;color:var(--faint);
          border:1px solid var(--stroke);padding:7px 13px;border-radius:99px;text-transform:uppercase;}

        .founder{border-radius:24px;padding:2px;background:var(--grad);box-shadow:0 0 70px rgba(47,107,255,.26);}
        .founder-in{background:var(--bg2);border-radius:22px;padding:44px 42px;display:grid;grid-template-columns:auto 1fr;gap:38px;align-items:start;}
        @media(max-width:760px){.founder-in{grid-template-columns:1fr;gap:26px;padding:32px 24px;}}
        .av{width:104px;height:104px;border-radius:26px;display:grid;place-items:center;flex-shrink:0;
          font-family:'Plus Jakarta Sans';font-weight:800;font-size:34px;letter-spacing:.02em;
          background:var(--grad);color:#fff;box-shadow:0 10px 34px rgba(47,107,255,.45);}
        .av.alt{background:linear-gradient(140deg,#1B3A64,#0F2440);border:1px solid var(--stroke2);color:var(--ice);box-shadow:none;
          width:72px;height:72px;border-radius:20px;font-size:24px;}
        .p-name{font-size:clamp(26px,3.2vw,34px);letter-spacing:-.025em;}
        .p-role{font-family:'IBM Plex Mono';font-size:12.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--azure2);margin:9px 0 0;display:block;}
        .founder .p-role{color:var(--gold);}
        .p-edu{display:flex;align-items:flex-start;gap:9px;margin:14px 0 20px;padding:12px 15px;border-radius:12px;
          background:var(--card);border:1px solid var(--stroke);font-size:13.5px;color:var(--dim);line-height:1.5;}
        .p-edu i{font-style:normal;color:var(--azure2);flex-shrink:0;}
        .founder .p-edu i{color:var(--gold);}
        .p-edu b{color:#fff;font-weight:600;}
        .p-body{color:var(--dim);font-size:16px;max-width:66ch;}
        .p-body p+p{margin-top:13px;}
        .p-tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px;}
        .p-tags span{font-size:12.5px;color:var(--dim);border:1px solid var(--stroke2);padding:6px 12px;border-radius:99px;background:var(--card);}
        .people-g{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;}
        @media(max-width:860px){.people-g{grid-template-columns:1fr;}}
        .person{background:var(--card);border:1px solid var(--stroke);border-radius:var(--r);padding:32px 30px;transition:transform .3s,border-color .3s;}
        .person:hover{transform:translateY(-4px);border-color:rgba(199,220,255,.28);}
        .person .p-name{font-size:23px;}
        .principles{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;}
        @media(max-width:760px){.principles{grid-template-columns:1fr;}}
        .pr{background:var(--card);border:1px solid var(--stroke);border-radius:var(--r);padding:28px 26px;}
        .pr .n{font-family:'IBM Plex Mono';font-size:12px;letter-spacing:.18em;color:var(--azure2);}
        .pr h4{font-size:17.5px;margin:12px 0 8px;}
        .pr p{font-size:14.5px;color:var(--dim);}

        .doc{display:grid;grid-template-columns:250px 1fr;gap:56px;align-items:start;}
        @media(max-width:940px){.doc{grid-template-columns:1fr;gap:32px;}}
        .doc-nav{position:sticky;top:104px;background:var(--card);border:1px solid var(--stroke);border-radius:18px;padding:22px 20px;}
        @media(max-width:940px){.doc-nav{position:static;}}
        .doc-nav .t{font-family:'IBM Plex Mono';font-size:11px;letter-spacing:.18em;color:var(--faint);text-transform:uppercase;margin-bottom:14px;}
        .doc-nav a{display:block;font-size:14px;color:var(--dim);padding:7px 0;border-bottom:1px solid var(--stroke);transition:color .2s;}
        .doc-nav a:last-child{border:none;}
        .doc-nav a:hover{color:#fff;}
        .prose{max-width:74ch;}
        .prose h3{font-size:24px;letter-spacing:-.02em;margin:48px 0 14px;}
        [id]{scroll-margin-top:112px;}
        .prose h3:first-child{margin-top:0;}
        .prose h4{font-size:17px;margin:26px 0 8px;font-weight:700;color:var(--ice);}
        .prose p{color:var(--dim);font-size:15.8px;margin-bottom:14px;}
        .prose ul,.prose ol{color:var(--dim);font-size:15.8px;margin:0 0 16px 20px;}
        .prose li{margin-bottom:8px;}
        .prose li b,.prose p b{color:#fff;font-weight:600;}
        .prose a.lk{color:var(--azure2);border-bottom:1px solid rgba(127,180,255,.4);}
        .callout{background:var(--card2);border:1px solid var(--stroke2);border-left:3px solid var(--azure);
          border-radius:12px;padding:20px 22px;margin:22px 0;font-size:15px;color:var(--dim);}
        .callout.warn{border-left-color:var(--amber);background:rgba(245,182,11,.06);border-color:rgba(245,182,11,.28);}
        .callout.good{border-left-color:var(--green);background:rgba(52,211,153,.06);border-color:rgba(52,211,153,.26);}
        .callout b{color:#fff;}
        .tbl{width:100%;border-collapse:collapse;margin:20px 0 26px;font-size:14.5px;display:block;overflow-x:auto;}
        .tbl th,.tbl td{text-align:left;padding:13px 14px;border-bottom:1px solid var(--stroke);vertical-align:top;color:var(--dim);}
        .tbl th{font-family:'IBM Plex Mono';font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--azure2);
          border-bottom:1px solid var(--stroke2);white-space:nowrap;}
        .tbl td b{color:#fff;font-weight:600;}
        .tbl tr:last-child td{border-bottom:none;}
        .eff{font-family:'IBM Plex Mono';font-size:12px;letter-spacing:.12em;color:var(--faint);text-transform:uppercase;}

        .desks{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
        @media(max-width:860px){.desks{grid-template-columns:1fr;}}
        .desk{border-radius:22px;padding:1.5px;background:var(--stroke);transition:transform .3s;}
        .desk:hover{transform:translateY(-4px);}
        .desk.biz{background:linear-gradient(140deg,rgba(217,165,68,.55),rgba(151,183,232,.18));}
        .desk.sal{background:linear-gradient(140deg,rgba(76,141,255,.6),rgba(151,183,232,.18));}
        .desk-in{background:var(--bg2);border-radius:21px;padding:34px 32px;height:100%;}
        .desk .dl{font-family:'IBM Plex Mono';font-size:11.5px;letter-spacing:.18em;text-transform:uppercase;}
        .desk.biz .dl{color:var(--gold);} .desk.sal .dl{color:var(--azure2);}
        .desk h3{font-size:24px;margin:12px 0 10px;letter-spacing:-.02em;}
        .desk>.desk-in>p{color:var(--dim);font-size:15px;margin-bottom:22px;}
        .mailrow{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 17px;border-radius:14px;
          background:var(--card);border:1px solid var(--stroke);margin-bottom:10px;transition:all .25s;flex-wrap:wrap;}
        .mailrow:hover{border-color:rgba(199,220,255,.35);background:var(--card2);transform:translateX(3px);}
        .mailrow .who{font-size:13px;color:var(--faint);font-family:'IBM Plex Mono';letter-spacing:.1em;text-transform:uppercase;}
        .mailrow .addr{font-family:'IBM Plex Mono';font-size:14.5px;color:#fff;font-weight:500;}
        .form{background:var(--card);border:1px solid var(--stroke);border-radius:22px;padding:36px 34px;margin-top:18px;}
        @media(max-width:560px){.form{padding:26px 20px;}}
        .f-g{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
        @media(max-width:640px){.f-g{grid-template-columns:1fr;}}
        .fld{display:flex;flex-direction:column;gap:8px;margin-bottom:18px;}
        .fld label{font-family:'IBM Plex Mono';font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);}
        .fld input,.fld select,.fld textarea{background:var(--bg2);border:1px solid var(--stroke2);border-radius:12px;
          padding:13px 15px;color:var(--txt);font-family:'Inter',sans-serif;font-size:15px;outline:none;transition:border-color .2s;width:100%;}
        .fld input:focus,.fld select:focus,.fld textarea:focus{border-color:var(--azure);}
        .fld textarea{resize:vertical;min-height:120px;}
        .fld select{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23A3B4CD' stroke-width='1.7' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat:no-repeat;background-position:right 16px center;padding-right:40px;}

        .final{text-align:center;padding:170px 0;overflow:hidden;position:relative;}
        .final h2{font-size:clamp(38px,6.4vw,78px);letter-spacing:-.035em;line-height:1.03;max-width:16ch;margin:20px auto 24px;}
        .final p{color:var(--dim);font-size:18px;max-width:52ch;margin:0 auto 40px;}
        .final .glow{position:absolute;left:50%;top:50%;width:800px;height:800px;transform:translate(-50%,-50%);
          background:radial-gradient(circle,rgba(47,107,255,.16),rgba(127,180,255,.07) 45%,transparent 70%);filter:blur(30px);z-index:0;}
        .final-pillar{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);height:420px;width:auto;color:var(--azure2);opacity:.06;z-index:0;}
        .final .wrap{position:relative;z-index:2;}

        footer{border-top:1px solid var(--stroke);padding:52px 0 40px;}
        .foot-top{display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr;gap:36px;padding-bottom:38px;border-bottom:1px solid var(--stroke);}
        @media(max-width:860px){.foot-top{grid-template-columns:1fr 1fr;gap:30px;}}
        @media(max-width:520px){.foot-top{grid-template-columns:1fr;}}
        .foot-brand{display:flex;align-items:center;gap:13px;margin-bottom:16px;}
        .foot-brand .pmark{height:40px;}
        .foot-col .ct{font-family:'IBM Plex Mono';font-size:11px;letter-spacing:.18em;color:var(--faint);text-transform:uppercase;margin-bottom:15px;}
        .foot-col a{display:block;font-size:14px;color:var(--dim);padding:5px 0;transition:color .2s;}
        .foot-col a:hover{color:#fff;}
        .foot-tag{font-size:14px;color:var(--faint);max-width:34ch;}
        .foot-bot{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;padding-top:26px;}
        .copy{font-size:12.5px;color:var(--faint);font-family:'IBM Plex Mono';}

        .rv{opacity:0;transform:translateY(26px);transition:opacity .8s ease,transform .8s ease;}
        .rv.in{opacity:1;transform:none;}
        @media(prefers-reduced-motion:reduce){
          *,*::before,*::after{animation:none!important;transition:none!important;}
          .rv,.st,.hm i,.silo .x,.hero h1 .l,.hero .sub,.hero-ctas,.chips,.hero-note{opacity:1!important;transform:none!important;}
          .g-fg{stroke-dashoffset:57.2!important;}
        }
      `}</style>

      <div id="prog"></div>
      <div id="spot"></div>

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <g id="pillar-logo" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="12" y="4" width="72" height="10"/>
            <rect x="19" y="14" width="58" height="9"/>
            <line x1="27" y1="23" x2="27" y2="93"/>
            <line x1="34" y1="23" x2="34" y2="93"/>
            <line x1="62" y1="23" x2="62" y2="93"/>
            <line x1="69" y1="23" x2="69" y2="93"/>
            <rect x="38" y="23" width="20" height="70" rx="10"/>
            <path d="M56 29 C45 33 40 40 47 46 C56 51 68 54 65 61 C61 69 48 71 43 79 C40 84 42 90 47 91"/>
            <rect x="19" y="93" width="58" height="9"/>
            <rect x="12" y="102" width="72" height="10"/>
          </g>
        </defs>
      </svg>

      <header id="hd">
        <div className="wrap nav">
          <a className="logo" href="#/">
            <svg className="pmark" viewBox="0 0 96 116"><use href="#pillar-logo"/></svg>
            <span><span className="wordmark">STHARA</span><span className="wm-sub">THE UNIFIED SCHOOL OS</span></span>
          </a>
          <nav className="nav-links" id="navlinks">
            <a href="#platform" data-nav="home">Platform</a>
            <a href="#tml" data-nav="home">True Mastery</a>
            <a href="#pricing" data-nav="home">Pricing</a>
            <a href="#/about" data-nav="about">About</a>
            <a href="#/dpdp" data-nav="dpdp">DPDP</a>
            <a href="#/contact" data-nav="contact">Contact</a>
          </nav>
          <div className="nav-cta">
            <a href="/login" className="ghost-link">Sign in</a>
            <a href="#pricing" className="btn btn-hot btn-sm">Book a pilot</a>
          </div>
          <button className="menu-t" id="menuT" aria-label="Open menu">☰</button>
        </div>
      </header>

      <div id="drawer">
        <button className="dr-close" id="drClose" aria-label="Close menu">✕</button>
        <a href="#platform">Platform</a>
        <a href="#tml">True Mastery</a>
        <a href="#pricing">Pricing</a>
        <a href="#/about">About us</a>
        <a href="#/dpdp">DPDP Act 2023</a>
        <a href="#/privacy">Privacy Policy</a>
        <a href="#/contact">Contact us</a>
        <a href="#pricing" className="btn btn-hot dr-cta">Book a paid pilot →</a>
      </div>

      <main id="main">

      {/* ================================= PAGE: HOME ================================= */}
      <div className="page on" id="page-home">

      <section className="hero">
        <canvas id="net"></canvas>
        <div className="hero-blob hb1"></div><div className="hero-blob hb2"></div><div className="hero-blob hb3"></div>
        <div className="wrap">
          <span className="pill"><span className="dot"></span>The Unified School OS · Powered by Google Gemini</span>
          <h1>
            <span className="l">Every student.</span>
            <span className="l">Every teacher.</span>
            <span className="l"><span className="grad-txt">One system.</span></span>
          </h1>
          <p className="sub">Sthara gives every child a personal AI tutor, every teacher a copilot that grades handwriting in seconds, the office a full ERP with an AI brain, and every parent real visibility on WhatsApp — all feeding one living record.</p>
          <div className="hero-ctas">
            <a href="#pricing" className="btn btn-hot">Book a paid pilot →</a>
            <a href="#demo" className="btn btn-dark">▶ Watch it grade homework</a>
          </div>
          <div className="hero-note">One grade · One term · 100% credited on conversion</div>
          <div className="chips">
            <div className="chip"><span className="c-g">✓</span><span>Homework graded in <b>27s</b></span></div>
            <div className="chip"><span className="c-c">↑</span><span>Aarav's mastery: <b>87</b> (+3 this week)</span></div>
            <div className="chip"><span className="c-s">◉</span><span>Fee reminder sent · <b>WhatsApp</b></span></div>
          </div>
        </div>

        <div className="stats">
          <div className="wrap stats-g">
            <div className="stat"><div className="stat-n">&lt;<span data-count="30">0</span>s</div><div className="stat-l">to grade a handwritten paper</div></div>
            <div className="stat"><div className="stat-n"><span data-count="4">0</span>→1</div><div className="stat-l">systems replaced by one record</div></div>
            <div className="stat"><div className="stat-n">₹<span data-count="2000">0</span></div><div className="stat-l">entry price · per student / year</div></div>
            <div className="stat"><div className="stat-n"><span data-count="10">0</span> min</div><div className="stat-l">from signup to fully live</div></div>
          </div>
        </div>
      </section>

      <div className="marq">
        <div className="marq-track">
          <span><b>✦</b>NEP 2020 ALIGNED<b style={{ marginLeft: 54 }}>✦</b>CBSE WELLNESS READY<b style={{ marginLeft: 54 }}>✦</b>BUILT FOR DPDP ACT 2023<b style={{ marginLeft: 54 }}>✦</b>HOSTED IN INDIA<b style={{ marginLeft: 54 }}>✦</b>HANDWRITING OCR<b style={{ marginLeft: 54 }}>✦</b>WHATSAPP NATIVE<b style={{ marginLeft: 54 }}>✦</b>ROLE-BASED ACCESS<b style={{ marginLeft: 54 }}>✦</b>FULL AUDIT TRAIL</span>
          <span><b>✦</b>NEP 2020 ALIGNED<b style={{ marginLeft: 54 }}>✦</b>CBSE WELLNESS READY<b style={{ marginLeft: 54 }}>✦</b>BUILT FOR DPDP ACT 2023<b style={{ marginLeft: 54 }}>✦</b>HOSTED IN INDIA<b style={{ marginLeft: 54 }}>✦</b>HANDWRITING OCR<b style={{ marginLeft: 54 }}>✦</b>WHATSAPP NATIVE<b style={{ marginLeft: 54 }}>✦</b>ROLE-BASED ACCESS<b style={{ marginLeft: 54 }}>✦</b>FULL AUDIT TRAIL</span>
        </div>
      </div>

      <section id="problem">
        <div className="wrap">
          <div className="head rv">
            <span className="kick">The problem</span>
            <h2>Four static systems. <span className="grad-txt">One living record.</span></h2>
            <p>Attendance frozen in a spreadsheet. Parent updates buried in a WhatsApp group. A tutoring app the school never sees. Marks in a paper register nobody can search. Four files that stop the moment you close them — and none of them tells you how the child is actually doing.</p>
          </div>
          <div className="rv">
            <div className="chaos">
              <div className="silo"><span className="x">✕</span><div className="ic">📊</div><h4>The spreadsheet</h4><p>Attendance &amp; fees. No audit trail.</p><span className="tag">STATIC</span></div>
              <div className="silo"><span className="x">✕</span><div className="ic">💬</div><h4>The WhatsApp group</h4><p>Updates, but zero record.</p><span className="tag">STATIC</span></div>
              <div className="silo"><span className="x">✕</span><div className="ic">📱</div><h4>The tutoring app</h4><p>Invisible to the school.</p><span className="tag">STATIC</span></div>
              <div className="silo"><span className="x">✕</span><div className="ic">📒</div><h4>The paper register</h4><p>Marks no one can search.</p><span className="tag">STATIC</span></div>
            </div>
            <div className="merge"><span className="arrow">↓</span><span className="mono" style={{ fontSize: 12, letterSpacing: '.18em' }}>REPLACED BY</span><span className="arrow">↓</span></div>
            <div className="one">
              <div className="one-in">
                <div>
                  <h3><span className="live-dot"></span>Sthara — one living record</h3>
                  <p>Every lesson, submission, mark, fee and message flows into a single source of truth that updates itself as the term happens — and all four roles read the same page.</p>
                </div>
                <span className="badge">UPDATES ITSELF · LIVE</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" style={{ paddingTop: 60 }}>
        <div className="wrap">
          <div className="head rv">
            <span className="kick">The platform</span>
            <h2>Four roles. Four <span className="grad-txt">superpowers.</span></h2>
            <p>Not an admin tool with AI bolted on. Sthara is built role-first — tap through what each person actually gets.</p>
          </div>

          <div className="tabs rv" id="tabs">
            <button className="tab on" data-t="0">🎓 Student</button>
            <button className="tab" data-t="1">✏️ Teacher</button>
            <button className="tab" data-t="2">🏛 Admin</button>
            <button className="tab" data-t="3">👨‍👩‍👧 Parent</button>
          </div>

          <div className="panel on" data-p="0">
            <div>
              <span className="who">For the student</span>
              <h3>A personal AI tutor that never sleeps.</h3>
              <p className="d">Any subject, any hour. When a student asks a question, it asks back what they've already tried before explaining — building real understanding instead of handing over answers.</p>
              <div className="feat"><span>Socratic by default</span><span>Adapts to weak areas</span><span>Every subject</span><span>24 × 7</span></div>
            </div>
            <div className="mock tilt">
              <div className="mock-bar"><i></i><i></i><i></i></div>
              <div className="bubble bu">Why does sin²θ + cos²θ = 1? 😩</div>
              <div className="bubble ba">Great question! Before I explain — what do you already know about a point moving on the unit circle?</div>
              <div className="bubble bu">Umm… x² + y² = 1?</div>
              <div className="bubble ba">Exactly. Now, what are x and y in terms of θ? You're one step away 👀</div>
              <div className="typing"><i></i><i></i><i></i></div>
            </div>
          </div>

          <div className="panel" data-p="1">
            <div>
              <span className="who">For the teacher</span>
              <h3>A copilot that grades handwriting.</h3>
              <p className="d">Lesson plans, exercises and practice papers in seconds. Homework comes back photographed, not typed — vision AI reads the handwriting and grades it question by question, in under 30 seconds.</p>
              <div className="feat"><span>Handwriting OCR</span><span>Instant corrections</span><span>Question-by-question</span><span>Papers in seconds</span></div>
            </div>
            <div className="mock tilt">
              <div className="mock-bar"><i></i><i></i><i></i></div>
              <div className="tile-g">
                <div className="tile"><div className="tl">Assignments graded</div><div className="tv">142 <span style={{ color: 'var(--green)', fontSize: 14 }}>this week</span></div><div className="bar"><i style={{ ['--w' as any]: '88%' }}></i></div></div>
                <div className="tile"><div className="tl">Avg. grading time</div><div className="tv">27<span style={{ fontSize: 15, color: 'var(--dim)' }}>s</span></div><div className="bar"><i style={{ ['--w' as any]: '96%' }}></i></div></div>
                <div className="tile" style={{ gridColumn: '1/-1' }}><div className="tl">Next up</div><div className="tv" style={{ fontSize: 16, fontWeight: 600 }}>Gen: Practice paper — Trigonometry (Grade 10)</div><div className="bar"><i style={{ ['--w' as any]: '64%' }}></i></div></div>
              </div>
            </div>
          </div>

          <div className="panel" data-p="2">
            <div>
              <span className="who">For the admin office</span>
              <h3>A full ERP with an AI brain.</h3>
              <p className="d">Attendance, fees, admissions and reporting in one dashboard — with AI that drafts the CBSE wellness report, flags at-risk students from their live mastery, and turns fee data into plain language. Every action audit-trailed.</p>
              <div className="feat"><span>AI-drafted reports</span><span>At-risk flags</span><span>Fee &amp; admissions</span><span>Full audit trail</span></div>
            </div>
            <div className="mock tilt">
              <div className="mock-bar"><i></i><i></i><i></i></div>
              <div className="tile-g">
                <div className="tile"><div className="tl">Fees collected</div><div className="tv">₹42.6L</div><div className="bar"><i style={{ ['--w' as any]: '81%' }}></i></div></div>
                <div className="tile"><div className="tl">Attendance today</div><div className="tv">94.2%</div><div className="bar"><i style={{ ['--w' as any]: '94%' }}></i></div></div>
                <div className="alert"><span className="pulse"></span>3 students flagged at-risk — mastery dropped 2 weeks straight</div>
                <div className="gen"><span><b>AI:</b> CBSE wellness report drafted for review</span><span style={{ color: 'var(--azure2)' }}>Open →</span></div>
              </div>
            </div>
          </div>

          <div className="panel" data-p="3">
            <div>
              <span className="who">For the parent</span>
              <h3>Real visibility, on WhatsApp.</h3>
              <p className="d">Homework, fees and progress in one view — with updates and reminders delivered where parents already are. No more piecing it together from three group chats or waiting for report day.</p>
              <div className="feat"><span>WhatsApp updates</span><span>Live progress</span><span>Fee reminders</span><span>Zero new apps</span></div>
            </div>
            <div className="mock tilt">
              <div className="mock-bar"><i></i><i></i><i></i></div>
              <div className="wamsg">
                <div className="wa">📚 <b>Maths homework graded:</b> Aarav scored 9/10 — great work on quadratic equations!<span className="t">2:14 PM ✓✓</span></div>
                <div className="wa">📈 <b>Weekly progress:</b> Aarav's True Mastery Level is now 87 (↑3). Physics needs a little attention.<span className="t">5:00 PM ✓✓</span></div>
                <div className="wa">💰 <b>Gentle reminder:</b> Term-2 fee is due this Friday. Pay securely from the parent portal.<span className="t">6:30 PM ✓✓</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="demo" style={{ background: 'var(--bg2)', borderTop: '1px solid var(--stroke)', borderBottom: '1px solid var(--stroke)' }}>
        <div className="wrap demo-wrap">
          <div className="rv demo-copy">
            <span className="kick">Live demo · on loop</span>
            <h2 style={{ fontSize: 'clamp(30px,4vw,48px)', letterSpacing: '-.03em', margin: '18px 0' }}>Photographed.<br/>Scanned.<br/><span className="grad-txt">Graded in 27s.</span></h2>
            <p style={{ color: 'var(--dim)', fontSize: 17.5, maxWidth: '46ch' }}>A student snaps a photo of their notebook. Vision AI reads the handwriting, checks every answer, writes corrections — and the teacher just reviews and confirms. The mark flows straight into the child's record.</p>
            <div className="score-line"><span style={{ color: 'var(--green)' }}>●</span> SCORE 8.5/10 &nbsp;·&nbsp; SYNCED TO TML &nbsp;·&nbsp; PARENT NOTIFIED</div>
          </div>
          <div className="paper" id="paper">
            <div className="scan"></div>
            <div className="hw-line"><svg viewBox="0 0 300 16" preserveAspectRatio="none"><path d="M4 10 Q20 2 38 9 T74 8 T110 10 T146 7 T182 10 T218 8 T254 9 T292 8"/></svg><span className="mark mk-g m1">✓</span></div>
            <div className="hw-line"><svg viewBox="0 0 300 16" preserveAspectRatio="none"><path d="M4 8 Q22 14 40 8 T78 9 T114 7 T150 10 T186 8 T222 10 T258 7 T292 9"/></svg><span className="mark mk-g m2">✓</span></div>
            <div className="hw-line"><svg viewBox="0 0 300 16" preserveAspectRatio="none"><path d="M4 9 Q18 3 36 10 T72 8 T108 9 T144 8 T180 10 T216 7 T252 10 T288 8"/></svg><span className="mark mk-r m3">✕</span></div>
            <div className="hw-line"><svg viewBox="0 0 300 16" preserveAspectRatio="none"><path d="M4 10 Q24 4 42 9 T80 10 T116 8 T152 9 T188 7 T224 10 T260 8 T292 10"/></svg><span className="mark mk-g m4">✓</span></div>
            <div className="hw-line"><svg viewBox="0 0 300 16" preserveAspectRatio="none"><path d="M4 8 Q20 13 38 8 T76 9 T112 10 T148 8 T184 9 T220 8 T256 10 T292 8"/></svg><span className="mark mk-g m5">✓</span></div>
            <div className="hw-line"><svg viewBox="0 0 300 16" preserveAspectRatio="none"><path d="M4 9 Q22 3 40 10 T78 8 T114 9 T150 7 T186 10 T222 9 T258 8 T290 9"/></svg><span className="mark mk-g m6">✓</span></div>
            <div className="stampd">✓ GRADED · 27.4s</div>
          </div>
        </div>
      </section>

      <section className="tml" id="tml">
        <div className="wrap tml-g">
          <div className="rv">
            <span className="tm-badge">★ TRUE MASTERY LEVEL™ — ONLY ON STHARA</span>
            <h2 style={{ fontSize: 'clamp(30px,4.2vw,50px)', letterSpacing: '-.03em', marginBottom: 18 }}>One score that's actually <span className="grad-txt">alive.</span></h2>
            <p style={{ color: 'var(--dim)', fontSize: 17.5, maxWidth: '50ch' }}>Not an exam-day snapshot. TML builds continuously from classwork, AI-graded homework confirmed by the teacher, quizzes and tutor engagement — all read against attendance.</p>
            <p style={{ color: 'var(--dim)', fontSize: 17.5, maxWidth: '50ch', marginTop: 14 }}>Teachers see a topic-level heatmap: exactly which concepts a class has mastered and which are slipping — so intervention happens in the week it matters, not at term end.</p>
          </div>
          <div className="gauge-card rv">
            <div className="gauge-top">
              <div className="gauge">
                <svg width="180" height="180" viewBox="0 0 180 180">
                  <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#2F6BFF"/><stop offset="55%" stopColor="#4C8DFF"/><stop offset="100%" stopColor="#8FBCFF"/>
                  </linearGradient></defs>
                  <circle className="g-bg" cx="90" cy="90" r="70"/>
                  <circle className="g-fg" cx="90" cy="90" r="70"/>
                </svg>
                <div className="g-num"><div><b data-count="87">0</b><span>TML · AARAV S.</span></div></div>
              </div>
              <ul className="g-meta">
                <li><span>Algebra — linear eq.</span><b style={{ color: 'var(--azure2)' }}>94 · Mastered</b></li>
                <li><span>Physics — motion</span><b style={{ color: 'var(--amber)' }}>68 · Developing</b></li>
                <li><span>English — comp.</span><b style={{ color: 'var(--green)' }}>88 · Mastered</b></li>
                <li><span>Homework graded</span><b>41 / 44</b></li>
              </ul>
            </div>
            <div className="hm-title">Class heatmap · Grade 8B · 28 topics</div>
            <div className="hm" id="hm"></div>
            <div className="legend"><i style={{ background: 'rgba(244,94,119,.85)' }}></i>Struggling <i style={{ background: 'rgba(245,182,11,.8)' }}></i>Developing <i style={{ background: 'rgba(52,211,153,.8)' }}></i>Strong <i style={{ background: 'rgba(76,141,255,.9)' }}></i>Mastered</div>
          </div>
        </div>
      </section>

      <section id="wellness">
        <div className="wrap">
          <div className="head rv">
            <span className="kick">First to the mandate</span>
            <h2>CBSE's 2026 wellness circular? <span className="grad-txt">Already handled.</span></h2>
            <p>CBSE now asks schools to track wellbeing and social-emotional learning, not just marks. Most schools are doing it on paper. Sthara generates it from signals already in the platform.</p>
          </div>
          <div className="bento rv">
            <div className="b-card"><div className="ic">🧭</div><h4>NEP 2020-aligned record</h4><p>Every child's learning record structured to NEP 2020, out of the box — no retrofitting.</p></div>
            <div className="b-card"><div className="ic">💚</div><h4>SEL beside academics</h4><p>Wellbeing and social-emotional signals tracked alongside marks, from real engagement data.</p></div>
            <div className="b-card"><div className="ic">📄</div><h4>CBSE-format report, auto</h4><p>A ready wellness report per student, generated in the exact format CBSE expects.</p></div>
            <div className="b-card"><div className="ic">🤝</div><h4>Counsellor-ready summaries</h4><p>Whole-class summaries so counsellors know where to look first, every week.</p></div>
          </div>
          <p className="mandate-line rv">Compliance becomes <em>a download</em> — not a project.</p>
        </div>
      </section>

      <section id="how" style={{ paddingTop: 40 }}>
        <div className="wrap">
          <div className="head rv">
            <span className="kick">Onboarding</span>
            <h2>Live in under 10 minutes.</h2>
          </div>
          <div className="steps-g rv">
            <div className="st"><div className="n">1</div><h4>Register the school</h4><p>Create the admin account and enter school details.</p></div>
            <div className="st"><div className="n">2</div><h4>Add teachers &amp; students</h4><p>Import the roster straight from the dashboard.</p></div>
            <div className="st"><div className="n">3</div><h4>Create assignments</h4><p>Teachers set homework with AI-assisted questions.</p></div>
            <div className="st"><div className="n">4</div><h4>Watch mastery build</h4><p>Submissions graded instantly. Scores update live.</p></div>
          </div>
        </div>
      </section>

      <section id="pricing" style={{ paddingTop: 60 }}>
        <div className="wrap">
          <div className="head rv">
            <span className="kick">Pricing</span>
            <h2>Four tiers. <span className="grad-txt">One pillar each.</span></h2>
            <p>Priced per student, per year, billed annually to the school. Every tier includes the AI tutor, the teacher copilot, the full ERP, the parent portal and live TML — the tiers differ on usage limits and admin-side AI.</p>
          </div>
          <div className="price-g rv">

            <div className="pc">
              <div className="pc-in">
                <span className="plan">Aadhara</span>
                <span className="gloss">The foundation</span>
                <div className="amt"><b>₹2,000</b></div>
                <div className="inr">per student / year · billed annually</div>
                <ul>
                  <li><b>✓</b> AI tutor — standard exchange limits</li>
                  <li><b>✓</b> Teacher copilot &amp; handwriting grading</li>
                  <li><b>✓</b> Full ERP + parent WhatsApp updates</li>
                  <li><b>✓</b> TML live for every student</li>
                  <li className="no"><b>—</b> Fixed usage limits</li>
                  <li className="no"><b>—</b> No admin-side AI</li>
                </ul>
                <a href="#/contact" className="btn btn-dark btn-sm" style={{ alignSelf: 'flex-start' }}>Enquire →</a>
              </div>
            </div>

            <div className="pc">
              <div className="pc-in">
                <span className="plan">Sthamba</span>
                <span className="gloss">The pillar</span>
                <div className="amt"><b>₹2,500</b></div>
                <div className="inr">per student / year · billed annually</div>
                <ul>
                  <li><b>✓</b> Everything in Aadhara</li>
                  <li><b>✓</b> Increased tutor exchanges</li>
                  <li><b>✓</b> Usage limits extendable on request</li>
                  <li><b>✓</b> NEP record &amp; CBSE wellness report</li>
                  <li className="no"><b>—</b> No admin-side AI</li>
                </ul>
                <a href="#/contact" className="btn btn-dark btn-sm" style={{ alignSelf: 'flex-start' }}>Enquire →</a>
              </div>
            </div>

            <div className="pc hot">
              <span className="ribbon">RECOMMENDED</span>
              <div className="pc-in">
                <span className="plan">Shikhara</span>
                <span className="gloss">The summit</span>
                <div className="amt"><b>₹3,500</b></div>
                <div className="inr">per student / year · billed annually</div>
                <ul>
                  <li><b>✓</b> The full Sthara promise</li>
                  <li><b>✓</b> Full admin-side AI — reports, at-risk flags</li>
                  <li><b>✓</b> Highest usage limits, extendable</li>
                  <li><b>✓</b> Priority support &amp; staff training</li>
                  <li><b>✓</b> Every feature on this site</li>
                </ul>
                <a href="#/contact" className="btn btn-hot btn-sm" style={{ alignSelf: 'flex-start' }}>Book a pilot →</a>
              </div>
            </div>

            <div className="pc">
              <div className="pc-in">
                <span className="plan">Mandala</span>
                <span className="gloss">Many pillars, one design</span>
                <div className="amt"><b style={{ fontSize: 32 }}>Custom</b></div>
                <div className="inr">school groups &amp; trusts · volume priced</div>
                <ul>
                  <li><b>✓</b> Everything in Shikhara</li>
                  <li><b>✓</b> Token usage on tap — beyond limits</li>
                  <li><b>✓</b> Cross-campus mastery analytics</li>
                  <li><b>✓</b> Centralised wellness compliance</li>
                  <li><b>✓</b> Custom rollout &amp; training support</li>
                </ul>
                <a href="mailto:sales@sthara.in?subject=Mandala%20enquiry%20%E2%80%94%20school%20group" className="btn btn-dark btn-sm" style={{ alignSelf: 'flex-start' }}>Talk to sales →</a>
              </div>
            </div>

          </div>

          <div className="pilot rv">
            <div className="pilot-in">
              <div>
                <span className="mk">★ Instead of a free trial</span>
                <h4>The paid pilot.</h4>
                <p>One grade. One term. Fully paid — and <b style={{ color: '#fff' }}>100% credited to your first annual invoice</b> when you convert. You see real marks on real handwriting from your own students before you commit the school.</p>
              </div>
              <a href="#/contact" className="btn btn-hot">Book a paid pilot →</a>
            </div>
          </div>

          <div className="calc rv">
            <div className="calc-h">
              <h4>What will it cost my school?</h4>
              <span>Live estimate · indicative only</span>
            </div>
            <div className="calc-g">
              <div>
                <div className="ctl">
                  <label>Students on the platform <b id="cStu">500</b></label>
                  <input type="range" id="rStu" min="50" max="5000" step="25" defaultValue="500" />
                </div>
                <div className="ctl">
                  <label style={{ marginBottom: 12 }}>Tier</label>
                  <div className="seg" id="cSeg">
                    <button data-p="2000" data-n="Aadhara">Aadhara</button>
                    <button data-p="2500" data-n="Sthamba">Sthamba</button>
                    <button className="on" data-p="3500" data-n="Shikhara">Shikhara</button>
                    <button data-p="0" data-n="Mandala">Mandala</button>
                  </div>
                </div>
              </div>
              <div className="calc-out">
                <div className="cap">Annual invoice to the school</div>
                <div className="big" id="cTotal">₹17,50,000</div>
                <ul>
                  <li><span>Tier</span><b id="cTier">Shikhara · ₹3,500</b></li>
                  <li><span>Per student / month</span><b id="cPm">₹292</b></li>
                  <li><span>Per student / year</span><b id="cPy">₹3,500</b></li>
                  <li><span>Per class of 40</span><b id="cUsd">₹1,40,000</b></li>
                </ul>
                <p className="calc-note" id="cNote">Indicative list pricing, billed annually to the school. Final quotation depends on term, tier and rollout scope.</p>
              </div>
            </div>
          </div>

          <div className="trust-row rv">
            <span>BUILT FOR DPDP ACT 2023</span><span>NEP 2020 ALIGNED</span><span>CBSE WELLNESS READY</span><span>HOSTED IN INDIA</span><span>ROLE-BASED ACCESS</span>
          </div>
        </div>
      </section>

      <section className="final">
        <div className="glow"></div>
        <svg className="final-pillar" viewBox="0 0 96 116"><use href="#pillar-logo"/></svg>
        <div className="wrap">
          <span className="kick" style={{ justifyContent: 'center' }}>Ready when you are</span>
          <h2>Be the school the <span className="grad-txt">others copy.</span></h2>
          <p>One living record for every child. Hours back for every teacher. Real sight for every parent. Sthara — Telugu for "central pillar".</p>
          <a href="#/contact" className="btn btn-hot" style={{ fontSize: 17, padding: '18px 40px' }}>Book your paid pilot →</a>
          <div className="hero-note" style={{ opacity: 1, animation: 'none', marginTop: 22 }}>One grade · One term · 100% credited on conversion</div>
        </div>
      </section>

      </div>{/* /page-home */}

      {/* ================================= PAGE: ABOUT US ================================= */}
      <div className="page" id="page-about">

      <section className="p-hero">
        <div className="wrap">
          <span className="kick">About us</span>
          <h1>A child falling behind should never be <span className="grad-txt">a surprise.</span></h1>
          <p>Sthara is a unified school operating system for Indian K-12 schools. One living record that the student, the teacher, the office and the parent all read from — so a slipping topic surfaces in the week it slips, not at the end of term.</p>
          <div className="p-meta"><span>Built in India</span><span>K-12 · CBSE</span><span>NEP 2020 aligned</span><span>Founder-led</span></div>
        </div>
      </section>

      <section style={{ padding: '90px 0 50px' }}>
        <div className="wrap">
          <div className="doc">
            <div className="doc-nav rv">
              <div className="t">On this page</div>
              <a href="#/about#ab-why">Why Sthara exists</a>
              <a href="#/about#ab-leadership">The people behind it</a>
              <a href="#/about#ab-principles">What we believe</a>
              <a href="#/about#ab-now">Working with us</a>
              <a href="#/contact">Talk to us</a>
            </div>
            <div className="prose rv">
              <h3 id="ab-why">Why Sthara exists</h3>
              <p>In most schools a child's difficulty only becomes visible once it has become a mark. One topic doesn't land. The next chapter assumes it did. By the time anyone measures the gap it has compounded into a result nobody can undo — and no one was negligent, there was simply nothing in the room that was watching.</p>
              <p>Our founder lived exactly that as a student, then built the system he wished had existed. It is why the <b>True Mastery Level</b> sits at the centre of Sthara rather than at the edge: one live score per child, built from real classwork, that surfaces a slipping topic while there is still term left to fix it.</p>
              <div className="callout good">
                <b>What we do, in one line.</b> We replace the spreadsheet, the WhatsApp group, the tutoring app and the paper register with a single living record that every role in the school reads from.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '20px 0 40px' }}>
        <div className="wrap">
          <div className="head rv" style={{ marginBottom: 34 }}>
            <span className="kick" id="ab-leadership">The people behind it</span>
            <h2 style={{ fontSize: 'clamp(28px,3.8vw,42px)' }}>Three founders. One of them wrote the platform.</h2>
          </div>

          <div className="founder rv">
            <div className="founder-in">
              <div className="av">HV</div>
              <div>
                <h2 className="p-name">Harsha Vardhan Varma Payala</h2>
                <span className="p-role">★ Founder &amp; creator of Sthara · President &amp; CEO</span>
                <div className="p-edu"><i>🎓</i><span><b>B.Tech, Computer Science</b></span></div>
                <div className="p-body">
                  <p>Harsha designed and built the Sthara platform — the AI tutor, the handwriting-grading pipeline and the True Mastery Level engine. He was the student who fell behind on a topic nobody caught in time, and he built Sthara so that it does not happen quietly to anyone else.</p>
                  <p>His standard runs through the whole product: the tutor asks a student what they have already tried before it explains anything, and no AI-generated mark enters a child's record until a teacher has confirmed it.</p>
                </div>
                <div className="p-tags"><span>Platform architect</span><span>Handwriting OCR</span><span>True Mastery Level</span><span>Product direction</span></div>
              </div>
            </div>
          </div>

          <div className="people-g rv">
            <div className="person">
              <div className="av alt">MB</div>
              <h2 className="p-name" style={{ marginTop: 20 }}>Moses Benhur</h2>
              <span className="p-role">Co-founder · Managing Director &amp; CFO</span>
              <div className="p-edu"><i>🎓</i><span><b>M.S. Computer Science, University of Bridgeport</b></span></div>
              <div className="p-body">
                <p>An engineer in the finance seat. Moses sets how Sthara is priced and holds it to a single test: an ordinary school should get the same platform as a flagship one, at a price it can actually pay.</p>
              </div>
              <div className="p-tags"><span>Commercial model</span><span>Partnerships</span><span>Finance</span></div>
            </div>

            <div className="person">
              <div className="av alt">JS</div>
              <h2 className="p-name" style={{ marginTop: 20 }}>Joshua Stephen</h2>
              <span className="p-role">Co-founder · Chief Operating Officer</span>
              <div className="p-edu"><i>🎓</i><span><b>B.Sc. Biotechnology &amp; Genetics, GITAM University</b> — research in behavioural psychology</span></div>
              <div className="p-body">
                <p>Joshua came to education through behaviour rather than software. He leads how Sthara is rolled out inside a school, and is the reason wellbeing is treated here as real, kept data a counsellor can act on — not a box ticked for a circular.</p>
              </div>
              <div className="p-tags"><span>School rollout</span><span>Onboarding &amp; training</span><span>Wellbeing programme</span></div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '70px 0 110px' }}>
        <div className="wrap">
          <div className="head rv" style={{ marginBottom: 38 }}>
            <span className="kick" id="ab-principles">What we believe</span>
            <h2 style={{ fontSize: 'clamp(28px,3.8vw,42px)' }}>Four things we won't trade away.</h2>
          </div>
          <div className="principles rv">
            <div className="pr"><div className="n">01</div><h4>Student outcomes before margin</h4><p>When a feature is good for the child and neutral for revenue, it still ships. Our entry tier exists so mainstream schools get the same platform as elite ones.</p></div>
            <div className="pr"><div className="n">02</div><h4>One record, never four</h4><p>Every module writes to the same living record. We won't ship a feature that creates a second version of the truth about a child.</p></div>
            <div className="pr"><div className="n">03</div><h4>Teacher time is sacred</h4><p>AI earns its place by giving hours back — grading, lesson prep, report drafting. If it adds a step for a teacher, it doesn't ship.</p></div>
            <div className="pr"><div className="n">04</div><h4>Children's data is children's data</h4><p>Role-based access, audit trails, Indian data residency, and no advertising to children — ever. See our <a href="#/dpdp" className="lk" style={{ color: 'var(--azure2)' }}>DPDP architecture</a>.</p></div>
          </div>

          <div className="prose rv" style={{ marginTop: 70, maxWidth: '74ch' }}>
            <h3 id="ab-now">Working with us</h3>
            <p>Sthara is founder-led, and we intend to keep it that way. When your school contacts us you reach a founder — not a ticket queue — and every school on the platform keeps a direct line to one of us for as long as they are with us.</p>
            <div className="callout">
              <b>Where to start.</b> New school enquiries, demos and pilots go to Sales and Operations. Partnership, contract and finance conversations go to our COO and CFO. Both routes are on the <a href="#/contact" className="lk">contact page</a>.
            </div>
          </div>
        </div>
      </section>

      </div>{/* /page-about */}

      {/* ================================= PAGE: PRIVACY POLICY ================================= */}
      <div className="page" id="page-privacy">

      <section className="p-hero">
        <div className="wrap">
          <span className="kick">Legal</span>
          <h1>Privacy Policy</h1>
          <p>How Sthara collects, uses, stores and protects personal data — including the personal data of children — across the Sthara School OS platform.</p>
          <div className="p-meta"><span className="eff">Effective 26 July 2026</span><span className="eff">Version 2.0</span><span className="eff">Applies to sthara.in &amp; the Sthara app</span></div>
        </div>
      </section>

      <section style={{ padding: '80px 0 110px' }}>
        <div className="wrap">
          <div className="doc">
            <div className="doc-nav rv">
              <div className="t">Contents</div>
              <a href="#/privacy#pp-who">1 · Who we are</a>
              <a href="#/privacy#pp-roles">2 · Our role vs. the school's</a>
              <a href="#/privacy#pp-collect">3 · What we collect</a>
              <a href="#/privacy#pp-why">4 · Why we process it</a>
              <a href="#/privacy#pp-children">5 · Children's data</a>
              <a href="#/privacy#pp-ai">6 · AI processing</a>
              <a href="#/privacy#pp-never">7 · What we never do</a>
              <a href="#/privacy#pp-share">8 · Who we share with</a>
              <a href="#/privacy#pp-residency">9 · Where data is stored</a>
              <a href="#/privacy#pp-retention">10 · Retention &amp; deletion</a>
              <a href="#/privacy#pp-security">11 · Security</a>
              <a href="#/privacy#pp-rights">12 · Your rights</a>
              <a href="#/privacy#pp-grievance">13 · Grievance redressal</a>
              <a href="#/privacy#pp-changes">14 · Changes</a>
            </div>

            <div className="prose rv">
              <div className="callout">
                <b>In one paragraph.</b> Sthara processes school data so a school can run itself and see how each child is doing. The school decides what is collected and why; we process it on the school's written instruction. We do not sell data, we do not advertise to children, we do not profile children for commercial purposes, and we store data in India.
              </div>

              <h3 id="pp-who">1 · Who we are</h3>
              <p>Sthara ("Sthara", "we", "us") operates the Sthara School OS — a unified school operating system for K-12 schools in India, available at <b>sthara.in</b> and through the Sthara application. This policy covers the website, the application, and all four role experiences (student, teacher, administrator, parent).</p>
              <p>For any question about this policy, write to <a href="mailto:coo@sthara.in" className="lk">coo@sthara.in</a>.</p>

              <h3 id="pp-roles">2 · Our role, and the school's role</h3>
              <p>Under India's <b>Digital Personal Data Protection Act, 2023 ("DPDP Act")</b> the allocation of responsibility matters, so we state it plainly:</p>
              <table className="tbl">
                <thead>
                  <tr><th>Party</th><th>Role under the DPDP Act</th><th>What that means</th></tr>
                </thead>
                <tbody>
                  <tr><td><b>The school</b></td><td>Data Fiduciary</td><td>Decides which student, parent and staff data is collected, for what purpose, and obtains the required consent from parents and guardians.</td></tr>
                  <tr><td><b>Sthara</b></td><td>Data Processor</td><td>Processes that data only on the school's instruction, under a written contract, for the purpose of delivering the platform.</td></tr>
                  <tr><td><b>Student / parent / staff</b></td><td>Data Principal</td><td>The individual whose personal data is processed, holding the rights set out in section 12 below.</td></tr>
                </tbody>
              </table>
              <p>Because the school is the Data Fiduciary, requests to access, correct or erase a child's data are raised with the school, which we then action. We do not independently make decisions about a child's data.</p>
            </div>
          </div>
        </div>
      </section>

      </div>{/* /page-privacy */}

      {/* ================================= PAGE: DPDP ================================= */}
      <div className="page" id="page-dpdp">

      <section className="p-hero">
        <div className="wrap">
          <span className="kick">Trust</span>
          <h1>Built for the <span className="grad-txt">DPDP Act, 2023.</span></h1>
          <p>India's Digital Personal Data Protection Act sets the rules for handling personal data — and sets a higher bar again for the personal data of children. Almost every Data Principal on our platform is a child. This page sets out, obligation by obligation, how Sthara is architected against that Act.</p>
          <div className="p-meta"><span>DPDP Act 2023</span><span>Children's data · s.9</span><span>Hosted in India</span><span>Role-based access</span></div>
        </div>
      </section>

      <section style={{ padding: '80px 0 110px' }}>
        <div className="wrap">
          <div className="doc">
            <div className="doc-nav rv">
              <div className="t">Contents</div>
              <a href="#/dpdp#dp-act">What the Act requires</a>
              <a href="#/dpdp#dp-who">Who is who</a>
              <a href="#/dpdp#dp-map">Obligation → architecture</a>
              <a href="#/dpdp#dp-children">The children's clause</a>
              <a href="#/dpdp#dp-residency">Data residency</a>
              <a href="#/dpdp#dp-sub">Sub-processors</a>
              <a href="#/dpdp#dp-open">Sensitive features</a>
              <a href="#/dpdp#dp-school">What the school must do</a>
              <a href="#/privacy">Privacy Policy</a>
            </div>

            <div className="prose rv">
              <div className="callout warn">
                <b>How to read this page.</b> Compliance under the DPDP Act is a shared obligation: the school is the Data Fiduciary, Sthara is the Data Processor. This page sets out precisely what we have built on our side of that line, so your board can see what it is getting before it signs. It describes our architecture and is not legal advice.
              </div>

              <h3 id="dp-act">What the Act requires</h3>
              <p>The <b>Digital Personal Data Protection Act, 2023</b> governs the processing of digital personal data in India.</p>
            </div>
          </div>
        </div>
      </section>

      </div>{/* /page-dpdp */}

      {/* ================================= PAGE: CONTACT US ================================= */}
      <div className="page" id="page-contact">

      <section className="p-hero">
        <div className="wrap">
          <span className="kick">Contact us</span>
          <h1>Let's talk about <span className="grad-txt">your school.</span></h1>
          <p>Tell us where you are and we'll take it from there — a demo, a paid pilot, or just a straight answer about whether Sthara fits what you're trying to do.</p>
          <div className="p-meta"><span>Reply within 1 working day</span><span>Mon–Sat · IST</span><span>India</span></div>
        </div>
      </section>

      <section style={{ padding: '80px 0 30px' }}>
        <div className="wrap">
          <div className="desks rv">

            <div className="desk sal">
              <div className="desk-in">
                <span className="dl">◆ For schools</span>
                <h3>Talk to us about Sthara</h3>
                <p>Demos, paid pilots, pricing, and getting your school live. If you're already with us, this reaches your team too.</p>
                <a className="mailrow" href="mailto:sales@sthara.in?subject=Enquiry%20%E2%80%94%20Sthara%20for%20our%20school">
                  <span className="who">Schools</span>
                  <span className="addr">sales@sthara.in</span>
                </a>
              </div>
            </div>

            <div className="desk biz">
              <div className="desk-in">
                <span className="dl">◆ For businesses &amp; partners</span>
                <h3>Business &amp; partnerships</h3>
                <p>Partnerships, commercial terms, contracts and invoicing — anything on the business side rather than the classroom.</p>
                <a className="mailrow" href="mailto:coo@sthara.in?subject=Business%20enquiry%20%E2%80%94%20Sthara">
                  <span className="who">Business</span>
                  <span className="addr">coo@sthara.in</span>
                </a>
              </div>
            </div>

          </div>
          <p style={{ textAlign: 'center', marginTop: 26, fontSize: 15, color: 'var(--faint)' }}>
            We reply within one working day, and pilots are usually scheduled the same week.
          </p>
        </div>
      </section>

      <section style={{ padding: '40px 0 110px' }}>
        <div className="wrap">
          <div className="head rv" style={{ marginBottom: 26, maxWidth: 640 }}>
            <span className="kick">Or send it from here</span>
            <h2 style={{ fontSize: 'clamp(26px,3.4vw,38px)' }}>Tell us what you need.</h2>
            <p style={{ fontSize: 16.5 }}>Fill this in and we'll get back to you within a working day.</p>
          </div>

          <form className="form rv" id="cform">
            <div className="fld">
              <label htmlFor="fType">What can we help with?</label>
              <select id="fType" defaultValue="sales|Demo request">
                <optgroup label="Our school">
                  <option value="sales|Demo request">Book a demo</option>
                  <option value="sales|Paid pilot booking">Book a paid pilot</option>
                  <option value="sales|Pricing and tiers">Pricing &amp; which tier fits us</option>
                  <option value="sales|School group or trust">We're a school group or trust</option>
                  <option value="ops|Getting started">Getting our school set up</option>
                  <option value="ops|Existing school support">We already use Sthara</option>
                </optgroup>
                <optgroup label="Business &amp; partnerships">
                  <option value="coo|Partnership enquiry">Partnership enquiry</option>
                  <option value="coo|Contract and commercial terms">Contracts &amp; commercial terms</option>
                  <option value="cfo|Invoicing and payment">Invoicing &amp; payments</option>
                  <option value="coo|Data protection query">Data protection query</option>
                </optgroup>
                <optgroup label="Something else">
                  <option value="sales|General enquiry">Something else</option>
                </optgroup>
              </select>
            </div>

            <div className="f-g">
              <div className="fld"><label htmlFor="fName">Your name</label><input id="fName" type="text" placeholder="Full name" /></div>
              <div className="fld"><label htmlFor="fRole">Your role</label><input id="fRole" type="text" placeholder="e.g. Principal, Trustee, Correspondent" /></div>
            </div>
            <div className="f-g">
              <div className="fld"><label htmlFor="fOrg">School / organisation</label><input id="fOrg" type="text" placeholder="School or group name" /></div>
              <div className="fld"><label htmlFor="fCount">Approx. students</label><input id="fCount" type="text" placeholder="e.g. 640" /></div>
            </div>
            <div className="f-g">
              <div className="fld"><label htmlFor="fEmail">Email</label><input id="fEmail" type="email" placeholder="you@school.edu.in" /></div>
              <div className="fld"><label htmlFor="fPhone">Phone (optional)</label><input id="fPhone" type="tel" placeholder="+91" /></div>
            </div>
            <div className="fld">
              <label htmlFor="fMsg">Your message</label>
              <textarea id="fMsg" placeholder="Tell us what you need. If you're booking a pilot, mention the grade and term you have in mind."></textarea>
            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="submit" className="btn btn-hot">Send enquiry →</button>
              <span style={{ fontSize: 13, color: 'var(--faint)' }}>Opens a pre-filled draft in your own mail app, so you can check it before it sends.</span>
            </div>
          </form>
        </div>
      </section>

      </div>{/* /page-contact */}

      </main>

      <footer>
        <div className="wrap">
          <div className="foot-top">
            <div className="foot-col">
              <div className="foot-brand">
                <svg className="pmark" viewBox="0 0 96 116" style={{ color: '#fff' }}><use href="#pillar-logo"/></svg>
                <span><span className="wordmark" style={{ fontSize: 14 }}>STHARA</span><span className="wm-sub">THE UNIFIED SCHOOL OS</span></span>
              </div>
              <p className="foot-tag">One living record for every child. Built in India, for Indian schools.</p>
            </div>
            <div className="foot-col">
              <div className="ct">Platform</div>
              <a href="#platform">Four roles</a>
              <a href="#demo">Live grading</a>
              <a href="#tml">True Mastery Level</a>
              <a href="#wellness">CBSE wellness</a>
              <a href="#pricing">Pricing &amp; tiers</a>
            </div>
            <div className="foot-col">
              <div className="ct">Company</div>
              <a href="#/about">About us</a>
              <a href="#/about#ab-leadership">Leadership</a>
              <a href="#/contact">Contact us</a>
              <a href="mailto:sales@sthara.in">Sales enquiries</a>
              <a href="mailto:coo@sthara.in">Business enquiries</a>
            </div>
            <div className="foot-col">
              <div className="ct">Trust &amp; legal</div>
              <a href="#/privacy">Privacy Policy</a>
              <a href="#/dpdp">DPDP Act 2023</a>
              <a href="#/privacy#pp-retention">Data retention</a>
              <a href="#/privacy#pp-grievance">Grievance redressal</a>
              <a href="#/dpdp#dp-residency">Data residency</a>
            </div>
          </div>
          <div className="foot-bot">
            <span className="copy">© 2026 STHARA · MADE FOR INDIA 🇮🇳</span>
            <span className="copy">STHARA — TELUGU FOR "CENTRAL PILLAR"</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
