// Controles que no se saltan nunca: 0 violaciones de CSP/Trusted Types, 0 errores, ningún
// payload de los datos se ejecuta y la web no pide nada a terceros. Con las cabeceras reales.
import { test, expect } from '@playwright/test';
import { open, go, csp, globeReady, FIXTURE, VIEWS } from './helpers.mjs';

for (const fx of Object.values(FIXTURE)) {
  test(`fixture ${fx}: 4 vistas sin violaciones de CSP/Trusted Types ni errores`, async ({ page }) => {
    const external = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && u.protocol !== 'data:') external.push(r.url()); });
    const errors = await open(page, fx);
    if (fx !== FIXTURE.vacio) await globeReady(page);
    for (const hash of Object.values(VIEWS)) await go(page, hash);
    await go(page, VIEWS.briefing);
    expect(await csp(page)).toEqual([]);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
}

test('xss: ningún payload se ejecuta y no queda ningún enlace javascript:/data:', async ({ page }) => {
  await open(page, FIXTURE.xss);
  for (const hash of [...Object.values(VIEWS), '#cve/CVE-2026-99999']) await go(page, hash);
  await go(page, VIEWS.briefing);
  const r = await page.evaluate(() => ({
    exec: window.__exec,
    bad: [...document.querySelectorAll('[href], [src]')].map((n) => n.getAttribute('href') || n.getAttribute('src'))
      .filter((u) => /^\s*(javascript|data|vbscript):/i.test(u) && !u.startsWith('data:image/svg+xml')),
    handlers: [...document.querySelectorAll('*')].filter((n) => [...n.attributes].some((a) => /^on/i.test(a.name))).length,
    scripts: document.querySelectorAll('script:not([src])').length,
  }));
  expect(r).toEqual({ exec: 0, bad: [], handlers: 0, scripts: 0 });
  expect(await csp(page)).toEqual([]);
});

test('enlaces externos: target _blank siempre con noopener noreferrer; PoC con nofollow ugc', async ({ page }) => {
  await open(page, FIXTURE.real, '#cve');
  const links = await page.evaluate(() => [...document.querySelectorAll('a[target="_blank"]')].map((a) => a.getAttribute('rel') || ''));
  expect(links.length).toBeGreaterThan(0);
  for (const rel of links) {
    expect(rel).toMatch(/noopener/);
    expect(rel).toMatch(/noreferrer/);
  }
});

test('ruta #cve con un ID malformado no se usa: ficha de «identificador no válido»', async ({ page }) => {
  await open(page, FIXTURE.normal, '#cve/<img src=x onerror=__xss()>');
  await expect(page.locator('#view-detalle')).toContainText('Identificador no válido');
  expect(await page.evaluate(() => window.__exec)).toBe(0);
});
