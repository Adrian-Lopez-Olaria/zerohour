/* =============================================================================
   render/detalle.js · SEC-03 FICHA DE UNA CVE
   - Dial y desglose desde score_breakdown + scoring_weights: una fila por cada
     peso que traiga el JSON (hoy 6, ransomware incluido); nada fijo en el código.
   - PoC: texto 100 % hostil, aviso de "sin verificar" y rel="… nofollow ugc".
   - CVSS 3.x y 4.0: las métricas se leen del vector y se traducen con tablas fijas.
   ============================================================================= */
import { el, svg, clear } from '../util/dom.js';
import { sevKey } from '../data.js';
import {
  chips, sevTag, panelHead, emptyBlock, cveHref, isProv, icon, extLink, hostPath, langOf, editionBanner, who, byUrgency,
} from './comunes.js';
import {
  nf, pad, fmtCvss, fmtPctl, fmtEpss, dShort, scoreBand, scoreVar, verdict, daysFromToday, prefersReducedMotion,
} from '../util/format.js';

// kev/poc: filas de las ediciones anteriores a la fase 6; explotada/exploit: las actuales
const BD_LABEL = { cvss: 'CVSS', epss: 'EPSS', kev: 'KEV', explotada: 'EXPLOTADA', ransomware: 'RANSOM', poc: 'POC', exploit: 'EXPLOIT', stack: 'STACK' };
const POC_WARNING = 'PoC públicas sin verificar: algunas son falsas o contienen malware. No las ejecutes fuera de un laboratorio aislado.';
const MAX_POC = 10;
const MAX_REFS = 8;

const CWE_NAMES = {
  'CWE-20': 'Validación de entrada incorrecta', 'CWE-22': 'Path traversal', 'CWE-77': 'Inyección de comandos', 'CWE-78': 'Inyección de comandos del SO',
  'CWE-79': 'Cross-site scripting', 'CWE-89': 'Inyección SQL', 'CWE-94': 'Inyección de código', 'CWE-119': 'Operaciones fuera de los límites del búfer',
  'CWE-120': 'Desbordamiento de búfer clásico', 'CWE-122': 'Desbordamiento de búfer en heap', 'CWE-125': 'Lectura fuera de límites',
  'CWE-190': 'Desbordamiento de entero', 'CWE-200': 'Exposición de información sensible', 'CWE-209': 'Información sensible en mensajes de error',
  'CWE-269': 'Gestión incorrecta de privilegios', 'CWE-276': 'Permisos por defecto incorrectos', 'CWE-284': 'Control de acceso inadecuado',
  'CWE-287': 'Autenticación incorrecta', 'CWE-288': 'Omisión de autenticación por ruta alternativa', 'CWE-306': 'Falta de autenticación en función crítica',
  'CWE-352': 'Cross-site request forgery', 'CWE-362': 'Condición de carrera', 'CWE-400': 'Consumo de recursos sin control',
  'CWE-416': 'Uso después de liberar (UAF)', 'CWE-434': 'Subida de ficheros de tipo peligroso', 'CWE-444': 'HTTP request smuggling',
  'CWE-476': 'Desreferencia de puntero nulo', 'CWE-502': 'Deserialización de datos no fiables', 'CWE-601': 'Redirección abierta',
  'CWE-611': 'Entidades externas XML (XXE)', 'CWE-787': 'Escritura fuera de límites', 'CWE-798': 'Credenciales incrustadas',
  'CWE-862': 'Falta de autorización', 'CWE-863': 'Autorización incorrecta', 'CWE-918': 'Server-side request forgery', 'CWE-1321': 'Contaminación de prototipo',
  'NVD-CWE-noinfo': 'Información insuficiente (NVD)', 'NVD-CWE-Other': 'Otra debilidad (NVD)',
};

