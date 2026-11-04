/* =============================================================================
   data.js · capa de datos
   Carga y normaliza los JSON del pipeline (radar.py):
     data/latest.json · data/map.json · data/index.json · data/days/AAAA-MM-DD.json
   En desarrollo puede cargar un "bundle" {latest, map, index} de un solo fichero
   (fixtures), que sirve dev_server fuera de producción.
   Toda la validación es defensiva: los datos vienen de fuentes externas.
   ============================================================================= */

export const SEV_KEYS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNSCORED'];

/** Clave de severidad para pintar: null→UNSCORED, "NONE" (CVSS 0.0)→LOW, bandas conocidas tal cual. */
export function sevKey(severity) {
  if (severity == null) return 'UNSCORED';
  const s = String(severity).toUpperCase();
  if (s === 'NONE') return 'LOW';                 // NVD da "NONE" para CVSS 0.0; el diseño no tiene esa banda
  return SEV_KEYS.includes(s) ? s : 'UNSCORED';
}
export const SOURCE_KEYS = ['nvd', 'kev', 'epss', 'ghsa', 'poc', 'rss'];
// Fuentes de la fase 6: se muestran cuando la edición las trae (las ediciones antiguas no las tienen)
export const EXTRA_SOURCE_KEYS = ['cvelist', 'metasploit', 'nuclei', 'exploitdb'];
const SSVC_OK = { exploitation: ['none', 'poc', 'active'], automatable: ['yes', 'no'], technical_impact: ['partial', 'total'] };
const EXPLOIT_SOURCES = ['metasploit', 'nuclei', 'exploitdb'];
export const ID_RE = /^CVE-\d{4}-\d{4,7}$/;
// Pesos por defecto (config.toml [puntuacion]); se usan si latest.json no trae scoring_weights todavía
export const DEFAULT_WEIGHTS = Object.freeze({ cvss: 35, epss: 20, kev: 25, ransomware: 5, poc: 10, stack: 5 });

const DATA_BASE = 'data/';
const MAP_REFRESH_MS = 10 * 60 * 1000;

export class DataError extends Error {
  constructor(message, url) { super(message); this.name = 'DataError'; this.url = url; }
}

async function getJson(url) {
  let r;
  try { r = await fetch(url, { cache: 'no-cache' }); }
  catch (e) { throw new DataError('Sin respuesta de red', url); }
  if (!r.ok) throw new DataError(`HTTP ${r.status}`, url);
  try { return await r.json(); }
  catch (e) { throw new DataError('JSON inválido', url); }
}

/* ───────────────────── normalización ───────────────────── */

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v == null ? '' : String(v));

function normalizeKev(k) {
  if (!k || typeof k !== 'object') return null;
  return {
    date_added: k.date_added ?? null,
    due_date: k.due_date ?? null,
    action: str(k.action),
    ransomware: k.ransomware === true,   // el pipeline lo da como booleano
    vendor: str(k.vendor),
    product: str(k.product),
  };
}

function deriveBreakdown(c, w) {
  const hasPoc = arr(c.poc).length > 0 || arr(c.exploit_refs).length > 0 || arr(c.tags).includes('poc');
  const inStack = arr(c.stack).length > 0 || arr(c.tags).includes('stack');
  return {
    cvss: (c.cvss != null ? c.cvss / 10 : 0.4) * w.cvss,  // sin CVSS → 40 % neutro (no 0)
    epss: (num(c.epss_percentile) || 0) * w.epss,
    kev: c.kev ? w.kev : 0,
    ransomware: (c.kev && c.kev.ransomware) ? w.ransomware : 0,
    poc: hasPoc ? w.poc : 0,
    stack: inStack ? w.stack : 0,
  };
}

