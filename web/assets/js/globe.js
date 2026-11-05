/* =============================================================================
   globe.js · globo de origen de ataques «Órbita» (globe.gl autoalojado) + respaldo SVG
   - La librería se carga en diferido (tras load, en un hueco libre y cuando la zona se ve)
     con import() dinámico: no es un sink de Trusted Types, no hace falta ninguna política.
   - Sin WebGL, o si la librería/tierra no llegan en 9 s → globo SVG (globo-plano.js) con el
     mismo comportamiento.
   - Un marcador por país (suma de ataques, en su zona con más ataques), tamaño y tramo en
     escala logarítmica por tercios; anillos en los 5 primeros; etiquetas «CC 1179,5 k» para 6.
   - Gira solo (~5°/s). Arrastrar, las flechas del teclado o flyTo() lo paran y a 1 s de soltarlo
     vuelve a girar desde donde estaba. Sin zoom: altitud fija; la rueda siempre hace scroll de la
     página y el arrastre vertical en el móvil no bloquea el scroll (touch-action: pan-y).
   - prefers-reduced-motion: sin giro, sin pulsos y vuelo instantáneo.
   Las etiquetas y el tooltip se crean con createElement y textContent.
   ============================================================================= */
import { el, svg } from './util/dom.js';
import { nf, countryName, prefersReducedMotion } from './util/format.js';
import { mountFlatGlobe } from './globo-plano.js';

const LIB_URL = new URL('../vendor/globe.gl-2.46.2.zh.min.js', import.meta.url).href;
const LIB_CSS = new URL('../vendor/globe.gl-2.46.2.zh.css', import.meta.url).href;
const LAND_URL = new URL('../geo/tierra.json', import.meta.url).href;     // puntos: globo SVG
const LAND_TEX = new URL('../geo/tierra.png', import.meta.url).href;      // textura: globo 3D
const TIMEOUT_MS = 9000;
const ROTATE_SPEED = 0.8;                 // OrbitControls: ≈ 5°/s a 60 fps
const RESUME_MS = 1000;                    // vuelve a girar 1 s después de soltar
const HOME = { lat: 32, lng: -36 };
const MAX_LABELS = 6, MAX_RINGS = 5, LABEL_MIN_DEG = 9;
// = --map-hi / --map-mid / --map-lo (WebGL no lee variables CSS)
const TIER_HEX = { hi: '#FF8A5C', mid: '#FFC46B', lo: '#7FB8FF' };

const narrow = () => innerWidth < 760;
const S = { zone: null, mode: null, globe: null, flat: null, map: null, land: null, reduced: false, scheduled: false, markers: [], labels: new Set(), altHome: 1.8, idle: 0 };

/* ───────── escala: por país, logarítmica, por tercios (guía Órbita §1) ───────── */

/** Un marcador por país: suma de ataques e IPs, colocado en la zona de ese país con más ataques. */
export function countryMarkers(map) {
  const by = new Map();
  for (const p of (map ? map.points : [])) {
    let m = by.get(p.cc);
    if (!m) { m = { cc: p.cc, country: p.country, attacks: 0, sources: 0, lat: p.lat, lon: p.lon, best: -1 }; by.set(p.cc, m); }
    m.attacks += p.attacks;
    m.sources += p.sources;
    if (p.attacks > m.best) { m.best = p.attacks; m.lat = p.lat; m.lon = p.lon; }
  }
  return [...by.values()].sort((a, b) => b.attacks - a.attacks);
}

/** t = (log10(a+1) − min) / (max − min) con min y max de los países del día; tramos por tercios. */
export function makeScale(markers) {
  const v = markers.map((m) => Math.log10(m.attacks + 1));
  const lo = v.length ? Math.min(...v) : 0;
  const hi = v.length ? Math.max(...v, lo + 0.001) : 1;
  const t = (a) => Math.max(0, Math.min(1, (Math.log10(a + 1) - lo) / (hi - lo)));
  return {
    t,
    tier: (a) => { const x = t(a); return x > 0.66 ? 'hi' : x > 0.33 ? 'mid' : 'lo'; },
    size: (a) => Math.round((8 + t(a) * 24) * (narrow() ? 0.75 : 1)),
  };
}
let SCALE = makeScale([]);

/** «1179,5 k», «25,3 k», «875». */
export const kfmt = (v) => (v >= 1000 ? `${nf(v / 1000, 1)} k`.replace(/,0 k$/, ' k') : nf(v));

/** Texto del tooltip y de los botones de país: la misma unidad que el JSON y el pie del mapa. */
export const markerText = (m) => `${countryName(m.cc, m.country)}: ${nf(m.attacks)} ataques acumulados · ${nf(m.sources)} ${m.sources === 1 ? 'IP activa' : 'IPs activas'} (DShield)`;