/* Métricas del vector: [clave, etiqueta, valores, valores "calientes"] */
const IMPACT = { N: 'Ninguno', L: 'Bajo', H: 'Alto' };
const METRICS = {
  3: [
    ['AV', 'VECTOR', { N: 'Red', A: 'Adyacente', L: 'Local', P: 'Físico' }, ['N']],
    ['AC', 'COMPLEJIDAD', { L: 'Baja', H: 'Alta' }, ['L']],
    ['PR', 'PRIVILEGIOS', { N: 'Ninguno', L: 'Bajos', H: 'Altos' }, ['N']],
    ['UI', 'INTERACCIÓN', { N: 'Ninguna', R: 'Requerida' }, ['N']],
    ['S', 'ALCANCE', { U: 'Sin cambio', C: 'Cambia' }, ['C']],
    ['C', 'CONFIDENC.', IMPACT, ['H']], ['I', 'INTEGRIDAD', IMPACT, ['H']], ['A', 'DISPONIB.', IMPACT, ['H']],
  ],
  4: [
    ['AV', 'VECTOR', { N: 'Red', A: 'Adyacente', L: 'Local', P: 'Físico' }, ['N']],
    ['AC', 'COMPLEJIDAD', { L: 'Baja', H: 'Alta' }, ['L']],
    ['AT', 'REQUISITOS', { N: 'Ninguno', P: 'Presentes' }, ['N']],
    ['PR', 'PRIVILEGIOS', { N: 'Ninguno', L: 'Bajos', H: 'Altos' }, ['N']],
    ['UI', 'INTERACCIÓN', { N: 'Ninguna', P: 'Pasiva', A: 'Activa' }, ['N']],
    ['VC', 'CONFID. SIST.', IMPACT, ['H']], ['VI', 'INTEGR. SIST.', IMPACT, ['H']], ['VA', 'DISPON. SIST.', IMPACT, ['H']],
    ['SC', 'CONFID. SUBS.', IMPACT, ['H']], ['SI', 'INTEGR. SUBS.', IMPACT, ['H']], ['SA', 'DISPON. SUBS.', IMPACT, ['H']],
  ],
};
// Prioridad de referencias de NVD: primero lo accionable
const REF_PRIORITY = ['Vendor Advisory', 'Patch', 'Mitigation', 'Release Notes', 'Third Party Advisory', 'US Government Resource'];

let sortedCache = { cves: null, list: [] };
function byScore(cves) {
  if (sortedCache.cves !== cves) sortedCache = { cves, list: cves.slice().sort(byUrgency) };
  return sortedCache.list;
}

/* ───────── dial ───────── */

function gauge(score) {
  const N = 50, C = 150, r1 = 112, r2 = 132, start = -135, span = 270, on = Math.round(score / 100 * N);
  const pt = (r, deg) => { const a = deg * Math.PI / 180; return [(C + r * Math.sin(a)).toFixed(1), (C - r * Math.cos(a)).toFixed(1)]; };
  const ticks = Array.from({ length: N + 1 }, (_, i) => {
    const deg = start + i / N * span, ri = i % 5 === 0 ? r1 - 6 : r1;
    const [x1, y1] = pt(ri, deg), [x2, y2] = pt(r2, deg);
    const lit = i <= on && score > 0;
    return svg('line', { class: `tk tk--${scoreBand(i / N * 100)}${lit ? ' on' : ''}`, x1, y1, x2, y2, style: { '--k': i } });
  });
  const labels = [0, 40, 70, 85, 100].map((v) => {
    const [x, y] = pt(146, start + v / 100 * span);
    return svg('text', { class: 'gauge__l', x, y: (Number(y) + 3).toFixed(1), 'text-anchor': 'middle', text: v });
  });
  return svg('svg', {
    class: 'gauge' + (prefersReducedMotion() ? '' : ' is-anim'), viewBox: '0 0 300 270', role: 'img',
    'aria-label': `Score ZEROHOUR ${score} de 100: ${verdict(score).toLowerCase()}`,
  }, [
    ...ticks, ...labels,
    svg('text', { class: 'gauge__n', x: C, y: C + 30, 'text-anchor': 'middle', text: score }),
    svg('text', { class: 'gauge__l', x: C, y: C + 56, 'text-anchor': 'middle', text: 'SCORE / 100' }),
  ]);
}

