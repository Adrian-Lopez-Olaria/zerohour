/* =============================================================================
   globe.js · globo 3D (globe.gl autoalojado) con respaldo de vista plana en SVG
   - La librería se carga en diferido (tras el evento load, en un hueco libre del
     hilo principal y cuando la zona del globo está en pantalla) con import()
     dinámico: no es un sink de Trusted Types, así que no hace falta ninguna
     política; solo script-src 'self'.
   - Sin WebGL, o si la librería/tierra no llegan en 9 s → proyección plana.
   - Se pausa cuando no está en pantalla (vista oculta, scroll o pestaña).
   ============================================================================= */
import { el, svg, clear } from './util/dom.js';
import { nf, prefersReducedMotion } from './util/format.js';

const LIB_URL = new URL('../vendor/globe.gl-2.46.2.zh.min.js', import.meta.url).href;
const LIB_CSS = new URL('../vendor/globe.gl-2.46.2.zh.css', import.meta.url).href;
const LAND_URL = new URL('../geo/tierra.json', import.meta.url).href;
const TIMEOUT_MS = 9000;
const ROTATE_SPEED = 0.35;
const ATTACK_HEX = { hi: '#FF4F6D', mid: '#FFB547', lo: '#4CF2A3' };   // = --sev-critical / --warn / --ok (WebGL no lee variables CSS)

export const attackBand = (n) => (n >= 3000 ? 'hi' : n >= 1000 ? 'mid' : 'lo');
const attackSize = (n) => Math.round(7 + Math.sqrt(n) / 5);          // px · 290 → 10 px · 4.812 → 21 px
const narrow = () => innerWidth < 760;

const S = { zone: null, mode: null, globe: null, map: null, land: null, reduced: false, scheduled: false };

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

const sortedPoints = (map) => (map ? map.points.slice().sort((a, b) => b.attacks - a.attacks) : []);

/* ───────── globo 3D ───────── */

function markerEl(p, i) {
  return el('div', {
    class: `gm gm--${attackBand(p.attacks)}`,
    style: {
      '--s': `${Math.round(attackSize(p.attacks) * (narrow() ? 0.65 : 1))}px`,
      '--d': `${S.reduced ? 0 : 600 + i * 90}ms`,
    },
  }, [
    el('span', { class: 'gm__ring' }),
    el('span', { class: 'gm__ring gm__ring--2' }),
    el('span', { class: 'gm__dot' }),
    p.attacks >= 2000 ? el('span', { class: 'gm__lbl' }, [`${p.cc} `, el('em', { text: `${nf(p.attacks / 1000, 1)}K` })]) : null,
  ]);
}

function setGlobeData(map) {
  const pts = sortedPoints(map);
  const idx = new Map(pts.map((p, i) => [p, i]));
  S.globe
    .ringsData(S.reduced ? [] : pts)
    .htmlElementsData(pts)
    .htmlElement((p) => markerEl(p, idx.get(p) || 0));
}

