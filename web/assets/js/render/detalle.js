/* =============================================================================
   render/detalle.js · FICHA DE UNA CVE
   v2 (cambios-v2 §9): decisión → contexto → evidencias. Primero «Qué hacer» (dial,
   veredicto y acciones construidas solo con campos existentes), después métricas,
   descripción y vector; a la derecha KEV, desglose, exploits, noticias, CWE y fuentes.
   - Desglose desde score_breakdown + scoring_weights: una fila por cada peso que
     traiga el JSON (hoy 6, ransomware incluido); nada fijo en el código.
   - PoC: texto 100 % hostil, aviso de "sin verificar" y rel="… nofollow ugc".
   - CVSS 3.x y 4.0: las métricas se leen del vector y se traducen con tablas fijas.
   ============================================================================= */
import { el, svg, clear } from '../util/dom.js';

import {
  chips, sevTag, panelHead, emptyBlock, cveHref, isProv, icon, extLink, hostPath, langOf, editionBanner, who, byUrgency,
  verdictOf, vtag,
} from './comunes.js';
import {
  nf, pad, fmtCvss, fmtPctl, fmtEpss, dShort, dDayMon, verdict, daysFromToday,
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

/* ───────── decisión: dial, veredicto y qué hacer ───────── */

/** Dial de 132 px: arco de 270°, trazo de 9, en el color del veredicto. Sin animación. */
function dial(c) {
  const v = verdictOf(c.score), R = 52, L = 2 * Math.PI * R, frac = Math.max(0, Math.min(100, c.score)) / 100 * 0.75;
  const arc = (cls, len) => svg('circle', { class: cls, cx: 66, cy: 66, r: R, fill: 'none', 'stroke-width': 9, 'stroke-dasharray': `${len.toFixed(1)} ${L.toFixed(1)}`, transform: 'rotate(135 66 66)' });
  return svg('svg', {
    class: `dial v-${v.key}`, viewBox: '0 0 132 132', role: 'img',
    'aria-label': `Score ZEROHOUR ${c.score} de 100${isProv(c) ? ', provisional' : ''}: ${v.label.toLowerCase()}`,
  }, [
    arc('dial__trk', L * 0.75), arc('dial__val', L * frac),
    svg('text', { class: 'dial__n', x: 66, y: 74, 'text-anchor': 'middle', text: `${c.score}${isProv(c) ? '*' : ''}` }),
    svg('text', { class: 'dial__l', x: 66, y: 92, 'text-anchor': 'middle', text: 'SCORE / 100' }),
  ]);
}

/**
 * Acciones, de lo más urgente a lo menos, construidas SOLO con campos existentes (kev, tags,
 * score). kev.ransomware es booleano (true/false) en nuestros datos.
 */
function todoList(c) {
  const has = (t) => c.tags.includes(t), out = [];
  const li = (cls, ic, kids) => el('li', { class: cls || null }, [icon(ic), el('span', kids)]);
  if (c.kev) {
    const dl = kevDeadline(c.kev);
    out.push(li('crit', 'kev', [el('b', { text: 'Explotada activamente (KEV). ' }),
      `CISA da de plazo hasta el ${dDayMon(c.kev.due_date).toLowerCase()}`, dl ? [': ', el('b', { text: dl })] : null, '.']));
    if (c.kev.ransomware === true) out.push(li('crit', 'ransomware', [el('b', { text: 'Usada en campañas de ransomware. ' }), 'Trátala como posible incidente si está expuesta.']));
    if (c.kev.action) out.push(li('', 'alert', [el('b', { text: 'Acción requerida por CISA: ' }), el('span', { lang: 'en', text: c.kev.action })]));
  } else if (has('ssvc')) {
    out.push(li('crit', 'ssvc', [el('b', { text: 'Explotación activa según SSVC (CISA Vulnrichment). ' }), 'Aún no está en el catálogo KEV.']));
  }
  if (has('exploit')) out.push(li('warn', 'exploit', [el('b', { text: 'Exploit verificado disponible. ' }), 'La ventana hasta la explotación masiva suele ser corta.']));
  else if (has('poc')) out.push(li('warn', 'poc', [el('b', { text: 'Hay PoC pública sin verificar. ' }), 'Puede ser falsa o maliciosa: no la ejecutes fuera de un laboratorio.']));
  if (has('deteccion')) out.push(li('', 'deteccion', [el('b', { text: 'Existe plantilla de detección ' }), '(Nuclei): puedes comprobar tu exposición.']));
  if (has('stack')) out.push(li('ok', 'stack', [el('b', { text: 'Afecta a tu stack. ' }), 'Revisa versiones en el inventario.']));
  if (has('library')) out.push(li('', 'library', [el('b', { text: 'Es una dependencia: ' }), 'búscala en los lockfiles de tus proyectos, no en el inventario de servidores.']));
  if (!out.length) out.push(li('', 'empty', [c.score >= 40 ? 'Sin explotación conocida. Planifica la actualización en la próxima ventana.' : 'Riesgo bajo hoy. Vigílala por si cambia el EPSS o aparece un exploit.']));
  return el('ul', { class: 'todo' }, out);
}

function decisionPanel(c, i, n) {
  const v = verdictOf(c.score);
  return el('section', { class: `panel decision v-${v.key}`, 'aria-labelledby': 'h-dec' }, [
    panelHead('', 'Qué hacer', isProv(c) ? 'SCORE PROVISIONAL' : `Nº ${i + 1} DE ${n} POR URGENCIA`, 'h-dec'),
    el('div', { class: 'panel__body decision__body' }, [
      dial(c),
      el('div', { class: 'decision__v' }, [
        vtag(v),
        el('span', { class: 'label', text: isProv(c) ? 'Sin CVSS de NVD: el score puede subir' : `CVSS ${fmtCvss(c.cvss)} · EPSS ${fmtPctl(c.epss_percentile)}` }),
      ]),
      todoList(c),
    ]),
  ]);
}

/** Métricas en una franja de 4 (2 × 2 en móvil). */
function metricsStrip(c) {
  return el('dl', { class: 'mstrip panel' }, [
    el('div', [el('dt', { text: 'CVSS' }), el('dd', [fmtCvss(c.cvss), el('small', { text: c.cvss == null ? 'pendiente' : '/ 10' })])]),
    el('div', [el('dt', { text: 'Severidad' }), el('dd', { class: 'mstrip__sev' }, sevTag(c.severity))]),
    el('div', [el('dt', { text: 'EPSS' }), el('dd', { text: fmtEpss(c.epss) })]),
    el('div', [el('dt', { text: 'Percentil' }), el('dd', { text: fmtPctl(c.epss_percentile) })]),
  ]);
}

/** Desglose genérico: una barra por cada clave de scoring_weights, sin valores fijos en el código. */
function breakdownPanel(c, weights) {
  const keys = Object.keys(weights).filter((k) => Number(weights[k]) > 0);
  const rows = keys.map((k) => {
    const max = Number(weights[k]);
    const v = Math.max(0, Math.min(max, Number(c.score_breakdown[k]) || 0));
    return el('div', { class: 'bd' + (v > 0 ? ' bd--on' : '') }, [
      el('dt', { class: 'bd__k', text: BD_LABEL[k] || k.toUpperCase() }),
      el('dd', { class: 'bd__t', 'aria-hidden': 'true' }, el('i', { style: { '--w': Math.round(v / max * 100) } })),
      el('dd', { class: 'bd__v' }, [nf(v, v % 1 ? 1 : 0), el('small', { text: `/${nf(max)}` })]),
    ]);
  });
  return el('section', { class: 'panel', 'aria-labelledby': 'h-score' }, [
    panelHead('', 'Desglose del score', `${c.score} / 100${isProv(c) ? ' · PROVISIONAL' : ''}`, 'h-score'),
    el('div', { class: 'panel__body' }, [
      el('dl', { class: 'breakdown' }, rows),
      floorNote(c, keys),
      c.breakdown_source === 'derivado' ? el('p', { class: 'label bd-foot', text: 'DESGLOSE RECALCULADO CON LOS PESOS DE ESTA EDICIÓN' }) : null,
    ]),
  ]);
}

/** Si el pipeline aplicó un mínimo, se dice con todas las letras y con la suma real de las filas. */
function floorNote(c, keys) {
  const f = c.score_floor;
  if (!f) return null;
  const sum = Math.round(keys.reduce((a, k) => a + (Number(c.score_breakdown[k]) || 0), 0));
  const why = f.exploited_by === 'kev' ? 'está en el catálogo KEV de CISA' : 'CISA la marca como explotada (SSVC «active»)';
  const weaponized = c.exploits.some((e) => e.verified && e.source !== 'nuclei');
  const AGG = { stack: 'afecta a tu stack', ransomware: 'se usa en campañas de ransomware',
    exploit: weaponized ? 'tiene un exploit verificado' : 'tiene una plantilla de detección de Nuclei' };
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
    panelHead('', 'Descripción', 'NVD · EN', 'h-desc'),
    el('div', { class: 'panel__body' }, [
      c.description ? el('p', { class: 'desc-en', lang: 'en', text: c.description }) : el('p', { class: 'muted-line', text: 'NVD aún no ha publicado la descripción.' }),
    ]),
  ]);
}

