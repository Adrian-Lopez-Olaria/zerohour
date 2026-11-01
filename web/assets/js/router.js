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
    // "#cve" a secas → id undefined (abre la nº 1); un ID con formato inválido → null
    const id = h.slice(4);
    return { view: 'detalle', id: id === '' ? undefined : ID_RE.test(id) ? id : null };
  }
  return VIEWS.includes(h) ? { view: h } : { view: 'briefing' };
}

/**
 * Inicializa el enrutado. `handlers` es { briefing, listado, detalle, historico }:
 * funciones que pintan cada vista (se añaden según avanzan las fases).
 * Devuelve la función route() por si hace falta forzar un re-render.
 */
export function initRouter(handlers = {}) {
  let first = true;
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

    // Accesibilidad: al cambiar de pantalla, el foco va al titular de la vista nueva
    // (salvo en la carga inicial o si la vista ya colocó el foco dentro de sí misma).
    const sec = document.getElementById('view-' + view);
    if (!first && sec && !sec.contains(document.activeElement)) {
      const h = sec.querySelector('h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    first = false;
  }

  window.addEventListener('hashchange', route);
  route();
  return route;
}
