/* =============================================================================
   radar.js · radar de urgencia del top 10 (guía Órbita §5.9)
   Distancia al centro = urgencia (centro = 100) · ángulo = fabricante.
   - Anillos en 85 (discontinuo coral), 70 y 40; puntos con la FORMA de su veredicto
     (cuadrado lleno, medio, vacío y círculo), barrido azul de 6 s y núcleo en --acc.
   - Sin fabricante, el sector se llama «Sin fabricante». Nunca la CNA.
   - Cada punto lleva data-id = ID de la CVE: el briefing lo enlaza con su fila del top.
   SVG montado con svg(): colores y tipografía por clase CSS, nada inline.
   ============================================================================= */
import { el, svg, frag } from './util/dom.js';
import { cveHref, isProv, VERDICTS, verdictOf, vshape } from './render/comunes.js';

const S = 300, C = S / 2, R = S / 2 - 54;      // lienzo 300, como el prototipo
const SWEEP_S = 6;                              // = --t-radar
const RAD = Math.PI / 180;
export const NO_VENDOR = 'Sin fabricante';

const rOf = (sc) => 6 + (100 - sc) / 100 * (R - 6);
const f1 = (n) => n.toFixed(1);
const pol = (r, deg) => [C + r * Math.sin(deg * RAD), C - r * Math.cos(deg * RAD)];
export const vendorOf = (c) => c.vendor || NO_VENDOR;

/** Punto con la forma del veredicto: se distingue sin color. */
function blipShape(v, x, y, z) {
  if (v.shape === 'circle') return [svg('circle', { cx: f1(x), cy: f1(y), r: f1(z), class: 'rb__line' })];
  return [
    svg('rect', { x: f1(x - z), y: f1(y - z), width: f1(2 * z), height: f1(2 * z), class: v.shape === 'full' ? 'rb__fill' : 'rb__line' }),
    v.shape === 'half' ? svg('rect', { x: f1(x - z), y: f1(y - z), width: f1(z), height: f1(2 * z), class: 'rb__fill' }) : null,
  ];
}

/** Devuelve un fragmento: SVG del radar + línea de estado + reparto por veredicto. */
export function renderRadar(top) {
  const vendors = [...new Set(top.map(vendorOf))].sort((a, b) => a.localeCompare(b, 'es'));
  const sect = 360 / vendors.length, per = {}, seen = {};
  for (const c of top) per[vendorOf(c)] = (per[vendorOf(c)] || 0) + 1;
  const tip = el('p', { class: 'radar-tip', 'aria-hidden': 'true' });
  const kids = [svg('circle', { cx: C, cy: C, r: R, class: 'r-ring r-ring--out' })];

  for (const [sc, k] of [[85, 'hoy'], [70, 'semana'], [40, 'planificar']]) kids.push(svg('circle', { cx: C, cy: C, r: f1(rOf(sc)), class: `r-ring r-ring--${k}` }));
  vendors.forEach((v, i) => {
    const [x, y] = pol(R, i * sect);
    if (vendors.length > 1) kids.push(svg('line', { x1: C, y1: C, x2: f1(x), y2: f1(y), class: 'r-spoke' }));
    const a = (i + 0.5) * sect, [lx, ly] = pol(R + 11, a);
    const anchor = Math.abs(Math.sin(a * RAD)) < 0.2 ? 'middle' : Math.sin(a * RAD) > 0 ? 'start' : 'end';
    const name = v.length > 12 ? `${v.slice(0, 11)}…` : v;
    kids.push(svg('text', { x: f1(lx), y: f1(ly + 4), 'text-anchor': anchor, class: 'r-lbl' + (v === NO_VENDOR ? ' r-lbl--none' : '') }, [name, v.length > 12 ? svg('title', { text: v }) : null]));
  });

  // Barrido azul de 6 s detrás de los puntos (se para con reducir movimiento)
  const [ex, ey] = pol(R, 0), [wx, wy] = pol(R, -34);
  kids.push(svg('g', { class: 'r-sweep', 'aria-hidden': 'true' }, [
    svg('path', { d: `M${C} ${C}L${f1(wx)} ${f1(wy)}A${R} ${R} 0 0 1 ${f1(ex)} ${f1(ey)}Z`, class: 'r-sweep__w' }),
    svg('line', { x1: C, y1: C, x2: f1(ex), y2: f1(ey), class: 'r-sweep__l' }),
  ]));

  for (const c of top) {
    const v = verdictOf(c.score), k = vendorOf(c), n = (seen[k] = (seen[k] || 0) + 1);
    const ang = vendors.indexOf(k) * sect + sect * (n - 0.5) / per[k];
    const [x, y] = pol(rOf(c.score), ang), z = 6 * (v.key === 'hoy' ? 1.25 : v.key === 'semana' ? 1.05 : 0.9);
    const label = `${c.id} · ${k} · ${c.score} · ${v.label}`;
    const href = cveHref(c.id);
    const show = () => { tip.textContent = label; };
    const hide = () => { tip.textContent = ''; };
    kids.push(svg(href ? 'a' : 'g', {
      class: `rb v-${v.key}`, href, dataset: { id: c.id },
      'aria-label': href ? `${c.id}, ${k.toLowerCase()}, score ${c.score}${isProv(c) ? ' provisional' : ''}, ${v.label.toLowerCase()}` : null,
      on: { mouseenter: show, focus: show, mouseleave: hide, blur: hide },
    }, [svg('circle', { cx: f1(x), cy: f1(y), r: 11, class: 'rb__hit' }), ...blipShape(v, x, y, z)]));
  }
  kids.push(svg('circle', { cx: C, cy: C, r: 2, class: 'r-core' }));

  const dist = VERDICTS.map((v) => [v, top.filter((c) => verdictOf(c.score) === v).length]);
  const radar = svg('svg', {
    class: 'radar', viewBox: `0 0 ${S} ${S}`, role: 'group',
    'aria-label': 'Radar de urgencia del top 10: cuanto más al centro, más urgente; cada sector es un fabricante. '
      + `${dist.map(([v, n]) => `${v.label} ${n}`).join(', ')}.`,
  }, kids);

  return frag([
    radar,
    tip,
    el('ul', { class: 'rdist', 'aria-label': 'Reparto del top por veredicto' }, dist.map(([v, n]) =>
      el('li', { class: `v-${v.key}${n ? '' : ' is-zero'}` }, [vshape(v), el('span', { text: v.label }), el('b', { text: String(n) })]))),
    top.some(isProv) ? el('p', { class: 'ofoot', text: 'prov. = score provisional: NVD aún no ha puntuado la CVE.' }) : null,
  ]);
}