// Si NVD aún no puntúa, el pipeline usa el CVSS del CNA o el de CISA (Vulnrichment), y se dice
const CVSS_SRC = {
  cna: { short: 'CNA', title: 'CVSS DEL CNA · PENDIENTE DE NVD', text: 'NVD aún no la ha puntuado; se usa el CVSS que publicó quien asignó la CVE (CNA). Puede cambiar cuando NVD la analice.' },
  adp: { short: 'CISA', title: 'CVSS DE CISA · PENDIENTE DE NVD', text: 'NVD aún no la ha puntuado; se usa el CVSS que añadió CISA (Vulnrichment). Puede cambiar cuando NVD la analice.' },
};

function cvssPanel(c) {
  let body;
  if (c.cvss == null) {
    body = [el('p', { class: 'note unscored-note' }, [
      el('b', { text: 'SIN PUNTUAR · PENDIENTE DE NVD' }),
      'NVD aún no ha analizado esta CVE (es lo normal el primer día). Mientras tanto el CVSS cuenta con un valor neutro del 40 %, así que el score puede cambiar cuando llegue.',
    ])];
  } else {
    const vec = parseVector(c.vector);
    body = [
      vec ? el('dl', { class: 'metrics' }, METRICS[vec.major].map(([key, name, vals, hot]) => el('div', { class: 'metric' + (hot.includes(vec.vals[key]) ? ' hot' : '') }, [
        el('dt', { text: name }), el('dd', { text: vals[vec.vals[key]] || '—' }),
      ]))) : null,
      c.vector ? el('p', { class: 'vector', text: c.vector }) : el('p', { class: 'muted-line', text: 'Sin vector CVSS publicado.' }),
    ];
  }
  return el('section', { class: 'panel', 'aria-labelledby': 'h-cvss' }, [
    panelHead('', 'Vector CVSS', c.cvss == null ? 'SIN PUNTUAR' : `v${c.cvss_version || '?'}${CVSS_SRC[c.cvss_source] ? ' · ' + CVSS_SRC[c.cvss_source].short : ''}`, 'h-cvss'),
    el('div', { class: 'panel__body' }, [
      CVSS_SRC[c.cvss_source] ? el('p', { class: 'note unscored-note' }, [el('b', { text: CVSS_SRC[c.cvss_source].title }), CVSS_SRC[c.cvss_source].text]) : null,
      ...body,
    ]),
  ]);
}