/** Etiquetas: los 6 primeros que no queden a menos de 9° de otro ya etiquetado (NL/DE…). */
export function labelSet(markers) {
  const out = new Set(), placed = [];
  for (const m of markers) {
    if (out.size >= MAX_LABELS) break;
    if (placed.some((p) => Math.hypot(p.lat - m.lat, (p.lon - m.lon) * Math.cos(m.lat * Math.PI / 180)) < LABEL_MIN_DEG)) continue;
    out.add(m); placed.push(m);
  }
  return out;
}

function setData(map) {
  S.map = map;
  S.markers = countryMarkers(map);
  SCALE = makeScale(S.markers);
  S.labels = labelSet(S.markers);
}

/* ───────── tierra ───────── */

let landPromise = null;
function loadLand() {
  if (!landPromise) {
    landPromise = fetch(LAND_URL, { cache: 'force-cache' })
      .then((r) => { if (!r.ok) throw new Error(`tierra HTTP ${r.status}`); return r.json(); })
      .then((j) => decodeLand(String(j.filas || '')));
  }
  return landPromise;
}

/** «N:ini.long,…» por fila (base 36), de 81,75°N hacia el sur cada 1,5°. */
function decodeLand(filas) {
  const pts = [];
  filas.split('|').forEach((row, r) => {
    const [nS, runs] = row.split(':');
    const n = parseInt(nS, 36);
    if (!runs || !(n > 0)) return;
    const step = 360 / n, lat = 81.75 - r * 1.5;
    for (const run of runs.split(',')) {
      const [s, l] = run.split('.').map((x) => parseInt(x, 36));
      if (!Number.isFinite(s) || !Number.isFinite(l)) continue;
      for (let i = s; i < s + l; i++) pts.push({ lat, lng: -180 + (i + 0.5) * step });
    }
  });
  return pts;
}

/* ───────── utilidades ───────── */

function webglOK() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch (e) { return false; }
}

function withTimeout(promise, ms) {
  let t;
  return Promise.race([promise, new Promise((_, ko) => { t = setTimeout(() => ko(new Error('timeout')), ms); })]).finally(() => clearTimeout(t));
}

function loadLibCss() {
  if (document.querySelector('link[data-zh="globe-css"]')) return;
  document.head.appendChild(el('link', { rel: 'stylesheet', href: LIB_CSS, dataset: { zh: 'globe-css' } }));
}

/* ───────── giro automático: parar al tocar y volver a los 3 s ───────── */

function setAuto(on) {
  const spin = on && !S.reduced;
  if (S.globe) S.globe.controls().autoRotate = spin;
  if (S.zone) S.zone.dataset.spin = spin ? 'on' : 'off';
}
function hold() { clearTimeout(S.idle); setAuto(false); }
function release() {
  clearTimeout(S.idle);
  if (!S.reduced) S.idle = setTimeout(() => setAuto(true), RESUME_MS);
}

/* ───────── controles (teclado para girar y flyTo) para el globo 3D y el SVG ───────── */

/** Lleva el globo hasta un punto en 0,9 s SIN cambiar la altitud; luego, la regla de 1 s. */
export function flyTo(lat, lng) {
  if (S.mode === 'globe' && S.globe) {
    hold();
    S.globe.pointOfView({ lat, lng }, S.reduced ? 0 : 900);   // sin altitude: la altitud no cambia
    S.globe.resumeAnimation();
    release();
  } else if (S.mode === 'flat' && S.flat) S.flat.flyTo(lat, lng);
}

function rotate(dLat, dLng) {
  if (S.mode === 'globe' && S.globe) {
    hold();
    const p = S.globe.pointOfView();
    S.globe.pointOfView({ lat: Math.max(-60, Math.min(70, p.lat + dLat)), lng: p.lng + dLng }, S.reduced ? 0 : 300);
    S.globe.resumeAnimation();
    release();
  } else if (S.mode === 'flat' && S.flat) S.flat.rotate(dLat, dLng);
}

/** Teclado con el globo enfocado: solo las flechas giran (12°). Sin zoom. */
function onKey(e) {
  const k = e.key;
  if (k === 'ArrowLeft') rotate(0, -12);
  else if (k === 'ArrowRight') rotate(0, 12);
  else if (k === 'ArrowUp') rotate(12, 0);
  else if (k === 'ArrowDown') rotate(-12, 0);
  else return;
  e.preventDefault();
}

/** Tooltip «País: N ataques acumulados · N IPs activas (DShield)» encima del globo. */
function showTip(m) {
  const tip = S.zone && S.zone.querySelector('#globe-tip');
  if (tip) tip.textContent = m ? markerText(m) : '';
}

/* ───────── globo 3D ───────── */