function normalizeCve(c, w) {
  const kev = normalizeKev(c.kev);
  const out = {
    id: str(c.id),
    vendor: str(c.vendor),
    product: str(c.product),
    // De dónde sale el fabricante: nvd | kev | patron (deducido de la descripción) | cna | null
    vendor_source: ['nvd', 'kev', 'patron', 'cna'].includes(c.vendor_source) ? c.vendor_source : null,
    cna: str(c.cna),
    description: str(c.description),
    cvss: num(c.cvss),
    severity: c.severity ? String(c.severity).toUpperCase() : null,
    cvss_version: c.cvss_version ? str(c.cvss_version) : null,
    vector: c.vector ? str(c.vector) : null,
    attack_vector: c.attack_vector ? str(c.attack_vector) : null,
    epss: num(c.epss),
    epss_percentile: num(c.epss_percentile),
    kev,
    poc: arr(c.poc).map((p) => ({ url: str(p.url), name: str(p.name), stars: num(p.stars) || 0, description: str(p.description) })),
    // Exploits indexados (fase 6): Metasploit, plantillas de Nuclei y Exploit-DB
    exploits: arr(c.exploits).filter((e) => e && EXPLOIT_SOURCES.includes(e.source))
      .map((e) => ({ source: e.source, url: str(e.url), name: str(e.name), verified: e.verified === true })),
    ssvc: normalizeSsvc(c.ssvc),
    cvss_source: ['nvd', 'cna', 'adp'].includes(c.cvss_source) ? c.cvss_source : null,
    news: arr(c.news).map((n) => ({ title: str(n.title), url: str(n.url), source: str(n.source), type: str(n.type), lang: str(n.lang), date: n.date ?? null })),
    ghsa: arr(c.ghsa),
    cwe: arr(c.cwe).map(str),
    references: arr(c.references).map(normalizeRef).filter((r) => r.url),
    references_total: num(c.references_total) ?? arr(c.references).length,
    exploit_refs: arr(c.exploit_refs).map(normalizeRef).filter((r) => r.url),
    tags: arr(c.tags).map(str),
    stack: arr(c.stack).map(str),
    score: num(c.score) ?? 0,
    links: {
      nvd: (c.links && c.links.nvd) || `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(str(c.id))}`,
      mitre: (c.links && c.links.mitre) || `https://www.cve.org/CVERecord?id=${encodeURIComponent(str(c.id))}`,
    },
    old_cve: c.old_cve === true,
  };
  normalizeVendor(out);
  // Si el JSON trae score_breakdown se usa tal cual; si no (ediciones antiguas), se deriva con
  // los pesos, replicando la fórmula de radar.py (comprobado: cuadra con el score en 453 de 453).
  const fromPipeline = !!(c.score_breakdown && typeof c.score_breakdown === 'object');
  if (fromPipeline) {
    // Filas numéricas por un lado; el mínimo aplicado (si lo hay) por otro, validado
    const rows = {};
    for (const [k, v] of Object.entries(c.score_breakdown)) if (k !== 'floor' && num(v) != null) rows[k] = v;
    out.score_breakdown = rows;
    out.score_floor = normalizeFloor(c.score_breakdown.floor);
  } else {
    out.score_breakdown = deriveBreakdown(out, w);
    out.score_floor = null;
  }
  out.breakdown_source = fromPipeline ? 'pipeline' : 'derivado';
  out.rows_sum = Object.values(out.score_breakdown).reduce((a, v) => a + (Number(v) || 0), 0);   // sin el mínimo
  return out;
}

/* Contrato: vendor vacío cuando NVD aún no da fabricante, y la CNA en su propio campo. Ediciones
   antiguas del histórico podían traer la CNA dentro de vendor («CNA · x» o vendor_source "cna"):
   se reparte igual, para que la web nunca la presente como fabricante. */
const CNA_PREFIX = /^CNA\s*[·:-]\s*/i;
function normalizeVendor(c) {
  if (CNA_PREFIX.test(c.vendor)) {
    c.cna = c.cna || c.vendor.replace(CNA_PREFIX, '').trim();
    c.vendor = '';
  } else if (c.vendor_source === 'cna' && c.vendor) {
    c.cna = c.cna || c.vendor;
    c.vendor = '';
  }
}