function kevPanel(c) {
  if (!c.kev) {
    return el('section', { class: 'panel', 'aria-labelledby': 'h-kev' }, [
      panelHead('', 'Catálogo KEV', 'CISA', 'h-kev'),
      el('div', { class: 'panel__body' }, el('p', { class: 'kev-none' }, [el('i', { 'aria-hidden': 'true' }), 'No figura en el catálogo de explotación activa.'])),
    ]);
  }
  const d = daysFromToday(c.kev.due_date);
  return el('section', { class: 'panel kev-box', 'aria-labelledby': 'h-kev' }, [
    panelHead('', 'Explotada · catálogo KEV', 'CISA', 'h-kev'),
    el('div', { class: 'panel__body' }, el('dl', { class: 'kev-grid' }, [
      el('div', [el('dt', { text: 'AÑADIDA' }), el('dd', { text: dDayMon(c.kev.date_added) })]),
      el('div', [el('dt', { text: 'FECHA LÍMITE' }), el('dd', { class: 'due', text: dDayMon(c.kev.due_date) })]),
      el('div', [el('dt', { text: 'RANSOMWARE' }), el('dd', { class: 'kev-txt' + (c.kev.ransomware ? ' hot' : ''), text: c.kev.ransomware ? 'CONOCIDO' : 'NO CONSTA' })]),
      el('div', [el('dt', { text: d != null && d < 0 ? 'VENCIDA HACE' : 'QUEDAN' }), el('dd', d == null ? '—' : [nf(Math.abs(d)), el('span', { class: 'kev-unit', text: Math.abs(d) === 1 ? ' DÍA' : ' DÍAS' })])]),
    ])),
  ]);
}

