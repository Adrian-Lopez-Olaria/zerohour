/* =============================================================================
   util/dom.js · construcción de DOM SIN innerHTML
   Todo el contenido que viene de fuentes externas (NVD, RSS, PoC…) es hostil.
   - El texto se escribe con textContent (nunca innerHTML/insertAdjacentHTML).
   - Las URLs externas pasan por safeUrl(): solo http(s) absolutas.
   - Los manejadores se añaden con addEventListener, nunca con on*="".
   ============================================================================= */

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
// Caracteres de control (incluye TAB, LF, CR…) que los navegadores ignoran dentro de un esquema
const CTRL = /[\u0000-\u001F\u007F-\u009F]/g;
const SAFE_ATTR = /^[a-zA-Z_][a-zA-Z0-9:._-]*$/;
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'srcset', 'poster', 'formaction', 'action']);

/**
 * Devuelve la URL si es http(s) ABSOLUTA y segura; si no, null (no se pinta el enlace).
 * Rechaza javascript:, data:, vbscript:, esquemas con control chars/entidades,
 * y también relativas y protocol-relative (//host), que no esperamos en los datos.
 */
export function safeUrl(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(CTRL, '').trim();
  if (!cleaned) return null;
  let u;
  try { u = new URL(cleaned); } catch { return null; } // sin base: relativas y //host lanzan → null
  return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
}

/** Nodo de texto a partir de cualquier valor (null/undefined → cadena vacía). */
export function text(value) {
  return document.createTextNode(value == null ? '' : String(value));
}

/** Vacía un nodo sin usar innerHTML. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

function append(node, child) {
  if (child == null || child === false || child === true) return;
  if (Array.isArray(child)) { for (const c of child) append(node, c); return; }
  if (child instanceof Node) { node.appendChild(child); return; }
  node.appendChild(document.createTextNode(String(child)));
}

function applyAttrs(node, attrs, isSvg) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;

    if (k === 'text') { node.textContent = v == null ? '' : String(v); continue; }
    if (k === 'class' || k === 'className') { node.setAttribute('class', String(v)); continue; }

    if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(v)) if (dv != null) node.dataset[dk] = String(dv);
      continue;
    }
    if (k === 'style') {
      // Solo objeto {prop: valor} → setProperty (la CSP bloquea style=""; aquí usamos CSSOM)
      if (v && typeof v === 'object') for (const [p, val] of Object.entries(v)) { if (val != null) node.style.setProperty(p, String(val)); }
      continue;
    }
    if (k === 'on' && v && typeof v === 'object') {
      // on: { click: fn, ... } → addEventListener (nunca on*="")
      for (const [ev, fn] of Object.entries(v)) if (typeof fn === 'function') node.addEventListener(ev, fn);
      continue;
    }

    // Blindaje: nada de manejadores inline ni sinks de HTML
    if (/^on/i.test(k)) continue;
    if (k === 'html' || k === 'innerHTML' || k === 'outerHTML' || k === 'srcdoc') continue;
    if (!SAFE_ATTR.test(k)) continue;

    // URLs: internas (#…) se permiten; externas pasan por safeUrl()
    if (URL_ATTRS.has(k)) {
      const s = String(v);
      if (s.startsWith('#')) { setAttr(node, k, s, isSvg); continue; }
      const safe = safeUrl(s);
      if (safe) setAttr(node, k, safe, isSvg);
      continue; // si no es segura, el atributo no se pone (enlace no pintado)
    }
    setAttr(node, k, String(v), isSvg);
  }
}

function setAttr(node, k, v, isSvg) {
  if (isSvg && k === 'xlink:href') node.setAttributeNS(XLINK_NS, 'xlink:href', v);
  else node.setAttribute(k, v);
}

/** el('div', {class:'x', text:'hola'}, [hijos]) · el('p', 'texto') · sin innerHTML. */
export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs != null && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    applyAttrs(node, attrs, false);
  } else if (attrs != null) {
    children = attrs; // segundo argumento eran los hijos
  }
  append(node, children);
  return node;
}

/** Igual que el() pero en el espacio de nombres SVG (radar, dial, gráficas, globo). */
export function svg(tag, attrs, children) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs != null && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    applyAttrs(node, attrs, true);
  } else if (attrs != null) {
    children = attrs;
  }
  append(node, children);
  return node;
}

/** Fragmento con varios hijos. */
export function frag(children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}
