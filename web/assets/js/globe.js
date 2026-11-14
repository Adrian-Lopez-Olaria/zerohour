/* =============================================================================
   globe.js · globo de origen de ataques «Órbita» (globe.gl autoalojado) + respaldo SVG
   - La librería se carga en diferido (tras load, en un hueco libre y cuando la zona se ve)
     con import() dinámico: no es un sink de Trusted Types, no hace falta ninguna política.
   - Sin WebGL, o si la librería/tierra no llegan en 9 s → globo SVG (globo-plano.js) con el
     mismo comportamiento.
   - Una bolita por país del mundo (geo/centroides.js), todas del MISMO tamaño en pantalla; la
     intensidad va solo en el color (tramos log por tercios) y gris tenue = sin actividad en
     DShield hoy. Son puntos WebGL de globe.gl (pointsData con merge: una sola malla), no nodos
     DOM. Si dos se tocan en pantalla a la altitud actual, se ve la de más actividad y la otra se
     oculta hasta acercar el zoom. Anillos en los 5 primeros; etiquetas «CC 1179,5 k» para 6.
   - Gira solo. Se para con el puntero sobre una bolita (no sobre el resto del globo), al arrastrar,
     con las flechas o con flyTo(); a 1 s de salir de la bolita o de soltar vuelve a girar. Zoom corto ×1–×1,6; la rueda sin Ctrl hace scroll de la página.
   - Hover/toque sobre una bolita: se agranda, se iluminan solo sus rayas y sale un panel propio
     (el() y textContent; enablePointerInteraction sigue en false y la detección es nuestra:
     getScreenCoords + distancia). Clic: flyTo.
   - Rayas de Cloudflare Radar como disparos efímeros, repartidos por planificador.js según el
     % de cada par (frecuencia proporcional al dato). Pausa total fuera de pantalla o con la
     pestaña oculta.
   - prefers-reduced-motion: sin giro, sin pulsos ni disparos (rayas estáticas) y vuelo instantáneo.
   Las etiquetas y el panel se crean con createElement y textContent.
   ============================================================================= */
import { el, svg } from './util/dom.js';
import { nf, countryName, prefersReducedMotion } from './util/format.js';
import { mountFlatGlobe } from './globo-plano.js';
import { crearPlanificador, pesoDe } from './planificador.js';
import { CENTROIDES } from './geo/centroides.js';

const LIB_URL = new URL('../vendor/globe.gl-2.46.2.zh.min.js', import.meta.url).href;
const LIB_CSS = new URL('../vendor/globe.gl-2.46.2.zh.css', import.meta.url).href;
const LAND_URL = new URL('../geo/tierra.json', import.meta.url).href;     // puntos: globo SVG
const LAND_TEX = new URL('../geo/tierra.png', import.meta.url).href;      // textura: globo 3D
const TIMEOUT_MS = 9000;
const ROTATE_SPEED = 1.1;                  // OrbitControls: ≈ 7°/s a 60 fps (un 35 % más que antes)
const RESUME_MS = 1000;                    // vuelve a girar 1 s después de soltar
const HOME = { lat: 32, lng: -36 };
const ZOOM_MAG = 1.6;                       // zoom corto: de ×1 (vista inicial) a ×1,6 como máximo
const ZOOM_STEP = 1.25;                     // cada pulsación o rueda acerca/aleja ×1,25
const MAX_LABELS = 6, MAX_RINGS = 5, LABEL_MIN_DEG = 9;
// = --map-hi / --map-mid / --map-lo / --map-none (WebGL no lee variables CSS)
const TIER_HEX = { hi: '#FF8A5C', mid: '#FFC46B', lo: '#7FB8FF', none: '#A3ADBF' };
/* Bolitas: diámetro en pantalla (en el centro del globo) y separación mínima entre centros, en
   diámetros, por debajo de la cual se considera que se tocan. 7 px en escritorio: a la altitud por
   defecto, en Europa solo se ocultan microestados pegados a un vecino con más actividad. */
const DOT_PX = { desk: 7, mob: 6 }, DOT_GAP = 1.15, HOT_PX = 15, PT_ALT = 0.004;
const HIT_K = 1.8;                          // área de detección del ratón, en radios de la bolita visible
// Todos los países tienen actividad; los grises simplemente no destacan hoy (el criterio, solo en ⓘ)
const ESTADO = { hi: 'Actividad alta', mid: 'Actividad media', lo: 'Actividad baja', none: 'Zona de baja actividad' };
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
const MAX_ARCS = 30;                       // rayas estáticas (reducir movimiento)
/* Disparos: un par por turno (planificador.js), cada uno es una sola pasada del trazo y un
   destello en el destino. Ritmo y máximo de rayas a la vez, según el ancho. */