function scorePanel(c, weights) {
  const keys = Object.keys(weights).filter((k) => Number(weights[k]) > 0);
  const rows = keys.map((k) => {
    const max = Number(weights[k]);
    const v = Math.max(0, Math.min(max, Number(c.score_breakdown[k]) || 0));
    const pct = Math.round(v / max * 100);
    return el('div', { class: 'bd' + (v > 0 ? ' bd--on' : '') }, [
      el('dt', { class: 'bd__k', text: BD_LABEL[k] || k.toUpperCase() }),
      el('dd', { class: 'bd__t', 'aria-hidden': 'true' }, el('i', { style: { '--w': pct } })),
      el('dd', { class: 'bd__v' }, [nf(v, v % 1 ? 1 : 0), el('small', { text: `/${nf(max)}` })]),
    ]);
  });
  const weightsLine = keys.map((k) => `${BD_LABEL[k] || k.toUpperCase()} ${nf(weights[k])}`).join(' · ');
  return el('section', { class: 'panel', 'aria-labelledby': 'h-score', style: { '--sc': scoreVar(c.score) } }, [
    panelHead('SCR-01', 'Score ZEROHOUR', isProv(c) ? 'PROVISIONAL' : 'FINAL', 'h-score'),
    el('div', { class: 'gauge-wrap' }, [gauge(c.score), el('span', { class: 'verdict', text: verdict(c.score) })]),
    el('dl', { class: 'breakdown' }, rows),
    floorNote(c, keys),
    el('p', { class: 'label bd-foot' }, [
      `PESOS MÁXIMOS: ${weightsLine}`,
      c.breakdown_source === 'derivado' ? el('span', { class: 'bd-foot__src', text: ' · DESGLOSE RECALCULADO CON ESOS PESOS' }) : null,
    ]),
  ]);
}

/** Si el pipeline aplicó un mínimo, se dice con todas las letras y con la suma real de las filas. */
function floorNote(c, keys) {
  const f = c.score_floor;
  if (!f) return null;
  const sum = Math.round(keys.reduce((a, k) => a + (Number(c.score_breakdown[k]) || 0), 0));
  const why = f.exploited_by === 'kev' ? 'está en el catálogo KEV de CISA' : 'CISA la marca como explotada (SSVC «active»)';
  const AGG = { stack: 'afecta a tu stack', ransomware: 'se usa en campañas de ransomware', exploit: 'tiene un exploit verificado' };
  const agg = f.aggravating.map((a) => AGG[a]).filter(Boolean);
  return el('p', { class: 'bd-floor', role: 'note' }, [
    el('b', { text: `MÍNIMO POR EXPLOTACIÓN ACTIVA · ${f.value}` }),
    `Las filas suman ${nf(sum)}, pero ${why}${agg.length ? ' y ' + agg.join(' y ') : ''}: una CVE explotada nunca queda por debajo de ${f.value} («${verdict(f.value).toLowerCase()}»).`,
  ]);
}

/* ───────── textos de apoyo ───────── */

function kevDeadline(kev) {
  const d = daysFromToday(kev && kev.due_date);
  if (d == null) return null;
  return d > 0 ? `quedan ${d} ${d === 1 ? 'día' : 'días'}` : d === 0 ? 'vence hoy' : `venció hace ${-d} ${d === -1 ? 'día' : 'días'}`;
}

function analystNote(c) {
  const has = (t) => c.tags.includes(t), out = [];
  if (c.kev) {
    const dl = kevDeadline(c.kev);
    out.push(`Explotada activamente; CISA da de plazo hasta el ${dShort(c.kev.due_date)}${dl ? ` (${dl})` : ''}.`);
  }
  if ((c.kev && c.kev.ransomware) || has('ransomware')) out.push('Hay campañas de ransomware usándola: trátala como incidente si está expuesta.');
  if (has('poc') && !c.kev) out.push('Exploit público disponible: la ventana hasta la explotación masiva suele ser corta.');
  if (has('stack')) out.push('Afecta a tu stack: revisa versiones en el inventario.');
  if (has('library')) out.push('Es una dependencia: búscala en los lockfiles, no en el inventario de servidores.');
  if (!out.length) out.push(c.score >= 40 ? 'Sin explotación conocida. Planifica la actualización en la próxima ventana.' : 'Riesgo bajo hoy. Vigilar por si cambia el EPSS o aparece una PoC.');
  return out.join(' ');
}

