/* =============================================================================
   render/briefing.js · BRIEFING «Órbita» (design/orbita/zerohour-estilo-orbita.md §4)
   Escritorio (1440 × 900 sin scroll): «Lo primero hoy» + tira de cifras y, 24 px debajo,
   tres columnas que empiezan a la misma altura: top 10 (440) · globo (1fr) · radar y
   puertos (330). Debajo del primer pantallazo, «Más del día»: avisos y prensa y el resumen.
   Móvil: lead → cifras → globo → países → top 10 (5 + «Ver las 10») → radar → puertos.
   ============================================================================= */
import { el, clear } from '../util/dom.js';
import { panelHead, emptyBlock, extLink, langOf, icon, verdictOf, vshape, cveHref, who } from './comunes.js';
import { orbRows, rowsFoot } from './filas.js';
import { renderRadar } from '../radar.js';
import { scheduleGlobe, updateGlobe, countryMarkers, makeScale, zoomControls, kfmt, flyTo, markerText, starField } from '../globe.js';
import { nf, dLong, tLocal, tUTC, countryName } from '../util/format.js';

const PORTS = { 21: 'FTP', 22: 'SSH', 23: 'TELNET', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 137: 'NETBIOS', 443: 'HTTPS', 445: 'SMB', 2222: 'SSH-ALT', 2323: 'TELNET-ALT', 3306: 'MYSQL', 3389: 'RDP', 5060: 'SIP', 8000: 'HTTP-ALT', 8080: 'HTTP-ALT', 9000: 'HTTP-ALT' };
const MAX_NEWS = 8;

/* ───────── tira de cifras (Órbita §5.2, con los contadores que aprobó dirección en la fase 6) ───────── */

/**
 * Variación frente a la media de los 7 días anteriores (index.json), en una línea pequeña bajo la
 * cifra (D2). Sin 7 días de histórico, con el día vacío o sin la serie, no se pinta nada.
 */
function makeDelta(latest, index) {
  const prev = index ? index.days.filter((d) => d.date < latest.date).slice(-7) : [];
  return (value, pick) => {
    if (prev.length < 7 || !latest.stats.new_cves) return null;
    const vals = prev.map((d) => pick(d.stats));
    if (vals.some((v) => v == null)) return null;          // serie incompleta (p. ej. antes de la fase 6)
    const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
    if (!avg) return null;
    const pct = Math.round((value - avg) / avg * 100);
    return el('span', { class: 'kpi__d', title: `Media de los 7 días anteriores: ${nf(avg, avg < 10 ? 1 : 0)}` },
      `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${nf(Math.abs(pct))} % vs 7 d`);
  };
}

function kpi({ label, value, cls = '', delta = null, title = null, sr = null }) {
  return el('li', { class: `kpi ${cls}${value === 0 ? ' kpi--zero' : ''}`.trim(), title }, [
    el('span', { class: 'kpi__v num', text: nf(value) }),
    el('span', { class: 'kpi__l', text: label }),
    sr ? el('span', { class: 'sr-only', text: sr }) : null,
    delta,
  ]);
}

function kpiStrip(latest, index) {
  const st = latest.stats;
  const delta = makeDelta(latest, index);
  // Explotadas = nuevas en KEV hoy + CVE de la edición con SSVC «active» de CISA (aún fuera de KEV).
  // index.json no guarda el recuento SSVC por día: para no comparar series distintas, sin variación.
  const ssvc = latest.cves.filter((c) => c.tags.includes('ssvc')).length;
  const explot = st.kev_new + ssvc;
  return el('ul', { class: 'kpis', 'aria-label': 'Cifras del día' }, [
    kpi({ label: 'CVE nuevas', value: st.new_cves, delta: delta(st.new_cves, (s) => s.new_cves) }),
    kpi({ label: 'Críticas', value: st.by_severity.CRITICAL, delta: delta(st.by_severity.CRITICAL, (s) => s.by_severity.CRITICAL),
      title: `${nf(st.by_severity.UNSCORED)} sin puntuar todavía` }),
    kpi({ label: 'Explotadas', value: explot, cls: explot ? 'kpi--kev' : '',
      title: `${nf(st.kev_new)} nuevas en el catálogo KEV hoy (incluye CVE antiguas que entran hoy en KEV) y ${nf(ssvc)} de hoy que CISA marca como explotadas en SSVC`,
      sr: `: ${nf(st.kev_new)} KEV y ${nf(ssvc)} SSVC; incluye CVE antiguas que entran hoy en KEV` }),
    st.with_exploit != null
      ? kpi({ label: 'Exploit verificado', value: st.with_exploit, delta: delta(st.with_exploit, (s) => s.with_exploit),
        title: `${nf(st.with_detection || 0)} con plantilla de detección · ${nf(Math.max(0, st.with_poc - st.with_exploit - (st.with_detection || 0)))} con PoC sin verificar` })
      // Ediciones anteriores a la fase 6: no hay exploits verificados, solo PoC
      : kpi({ label: 'Con PoC', value: st.with_poc, delta: delta(st.with_poc, (s) => s.with_poc) }),
    kpi({ label: 'Mi stack', value: st.in_stack, delta: delta(st.in_stack, (s) => s.in_stack) }),
    kpi({ label: 'Remotas', value: st.remote, delta: delta(st.remote, (s) => s.remote) }),
  ]);
}

