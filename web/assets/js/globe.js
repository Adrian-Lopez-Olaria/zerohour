/* =============================================================================
   globe.js · globo 3D (globe.gl autoalojado) con respaldo de vista plana en SVG
   - La librería se carga en diferido (tras el evento load, en un hueco libre del
     hilo principal y cuando la zona del globo está en pantalla) con import()
     dinámico: no es un sink de Trusted Types, así que no hace falta ninguna
     política; solo script-src 'self'.
   - Sin WebGL, o si la librería/tierra no llegan en 9 s → proyección plana.
   - Se pausa cuando no está en pantalla (vista oculta, scroll o pestaña).
   v2 (cambios-v2 §6):
   - Un marcador por país (suma de ataques, en su zona con más ataques).
   - Escala logarítmica relativa al día: tamaño 6 + t·14 px y color por tramo
     (t ≥ 0,72 alto · ≥ 0,40 medio · resto bajo); la leyenda lo traduce a cifras.
   - Etiquetas solo para 6 países y nunca dos a menos de 9°; ondas para 12.
   - Zoom: botones + / − / ⌖, pellizco y Ctrl + rueda (la rueda sola hace scroll).
   ============================================================================= */
import { el, svg, clear } from './util/dom.js';
import { nf, prefersReducedMotion } from './util/format.js';

const LIB_URL = new URL('../vendor/globe.gl-2.46.2.zh.min.js', import.meta.url).href;
const LIB_CSS = new URL('../vendor/globe.gl-2.46.2.zh.css', import.meta.url).href;
const LAND_URL = new URL('../geo/tierra.json', import.meta.url).href;
const TIMEOUT_MS = 9000;
const ROTATE_SPEED = 0.3;
const ALT_MIN = 0.45, ALT_MAX = 3.2, ZOOM_STEP = 0.45;
const HOME = { lat: 30, lng: 10 };
const MAX_LABELS = 6, MAX_RINGS = 12, LABEL_MIN_DEG = 9;
// = --map-hi / --map-mid / --map-lo (WebGL no lee variables CSS)
const TIER_HEX = { hi: '#FF4F6D', mid: '#F5B544', lo: '#6CB6FF' };

const narrow = () => innerWidth < 760;
const S = { zone: null, mode: null, globe: null, map: null, land: null, reduced: false, scheduled: false, markers: [], labels: new Set(), flatZoom: 1 };

/* ───────── escala: por país, logarítmica y relativa al día ───────── */

/** Un marcador por país: suma de ataques, colocado en la zona de ese país con más ataques. */
export function countryMarkers(map) {
  const by = new Map();
  for (const p of (map ? map.points : [])) {
    let m = by.get(p.cc);
    if (!m) { m = { cc: p.cc, country: p.country, attacks: 0, lat: p.lat, lon: p.lon, best: -1 }; by.set(p.cc, m); }
    m.attacks += p.attacks;
    if (p.attacks > m.best) { m.best = p.attacks; m.lat = p.lat; m.lon = p.lon; }
  }
  return [...by.values()].sort((a, b) => b.attacks - a.attacks);
}

/** Escala del día: t = (log10(a+1) − min) / (max − min), con min y max de los países. */
export function makeScale(markers) {
  const v = markers.map((m) => Math.log10(m.attacks + 1));
  const lo = v.length ? Math.min(...v) : 0;
  const hi = v.length ? Math.max(...v, lo + 0.001) : 1;
  const t = (a) => Math.max(0, Math.min(1, (Math.log10(a + 1) - lo) / (hi - lo)));
  return {
    t,
    tier: (a) => { const x = t(a); return x >= 0.72 ? 'hi' : x >= 0.4 ? 'mid' : 'lo'; },
    size: (a) => Math.round((6 + t(a) * 14) * (narrow() ? 0.75 : 1)),
    threshold: (x) => Math.round(Math.pow(10, lo + x * (hi - lo)) - 1),   // ataques en el corte x
  };
}
let SCALE = makeScale([]);

/** «1,2K», «385K», «1,4M». */
export const kfmt = (v) => (v >= 1e6 ? nf(v / 1e6, 1) + 'M' : v >= 1e4 ? nf(v / 1e3, 0) + 'K' : v >= 1e3 ? nf(v / 1e3, 1) + 'K' : nf(v));