const SSVC_TXT = {
  exploitation: { none: 'Sin explotación conocida', poc: 'PoC pública', active: 'Explotación activa' },
  automatable: { yes: 'Sí', no: 'No' },
  technical_impact: { partial: 'Parcial', total: 'Total' },
};

/** SSVC de CISA (Vulnrichment): la valoración de CISA sobre explotación, automatización e impacto. */
function ssvcPanel(c) {
  if (!c.ssvc) return null;
  const row = (k, name) => el('div', { class: 'metric' + (['active', 'yes', 'total'].includes(c.ssvc[k]) ? ' hot' : '') }, [
    el('dt', { text: name }), el('dd', { text: SSVC_TXT[k][c.ssvc[k]] || '—' })]);
  return el('section', { class: 'panel', 'aria-labelledby': 'h-ssvc' }, [
    panelHead('', 'SSVC · valoración de CISA', 'VULNRICHMENT', 'h-ssvc'),
    el('div', { class: 'panel__body' }, [
      el('dl', { class: 'metrics metrics--3' }, [row('exploitation', 'EXPLOTACIÓN'), row('automatable', 'AUTOMATIZABLE'), row('technical_impact', 'IMPACTO TÉCNICO')]),
      c.ssvc.exploitation === 'active' && !c.kev ? el('p', { class: 'label lk-sub', text: 'CISA LA DA POR EXPLOTADA AUNQUE AÚN NO ESTÁ EN KEV' }) : null,
    ]),
  ]);
}

function linkItem(url, title, meta, extra, ugc) {
  return extLink(url, { class: 'lk' }, [
    el('span', { class: 'lk__t', text: title }),
    meta ? el('span', { class: 'lk__m', text: meta }) : null,
    extra || null,
  ], { ugc });
}

const SRC_NAME = { metasploit: 'METASPLOIT', exploitdb: 'EXPLOIT-DB', nuclei: 'NUCLEI' };

/**
 * Código de ataque, de más a menos certeza: exploits verificados (Metasploit, Exploit-DB),
 * plantillas de detección (Nuclei: no son exploits) y PoC sin verificar (con el aviso de las
 * órdenes). Todo es código de terceros: textos como texto y enlaces con "nofollow ugc".
 */
