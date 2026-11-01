/* =============================================================================
   chart.js · gráfica del histórico: CVE por día apiladas por severidad + línea KEV
   SVG montado con svg(); colores por clase CSS. Sin librerías.
   ============================================================================= */
import { svg, el } from './util/dom.js';
import { SEV_ORDER } from './render/comunes.js';
import { nf, dShort, dWeek, dLong } from './util/format.js';

const W = 760, H = 320, M = { l: 44, r: 40, t: 18, b: 44 };
const IW = W - M.l - M.r, IH = H - M.t - M.b;

/** Escala "redonda": paso entre 1-2-5×10ⁿ con ≤ 6 divisiones. */
function niceScale(max) {
  const target = Math.max(1, max);
  const steps = [1, 2, 5].flatMap((s) => [s, s * 10, s * 100, s * 1000, s * 10000]).sort((a, b) => a - b);
  const step = steps.find((s) => Math.ceil(target / s) <= 6) || steps[steps.length - 1];
  return { step, top: Math.ceil(target / step) * step };
}

/**
 * win: días visibles (ascendentes); all: todos (para fijar la escala y no "saltar" al cambiar
 * de rango); selDate: día marcado; onPick(date): clic en una columna.
 */
export function chartSvg(win, all, selDate, onPick) {
  const { step, top } = niceScale(Math.max(...all.map((d) => d.stats.new_cves)));
  const maxK = Math.max(4, ...all.map((d) => d.stats.kev_new));
  const kStep = maxK > 8 ? Math.ceil(maxK / 4) : 1;
  const bw = IW / win.length, bar = Math.min(44, bw * 0.56);
  const y = (v) => M.t + IH - v / top * IH;
  const yk = (v) => M.t + IH - v / maxK * IH;
  const out = [];

  for (let v = 0; v <= top; v += step) {
    out.push(svg('line', { class: v ? 'gl' : 'gl0', x1: M.l, x2: W - M.r, y1: y(v).toFixed(1), y2: y(v).toFixed(1) }));
    out.push(svg('text', { class: 'ax', x: M.l - 8, y: (y(v) + 3).toFixed(1), 'text-anchor': 'end', text: nf(v) }));
  }
  for (let k = 0; k <= maxK; k += kStep) out.push(svg('text', { class: 'ax ax--kev', x: W - M.r + 8, y: (yk(k) + 3).toFixed(1), text: k }));

  const kpts = [];
  win.forEach((d, i) => {
    const cx = M.l + bw * i + bw / 2, on = d.date === selDate;
    if (on) out.push(svg('rect', { class: 'sel', x: (cx - bw / 2 + 3).toFixed(1), y: M.t - 6, width: Math.max(0, bw - 6).toFixed(1), height: IH + 12 }));
    let acc = 0;
    for (const k of [...SEV_ORDER].reverse()) {
      const v = d.stats.by_severity[k];
      if (!v) continue;
      const y0 = y(acc + v), h = y(acc) - y0;
      out.push(svg('rect', { class: `bar sevfill--${k}`, x: (cx - bar / 2).toFixed(1), y: y0.toFixed(1), width: bar.toFixed(1), height: Math.max(0, h - 1).toFixed(1), style: { '--i': i } }));
      acc += v;
    }
    out.push(svg('text', { class: 'ax ax--n' + (on ? ' on' : ''), x: cx.toFixed(1), y: (y(d.stats.new_cves) - 7).toFixed(1), 'text-anchor': 'middle', text: nf(d.stats.new_cves) }));
    out.push(svg('text', { class: 'ax-day' + (on ? ' on' : ''), x: cx.toFixed(1), y: H - M.b + 18, 'text-anchor': 'middle', text: dWeek(d.date) }));
    out.push(svg('text', { class: 'ax', x: cx.toFixed(1), y: H - M.b + 32, 'text-anchor': 'middle', text: dShort(d.date) }));
    // Columna clicable (el teclado usa el selector de días; esto es un atajo para ratón)
    out.push(svg('rect', { class: 'hit', 'aria-hidden': 'true', x: (cx - bw / 2).toFixed(1), y: M.t, width: bw.toFixed(1), height: IH, on: { click: () => onPick(d.date) } },
      svg('title', { text: `${dLong(d.date)}: ${d.stats.new_cves} CVE · ${d.stats.kev_new} KEV` })));
    kpts.push([cx, yk(d.stats.kev_new)]);
  });
  out.push(svg('path', { class: 'kev-line', pathLength: 1, d: kpts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') }));
  for (const [x, yy] of kpts) out.push(svg('rect', { class: 'kev-dot', x: (x - 3).toFixed(1), y: (yy - 3).toFixed(1), width: 6, height: 6 }));

  const vals = win.map((d) => d.stats.new_cves);
  const kevs = win.reduce((a, d) => a + d.stats.kev_new, 0);
  return svg('svg', {
    class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': win.length
      ? `CVE por día del ${dShort(win[0].date)} al ${dShort(win[win.length - 1].date)}: entre ${nf(Math.min(...vals))} y ${nf(Math.max(...vals))} al día; ${nf(kevs)} nuevas en KEV en el periodo. Detalle en la tabla siguiente.`
      : 'Sin datos',
  }, out);
}

/** Tabla equivalente, solo para lectores de pantalla. */
export function chartTable(win) {
  return el('table', { class: 'sr-only' }, [
    el('caption', { text: 'CVE por día y severidad' }),
    el('thead', el('tr', ['Día', 'CVE', 'Críticas', 'Altas', 'Medias', 'Bajas', 'Sin puntuar', 'Nuevas en KEV'].map((t) => el('th', { scope: 'col', text: t })))),
    el('tbody', win.map((d) => el('tr', [
      el('th', { scope: 'row', text: dLong(d.date) }),
      el('td', { text: nf(d.stats.new_cves) }),
      ...SEV_ORDER.map((k) => el('td', { text: nf(d.stats.by_severity[k]) })),
      el('td', { text: nf(d.stats.kev_new) }),
    ]))),
  ]);
}
