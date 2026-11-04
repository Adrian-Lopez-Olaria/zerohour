/* =============================================================================
   render/historico.js · HISTÓRICO
   Selector de días (un solo punto de tabulación; flechas ←/→, Inicio y Fin),
   gráfica por severidad + KEV (7/14/30 días) y resumen del día elegido.
   Un día pasado puede abrirse en el listado: se descarga data/days/AAAA-MM-DD.json
   solo entonces (cada fichero pesa lo mismo que un latest.json).
   ============================================================================= */
import { el, clear } from '../util/dom.js';
import { SEV, SEV_ORDER, sevTag, panelHead, emptyBlock, cveHref } from './comunes.js';
import { chartSvg, chartTable } from '../chart.js';
import { nf, dLong, dShort, dWeek, dDay, scoreVar } from '../util/format.js';

const RANGES = [7, 14, 30];
const H = { sel: null, range: 7, root: null, ctx: null, dayBtns: [], chartBody: null, sumBody: null, sumHead: null, rangeBtns: [] };

const plural = (n, s, p) => `${nf(n)} ${n === 1 ? s : p}`;

/* ───────── selector de días ───────── */

function selectDay(date, focus = false) {
  H.sel = date;
  for (const b of H.dayBtns) {
    const on = b.dataset.date === date;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  }
  paintChart();
  paintSummary();
}

