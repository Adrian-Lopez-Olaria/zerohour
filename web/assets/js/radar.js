/* =============================================================================
   radar.js · radar de urgencia del top 10
   Distancia al centro = urgencia (centro = 100) · ángulo = fabricante (guía §5).
   SVG montado con svg(): los colores y la tipografía van por clase CSS, nada inline.
   ============================================================================= */
import { el, svg, frag } from './util/dom.js';
import { scoreBand } from './util/format.js';
import { cveHref } from './render/comunes.js';

const C = 150;                        // centro en un lienzo de 300
const R = 118;                        // radio útil
const SWEEP_S = 6;                    // = --t-radar; sincroniza el destello de cada blip
const RINGS = [[85, 'HOY'], [70, 'SEMANA'], [40, 'PLANIF.']];

const rOf = (s) => 6 + (100 - s) / 100 * (R - 6);
const f1 = (n) => n.toFixed(1);
function polar(r, deg) {
  const t = deg * Math.PI / 180;
  return [C + r * Math.sin(t), C - r * Math.cos(t)];
}
// Sin fabricante en NVD: se agrupa por el CNA que la publicó (p. ej. vuldb.com)
const vendorOf = (c) => c.vendor || c.cna || 'Sin fabricante';

/** Devuelve un fragmento: SVG del radar + línea de estado + leyenda. */
export function renderRadar(top) {
  const vendors = [...new Set(top.map(vendorOf))].sort((a, b) => a.localeCompare(b, 'es'));
  const sect = 360 / vendors.length;
  const perVendor = {};
  for (const c of top) perVendor[vendorOf(c)] = (perVendor[vendorOf(c)] || 0) + 1;

  const tip = el('div', { class: 'radar-tip', 'aria-hidden': 'true' });
  const seen = {};

  const blips = top.map((c) => {
    const v = vendorOf(c);
    const n = (seen[v] = (seen[v] || 0) + 1);
    // Cada CVE del mismo fabricante ocupa su propia fracción del sector
    const ang = vendors.indexOf(v) * sect + sect * (n - 0.5) / perVendor[v];
    const [x, y] = polar(rOf(c.score), ang);
    const size = c.score >= 85 ? 5 : c.score >= 70 ? 4 : 3.2;
    const label = `${c.id} · ${v} · ${c.score}`;
    const href = cveHref(c.id);
    const show = () => { tip.textContent = label; };
    const hide = () => { tip.textContent = ''; };
    return svg(href ? 'a' : 'g', {
      class: `blip blip--${scoreBand(c.score)}`,
      href,
      'aria-label': href ? `${c.id}, ${v}, score ${c.score}` : null,
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
    const lx = C + (R + 15) * Math.sin(mid), ly = C - (R + 15) * Math.cos(mid);
    const anchor = Math.abs(Math.sin(mid)) < 0.2 ? 'middle' : Math.sin(mid) > 0 ? 'start' : 'end';
    return [
      svg('line', { class: 'radar__sector', x1: C, y1: C, x2: f1(x2), y2: f1(y2) }),
      svg('text', { class: 'radar__lbl', x: f1(lx), y: f1(ly + 3), 'text-anchor': anchor, text: v.toUpperCase().slice(0, 9) }),
    ];
  });

  const rings = RINGS.flatMap(([s, l]) => {
    const hoy = s === 85;
    return [
      svg('circle', { class: 'radar__ring' + (hoy ? ' radar__ring--hoy' : ''), cx: C, cy: C, r: f1(rOf(s)) }),
      svg('text', { class: 'radar__ringlbl' + (hoy ? ' radar__ringlbl--hoy' : ''), x: C + 3, y: f1(C - rOf(s) - 3), text: `${s} ${l}` }),
    ];
  });

  const [sx, sy] = polar(R, -0.62 * 180 / Math.PI); // cuña de ~35° detrás de la línea de barrido
  const inner = top.filter((c) => c.score >= 85);

  const radar = svg('svg', {
    class: 'radar', viewBox: '-34 -4 368 308', role: 'group',
    'aria-label': `Radar de urgencia: ${top.length} CVE del top. Distancia al centro según el score (centro = 100) y ángulo según el fabricante. ${inner.length} en el anillo interior (score 85 o más).`,
  }, [
    svg('defs', [svg('linearGradient', { id: 'zh-radar-sw', x1: 0, y1: 0, x2: 1, y2: 0 }, [
      svg('stop', { offset: 0, 'stop-color': '#38D996', 'stop-opacity': 0 }),
      svg('stop', { offset: 1, 'stop-color': '#38D996', 'stop-opacity': 0.28 }),
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

  const innerList = inner.length
    ? inner.flatMap((c, i) => {
      const href = cveHref(c.id), txt = c.id.replace(/^CVE-/, '');
      return [i ? ' · ' : null, href ? el('a', { href, text: txt }) : txt];
    })
    : [el('b', { text: 'vacío' })];

  return frag([
    radar,
    tip,
    el('div', { class: 'radar-legend' }, [
      el('span', { text: 'DISTANCIA = URGENCIA (CENTRO = 100) · ÁNGULO = FABRICANTE' }),
      el('span', ['ANILLO INTERIOR: ', ...innerList]),
    ]),
  ]);
}