function pocPanel(c) {
  const verified = c.exploits.filter((e) => e.verified && e.source !== 'nuclei');
  const templates = c.exploits.filter((e) => e.source === 'nuclei');
  const edbUnverified = c.exploits.filter((e) => !e.verified && e.source !== 'nuclei');
  const pocs = c.poc.slice().sort((a, b) => b.stars - a.stars);
  const refs = c.exploit_refs;
  const unverified = pocs.length + refs.length + edbUnverified.length;
  const total = verified.length + templates.length + unverified;
  const body = [];
  if (!total) body.push(el('p', { class: 'muted-line', text: 'Sin exploit público conocido.' }));
  if (verified.length) {
    body.push(el('p', { class: 'label lk-sub', text: `EXPLOITS VERIFICADOS · ${verified.length}` }));
    for (const e of verified) body.push(linkItem(e.url, e.name || hostPath(e.url), `${SRC_NAME[e.source]} · VERIFICADO`, null, true));
  }
  if (templates.length) {
    body.push(el('p', { class: 'label lk-sub', text: `PLANTILLAS DE DETECCIÓN · ${templates.length}` }));
    for (const e of templates) body.push(linkItem(e.url, e.name || hostPath(e.url), 'NUCLEI · PLANTILLA DE DETECCIÓN (NO ES UN EXPLOIT)', null, true));
  }
  if (unverified) {
    body.push(el('p', { class: 'label lk-sub', text: `SIN VERIFICAR · ${unverified}` }));
    // Aviso obligatorio junto a las PoC (ORDENES §3.7)
    body.push(el('p', { class: 'note note--poc', role: 'note' }, [el('b', { text: 'AVISO' }), POC_WARNING]));
    for (const e of edbUnverified) body.push(linkItem(e.url, e.name || hostPath(e.url), 'EXPLOIT-DB · SIN VERIFICAR', null, true));
    for (const p of pocs.slice(0, MAX_POC)) {
      body.push(linkItem(p.url, p.name || hostPath(p.url) || 'PoC sin nombre', hostPath(p.url) || 'ENLACE DESCARTADO (NO ES HTTP/HTTPS)',
        el('span', { class: 'lk__s' }, [icon('star'), ` ${nf(p.stars)}`]), true));
      if (p.description) body.push(el('p', { class: 'lk__d', text: p.description }));
    }
    if (pocs.length > MAX_POC) body.push(el('p', { class: 'label', text: `Y ${pocs.length - MAX_POC} MÁS EN GITHUB` }));
    for (const r of refs.slice(0, MAX_POC)) body.push(linkItem(r.url, hostPath(r.url) || 'Referencia descartada', `REFERENCIA DE NVD · ${r.tags.join(' · ')}`, null, true));
  }
  return el('section', { class: 'panel', 'aria-labelledby': 'h-poc' }, [
    panelHead('', 'Exploits y PoC', String(total), 'h-poc'),
    el('div', { class: 'panel__body panel__body--list' }, body),
  ]);
}

