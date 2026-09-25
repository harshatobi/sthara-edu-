/* Sthara's four roles share one foundation. Native, dependency-free canvas motion. */
(() => {
  'use strict';

  window.StharaHeroMotion?.destroy();
  const area = document.querySelector('.constellation');
  const canvas = document.getElementById('hero-orbits');
  const pillar = document.querySelector('.pillar-motion');
  const ctx = canvas?.getContext('2d', { alpha: true });
  if (!area || !canvas || !pillar || !ctx) {
    window.StharaHeroMotion = { setRole() {}, setTheme() {}, setPaused() {}, destroy() {} };
    return;
  }

  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  const TAU = Math.PI * 2;
  const roles = ['student', 'teacher', 'admin', 'parent'];
  const palettes = {
    dark: [[143,187,255], [104,213,193], [238,188,115], [235,160,184]],
    light: [[50,91,161], [29,118,106], [147,94,26], [156,67,98]]
  };
  // Restore the original three sweeping elliptical orbital planes.
  // Decorative brand motion, not a scientific model of an atom.
  const rings = [
    { radius: 220, tilt: 1.03, rotation: -.44, phase: .3, speed: .12, role: 0 },
    { radius: 184, tilt: .71, rotation: 1.08, phase: 2.5, speed: -.09, role: 1 },
    { radius: 234, tilt: 1.32, rotation: .23, phase: 4.1, speed: .075, role: 3 }
  ];
  const control = new AbortController();
  const listener = { signal: control.signal, passive: true };
  let theme = root.dataset.theme === 'light' ? 'light' : 'dark';
  let selected = Math.max(0, roles.indexOf(area.querySelector('[data-role].active')?.dataset.role || 'teacher'));
  let explicitPause = root.classList.contains('motion-paused');
  let inView = typeof IntersectionObserver === 'undefined';
  let pageSuspended = false;
  let destroyed = false;
  let dirty = true;
  let frame = 0;
  let previous = 0;
  let elapsed = 0;
  let flash = 0;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let bounds = null;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const weights = roles.map((_, index) => index === selected ? 1 : 0);
  let colors = palettes[theme].map((color) => [...color]);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const rgba = (color, alpha) => `rgba(${color[0] | 0},${color[1] | 0},${color[2] | 0},${alpha})`;
  const drawable = () => !destroyed && !pageSuspended && !document.hidden && inView && width > 0 && height > 0;
  const animated = () => drawable() && !explicitPause && !reduce.matches;

  function queue() {
    if (!frame && drawable()) frame = requestAnimationFrame(tick);
  }

  function reconcile() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    if (drawable() && (animated() || dirty)) queue();
  }

  function measure() {
    if (destroyed) return;
    bounds = area.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    const nextWidth = Math.max(1, Math.round(width * ratio));
    const nextHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    dirty = true;
    reconcile();
  }

  function orbitPoint(ring, angle) {
    const x = Math.cos(angle) * ring.radius;
    const y = Math.sin(angle) * ring.radius;
    const z = y * Math.sin(ring.tilt);
    const flatY = y * Math.cos(ring.tilt);
    const cos = Math.cos(ring.rotation);
    const sin = Math.sin(ring.rotation);
    const perspective = 900 / (900 + z);
    return {
      x: 300 + (x * cos - flatY * sin) * perspective,
      y: 235 + (x * sin + flatY * cos) * perspective,
      depth: .5 - z / (ring.radius * 2)
    };
  }

  function dot(x, y, color, opacity, radius = 2) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 5.5);
    glow.addColorStop(0, rgba(color, opacity * .55));
    glow.addColorStop(.3, rgba(color, opacity * .16));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 5.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(color, opacity);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }

  function drawRing(ring) {
    const color = colors[ring.role];
    const emphasis = weights[ring.role];
    // Twelve continuous sections provide depth shading without hundreds of strokes.
    for (let section = 0; section < 12; section++) {
      const angle = section / 12 * TAU;
      const depth = orbitPoint(ring, angle + Math.PI / 12).depth;
      ctx.beginPath();
      for (let step = 0; step <= 8; step++) {
        const p = orbitPoint(ring, angle + step / 96 * TAU);
        if (step === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.lineWidth = .65 + depth * .3 + emphasis * .2;
      ctx.strokeStyle = rgba(color, (theme === 'dark' ? .075 : .12) + depth * .09 + emphasis * .08);
      ctx.stroke();
    }
    for (let index = 0; index < 2; index++) {
      const particleRole = index === 1 && ring.role === 0 ? 2 : ring.role;
      const particleColor = colors[particleRole];
      const particleEmphasis = weights[particleRole];
      const angle = ring.phase + elapsed * ring.speed + index * Math.PI;
      const direction = Math.sign(ring.speed);
      const head = orbitPoint(ring, angle);
      for (let step = 0; step < 12; step++) {
        const from = orbitPoint(ring, angle - direction * (.30 - step * .025));
        const to = orbitPoint(ring, angle - direction * (.275 - step * .025));
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.lineWidth = .5 + step * .07 + particleEmphasis * .3;
        ctx.strokeStyle = rgba(particleColor, (.015 + step * .025) * (.65 + head.depth * .35));
        ctx.stroke();
      }
      const radius = 1.4 + head.depth * .55 + particleEmphasis * .45;
      dot(head.x, head.y, particleColor, index === 0 ? .83 : .62, radius);
    }
  }

  function draw() {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.scale(width / 600, height / 500);
    ctx.lineCap = 'round';
    const halo = ctx.createRadialGradient(300, 236, 20, 300, 236, 176);
    const centralColor = [0, 0, 0];
    weights.forEach((weight, index) => {
      centralColor.forEach((_, channel) => { centralColor[channel] += colors[index][channel] * weight; });
    });
    halo.addColorStop(0, rgba(centralColor, (theme === 'dark' ? .085 : .04) + flash * .035));
    halo.addColorStop(.5, rgba(centralColor, .024));
    halo.addColorStop(1, rgba(centralColor, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(100, 36, 400, 400);
    rings.forEach(drawRing);
    ctx.restore();

    // All animated DOM writes are batched here. The supplied mark is never morphed.
    const moving = animated();
    const float = moving ? Math.sin(elapsed * .7) * 2.2 : 0;
    const x = moving ? pointer.x * 3 : 0;
    const y = moving ? pointer.y * 2 : 0;
    pillar.style.transform = `translate3d(${x.toFixed(2)}px,${(float + y).toFixed(2)}px,0) rotateX(${(-pointer.y * 1.8).toFixed(2)}deg) rotateY(${(pointer.x * 2.4).toFixed(2)}deg)`;
    pillar.style.setProperty('--pillar-energy', (.12 + flash * .5).toFixed(3));
    dirty = false;
  }

  function tick(now) {
    frame = 0;
    if (!drawable()) { previous = 0; return; }
    if (animated()) {
      const dt = previous ? Math.min((now - previous) / 1000, .04) : 0;
      previous = now;
      elapsed += dt;
      const ease = 1 - Math.exp(-dt * 6);
      pointer.x += (pointer.targetX - pointer.x) * ease;
      pointer.y += (pointer.targetY - pointer.y) * ease;
      flash *= Math.exp(-dt * 2.8);
      weights.forEach((weight, index) => { weights[index] += ((selected === index ? 1 : 0) - weight) * ease; });
      colors.forEach((color, index) => color.forEach((value, channel) => {
        color[channel] += (palettes[theme][index][channel] - value) * ease;
      }));
    } else {
      pointer.x = pointer.y = 0;
      colors = palettes[theme].map((color) => [...color]);
      weights.forEach((_, index) => { weights[index] = selected === index ? 1 : 0; });
      flash = 0;
      previous = 0;
    }
    draw();
    if (animated()) queue();
  }

  function resetPointer() {
    pointer.targetX = 0;
    pointer.targetY = 0;
  }

  function setRole(role) {
    const next = roles.indexOf(role);
    if (destroyed || next < 0 || next === selected) return;
    selected = next;
    flash = 1;
    dirty = true;
    queue();
  }

  function setTheme(nextTheme) {
    if (destroyed || !palettes[nextTheme] || nextTheme === theme) return;
    theme = nextTheme;
    dirty = true;
    queue();
  }

  function setPaused(value) {
    if (destroyed) return;
    explicitPause = Boolean(value);
    resetPointer();
    dirty = true;
    reconcile();
  }

  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  const visibilityObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) dirty = true;
    else resetPointer();
    reconcile();
  }, { threshold: 0 });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    control.abort();
    resizeObserver?.disconnect();
    visibilityObserver?.disconnect();
    pillar.style.removeProperty('transform');
    pillar.style.removeProperty('--pillar-energy');
  }

  area.addEventListener('pointerenter', () => {
    if (!fine.matches || !animated()) return;
    bounds = area.getBoundingClientRect();
  }, listener);
  area.addEventListener('pointermove', (event) => {
    if (!fine.matches || !animated() || !bounds || !bounds.width || !bounds.height) return;
    pointer.targetX = clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
    pointer.targetY = clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1);
  }, listener);
  area.addEventListener('pointerleave', resetPointer, listener);
  area.addEventListener('pointercancel', resetPointer, listener);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetPointer();
    else dirty = true;
    reconcile();
  }, listener);
  reduce.addEventListener('change', () => { resetPointer(); dirty = true; reconcile(); }, listener);
  fine.addEventListener('change', resetPointer, listener);
  window.addEventListener('resize', measure, listener);
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) { destroy(); return; }
    pageSuspended = true;
    resetPointer();
    reconcile();
  }, listener);
  window.addEventListener('pageshow', () => {
    pageSuspended = false;
    measure();
  }, listener);

  window.StharaHeroMotion = { setRole, setTheme, setPaused, destroy };
  resizeObserver?.observe(area);
  visibilityObserver?.observe(area);
  measure();
})();