const SHOTS = { desk: { every: 300, max: 12 }, mob: { every: 500, max: 6 } };
const DASH = 0.35;                          // largo del trazo, en fracción de la raya
const FLASH_MS = 700;                       // vida del destello (el anillo dura ~0,55 s)
const NONE = 'rgba(0,0,0,0)';               // raya del pool sin disparo: invisible

const narrow = () => innerWidth < 760;
const S = { zone: null, mode: null, globe: null, flat: null, map: null, land: null, reduced: false, scheduled: false, markers: [], labels: new Set(), altHome: 1.8, idle: 0, ui: null,
  plan: null, maxShare: 1, pool: [], flashes: [], pending: [], timer: 0, fired: 0, visible: false, armed: false,
  all: [], vis: [], dotPx: DOT_PX.desk, dotDeg: 0.5, dotKey: '', focus: null, pinned: false, flyUntil: 0, focusArcs: [] };

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

/** Todos los países: los de DShield (como countryMarkers, primero) y, detrás, el resto del mundo
 *  en su centroide con 0 ataques (bolita gris, «Zona de baja actividad»). */
export function allMarkers(map, data = countryMarkers(map)) {
  const seen = new Set(data.map((m) => m.cc));
  const rest = Object.keys(CENTROIDES).filter((cc) => !seen.has(cc)).sort()
    .map((cc) => ({ cc, country: '', attacks: 0, sources: 0, lat: CENTROIDES[cc][0], lon: CENTROIDES[cc][1], none: true }));
  return [...data, ...rest];
}

const unit = (m) => { const p = m.lat * Math.PI / 180, l = m.lon * Math.PI / 180; return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]; };

/** Bolitas que se ven: en orden (más actividad primero), se descarta la que quede a menos de
 *  `minDeg` grados de otra ya visible. Es la misma idea que las etiquetas (no se pisan). */
export function visibleSet(ms, minDeg) {
  const cosMin = Math.cos(minDeg * Math.PI / 180), out = [], vs = [];
  for (const m of ms) {
    const v = unit(m);
    if (vs.some((w) => v[0] * w[0] + v[1] * w[1] + v[2] * w[2] > cosMin)) continue;
    out.push(m); vs.push(v);
  }
  return out;
}

