/* =============================================================================
   render/briefing.js · SEC-01 BRIEFING
   Titular, resumen, contadores, radar, top 10, países, puertos y prensa.
   El globo (zona GLB-01) se monta en la fase 4; aquí se deja su contenedor y HUD.
   ============================================================================= */
import { el, clear } from '../util/dom.js';
import { sevKey } from '../data.js';
import {
  SEV, SEV_ORDER, TAG, TAG_ORDER, chips, sbar, sevTag, panelHead, emptyBlock, cveHref, isProv, extLink,
} from './comunes.js';
import { renderRadar } from '../radar.js';
import { nf, pad, fmtCvss, fmtPctl, dLong, tLocal, tUTC, scoreVar, prefersReducedMotion } from '../util/format.js';

const PORTS = { 21: 'FTP', 22: 'SSH', 23: 'TELNET', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 137: 'NETBIOS', 443: 'HTTPS', 445: 'SMB', 2222: 'SSH-ALT', 2323: 'TELNET-ALT', 3306: 'MYSQL', 3389: 'RDP', 5060: 'SIP', 8000: 'HTTP-ALT', 8080: 'HTTP-ALT', 9000: 'HTTP-ALT' };
const MAX_COUNTRIES = 10;
const MAX_NEWS = 8;
const attackBand = (n) => (n >= 3000 ? 'hi' : n >= 1000 ? 'mid' : 'lo');

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