function createGlobe() {
  const Globe = globalThis.Globe;
  if (typeof Globe !== 'function') throw new Error('globe.gl no se registró');
  const host = S.zone.querySelector('#globe');
  const g = Globe({ animateIn: !S.reduced })(host)
    .width(host.clientWidth).height(host.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .enablePointerInteraction(false)          // sin hover/tooltip: menos coste y ninguna ruta hacia innerHTML
    .showAtmosphere(true).atmosphereColor('#4CF2A3').atmosphereAltitude(0.13)
    .showGraticules(true)
    .pointsData(S.land).pointLat('lat').pointLng('lng').pointAltitude(0.002).pointRadius(0.36).pointResolution(5)
    .pointColor(() => 'rgba(159,217,196,0.5)').pointsMerge(true)
    .ringLat('lat').ringLng('lon').ringAltitude(0.003).ringPropagationSpeed(1.4)
    .ringColor((p) => { const c = ATTACK_HEX[attackBand(p.attacks)]; return (t) => c + Math.round((1 - t) * 200).toString(16).padStart(2, '0'); })
    .ringMaxRadius((p) => 1.6 + Math.sqrt(p.attacks) / 18)
    .ringRepeatPeriod((p) => Math.max(900, 2600 - Math.sqrt(p.attacks) * 18))
    .htmlLat('lat').htmlLng('lon').htmlAltitude(0.01)
    .pointOfView({ lat: 28, lng: 12, altitude: narrow() ? 2.55 : 2.35 }, 0);
  S.globe = g;
  setGlobeData(S.map);

  const mat = g.globeMaterial();
  if (mat && mat.color) { mat.color.set('#071312'); if (mat.emissive) mat.emissive.set('#030807'); if ('shininess' in mat) mat.shininess = 4; }
  const ctr = g.controls();
  ctr.autoRotate = !S.reduced; ctr.autoRotateSpeed = ROTATE_SPEED; ctr.enableZoom = false; ctr.enablePan = false;

  // Solo se dibuja cuando se ve: vista oculta, fuera de pantalla o pestaña en segundo plano → pausa
  let onScreen = true;
  const sync = () => { (onScreen && document.visibilityState === 'visible') ? g.resumeAnimation() : g.pauseAnimation(); };
  new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); sync(); }).observe(S.zone);
  document.addEventListener('visibilitychange', sync);

  // Redimensionar un canvas lo borra: aunque esté en pausa, se pinta un fotograma con el
  // tamaño nuevo (globo y marcadores) y después se vuelve al estado que toque.
  let wasNarrow = narrow();
  new ResizeObserver(() => {
    if (!host.clientWidth) return;
    g.width(host.clientWidth).height(host.clientHeight);
    if (narrow() !== wasNarrow) {               // p. ej. al girar una tablet: tamaño de marcador y distancia de cámara
      wasNarrow = narrow();
      setGlobeData(S.map);
      g.pointOfView({ altitude: wasNarrow ? 2.55 : 2.35 }, 0);
    }
    g.resumeAnimation();
    requestAnimationFrame(() => requestAnimationFrame(sync));
  }).observe(host);

  S.mode = 'globe';
  S.zone.classList.add('is-globe');
  S.zone.classList.remove('is-flat');
}

/* ───────── vista plana (respaldo) ───────── */

const W = 720, H = 300;
const px = (lng) => (lng + 180) / 360 * W;
const py = (lat) => (82 - lat) / 140 * H;

function flatMarks(map) {
  return svg('g', { class: 'ff-marks' }, sortedPoints(map).flatMap((p, i) => {
    const r = (attackSize(p.attacks) / 2.2).toFixed(1), x = px(p.lon).toFixed(1), y = py(p.lat).toFixed(1);
    const band = attackBand(p.attacks);
    return [
      svg('circle', { class: `ff-ring ff--${band}`, cx: x, cy: y, r, style: { '--d': `${(i * 0.13).toFixed(2)}s` } }),
      svg('circle', { class: `ff-dot ff--${band}`, cx: x, cy: y, r }),
    ];
  }));
}

function mountFlat(note) {
  const box = S.zone.querySelector('#globe-flat');
  clear(box);
  // Un único <path> con todas las celdas de tierra: ~4.800 rectángulos sin crear 4.800 nodos
  const land = S.land && S.land.length
    ? svg('path', { class: 'ff-land', d: S.land.map((p) => `M${px(p.lng).toFixed(1)} ${py(p.lat).toFixed(1)}h1.6v1.6h-1.6z`).join('') })
    : null;
  box.appendChild(el('span', { class: 'note', text: note }));
  box.appendChild(svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', focusable: 'false' }, [land, flatMarks(S.map)]));
  S.mode = 'flat';
  S.zone.classList.add('is-flat');
  S.zone.classList.remove('is-globe');
}

/* ───────── API ───────── */

async function mount() {
  S.reduced = prefersReducedMotion();
  if (!webglOK()) {
    S.land = await loadLand().catch(() => null);
    mountFlat('WEBGL NO DISPONIBLE · PROYECCIÓN PLANA');
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
 * briefing (montarlo cuesta cientos de ms) y en móvil, donde queda bajo el top 10,
 * no se descarga hasta que se baja hasta él.
 */
export function scheduleGlobe(zone, map) {
  if (S.scheduled || !zone) return;
  S.scheduled = true;
  S.zone = zone;
  S.map = map;
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
  S.map = map;
  if (S.mode === 'globe' && S.globe) setGlobeData(map);
  else if (S.mode === 'flat' && S.zone) {
    const old = S.zone.querySelector('#globe-flat .ff-marks');
    if (old) old.replaceWith(flatMarks(map));
  }
}
