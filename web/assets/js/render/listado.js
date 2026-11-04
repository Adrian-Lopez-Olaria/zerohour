/* =============================================================================
   render/listado.js · LISTADO (v2, cambios-v2 §10)
   Barra sticky con buscador (términos con Y lógico), orden (urgencia / CVSS / EPSS) y
   «Filtros (n)», que abre un panel plegable: veredicto, severidad, señales y fabricante
   (con «Pendiente en NVD»). Por urgencia, las filas se agrupan por veredicto.
   Rendimiento con el volumen real (cientos de CVE):
   - El DOM de cada fila se construye una vez y se reutiliza al filtrar.
   - El texto de búsqueda de cada CVE se precalcula por edición.
   - La búsqueda espera a que se deje de teclear (debounce).
   - Se pintan 50 filas y el resto bajo demanda («Mostrar 50 más»).
   ============================================================================= */
import { el, clear } from '../util/dom.js';
import { sevKey } from '../data.js';
import {
  SEV_ORDER, VERDICTS, verdictOf, vtag, sevTag, emptyBlock, icon, editionBanner, byUrgency,
} from './comunes.js';
import { nf, dLong } from '../util/format.js';
import { orbRow, orbRows, rowsFoot } from './filas.js';

const PAGE = 50;
const DEBOUNCE_MS = 140;
const SORTS = {
  score: byUrgency,
  cvss: (a, b) => (b.cvss ?? -1) - (a.cvss ?? -1) || byUrgency(a, b),
  epss: (a, b) => (b.epss_percentile ?? -1) - (a.epss_percentile ?? -1) || byUrgency(a, b),
};
const SORT_LABEL = { score: 'Urgencia', cvss: 'CVSS', epss: 'EPSS' };
const FLAGS = [['kev', 'Explotada'], ['poc', 'Con exploit o PoC'], ['stack', 'Mi stack']];
// Cada señal agrupa sus etiquetas: explotada = KEV o SSVC; código de ataque = exploit, detección o PoC
const FLAG_TAGS = { kev: ['kev', 'ssvc'], poc: ['exploit', 'deteccion', 'poc'], stack: ['stack'] };
const hasFlag = (c, k) => FLAG_TAGS[k].some((t) => c.tags.includes(t));
const PENDING = '__pendiente__';           // valor del filtro «Pendiente en NVD» (vendor vacío)

const fresh = () => ({ q: '', vendor: '', sort: 'score', sev: new Set(SEV_ORDER), verdict: new Set(VERDICTS.map((v) => v.key)), kev: false, poc: false, stack: false, open: false });
let LS = fresh();
let V = null;            // estado de la vista construida para una edición concreta
let focusSearchPending = false;

/** Pide el foco en el buscador (atajo "/"); se aplica al pintar la vista. */
export function requestSearchFocus() {
  focusSearchPending = true;
  if (V && V.root.isConnected && !V.root.closest('[hidden]')) applySearchFocus();
}
function applySearchFocus() {
  focusSearchPending = false;
  if (V) { V.q.focus(); V.q.select(); }
}

/* ───────── filas ───────── */

function rowFor(c) {
  let li = V.rows.get(c);
  // Fila de Órbita (la misma del top): plazo CISA y desglose en las accionables, descripción debajo
  if (!li) { li = orbRow(c, { desc: true, edicion: V.edition.date }); V.rows.set(c, li); }
  return li;
}

/* ───────── filtrado y pintado ───────── */

function results() {
  const terms = LS.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return V.cves.filter((c) => LS.sev.has(sevKey(c.severity)) && LS.verdict.has(verdictOf(c.score).key)
    && (!LS.kev || hasFlag(c, 'kev')) && (!LS.poc || hasFlag(c, 'poc')) && (!LS.stack || hasFlag(c, 'stack'))
    && (!LS.vendor || (LS.vendor === PENDING ? !c.vendor : c.vendor === LS.vendor))
    && (!terms.length || terms.every((t) => V.hay.get(c).includes(t))))
    .sort(SORTS[LS.sort]);
}

const activeFilters = () => (SEV_ORDER.length - LS.sev.size) + (VERDICTS.length - LS.verdict.size)
  + (LS.kev ? 1 : 0) + (LS.poc ? 1 : 0) + (LS.stack ? 1 : 0) + (LS.vendor ? 1 : 0);