/** Etiquetas: los 6 primeros países que no queden a menos de 9° de otro ya etiquetado (NL/DE…). */
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
  renderLegend();
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
    if (lose) lose.loseContext();             // solo era una prueba: libera el contexto
    return true;
  } catch (e) { return false; }
}

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, ko) => { t = setTimeout(() => ko(new Error('timeout')), ms); }),
  ]).finally(() => clearTimeout(t));
}

function loadLibCss() {
  if (document.querySelector('link[data-zh="globe-css"]')) return;
  document.head.appendChild(el('link', { rel: 'stylesheet', href: LIB_CSS, dataset: { zh: 'globe-css' } }));
}

/** Leyenda: los cortes del día en cifras reales y cómo hacer zoom según el dispositivo. */
function renderLegend() {
  const lg = S.zone && S.zone.querySelector('#map-legend');
  if (!lg) return;
  clear(lg);
  if (!S.markers.length) return;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  lg.append(
    el('span', { class: 'map-legend__keys' }, [
      el('span', [el('i', { class: 'lg-hi' }), `desde ${kfmt(SCALE.threshold(0.72))}`]),
      el('span', [el('i', { class: 'lg-mid' }), `desde ${kfmt(SCALE.threshold(0.4))}`]),
      el('span', [el('i', { class: 'lg-lo' }), 'menos']),
    ]),
    el('span', { text: coarse ? 'Arrastra para girar · pellizca para zoom' : 'Arrastra para girar · Ctrl + rueda para zoom' }),
  );
}

/* ───────── globo 3D ───────── */

function markerEl(m, i) {
  return el('div', {
    class: `gm gm--${SCALE.tier(m.attacks)}`,
    style: { '--s': `${SCALE.size(m.attacks)}px`, '--d': `${(i * 0.17).toFixed(2)}s` },
  }, [
    i < MAX_RINGS ? el('span', { class: 'gm__ring' }) : null,
    el('span', { class: 'gm__dot' }),
    S.labels.has(m) ? el('span', { class: 'gm__lbl' }, [m.cc, el('em', { text: kfmt(m.attacks) })]) : null,
  ]);
}

function setGlobeData() {
  const ms = S.markers;
  S.globe
    .ringsData(S.reduced ? [] : ms.slice(0, MAX_RINGS))
    .htmlElementsData(ms)
    .htmlElement((m) => markerEl(m, ms.indexOf(m)));
}

/** Altitud de la vista inicial según la forma del panel: en uno alto y estrecho, más lejos. */
function baseAlt(host) {
  const r = host.clientWidth ? host.clientHeight / host.clientWidth : 1;
  return Math.min(ALT_MAX, Math.max(1.9, 1.8 * r));
}