function parseVector(vector) {
  const m = /^CVSS:(\d)\.\d\//.exec(String(vector || ''));
  if (!m || !METRICS[m[1]]) return null;
  const vals = {};
  for (const part of vector.split('/').slice(1)) { const [k, v] = part.split(':'); if (k && v) vals[k] = v; }
  return { major: m[1], vals };
}

/* ───────── paneles ───────── */

function descPanel(c) {
  return el('section', { class: 'panel', 'aria-labelledby': 'h-desc' }, [
    panelHead('DSC-02', 'Descripción', 'NVD · EN', 'h-desc'),
    el('div', { class: 'panel__body' }, [
      el('p', { class: 'note' }, [el('b', { text: 'NOTA DEL ANALISTA' }), analystNote(c)]),
      c.description ? el('p', { class: 'desc-en', lang: 'en', text: c.description }) : el('p', { class: 'muted-line', text: 'NVD aún no ha publicado la descripción.' }),
    ]),
  ]);
}

function cvssPanel(c) {
  const k = sevKey(c.severity);
  let body;
  if (c.cvss == null) {
    body = [el('p', { class: 'note unscored-note' }, [
      el('b', { text: 'SIN PUNTUAR · PENDIENTE DE NVD' }),
      'NVD aún no ha analizado esta CVE (es lo normal el primer día). Mientras tanto el CVSS cuenta con un valor neutro del 40 %, así que el score puede cambiar cuando llegue.',
    ])];
  } else {
    const vec = parseVector(c.vector);
    body = [
      el('dl', { class: 'bignums' }, [
        el('div', { class: 'bignum' }, [el('dt', { text: 'BASE SCORE' }), el('dd', { class: `sevc--${k}` }, [fmtCvss(c.cvss), el('small', { text: '/ 10' })])]),
        el('div', { class: 'bignum bignum--sev' }, [el('dt', { text: 'SEVERIDAD' }), el('dd', sevTag(c.severity))]),
      ]),
      vec ? el('dl', { class: 'metrics' }, METRICS[vec.major].map(([key, name, vals, hot]) => el('div', { class: 'metric' + (hot.includes(vec.vals[key]) ? ' hot' : '') }, [
        el('dt', { text: name }), el('dd', { text: vals[vec.vals[key]] || '—' }),
      ]))) : null,
      c.vector ? el('p', { class: 'vector', text: c.vector }) : null,
    ];
  }
  return el('section', { class: 'panel', 'aria-labelledby': 'h-cvss' }, [
    panelHead('CVS-03', 'CVSS', c.cvss == null ? 'SIN PUNTUAR' : `v${c.cvss_version || '?'}`, 'h-cvss'),
    el('div', { class: 'panel__body' }, body),
  ]);
}

function epssPanel(c) {
  const p = c.epss_percentile;
  return el('section', { class: 'panel', 'aria-labelledby': 'h-epss' }, [
    panelHead('EPS-04', 'EPSS · probabilidad de explotación', '30 DÍAS', 'h-epss'),
    el('div', { class: 'panel__body' }, c.epss == null && p == null ? [el('p', { class: 'muted-line', text: 'Sin EPSS todavía: FIRST lo calcula una vez al día.' })] : [
      el('dl', { class: 'bignums' }, [
        el('div', { class: 'bignum' }, [el('dt', { text: 'PROBABILIDAD' }), el('dd', { text: fmtEpss(c.epss) })]),
        el('div', { class: 'bignum' }, [el('dt', { text: 'PERCENTIL' }), el('dd', { text: fmtPctl(p) })]),
      ]),
      p != null ? el('div', { class: 'pctl', 'aria-hidden': 'true', style: { '--p': (p * 100).toFixed(1) } }, [el('span', { class: 'pctl__fill' }), el('span', { class: 'pctl__mark' })]) : null,
      p != null ? el('div', { class: 'pctl__scale', 'aria-hidden': 'true' }, ['P0', 'P50', 'P90', 'P100'].map((t) => el('span', { text: t }))) : null,
    ]),
  ]);
}

