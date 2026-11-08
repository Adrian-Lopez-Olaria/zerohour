/* =============================================================================
   globo-plano.js · respaldo SVG del globo (sin WebGL o si globe.gl tarda más de 9 s)
   Es el globo ortográfico del prototipo «Órbita», escrito para la CSP: todo con svg() y
   textContent, sin atributos style ni innerHTML; los colores van por clase CSS.
   Mismo comportamiento que el globo 3D: gira solo, se arrastra para girar (las flechas del teclado
   también giran) y flyTo(); sin zoom (altitud fija) y vuelta al giro a 1 s de soltar.
   ============================================================================= */
import { svg, clear } from './util/dom.js';
import { crearPlanificador, pesoDe } from './planificador.js';

const RAD = Math.PI / 180;
const SIZE = 560, PAD = 30, SPEED = 6.8, RESUME_MS = 1000, ZMIN = 1, ZMAX = 1.6;   // giro ~35% más rápido; zoom corto
// Disparos con el ritmo y el máximo del móvil (la vista plana es el respaldo de equipos modestos)
const SHOT_EVERY = 500, SHOT_MAX = 6, DASH = 0.35, FLASH_MS = 700;
// Bolitas del mismo tamaño (radio en unidades del viewBox de 560) y separación mínima entre centros
const DOT_R = 3.4, DOT_GAP = 1.15, HOT_R = 7;

/** Punto de la curva cuadrática a→c→b en s ∈ [0, 1]. */
const quad = (a, c, b, s) => ({ x: (1 - s) * (1 - s) * a.x + 2 * (1 - s) * s * c.x + s * s * b.x, y: (1 - s) * (1 - s) * a.y + 2 * (1 - s) * s * c.y + s * s * b.y });

function ortho(lat0, lon0, R, c) {
  const s0 = Math.sin(lat0 * RAD), c0 = Math.cos(lat0 * RAD);
  return (lat, lon) => {
    const p = lat * RAD, l = (lon - lon0) * RAD, cp = Math.cos(p);
    const cosc = s0 * Math.sin(p) + c0 * cp * Math.cos(l);
    return { x: c + R * cp * Math.sin(l), y: c - R * (c0 * Math.sin(p) - s0 * cp * Math.cos(l)), vis: cosc > 0, depth: cosc };
  };
}

/* Estrellas fijas (generador con semilla): siempre las mismas, solo fuera de la esfera */
function stars(R, c) {
  let seed = 7, sd = '', sb = '';
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    const x = rnd() * SIZE, y = rnd() * SIZE, big = rnd() > 0.88;
    if (Math.hypot(x - c, y - c) < R + 6) continue;
    const seg = `M${x.toFixed(1)} ${y.toFixed(1)}h0`;
    if (big) sb += seg; else sd += seg;
  }
  return [svg('path', { d: sd, class: 'gp-star' }), svg('path', { d: sb, class: 'gp-star gp-star--b' })];
}

/**
 * Monta el globo SVG en `host`. o: { land, markers, scale, labels:Set, tierOf, fmt, reduced, home,
 * onHover(m|null) }. Devuelve { rotate, flyTo, update(markers, scale, labels), stop }.
 */
