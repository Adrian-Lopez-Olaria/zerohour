/* =============================================================================
   render/listado.js · LISTADO
   Buscador (términos con Y lógico), fabricante, orden, severidad y marcas.
   Rendimiento con el volumen real (cientos de CVE):
   - El DOM de cada fila se construye una vez y se reutiliza al filtrar.
   - El texto de búsqueda de cada CVE se precalcula por edición.
   - La búsqueda espera a que se deje de teclear (debounce).
   - Se pintan 60 filas y el resto bajo demanda ("mostrar más").
   ============================================================================= */
import { el, clear } from '../util/dom.js';
import { sevKey } from '../data.js';
import {
  SEV_ORDER, TAG, TAG_ORDER, chips, sbar, sevTag, emptyBlock, cveHref, isProv, icon, avLabel, editionBanner, whoLine, byUrgency,
} from './comunes.js';
import { nf, fmtCvss, fmtPctl, dLong } from '../util/format.js';

const PAGE = 60;
const DEBOUNCE_MS = 140;
const SORTS = {
  score: byUrgency,
  cvss: (a, b) => (b.cvss ?? -1) - (a.cvss ?? -1) || b.score - a.score,
  epss: (a, b) => (b.epss_percentile ?? -1) - (a.epss_percentile ?? -1) || b.score - a.score,
};
const SORT_LABEL = { score: 'SCORE', cvss: 'CVSS', epss: 'EPSS' };
const FLAGS = [['kev', 'EXPLOTADA'], ['poc', 'CON EXPLOIT O POC'], ['stack', 'MI STACK']];
// Cada marca agrupa sus etiquetas: explotada = KEV o SSVC; código de ataque = exploit, detección o PoC
const FLAG_TAGS = { kev: ['kev', 'ssvc'], poc: ['exploit', 'deteccion', 'poc'], stack: ['stack'] };
const hasFlag = (c, k) => FLAG_TAGS[k].some((t) => c.tags.includes(t));

const fresh = () => ({ q: '', vendor: -1, sort: 'score', sev: new Set(SEV_ORDER), kev: false, poc: false, stack: false });
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

function rowLabel(c) {
  const tags = TAG_ORDER.filter((t) => c.tags.includes(t)).map((t) => TAG[t].long.toLowerCase());
  return `${c.id}, ${whoLine(c)}, score ${c.score}${isProv(c) ? ' provisional' : ''}, `
    + `${sevKey(c.severity) === 'UNSCORED' ? 'sin puntuar' : 'CVSS ' + fmtCvss(c.cvss)}, EPSS ${fmtPctl(c.epss_percentile)}`
    + (tags.length ? `, ${tags.join(', ')}` : '');
}

// La fila tiene dos maquetas (columnas en escritorio, bloque compacto en móvil). Solo se construye
// la del ancho actual: la otra estaría oculta por CSS y duplicaría el coste de cada fila.
const NARROW = matchMedia('(max-width: 1180px)');

function buildRow(c) {
  const href = cveHref(c.id);
  const prod = whoLine(c);
  const cells = [
    el('span', { class: 'lrow__idcell' }, [el('span', { class: 'trow__id', text: c.id }), el('span', { class: 'lrow__score' }, sbar(c))]),
    el('span', { class: 'lrow__prod trow__prod' }, [
      el('b', { text: prod }),
      el('span', { class: 'lrow__desc', lang: 'en', text: c.description || '—' }),
    ]),
    ...(NARROW.matches ? [
      el('span', { class: 'lrow__meta' }, [
        sevTag(c.severity), el('span', { class: 'label', text: `CVSS ${fmtCvss(c.cvss)} · EPSS ${fmtPctl(c.epss_percentile)}` }), chips(c.tags),
      ]),
    ] : [
      el('span', { class: 'lrow__sev' }, sevTag(c.severity)),
      el('span', { class: 'lrow__cv c r', text: fmtCvss(c.cvss) }),
      el('span', { class: 'lrow__ep c r', text: fmtPctl(c.epss_percentile) }),
      el('span', { class: 'lrow__avc lrow__av', text: avLabel(c.attack_vector) }),
      el('span', { class: 'lrow__chips' }, chips(c.tags)),
    ]),
  ];
  return el('li', href ? el('a', { class: 'lrow', href, 'aria-label': rowLabel(c) }, cells) : el('div', { class: 'lrow' }, cells));
}

function rowFor(c) {
  let li = V.rows.get(c);
  if (!li) { li = buildRow(c); V.rows.set(c, li); }
  return li;
}