/** SSVC de CISA (Vulnrichment): solo valores conocidos. */
function normalizeSsvc(s) {
  if (!s || typeof s !== 'object' || !SSVC_OK.exploitation.includes(s.exploitation)) return null;
  const pick = (k) => (SSVC_OK[k].includes(s[k]) ? s[k] : null);
  return { exploitation: s.exploitation, automatable: pick('automatable'), technical_impact: pick('technical_impact') };
}

/** Mínimo de puntuación aplicado por el pipeline: {value, exploited_by: kev|ssvc, aggravating: [stack|ransomware|exploit]}. */
function normalizeFloor(f) {
  if (!f || typeof f !== 'object') return null;
  const value = num(f.value);
  if (value == null || value < 0 || value > 100 || !['kev', 'ssvc'].includes(f.exploited_by)) return null;
  return { value, exploited_by: f.exploited_by, aggravating: arr(f.aggravating).filter((a) => ['stack', 'ransomware', 'exploit'].includes(a)) };
}

/** Referencia de NVD: {url, tags}. También acepta una URL suelta. */
function normalizeRef(r) {
  if (typeof r === 'string') return { url: r, tags: [] };
  return { url: str(r && r.url), tags: arr(r && r.tags).map(str) };
}

function normalizeStats(s) {
  s = s || {};
  const src = s.by_severity || {};
  const by = {};
  for (const k of SEV_KEYS) by[k] = num(src[k]) || 0;
  by.LOW += num(src.NONE) || 0;   // "NONE" (CVSS 0.0) se cuenta como LOW para que la suma cuadre con new_cves
  return {
    new_cves: num(s.new_cves) || 0,
    by_severity: by,
    kev_new: num(s.kev_new) || 0,
    with_poc: num(s.with_poc) || 0,
    with_exploit: num(s.with_exploit),        // null en ediciones anteriores a la fase 6
    with_detection: num(s.with_detection),
    in_stack: num(s.in_stack) || 0,
    remote: num(s.remote) || 0,
    ghsa: num(s.ghsa) || 0,
    news: num(s.news) || 0,
  };
}

export function normalizeLatest(raw) {
  raw = raw || {};
  // Si la edición trae sus pesos, se usan SOLOS (las filas del dial son exactamente esas);
  // DEFAULT_WEIGHTS solo vale para ediciones antiguas sin scoring_weights.
  const weights = {};
  if (raw.scoring_weights && typeof raw.scoring_weights === 'object') {
    for (const [k, v] of Object.entries(raw.scoring_weights)) if (num(v) != null && v > 0) weights[k] = v;
  }
  if (!Object.keys(weights).length) Object.assign(weights, DEFAULT_WEIGHTS);
  const cves = arr(raw.cves).map((c) => normalizeCve(c, weights));
  const byId = new Map(cves.map((c) => [c.id, c]));
  // top y kev_new: listas de IDs que apuntan a cves (esquema ligero de la fase 6); las ediciones
  // antiguas traen objetos completos, que también se aceptan
  const resolve = (list) => arr(list).map((t) => (typeof t === 'string' ? byId.get(t) : normalizeCve(t, weights))).filter(Boolean);
  const top = resolve(raw.top);
  return {
    date: str(raw.date),
    generated_at: raw.generated_at ?? null,
    window: raw.window ?? null,
    summary: str(raw.summary || raw.summary_template),
    stats: normalizeStats(raw.stats),
    scoring_weights: weights,
    cves,
    top,
    kev_new: resolve(raw.kev_new),
    news: arr(raw.news).map((n) => ({ title: str(n.title), url: str(n.url), source: str(n.source), type: str(n.type), lang: str(n.lang), date: n.date ?? null })),
    sources_status: (raw.sources_status && typeof raw.sources_status === 'object') ? raw.sources_status : {},
  };
}