/* ───────── «Lo primero hoy» (§5.1): la CVE más urgente en una frase ───────── */

function leadLine(top) {
  const c = top[0];
  if (!c) return null;                                   // con el top vacío no se pinta
  const v = verdictOf(c.score), w = who(c), href = cveHref(c.id);
  const name = w.pending ? c.id : [w.main, w.sub].filter(Boolean).join(' ');
  const rest = ` · ${c.score} · ${c.tags.includes('kev') ? 'explotada (KEV)' : v.label.toLowerCase()}${c.tags.includes('stack') ? ' · en mi stack' : ''}`;
  const body = [el('b', { text: name }), rest];
  return el('p', { class: `lead v-${v.key}` }, [
    el('span', { class: 'lead__k kicker' }, [vshape(v, 'lead__shape'), 'Lo primero hoy']),
    href ? el('a', { class: 'lead__a', href }, body) : el('span', { class: 'lead__a' }, body),
  ]);
}

/* ───────── «Más del día» (D2): avisos y prensa + resumen, debajo del primer pantallazo ───────── */

function sumPanel(latest, map, empty) {
  const st = latest.stats;
  return el('section', { class: 'panel sum', 'aria-labelledby': 'h-sum' }, [
    panelHead('', 'Resumen', null, 'h-sum'),
    el('div', { class: 'panel__body' }, [
      el('p', { class: 'sum__p', text: empty || !latest.summary ? 'Sin datos de NVD para hoy todavía. El listado y el top se rellenarán solos en la próxima lectura; mientras tanto, el histórico sigue disponible.' : latest.summary }),
      el('dl', { class: 'edmeta' }, [
        el('div', [el('dt', { text: 'Edición' }), el('dd', { text: latest.date ? dLong(latest.date) : '—' })]),
        el('div', [el('dt', { text: 'Generada' }), el('dd', { text: latest.generated_at ? `${tLocal(latest.generated_at)} (${tUTC(latest.generated_at)} UTC)` : '—' })]),
        el('div', [el('dt', { text: 'Desde la actualización' }), el('dd', ['T+', el('span', { class: 'js-tplus', text: '--:--:--' })])]),
        el('div', [el('dt', { text: 'Mapa' }), el('dd', { id: 'sum-map', text: map && map.updated_at ? `lectura de las ${tUTC(map.updated_at)} UTC` : 'sin lectura' })]),
      ]),
    ]),
    el('div', { class: 'panel__foot' }, [el('a', { class: 'btn', href: '#listado' }, [`Ver las ${nf(st.new_cves)} CVE `, icon('arrow')])]),
  ]);
}

function newsPanel(news) {
  const shown = news.slice(0, MAX_NEWS);
  return el('section', { class: 'panel newsp', 'aria-labelledby': 'h-news' }, [
    panelHead('', 'Avisos y prensa', news.length ? (shown.length < news.length ? `${shown.length} de ${news.length}` : String(news.length)) : null, 'h-news'),
    news.length
      ? el('ul', { class: 'news-list' }, shown.map((n) => el('li',
        extLink(n.url, { class: 'news-list__a' }, [el('span', { lang: langOf(n.lang), text: n.title }), el('small', { text: n.source })]))))
      : el('p', { class: 'muted-line', text: 'Sin avisos ni noticias en esta edición.' }),
  ]);
}

/* ───────── escenario del globo (guía Órbita §5.7–5.8) ─────────
   Textos coherentes (corrección 6 de dirección): el título dice lo que son los datos (el
   ranking de DShield de IPs activas hoy) y el tooltip, los botones y el ranking usan la misma
   unidad que map.json y su nota: «ataques acumulados» e «IPs activas». */
