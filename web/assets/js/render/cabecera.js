/* =============================================================================
   render/cabecera.js · relojes, franja de edición (fuentes) y avisos de fuente caída
   ============================================================================= */
import { el, clear } from '../util/dom.js';
import { SOURCE_KEYS, EXTRA_SOURCE_KEYS, interpretSource } from '../data.js';
import { TZ, fmtTplus, tUTC, tLocal, dDayMonYear, hmUTC, nextBriefingRun, nextMapRun } from '../util/format.js';
import { icon } from './comunes.js';
import { desplegable } from '../util/desplegable.js';

const SOURCE_LABEL = { nvd: 'NVD', kev: 'CISA KEV', epss: 'EPSS', ghsa: 'GitHub Advisories', poc: 'PoC-in-GitHub', rss: 'Avisos y prensa (RSS)', cvelist: 'CVE.org', metasploit: 'Metasploit', nuclei: 'Nuclei', exploitdb: 'Exploit-DB' };
/** Fuentes a mostrar: las 6 de siempre y las de la fase 6 si la edición las trae. */
const sourcesOf = (latest) => [...SOURCE_KEYS, ...EXTRA_SOURCE_KEYS.filter((k) => k in latest.sources_status)];

// Qué se queda cojo cuando cae cada fuente (texto del aviso)
const SOURCE_IMPACT = {
  nvd: 'Pueden faltar CVE o su CVSS en esta edición: el score de las afectadas es provisional.',
  kev: 'Las CVE explotadas activamente (KEV) pueden no estar marcadas en esta edición.',
  epss: 'El EPSS no suma en el score de esta edición: las puntuaciones salen más bajas.',
  ghsa: 'Pueden faltar avisos de GitHub Advisories en esta edición.',
  poc: 'Puede faltar la marca de exploit público (PoC) en esta edición.',
  rss: 'Pueden faltar avisos de INCIBE-CERT, CERT-EU y noticias en esta edición.',
  cvelist: 'Falta el SSVC de CISA y el CVSS de respaldo del CNA: más CVE sin puntuar y sin la señal de explotación de CISA.',
  metasploit: 'Pueden faltar exploits verificados de Metasploit en esta edición.',
  nuclei: 'Pueden faltar plantillas de detección de Nuclei en esta edición.',
  exploitdb: 'Pueden faltar exploits de Exploit-DB en esta edición.',
};

/**
 * Arranca los relojes de la cabecera. getBase() devuelve el instante (ms) de
 * latest.generated_at, o null mientras no haya datos.
 * El T+ visual cambia cada segundo pero no se anuncia (aria-live="off"); el
 * lector de pantalla recibe un resumen educado solo cuando cambia la hora.
 */
export function startClocks(getBase) {
  const utc = document.getElementById('clk-utc');
  const loc = document.getElementById('clk-loc');
  const sr = document.getElementById('tplus-sr');
  const fmtLoc = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: TZ });
  let lastHour = null;

  function tick() {
    const now = Date.now();
    const base = getBase();
    const tp = base == null ? '--:--:--' : fmtTplus(now - base);
    for (const n of document.querySelectorAll('.js-tplus')) n.textContent = tp;
    if (utc) utc.textContent = new Date(now).toISOString().slice(11, 19);
    if (loc) loc.textContent = fmtLoc.format(now);

    if (sr && base != null) {
      const h = Math.floor(Math.max(0, now - base) / 3600000);
      if (h !== lastHour) {
        lastHour = h;
        sr.textContent = h === 0
          ? 'Briefing actualizado hace menos de una hora.'
          : `Briefing actualizado hace ${h} ${h === 1 ? 'hora' : 'horas'}.`;
      }
    }
  }
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

/**
 * Línea de edición de la cabecera (Órbita; órdenes de dirección §1.4: visible también en escritorio):
 * «● 4 nov 2026 · 14:00 · T+01:23:45 · 10/10 fuentes ▾». El estado de las fuentes es un <details>
 * (sin JS) con la lista completa; si alguna cae, el resumen dice «N fuentes con error» en rojo y el
 * aviso .alert aparece debajo de la cabecera.
 */
export function renderStatus(latest, map) {
  const bar = document.getElementById('status');
  if (!bar) return;
  clear(bar);
  const keys = sourcesOf(latest);
  const st = keys.map((k) => [k, interpretSource(latest.sources_status[k])]);
  const errs = st.filter(([, s]) => s.state === 'error').length;
  const warns = st.filter(([, s]) => s.state === 'partial').length;
  const okN = st.filter(([, s]) => s.state === 'ok').length;
  bar.className = 'status' + (errs ? ' has-err' : '') + (warns ? ' has-warn' : '');
  const lectura = map && map.updated_at ? `Mapa: lectura de las ${tUTC(map.updated_at)} UTC · próxima hacia las ${hmUTC(nextMapRun())} UTC` : 'Mapa: sin lectura';

  bar.append(
    el('span', { class: 'status__dot', 'aria-hidden': 'true' }),
    latest.generated_at
      ? el('span', [`${dDayMonYear(latest.generated_at)} · ${tLocal(latest.generated_at)} · `,
        el('span', { class: 'tplus', title: 'Tiempo desde la última actualización del briefing' }, ['T+', el('b', { class: 'js-tplus', text: '--:--:--' })]), ' ·'])
      : el('span', { text: 'Sin edición ·' }),
    // Desplegable: se cierra al hacer clic fuera y con Esc (util/desplegable.js)
    desplegable(el('details', { class: 'srcs' + (errs ? ' has-err' : '') }, [
      el('summary', [errs ? `${errs} ${errs === 1 ? 'fuente' : 'fuentes'} con error` : `${okN}/${keys.length} fuentes`, icon('chevron')]),
      el('ul', { class: 'srcs__list' }, [
        ...st.map(([k, s]) => el('li', [
          el('i', { class: 'dot' + (s.state === 'error' ? ' dot--fail' : s.state === 'partial' ? ' dot--warn' : ''), 'aria-hidden': 'true' }),
          el('b', { text: SOURCE_LABEL[k] }),
          el('span', { class: s.state === 'error' ? 'src--fail' : null, text: s.state === 'error' ? 'Error' : s.state === 'partial' ? 'Parcial' : 'OK' }),
          s.msg ? el('small', { text: s.msg }) : null,
        ])),
        el('li', el('span', { class: 'srcs__upd', text: lectura })),
      ]),
    ])),
  );
}

/** Un aviso por cada fuente en ERROR (la PARCIAL solo se marca en la barra). */
export function renderSourceAlerts(latest) {
  const box = document.getElementById('alerts');
  if (!box) return;
  clear(box);
  const next = hmUTC(nextBriefingRun());
  for (const k of sourcesOf(latest)) {
    const s = interpretSource(latest.sources_status[k]);
    if (s.state !== 'error') continue;
    box.appendChild(el('div', { class: 'alert', role: 'alert' }, [
      icon('alert'),
      el('div', [
        el('b', { text: `${SOURCE_LABEL[k]}: fuente caída` }),
        el('p', { text: `${s.msg ? s.msg + '. ' : ''}${SOURCE_IMPACT[k]}` }),
      ]),
      el('span', { class: 'alert__next', text: `Próxima edición hacia las ${next} UTC` }),
    ]));
  }
}