function paint(focusFrom = -1) {
  const page = V.list.slice(0, V.shown);
  V.count.textContent = `${nf(V.list.length)} DE ${nf(V.cves.length)} · ORDEN ${SORT_LABEL[LS.sort].toUpperCase()}`;
  const n = activeFilters();
  V.filtersBtn.textContent = n ? `Filtros (${n})` : 'Filtros';
  clear(V.out);
  if (!V.cves.length) {
    V.out.appendChild(emptyBlock('Listado vacío', 'Todavía no hay CVE publicadas en esta edición. Vuelve después de la próxima lectura de NVD o consulta el histórico.'));
  } else if (!V.list.length) {
    V.out.appendChild(emptyBlock('Sin coincidencias', 'Ninguna CVE cumple todos los filtros a la vez. Quita alguno o pulsa Limpiar.'));
  } else if (LS.sort === 'score') {
    // Agrupadas por veredicto; el número de cada grupo es el total de resultados, no solo los visibles
    const totals = {};
    for (const c of V.list) { const k = verdictOf(c.score).key; totals[k] = (totals[k] || 0) + 1; }
    V.out.appendChild(orbRows(page, { totals, rowFn: rowFor }));
  } else {
    V.out.appendChild(orbRows(page, { noGroups: true, rowFn: rowFor }));
  }
  const rest = V.list.length - V.shown;
  V.more.hidden = rest <= 0;
  V.more.textContent = rest > 0 ? `Mostrar ${Math.min(PAGE, rest)} más · quedan ${nf(rest)}` : '';
  V.moreWrap.hidden = rest <= 0;
  if (focusFrom >= 0) {
    // El botón puede desaparecer: el foco pasa a la primera fila nueva
    const li = rowFor(V.list[focusFrom]);
    const a = li && li.querySelector('a');
    if (a) a.focus();
  }
}

function refilter() {
  V.list = results();
  V.shown = Math.min(PAGE, V.list.length);
  paint();
}

function showMore() {
  const from = V.shown;
  V.shown = Math.min(V.list.length, V.shown + PAGE);
  paint(from);
}

/* ───────── controles ───────── */

function pressed(btn, on) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }

function toggle(content, on, flip) {
  const b = el('button', { type: 'button', class: 'tg', 'aria-pressed': String(on) }, content);
  b.addEventListener('click', () => { pressed(b, flip()); refilter(); });
  return b;
}

