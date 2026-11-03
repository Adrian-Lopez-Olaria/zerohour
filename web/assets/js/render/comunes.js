/* =============================================================================
   render/comunes.js · piezas de interfaz compartidas por las vistas
   Todo se construye con el()/svg(): sin innerHTML. Los textos de datos van
   siempre como texto; las URLs externas, por safeUrl().
   ============================================================================= */
import { el, svg, safeUrl } from '../util/dom.js';
import { sevKey, ID_RE } from '../data.js';
import { clamp, scoreVar, dLong, verdictBand, pad, fmtCvss, fmtPctl } from '../util/format.js';

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
  ssvc: { short: 'SSVC', long: 'EXPLOTADA · SSVC', title: 'CISA la marca como explotada (SSVC «active»); aún no está en el catálogo KEV' },
  ransomware: { short: 'RANSOM', long: 'RANSOMWARE', title: 'Uso conocido en campañas de ransomware' },
  exploit: { short: 'EXPLOIT', long: 'EXPLOIT VERIFICADO', title: 'Exploit verificado: módulo de Metasploit o exploit verificado de Exploit-DB' },
  deteccion: { short: 'DETECCIÓN', long: 'PLANTILLA DE DETECCIÓN', title: 'Plantilla de detección de Nuclei: hay una forma comprobada de disparar el fallo' },
  poc: { short: 'POC', long: 'POC SIN VERIFICAR', title: 'PoC pública sin verificar (PoC-in-GitHub, Exploit-DB sin verificar o referencia de NVD)' },
  stack: { short: 'STACK', long: 'MI STACK', title: 'Afecta a productos de mi inventario' },
  incibe: { short: 'INCIBE', long: 'AVISO INCIBE', title: 'Aviso publicado por INCIBE-CERT' },
  certeu: { short: 'CERT-EU', long: 'AVISO CERT-EU', title: 'Aviso de CERT-EU (solo publica los que considera graves)' },
  news: { short: 'NEWS', long: 'EN NOTICIAS', title: 'Cubierta por medios especializados' },
  remote: { short: 'RED', long: 'REMOTA', title: 'Explotable en remoto (vector de red)' },
  library: { short: 'LIB', long: 'LIBRERÍA', title: 'Librería o dependencia de software' },
});
export const TAG_ORDER = Object.keys(TAG);

/* Veredictos: cortes y textos sin cambios (85 / 70 / 40); v2 añade clase y forma propias */
export const VERDICTS = Object.freeze([
  { key: 'hoy', band: 3, label: 'ACTUAR HOY' },
  { key: 'semana', band: 2, label: 'ESTA SEMANA' },
  { key: 'planificar', band: 1, label: 'PLANIFICAR' },
  { key: 'vigilar', band: 0, label: 'VIGILAR' },
]);
export const verdictOf = (score) => VERDICTS[3 - verdictBand(score)];

/** Veredicto con su forma (■ ◧ □ ○): se lee sin depender del color. */
export function vtag(v, extra) {
  return el('span', { class: `vtag v-${v.key}` }, [v.label, extra]);
}

/* Iconos propios: viewBox 16, trazo 1,5 px, extremos rectos (guía §6).
   Se describen como datos [etiqueta, atributos] para montarlos con svg(). */
