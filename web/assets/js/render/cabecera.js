/* =============================================================================
   render/cabecera.js · relojes, franja de edición (fuentes) y avisos de fuente caída
   ============================================================================= */
import { el, clear } from '../util/dom.js';
import { SOURCE_KEYS, EXTRA_SOURCE_KEYS, interpretSource } from '../data.js';
import { TZ, fmtTplus, tUTC, tLocal, dMid, dShort, hmUTC, nextBriefingRun, nextMapRun } from '../util/format.js';
import { icon } from './comunes.js';

const SOURCE_LABEL = { nvd: 'NVD', kev: 'KEV', epss: 'EPSS', ghsa: 'GHSA', poc: 'POC', rss: 'RSS', cvelist: 'CVE.ORG', metasploit: 'MSF', nuclei: 'NUCLEI', exploitdb: 'EXPLOIT-DB' };
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
 * Franja de edición (v2): «LUN 02 NOV 2026 · EDICIÓN 13:47 · T+…» y el estado de las fuentes.
 * Desde 1180 px las fuentes van en línea; por debajo, en un <details> («10/10 FUENTES OK ▾»)
 * que abre la lista completa (sin JS: el CSS decide cuál se ve). Si alguna cae, el resumen
 * pasa a «N FUENTES CON ERROR» en rojo y el aviso .alert sigue apareciendo debajo.
 */
export function renderStrip(latest, map) {
  const bar = document.getElementById('strip');
  if (!bar) return;
  clear(bar);
  const keys = sourcesOf(latest);
  const st = keys.map((k) => [k, interpretSource(latest.sources_status[k])]);
  const errs = st.filter(([, s]) => s.state === 'error').length;
  const warns = st.filter(([, s]) => s.state === 'partial').length;
  const okN = st.filter(([, s]) => s.state === 'ok').length;
  const cls = (s) => (s.state === 'error' ? ' src--fail' : s.state === 'partial' ? ' src--warn' : '');
  const lectura = map && map.updated_at ? `MAPA ${tUTC(map.updated_at)} UTC · PRÓXIMA ≈${hmUTC(nextMapRun())} UTC` : 'MAPA SIN LECTURA';

  const tp = el('span', { class: 'tplus', title: 'Tiempo desde la última actualización del briefing' }, ['T+', el('b', { class: 'js-tplus', text: '--:--:--' })]);
  bar.appendChild(el('span', { class: 'strip__ed' }, latest.generated_at ? [
    el('span', { class: 'ed-long' }, [el('b', { text: dMid(latest.date) }), ' · EDICIÓN ', el('b', { text: tLocal(latest.generated_at) }), ' · ']),
    el('span', { class: 'ed-short', 'aria-hidden': 'true' }, [el('b', { text: dShort(latest.date) }), ' · ', el('b', { text: tLocal(latest.generated_at) }), ' · ']),
    tp,
  ] : [el('b', { text: 'SIN EDICIÓN' })]));

  bar.appendChild(el('span', { class: 'srcs-inline', role: 'group', 'aria-label': 'Estado de las fuentes' }, [
    ...st.map(([k, s]) => el('span', { class: 'src' + cls(s), title: s.state === 'error' ? s.msg : s.state === 'partial' ? 'Sin estado en esta lectura' : null }, [
      el('i', { 'aria-hidden': 'true' }),
      el('b', { text: SOURCE_LABEL[k] }),
      el('em', { text: s.label }),
      s.msg ? el('span', { class: 'sr-only', text: `: ${s.msg}` }) : null,
    ])),
    el('span', { class: 'srcs-upd', text: map && map.updated_at ? `MAPA ${tUTC(map.updated_at)} UTC` : '' }),
  ]));

  bar.appendChild(el('details', { class: 'srcs' + (errs ? ' has-err' : '') + (warns ? ' has-warn' : '') }, [
    el('summary', [el('i', { 'aria-hidden': 'true' }),
      errs ? `${errs} FUENTE${errs > 1 ? 'S' : ''} CON ERROR` : `${okN}/${keys.length} FUENTES OK`]),
    el('ul', { class: 'srcs__list' }, [
      ...st.map(([k, s]) => el('li', [
        el('i', { class: 'dot' + (s.state === 'error' ? ' dot--fail' : s.state === 'partial' ? ' dot--warn' : ''), 'aria-hidden': 'true' }),
        el('b', { text: SOURCE_LABEL[k] }),
        el('span', { text: s.label }),
        s.msg ? el('small', { text: s.msg }) : null,
      ])),
      el('li', el('span', { class: 'srcs__upd', text: lectura })),
    ]),
  ]));
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
        el('b', { text: `${SOURCE_LABEL[k]} · FUENTE CAÍDA` }),
        el('p', { text: `${s.msg ? s.msg + '. ' : ''}${SOURCE_IMPACT[k]}` }),
      ]),
      el('span', { class: 'mono', text: `PRÓXIMA EDICIÓN ≈${next} UTC` }),
    ]));
  }
}