/** Delta frente a la media de los 7 días anteriores a la edición (▲ ámbar sube, ▼ verde baja). */
function makeDelta(latest, index) {
  const prev = index ? index.days.filter((d) => d.date < latest.date).slice(-7) : [];
  return (value, pick) => {
    if (!prev.length) return null;
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
    { k: 'CON POC', v: st.with_poc, d: delta(st.with_poc, (s) => s.with_poc) },
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
  let headline;
  if (empty) {
    headline = ['Sin CVE', el('br'), 'todavía.',
      el('small', { text: 'NVD publica en lotes; la primera tanda suele llegar pasadas las 02:00 UTC.' })];
  } else {
    const n = el('span', { class: 'n num', text: nf(st.kev_new) });
    counters.push({ node: n, to: st.kev_new });
    headline = [n, ` explotada${st.kev_new === 1 ? '' : 's'}`, el('br'), 'activamente.',
      el('small', [el('b', { text: nf(st.in_stack) }), ' EN TU STACK · ', el('b', { text: nf(st.with_poc) }), ' CON EXPLOIT PÚBLICO'])];
  }
  const summary = empty
    ? 'Sin datos de NVD para hoy. El listado y el top se rellenarán solos en la próxima lectura; mientras tanto, el histórico sigue disponible.'
    : latest.summary;

  return el('div', { class: 'copy' }, [
    el('p', { class: 'eyebrow' }, [
      el('b', { text: 'SEC-01 / BRIEFING' }),
      latest.date ? el('span', { text: dLong(latest.date) }) : null,
      latest.generated_at ? el('span', { text: `EDICIÓN ${tLocal(latest.generated_at)} HORA PENINSULAR` }) : null,
      el('span', { class: 'tplus' }, ['T+', el('b', { class: 'js-tplus', text: '00:00:00' }), ' DESDE LA ÚLTIMA ACTUALIZACIÓN']),
    ]),
    el('h1', { class: 'hero-h', id: 'h-brief' }, headline),
    el('p', { class: 'summary', text: summary }),
    kpiBlock(st, makeDelta(latest, index), counters),
    el('div', { class: 'copy__actions' }, [
      el('a', { class: 'btn', href: '#listado', text: `Ver las ${nf(st.new_cves)} CVE` }),
      top[0] && cveHref(top[0].id) ? el('a', { class: 'link', href: cveHref(top[0].id), text: 'Ficha de la nº 1 →' }) : null,
    ]),
  ]);
}

/* ───────── zona del globo (contenedor + HUD; el globo llega en la fase 4) ───────── */

function globeSummary(map) {
  if (!map || !map.points.length) return 'Mapa de origen de ataques no disponible en esta lectura.';
  const total = map.points.reduce((a, p) => a + p.attacks, 0);
  const countries = new Set(map.points.map((p) => p.cc)).size;
  const lead = map.by_country.slice(0, 3).map((c) => c.country).filter(Boolean);
  return `Origen de ataques de las últimas 24 horas según los sensores de SANS ISC: ${nf(total)} eventos desde ${countries} países.`
    + (lead.length ? ` Más actividad en ${lead.join(', ')}.` : '');
}

function globeHud(map) {
  const total = map ? map.points.reduce((a, p) => a + p.attacks, 0) : 0;
  const countries = map ? new Set(map.points.map((p) => p.cc)).size : 0;
  return el('div', { class: 'globe-hud', id: 'globe-hud', 'aria-hidden': 'true' }, [
    el('div', { class: 'hud-tl' }, [
      el('span', ['GLB-01 / ', el('b', { text: 'ORIGEN DE ATAQUES · 24 H' })]),
      el('span', { text: map ? `${nf(total)} EVENTOS · ${countries} PAÍSES · LECTURA ${tUTC(map.updated_at)} UTC` : 'SIN LECTURA DEL MAPA' }),
    ]),
    el('div', { class: 'hud-bl' }, [
      el('span', { class: 'hud-legend' }, [
        el('span', [el('i', { class: 'hud-dot hud-dot--hi' }), '≥ 3.000']),
        el('span', [el('i', { class: 'hud-dot hud-dot--mid' }), '1.000–2.999']),
        el('span', [el('i', { class: 'hud-dot hud-dot--lo' }), '< 1.000']),
      ]),
    ]),
    el('div', { class: 'hud-ticks' }),
  ]);
}

function globeZone(map) {
  return el('div', { class: 'globe-zone', id: 'globe-zone' }, [
    el('div', { class: 'globe', id: 'globe', role: 'img', 'aria-label': globeSummary(map) }),
    el('div', { class: 'globe-fallback', id: 'globe-flat', 'aria-hidden': 'true' }),
    globeHud(map),
  ]);
}

/* ───────── top 10 ───────── */

function topRow(c, i, animate) {
  const href = cveHref(c.id);
  const prov = isProv(c);
  const tagsLong = TAG_ORDER.filter((t) => c.tags.includes(t)).map((t) => TAG[t].long.toLowerCase());
  const sev = SEV[sevKey(c.severity)].label.toLowerCase();
  const label = `${i + 1}. ${c.id}, ${[c.vendor, c.product].filter(Boolean).join(' ') || 'sin fabricante'}, score ${c.score}${prov ? ' provisional' : ''}, CVSS ${fmtCvss(c.cvss)} ${sev}, EPSS ${fmtPctl(c.epss_percentile)}${tagsLong.length ? ', ' + tagsLong.join(', ') : ''}`;
  const cells = [
    el('span', { class: 'trow__pos', 'aria-hidden': 'true', text: pad(i + 1) }),
    el('span', { class: 'trow__id', text: c.id }),
    el('span', { class: 'trow__prod' }, [el('b', { text: c.vendor || '—' }), el('span', { text: c.product })]),
    el('span', { class: 'trow__score' }, sbar(c)),
    el('span', { class: 'trow__cvss' }, [el('span', { class: 'v', text: fmtCvss(c.cvss) }), sevTag(c.severity)]),
    el('span', { class: 'trow__epss', text: fmtPctl(c.epss_percentile) }),
    el('span', { class: 'trow__chips' }, chips(c.tags)),
  ];
  const attrs = { class: 'trow' + (animate ? ' is-in' : ''), style: { '--i': i, '--sc': scoreVar(c.score) } };
  return el('li', href ? el('a', { ...attrs, href, 'aria-label': label }, cells) : el('div', attrs, cells));
}

function topPanel(top, empty, animate) {
  const body = empty
    ? [emptyBlock('Nada que priorizar todavía', 'Cuando entre el primer lote de NVD aparecerán aquí las diez CVE con más score. Si una fuente falla, el top se calcula con las que respondan.')]
    : [
      el('div', { class: 'tbl__head label', 'aria-hidden': 'true' }, [
        el('span', { text: 'Nº' }), el('span', { text: 'CVE' }), el('span', { text: 'FABRICANTE / PRODUCTO' }),
        el('span', { text: 'SCORE 0–100' }), el('span', { text: 'CVSS' }), el('span', { class: 'tbl__r', text: 'EPSS' }), el('span', { text: 'ETIQUETAS' }),
      ]),
      el('ol', { class: 'tbl__rows' }, top.map((c, i) => topRow(c, i, animate))),
      el('div', { class: 'tbl__foot' }, [
        top.some(isProv) ? el('span', { class: 'label', text: '* SCORE PROVISIONAL: CVE SIN PUNTUAR EN NVD' }) : el('span'),
        el('a', { class: 'link mono tbl__more', href: '#listado', text: 'LISTADO COMPLETO →' }),
      ]),
    ];
  return el('section', { class: 'top panel', 'aria-labelledby': 'h-top' }, [
    panelHead('TOP-10', 'Las que importan hoy', 'ORDEN: SCORE ZEROHOUR', 'h-top'), ...body,
  ]);
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
  const maxC = Math.max(1, ...rows.map((c) => c.attacks));
  return el('section', { class: 'panel', id: 'panel-cty', 'aria-labelledby': 'h-cty' }, [
    panelHead('GEO-02', 'Países de origen', rows.length ? `24 H · TOP ${rows.length}` : '24 H', 'h-cty'),
    rows.length
      ? rankList(rows.map((c) => ({ code: c.cc, name: c.country, value: nf(c.attacks), w: Math.round(c.attacks / maxC * 100), band: attackBand(c.attacks) })))
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
      extLink(n.url, { class: 'news-list__a' }, [el('span', { text: n.title }), el('small', { text: n.source })])))),
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
    el('div', { class: 'brief__sweep', 'aria-hidden': 'true' }),
    copyBlock(latest, index, top, empty, counters),
    globeZone(map),
    el('aside', { class: 'radar-panel panel', 'aria-labelledby': 'h-radar' }, [
      panelHead('RDR-01', 'Radar de urgencia', 'TOP 10', 'h-radar'),
      empty || !top.length ? emptyBlock(null, 'Sin contactos.', true) : renderRadar(top),
    ]),
    topPanel(top, empty, animate),
    el('div', { class: 'side' }, [countriesPanel(map), portsPanel(map), newsPanel(latest.news)]),
  ]));

  if (animate) countUp(counters);
  animated = true;
}

/** Tras refrescar map.json: re-pinta solo lo que depende del mapa (sin animaciones ni perder el foco del resto). */
export function refreshMapPanels(state) {
  const map = state.map;
  const swap = (id, node) => { const old = document.getElementById(id); if (old) old.replaceWith(node); };
  swap('panel-cty', countriesPanel(map));
  swap('panel-ports', portsPanel(map));
  swap('globe-hud', globeHud(map));
  const g = document.getElementById('globe');
  if (g) g.setAttribute('aria-label', globeSummary(map));
}