/* ───────── filtrado y pintado ───────── */

function results() {
  const terms = LS.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const vendor = LS.vendor >= 0 ? V.vendors[LS.vendor] : null;
  return V.cves.filter((c) => LS.sev.has(sevKey(c.severity))
    && (!LS.kev || hasFlag(c, 'kev')) && (!LS.poc || hasFlag(c, 'poc')) && (!LS.stack || hasFlag(c, 'stack'))
    && (vendor === null || c.vendor === vendor)
    && (!terms.length || terms.every((t) => V.hay.get(c).includes(t))))
    .sort(SORTS[LS.sort]);
}

function paint() {
  V.list = results();
  V.shown = Math.min(PAGE, V.list.length);
  V.count.textContent = `${V.list.length} DE ${V.cves.length} · ORDEN ${SORT_LABEL[LS.sort]}`;
  clear(V.out);
  if (!V.cves.length) {
    V.out.appendChild(emptyBlock('Listado vacío', 'Todavía no hay CVE publicadas en esta edición. Vuelve después de la próxima lectura de NVD o consulta el histórico.'));
  } else if (!V.list.length) {
    V.out.appendChild(emptyBlock('Sin coincidencias', 'Ninguna CVE cumple todos los filtros a la vez. Quita alguno o pulsa LIMPIAR.'));
  } else {
    const ol = el('ol', { class: 'lrows' });
    for (const c of V.list.slice(0, V.shown)) ol.appendChild(rowFor(c));
    V.out.appendChild(ol);
    V.ol = ol;
  }
  paintMore();
}

function paintMore() {
  const rest = V.list.length - V.shown;
  V.more.hidden = rest <= 0;
  V.more.textContent = rest > 0 ? `MOSTRAR ${Math.min(PAGE, rest)} MÁS · QUEDAN ${rest}` : '';
}

function showMore() {
  const from = V.shown;
  V.shown = Math.min(V.list.length, V.shown + PAGE);
  const frag = document.createDocumentFragment();
  for (const c of V.list.slice(from, V.shown)) frag.appendChild(rowFor(c));
  V.ol.appendChild(frag);
  paintMore();
  // El botón puede desaparecer: el foco pasa a la primera fila nueva
  const first = V.ol.children[from] && V.ol.children[from].querySelector('a, .lrow');
  if (first && first.focus) first.focus();
}

/* ───────── controles ───────── */

function pressed(btn, on) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }

function buildControls() {
  let timer = null;
  V.q = el('input', {
    id: 'q', type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: 'CVE, fabricante, producto o texto de NVD',
    on: { input: () => { clearTimeout(timer); timer = setTimeout(() => { LS.q = V.q.value; paint(); }, DEBOUNCE_MS); } },
  });
  V.q.value = LS.q;

  const vendorSel = el('select', { id: 'vendor', on: { change: () => { LS.vendor = Number(vendorSel.value); paint(); } } }, [
    el('option', { value: '-1', text: 'todos' }),
    ...V.vendors.map((v, i) => el('option', { value: String(i), text: v || 'Pendiente en NVD' })),
  ]);
  vendorSel.value = String(LS.vendor);

  const sortBtns = Object.keys(SORTS).map((k) => el('button', {
    type: 'button', 'aria-pressed': String(LS.sort === k), text: `${SORT_LABEL[k]} ↓`,
    on: { click: () => { LS.sort = k; sortBtns.forEach((b, i) => pressed(b, Object.keys(SORTS)[i] === k)); paint(); } },
  }));

  const counts = {};
  for (const c of V.cves) { const k = sevKey(c.severity); counts[k] = (counts[k] || 0) + 1; }
  const sevBtns = SEV_ORDER.map((k) => {
    const b = el('button', { type: 'button', class: 'tg', 'aria-pressed': String(LS.sev.has(k)) }, [
      sevTag(k === 'UNSCORED' ? null : k), el('span', { class: 'tg__n', text: nf(counts[k] || 0) }),
    ]);
    b.addEventListener('click', () => { LS.sev.has(k) ? LS.sev.delete(k) : LS.sev.add(k); pressed(b, LS.sev.has(k)); paint(); });
    return b;
  });
  const flagBtns = FLAGS.map(([k, label]) => {
    const box = el('span', { class: 'tg__box', 'aria-hidden': 'true', text: LS[k] ? '[×]' : '[ ]' });
    const b = el('button', { type: 'button', class: 'tg', 'aria-pressed': String(LS[k]) }, [box, label]);
    b.addEventListener('click', () => { LS[k] = !LS[k]; pressed(b, LS[k]); box.textContent = LS[k] ? '[×]' : '[ ]'; paint(); });
    return b;
  });
  const reset = el('button', {
    type: 'button', class: 'tg tg--reset', text: 'LIMPIAR',
    on: { click: () => { LS = fresh(); build(V.rootEl, V.ctx, true); } },
  });

  return el('div', { class: 'filters', role: 'search' }, [
    el('div', { class: 'filters__row' }, [
      el('label', { class: 'search' }, [icon('search'), el('span', { class: 'sr-only', text: 'Buscar CVE' }), V.q, el('kbd', { 'aria-hidden': 'true', text: '/' })]),
      el('label', { class: 'field label' }, ['FABRICANTE', vendorSel]),
      el('div', { class: 'seg', role: 'group', 'aria-label': 'Ordenar por' }, sortBtns),
    ]),
    el('div', { class: 'filters__row' }, [
      el('div', { class: 'filters__group', role: 'group', 'aria-label': 'Severidad' }, sevBtns),
      el('span', { class: 'filters__sep', 'aria-hidden': 'true' }),
      el('div', { class: 'filters__group', role: 'group', 'aria-label': 'Marcas' }, flagBtns),
      reset,
    ]),
  ]);
}

