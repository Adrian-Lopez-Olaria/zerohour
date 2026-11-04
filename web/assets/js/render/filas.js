/* =============================================================================
   render/filas.js · fila de CVE de Órbita y sus piezas (guía Órbita §5.3–5.5)
   Las usan el top 10, el listado y la ficha:
   - orbRow(c): fila ACCIONABLE (actuar hoy, esta semana, planificar) en 5 líneas o
     COMPACTA («vigilar») en una; el ID es un enlace que cubre toda la fila.
   - orbRows(list): filas con un rótulo por veredicto (forma, texto y número).
   - dueLine(c, edicion): plazo de CISA (kev.due_date) contado en días naturales.
   - breakdownBar(c): desglose del score (score_breakdown y floor) en barra y en texto.
   Todo con el()/svg(): sin innerHTML; los textos de datos van siempre como texto.
   ============================================================================= */
import { el, svg } from '../util/dom.js';
import { TAG, TAG_ORDER, verdictOf, vshape, icon, cveHref, isProv, who } from './comunes.js';
import { pad, nf, daysBetween, dDayMonYmd } from '../util/format.js';

/* ───────── chips (3 + «+N»; en las compactas, sin icono) ───────── */

export function orbChips(tags, { max = 3, icons = true } = {}) {
  const list = TAG_ORDER.filter((t) => tags.includes(t));
  if (!list.length) return null;
  const shown = list.slice(0, max), rest = list.slice(shown.length);
  const restTxt = rest.map((t) => TAG[t].long).join(' · ');
  return el('span', { class: 'chips' }, [
    ...shown.map((t) => el('span', { class: `chip chip--${t}`, title: TAG[t].title }, [
      icons ? icon(t) : null,
      el('span', { 'aria-hidden': 'true', text: TAG[t].short }),
      el('span', { class: 'sr-only', text: TAG[t].long }),
    ])),
    rest.length ? el('span', { class: 'chip chip--more', title: restTxt }, [`+${rest.length}`, el('span', { class: 'sr-only', text: `: ${restTxt}` })]) : null,
  ]);
}

/* ───────── fabricante · producto ───────── */

export function whoEl(c) {
  const w = who(c);
  return w.pending
    ? [w.sub ? `${w.sub} · ` : null, el('span', { class: 'pend', text: w.pendingText })]
    : [el('span', { class: 'who__v', text: w.main }), w.sub ? el('span', { class: 'who__p', text: ` · ${w.sub}` }) : null];
}

/* ───────── score ───────── */

const floorOf = (c) => c.score_floor || null;

export function scoreLabel(c) {
  const v = verdictOf(c.score), f = floorOf(c);
  return `Score ${c.score} de 100${isProv(c) ? ', provisional (sin CVSS)' : ''}`
    + `${f ? `, mínimo por explotada (${f.exploited_by.toUpperCase()})` : ''}, ${v.label.toLowerCase()}`;
}

export function scoreBox(c, { note = true } = {}) {
  const f = floorOf(c);
  const x = !note ? null : isProv(c) ? 'prov.' : f ? 'mín.' : null;
  return el('span', { class: 'oscore', role: 'img', 'aria-label': scoreLabel(c) }, [
    el('span', { class: 'oscore__n', 'aria-hidden': 'true', text: String(c.score) }),
    x ? el('span', { class: 'oscore__x', 'aria-hidden': 'true', text: x }) : null,
  ]);
}

const fmtCv = (c) => (c.cvss == null ? 'sin CVSS' : `CVSS ${c.cvss.toFixed(1).replace('.', ',')}`);

/* ───────── plazo de CISA (§5.4) ─────────
   kev.due_date es una fecha sin hora: se cuentan días naturales entre dos fechas de calendario
   (la de la edición en Europe/Madrid y la del plazo), sin restar timestamps, para que el
   cambio de hora no sume ni reste un día. */
export function dueDays(c, edicion) {
  if (!c.kev || !c.kev.due_date) return null;
  return daysBetween(edicion, c.kev.due_date);
}

export function dueLine(c, edicion) {
  const n = dueDays(c, edicion);
  if (n == null) return null;
  const when = n < 0 ? `vencido hace ${-n} ${n === -1 ? 'día' : 'días'}` : n === 0 ? 'vence hoy' : `en ${n} ${n === 1 ? 'día' : 'días'}`;
  return el('span', {
    class: 'odue' + (n <= 2 ? ' is-near' : ''),
    title: 'Fecha límite de CISA para que las agencias federales de EE. UU. apliquen el parche (catálogo KEV)',
  }, [el('span', { class: 'odue__k', text: 'Plazo CISA' }), ` ${dDayMonYmd(c.kev.due_date)} · ${when}`]);
}

/* ───────── desglose del score (§5.5) ───────── */

const PARTS = [['cvss', 'CVSS'], ['epss', 'EPSS'], ['explotada', 'Explotada'], ['kev', 'KEV'], ['ransomware', 'Ransomware'], ['exploit', 'Exploit'], ['poc', 'PoC'], ['stack', 'Mi stack']];
const BD_CLASS = { kev: 'explotada', poc: 'exploit' };     // filas de ediciones antiguas: mismo color

