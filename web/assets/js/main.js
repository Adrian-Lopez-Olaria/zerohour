/* =============================================================================
   main.js · arranque
   Carga los datos, arranca relojes y barra de fuentes, inicializa el enrutado
   (briefing, listado, detalle, histórico) y el refresco del mapa.
   En desarrollo, ?fixtures=<nombre> carga un bundle de prueba (lo sirve
   dev_server; en producción esa ruta no existe).
   ============================================================================= */
import { loadData, loadDay, startMapRefresh } from './data.js';
import { initRouter } from './router.js';
import { el, clear } from './util/dom.js';
import { parseIso } from './util/format.js';
import { icon } from './render/comunes.js';
import { startClocks, renderStatus, renderSourceAlerts } from './render/cabecera.js';
import { renderBriefing, refreshMapPanels } from './render/briefing.js';
import { renderListado, requestSearchFocus } from './render/listado.js';
import { renderDetalle } from './render/detalle.js';
import { renderHistorico } from './render/historico.js';

const params = new URLSearchParams(location.search);
const fixture = params.get('fixtures');
const SOURCE = fixture ? { bundle: `fixtures/${encodeURIComponent(fixture)}.json` } : { base: 'data/' };
const DAY_BASE = fixture ? 'fixtures/' : 'data/';   // fixtures/days/… solo existe en desarrollo

/* state.edition: la edición que muestran listado y detalle (hoy o un día del histórico) */
const state = { data: null, map: null, edition: null, today: null };
let tBase = null;          // instante de latest.generated_at (base del reloj T+)
let briefingDone = false;
let route = () => {};

const view = (name) => document.getElementById('view-' + name);
const ctx = {
  state,
  /** Abre en el listado la edición de un día (descarga data/days/AAAA-MM-DD.json si no es hoy). */
  async openDay(date) {
    state.edition = date === state.today.date ? state.today : { date, today: false, data: await loadDay(date, { base: DAY_BASE }) };
    if (location.hash === '#listado') route(); else location.hash = '#listado';
  },
  backToToday() {
    state.edition = state.today;
    route();
  },
};

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
  state.today = { date: data.latest.date, today: true, data: data.latest };
  state.edition = state.today;
  tBase = parseIso(data.latest.generated_at);
  renderStatus(data.latest, state.map);
  renderSourceAlerts(data.latest);

  route = initRouter({
    briefing: showBriefing,
    listado: () => renderListado(view('listado'), ctx),
    detalle: (id) => renderDetalle(view('detalle'), ctx, id),
    historico: () => renderHistorico(view('historico'), ctx),
  });

  // Atajo "/": lleva al buscador del listado desde cualquier pantalla (guía §8)
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
    e.preventDefault();
    requestSearchFocus();
    if (location.hash !== '#listado') location.hash = '#listado';
  });

  if (data.map && !fixture) {
    startMapRefresh((m) => {
      state.map = m;
      renderStatus(state.data.latest, m);
      if (briefingDone) refreshMapPanels(state);
    }, SOURCE);
  }

  document.documentElement.setAttribute('data-zh', 'ready');
}

boot();