/** t = (log10(a+1) − min) / (max − min) con min y max de los países del día; tramos por tercios. */
export function makeScale(markers) {
  const v = markers.map((m) => Math.log10(m.attacks + 1));
  const lo = v.length ? Math.min(...v) : 0;
  const hi = v.length ? Math.max(...v, lo + 0.001) : 1;
  const t = (a) => Math.max(0, Math.min(1, (Math.log10(a + 1) - lo) / (hi - lo)));
  return {
    t,
    tier: (a) => { if (!(a > 0)) return 'none'; const x = t(a); return x > 0.66 ? 'hi' : x > 0.33 ? 'mid' : 'lo'; },
    // ≈0,7× del tamaño anterior (marcadores más pequeños, menos solape en Europa), con mínimo legible
    size: (a) => Math.max(5, Math.round((6 + t(a) * 16) * (narrow() ? 0.8 : 1))),
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
  S.all = allMarkers(map, S.markers);        // mismos objetos: etiquetas y anillos se buscan en S.vis
  S.dotKey = '';                                   // recalcular bolitas visibles
  SCALE = makeScale(S.markers);
  S.labels = labelSet(S.markers);
  if (S.focus) S.focus = S.all.find((m) => m.cc === S.focus.cc) || null;
  // Solo planifica pares que se pueden pintar (los dos extremos con centroide)
  const pares = ((map && map.attack_pairs) || []).filter((p) => centroidOf(p.from_cc) && centroidOf(p.to_cc));
  S.maxShare = Math.max(1e-6, ...pares.map((p) => p.share));
  S.plan = crearPlanificador(pares);
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
/** Vuelve a girar a 1 s, salvo con un país enfocado (puntero sobre su bolita o panel abierto). */
function release() {
  clearTimeout(S.idle);
  if (!S.reduced && !S.focus) S.idle = setTimeout(() => setAuto(true), RESUME_MS);
}

/* ───────── controles (zoom corto, teclado y flyTo) para el globo 3D y el SVG ───────── */

const altOf = () => S.globe.pointOfView().altitude;
const distOf = (alt) => 1 + alt;          // distancia al centro, en radios
const altMin = () => S.altHome / ZOOM_MAG;  // zoom corto: ×1,6 como máximo

function syncZoomButtons() {
  if (!S.ui) return;
  let canIn = true, canOut = true;
  if (S.mode === 'globe' && S.globe) {
    const a = altOf();
    canIn = a > altMin() + 0.001; canOut = a < S.altHome - 0.001;
  } else if (S.mode === 'flat' && S.flat) {
    canIn = S.flatZoom < S.flat.zoomLimits.max - 0.001; canOut = S.flatZoom > S.flat.zoomLimits.min + 0.001;
  }
  S.ui.zin.disabled = !canIn;
  S.ui.zout.disabled = !canOut;
}

function zoomBy(dir) {                     // dir: +1 acercar, −1 alejar
  if (S.mode === 'globe' && S.globe) {
    hold();
    const d = distOf(altOf()) / (dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    S.globe.pointOfView({ altitude: Math.max(altMin(), Math.min(S.altHome, d - 1)) }, S.reduced ? 0 : 300);
    S.globe.resumeAnimation();
    release();
  } else if (S.mode === 'flat' && S.flat) {
    S.flat.zoomBy(dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  }
}

/** Botones discretos +/− de 44 px (sin ⟲). El zoom se mantiene; al soltar vuelve a girar a 1 s. */
export function zoomControls() {
  const ICON = { plus: 'M8 3v10M3 8h10', minus: 'M3 8h10' };
  const btn = (label, ic, fn) => el('button', { type: 'button', class: 'zb', 'aria-label': label, title: label, on: { click: fn } },
    svg('svg', { viewBox: '0 0 16 16', class: 'ico', 'aria-hidden': 'true', focusable: 'false' }, svg('path', { d: ICON[ic] })));
  const zin = btn('Acercar', 'plus', () => zoomBy(1));
  const zout = btn('Alejar', 'minus', () => zoomBy(-1));
  zout.disabled = true;
  S.ui = { zin, zout };
  return el('div', { class: 'zoom', role: 'group', 'aria-label': 'Zoom del globo' }, [zin, zout]);
}

/** Lleva el globo hasta un punto en 0,9 s SIN cambiar la altitud; luego, la regla de 1 s. */
export function flyTo(lat, lng) {
  if (S.mode === 'globe' && S.globe) {
    hold();
    S.flyUntil = performance.now() + (S.reduced ? 0 : 950);   // en vuelo, lo que pase bajo el puntero no cuenta
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

/** Teclado con el globo enfocado: flechas giran (12°); + y − hacen el zoom corto. */
function onKey(e) {
  const k = e.key;
  if (k === 'ArrowLeft') rotate(0, -12);
  else if (k === 'ArrowRight') rotate(0, 12);
  else if (k === 'ArrowUp') rotate(12, 0);
  else if (k === 'ArrowDown') rotate(-12, 0);
  else if (k === '+' || k === '=') zoomBy(1);
  else if (k === '-') zoomBy(-1);
  else return;
  e.preventDefault();
}

/* ───────── panel de país (hover, toque o foco en el ranking) ─────────
   Se construye con el() y textContent: ni pointLabel ni tooltips de globe.gl (van por innerHTML). */

const byShare = (a, b) => b.share - a.share;

/** Contenido del panel: país, estado, IPs de DShield y principales destinos y orígenes (Radar). */
export function panelContent(m, pairs, scale = SCALE) {
  const tier = scale.tier(m.attacks);
  // País gris: solo su nombre y «Zona de baja actividad»; ni fuentes ni rankings (eso va en ⓘ)
  if (tier === 'none') return [el('p', { class: 'gpan__t' }, [el('b', { text: countryName(m.cc, m.country) }), ' ', el('span', { class: 'gpan__e gpan__e--none', text: ESTADO.none })])];
  const out = pairs.filter((p) => p.from_cc === m.cc && p.to_cc !== m.cc).sort(byShare).slice(0, 3);
  const inn = pairs.filter((p) => p.to_cc === m.cc && p.from_cc !== m.cc).sort(byShare).slice(0, 3);
  const self = pairs.find((p) => p.from_cc === m.cc && p.to_cc === m.cc);
  const line = (k, list, cc) => el('p', { class: 'gpan__l' }, [el('span', { class: 'gpan__k', text: k }),
    list.map((p) => `${countryName(cc(p))} ${nf(p.share, 1)} %`).join(' · ')]);
  return [
    el('p', { class: 'gpan__t' }, [el('b', { text: countryName(m.cc, m.country) }), ' ', el('span', { class: `gpan__e gpan__e--${tier}`, text: ESTADO[tier] })]),
    el('p', { class: 'gpan__l', text: `DShield: ${nf(m.sources)} ${m.sources === 1 ? 'IP activa' : 'IPs activas'} · ${nf(m.attacks)} ataques acumulados` }),
    out.length ? line('Destinos (Radar): ', out, (p) => p.to_cc) : null,
    inn.length ? line('Orígenes (Radar): ', inn, (p) => p.from_cc) : null,
    self ? el('p', { class: 'gpan__l' }, [el('span', { class: 'gpan__k', text: 'Dentro del país (Radar): ' }), `${nf(self.share, 1)} %`]) : null,
    !out.length && !inn.length && !self ? el('p', { class: 'gpan__l gpan__l--m', text: 'Sin pares de origen y destino en Cloudflare Radar' }) : null,
  ];
}

function showPanel(m) {
  const box = S.zone && S.zone.querySelector('#globe-tip');
  if (!box) return;
  box.replaceChildren(...(m ? panelContent(m, (S.map && S.map.attack_pairs) || []).filter(Boolean) : []));
}

/** Enfoca un país (o null): panel, bolita grande, solo sus rayas iluminadas; el giro se para. */
function setFocus(m, pin = false) {
  const pinned = !!m && !!pin;
  if (m === S.focus && pinned === S.pinned) return;
  S.focus = m || null;
  S.pinned = pinned;
  showPanel(S.focus);
  if (S.zone) S.zone.dataset.focus = S.focus ? S.focus.cc : '';
  if (S.mode === 'globe' && S.globe) {
    S.focusArcs = S.focus ? focusArcs(S.focus.cc) : [];
    S.globe.htmlElementsData(htmlItems());
    paintArcs();
  } else if (S.mode === 'flat' && S.flat) S.flat.focus(S.focus);
  if (S.mode === 'globe') { if (S.focus) hold(); else release(); }   // el SVG lo hace en focus()
}

/** Para el ranking: foco (sin fijar) en un país por su código, o null para quitarlo. */
export function focusCountry(cc) {
  if (S.pinned) return;
  setFocus(cc ? S.all.find((m) => m.cc === cc) || null : null);
}

/* ───────── globo 3D ───────── */

/** Etiqueta «CC 1179,5 k» de uno de los 6 primeros (nodo CSS2D; style por CSSOM, que la CSP permite). */
function labelEl(m) {
  return el('div', { class: `gm gm--${SCALE.tier(m.attacks)}`, style: { '--s': `${S.dotPx}px` } },
    el('span', { class: 'gm__lbl', dataset: { cc: m.cc } }, [m.cc, el('em', { text: ` ${kfmt(m.attacks)}` })]));
}

/** Bolita enfocada, más grande, encima de la de WebGL. */
function hotEl(m) {
  return el('div', { class: `gm gm--hot gm--${SCALE.tier(m.attacks)}`, style: { '--s': `${HOT_PX}px` } }, el('span', { class: 'gm__dot' }));
}

/** Nodos HTML del globo: solo las etiquetas visibles y, si hay foco, la bolita grande. */
function htmlItems() {
  const vis = new Set(S.vis);
  const items = S.markers.filter((m) => S.labels.has(m) && vis.has(m)).map((m) => ({ m, lat: m.lat, lon: m.lon }));
  if (S.focus) items.push({ m: S.focus, hot: true, lat: S.focus.lat, lon: S.focus.lon });
  return items;
}

/** Centroide de un país: su zona de DShield si la hay (coordenada real), si no geo/centroides.js. */
function centroidOf(cc) {
  const m = S.markers.find((x) => x.cc === cc);
  if (m) return [m.lat, m.lon];
  return CENTROIDES[cc] || null;
}

/* ───────── bolitas WebGL: tamaño fijo en pantalla y ocultación por solape ───────── */

/** Píxeles por radián en el centro de la vista (cámara perspectiva de globe.gl). */
function pxPerRad() {
  const host = S.zone.querySelector('#globe');
  const fov = (S.globe.camera().fov || 50) * Math.PI / 360;
  return (host.clientHeight || 500) / 2 / Math.tan(fov);
}

/**
 * Recalcula el radio angular de las bolitas (para que midan DOT_PX en pantalla a la altitud
 * actual) y cuáles se ven. Solo rehace la malla si cambió la altitud, el tamaño o los datos.
 */
function refreshDots() {
  if (!S.globe) return;
  const alt = altOf(), ppr = pxPerRad(), px = narrow() ? DOT_PX.mob : DOT_PX.desk;
  const key = `${alt.toFixed(3)}|${Math.round(ppr)}|${px}|${S.all.length}`;
  if (key === S.dotKey) return;
  S.dotKey = key;
  const deg = (p) => p * alt / ppr * 180 / Math.PI;      // píxeles en pantalla → grados de arco
  S.dotPx = px;
  S.dotDeg = deg(px / 2);
  S.vis = visibleSet(S.all, deg(px * DOT_GAP));
  S.globe.pointsData(S.vis).htmlElementsData(htmlItems());
  S.zone.dataset.dots = String(S.vis.length);
}

/** ¿El punto está en la cara visible del globo? (ángulo con el centro de la vista < horizonte) */
function facing(m, pov) {
  const a = unit(m), b = unit({ lat: pov.lat, lon: pov.lng });
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > 1 / (1 + pov.altitude) + 0.02;
}

/**
 * Bolita bajo (x, y) de pantalla. Ratón (touchTol = 0): dentro de una bolita visible, esa; si no,
 * la de más actividad cuya área de detección (HIT_K radios) contenga el punto: S.vis va en orden de
 * actividad, así que en el solape de dos áreas manda la mayor. Toque: la más cercana a touchTol px.
 */
function pick(x, y, touchTol = 0) {
  const host = S.zone.querySelector('#globe'), r = host.getBoundingClientRect(), pov = S.globe.pointOfView();
  let best = null, bd = Infinity;
  const r2 = (S.dotPx / 2) ** 2, lim = touchTol ? (S.dotPx / 2 + touchTol) ** 2 : r2 * HIT_K * HIT_K;
  for (const m of S.vis) {
    if (!facing(m, pov)) continue;
    const s = S.globe.getScreenCoords(m.lat, m.lon, PT_ALT);
    const d = (s.x + r.left - x) ** 2 + (s.y + r.top - y) ** 2;
    if (touchTol) { if (d < lim && d < bd) { bd = d; best = m; } }
    else if (d <= r2) return m;
    else if (d < lim && !best) best = m;
  }
  return best;
}

/** Cajas en pantalla de las bolitas con datos visibles de la cara de delante (para colocar etiquetas). */
function dotBoxes() {
  const host = S.zone.querySelector('#globe'), r = host.getBoundingClientRect(), pov = S.globe.pointOfView(), h = S.dotPx / 2;
  // Solo las bolitas con datos: una etiqueta puede tapar una gris (sin actividad), no una con datos
  return S.vis.filter((m) => m.attacks > 0 && facing(m, pov)).map((m) => {
    const s = S.globe.getScreenCoords(m.lat, m.lon, PT_ALT), x = s.x + r.left, y = s.y + r.top;
    return { left: x - h, right: x + h, top: y - h, bottom: y + h };
  });
}

/** Proporción del par frente al mayor (grosor, color y velocidad del trazo). */
const ratio = (p) => Math.min(1, pesoDe(p) / S.maxShare);

/** Reducir movimiento: las rayas del top, estáticas y sin destello (sin disparos). */
function staticArcs() {
  const arcs = [];
  for (const p of (S.map && S.map.attack_pairs) || []) {
    const a = centroidOf(p.from_cc), b = centroidOf(p.to_cc);
    if (!a || !b || p.from_cc === p.to_cc) continue;
    if (arcs.length >= MAX_ARCS) break;
    const r = ratio(p);
    arcs.push({ startLat: a[0], startLng: a[1], endLat: b[0], endLng: b[1], color: r >= 0.5 ? TIER_HEX.hi : TIER_HEX.mid, stroke: 0.3 + r * 0.9, anim: 0, solid: true, from: p.from_cc, to: p.to_cc });
  }
  return arcs;
}

/** Con un país enfocado: todas sus rayas (salientes y entrantes), continuas y quietas. */
function focusArcs(cc) {
  const arcs = [];
  for (const p of (S.map && S.map.attack_pairs) || []) {
    if (p.from_cc === p.to_cc || (p.from_cc !== cc && p.to_cc !== cc)) continue;
    const a = centroidOf(p.from_cc), b = centroidOf(p.to_cc);
    if (!a || !b) continue;
    const r = ratio(p);
    arcs.push({ startLat: a[0], startLng: a[1], endLat: b[0], endLng: b[1], color: r >= 0.5 ? TIER_HEX.hi : TIER_HEX.mid, stroke: 0.45 + r * 0.9, anim: 0, solid: true, focus: true, from: p.from_cc, to: p.to_cc });
  }
  return arcs;
}

/** Color de una raya: con foco, las que no tocan al país enfocado se atenúan. */
function arcColor(a) {
  if (!S.focus || a.color === NONE || a.focus) return a.color;
  return a.from === S.focus.cc || a.to === S.focus.cc ? a.color : rgba(a.color, 0.14);
}

function paintArcs() {
  if (!S.globe) return;
  if (S.reduced) S.globe.arcsData([...staticArcs(), ...S.focusArcs]);
  else paintShots();
}

/* ───────── disparos (Cloudflare Radar) ─────────
   Un solo temporizador. En cada turno caducan los disparos que ya han pasado, los destellos
   que tocan entran en escena y, si hay hueco, dispara el par que diga el planificador. Las
   rayas son un pool fijo de objetos que se reutilizan: globe.gl conserva su malla y solo la
   recoloca, sin crear ni destruir nada. Cada turno llama UNA vez a arcsData() y a ringsData(),
   nunca a htmlElementsData(): los marcadores no se rehacen. */

const shotCfg = () => (narrow() ? SHOTS.mob : SHOTS.desk);
const newSlot = () => ({ startLat: 0, startLng: 0, endLat: 0, endLng: 0, color: NONE, stroke: 0.1, anim: 0, live: false, born: 0, dur: 0 });

function fire(now, slot) {
  const p = S.plan.siguiente();
  if (!p) return;
  const a = centroidOf(p.from_cc), b = centroidOf(p.to_cc), r = ratio(p), tier = r >= 0.5 ? 'hi' : 'mid';
  S.fired++;
  if (p.from_cc === p.to_cc) {                       // consigo mismo: pulso en el país, sin raya
    S.flashes.push({ lat: a[0], lon: a[1], tier, t: 0.5 + r * 0.5, flash: true, born: now });
    return;
  }
  const dur = Math.round(1800 - r * 600);            // 1,2–1,8 s: más share, más rápido
  Object.assign(slot, { startLat: a[0], startLng: a[1], endLat: b[0], endLng: b[1], color: TIER_HEX[tier], stroke: 0.3 + r * 0.9, anim: dur, born: now, dur, live: true, from: p.from_cc, to: p.to_cc });
  // El trazo de una raya reutilizada sigue donde lo dejó el disparo anterior: vuelve al origen
  const line = slot.__threeObjArc && slot.__threeObjArc.children[0];
  if (line && line.material && line.material.uniforms && line.material.uniforms.dashTranslate) line.material.uniforms.dashTranslate.value = 0;
  S.pending.push({ lat: b[0], lon: b[1], tier, t: 0.3 + r * 0.4, flash: true, at: now + dur, born: 0 });
}

function paintShots() {
  S.globe.arcsData([...S.pool, ...S.focusArcs]).ringsData([...S.markers.slice(0, MAX_RINGS).filter((m) => S.vis.includes(m)), ...S.flashes]);
}

function shotsTick() {
  if (!S.globe || !S.plan) return;
  const now = performance.now(), cfg = shotCfg();
  for (const s of S.pool) if (s.live && now - s.born >= s.dur * (1 + DASH)) { s.live = false; s.color = NONE; s.anim = 0; }
  S.flashes = S.flashes.filter((f) => now - f.born < FLASH_MS);
  // Destello al llegar: en el turno más cercano a la llegada del trazo (±medio turno)
  S.pending = S.pending.filter((f) => { if (now < f.at - cfg.every / 2) return true; f.born = now; S.flashes.push(f); return false; });
  // El pool crece de una en una, solo cuando no queda ninguna raya libre: crear las 12 mallas de
  // golpe en el primer turno era una tarea larga justo en la carga
  let free = S.plan.size ? S.pool.slice(0, cfg.max).find((s) => !s.live) : null;
  if (!free && S.plan.size && S.pool.length < cfg.max) S.pool.push(free = newSlot());
  if (free) fire(now, free);
  paintShots();
  S.zone.dataset.shots = String(S.fired);
}

/** Arranca o para el temporizador. Solo corre con el globo 3D cargado, visible y sin reducir movimiento. */
function shotsRun(on) {
  const run = !!on && S.armed && !S.reduced && S.mode === 'globe' && !!S.globe && !!S.plan && S.plan.size > 0;
  if (run === !!S.timer) return;
  if (run) S.timer = setInterval(shotsTick, shotCfg().every);
  else { clearInterval(S.timer); S.timer = 0; }
  S.zone.dataset.disparos = run ? 'on' : 'off';
}

function setGlobeData() {
  S.dotKey = '';
  refreshDots();
  S.focusArcs = S.focus ? focusArcs(S.focus.cc) : [];
  showPanel(S.focus);
  if (S.reduced) S.globe.ringsData([]);
  paintArcs();
  syncZoomButtons();
}

/**
 * Etiquetas que no se pisan (guía §5.7): cada 0,5 s, en orden de ataques, se prueba derecha,
 * izquierda, arriba y abajo; si ninguna cabe sin tocar otra etiqueta o un marcador, se oculta.
 */
function placeLabels() {
  if (!S.zone || S.mode !== 'globe' || !S.globe) return;
  const dots = dotBoxes();                     // las bolitas son WebGL: sus cajas salen de la proyección
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
    // Anillos: los 5 marcadores con más ataques (cada 2,8 s) y los destellos de los disparos
    // (un solo anillo corto y rápido: periodo 0 = no se repite)
    .ringLat('lat').ringLng('lon').ringAltitude(0.003)
    .ringPropagationSpeed((m) => (m.flash ? 4 : 1.2)).ringRepeatPeriod((m) => (m.flash ? 0 : 2800))
    .ringColor((m) => { const c = TIER_HEX[m.tier || SCALE.tier(m.attacks)]; return (t) => c + Math.round((1 - t) * 200).toString(16).padStart(2, '0'); })
    .ringMaxRadius((m) => (m.flash ? 0.8 + m.t * 1.6 : 1.2 + (m.t != null ? m.t : SCALE.t(m.attacks)) * 3.4))
    // Rayas de Cloudflare Radar. Disparo: una sola pasada del trazo de origen a destino (el
    // hueco de 4 impide una segunda pasada; el desfase de 1 lo hace salir del origen).
    // Con reducir movimiento: trazo continuo y quieto.
    // Las rayas «solid» (reducir movimiento y las del país enfocado) son continuas y quietas.
    .arcColor(arcColor).arcStroke((a) => a.stroke).arcAltitudeAutoScale(0.22).arcCurveResolution(28)
    .arcDashLength((a) => (a.solid ? 1 : DASH)).arcDashGap((a) => (a.solid ? 0 : 4)).arcDashInitialGap((a) => (a.solid ? 0 : 1))
    .arcDashAnimateTime((a) => a.anim).arcsTransitionDuration(0)
    // Bolitas: puntos WebGL fusionados en una sola malla (pointsMerge), del mismo tamaño en pantalla
    .pointsMerge(true).pointResolution(10).pointAltitude(PT_ALT).pointLat('lat').pointLng('lon')
    .pointRadius(() => S.dotDeg).pointColor((m) => TIER_HEX[SCALE.tier(m.attacks)]).pointsTransitionDuration(0)
    .htmlLat('lat').htmlLng('lon').htmlAltitude(0.01)
    .htmlElement((d) => (d.hot ? hotEl(d.m) : labelEl(d.m)))
    .pointOfView({ ...HOME, altitude: S.altHome }, 0);
  S.globe = g;

  const mat = g.globeMaterial();
  // La textura ya trae el azul de la esfera (#0A1F44) y la tierra (#4F82D6): el material no la tiñe
  if (mat && mat.color) { mat.color.set('#ffffff'); if (mat.emissive) mat.emissive.set('#030914'); if ('shininess' in mat) mat.shininess = 3; }
  const ctr = g.controls();
  ctr.autoRotate = !S.reduced; ctr.autoRotateSpeed = ROTATE_SPEED; ctr.enablePan = false;
  S.zone.dataset.spin = S.reduced ? 'off' : 'on';
  S.zone.dataset.disparos = 'off';
  // Zoom corto ×1–×1,6: pellizco (táctil) y botones siempre; rueda solo con Ctrl.
  ctr.enableZoom = true; ctr.minDistance = 100 * distOf(altMin()); ctr.maxDistance = 100 * distOf(S.altHome);
  // Arrastrar, pellizcar o Ctrl + rueda: se para el giro y, 1 s después de soltar, vuelve. El zoom se mantiene.
  ctr.addEventListener('start', hold);
  ctr.addEventListener('end', release);
  // Los botones +/− siguen a la cámara: 'change' salta en cada fotograma en que se mueve
  ctr.addEventListener('change', syncZoomButtons);
  // Al cambiar la altitud (zoom), las bolitas se recalculan (mismo tamaño en pantalla y solapes).
  // 'change' salta en cada fotograma del giro: solo se programa si la altitud se ha movido.
  let lastAlt = S.altHome, dotT = 0;
  ctr.addEventListener('change', () => {
    const a = altOf();
    if (Math.abs(a - lastAlt) < 0.002) return;
    lastAlt = a; clearTimeout(dotT); dotT = setTimeout(refreshDots, 150);
  });

  /* Hover y toque. La detección es nuestra (pick: proyección + distancia), no la de globe.gl. */
  const isMouse = (e) => e.pointerType === 'mouse';
  let hoverRaf = 0, hoverT = 0, lastMove = null, down = null;
  const hoverNow = () => {
    if (!lastMove || down || S.pinned || performance.now() < S.flyUntil) return;
    const m = pick(lastMove.clientX, lastMove.clientY);
    host.classList.toggle('is-pick', !!m);
    setFocus(m);
  };
  host.addEventListener('pointerleave', (e) => {
    if (!isMouse(e)) return;
    lastMove = null; clearInterval(hoverT); hoverT = 0;
    host.classList.remove('is-pick');
    if (!S.pinned) setFocus(null);
  });
  host.addEventListener('pointermove', (e) => {
    if (!isMouse(e) || e.buttons) return;
    lastMove = e;
    // Con el ratón quieto, las bolitas siguen pasando por debajo mientras el globo gira
    if (!hoverT) hoverT = setInterval(() => { if (S.zone.dataset.spin === 'on') hoverNow(); }, 120);
    if (!hoverRaf) hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; hoverNow(); });
  });
  host.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, mouse: isMouse(e) }; }, { capture: true });
  host.addEventListener('pointerup', (e) => {
    const d = down; down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;   // fue un arrastre
    const m = pick(e.clientX, e.clientY, d.mouse ? 0 : 12);                 // el dedo es menos preciso
    // Ratón: el panel ya sale con el hover y el clic hace flyTo. Toque: el panel queda fijo
    // hasta otro toque fuera (o Esc).
    if (m) { setFocus(m, !d.mouse); flyTo(m.lat, m.lon); }
    else if (S.focus) setFocus(null);                                        // toque fuera: se cierra
  }, { capture: true });
  // La rueda sin Ctrl hace scroll de la página: el canvas es hijo del host; parar la propagación
  // en captura sobre el host impide que el listener de rueda de OrbitControls (en el canvas) la vea.
  host.addEventListener('wheel', (e) => { if (!e.ctrlKey) e.stopPropagation(); }, { capture: true });

  // Solo se dibuja (y solo dispara) cuando se ve: fuera de pantalla o pestaña oculta → pausa total
  let onScreen = true;
  const sync = () => {
    S.visible = onScreen && document.visibilityState === 'visible';
    S.visible ? g.resumeAnimation() : g.pauseAnimation();
    shotsRun(S.visible);
  };
  new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); sync(); }).observe(S.zone);
  document.addEventListener('visibilitychange', sync);
  setInterval(() => { if (onScreen && document.visibilityState === 'visible') placeLabels(); }, 500);

  let wasNarrow = narrow();
  new ResizeObserver(() => {
    if (!host.clientWidth) return;
    g.width(host.clientWidth).height(host.clientHeight);
    if (narrow() !== wasNarrow) { wasNarrow = narrow(); setGlobeData(); if (S.timer) { shotsRun(false); shotsRun(true); } }
    else refreshDots();                        // otra altura del lienzo: otro tamaño en grados
    g.resumeAnimation();
    requestAnimationFrame(() => requestAnimationFrame(sync));
  }).observe(host);

  S.mode = 'globe';
  S.zone.classList.add('is-globe');
  S.zone.classList.remove('is-flat');
  syncZoomButtons();
  // Los marcadores (nodos HTML de CSS2D) en otra tarea: la creación del globo ya es larga
  setTimeout(() => { if (S.globe) setGlobeData(); }, 0);
  // Los disparos, cuando el hilo principal se queda libre tras montar el globo (no compiten con
  // los primeros fotogramas ni con la compilación de shaders)
  const arm = () => { S.armed = true; shotsRun(S.visible); };
  setTimeout(() => { if ('requestIdleCallback' in window) requestIdleCallback(arm, { timeout: 3000 }); else arm(); }, 1500);
}

