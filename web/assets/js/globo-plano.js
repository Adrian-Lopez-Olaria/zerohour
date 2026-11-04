/* =============================================================================
   globo-plano.js · respaldo SVG del globo (sin WebGL o si globe.gl tarda más de 9 s)
   Es el globo ortográfico del prototipo «Órbita», escrito para la CSP: todo con svg() y
   textContent, sin atributos style ni innerHTML; los colores van por clase CSS.
   Mismo comportamiento que el globo 3D: gira solo, arrastrar/pellizcar, zoom ×1–×3 con
   botones y Ctrl + rueda, teclado (flechas, + −, 0), flyTo() y vuelta al giro a los 3 s.
   ============================================================================= */
import { svg, clear } from './util/dom.js';

const RAD = Math.PI / 180;
const SIZE = 560, PAD = 30, SPEED = 5, RESUME_MS = 3000, ZMIN = 1, ZMAX = 3;

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
 * onHover(m|null) }. Devuelve { zoomBy, reset, flyTo, update(markers, scale, labels), setZoomButtons }.
 */
export function mountFlatGlobe(host, o) {
  const st = { lat0: o.home.lat, lon0: o.home.lng, zoom: 1 };
  let markers = o.markers, scale = o.scale, labels = o.labels;
  let auto = !o.reduced, idle = 0, last = 0, dirty = true, lastDraw = 0, raf = 0, fly = 0;
  let onZoomChange = () => {};

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
    const boxes = [], lab = [];
    markers.forEach((m, i) => {
      const q = P(m.lat, m.lon);
      if (!q.vis || !inView(q)) return;
      const r = 4 + scale.t(m.attacks) * 16;
      if (i < 5 && !o.reduced && st.zoom < 1.05) kids.push(svg('circle', { cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: r.toFixed(1), class: `gp-pulse gp-pulse--${i} gp--${scale.tier(m.attacks)}` }));
      const dot = svg('circle', { cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: r.toFixed(1), class: `gp-m gp--${scale.tier(m.attacks)}` });
      dot.addEventListener('pointerenter', () => o.onHover(m));
      dot.addEventListener('pointerleave', () => o.onHover(null));
      kids.push(dot);
      boxes.push([q.x - r, q.y - r, q.x + r, q.y + r]);
      if (labels.has(m)) lab.push({ q, r, m });
    });
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

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!host.isConnected || document.visibilityState !== 'visible') { last = 0; return; }
    const dt = last ? Math.min(100, ts - last) : 16; last = ts;
    if (auto) { st.lon0 = ((st.lon0 - SPEED * dt / 1000 + 540) % 360) - 180; dirty = true; }
    if (dirty && ts - lastDraw > 33) { lastDraw = ts; draw(); }     // ~30 fps
    else pulse(ts);
  }

  const spin = (on) => { auto = on; if (o.onSpin) o.onSpin(on); };
  const hold = () => { spin(false); clearTimeout(idle); };
  const release = () => { clearTimeout(idle); if (!o.reduced) idle = setTimeout(() => spin(true), RESUME_MS); };
  const setZoom = (z) => { st.zoom = Math.max(ZMIN, Math.min(ZMAX, z)); dirty = true; };

  // Arrastre y pellizco con Pointer Events (touch-action: none solo en el globo plano)
  const pts = new Map();
  let pinch0 = 0, zoom0 = 1;
  host.addEventListener('pointerdown', (e) => {
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
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', up);
  // D1: Ctrl + rueda hace zoom; la rueda sola sigue haciendo scroll de la página
  host.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault(); hold(); setZoom(st.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); release();
  }, { passive: false });

  function flyTo(lat, lon) {
    hold(); cancelAnimationFrame(fly);
    const a0 = { lon: st.lon0, lat: st.lat0, z: st.zoom }, t0 = performance.now(), T = o.reduced ? 1 : 900;
    const dl = ((lon - a0.lon + 540) % 360) - 180, lat1 = Math.max(-60, Math.min(70, lat)), z1 = Math.max(st.zoom, 1.6);
    const step = (ts) => {
      const k = Math.min(1, (ts - t0) / T), e2 = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      st.lon0 = ((a0.lon + dl * e2 + 540) % 360) - 180; st.lat0 = a0.lat + (lat1 - a0.lat) * e2; st.zoom = a0.z + (z1 - a0.z) * e2; dirty = true;
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
    reset() { hold(); st.lat0 = o.home.lat; st.lon0 = o.home.lng; st.zoom = 1; dirty = true; release(); },
    flyTo,
    update(ms, sc, lb) { markers = ms; scale = sc; labels = lb; dirty = true; },
    onZoom(fn) { onZoomChange = fn; fn(st.zoom); },
    zoomLimits: { min: ZMIN, max: ZMAX },
    stop() { cancelAnimationFrame(raf); },
  };
}
