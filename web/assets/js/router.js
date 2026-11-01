/* =============================================================================
   router.js · enrutado por hash
   Rutas: #briefing · #listado · #cve/<ID> · #historico
   El <ID> se valida con ^CVE-\d{4}-\d{4,7}$ antes de usarlo.
   ============================================================================= */
import { ID_RE } from './data.js';

const VIEWS = ['briefing', 'listado', 'detalle', 'historico'];

/** Interpreta un hash en { view, id? }. Entradas malformadas → briefing. */
export function parseHash(hash) {
  let h;
  try { h = decodeURIComponent(String(hash || '').replace(/^#/, '')); }
  catch (e) { return { view: 'briefing' }; } // % mal formado
  h = h.trim();
  if (!h) return { view: 'briefing' };
  if (h === 'cve' || h.startsWith('cve/')) {
    const id = h.slice(4);
    return { view: 'detalle', id: ID_RE.test(id) ? id : null };
  }
  return VIEWS.includes(h) ? { view: h } : { view: 'briefing' };
}

/**
 * Inicializa el enrutado. `handlers` es { briefing, listado, detalle, historico }:
 * funciones que pintan cada vista (se añaden según avanzan las fases).
 * Devuelve la función route() por si hace falta forzar un re-render.
 */
export function initRouter(handlers = {}) {
  function route() {
    const { view, id } = parseHash(location.hash);

    for (const sec of document.querySelectorAll('.view')) {
      sec.hidden = sec.id !== 'view-' + view;
    }
    for (const a of document.querySelectorAll('.nav__a')) {
      if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }

    const fn = handlers[view];
    if (typeof fn === 'function') {
      try { fn(id); } catch (e) { console.error(`[router] fallo al pintar "${view}":`, e); }
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  route();
  return route;
}