function kevPanel(c) {
  if (!c.kev) {
    return el('section', { class: 'panel', 'aria-labelledby': 'h-kev' }, [
      panelHead('KEV-05', 'Catálogo KEV', 'CISA', 'h-kev'),
      el('div', { class: 'panel__body' }, el('p', { class: 'kev-none' }, [el('i', { 'aria-hidden': 'true' }), 'No figura en el catálogo de explotación activa.'])),
    ]);
  }
  const d = daysFromToday(c.kev.due_date);
  return el('section', { class: 'panel kev-box', 'aria-labelledby': 'h-kev' }, [
    panelHead('KEV-05', 'Explotada · catálogo KEV', 'CISA', 'h-kev'),
    el('div', { class: 'panel__body' }, el('dl', { class: 'kev-grid' }, [
      el('div', [el('dt', { text: 'AÑADIDA' }), el('dd', { text: dShort(c.kev.date_added) })]),
      el('div', [el('dt', { text: 'FECHA LÍMITE' }), el('dd', { class: 'due', text: dShort(c.kev.due_date) })]),
      el('div', [el('dt', { text: 'RANSOMWARE' }), el('dd', { class: 'kev-txt' + (c.kev.ransomware ? ' hot' : ''), text: c.kev.ransomware ? 'CONOCIDO' : 'NO CONSTA' })]),
      el('div', [el('dt', { text: d != null && d < 0 ? 'VENCIDA HACE' : 'QUEDAN' }), el('dd', d == null ? '—' : [nf(Math.abs(d)), el('span', { class: 'kev-unit', text: Math.abs(d) === 1 ? ' DÍA' : ' DÍAS' })])]),
      c.kev.action ? el('div', { class: 'full' }, [el('dt', { text: 'ACCIÓN REQUERIDA' }), el('dd', { lang: 'en', text: c.kev.action })]) : null,
    ])),
  ]);
}

function linkItem(url, title, meta, extra, ugc) {
  return extLink(url, { class: 'lk' }, [
    el('span', { class: 'lk__t', text: title }),
    meta ? el('span', { class: 'lk__m', text: meta }) : null,
    extra || null,
  ], { ugc });
}

function pocPanel(c) {
  const pocs = c.poc.slice().sort((a, b) => b.stars - a.stars);
  const refs = c.exploit_refs;
  const total = pocs.length + refs.length;
  const body = [];
  if (!total) body.push(el('p', { class: 'muted-line', text: 'Sin exploit público conocido.' }));
  else {
    // Aviso obligatorio junto a las PoC (ORDENES §3.7)
    body.push(el('p', { class: 'note note--poc', role: 'note' }, [el('b', { text: 'AVISO' }), POC_WARNING]));
    for (const p of pocs.slice(0, MAX_POC)) {
      body.push(linkItem(p.url, p.name || hostPath(p.url) || 'PoC sin nombre', hostPath(p.url) || 'ENLACE DESCARTADO (NO ES HTTP/HTTPS)',
        el('span', { class: 'lk__s' }, [icon('star'), ` ${nf(p.stars)}`]), true));
      if (p.description) body.push(el('p', { class: 'lk__d', text: p.description }));
    }
    if (pocs.length > MAX_POC) body.push(el('p', { class: 'label', text: `Y ${pocs.length - MAX_POC} MÁS EN GITHUB` }));
    if (refs.length) {
      body.push(el('p', { class: 'label lk-sub', text: 'REFERENCIAS DE EXPLOIT EN NVD' }));
      for (const r of refs.slice(0, MAX_POC)) body.push(linkItem(r.url, hostPath(r.url) || 'Referencia descartada', r.tags.join(' · '), null, true));
    }
  }
  return el('section', { class: 'panel', 'aria-labelledby': 'h-poc' }, [
    panelHead('POC-06', 'Exploits públicos', String(total), 'h-poc'),
    el('div', { class: 'panel__body panel__body--list' }, body),
  ]);
}