function markerEl(m, i) {
  const node = el('div', { class: `gm gm--${SCALE.tier(m.attacks)}`, style: { '--s': `${SCALE.size(m.attacks)}px` } }, [
    i < MAX_RINGS ? el('span', { class: 'gm__ring' }) : null,
    el('span', { class: 'gm__dot', on: { pointerenter: () => showTip(m), pointerleave: () => showTip(null) } }),
    S.labels.has(m) ? el('span', { class: 'gm__lbl', dataset: { cc: m.cc } }, [m.cc, el('em', { text: ` ${kfmt(m.attacks)}` })]) : null,
  ]);
  return node;
}

function setGlobeData() {
  const ms = S.markers;
  S.globe
    .ringsData(S.reduced ? [] : ms.slice(0, MAX_RINGS))
    .htmlElementsData(ms)
    .htmlElement((m) => markerEl(m, ms.indexOf(m)));
}

/**
 * Etiquetas que no se pisan (guía §5.7): cada 0,5 s, en orden de ataques, se prueba derecha,
 * izquierda, arriba y abajo; si ninguna cabe sin tocar otra etiqueta o un marcador, se oculta.
 */
function placeLabels() {
  if (!S.zone || S.mode !== 'globe') return;
  const dots = [...S.zone.querySelectorAll('.gm__dot')].map((d) => d.getBoundingClientRect()).filter((r) => r.width);
  const placed = [], box = S.zone.getBoundingClientRect();
  // Choca con otra etiqueta o con un marcador, o se sale de la caja del globo (se cortaría)
  const out = (r) => r.left < box.left || r.right > box.right || r.top < box.top || r.bottom > box.bottom;
  const hit = (r) => out(r) || [...placed, ...dots].some((o) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top);
  for (const lbl of S.zone.querySelectorAll('.gm__lbl')) {
    lbl.classList.remove('is-off');
    let ok = false;
    for (const side of ['is-r', 'is-l', 'is-t', 'is-b']) {
      lbl.classList.remove('is-r', 'is-l', 'is-t', 'is-b');
      lbl.classList.add(side);
      const r = lbl.getBoundingClientRect();
      if (!r.width) { ok = true; break; }       // al otro lado del globo: no cuenta
      if (!hit(r)) { placed.push(r); ok = true; break; }
    }
    if (!ok) lbl.classList.add('is-off');
  }
}

/* La tierra del globo 3D es una TEXTURA estática (assets/geo/tierra.png, la genera
   scripts/textura_tierra.py a partir de tierra.json): antes se pintaba en un <canvas> al cargar y
   eso, más codificar el PNG, bloqueaba el hilo principal. Con pointsData eran ~4.800 geometrías. */

const pause = () => new Promise((r) => setTimeout(r, 0));   // cede el hilo entre pasos pesados

function baseAlt(host) {
  const r = host.clientWidth ? host.clientHeight / host.clientWidth : 1;
  return Math.max(1.8, 1.7 * r);
}

function createGlobe() {
  const Globe = globalThis.Globe;
  if (typeof Globe !== 'function') throw new Error('globe.gl no se registró');
  const host = S.zone.querySelector('#globe');
  S.altHome = baseAlt(host);
  const g = Globe({ animateIn: false })(host)
    .width(host.clientWidth).height(host.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .enablePointerInteraction(false)          // sin hover de la librería: ninguna ruta hacia innerHTML
    .showAtmosphere(true).atmosphereColor('#3B7BFF').atmosphereAltitude(0.18)
    .showGraticules(true)
    .globeImageUrl(LAND_TEX)
    .ringLat('lat').ringLng('lon').ringAltitude(0.003).ringPropagationSpeed(1.2).ringRepeatPeriod(2800)
    .ringColor((m) => { const c = TIER_HEX[SCALE.tier(m.attacks)]; return (t) => c + Math.round((1 - t) * 200).toString(16).padStart(2, '0'); })
    .ringMaxRadius((m) => 1.2 + SCALE.t(m.attacks) * 3.4)
    .htmlLat('lat').htmlLng('lon').htmlAltitude(0.01)
    .pointOfView({ ...HOME, altitude: S.altHome }, 0);
  S.globe = g;

  const mat = g.globeMaterial();
  // La textura ya trae el azul de la esfera (#0A1F44) y la tierra (#4F82D6): el material no la tiñe
  if (mat && mat.color) { mat.color.set('#ffffff'); if (mat.emissive) mat.emissive.set('#030914'); if ('shininess' in mat) mat.shininess = 3; }
  const ctr = g.controls();
  ctr.autoRotate = !S.reduced; ctr.autoRotateSpeed = ROTATE_SPEED; ctr.enablePan = false;
  S.zone.dataset.spin = S.reduced ? 'off' : 'on';
  // Sin zoom: altitud fija. Con enableZoom = false, OrbitControls ignora la rueda y el pellizco y
  // NO hace preventDefault, así que la rueda siempre hace scroll de la página.
  ctr.enableZoom = false;
  // Arrastrar: se para el giro y, 1 s después de soltar, vuelve desde donde estaba
  ctr.addEventListener('start', hold);
  ctr.addEventListener('end', release);

  // Solo se dibuja cuando se ve: vista oculta, fuera de pantalla o pestaña en segundo plano → pausa
  let onScreen = true;
  const sync = () => { (onScreen && document.visibilityState === 'visible') ? g.resumeAnimation() : g.pauseAnimation(); };
  new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); sync(); }).observe(S.zone);
  document.addEventListener('visibilitychange', sync);
  setInterval(() => { if (onScreen && document.visibilityState === 'visible') placeLabels(); }, 500);

  let wasNarrow = narrow();
  new ResizeObserver(() => {
    if (!host.clientWidth) return;
    g.width(host.clientWidth).height(host.clientHeight);
    if (narrow() !== wasNarrow) { wasNarrow = narrow(); setGlobeData(); }
    g.resumeAnimation();
    requestAnimationFrame(() => requestAnimationFrame(sync));
  }).observe(host);

  S.mode = 'globe';
  S.zone.classList.add('is-globe');
  S.zone.classList.remove('is-flat');
  // Los marcadores (nodos HTML de CSS2D) en otra tarea: la creación del globo ya es larga
  setTimeout(() => { if (S.globe) setGlobeData(); }, 0);
}

