/* =============================================================================
   render/briefing.js · BRIEFING
   Titular, resumen, contadores, radar, top 10, países, puertos y prensa.
   El globo (zona GLB-01) se monta en la fase 4; aquí se deja su contenedor y HUD.
   ============================================================================= */
import { el, clear } from '../util/dom.js';
import {
  SEV_ORDER, panelHead, emptyBlock, cveHref, isProv, extLink, langOf, groupedRows,
} from './comunes.js';
import { renderRadar } from '../radar.js';
import { scheduleGlobe, updateGlobe, countryMarkers, makeScale, zoomControls } from '../globe.js';
import { nf, pad, fmtCvss, fmtPctl, dLong, tLocal, tUTC, scoreVar, prefersReducedMotion, countryName } from '../util/format.js';

const PORTS = { 21: 'FTP', 22: 'SSH', 23: 'TELNET', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 137: 'NETBIOS', 443: 'HTTPS', 445: 'SMB', 2222: 'SSH-ALT', 2323: 'TELNET-ALT', 3306: 'MYSQL', 3389: 'RDP', 5060: 'SIP', 8000: 'HTTP-ALT', 8080: 'HTTP-ALT', 9000: 'HTTP-ALT' };
const MAX_COUNTRIES = 10;
const MAX_NEWS = 8;

let animated = false;   // contadores y entrada del top: una sola vez por visita

/* ───────── contadores ───────── */

