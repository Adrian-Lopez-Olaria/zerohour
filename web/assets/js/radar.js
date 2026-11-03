/* =============================================================================
   radar.js · radar de urgencia del top 10
   Distancia al centro = urgencia (centro = 100) · ángulo = fabricante.
   SVG montado con svg(): los colores y la tipografía van por clase CSS, nada inline.
   v2 (cambios-v2 §8): nombres de sector legibles (14 u, 9 caracteres), anillos a
   11,5 u, viewBox más ancho y, debajo, cómo se lee + reparto del top por veredicto.
   Un sector NUNCA se llama como una CNA: sin fabricante → «SIN FABRICANTE».
   ============================================================================= */
import { el, svg, frag } from './util/dom.js';
import { cveHref, isProv, VERDICTS, verdictOf, vtag } from './render/comunes.js';

const C = 150;                        // centro en un lienzo de 300
const R = 118;                        // radio útil
const SWEEP_S = 6;                    // = --t-radar; sincroniza el destello de cada blip
const RINGS = [[85, 'HOY'], [70, 'SEMANA'], [40, 'PLANIF.']];
export const NO_VENDOR = 'SIN FABRICANTE';

const rOf = (s) => 6 + (100 - s) / 100 * (R - 6);
const f1 = (n) => n.toFixed(1);
function polar(r, deg) {
  const t = deg * Math.PI / 180;
  return [C + r * Math.sin(t), C - r * Math.cos(t)];
}
export const vendorOf = (c) => c.vendor || NO_VENDOR;

/** Nombre del sector: 9 caracteres; «SIN FABRICANTE» en dos líneas, entero. */
function sectorLabel(v, x, y, anchor) {
  const name = v.toUpperCase();
  if (v === NO_VENDOR) {
    return svg('text', { class: 'radar__lbl radar__lbl--none', x: f1(x), y: f1(y - 4), 'text-anchor': anchor }, [
      svg('tspan', { x: f1(x), text: 'SIN' }), svg('tspan', { x: f1(x), dy: '15', text: 'FABRICANTE' }),
    ]);
  }
  return svg('text', { class: 'radar__lbl', x: f1(x), y: f1(y + 5), 'text-anchor': anchor, text: name.slice(0, 9) }, name.length > 9 ? svg('title', { text: v }) : null);
}