const MAP_TITLE = 'Ranking DShield · IPs activas hoy';
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function mapSummary(map) {
  if (!map || !map.points.length) return 'Mapa de origen de ataques no disponible en esta lectura.';
  const ms = countryMarkers(map);
  return `Globo: ${MAP_TITLE}. ${ms.length} países; más ataques acumulados: ${ms.slice(0, 3).map((m) => `${countryName(m.cc, m.country)} ${nf(m.attacks)}`).join(', ')}.`;
}

const mapSub = (map) => `${nf(countryMarkers(map).length)} países · lectura de las ${tUTC(map.updated_at)} UTC`;

function mapFoot(map) {
  return el('p', { class: 'mapfoot', id: 'map-foot', text: [map.note, map.source ? `Fuente: ${map.source}.` : ''].filter(Boolean).join(' ') });
}

/** Los 5 países con más ataques (3 en el móvil): cada uno es un botón que lleva el globo hasta él. */
function countryButtons(map) {
  const ms = countryMarkers(map).slice(0, 5), scale = makeScale(countryMarkers(map));
  return el('ol', { class: 'cc', id: 'map-cc', 'aria-label': 'Países con más ataques acumulados' }, ms.map((m) => el('li', { class: `cc--${scale.tier(m.attacks)}` },
    el('button', { type: 'button', class: 'cc__b', 'aria-label': `Llevar el globo a ${markerText(m)}`, on: { click: () => flyTo(m.lat, m.lon) } }, [
      el('span', { class: 'cc__c', text: countryName(m.cc, m.country) }),
      el('span', { class: 'cc__n', text: kfmt(m.attacks) }),
      el('span', { class: 'cc__s', text: `${nf(m.sources)} ${m.sources === 1 ? 'IP' : 'IPs'}` }),
    ]))));
}

function mapPanel(map) {
  const ok = map && map.points.length;
  return el('section', { class: 'mapp', id: 'panel-map', 'aria-labelledby': 'h-map' }, [
    el('header', { class: 'mapp__h' }, [
      el('h2', { class: 'mapp__t kicker', id: 'h-map', text: MAP_TITLE }),
      el('p', { class: 'mapp__x', id: 'map-sub', text: ok ? mapSub(map) : 'Sin lectura del mapa' }),
    ]),
    ok ? el('div', { class: 'globe-box', id: 'globe-zone' }, [
      starField(),
      el('p', { class: 'sr-only', id: 'map-sum', text: mapSummary(map) }),
      el('div', {
        class: 'globe-view', id: 'globe-view', tabindex: '0', role: 'group',
        'aria-label': 'Globo interactivo. Flechas para girar, más y menos para acercar o alejar, cero para volver a la vista inicial.',
      }, [
        el('div', { class: 'globe', id: 'globe', 'aria-hidden': 'true' }),
        el('div', { class: 'globe-flat', id: 'globe-flat', 'aria-hidden': 'true' }),
      ]),
      zoomControls(),
      el('p', { class: 'globe-hint', text: COARSE ? 'Arrastra para girar · pellizca para acercar' : 'Arrastra para girar · Ctrl + rueda para acercar' }),
      el('p', { class: 'globe-tip', id: 'globe-tip', 'aria-live': 'polite' }),
      el('p', { class: 'globe-note', id: 'globe-note' }),
    ]) : el('div', { class: 'globe-box globe-box--off' }, emptyBlock('Mapa no disponible',
      map ? 'Sin orígenes de ataque en esta lectura de SANS ISC. El resto del briefing funciona con normalidad.'
        : 'El mapa de ataques no se pudo leer en esta edición (map.json). El resto del briefing funciona con normalidad.', true)),
    ok ? countryButtons(map) : null,
    ok ? mapFoot(map) : null,
  ]);
}

/* ───────── top 10 (§5.3) ───────── */

const TOP_SPLIT = 5;                                    // por debajo de 1000 px: 5 y «Ver las 10»
const WIDE = matchMedia('(min-width: 1000px)');

function topPanel(top, empty, st, edicion) {
  const head = el('div', { class: 'panel__head' }, [
    el('h2', { class: 'panel__title', id: 'h-top', text: 'Las 10 que importan' }),
    el('a', { class: 'panel__more link', href: '#listado' }, [`de ${nf(st.new_cves)} `, icon('arrow')]),
  ]);
  const sec = el('section', { class: 'panel top10', id: 'panel-top', 'aria-labelledby': 'h-top' }, head);
  if (empty || !top.length) {
    sec.append(emptyBlock('Nada que priorizar todavía', 'Cuando entre el primer lote de NVD aparecerán aquí las diez CVE con más score. Si una fuente falla, el top se calcula con las que respondan.', true));
    return sec;
  }
  const totals = {};
  for (const c of top) { const k = verdictOf(c.score).key; totals[k] = (totals[k] || 0) + 1; }
  const split = WIDE.matches ? top.length : TOP_SPLIT;
  sec.append(orbRows(top.slice(0, split), { totals, edicion }));
  if (top.length > split) {
    sec.append(el('details', { class: 'more10' }, [
      el('summary', { text: `Ver las ${top.length}` }),
      orbRows(top.slice(split), { totals, edicion, start: split }),
    ]));
  }
  sec.append(rowsFoot(top));
  return sec;
}