function buildControls() {
  let timer = null;
  V.q = el('input', {
    id: 'q', type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: 'CVE, fabricante, producto, CWE o texto de NVD',
    on: { input: () => { clearTimeout(timer); timer = setTimeout(() => { LS.q = V.q.value; refilter(); }, DEBOUNCE_MS); } },
  });
  V.q.value = LS.q;

  const sortSel = el('select', { id: 'sort', on: { change: () => { LS.sort = sortSel.value; refilter(); } } },
    Object.keys(SORTS).map((k) => el('option', { value: k, text: SORT_LABEL[k] })));
  sortSel.value = LS.sort;

  V.filtersBtn = el('button', {
    type: 'button', class: 'btn', 'aria-expanded': String(LS.open), 'aria-controls': 'filters',
    on: { click: () => { LS.open = !LS.open; V.filters.hidden = !LS.open; V.filtersBtn.setAttribute('aria-expanded', String(LS.open)); } },
  });

  const vendorSel = el('select', { id: 'vendor', on: { change: () => { LS.vendor = vendorSel.value; refilter(); } } }, [
    el('option', { value: '', text: 'Todos' }),
    ...V.vendors.map((v) => el('option', { value: v, text: v })),
    V.cves.some((c) => !c.vendor) ? el('option', { value: PENDING, text: 'Pendiente en NVD' }) : null,
  ]);
  vendorSel.value = LS.vendor;
  if (vendorSel.value !== LS.vendor) LS.vendor = '';

  const counts = {};
  for (const c of V.cves) { const k = sevKey(c.severity); counts[k] = (counts[k] || 0) + 1; }
  const vcounts = {};
  for (const c of V.cves) { const k = verdictOf(c.score).key; vcounts[k] = (vcounts[k] || 0) + 1; }

  const flip = (set, k) => () => { set.has(k) ? set.delete(k) : set.add(k); return set.has(k); };
  V.filters = el('div', { class: 'filters', id: 'filters', hidden: LS.open ? null : true }, [
    el('div', { class: 'filters__row', role: 'group', 'aria-label': 'Veredicto' }, [el('span', { class: 'label filters__k', 'aria-hidden': 'true', text: 'Veredicto' }),
      ...VERDICTS.map((v) => toggle([vtag(v), el('span', { class: 'tg__n', text: nf(vcounts[v.key] || 0) })], LS.verdict.has(v.key), flip(LS.verdict, v.key)))]),
    el('div', { class: 'filters__row', role: 'group', 'aria-label': 'Severidad' }, [el('span', { class: 'label filters__k', 'aria-hidden': 'true', text: 'Severidad' }),
      ...SEV_ORDER.map((k) => toggle([sevTag(k === 'UNSCORED' ? null : k), el('span', { class: 'tg__n', text: nf(counts[k] || 0) })], LS.sev.has(k), flip(LS.sev, k)))]),
    el('div', { class: 'filters__row', role: 'group', 'aria-label': 'Señales' }, [el('span', { class: 'label filters__k', 'aria-hidden': 'true', text: 'Señales' }),
      ...FLAGS.map(([k, label]) => {
        const box = el('span', { class: 'tg__box', 'aria-hidden': 'true', text: LS[k] ? '[×]' : '[ ]' });
        return toggle([box, label], LS[k], () => { LS[k] = !LS[k]; box.textContent = LS[k] ? '[×]' : '[ ]'; return LS[k]; });
      }),
      el('label', { class: 'select' }, ['FABRICANTE', vendorSel]),
      el('button', { type: 'button', class: 'btn btn--sm filters__reset', text: 'Limpiar', on: { click: () => { const open = LS.open; LS = fresh(); LS.open = open; build(V.rootEl, V.ctx, true); } } }),
    ]),
  ]);

  return [
    el('div', { class: 'toolbar', role: 'search' }, [
      el('label', { class: 'search' }, [icon('search'), el('span', { class: 'sr-only', text: 'Buscar CVE' }), V.q, el('kbd', { 'aria-hidden': 'true', text: '/' })]),
      el('label', { class: 'select' }, ['ORDEN', sortSel]),
      V.filtersBtn,
    ]),
    V.filters,
  ];
}

/* ───────── vista ───────── */

function build(root, ctx, keepFocusOnReset = false) {
  const ed = ctx.state.edition;
  const cves = ed.data.cves;
  V = {
    rootEl: root, ctx, edition: ed, cves, rows: new Map(), list: [], shown: 0,
    vendors: [...new Set(cves.map((c) => c.vendor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    hay: new Map(cves.map((c) => [c, [c.id, c.vendor, c.product, c.cna, c.description, ...c.cwe].join(' ').toLowerCase()])),
  };

  V.count = el('span', { class: 'label', id: 'lcount', 'aria-live': 'polite' });
  V.out = el('div', { id: 'lrows' });
  V.more = el('button', { type: 'button', class: 'btn', hidden: true, on: { click: showMore } });
  V.moreWrap = el('div', { class: 'panel__foot list__more' }, V.more);
  const st = ed.data.stats;

  clear(root);
  root.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { id: 'h-list', text: 'Listado' }),
    el('span', { class: 'label', text: `${dLong(ed.date)} · ${nf(st.new_cves)} publicadas · ` }),
    V.count,
  ]));
  const banner = editionBanner(ed, ctx.backToToday);
  if (banner) root.appendChild(banner);
  root.append(...buildControls(), el('div', { class: 'list panel' }, [
    V.out,
    V.moreWrap,
    el('div', { class: 'list__foot' }, rowsFoot(V.cves)),
  ]));
  V.root = root;
  refilter();
  if (keepFocusOnReset) { const r = root.querySelector('.filters__reset'); if (r) r.focus(); }
}


/** Pinta el listado de la edición activa (se reconstruye solo si cambia la edición). */
export function renderListado(root, ctx) {
  if (!V || V.edition !== ctx.state.edition || !root.firstChild) build(root, ctx);
  if (focusSearchPending) applySearchFocus();
}