function newsPanel(c) {
  return el('section', { class: 'panel', 'aria-labelledby': 'h-nw' }, [
    panelHead('NWS-07', 'Noticias y avisos', String(c.news.length), 'h-nw'),
    el('div', { class: 'panel__body panel__body--list' }, c.news.length
      ? c.news.map((n) => {
        const a = linkItem(n.url, n.title || 'Sin título', (n.source || '').toUpperCase());
        const t = a.querySelector('.lk__t'); const lang = langOf(n.lang);
        if (t && lang) t.setAttribute('lang', lang);
        return a;
      })
      : [el('p', { class: 'muted-line', text: 'Sin cobertura en prensa ni avisos todavía.' })]),
  ]);
}

function cwePanel(c) {
  return el('section', { class: 'panel', 'aria-labelledby': 'h-cwe' }, [
    panelHead('CWE-08', 'Debilidad · CWE', '', 'h-cwe'),
    el('div', { class: 'panel__body panel__body--list' }, c.cwe.length ? c.cwe.map((w) => {
      const num = /^CWE-(\d{1,5})$/.exec(w);
      const name = CWE_NAMES[w] || (num ? 'Ver la definición en MITRE' : 'Sin descripción local');
      return num
        ? extLink(`https://cwe.mitre.org/data/definitions/${num[1]}.html`, { class: 'cwe' }, [el('b', { text: w }), el('span', { text: name })])
        : el('div', { class: 'cwe' }, [el('b', { text: w }), el('span', { text: name })]);
    }) : [el('p', { class: 'muted-line', text: 'NVD no ha asignado CWE todavía.' })]),
  ]);
}

function linksPanel(c) {
  const id = encodeURIComponent(c.id);
  const fixed = [
    [c.links.nvd, 'NVD · NIST', 'nvd.nist.gov ↗'],
    [c.links.mitre, 'CVE · CVE.ORG', 'cve.org ↗'],
    [`https://api.first.org/data/v1/epss?cve=${id}`, 'EPSS · FIRST', 'first.org ↗'],
    c.kev ? [`https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=${id}`, 'KEV · CISA', 'cisa.gov ↗'] : null,
  ].filter(Boolean);
  const rank = (r) => { const i = REF_PRIORITY.findIndex((t) => r.tags.includes(t)); return i < 0 ? 99 : i; };
  const refs = c.references.filter((r) => !c.exploit_refs.some((e) => e.url === r.url)).sort((a, b) => rank(a) - rank(b)).slice(0, MAX_REFS);
  return el('section', { class: 'panel', 'aria-labelledby': 'h-lnk' }, [
    panelHead('LNK-09', 'Fuentes y referencias', '', 'h-lnk'),
    el('div', { class: 'panel__body panel__body--list' }, [
      ...fixed.map(([u, t, s]) => extLink(u, { class: 'extl' }, [t, el('span', { text: s })])),
      refs.length ? el('p', { class: 'label lk-sub', text: `REFERENCIAS DE NVD · ${refs.length}${c.references_total > refs.length ? ` DE ${c.references_total}` : ''}` }) : null,
      ...refs.map((r) => linkItem(r.url, hostPath(r.url) || 'Referencia descartada', r.tags.join(' · ') || 'SIN ETIQUETA')),
    ]),
  ]);
}

/* ───────── vista ───────── */

function notFound(root, ctx, id) {
  const ed = ctx.state.edition;
  root.appendChild(el('p', { class: 'eyebrow' }, [el('b', { text: 'SEC-03 / FICHA' })]));
  root.appendChild(el('h1', { class: 'sr-only', id: 'h-det', text: id ? `${id}: no está en esta edición` : 'Ficha no encontrada' }));
  root.appendChild(el('div', { class: 'panel panel--gap' }, [
    emptyBlock(id ? `${id} no está en esta edición` : 'Identificador no válido',
      id ? `No figura entre las ${nf(ed.data.cves.length)} CVE de la edición del ${dShort(ed.date)}. Puedes consultarla directamente en NVD.`
        : 'El enlace no tiene el formato CVE-AAAA-NNNN. Vuelve al listado para elegir una CVE.'),
    el('div', { class: 'panel__body nf-actions' }, [
      el('a', { class: 'btn btn--ghost', href: '#listado', text: 'Ir al listado' }),
      id ? extLink(`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(id)}`, { class: 'link mono' }, 'Abrir en NVD ↗') : null,
    ]),
  ]));
}