export function mountFlatGlobe(host, o) {
  const st = { lat0: o.home.lat, lon0: o.home.lng, zoom: 1 };     // zoom corto ×1–×1,6
  let markers = o.markers, scale = o.scale, labels = o.labels, pairs = o.pairs || [];
  let auto = !o.reduced, idle = 0, last = 0, dirty = true, lastDraw = 0, raf = 0, fly = 0;
  let onZoomChange = () => {};
  // Disparos: pool fijo de SHOT_MAX objetos, un solo temporizador
  let plan = null, maxShare = 1, timer = 0, onScreen = true, fired = 0;
  const shots = Array.from({ length: SHOT_MAX }, () => ({ live: false, from: null, to: null, r: 0, born: 0, dur: 0 }));
  let flashes = [];
  let focus = null, drawn = [], over = false;   // país enfocado; bolitas pintadas (para el hover)
  function setPairs(pr) {
    pairs = pr || [];
    const ok = pairs.filter((p) => o.centroid(p.from_cc) && o.centroid(p.to_cc));
    maxShare = Math.max(1e-6, ...ok.map((p) => p.share));
    plan = crearPlanificador(ok);
  }
  setPairs(pairs);

  function draw() {
    const R = (SIZE / 2 - PAD) * st.zoom, c = SIZE / 2, P = ortho(st.lat0, st.lon0, R, c);
    const inView = (q) => q.x > -4 && q.x < SIZE + 4 && q.y > -4 && q.y < SIZE + 4;
    let d = '', dFar = '';
    for (const p of o.land || []) {
      const q = P(p.lat, p.lng);
      if (!q.vis || !inView(q)) continue;
      const seg = `M${q.x.toFixed(1)} ${q.y.toFixed(1)}h0`;
      if (q.depth < 0.28) dFar += seg; else d += seg;
    }
    let g = '';
    for (let la = -60; la <= 60; la += 30) { let f = true; for (let lo = -180; lo <= 180; lo += 3) { const q = P(la, lo); if (q.vis) { g += (f ? 'M' : 'L') + q.x.toFixed(1) + ' ' + q.y.toFixed(1); f = false; } else f = true; } }
    for (let lo = -180; lo < 180; lo += 30) { let f = true; for (let la = -84; la <= 84; la += 3) { const q = P(la, lo); if (q.vis) { g += (f ? 'M' : 'L') + q.x.toFixed(1) + ' ' + q.y.toFixed(1); f = false; } else f = true; } }
    const kids = [...stars(R, c),
      svg('circle', { cx: c, cy: c, r: R + 22, class: 'gp-atm' }),
      svg('circle', { cx: c, cy: c, r: R, class: 'gp-sphere' }),
      svg('path', { d: g, class: 'gp-grat' }),
      dFar ? svg('path', { d: dFar, class: 'gp-land gp-land--far' }) : null,
      svg('path', { d, class: 'gp-land' })];
    // Rayas de Cloudflare Radar (las mismas que el globo 3D). Solo si los dos extremos se ven.
    // Con reducir movimiento, las del top estáticas; si no, los disparos en curso.
    const ctrl = (qa, qb) => {                                          // curva hacia fuera
      const mx = (qa.x + qb.x) / 2, my = (qa.y + qb.y) / 2, dx = qb.x - qa.x, dy = qb.y - qa.y;
      const nl = Math.hypot(dx, dy) || 1, bend = Math.min(60, nl * 0.25);
      return { x: mx - dy / nl * bend, y: my + dx / nl * bend };
    };
    const touches = (a, b) => !focus || a === focus.cc || b === focus.cc;
    const cls = (rr, a, b) => 'gp-arc ' + (rr >= 0.5 ? 'gp-arc--hi' : 'gp-arc--mid') + (touches(a, b) ? '' : ' is-dim');
    // Con un país enfocado, todas sus rayas continuas (y en reducir movimiento, todas las del top)
    const still = o.reduced ? pairs : focus ? pairs.filter((p) => p.from_cc === focus.cc || p.to_cc === focus.cc) : [];
    {
      for (const pr of still) {
        const ca = o.centroid(pr.from_cc), cb = o.centroid(pr.to_cc);
        if (!ca || !cb || pr.from_cc === pr.to_cc) continue;
        const qa = P(ca[0], ca[1]), qb = P(cb[0], cb[1]);
        if (!qa.vis || !qb.vis || !inView(qa) || !inView(qb)) continue;
        const rr = Math.min(1, pesoDe(pr) / maxShare), c2 = ctrl(qa, qb);
        kids.push(svg('path', {
          d: `M${qa.x.toFixed(1)} ${qa.y.toFixed(1)}Q${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${qb.x.toFixed(1)} ${qb.y.toFixed(1)}`,
          class: cls(rr, pr.from_cc, pr.to_cc), 'stroke-width': (0.8 + rr * 2).toFixed(1),
        }));
      }
    }
    if (!o.reduced) {
      const now = performance.now();
      for (const sh of shots) {
        if (!sh.live) continue;
        const qa = P(sh.from[0], sh.from[1]), qb = P(sh.to[0], sh.to[1]);
        if (!qa.vis || !qb.vis || !inView(qa) || !inView(qb)) continue;
        const p = (now - sh.born) / sh.dur, head = Math.min(1, p), tail = Math.max(0, p - DASH);
        if (head <= tail) continue;
        const c2 = ctrl(qa, qb);
        let d = '';
        for (let i = 0; i <= 8; i++) { const q = quad(qa, c2, qb, tail + (head - tail) * i / 8); d += (i ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1); }
        kids.push(svg('path', { d, class: cls(sh.r, sh.fc, sh.tc), 'stroke-width': (0.8 + sh.r * 2).toFixed(1) }));
      }
      for (const f of flashes) {                                        // destello: anillo que crece y se apaga
        const q = P(f.at[0], f.at[1]), k = (now - f.born) / FLASH_MS;
        if (k < 0 || k >= 1 || !q.vis || !inView(q)) continue;
        kids.push(svg('circle', { cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: (3 + k * f.size).toFixed(1), 'stroke-opacity': (0.9 * (1 - k)).toFixed(2), class: 'gp-apulse gp--' + f.tier }));
      }
    }
    // Bolitas: todas del mismo tamaño, color = tramo (gris = sin actividad). En orden de actividad,
    // la que se toque con otra ya pintada se oculta hasta acercar el zoom.
    const boxes = [], lab = [], r = DOT_R, min2 = (2 * r * DOT_GAP) ** 2;
    drawn = [];
    markers.forEach((m, i) => {
      const q = P(m.lat, m.lon);
      if (!q.vis || !inView(q)) return;
      if (drawn.some((d) => (d.x - q.x) ** 2 + (d.y - q.y) ** 2 < min2)) return;
      drawn.push({ x: q.x, y: q.y, m });
      const tier = scale.tier(m.attacks);
      if (i < 5 && m.attacks > 0 && !o.reduced && st.zoom < 1.05) kids.push(svg('circle', { cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: (r + 2).toFixed(1), class: `gp-pulse gp-pulse--${i} gp--${tier}` }));
      kids.push(svg('circle', { cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: r.toFixed(1), class: `gp-m gp--${tier}` }));
      boxes.push([q.x - r, q.y - r, q.x + r, q.y + r]);
      if (labels.has(m)) lab.push({ q, r, m });
    });
    if (focus) {
      const q = P(focus.lat, focus.lon);
      if (q.vis && inView(q)) kids.push(svg('circle', { cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: HOT_R, class: `gp-m gp-m--hot gp--${scale.tier(focus.attacks)}` }));
    }
    // Etiquetas «CC 1179,5 k»: derecha, izquierda, arriba o abajo; si no caben, no se pintan
    const fs = 15, hit = (b) => boxes.some((x) => b[0] < x[2] && b[2] > x[0] && b[1] < x[3] && b[3] > x[1]);
    for (const { q, r, m } of lab) {
      const txt = `${m.cc} ${o.fmt(m.attacks)}`, w = txt.length * fs * 0.58, hh = fs * 1.1, gap = 5;
      for (const [x0, y0, anchor] of [[q.x + r + gap, q.y - hh / 2, 'start'], [q.x - r - gap - w, q.y - hh / 2, 'end'], [q.x - w / 2, q.y - r - gap - hh, 'middle'], [q.x - w / 2, q.y + r + gap, 'middle']]) {
        const b = [x0, y0, x0 + w, y0 + hh];
        if (hit(b)) continue;
        boxes.push(b);
        const tx = anchor === 'start' ? x0 : anchor === 'end' ? x0 + w : x0 + w / 2;
        kids.push(svg('text', { x: tx.toFixed(1), y: (y0 + hh * 0.8).toFixed(1), 'text-anchor': anchor, class: 'gp-lbl' }, [`${m.cc} `, svg('tspan', { class: 'gp-lbl__n', text: o.fmt(m.attacks) })]));
        break;
      }
    }
    const el = svg('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'gp' + (st.zoom > 1.01 ? ' is-zoomed' : ''), 'aria-hidden': 'true', focusable: 'false' }, kids);
    clear(host).appendChild(el);
    dirty = false;
    onZoomChange(st.zoom);
  }

  function pulse(ts) {
    if (o.reduced) return;
    host.querySelectorAll('.gp-pulse').forEach((p, i) => {
      if (!p.dataset.r) p.dataset.r = p.getAttribute('r');
      const ph = ((ts / 2800) + i * 0.2) % 1;
      p.setAttribute('r', (Number(p.dataset.r) * (1 + 2.4 * ph)).toFixed(1));
      p.setAttribute('stroke-opacity', (0.95 * (1 - ph)).toFixed(2));
    });
  }

  /* Un turno: caducan los disparos ya pasados, los que llegan sueltan su destello y, si hay
     hueco en el pool, dispara el par que diga el planificador. */
  function tick() {
    const now = performance.now();
    flashes = flashes.filter((f) => now - f.born < FLASH_MS);
    for (const sh of shots) {
      if (!sh.live) continue;
      if (!sh.flashed && now >= sh.born + sh.dur) { sh.flashed = true; flashes.push({ at: sh.to, born: now, tier: sh.r >= 0.5 ? 'hi' : 'mid', size: 8 + sh.r * 8 }); }
      if (now - sh.born >= sh.dur * (1 + DASH)) sh.live = false;
    }
    const free = plan && plan.size ? shots.find((s) => !s.live) : null;
    if (free) {
      const p = plan.siguiente(), r = Math.min(1, pesoDe(p) / maxShare);
      fired++;
      if (p.from_cc === p.to_cc) flashes.push({ at: o.centroid(p.from_cc), born: now, tier: r >= 0.5 ? 'hi' : 'mid', size: 12 + r * 10 });
      else Object.assign(free, { live: true, flashed: false, from: o.centroid(p.from_cc), to: o.centroid(p.to_cc), fc: p.from_cc, tc: p.to_cc, r, born: now, dur: Math.round(1800 - r * 600) });
    }
    dirty = true;
    if (o.onShots) o.onShots(true, fired);
  }
  function shotsRun() {
    const run = !o.reduced && onScreen && host.isConnected && document.visibilityState === 'visible' && !!plan && plan.size > 0;
    if (run === !!timer) return;
    if (run) timer = setInterval(tick, SHOT_EVERY);
    else { clearInterval(timer); timer = 0; }
    if (o.onShots) o.onShots(run, fired);
  }
  const io = new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); shotsRun(); });
  io.observe(host);
  document.addEventListener('visibilitychange', shotsRun);

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!host.isConnected || document.visibilityState !== 'visible') { last = 0; return; }
    const dt = last ? Math.min(100, ts - last) : 16; last = ts;
    if (auto) { st.lon0 = ((st.lon0 - SPEED * dt / 1000 + 540) % 360) - 180; dirty = true; }
    if (timer && (flashes.length || shots.some((s) => s.live))) dirty = true;   // trazos en vuelo
    if (dirty && ts - lastDraw > 33) { lastDraw = ts; draw(); }     // ~30 fps
    else pulse(ts);
  }

  const spin = (on) => { auto = on; if (o.onSpin) o.onSpin(on); };
  const hold = () => { spin(false); clearTimeout(idle); };
  // Con el puntero encima o un país enfocado no se reanuda el giro
  const release = () => { clearTimeout(idle); if (!o.reduced && !over && !focus) idle = setTimeout(() => spin(true), RESUME_MS); };

  /** Bolita pintada más cercana a un punto de pantalla (a menos de tol px de su borde). */
  function pickAt(cx, cy, tol) {
    const b = host.getBoundingClientRect(), k = SIZE / Math.max(1, b.width);
    const x = (cx - b.left) * k, y = (cy - b.top) * k, lim = (DOT_R + tol * k) ** 2;
    let best = null, bd = Infinity;
    for (const d of drawn) { const dd = (d.x - x) ** 2 + (d.y - y) ** 2; if (dd < lim && dd < bd) { bd = dd; best = d.m; } }
    return best;
  }
  const setZoom = (z) => { st.zoom = Math.max(ZMIN, Math.min(ZMAX, z)); dirty = true; };

  // Arrastre para girar y pellizco para el zoom corto (Pointer Events)
  const pts = new Map();
  let pinch0 = 0, zoom0 = 1;
  let down = null;
  host.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { over = true; hold(); } });
  host.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { over = false; o.onHover(null); release(); } });
  host.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !e.buttons) o.onHover(pickAt(e.clientX, e.clientY, 3)); });
  host.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse' };
    host.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); hold();
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = st.zoom; }
  });
  host.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; if (pinch0) setZoom(zoom0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0); return; }
    const k = 0.35 / st.zoom * (SIZE / Math.max(1, host.clientWidth));
    st.lon0 = ((st.lon0 - (e.clientX - prev[0]) * k + 540) % 360) - 180;
    st.lat0 = Math.max(-60, Math.min(70, st.lat0 + (e.clientY - prev[1]) * k));
    dirty = true;
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; if (!pts.size) release(); };
  host.addEventListener('pointerup', (e) => {
    const d = down; down = null;
    up(e);
    // Un toque/clic (sin arrastre): bolita → panel y flyTo; fuera de una bolita → se cierra
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 6 && o.onPick) o.onPick(pickAt(e.clientX, e.clientY, d.mouse ? 3 : 12), !d.mouse);
  });
  host.addEventListener('pointercancel', up);
  // La rueda sin Ctrl hace scroll de la página; con Ctrl, zoom corto
  host.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault(); hold(); setZoom(st.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); release();
  }, { passive: false });

  function flyTo(lat, lon) {
    hold(); cancelAnimationFrame(fly);
    const a0 = { lon: st.lon0, lat: st.lat0 }, t0 = performance.now(), T = o.reduced ? 1 : 900;   // sin zoom
    const dl = ((lon - a0.lon + 540) % 360) - 180, lat1 = Math.max(-60, Math.min(70, lat));
    const step = (ts) => {
      const k = Math.min(1, (ts - t0) / T), e2 = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      st.lon0 = ((a0.lon + dl * e2 + 540) % 360) - 180; st.lat0 = a0.lat + (lat1 - a0.lat) * e2; dirty = true;
      if (k < 1) fly = requestAnimationFrame(step); else release();
    };
    fly = requestAnimationFrame(step);
  }

  raf = requestAnimationFrame(frame);
  draw();
  if (o.onSpin) o.onSpin(auto);
  return {
    zoomBy(f) { hold(); setZoom(st.zoom * f); release(); },
    rotate(dLat, dLon) { hold(); st.lat0 = Math.max(-60, Math.min(70, st.lat0 + dLat)); st.lon0 = ((st.lon0 + dLon + 540) % 360) - 180; dirty = true; release(); },
    flyTo,
    update(ms, sc, lb, pr) { markers = ms; scale = sc; labels = lb; if (pr) setPairs(pr); shotsRun(); dirty = true; },
    focus(m) { focus = m || null; dirty = true; if (focus) hold(); else release(); },
    onZoom(fn) { onZoomChange = fn; fn(st.zoom); },
    zoomLimits: { min: ZMIN, max: ZMAX },
    stop() { cancelAnimationFrame(raf); clearInterval(timer); timer = 0; io.disconnect(); document.removeEventListener('visibilitychange', shotsRun); },
  };
}