/* ───────── respaldo SVG ───────── */

function mountFlat(note) {
  const box = S.zone.querySelector('#globe-flat');
  S.flat = mountFlatGlobe(box, {
    land: S.land, markers: S.markers, scale: SCALE, labels: S.labels, fmt: kfmt, reduced: S.reduced, home: HOME,
    onHover: showTip, onSpin: (on) => { S.zone.dataset.spin = on ? 'on' : 'off'; },
  });
  const n = S.zone.querySelector('#globe-note');
  if (n) n.textContent = note;
  S.mode = 'flat';
  S.zone.classList.add('is-flat');
  S.zone.classList.remove('is-globe');
}

/* ───────── API ───────── */

async function mount() {
  S.reduced = prefersReducedMotion();
  const view = S.zone.querySelector('#globe-view');
  if (view) view.addEventListener('keydown', onKey);
  if (!webglOK()) {
    S.land = await loadLand().catch(() => []);
    mountFlat('Sin WebGL: globo simplificado');
    return;
  }
  try {
    loadLibCss();
    await withTimeout(import(LIB_URL), TIMEOUT_MS);
    if (!S.zone.isConnected) return;
    await new Promise((r) => whenOnScreen(S.zone, r));
    await pause();
    createGlobe();
  } catch (e) {
    console.warn('[zerohour] globo no disponible, se usa el globo SVG:', e && e.message);
    S.land = S.land || await loadLand().catch(() => []);
    mountFlat(e && e.message === 'timeout' ? 'El globo 3D no respondió: globo simplificado' : 'Globo 3D no disponible: globo simplificado');
  }
}

/** Ejecuta fn la primera vez que el nodo está en pantalla (o a 200 px de entrar). */
function whenOnScreen(node, fn) {
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: '200px 0px' });
  io.observe(node);
}

/** Estrellas de fondo, fijas y muy tenues (guía §1): un SVG estático detrás del globo. */
export function starField() {
  let seed = 7, sd = '', sb = '';
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 560, y = rnd() * 560, big = rnd() > 0.88;
    if (Math.hypot(x - 280, y - 280) < 240) continue;
    if (big) sb += `M${x.toFixed(1)} ${y.toFixed(1)}h0`; else sd += `M${x.toFixed(1)} ${y.toFixed(1)}h0`;
  }
  return svg('svg', { class: 'globe-stars', viewBox: '0 0 560 560', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' },
    [svg('path', { d: sd, class: 'gp-star' }), svg('path', { d: sb, class: 'gp-star gp-star--b' })]);
}

/**
 * Programa el montaje del globo para después del contenido principal: tras load, en el primer
 * hueco libre y solo cuando la zona se ve (no compite con el LCP ni bloquea otra pantalla).
 */
export function scheduleGlobe(zone, map) {
  if (!zone) return;
  S.zone = zone;
  setData(map);
  if (S.scheduled) return;
  S.scheduled = true;
  const start = () => whenOnScreen(zone, () => { mount(); });
  const go = () => { if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2000 }); else setTimeout(start, 200); };
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}

/** Nuevos datos del mapa (refresco cada 10 min). */
export function updateGlobe(map) {
  setData(map);
  if (S.mode === 'globe' && S.globe) setGlobeData();
  else if (S.mode === 'flat' && S.flat) S.flat.update(S.markers, SCALE, S.labels);
}

