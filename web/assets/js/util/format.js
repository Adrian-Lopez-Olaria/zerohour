/* =============================================================================
   util/format.js · cifras, fechas, bandas de score y horario del pipeline
   Funciones puras: no tocan el DOM.
   ============================================================================= */

export const TZ = 'Europe/Madrid';

/* Horario de .github/workflows/radar.yml (UTC). Si cambia el cron, cambia aquí.
   GitHub puede retrasar los cron programados, por eso la web habla de "≈". */
export const SCHEDULE = Object.freeze({
  briefing: { h: 5, m: 17 },          // "17 5 * * *"
  map: { everyH: 3, m: 41 },          // "41 */3 * * *"
});

export const pad = (n) => String(n).padStart(2, '0');
export const nf = (v, d = 0) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtCvss = (c) => (c == null ? '—' : c.toFixed(1));
export const fmtPctl = (p) => (p == null ? '—' : 'P' + nf(p * 100, p >= 0.995 ? 1 : 0));
export const fmtEpss = (e) => (e == null ? '—' : nf(e * 100, e < 0.01 ? 2 : 1) + ' %');
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ───────── bandas del score ZEROHOUR (marcas 40 / 70 / 85 de la guía) ───────── */
export const scoreBand = (s) => (s >= 85 ? 'critical' : s >= 70 ? 'high' : s >= 40 ? 'medium' : 'low');
export const scoreVar = (s) => `var(--sev-${scoreBand(s)})`;
export const verdictBand = (s) => (s >= 85 ? 3 : s >= 70 ? 2 : s >= 40 ? 1 : 0);
export const verdict = (s) => (s >= 85 ? 'ACTUAR HOY' : s >= 70 ? 'ESTA SEMANA' : s >= 40 ? 'PLANIFICAR' : 'VIGILAR');

/* ───────── fechas ───────── */

/** ISO → ms. Recorta fracciones de más de 3 dígitos (radar.py da microsegundos). null si no es válida. */
export function parseIso(iso) {
  if (typeof iso !== 'string' || !iso) return null;
  const s = iso.length <= 10 ? iso + 'T12:00:00Z' : iso.replace(/(\.\d{3})\d+/, '$1');
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

const fmtLong = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const fmtHM = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });

const fmtShort = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', timeZone: TZ });
const fmtWeek = new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: TZ });
const fmtYMD = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ });

export const dLong = (iso) => { const t = parseIso(iso); return t == null ? '' : fmtLong.format(t); };
export const dShort = (iso) => { const t = parseIso(iso); return t == null ? '—' : fmtShort.format(t).replace('/', '.'); };
export const dWeek = (iso) => { const t = parseIso(iso); return t == null ? '' : fmtWeek.format(t).replace('.', '').toUpperCase(); };
const fmtMid = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });
/** «LUN 02 NOV 2026» (franja de edición). */
export const dMid = (iso) => { const t = parseIso(iso); return t == null ? '—' : fmtMid.format(t).replace(/[.,]/g, '').replace(/\s+de\s+/g, ' ').toUpperCase(); };
export const dDay = (iso) => { const t = parseIso(iso); return t == null ? '' : pad(Number(fmtYMD.format(t).slice(8, 10))); };

/** Días naturales desde hoy (hora de Madrid) hasta una fecha AAAA-MM-DD. Negativo si ya pasó; null si no es válida. */
export function daysFromToday(ymd, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return null;
  const today = fmtYMD.format(now);
  const toUtc = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((toUtc(ymd) - toUtc(today)) / 86400000);
}
export const tLocal = (iso) => { const t = parseIso(iso); return t == null ? '--:--' : fmtHM.format(t); };
export const tUTC = (iso) => { const t = parseIso(iso); return t == null ? '--:--' : new Date(t).toISOString().slice(11, 16); };
export const hmUTC = (date) => `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;

/** Duración en ms → HH:MM:SS (las horas pueden pasar de 24). */
export function fmtTplus(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
}

/** Próxima ejecución diaria del briefing (UTC). */
export function nextBriefingRun(now = new Date()) {
  const { h, m } = SCHEDULE.briefing;
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m));
  if (t <= now) t.setUTCDate(t.getUTCDate() + 1);
  return t;
}

/** Próxima lectura del mapa (UTC): minuto fijo en horas múltiplo de everyH. */
export function nextMapRun(now = new Date()) {
  const { everyH, m } = SCHEDULE.map;
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), m));
  while (t <= now || t.getUTCHours() % everyH !== 0) t.setUTCHours(t.getUTCHours() + 1);
  return t;
}

/* Nombre del país en español a partir del código ISO-2 (validado), con el del navegador:
   DB-IP da nombres de estilo ISO ("Estados Unidos de América (los)") que no queremos mostrar. */
let regionNames = null;
try { regionNames = new Intl.DisplayNames(['es'], { type: 'region' }); } catch (e) { /* navegador antiguo */ }
export function countryName(cc, fallback = '') {
  if (regionNames && /^[A-Z]{2}$/.test(String(cc))) {
    try { const n = regionNames.of(cc); if (n && n !== cc) return n; } catch (e) { /* código no reconocido */ }
  }
  return fallback || String(cc || '');
}

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