function createGlobe() {
  const Globe = globalThis.Globe;
  if (typeof Globe !== 'function') throw new Error('globe.gl no se registró');
  const host = S.zone.querySelector('#globe');
  const g = Globe({ animateIn: false })(host)
    .width(host.clientWidth).height(host.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .enablePointerInteraction(false)          // sin hover/tooltip: menos coste y ninguna ruta hacia innerHTML
    .showAtmosphere(true).atmosphereColor('#3D7FB8').atmosphereAltitude(0.1)
    .showGraticules(true)
    .pointsData(S.land).pointLat('lat').pointLng('lng').pointAltitude(0.002).pointRadius(0.36).pointResolution(5)
    .pointColor(() => 'rgba(126,152,178,0.5)').pointsMerge(true)
    .ringLat('lat').ringLng('lon').ringAltitude(0.003).ringPropagationSpeed(1.2).ringRepeatPeriod(2200)
    .ringColor((m) => { const c = TIER_HEX[SCALE.tier(m.attacks)]; return (t) => c + Math.round((1 - t) * 180).toString(16).padStart(2, '0'); })
    .ringMaxRadius((m) => 1.2 + SCALE.t(m.attacks) * 3.4)
    .htmlLat('lat').htmlLng('lon').htmlAltitude(0.01)
    .pointOfView({ ...HOME, altitude: baseAlt(host) }, 0);
  S.globe = g;
  setGlobeData();

  const mat = g.globeMaterial();
  if (mat && mat.color) { mat.color.set('#0E151D'); if (mat.emissive) mat.emissive.set('#05080B'); if ('shininess' in mat) mat.shininess = 2; }
  const ctr = g.controls();
  ctr.autoRotate = !S.reduced; ctr.autoRotateSpeed = ROTATE_SPEED; ctr.enablePan = false;
  ctr.enableZoom = true; ctr.minDistance = 100 * (1 + ALT_MIN); ctr.maxDistance = 100 * (1 + ALT_MAX);
  // La rueda sin Ctrl hace scroll de la página (el globo no la «atrapa»); con Ctrl, zoom. El pellizco siempre.
  host.addEventListener('wheel', (e) => { if (!e.ctrlKey) e.stopPropagation(); }, { capture: true });
  host.addEventListener('pointerdown', () => { ctr.autoRotate = false; });

  // Solo se dibuja cuando se ve: vista oculta, fuera de pantalla o pestaña en segundo plano → pausa
  let onScreen = true;
  const sync = () => { (onScreen && document.visibilityState === 'visible') ? g.resumeAnimation() : g.pauseAnimation(); };
  new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); sync(); }).observe(S.zone);
  document.addEventListener('visibilitychange', sync);

  // Redimensionar un canvas lo borra: aunque esté en pausa, se pinta un fotograma con el
  // tamaño nuevo y después se vuelve al estado que toque.
  let wasNarrow = narrow();
  new ResizeObserver(() => {
    if (!host.clientWidth) return;
    g.width(host.clientWidth).height(host.clientHeight);
    if (narrow() !== wasNarrow) { wasNarrow = narrow(); setGlobeData(); }   // tamaño de marcador en móvil
    g.resumeAnimation();
    requestAnimationFrame(() => requestAnimationFrame(sync));
  }).observe(host);

  S.mode = 'globe';
  S.zone.classList.add('is-globe');
  S.zone.classList.remove('is-flat');
}

/* ───────── zoom (botones) ───────── */

function zoomBy(d) {
  if (S.mode === 'globe' && S.globe) {
    const p = S.globe.pointOfView();
    S.globe.pointOfView({ altitude: Math.min(ALT_MAX, Math.max(ALT_MIN, p.altitude + d)) }, S.reduced ? 0 : 400);
    S.globe.controls().autoRotate = false;
    S.globe.resumeAnimation();
  } else if (S.mode === 'flat') {
    S.flatZoom = Math.min(4, Math.max(1, S.flatZoom * (d < 0 ? 1.5 : 1 / 1.5)));
    applyFlatZoom();
  }
}

function resetView() {
  if (S.mode === 'globe' && S.globe) {
    S.globe.pointOfView({ ...HOME, altitude: baseAlt(S.zone.querySelector('#globe')) }, S.reduced ? 0 : 600);
    S.globe.controls().autoRotate = !S.reduced;
    S.globe.resumeAnimation();
  } else if (S.mode === 'flat') {
    S.flatZoom = 1;
    applyFlatZoom();
  }
}

/** Botones + / − / ⌖ (36 px). Funcionan igual en el globo y en la vista plana. */
export function zoomControls() {
  const btn = (label, ic, fn) => el('button', { type: 'button', 'aria-label': label, title: label, on: { click: fn } }, zoomIcon(ic));
  return el('div', { class: 'zoom', role: 'group', 'aria-label': 'Zoom del mapa' }, [
    btn('Acercar', 'plus', () => zoomBy(-ZOOM_STEP)),
    btn('Alejar', 'minus', () => zoomBy(ZOOM_STEP)),
    btn('Restablecer la vista', 'reset', resetView),
  ]);
}
const ZOOM_ICON = { plus: 'M8 2.5v11M2.5 8h11', minus: 'M2.5 8h11', reset: 'M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3' };
function zoomIcon(k) {
  return svg('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'square', 'aria-hidden': 'true', focusable: 'false' }, [
    k === 'reset' ? svg('circle', { cx: 8, cy: 8, r: 5.5 }) : null,
    svg('path', { d: ZOOM_ICON[k] }),
  ]);
}

/* ───────── vista plana (respaldo) ───────── */

const W = 720, H = 300;
const px = (lng) => (lng + 180) / 360 * W;
const py = (lat) => (82 - lat) / 140 * H;