function countUp(items) {
  const dur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--t-count')) || 1100;
  const t0 = performance.now();
  for (const { node } of items) node.textContent = '0';
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    for (const { node, to } of items) node.textContent = nf(Math.round(to * e));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Delta frente a la media de los 7 días anteriores a la edición (▲ ámbar sube, ▼ verde baja).
    Sin 7 días completos de histórico no se muestra (ORDENES §1: no inventarlo). */
function makeDelta(latest, index) {
  const prev = index ? index.days.filter((d) => d.date < latest.date).slice(-7) : [];
  return (value, pick) => {
    if (prev.length < 7) return null;
    const avg = prev.reduce((a, d) => a + pick(d.stats), 0) / prev.length;
    if (!avg) return null;
    const p = Math.round((value - avg) / avg * 100);
    const arrow = p > 0 ? el('span', { class: 'up', text: `▲ ${p} %` })
      : p < 0 ? el('span', { class: 'down', text: `▼ ${Math.abs(p)} %` })
        : el('span', { text: '= 0 %' });
    return [arrow, ' vs media 7 d ', el('b', { text: nf(avg, avg < 10 ? 1 : 0) })];
  };
}

function kpiBlock(st, delta, counters) {
  const kpis = [
    { k: 'CVE NUEVAS', v: st.new_cves, d: delta(st.new_cves, (s) => s.new_cves), cls: 'kpi--wide', split: st.new_cves > 0 },
    { k: 'CRÍTICAS', v: st.by_severity.CRITICAL, d: `${nf(st.by_severity.UNSCORED)} sin puntuar` },
    { k: 'EXPLOTADAS · KEV', v: st.kev_new, d: delta(st.kev_new, (s) => s.kev_new), cls: st.kev_new ? 'kpi--alert' : '' },
    // Desde la fase 6 el contador es el de exploits verificados; las ediciones antiguas siguen con "CON POC"
    st.with_exploit != null
      ? { k: 'EXPLOIT VERIFICADO', v: st.with_exploit, d: `${nf(st.with_detection || 0)} con plantilla de detección · ${nf(Math.max(0, st.with_poc - st.with_exploit - (st.with_detection || 0)))} con PoC sin verificar` }
      : { k: 'CON POC', v: st.with_poc, d: delta(st.with_poc, (s) => s.with_poc) },
    { k: 'AFECTAN A MI STACK', v: st.in_stack, d: `${nf(st.remote)} explotables en remoto`, cls: 'kpi--stack' },
  ];
  return el('dl', { class: 'kpis' }, kpis.map((k) => {
    const v = el('dd', { class: 'kpi__v num', text: nf(k.v) });
    counters.push({ node: v, to: k.v });
    return el('div', { class: `kpi ${k.cls || ''}`.trim() }, [
      el('dt', { text: k.k }),
      v,
      el('dd', { class: 'kpi__d' }, k.d || ''),
      k.split ? el('dd', { class: 'kpi__split', 'aria-hidden': 'true' },
        SEV_ORDER.map((s) => el('i', { class: `kpi__seg--${s}`, style: { flex: String(st.by_severity[s] || 0) } }))) : null,
    ]);
  }));
}

/* ───────── titular y columna de texto ───────── */

function copyBlock(latest, index, top, empty, counters) {
  const st = latest.stats;
  // v2: la fecha, la edición y el T+ viven en la franja; sin titular grande
  const summary = empty
    ? 'Sin datos de NVD para hoy todavía. El listado y el top se rellenarán solos en la próxima lectura; mientras tanto, el histórico sigue disponible.'
    : latest.summary;

  return el('div', { class: 'copy' }, [
    el('h1', { class: 'sr-only', id: 'h-brief', text: latest.date ? `Briefing del ${dLong(latest.date)}` : 'Briefing del día' }),
    el('p', { class: 'summary', text: summary }),
    kpiBlock(st, makeDelta(latest, index), counters),
    el('div', { class: 'copy__actions' }, [
      el('a', { class: 'btn btn--primary', href: '#listado', text: `Ver las ${nf(st.new_cves)} CVE` }),
      top[0] && cveHref(top[0].id) ? el('a', { class: 'link', href: cveHref(top[0].id), text: 'Ficha de la nº 1 →' }) : null,
    ]),
  ]);
}

/* ───────── mapa de origen de ataques (globe.js monta el globo o la vista plana) ───────── */

/* Etiquetas honestas (diagnóstico C): los datos son el ranking acumulado de DShield filtrado a
   las IPs que siguen activas hoy, no un recuento de las últimas 24 horas. */
const nCountries = (map) => (map ? new Set(map.points.map((p) => p.cc)).size : 0);
const mapMeta = (map) => (map && map.points.length ? `RANKING DSHIELD · IPS ACTIVAS HOY · ${nCountries(map)} PAÍSES` : 'SIN LECTURA');

function mapSummary(map) {
  if (!map || !map.points.length) return 'Mapa de origen de ataques no disponible en esta lectura.';
  const ms = countryMarkers(map);
  return `Origen de los ataques según el ranking de DShield (SANS ISC): las IPs con más ataques acumulados que siguen activas hoy, en ${ms.length} países. `
    + `Más actividad: ${ms.slice(0, 3).map((m) => `${countryName(m.cc, m.country)} ${nf(m.attacks)}`).join(', ')}. Usa los botones para acercar o alejar.`;
}

function mapFoot(map) {
  return el('div', { class: 'panel__foot', id: 'map-foot' }, [
    el('span', { class: 'label', text: map && map.updated_at ? `LECTURA ${tUTC(map.updated_at)} UTC` : 'SIN LECTURA DEL MAPA' }),
    el('span', { class: 'label', text: 'RANKING ACUMULADO · NO ES UN RECUENTO DE 24 H' }),
  ]);
}

function mapPanel(map) {
  return el('section', { class: 'panel mapp', id: 'panel-map', 'aria-labelledby': 'h-map' }, [
    el('div', { class: 'panel__head' }, [
      el('h2', { class: 'panel__title', id: 'h-map', text: 'Origen de ataques' }),
      el('span', { class: 'panel__meta', id: 'map-meta', text: mapMeta(map) }),
    ]),
    el('div', { class: 'panel__body map-body' }, [
      // El resumen va como texto (no como role=img del contenedor): así los botones de zoom siguen accesibles
      el('p', { class: 'sr-only', id: 'map-sum', text: mapSummary(map) }),
      el('div', { class: 'globe-box', id: 'globe-zone' }, [
        el('div', { class: 'globe', id: 'globe', 'aria-hidden': 'true' }),
        el('div', { class: 'globe-flat', id: 'globe-flat', 'aria-hidden': 'true' }),
        map && map.points.length ? zoomControls() : null,
        el('div', { class: 'map-legend', id: 'map-legend', 'aria-hidden': 'true' }),
      ]),
    ]),
    mapFoot(map),
  ]);
}

/* ───────── top 10 ───────── */

const TOP_MOBILE = 5;                                   // en móvil: 5 visibles y «Ver las 10»
const MOBILE = matchMedia('(max-width: 760px)');
let topOpen = false;

/** Top agrupado por veredicto, filas de dos líneas. En móvil, 2 chips + «+N» y solo 5 filas. */
function topPanel(top, empty, st) {
  const head = el('div', { class: 'panel__head' }, [
    el('h2', { class: 'panel__title', id: 'h-top', text: 'Las que importan hoy' }),
    el('span', { class: 'panel__meta' }, [`${top.length} DE ${nf(st.new_cves)} · `, el('a', { href: '#listado', text: 'LISTADO →' })]),
  ]);
  if (empty || !top.length) {
    return el('section', { class: 'panel top10', id: 'panel-top', 'aria-labelledby': 'h-top' }, [head,
      emptyBlock('Nada que priorizar todavía', 'Cuando entre el primer lote de NVD aparecerán aquí las diez CVE con más score. Si una fuente falla, el top se calcula con las que respondan.')]);
  }
  const sec = el('section', { class: 'panel top10' + (topOpen ? ' is-open' : ''), id: 'panel-top', 'aria-labelledby': 'h-top' });
  const rows = el('div', { class: 'rows', id: 'top-rows' }, groupedRows(top, { limit: TOP_MOBILE, chipsMax: MOBILE.matches ? 2 : 3 }));
  const more = top.length > TOP_MOBILE ? el('button', {
    type: 'button', class: 'btn', 'aria-expanded': String(topOpen), 'aria-controls': 'top-rows',
    text: topOpen ? 'Ver solo las 5 primeras' : `Ver las ${top.length}`,
    on: {
      click: (e) => {
        topOpen = !topOpen;
        sec.classList.toggle('is-open', topOpen);
        e.currentTarget.setAttribute('aria-expanded', String(topOpen));
        e.currentTarget.textContent = topOpen ? 'Ver solo las 5 primeras' : `Ver las ${top.length}`;
        // Al abrir, el foco pasa a la primera fila nueva (la 6.ª)
        if (topOpen) { const a = sec.querySelector('li.is-extra a'); if (a) a.focus(); }
      },
    },
  }) : null;
  sec.append(head, rows, ...[
    more ? el('div', { class: 'rows__more' }, more) : null,
    top.some(isProv) ? el('div', { class: 'panel__foot' }, el('span', { class: 'label', text: '* Score provisional: NVD aún no ha puntuado la CVE' })) : null,
  ].filter(Boolean));
  return sec;
}

/* ───────── columna lateral: países, puertos, prensa ───────── */

function rankList(rows) {
  return el('ol', { class: 'rank' }, rows.map((r) => el('li', [
    el('span', { class: 'cc', text: r.code }),
    el('span', { class: 'nm', text: r.name }),
    el('span', { class: 'v num', text: r.value }),
    el('span', { class: 'bar' + (r.band ? ` bar--${r.band}` : ''), 'aria-hidden': 'true', style: { '--w': r.w } }, el('i')),
  ])));
}

function countriesPanel(map) {
  const rows = map ? map.by_country.slice(0, MAX_COUNTRIES) : [];
  // Barra en escala logarítmica y color del tramo del mapa (misma escala que los marcadores)
  const scale = makeScale(countryMarkers(map));
  const maxL = Math.log10(Math.max(1, ...rows.map((c) => c.attacks)) + 1);
  return el('section', { class: 'panel', id: 'panel-cty', 'aria-labelledby': 'h-cty' }, [
    panelHead('', 'Países de origen', rows.length ? `TOP ${rows.length} · ESCALA LOG` : '', 'h-cty'),
    rows.length
      ? rankList(rows.map((c) => ({ code: c.cc, name: countryName(c.cc, c.country), value: nf(c.attacks), w: Math.max(2, Math.round(Math.log10(c.attacks + 1) / maxL * 100)), band: scale.tier(c.attacks) })))
      : emptyBlock(null, map ? 'Sin orígenes de ataque en esta lectura de SANS ISC.' : 'El mapa de ataques no se pudo leer en esta edición.', true),
  ]);
}

function portsPanel(map) {
  const rows = map ? map.top_ports : [];
  const maxP = Math.max(1, ...rows.map((p) => p.records));
  return el('section', { class: 'panel', id: 'panel-ports', 'aria-labelledby': 'h-ports' }, [
    panelHead('NET-03', 'Puertos más atacados', 'REGISTROS', 'h-ports'),
    rows.length
      ? rankList(rows.map((p) => ({ code: String(p.port), name: PORTS[p.port] || `TCP/${p.port}`, value: p.records >= 1000 ? `${nf(p.records / 1000)} K` : nf(p.records), w: Math.round(p.records / maxP * 100) })))
      : emptyBlock(null, map ? 'Sin datos de puertos en esta lectura de SANS ISC.' : 'El mapa de ataques no se pudo leer en esta edición.', true),
  ]);
}

function newsPanel(news) {
  if (!news.length) return null;
  const shown = news.slice(0, MAX_NEWS);
  return el('section', { class: 'panel', 'aria-labelledby': 'h-news' }, [
    panelHead('RSS-04', 'Avisos y prensa', shown.length < news.length ? `${shown.length} DE ${news.length}` : String(news.length), 'h-news'),
    el('ul', { class: 'news-list' }, shown.map((n) => el('li',
      extLink(n.url, { class: 'news-list__a' }, [el('span', { lang: langOf(n.lang), text: n.title }), el('small', { text: n.source })])))),
  ]);
}

/* ───────── vista ───────── */

export function renderBriefing(root, state) {
  const { latest, index } = state.data;
  const map = state.map;
  const top = latest.top;
  const empty = !latest.cves.length;
  const animate = !animated && !prefersReducedMotion();
  const counters = [];

  clear(root);
  root.appendChild(el('div', { class: 'brief' }, [
    copyBlock(latest, index, top, empty, counters),
    mapPanel(map),
    el('aside', { class: 'radar-panel panel', 'aria-labelledby': 'h-radar' }, [
      panelHead('RDR-01', 'Radar de urgencia', 'TOP 10', 'h-radar'),
      empty || !top.length ? emptyBlock(null, 'Sin contactos.', true) : renderRadar(top),
    ]),
    topPanel(top, empty, latest.stats),
    el('div', { class: 'side' }, [countriesPanel(map), portsPanel(map), newsPanel(latest.news)]),
  ]));

  if (animate) countUp(counters);
  animated = true;
  // Al cruzar el ancho de móvil cambia el número de chips por fila: se rehace solo el top
  if (!MOBILE.onchange) MOBILE.onchange = () => { const old = document.getElementById('panel-top'); if (old) old.replaceWith(topPanel(top, empty, latest.stats)); };
  scheduleGlobe(document.getElementById('globe-zone'), map);
}

/** Tras refrescar map.json: re-pinta solo lo que depende del mapa (sin animaciones ni perder el foco del resto). */
export function refreshMapPanels(state) {
  const map = state.map;
  const swap = (id, node) => { const old = document.getElementById(id); if (old) old.replaceWith(node); };
  swap('panel-cty', countriesPanel(map));
  swap('panel-ports', portsPanel(map));
  swap('map-foot', mapFoot(map));
  const meta = document.getElementById('map-meta'), sum = document.getElementById('map-sum');
  if (meta) meta.textContent = mapMeta(map);
  if (sum) sum.textContent = mapSummary(map);
  updateGlobe(map);
}