/* ───────── respaldo SVG ───────── */

function mountFlat(note) {
  const box = S.zone.querySelector('#globe-flat');
  S.flatZoom = 1;
  S.zone.dataset.disparos = 'off';
  S.flat = mountFlatGlobe(box, {
    land: S.land, markers: S.all, scale: SCALE, labels: S.labels, fmt: kfmt, reduced: S.reduced, home: HOME,
    pairs: (S.map && S.map.attack_pairs) || [], centroid: centroidOf,
    onHover: (m) => { if (!S.pinned) setFocus(m); },
    onPick: (m, touch) => { if (m) { setFocus(m, touch); S.flat.flyTo(m.lat, m.lon); } else if (S.focus) setFocus(null); },
    onSpin: (on) => { S.zone.dataset.spin = on ? 'on' : 'off'; },
    onShots: (on, n) => { S.zone.dataset.disparos = on ? 'on' : 'off'; S.zone.dataset.shots = String(n); },
  });
  S.flat.onZoom((z) => { S.flatZoom = z; syncZoomButtons(); });
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
  // Panel de país fijado (toque): se cierra con un toque fuera del globo o con Esc
  document.addEventListener('pointerdown', (e) => { if (S.pinned && !S.zone.contains(e.target)) setFocus(null); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.focus) setFocus(null); });
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
  if (S.mode === 'globe' && S.globe) { setGlobeData(); shotsRun(S.visible); }
  else if (S.mode === 'flat' && S.flat) { S.flat.update(S.all, SCALE, S.labels, (S.map && S.map.attack_pairs) || []); showPanel(S.focus); }
}