const FILLED = { fill: 'currentColor', stroke: 'none' };
const ICON = {
  kev: [['circle', { cx: 8, cy: 8, r: 5.5 }], ['path', { d: 'M8 0.8v3.4M8 11.8v3.4M0.8 8h3.4M11.8 8h3.4' }], ['rect', { x: 6.9, y: 6.9, width: 2.2, height: 2.2, ...FILLED }]],
  // ssvc: la retícula de KEV con el aro discontinuo y el centro hueco (misma familia, menos certeza)
  ssvc: [['circle', { cx: 8, cy: 8, r: 5.5, 'stroke-dasharray': '2.4 1.9' }], ['path', { d: 'M8 0.8v3.4M8 11.8v3.4M0.8 8h3.4M11.8 8h3.4' }], ['circle', { cx: 8, cy: 8, r: 1.2 }]],
  // exploit: el prompt de poc con una marca de verificación
  exploit: [['path', { d: 'M2 3.5l3.5 3.5L2 10.5' }], ['path', { d: 'M7.6 11.2l2.2 2.3 4.6-5.3' }]],
  // deteccion: esquinas de un visor con una línea de barrido (escáner, no arma)
  deteccion: [['path', { d: 'M1.5 5V1.5H5M11 1.5h3.5V5M14.5 11v3.5H11M5 14.5H1.5V11' }], ['path', { d: 'M4 8h8' }]],
  ransomware: [['rect', { x: 2.5, y: 7, width: 11, height: 7.5 }], ['path', { d: 'M5 7V4.8a3 3 0 0 1 6 0V7' }], ['path', { d: 'M8 9.6v2.4' }]],
  poc: [['path', { d: 'M2.5 4l4 4-4 4M8.5 12.5h5.5' }]],
  stack: [['path', { d: 'M8 1.8 14.5 5 8 8.2 1.5 5Z' }], ['path', { d: 'M1.5 8.2 8 11.4l6.5-3.2M1.5 11.4 8 14.6l6.5-3.2' }]],
  incibe: [['path', { d: 'M8 1.2 14 3.5v4.2c0 3.4-2.6 6.1-6 7.1-3.4-1-6-3.7-6-7.1V3.5Z' }], ['path', { d: 'M8 4.8v4.4M8 10.8v1.4' }]],
  // certeu: el escudo de los avisos oficiales con un aro de 8 puntos (la UE) en lugar de la exclamación
  certeu: [['path', { d: 'M8 1.2 14 3.5v4.2c0 3.4-2.6 6.1-6 7.1-3.4-1-6-3.7-6-7.1V3.5Z' }], ['circle', { cx: 8, cy: 7.6, r: 2.6, 'stroke-dasharray': '0.9 1.14' }]],
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

/** Orden de urgencia (= rank_key de radar.py): primero el veredicto, que puede venir de un mínimo,
    y dentro de cada veredicto la suma real de filas: el mínimo no adelanta a quien tiene más mérito. */
export const byUrgency = (a, b) => verdictBand(b.score) - verdictBand(a.score) || b.rows_sum - a.rows_sum
  || (b.cvss ?? -1) - (a.cvss ?? -1) || a.id.localeCompare(b.id);

/** Etiqueta de severidad: barras 1–4 + texto (sin puntuar = barras huecas). */
export function sevTag(severity) {
  const k = sevKey(severity), n = SEV[k].bars;
  return el('span', { class: `sev sev--${k}` }, [
    el('span', { class: 'sev__bars', 'aria-hidden': 'true' }, [1, 2, 3, 4].map((i) => el('i', { class: i <= n ? null : 'off' }))),
    SEV[k].label,
  ]);
}

/**
 * Chips de etiqueta, en el orden aprobado. Solo se pintan tags conocidos.
 * max: como mucho N chips y uno «+N» con el resto en title y en texto para lectores de pantalla.
 */
export function chips(tags, long = false, max = 0) {
  const list = TAG_ORDER.filter((t) => tags.includes(t));
  if (!list.length) return long ? null : el('span', { class: 'label', text: '—' });
  const shown = max ? list.slice(0, max) : list, rest = list.slice(shown.length);
  const restTxt = rest.map((t) => TAG[t].long).join(' · ');
  return el('span', { class: 'chips' + (long ? ' chips--lg' : '') }, [
    ...shown.map((t) => el('span', { class: `chip chip--${t}`, title: TAG[t].title }, [icon(t), long ? TAG[t].long : TAG[t].short])),
    rest.length ? el('span', { class: 'chip chip--more', title: restTxt }, [`+${rest.length}`, el('span', { class: 'sr-only', text: `: ${restTxt}` })]) : null,
  ]);
}

/** Score v2: cifra en el color del veredicto + barra 64 × 4 con marcas 40/70/85; * si es provisional. */
export function scoreCell(c) {
  const prov = isProv(c), v = verdictOf(c.score);
  const n = clamp(Math.round(c.score), 0, 100);
  return el('span', {
    class: `score v-${v.key}${prov ? ' score--prov' : ''}`, role: 'img',
    'aria-label': `Score ${n} de 100${prov ? ', provisional' : ''}, ${v.label}`,
  }, [
    el('span', { class: 'score__n', 'aria-hidden': 'true' }, [String(n), prov ? el('sup', { text: '*' }) : null]),
    el('span', { class: 'score__bar', 'aria-hidden': 'true', style: { '--v': n } }, el('i')),
  ]);
}

/** Texto completo de una fila para lectores de pantalla (la fila es un único enlace). */
export function rowLabel(c, pos) {
  const tags = TAG_ORDER.filter((t) => c.tags.includes(t)).map((t) => TAG[t].long.toLowerCase());
  const k = sevKey(c.severity);
  return `${pos ? pos + '. ' : ''}${c.id}, ${whoLine(c)}, score ${c.score}${isProv(c) ? ' provisional' : ''}, ${verdictOf(c.score).label.toLowerCase()}, `
    + `${k === 'UNSCORED' ? 'sin puntuar' : `CVSS ${fmtCvss(c.cvss)} ${SEV[k].label.toLowerCase()}`}, EPSS ${fmtPctl(c.epss_percentile)}`
    + (tags.length ? `, ${tags.join(', ')}` : '');
}

/** Fabricante · producto, o «Fabricante pendiente en NVD · CNA x» en cursiva. */
export function vendorCell(c) {
  const w = who(c);
  return el('span', { class: 'row__vp' }, w.pending
    ? [w.sub ? `${w.sub} · ` : null, el('span', { class: 'pend', text: w.pendingText })]
    : w.line);
}

/**
 * Fila de CVE v2 (top y listado): posición | ID + fabricante / severidad, CVSS, EPSS y chips | score.
 * Borde izquierdo en el color del veredicto; VIGILAR atenuada. opts: { pos, chipsMax, desc, extra }.
 */
export function cveRow(c, opts = {}) {
  const v = verdictOf(c.score), href = cveHref(c.id);
  const cells = [
    el('span', { class: 'row__n', 'aria-hidden': 'true', text: opts.pos ? pad(opts.pos) : '' }),
    el('span', { class: 'row__main' }, [
      el('span', { class: 'row__l1' }, [el('span', { class: 'row__id', text: c.id }), vendorCell(c)]),
      el('span', { class: 'row__l2' }, [
        el('span', { class: 'row__meta' }, [sevTag(c.severity), el('span', { text: `CVSS ${fmtCvss(c.cvss)}` }), el('span', { text: `EPSS ${fmtPctl(c.epss_percentile)}` })]),
        c.tags.length ? chips(c.tags, false, opts.chipsMax || 3) : null,
      ]),
      opts.desc ? el('span', { class: 'row__desc', lang: 'en', text: c.description || '' }) : null,
    ]),
    el('span', { class: 'row__score' }, scoreCell(c)),
  ];
  const cls = `row v-${v.key}${v.key === 'vigilar' ? ' is-dim' : ''}`;
  const row = href ? el('a', { class: cls, href, 'aria-label': rowLabel(c, opts.pos) }, cells) : el('div', { class: cls }, cells);
  return el('li', { class: opts.extra ? 'is-extra' : null }, row);
}

/**
 * Filas agrupadas por veredicto, en el orden recibido (ya por urgencia): una cabecera .grp
 * «■ ACTUAR HOY ······ 2 CVE» cada vez que cambia. opts.limit: las filas desde ese índice
 * llevan .is-extra (en móvil se ocultan hasta «Ver las 10»). opts.start: numeración.
 */
export function groupedRows(list, opts = {}) {
  const out = [];
  const start = opts.start || 0;
  let i = 0;
  while (i < list.length) {
    const v = verdictOf(list[i].score);
    let j = i;
    while (j < list.length && verdictOf(list[j].score) === v) j++;
    const total = opts.totals ? opts.totals[v.key] : j - i;
    const extra = opts.limit != null && i >= opts.limit;
    out.push(el('div', { class: 'grp' + (extra ? ' is-extra' : '') }, [vtag(v), el('span', { class: 'grp__n', text: `${total} CVE` })]));
    out.push(el('ol', { class: 'rows__list', start: String(start + i + 1) }, list.slice(i, j).map((c, k) =>
      cveRow(c, { ...opts, pos: opts.numbered === false ? 0 : start + i + k + 1, extra: opts.limit != null && i + k >= opts.limit }))));
    i = j;
  }
  return out;
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

/** Cabecera de panel. v2: sin códigos de sección (el primer argumento se ignora). */
export function panelHead(code, title, meta, id) {
  return el('div', { class: 'panel__head' }, [
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

export const PENDING_VENDOR = 'Fabricante pendiente en NVD';

/**
 * Quién: fabricante y producto. Si NVD aún no da fabricante, NUNCA se presenta la CNA como tal:
 * «Fabricante pendiente en NVD · CNA x» (la CNA es quien publicó la CVE, no quien la fabrica).
 * → { main, sub, pending, pendingText, cna, line }
 */
export function who(c) {
  if (c.vendor) {
    // "GitLab / GitLab": si el producto se llama igual que el fabricante, no se repite
    const same = c.product && c.vendor.toLowerCase() === c.product.toLowerCase();
    const sub = same ? '' : c.product;
    return { main: c.vendor, sub, pending: false, cna: c.cna, line: [c.vendor, sub].filter(Boolean).join(' · ') };
  }
  const pendingText = PENDING_VENDOR + (c.cna ? ` · CNA ${c.cna}` : '');
  return { main: '', sub: c.product, pending: true, pendingText, cna: c.cna, line: [c.product, pendingText].filter(Boolean).join(' · ') };
}
/** Una línea: «Fabricante · Producto» o «Fabricante pendiente en NVD · CNA x». */
export const whoLine = (c) => who(c).line;

const AV_LABEL = { NETWORK: 'RED', ADJACENT_NETWORK: 'ADYACENTE', ADJACENT: 'ADYACENTE', LOCAL: 'LOCAL', PHYSICAL: 'FÍSICO' };
/** Vector de ataque de NVD → etiqueta corta (sin dato: PENDIENTE). */
export const avLabel = (v) => AV_LABEL[String(v || '').toUpperCase()] || 'PENDIENTE';

const LANG_RE = /^[a-z]{2,3}(-[A-Za-z]{2})?$/;
/** Valor seguro para el atributo lang (viene de los datos): solo códigos tipo "es" o "en-GB". */
export const langOf = (l) => (LANG_RE.test(String(l || '')) ? String(l) : null);

/** "host/ruta" legible de una URL http(s) ya validada; '' si no lo es. */
export function hostPath(url) {
  const safe = safeUrl(url);
  if (!safe) return '';
  const u = new URL(safe);
  const p = (u.pathname + u.search).replace(/\/$/, '');
  return u.host + (p.length > 48 ? p.slice(0, 47) + '…' : p);
}

/** Aviso de que se está viendo una edición pasada, con vuelta a hoy. */
export function editionBanner(edition, onBack) {
  if (!edition || edition.today) return null;
  return el('div', { class: 'edition', role: 'status' }, [
    el('b', { text: 'EDICIÓN HISTÓRICA' }),
    el('span', { text: dLong(edition.date) }),
    el('button', { type: 'button', class: 'btn btn--ghost edition__back', text: 'VOLVER A HOY', on: { click: onBack } }),
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
