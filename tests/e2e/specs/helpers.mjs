// Utilidades comunes: abrir la web con un fixture, vigilar la CSP y los errores, y esperar a
// que la vista esté pintada. Los fixtures solo existen con dev_server --dev (nunca en producción).
import { expect } from '@playwright/test';

export const FIXTURE = { normal: 'normal', vacio: 'vacio', error: 'error', xss: 'xss', real: 'real-2026-10-31-fase6' };
export const VIEWS = { briefing: '#briefing', listado: '#listado', detalle: '#cve', historico: '#historico' };

/** Antes de cargar: recoge violaciones de CSP/Trusted Types y cuenta ejecuciones de payloads XSS. */
export async function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__csp = []; window.__exec = 0;
    window.__xss = () => { window.__exec++; };
    window.alert = () => { window.__exec++; };
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile || ''}:${e.lineNumber || ''}`));
  });
  return errors;
}

/** Abre ?fixtures=<f><hash> y espera a data-zh="ready" y a las fuentes. */
export async function open(page, fixture = FIXTURE.normal, hash = '') {
  const errors = await watch(page);
  await page.goto(`/?fixtures=${fixture}${hash}`);
  await expect(page.locator('html')).toHaveAttribute('data-zh', 'ready');
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

export async function go(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(250);
}

export const csp = (page) => page.evaluate(() => window.__csp);

/** Espera a que globe.js monte el globo 3D o la vista plana. */
export async function globeReady(page) {
  await page.locator('#globe-zone.is-globe, #globe-zone.is-flat').waitFor({ timeout: 30_000 });
  return page.locator('#globe-zone').getAttribute('class');
}

export const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