function onDaysKey(e) {
  const days = H.ctx.state.data.index.days;
  const i = days.findIndex((d) => d.date === H.sel);
  let j = null;
  if (e.key === 'ArrowLeft') j = i - 1;
  else if (e.key === 'ArrowRight') j = i + 1;
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = days.length - 1;
  if (j == null) return;
  e.preventDefault();
  j = Math.max(0, Math.min(days.length - 1, j));
  selectDay(days[j].date, true);
  const b = H.dayBtns[j];
  if (b) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function dayButton(d) {
  const s = d.stats;
  const b = el('button', {
    type: 'button', class: 'day', dataset: { date: d.date }, 'aria-pressed': 'false', tabindex: '-1',
    'aria-label': `${dLong(d.date)}: ${plural(s.new_cves, 'CVE', 'CVE')}, ${plural(s.kev_new, 'nueva en KEV', 'nuevas en KEV')}`,
    on: { click: () => selectDay(d.date) },
  }, [
    el('span', { class: 'day__w', text: dWeek(d.date) }),
    el('span', { class: 'day__d', text: dDay(d.date) }),
    el('span', { class: 'day__bar', 'aria-hidden': 'true' }, SEV_ORDER.map((k) => el('i', { class: `sevbg--${k}`, style: { flex: String(s.by_severity[k] || 0) } }))),
    el('span', { class: 'day__n', text: `${nf(s.new_cves)} · K${nf(s.kev_new)}` }),
  ]);
  return b;
}

/* ───────── gráfica ───────── */

function windowDays() {
  const days = H.ctx.state.data.index.days;
  const i = days.findIndex((d) => d.date === H.sel);
  // La ventana termina en el día elegido (o en el más reciente si cabe entero)
  const end = Math.max(i, Math.min(H.range - 1, days.length - 1));
  return days.slice(Math.max(0, end - H.range + 1), end + 1);
}

function paintChart() {
  const days = H.ctx.state.data.index.days;
  const win = windowDays();
  clear(H.chartBody);
  H.chartBody.appendChild(chartSvg(win, days, H.sel, (date) => selectDay(date)));
  H.chartBody.appendChild(chartTable(win));
  for (const b of H.rangeBtns) b.setAttribute('aria-pressed', Number(b.dataset.range) === H.range ? 'true' : 'false');
}

/* ───────── resumen del día ───────── */

function paintSummary() {
  const { state } = H.ctx;
  const d = state.data.index.days.find((x) => x.date === H.sel);
  const s = d.stats;
  const isToday = d.date === state.data.latest.date;
  H.sumHead.querySelector('.panel__title').textContent = dLong(d.date);
  const meta = H.sumHead.querySelector('.panel__meta');
  meta.textContent = isToday ? 'HOY' : '';

  const topList = d.top.length ? el('ol', { class: 'daytop' }, d.top.map((t) => {
    const inToday = isToday && state.data.latest.cves.some((c) => c.id === t.id);
    const label = [el('span', { class: 'daytop__id', text: t.id }), t.score != null ? el('b', { class: 'daytop__s', style: { '--sc': scoreVar(t.score) }, text: nf(t.score) }) : null];
    return el('li', inToday && cveHref(t.id) ? el('a', { href: cveHref(t.id) }, label) : el('span', label));
  })) : null;

  const status = el('p', { class: 'daysum__status label', role: 'status' });
  const openBtn = el('button', {
    type: 'button', class: 'btn', text: isToday ? 'Ver el listado de hoy' : 'Ver el listado de ese día',
    on: {
      click: async () => {
        openBtn.setAttribute('aria-disabled', 'true');
        status.textContent = isToday ? '' : 'CARGANDO LA EDICIÓN…';
        try { await H.ctx.openDay(d.date); } catch (e) {
          status.textContent = `NO SE PUDO CARGAR ESA EDICIÓN${e && e.message ? ` (${e.message})` : ''}. LOS FICHEROS DIARIOS SE CONSERVAN UN TIEMPO LIMITADO.`;
        } finally { openBtn.removeAttribute('aria-disabled'); }
      },
    },
  });

  clear(H.sumBody);
  // Ojo: Element.append(null) escribiría el texto "null"; los bloques opcionales se filtran
  H.sumBody.append(...[
    el('div', { class: 'daysum__n' }, [nf(s.new_cves), el('small', { text: 'CVE' })]),
    el('p', { class: 'daysum__line' }, [
      s.kev_new ? el('b', { class: 'daysum__kev', text: plural(s.kev_new, 'explotada', 'explotadas') }) : 'Ninguna en KEV',
      `, ${plural(s.by_severity.CRITICAL, 'crítica', 'críticas')} y ${nf(s.in_stack)} en tu stack. ${plural(s.by_severity.UNSCORED, 'quedó sin puntuar', 'quedaron sin puntuar')}.`,
    ]),
    el('dl', { class: 'statrows' }, [
      ...SEV_ORDER.map((k) => el('div', [el('dt', sevTag(k === 'UNSCORED' ? null : k)), el('dd', { text: nf(s.by_severity[k]) })])),
      el('div', [el('dt', { text: 'NUEVAS EN KEV' }), el('dd', { class: 'hot-kev', text: nf(s.kev_new) })]),
      el('div', [el('dt', { text: 'CON POC' }), el('dd', { text: nf(s.with_poc) })]),
      el('div', [el('dt', { text: 'EN MI STACK' }), el('dd', { class: 'hot-stack', text: nf(s.in_stack) })]),
      el('div', [el('dt', { text: 'REMOTAS' }), el('dd', { text: nf(s.remote) })]),
    ]),
    topList ? el('p', { class: 'label', text: `TOP ${d.top.length} DE ESE DÍA` }) : null,
    topList,
    el('div', { class: 'daysum__actions' }, [isToday ? el('a', { class: 'btn btn--ghost', href: '#briefing', text: 'Abrir el briefing' }) : null, openBtn]),
    status,
  ].filter(Boolean));
}

/* ───────── vista ───────── */

export function renderHistorico(root, ctx) {
  if (H.root === root && root.firstChild) return;      // se construye una vez; luego solo cambia la selección
  H.root = root; H.ctx = ctx;
  const index = ctx.state.data.index;
  const days = index ? index.days : [];
  clear(root);

  const title = el('div', { class: 'page-head' }, [
    el('h1', { id: 'h-hist', text: 'Histórico' }),
    days.length ? el('span', { class: 'label', text: `${plural(days.length, 'EDICIÓN', 'EDICIONES')} · ${dShort(days[0].date)} – ${dShort(days[days.length - 1].date)}` }) : null,
  ]);
  root.appendChild(title);

  if (!days.length) {
    root.appendChild(el('div', { class: 'panel' }, emptyBlock('Sin histórico todavía',
      index ? 'El histórico se llena con una edición al día. Vuelve mañana para ver la primera comparación.' : 'No se pudo leer data/index.json en esta carga. El briefing del día sigue disponible.')));
    return;
  }

  H.sel = days[days.length - 1].date;
  H.dayBtns = days.map(dayButton);
  const daysBox = el('div', { class: 'days', role: 'group', 'aria-label': 'Elegir día (flechas izquierda y derecha)', on: { keydown: onDaysKey } }, H.dayBtns);

  H.rangeBtns = RANGES.map((n) => el('button', {
    type: 'button', dataset: { range: n }, 'aria-pressed': String(n === H.range), text: `${n} D`,
    on: { click: () => { H.range = n; paintChart(); } },
  }));
  const chartHead = panelHead('TRD-02', 'CVE por severidad y KEV', null, 'h-chart');
  chartHead.appendChild(el('span', { class: 'seg seg--sm panel__meta', role: 'group', 'aria-label': 'Rango de días' }, H.rangeBtns));
  H.chartBody = el('div', { class: 'panel__body' });

  H.sumHead = panelHead('SUM-03', '', ' ', 'h-day');
  H.sumBody = el('div', { class: 'panel__body daysum' });

  root.append(
    el('section', { class: 'panel', 'aria-labelledby': 'h-days' }, [panelHead('DAY-01', 'Selector de días', 'Pulsa un día o usa las flechas del teclado', 'h-days'), daysBox]),
    el('div', { class: 'hist-grid' }, [
      el('section', { class: 'panel', 'aria-labelledby': 'h-chart' }, [
        chartHead, H.chartBody,
        el('div', { class: 'legend', 'aria-hidden': 'true' }, [
          ...SEV_ORDER.map((k) => el('span', [el('i', { class: `sevbg--${k}` }), SEV[k].label])),
          el('span', [el('i', { class: 'ln' }), 'NUEVAS EN KEV (EJE DCHO.)']),
        ]),
      ]),
      el('aside', { class: 'panel', 'aria-labelledby': 'h-day' }, [H.sumHead, H.sumBody]),
    ]),
  );
  selectDay(H.sel);
  // El día elegido (el más reciente) a la vista dentro del carril horizontal
  requestAnimationFrame(() => { daysBox.scrollLeft = daysBox.scrollWidth; });
}
