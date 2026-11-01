/* =============================================================================
   main.js · arranque
   Carga los datos, inicializa el enrutado y arranca el refresco del mapa.
   Los render de cada vista (briefing, listado, detalle, histórico) se conectan
   en las fases 3-5. En desarrollo, ?fixtures=<nombre> carga un bundle de prueba
   (lo sirve dev_server; en producción esa ruta no existe).
   ============================================================================= */
import { loadData, startMapRefresh } from './data.js';
import { initRouter } from './router.js';
import { el, clear, svg } from './util/dom.js';

const params = new URLSearchParams(location.search);
const fixture = params.get('fixtures');
const SOURCE = fixture ? { bundle: `fixtures/${encodeURIComponent(fixture)}.json` } : { base: 'data/' };

const state = { data: null, map: null };

function alertIcon() {
  return svg('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'aria-hidden': 'true' }, [
    svg('path', { d: 'M8 1.5 15 14H1Z' }),
    svg('path', { d: 'M8 6v4M8 11.6v1.2' }),
  ]);
}

function showError(err) {
  const box = document.getElementById('alerts');
  if (!box) return;
  clear(box);
  box.appendChild(el('div', { class: 'alert', role: 'alert' }, [
    alertIcon(),
    el('div', [
      el('b', { text: 'NO SE PUDIERON CARGAR LOS DATOS' }),
      el('p', { text: `No se pudo leer ${err && err.url ? err.url : 'los datos del día'}${err && err.message ? ` (${err.message})` : ''}. Reintenta en unos minutos; el histórico puede seguir disponible.` }),
    ]),
    el('span', { class: 'mono', text: 'REINTENTA' }),
  ]));
}

async function boot() {
  document.documentElement.setAttribute('data-zh', 'loading');
  let data;
  try {
    data = await loadData(SOURCE);
  } catch (err) {
    showError(err);
    document.documentElement.setAttribute('data-zh', 'error');
    console.error('[zerohour] carga de datos:', err);
    return;
  }

  state.data = data;
  // Los handlers de cada vista se registran en las fases 3-5; de momento el router
  // solo gestiona la visibilidad de las secciones y el resaltado de la navegación.
  initRouter({});

  if (data.map && !fixture) {
    startMapRefresh((m) => { state.map = m; /* el briefing se re-pinta en fase 3 */ }, SOURCE);
  }

  document.documentElement.setAttribute('data-zh', 'ready');
}

boot();
