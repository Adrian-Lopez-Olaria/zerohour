/* =============================================================================
   main.js · arranque
   Carga los datos, arranca relojes y barra de fuentes, inicializa el enrutado y
   el refresco del mapa. Listado, detalle e histórico se conectan en la fase 5.
   En desarrollo, ?fixtures=<nombre> carga un bundle de prueba (lo sirve
   dev_server; en producción esa ruta no existe).
   ============================================================================= */
import { loadData, startMapRefresh } from './data.js';
import { initRouter } from './router.js';
import { el, clear } from './util/dom.js';
import { parseIso } from './util/format.js';
import { icon } from './render/comunes.js';
import { startClocks, renderSrcbar, renderSourceAlerts } from './render/cabecera.js';
import { renderBriefing, refreshMapPanels } from './render/briefing.js';

const params = new URLSearchParams(location.search);
const fixture = params.get('fixtures');
const SOURCE = fixture ? { bundle: `fixtures/${encodeURIComponent(fixture)}.json` } : { base: 'data/' };

const state = { data: null, map: null };
let tBase = null;          // instante de latest.generated_at (base del reloj T+)
let briefingDone = false;

function showError(err) {
  const box = document.getElementById('alerts');
  if (!box) return;
  clear(box);
  box.appendChild(el('div', { class: 'alert', role: 'alert' }, [
    icon('alert'),
    el('div', [
      el('b', { text: 'NO SE PUDIERON CARGAR LOS DATOS' }),
      el('p', { text: `No se pudo leer ${err && err.url ? err.url : 'los datos del día'}${err && err.message ? ` (${err.message})` : ''}. Reintenta en unos minutos; el histórico puede seguir disponible.` }),
    ]),
    el('span', { class: 'mono', text: 'REINTENTA' }),
  ]));
}

function showBriefing() {
  if (briefingDone) return;               // se pinta una vez; el mapa se refresca aparte
  renderBriefing(document.getElementById('view-briefing'), state);
  briefingDone = true;
}

async function boot() {
  document.documentElement.setAttribute('data-zh', 'loading');
  startClocks(() => tBase);               // UTC y hora local ya corren mientras cargan los datos

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
  state.map = data.map;
  tBase = parseIso(data.latest.generated_at);
  renderSrcbar(data.latest, state.map);
  renderSourceAlerts(data.latest);

  initRouter({ briefing: showBriefing });

  if (data.map && !fixture) {
    startMapRefresh((m) => {
      state.map = m;
      renderSrcbar(state.data.latest, m);
      if (briefingDone) refreshMapPanels(state);
    }, SOURCE);
  }

  document.documentElement.setAttribute('data-zh', 'ready');
}

boot();
