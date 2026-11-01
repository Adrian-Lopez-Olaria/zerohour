/* =============================================================================
   render/comunes.js · piezas de interfaz compartidas por las vistas
   Todo se construye con el()/svg(): sin innerHTML. Los textos de datos van
   siempre como texto; las URLs externas, por safeUrl().
   ============================================================================= */
import { el, svg, safeUrl } from '../util/dom.js';
import { sevKey, ID_RE } from '../data.js';
import { clamp, scoreVar } from '../util/format.js';

export const SEV = Object.freeze({
  CRITICAL: { label: 'CRÍTICA', bars: 4 },
  HIGH: { label: 'ALTA', bars: 3 },
  MEDIUM: { label: 'MEDIA', bars: 2 },
  LOW: { label: 'BAJA', bars: 1 },
  UNSCORED: { label: 'SIN PUNTUAR', bars: 0 },
});
export const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNSCORED'];

export const TAG = Object.freeze({
  kev: { short: 'KEV', long: 'EXPLOTADA', title: 'Explotada activamente (catálogo KEV de CISA)' },
  ransomware: { short: 'RANSOM', long: 'RANSOMWARE', title: 'Uso conocido en campañas de ransomware' },
  poc: { short: 'POC', long: 'EXPLOIT PÚBLICO', title: 'Exploit o prueba de concepto pública' },
  stack: { short: 'STACK', long: 'MI STACK', title: 'Afecta a productos de mi inventario' },
  incibe: { short: 'INCIBE', long: 'AVISO INCIBE', title: 'Aviso publicado por INCIBE-CERT' },
  news: { short: 'NEWS', long: 'EN NOTICIAS', title: 'Cubierta por medios especializados' },
  remote: { short: 'RED', long: 'REMOTA', title: 'Explotable en remoto (vector de red)' },
  library: { short: 'LIB', long: 'LIBRERÍA', title: 'Librería o dependencia de software' },
});
export const TAG_ORDER = Object.keys(TAG);

/* Iconos propios: viewBox 16, trazo 1,5 px, extremos rectos (guía §6).
   Se describen como datos [etiqueta, atributos] para montarlos con svg(). */
const FILLED = { fill: 'currentColor', stroke: 'none' };
const ICON = {
  kev: [['circle', { cx: 8, cy: 8, r: 5.5 }], ['path', { d: 'M8 0.8v3.4M8 11.8v3.4M0.8 8h3.4M11.8 8h3.4' }], ['rect', { x: 6.9, y: 6.9, width: 2.2, height: 2.2, ...FILLED }]],
  ransomware: [['rect', { x: 2.5, y: 7, width: 11, height: 7.5 }], ['path', { d: 'M5 7V4.8a3 3 0 0 1 6 0V7' }], ['path', { d: 'M8 9.6v2.4' }]],
  poc: [['path', { d: 'M2.5 4l4 4-4 4M8.5 12.5h5.5' }]],
  stack: [['path', { d: 'M8 1.8 14.5 5 8 8.2 1.5 5Z' }], ['path', { d: 'M1.5 8.2 8 11.4l6.5-3.2M1.5 11.4 8 14.6l6.5-3.2' }]],
  incibe: [['path', { d: 'M8 1.2 14 3.5v4.2c0 3.4-2.6 6.1-6 7.1-3.4-1-6-3.7-6-7.1V3.5Z' }], ['path', { d: 'M8 4.8v4.4M8 10.8v1.4' }]],
  news: [['rect', { x: 1.5, y: 2.5, width: 13, height: 11 }], ['path', { d: 'M4 5.5h5M4 8h8M4 10.5h8' }], ['rect', { x: 10.5, y: 4.5, width: 2, height: 2, ...FILLED }]],
  remote: [['circle', { cx: 8, cy: 12, r: 1.3, ...FILLED }], ['path', { d: 'M4.6 8.8a4.8 4.8 0 0 1 6.8 0M2 6a8.5 8.5 0 0 1 12 0' }]],
  library: [['path', { d: 'M8 1.5 14 4.7v6.6L8 14.5 2 11.3V4.7Z' }], ['path', { d: 'M2 4.7 8 8l6-3.3M8 8v6.5' }]],
  search: [['circle', { cx: 7, cy: 7, r: 5 }], ['path', { d: 'M10.6 10.6 15 15' }]],
  star: [['path', { d: 'M8 1.6l1.9 4 4.4.5-3.3 3 .9 4.3L8 11.2l-3.9 2.2.9-4.3-3.3-3 4.4-.5Z' }]],
  alert: [['path', { d: 'M8 1.5 15 14H1Z' }], ['path', { d: 'M8 6v4M8 11.6v1.2' }]],
  empty: [['circle', { cx: 8, cy: 8, r: 6.5 }], ['circle', { cx: 8, cy: 8, r: 3.5 }], ['path', { d: 'M8 8 13.5 4.5' }]],
};