function flatMarks() {
  return svg('g', { class: 'ff-marks' }, S.markers.map((m, i) => {
    const r = (SCALE.size(m.attacks) / 2.6).toFixed(1), x = px(m.lon), y = py(m.lat);
    const tier = SCALE.tier(m.attacks);
    return svg('g', [
      i < MAX_RINGS ? svg('circle', { class: `ff-ring ff--${tier}`, cx: x.toFixed(1), cy: y.toFixed(1), r, style: { '--d': `${(i * 0.17).toFixed(2)}s` } }) : null,
      svg('circle', { class: `ff-dot ff--${tier}`, cx: x.toFixed(1), cy: y.toFixed(1), r }),
      S.labels.has(m) ? svg('text', { class: 'ff-lbl', x: (x + Number(r) + 3).toFixed(1), y: (y + 3).toFixed(1), text: `${m.cc} ${kfmt(m.attacks)}` }) : null,
    ]);
  }));
}

/** Zoom de la vista plana: el viewBox entre ×1 y ×4, centrado. */
function applyFlatZoom() {
  const s = S.zone && S.zone.querySelector('#globe-flat svg');
  if (!s) return;
  const w = W / S.flatZoom, h = H / S.flatZoom;
  s.setAttribute('viewBox', `${((W - w) / 2).toFixed(1)} ${((H - h) / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
}

function mountFlat(note) {
  const box = S.zone.querySelector('#globe-flat');
  clear(box);
  // Un único <path> con todas las celdas de tierra: ~4.800 rectángulos sin crear 4.800 nodos
  const land = S.land && S.land.length
    ? svg('path', { class: 'ff-land', d: S.land.map((p) => `M${px(p.lng).toFixed(1)} ${py(p.lat).toFixed(1)}h1.6v1.6h-1.6z`).join('') })
    : null;
  box.appendChild(el('span', { class: 'map-flat-note', text: note }));
  box.appendChild(svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', focusable: 'false' }, [land, flatMarks()]));
  S.mode = 'flat';
  S.zone.classList.add('is-flat');
  S.zone.classList.remove('is-globe');
  applyFlatZoom();
}

/* ───────── API ───────── */

async function mount() {
  S.reduced = prefersReducedMotion();
  if (!webglOK()) {
    S.land = await loadLand().catch(() => null);
    mountFlat('SIN WEBGL · PROYECCIÓN PLANA');
    return;
  }
  try {
    loadLibCss();
    const [, land] = await withTimeout(Promise.all([import(LIB_URL), loadLand()]), TIMEOUT_MS);
    S.land = land;
    if (!S.zone.isConnected) return;
    // Crear el globo es lo caro (cientos de ms de hilo principal): si mientras se descargaba
    // el usuario cambió de pantalla, se espera a que la zona vuelva a verse.
    await new Promise((r) => whenOnScreen(S.zone, r));
    createGlobe();
  } catch (e) {
    console.warn('[zerohour] globo no disponible, se usa la vista plana:', e && e.message);
    S.land = S.land || await loadLand().catch(() => null);
    mountFlat(e && e.message === 'timeout' ? 'GLOBO SIN RESPUESTA · PROYECCIÓN PLANA' : 'GLOBO NO DISPONIBLE · PROYECCIÓN PLANA');
  }
}

/** Ejecuta fn la primera vez que el nodo está en pantalla (o a 200 px de entrar). */
function whenOnScreen(node, fn) {
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
  }, { rootMargin: '200px 0px' });
  io.observe(node);
}

/**
 * Programa el montaje del globo para después del contenido principal: tras el evento
 * load, en el primer hueco libre (requestIdleCallback) y solo cuando la zona se ve.
 * Así no compite con el LCP, no bloquea otra pantalla si el usuario ya se fue del
 * briefing (montarlo cuesta cientos de ms) y en móvil no se descarga hasta que se ve.
 */
export function scheduleGlobe(zone, map) {
  if (!zone) return;
  S.zone = zone;
  setData(map);
  if (S.scheduled) return;
  S.scheduled = true;
  const start = () => whenOnScreen(zone, () => { mount(); });
  const go = () => {
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2000 });
    else setTimeout(start, 200);
  };
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}

/** Nuevos datos del mapa (refresco cada 10 min). */
export function updateGlobe(map) {
  setData(map);
  if (S.mode === 'globe' && S.globe) setGlobeData();
  else if (S.mode === 'flat' && S.zone) {
    const old = S.zone.querySelector('#globe-flat .ff-marks');
    if (old) old.replaceWith(flatMarks());
  }
}