/* ───────── vista ───────── */

function build(root, ctx, keepFocusOnReset = false) {
  const ed = ctx.state.edition;
  const cves = ed.data.cves;
  V = {
    rootEl: root, ctx, edition: ed, cves, rows: new Map(), list: [], shown: 0, ol: null,
    vendors: [...new Set(cves.map((c) => c.vendor))].sort((a, b) => a.localeCompare(b, 'es')),
    hay: new Map(cves.map((c) => [c, [c.id, c.vendor, c.product, c.description, ...c.cwe].join(' ').toLowerCase()])),
  };
  if (LS.vendor >= V.vendors.length) LS.vendor = -1;

  V.count = el('span', { class: 'label', id: 'lcount', 'aria-live': 'polite' });
  V.out = el('div', { id: 'lrows' });
  V.more = el('button', { type: 'button', class: 'btn btn--ghost lmore', hidden: true, on: { click: showMore } });
  const st = ed.data.stats;

  clear(root);
  root.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { id: 'h-list', text: 'Listado' }),
    el('span', { class: 'label', text: `${dLong(ed.date)} · ${nf(st.new_cves)} PUBLICADAS · ${nf(cves.length)} EN ESTA EDICIÓN` }),
  ]));
  const banner = editionBanner(ed, ctx.backToToday);
  if (banner) root.appendChild(banner);
  root.appendChild(el('div', { class: 'panel' }, [
    buildControls(),
    el('div', { class: 'list-meta' }, [V.count, el('span', { class: 'label', text: '* SCORE PROVISIONAL · EPSS EN PERCENTIL' })]),
    el('div', { class: 'ltbl__head label', 'aria-hidden': 'true' }, [
      el('span', { text: 'CVE / SCORE' }), el('span', { text: 'PRODUCTO · DESCRIPCIÓN NVD' }), el('span', { text: 'SEVERIDAD' }),
      el('span', { class: 'r', text: 'CVSS' }), el('span', { class: 'r', text: 'EPSS' }), el('span', { text: 'VECTOR' }), el('span', { text: 'ETIQUETAS' }),
    ]),
    V.out,
    el('div', { class: 'lmore-wrap' }, V.more),
  ]));
  V.root = root;
  paint();
  if (keepFocusOnReset) { const r = root.querySelector('.tg--reset'); if (r) r.focus(); }
}

// Al cruzar el umbral (p. ej. girar una tablet) las filas en caché tienen la maqueta equivocada
NARROW.addEventListener('change', () => {
  if (!V) return;
  V.rows = new Map();
  const shown = V.shown;
  paint();
  while (V.shown < Math.min(shown, V.list.length)) {             // conserva las filas que ya se veían
    const from = V.shown;
    V.shown = Math.min(V.list.length, V.shown + PAGE);
    for (const c of V.list.slice(from, V.shown)) V.ol.appendChild(rowFor(c));
  }
  paintMore();
});

/** Pinta el listado de la edición activa (se reconstruye solo si cambia la edición). */
export function renderListado(root, ctx) {
  if (!V || V.edition !== ctx.state.edition || !root.firstChild) build(root, ctx);
  if (focusSearchPending) applySearchFocus();
}