export function normalizeMap(raw) {
  raw = raw || {};
  return {
    updated_at: raw.updated_at ?? null,
    data_day: raw.data_day ?? null,
    // Textos del pipeline para el pie del mapa (se pintan con textContent, tal cual)
    note: str(raw.note).slice(0, 400),
    source: str(raw.source).slice(0, 200),
    points: arr(raw.points).map((p) => ({ lat: num(p.lat), lon: num(p.lon), country: str(p.country), cc: str(p.cc), attacks: num(p.attacks) || 0, sources: num(p.sources) || 0 })).filter((p) => p.lat != null && p.lon != null),
    by_country: arr(raw.by_country).map((c) => ({ cc: str(c.cc), country: str(c.country), attacks: num(c.attacks) || 0 })),
    top_ports: arr(raw.top_ports).map((p) => ({ port: num(p.port), records: num(p.records) || 0, sources: num(p.sources) || 0, targets: num(p.targets) || 0 })).filter((p) => p.port != null),
  };
}

export function normalizeIndex(raw) {
  raw = raw || {};
  // top de cada día: [{id, score}] (el pipeline guarda el top 3)
  const days = arr(raw.days).map((d) => ({
    date: str(d.date),
    stats: normalizeStats(d.stats),
    top: arr(d.top).map((t) => (typeof t === 'string' ? { id: t, score: null } : { id: str(t && t.id), score: num(t && t.score) })).filter((t) => t.id),
  })).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date));
  // El pipeline los da en orden descendente; la web los quiere ascendentes (antiguo → reciente)
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { updated_at: raw.updated_at ?? null, days };
}

/* ───────────────────── carga ───────────────────── */

/**
 * Carga el conjunto de datos. opts:
 *   { base }   producción: lee base+latest.json / map.json / index.json
 *   { bundle } desarrollo: lee un fichero {latest, map, index}
 * latest es obligatorio; map e index pueden fallar sin tumbar el resto.
 */
export async function loadData(opts = {}) {
  if (opts.bundle) {
    const b = await getJson(opts.bundle);
    return { latest: normalizeLatest(b.latest), map: b.map ? normalizeMap(b.map) : null, index: b.index ? normalizeIndex(b.index) : null, mapError: null, indexError: null };
  }
  const base = opts.base || DATA_BASE;
  const latest = normalizeLatest(await getJson(base + 'latest.json')); // si latest falla, propaga (pantalla de error)
  let map = null, index = null, mapError = null, indexError = null;
  try { map = normalizeMap(await getJson(base + 'map.json')); } catch (e) { mapError = e; }
  try { index = normalizeIndex(await getJson(base + 'index.json')); } catch (e) { indexError = e; }
  return { latest, map, index, mapError, indexError };
}

export async function loadDay(date, opts = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new DataError('Fecha inválida', String(date));
  const base = opts.base || DATA_BASE;
  return normalizeLatest(await getJson(`${base}days/${date}.json`));
}

/** Re-pide map.json cada 10 min, solo si la pestaña está visible. Devuelve stop(). */
export function startMapRefresh(onUpdate, opts = {}) {
  const base = opts.base || DATA_BASE;
  const every = opts.intervalMs || MAP_REFRESH_MS;
  let timer = null;
  const tick = async () => {
    if (document.visibilityState !== 'visible') return;
    try { onUpdate(normalizeMap(await getJson(base + 'map.json'))); } catch (e) { /* el mapa puede fallar sin afectar al resto */ }
  };
  timer = setInterval(tick, every);
  const onVis = () => { if (document.visibilityState === 'visible') tick(); };
  document.addEventListener('visibilitychange', onVis);
  return function stop() { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
}

/* ───────────────────── estado de fuentes ─────────────────────
   Según las órdenes: "ok" → OK ; "error: …" → ERROR (mensaje en tooltip) ;
   una fuente que no venga → PARCIAL. */
export function interpretSource(value) {
  if (value == null) return { state: 'partial', label: 'PARCIAL', msg: '' };
  if (value === 'ok') return { state: 'ok', label: 'OK', msg: '' };
  return { state: 'error', label: 'ERROR', msg: String(value).replace(/^error:\s*/i, '') };
}