function newsPanel(c) {
  return el('section', { class: 'panel', 'aria-labelledby': 'h-nw' }, [
    panelHead('', 'Noticias y avisos', String(c.news.length), 'h-nw'),
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
    panelHead('', 'Debilidad · CWE', '', 'h-cwe'),
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
    [c.links.nvd, 'NVD · NIST', 'nvd.nist.gov'],
    [c.links.mitre, 'CVE · CVE.ORG', 'cve.org'],
    [`https://api.first.org/data/v1/epss?cve=${id}`, 'EPSS · FIRST', 'first.org'],
    c.kev ? [`https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=${id}`, 'KEV · CISA', 'cisa.gov'] : null,
    // EUVD: la base europea de ENISA resuelve la CVE por su ID (formato verificado el 2026-11-01)
    [`https://euvd.enisa.europa.eu/vulnerability/${id}`, 'EUVD · ENISA', 'euvd.enisa.europa.eu'],
  ].filter(Boolean);
  const rank = (r) => { const i = REF_PRIORITY.findIndex((t) => r.tags.includes(t)); return i < 0 ? 99 : i; };
  const refs = c.references.filter((r) => !c.exploit_refs.some((e) => e.url === r.url)).sort((a, b) => rank(a) - rank(b)).slice(0, MAX_REFS);
  return el('section', { class: 'panel', 'aria-labelledby': 'h-lnk' }, [
    panelHead('', 'Fuentes y referencias', '', 'h-lnk'),
    el('div', { class: 'panel__body panel__body--list' }, [
      ...fixed.map(([u, t, s]) => extLink(u, { class: 'extl' }, [t, el('span', [s, ' ', icon('arrow', 'ico--out')])])),
      refs.length ? el('p', { class: 'label lk-sub', text: `REFERENCIAS DE NVD · ${refs.length}${c.references_total > refs.length ? ` DE ${c.references_total}` : ''}` }) : null,
      ...refs.map((r) => linkItem(r.url, hostPath(r.url) || 'Referencia descartada', r.tags.join(' · ') || 'SIN ETIQUETA')),
    ]),
  ]);
}

/* ───────── vista ───────── */

function notFound(root, ctx, id) {
  const ed = ctx.state.edition;
  root.appendChild(el('h1', { class: 'sr-only', id: 'h-det', text: id ? `${id}: no está en esta edición` : 'Ficha no encontrada' }));
  root.appendChild(el('div', { class: 'panel panel--gap' }, [
    emptyBlock(id ? `${id} no está en esta edición` : 'Identificador no válido',
      id ? `No figura entre las ${nf(ed.data.cves.length)} CVE de la edición del ${dShort(ed.date)}. Puedes consultarla directamente en NVD.`
        : 'El enlace no tiene el formato CVE-AAAA-NNNN. Vuelve al listado para elegir una CVE.'),
    el('div', { class: 'panel__body nf-actions' }, [
      el('a', { class: 'btn btn--ghost', href: '#listado', text: 'Ir al listado' }),
      id ? extLink(`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(id)}`, { class: 'link mono' }, ['Abrir en NVD ', icon('arrow')]) : null,
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
    ? el('a', { class: 'btn btn--sm', href: cveHref(cv.id), rel }, label)
    : el('span', { class: 'btn btn--sm', 'aria-disabled': 'true' }, label));
  const dash = c.id.lastIndexOf('-');

  root.appendChild(el('nav', { class: 'crumbs', 'aria-label': 'Ruta' }, [
    el('span', { class: 'crumbs__path' }, [
      el('a', { href: '#listado', text: 'LISTADO' }), el('span', { 'aria-hidden': 'true', text: '/' }),
      el('span', { class: 'crumbs__cur', 'aria-current': 'page', text: c.id }), el('span', { text: `Nº ${pad(i + 1)} DE ${list.length} POR URGENCIA` }),
    ]),
    el('span', { class: 'crumbs__nav' }, [navBtn(prev, [icon('arrow', 'ico--back'), ' Anterior'], 'prev'), navBtn(next, ['Siguiente ', icon('arrow')], 'next')]),
  ]));
  if (banner) root.appendChild(banner);
  root.appendChild(el('header', { class: 'det-head' }, [
    el('h1', { class: 'det-id', id: 'h-det' }, [el('span', { text: c.id.slice(0, dash + 1) }), c.id.slice(dash + 1)]),
    el('div', { class: 'det-sub' }, [
      (() => {
        const w = who(c);
        if (w.pending) return el('h2', [w.sub ? `${w.sub} · ` : null, el('span', { class: 'pend', text: w.pendingText })]);
        return el('h2', [w.main, w.sub ? el('span', { text: ` · ${w.sub}` }) : null]);
      })(),
    ]),
    chips(c.tags, true),
  ]));
  root.appendChild(el('div', { class: 'det-grid' }, [
    el('div', { class: 'det-col' }, [decisionPanel(c, i, list.length), metricsStrip(c), descPanel(c), cvssPanel(c), ssvcPanel(c)]),
    el('div', { class: 'det-col' }, [kevPanel(c), breakdownPanel(c, ed.data.scoring_weights), pocPanel(c), newsPanel(c), cwePanel(c), linksPanel(c)]),
  ]));

  // La pestaña DETALLE de la navegación apunta a la última ficha vista
  const navA = document.querySelector('.nav__a[data-view="detalle"]');
  if (navA) navA.setAttribute('href', cveHref(c.id));
}