/** Barra de 0 a 100 (segmentos de score_breakdown) + texto. El color nunca es la única pista. */
export function breakdownBar(c) {
  const b = c.score_breakdown;
  if (!b) return null;
  let x = 0;
  const segs = [], txt = [];
  for (const [k, l] of PARTS) {
    const v = Number(b[k]) || 0;
    if (v <= 0) continue;
    const w = Math.min(v, 100 - x);
    if (w > 0) segs.push(svg('rect', { x: x.toFixed(2), y: 0, width: Math.max(0, w - 0.5).toFixed(2), height: 6, class: `obd__${BD_CLASS[k] || k}` }));
    x += v;
    txt.push(`${l} ${nf(Math.round(v))}`);
  }
  const f = floorOf(c);
  if (f && f.value > x) {
    segs.push(svg('rect', { x: x.toFixed(2), y: 0.3, width: (f.value - x).toFixed(2), height: 5.4, class: 'obd__floor' }));
    txt.push(`mín. ${f.exploited_by.toUpperCase()} hasta ${f.value}`);
  }
  return el('div', { class: 'obd' }, [
    svg('svg', { viewBox: '0 0 100 6', preserveAspectRatio: 'none', class: 'obd__bar', role: 'img', 'aria-label': `Desglose del score: ${txt.join(', ')}` },
      [svg('rect', { x: 0, y: 0, width: 100, height: 6, class: 'obd__t' }), ...segs]),
    el('p', { class: 'obd__l', 'aria-hidden': 'true', text: txt.join(' · ') }),
  ]);
}

/* ───────── fila ───────── */

/**
 * Fila del top / listado. opts: { pos, edicion, desc }.
 * El ID es el enlace a la ficha y cubre toda la fila (zona táctil grande); data-id enlaza la
 * fila con su punto del radar.
 */
export function orbRow(c, opts = {}) {
  const v = verdictOf(c.score), href = cveHref(c.id);
  const idEl = href ? el('a', { class: 'oid', href, text: c.id }) : el('span', { class: 'oid', text: c.id });
  const pos = el('span', { class: 'orow__pos', 'aria-hidden': 'true', text: opts.pos ? pad(opts.pos) : '' });
  const desc = opts.desc && c.description ? el('p', { class: 'orow__desc', lang: 'en', text: c.description }) : null;
  if (v.key === 'vigilar') {
    return el('li', { class: `orow orow--min v-${v.key}`, dataset: { id: c.id } }, [
      pos,
      el('div', { class: 'orow__main' }, [
        el('p', { class: 'orow__l1' }, [idEl, el('span', { class: 'orow__who' }, whoEl(c))]),
        el('div', { class: 'orow__l3' }, [orbChips(c.tags, { icons: false }), el('span', { class: 'orow__cv', text: fmtCv(c) })]),
        desc,
      ]),
      scoreBox(c, { note: false }),
    ]);
  }
  return el('li', { class: `orow v-${v.key}`, dataset: { id: c.id } }, [
    pos,
    el('div', { class: 'orow__main' }, [
      el('p', { class: 'orow__l1' }, [vshape(v), idEl]),
      el('p', { class: 'orow__who' }, whoEl(c)),
      el('div', { class: 'orow__l3' }, [orbChips(c.tags), el('span', { class: 'orow__cv', text: fmtCv(c) })]),
      opts.edicion ? dueLine(c, opts.edicion) : null,
      breakdownBar(c),
      desc,
    ]),
    scoreBox(c),
  ]);
}

/** Rótulo de grupo: forma + texto en MAYÚSCULAS (por CSS) + número de CVE de ese veredicto. */
export function groupHead(v, n) {
  return el('li', { class: `ogrp v-${v.key}` }, [vshape(v), el('span', { class: 'ogrp__t', text: v.label }), el('span', { class: 'ogrp__n', text: nf(n) })]);
}

/**
 * Filas con un rótulo por veredicto, en el orden recibido (por urgencia). opts.totals: número
 * por veredicto (si no, se cuentan en la lista); opts.start: numeración; opts.rowFn: fila en caché.
 */
export function orbRows(list, opts = {}) {
  const out = [];
  let last = null;
  const count = (k) => (opts.totals ? opts.totals[k] || 0 : list.filter((c) => verdictOf(c.score).key === k).length);
  list.forEach((c, i) => {
    const v = verdictOf(c.score);
    if (v !== last && !opts.noGroups) { out.push(groupHead(v, count(v.key))); last = v; }
    out.push(opts.rowFn ? opts.rowFn(c, (opts.start || 0) + i + 1) : orbRow(c, { ...opts, pos: (opts.start || 0) + i + 1 }));
  });
  return el('ol', { class: 'orows' }, out);
}

/** Pie de las listas: PoC* (obligatorio si sale alguna), mín. y prov. */
export function rowsFoot(list) {
  const poc = list.some((c) => c.tags.includes('poc'));
  return el('p', { class: 'ofoot', text: `${poc ? 'PoC* = PoC pública sin verificar. ' : ''}mín. = mínimo por explotada · prov. = sin CVSS.` });
}