export function icon(name, cls) {
  return svg('svg', {
    class: cls, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5',
    'stroke-linecap': 'square', 'stroke-linejoin': 'miter', 'aria-hidden': 'true', focusable: 'false',
  }, (ICON[name] || []).map(([tag, attrs]) => svg(tag, attrs)));
}

/** Enlace interno a la ficha; null si el ID no cumple ^CVE-\d{4}-\d{4,7}$. */
export const cveHref = (id) => (ID_RE.test(String(id)) ? '#cve/' + id : null);
export const isProv = (c) => c.cvss == null;

/** Etiqueta de severidad: barras 1–4 + texto (sin puntuar = barras huecas). */
export function sevTag(severity) {
  const k = sevKey(severity), n = SEV[k].bars;
  return el('span', { class: `sev sev--${k}` }, [
    el('span', { class: 'sev__bars', 'aria-hidden': 'true' }, [1, 2, 3, 4].map((i) => el('i', { class: i <= n ? null : 'off' }))),
    SEV[k].label,
  ]);
}

/** Chips de etiqueta, en el orden fijo de la guía. Solo se pintan tags conocidos. */
export function chips(tags, long = false) {
  const list = TAG_ORDER.filter((t) => tags.includes(t));
  if (!list.length) return el('span', { class: 'label', text: '—' });
  return el('span', { class: 'chips' + (long ? ' chips--lg' : '') }, list.map((t) =>
    el('span', { class: `chip chip--${t}`, title: TAG[t].title }, [icon(t), long ? TAG[t].long : TAG[t].short])));
}

/** Barra de score 0–100 con marcas en 40/70/85; rayada y con * si es provisional. */
export function sbar(c) {
  const prov = isProv(c);
  const v = clamp(Math.round(c.score), 0, 100);
  return el('span', {
    class: 'sbar' + (prov ? ' sbar--prov' : ''), role: 'img',
    'aria-label': `Score ${v} de 100${prov ? ', provisional' : ''}`,
    style: { '--v': v, '--sc': scoreVar(v) },
  }, [
    el('span', { class: 'sbar__track' }, el('span', { class: 'sbar__fill' })),
    el('span', { class: 'sbar__n', text: v }),
  ]);
}

export function panelHead(code, title, meta, id) {
  return el('div', { class: 'panel__head' }, [
    el('span', { class: 'panel__code', text: code }),
    el('h2', { class: 'panel__title', id, text: title }),
    meta ? el('span', { class: 'panel__meta', text: meta }) : null,
  ]);
}

export function emptyBlock(title, text, tight = false) {
  return el('div', { class: 'empty' + (tight ? ' empty--tight' : '') }, [
    tight ? null : icon('empty', 'empty__glyph'),
    title ? el('h3', { text: title }) : null,
    el('p', { text }),
  ]);
}

/**
 * Enlace externo seguro. Si la URL no es http(s) válida, devuelve un <span> con el
 * mismo contenido (el dato se ve, pero no es clicable). PoC: pasa ugc = true.
 */
export function extLink(url, attrs = {}, children, { ugc = false } = {}) {
  const safe = safeUrl(url);
  if (!safe) return el('span', { class: attrs.class }, children);
  return el('a', { ...attrs, href: safe, target: '_blank', rel: ugc ? 'noopener noreferrer nofollow ugc' : 'noopener noreferrer' }, children);
}