/* ───────── debajo: países, puertos, prensa ───────── */

function rankList(rows) {
  return el('ol', { class: 'rank' }, rows.map((r) => el('li', [
    el('span', { class: 'cc', text: r.code }),
    el('span', { class: 'nm', text: r.name }),
    el('span', { class: 'v num', text: r.value }),
    el('span', { class: 'bar' + (r.band ? ` bar--${r.band}` : ''), 'aria-hidden': 'true', style: { '--w': r.w } }, el('i')),
  ])));
}

function portsPanel(map) {
  const rows = map ? map.top_ports : [];
  const maxP = Math.max(1, ...rows.map((p) => p.records));
  return el('section', { class: 'panel ports', id: 'panel-ports', 'aria-labelledby': 'h-ports' }, [
    panelHead('', 'Puertos más atacados', 'REGISTROS', 'h-ports'),
    rows.length
      ? rankList(rows.map((p) => ({ code: String(p.port), name: PORTS[p.port] || `TCP/${p.port}`, value: kfmt(p.records), w: Math.round(p.records / maxP * 100) })))
      : emptyBlock(null, map ? 'Sin datos de puertos en esta lectura de SANS ISC.' : 'El mapa de ataques no se pudo leer en esta edición.', true),
  ]);
}

/* ───────── vista ───────── */

export function renderBriefing(root, state) {
  const { latest, index } = state.data;
  const map = state.map;
  const top = latest.top;
  const empty = !latest.cves.length;

  clear(root);
  root.append(
    el('h1', { class: 'sr-only', id: 'h-brief', text: latest.date ? `Briefing del ${dLong(latest.date)}` : 'Briefing del día' }),
    el('div', { class: 'brief__head' }, [leadLine(top), kpiStrip(latest, index)]),
    el('div', { class: 'brief' }, [
      topPanel(top, empty, latest.stats, latest.date),
      el('div', { class: 'stage' }, mapPanel(map)),
      el('div', { class: 'side' }, [
        el('section', { class: 'panel radarp', 'aria-labelledby': 'h-radar' }, [
          panelHead('', 'Radar', 'centro = más urgente', 'h-radar'),
          el('div', { class: 'panel__body' }, empty || !top.length ? el('p', { class: 'muted-line', text: 'Sin contactos.' }) : renderRadar(top)),
        ]),
        portsPanel(map),
      ]),
    ]),
    el('section', { class: 'more', 'aria-labelledby': 'h-more' }, [
      el('h2', { class: 'more__h kicker', id: 'h-more', text: 'Más del día' }),
      el('div', { class: 'more__grid' }, [newsPanel(latest.news), sumPanel(latest, map, empty)]),
    ]),
  );

  // Al cruzar los 1000 px cambia cuántas filas se ven sin «Ver las 10»: se rehace solo el top
  if (!WIDE.onchange) WIDE.onchange = () => { const old = document.getElementById('panel-top'); if (old) old.replaceWith(topPanel(top, empty, latest.stats, latest.date)); };
  scheduleGlobe(document.getElementById('globe-zone'), map);
}

/** Tras refrescar map.json: re-pinta solo lo que depende del mapa (sin perder el foco del resto). */
export function refreshMapPanels(state) {
  const map = state.map;
  if (!map || !map.points.length || !document.getElementById('globe-zone')) return;
  const swap = (id, node) => { const old = document.getElementById(id); if (old) old.replaceWith(node); };
  swap('map-cc', countryButtons(map));
  swap('map-foot', mapFoot(map));
  swap('panel-ports', portsPanel(map));
  const sub = document.getElementById('map-sub'), sum = document.getElementById('map-sum'), sm = document.getElementById('sum-map');
  if (sub) sub.textContent = mapSub(map);
  if (sum) sum.textContent = mapSummary(map);
  if (sm) sm.textContent = `lectura de las ${tUTC(map.updated_at)} UTC`;
  updateGlobe(map);
}