/** Devuelve un fragmento: SVG del radar + línea de estado + leyenda con el reparto. */
export function renderRadar(top) {
  const vendors = [...new Set(top.map(vendorOf))].sort((a, b) => a.localeCompare(b, 'es'));
  const sect = 360 / vendors.length;
  const perVendor = {};
  for (const c of top) perVendor[vendorOf(c)] = (perVendor[vendorOf(c)] || 0) + 1;

  const tip = el('div', { class: 'radar-tip', 'aria-hidden': 'true' });
  const seen = {};

  const blips = top.map((c) => {
    const v = vendorOf(c), vd = verdictOf(c.score);
    const n = (seen[v] = (seen[v] || 0) + 1);
    // Cada CVE del mismo fabricante ocupa su propia fracción del sector
    const ang = vendors.indexOf(v) * sect + sect * (n - 0.5) / perVendor[v];
    const [x, y] = polar(rOf(c.score), ang);
    const size = c.score >= 85 ? 5 : c.score >= 70 ? 4.2 : 3.4;
    const label = `${c.id} · ${v} · ${c.score}`;
    const href = cveHref(c.id);
    const show = () => { tip.textContent = label; };
    const hide = () => { tip.textContent = ''; };
    return svg(href ? 'a' : 'g', {
      class: `blip v-${vd.key}`,
      href,
      'aria-label': href ? `${c.id}, ${v.toLowerCase()}, score ${c.score}${isProv(c) ? ' provisional' : ''}, ${vd.label.toLowerCase()}` : null,
      style: { '--delay': `${f1(ang / 360 * SWEEP_S)}s` },
      on: { mouseenter: show, focus: show, mouseleave: hide, blur: hide },
    }, [
      svg('circle', { class: 'hit', cx: f1(x), cy: f1(y), r: 9 }),
      svg('circle', { class: 'core', cx: f1(x), cy: f1(y), r: size }),
    ]);
  });

  const ticks = Array.from({ length: 72 }, (_, i) => {
    const deg = i * 5, major = i % 6 === 0;
    const [x1, y1] = polar(R, deg), [x2, y2] = polar(R + (major ? 6 : 3), deg);
    return svg('line', { class: 'radar__tick' + (major ? ' radar__tick--major' : ''), x1: f1(x1), y1: f1(y1), x2: f1(x2), y2: f1(y2) });
  });

  const sectors = vendors.flatMap((v, i) => {
    const a = i * sect, mid = (a + sect / 2) * Math.PI / 180;
    const [x2, y2] = polar(R, a);
    const lx = C + (R + 12) * Math.sin(mid), ly = C - (R + 12) * Math.cos(mid);
    const anchor = Math.abs(Math.sin(mid)) < 0.2 ? 'middle' : Math.sin(mid) > 0 ? 'start' : 'end';
    return [
      vendors.length > 1 ? svg('line', { class: 'radar__sector', x1: C, y1: C, x2: f1(x2), y2: f1(y2) }) : null,
      sectorLabel(v, lx, ly, anchor),
    ];
  });

  const rings = RINGS.flatMap(([s, l]) => {
    const hoy = s === 85;
    return [
      svg('circle', { class: 'radar__ring' + (hoy ? ' radar__ring--hoy' : ''), cx: C, cy: C, r: f1(rOf(s)) }),
      svg('text', { class: 'radar__ringlbl' + (hoy ? ' radar__ringlbl--hoy' : ''), x: C + 3, y: f1(C - rOf(s) - 3), text: l }),
    ];
  });

  const [sx, sy] = polar(R, -0.62 * 180 / Math.PI); // cuña de ~35° detrás de la línea de barrido
  const dist = VERDICTS.map((v) => [v, top.filter((c) => verdictOf(c.score) === v).length]);

  const radar = svg('svg', {
    class: 'radar', viewBox: '-80 -18 460 336', role: 'group',
    'aria-label': `Radar de urgencia: ${top.length} CVE del top. Distancia al centro según el score (centro = 100) y ángulo según el fabricante. `
      + dist.filter(([, n]) => n).map(([v, n]) => `${v.label.toLowerCase()}: ${n}`).join(', ') + '.',
  }, [
    svg('defs', [svg('linearGradient', { id: 'zh-radar-sw', x1: 0, y1: 0, x2: 1, y2: 0 }, [
      svg('stop', { offset: 0, 'stop-color': '#38D996', 'stop-opacity': 0 }),
      svg('stop', { offset: 1, 'stop-color': '#38D996', 'stop-opacity': 0.22 }),
    ])]),
    svg('circle', { class: 'radar__disc', cx: C, cy: C, r: R }),
    ...ticks, ...sectors, ...rings,
    svg('g', { class: 'radar__sweep', 'aria-hidden': 'true' }, [
      svg('path', { d: `M${C} ${C} L${f1(sx)} ${f1(sy)} A${R} ${R} 0 0 1 ${C} ${C - R} Z`, fill: 'url(#zh-radar-sw)' }),
      svg('line', { class: 'radar__beam', x1: C, y1: C, x2: C, y2: C - R }),
    ]),
    svg('circle', { class: 'radar__center', cx: C, cy: C, r: 2 }),
    ...blips,
  ]);

  return frag([
    radar,
    tip,
    el('div', { class: 'radar-legend' }, [
      el('span', { text: 'Cuanto más al centro, más urgente. Cada sector es un fabricante.' }),
      el('ul', { class: 'vdist', 'aria-label': 'Reparto del top por veredicto' }, dist.map(([v, n]) =>
        el('li', { class: n ? null : 'is-zero' }, [vtag(v), el('b', { text: String(n) })]))),
      top.some(isProv) ? el('span', { text: '* Score provisional: NVD aún no ha puntuado la CVE.' }) : null,
    ]),
  ]);
}