/** id: ya validado por el router (o null si no cumplía el formato; undefined en "#cve"). */
export function renderDetalle(root, ctx, id) {
  const ed = ctx.state.edition;
  const list = byScore(ed.data.cves);
  clear(root);
  const banner = editionBanner(ed, ctx.backToToday);

  if (!list.length) {
    root.appendChild(el('p', { class: 'eyebrow' }, [el('b', { text: 'SEC-03 / FICHA' })]));
    root.appendChild(el('h1', { class: 'sr-only', id: 'h-det', text: 'Sin fichas' }));
    if (banner) root.appendChild(banner);
    root.appendChild(el('div', { class: 'panel panel--gap' }, emptyBlock('No hay fichas que mostrar', 'Las fichas aparecen cuando NVD publica las primeras CVE del día.')));
    return;
  }
  if (id === null) { notFound(root, ctx, null); return; }
  const c = id === undefined ? list[0] : list.find((x) => x.id === id);
  if (!c) { if (banner) root.appendChild(banner); notFound(root, ctx, id); return; }

  const i = list.indexOf(c), prev = list[i - 1], next = list[i + 1];
  const navBtn = (cv, label, rel) => (cv
    ? el('a', { class: 'btn btn--ghost', href: cveHref(cv.id), rel, text: label })
    : el('span', { class: 'btn btn--ghost', 'aria-disabled': 'true', text: label }));
  const dash = c.id.lastIndexOf('-');

  root.appendChild(el('nav', { class: 'crumbs', 'aria-label': 'Ruta' }, [
    el('span', { class: 'eyebrow' }, [
      el('b', { text: 'SEC-03 / FICHA' }), el('a', { href: '#listado', text: 'LISTADO' }), el('span', { 'aria-hidden': 'true', text: '/' }),
      el('span', { class: 'crumbs__cur', 'aria-current': 'page', text: c.id }), el('span', { text: `Nº ${pad(i + 1)} DE ${list.length} POR SCORE` }),
    ]),
    el('span', { class: 'crumbs__nav' }, [navBtn(prev, '← ANTERIOR', 'prev'), navBtn(next, 'SIGUIENTE →', 'next')]),
  ]));
  if (banner) root.appendChild(banner);
  root.appendChild(el('header', { class: 'det-head' }, [
    el('h1', { class: 'det-id', id: 'h-det' }, [el('span', { text: c.id.slice(0, dash + 1) }), c.id.slice(dash + 1)]),
    el('div', { class: 'det-sub' }, [
      (() => {
        const w = who(c);
        if (w.viaCna) return el('h2', [`CNA · ${w.main}`, el('span', { text: ' · fabricante pendiente en NVD' })]);
        return el('h2', [w.main || '—', w.sub ? el('span', { text: ` · ${w.sub}` }) : null]);
      })(),
      sevTag(c.severity), chips(c.tags, true),
    ]),
  ]));
  root.appendChild(el('div', { class: 'det-grid' }, [
    el('div', { class: 'det-col' }, [scorePanel(c, ed.data.scoring_weights)]),
    el('div', { class: 'det-col' }, [descPanel(c), cvssPanel(c), epssPanel(c)]),
    el('div', { class: 'det-col det-col--r' }, [kevPanel(c), pocPanel(c), newsPanel(c), cwePanel(c), linksPanel(c)]),
  ]));

  // La pestaña DETALLE de la navegación apunta a la última ficha vista
  const navA = document.querySelector('.nav__a[data-view="detalle"]');
  if (navA) navA.setAttribute('href', cveHref(c.id));
}
