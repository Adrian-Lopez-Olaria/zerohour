// Criterios de aceptación de «Órbita» (design/orbita/zerohour-cambios-orbita.md §9) y órdenes de
// dirección: 4 rutas, estados especiales, respaldo sin WebGL, accesibilidad y capturas.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { open, go, csp, globeReady, noHorizontalScroll, FIXTURE, VIEWS } from './helpers.mjs';

const rect = (page, sel) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
const south = (page) => page.locator('#globe').evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width * 0.22, y: r.y + r.height * 0.6, width: r.width * 0.3, height: r.height * 0.2 }; });
const shot = async (page, clip) => page.screenshot({ clip });
const same = (a, b) => Buffer.compare(a, b) === 0;

test.describe('§9 · escritorio 1440 × 900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // Con los datos del día del diseño (4-11: 2 accionables y 8 «vigilar»). Un día con muchas KEV
  // tiene más filas de cinco líneas y el top crece: ver el informe (decisión de diseño pendiente).
  test('1. el briefing se ve entero sin scroll: top, globo y radar alineados arriba y 24 px bajo las cifras', async ({ page }) => {
    await open(page, FIXTURE.orbita);
    await globeReady(page);
    const kpis = await rect(page, '.kpis'), top = await rect(page, '.top10'), stage = await rect(page, '.mapp'), side = await rect(page, '.side');
    expect(top.top - kpis.bottom).toBe(24);
    expect(stage.top).toBe(top.top);
    expect(side.top).toBe(top.top);
    for (const [n, r] of Object.entries({ top, stage, side })) expect(r.bottom, `${n} acaba en ${r.bottom} px`).toBeLessThanOrEqual(900);
    expect(await page.locator('#panel-top .orow').count()).toBe(10);
  });

  test('3. el globo gira solo, se para al arrastrarlo y vuelve a girar a 1 s', async ({ page }) => {
    await open(page, FIXTURE.real);
    expect(await globeReady(page)).toContain('is-globe');
    const zone = page.locator('#globe-zone');
    await expect(zone).toHaveAttribute('data-spin', 'on');
    const clip = await south(page);
    const a = await shot(page, clip); await page.waitForTimeout(700);
    expect(same(a, await shot(page, clip))).toBe(false);                     // gira de verdad
    const box = await page.locator('#globe-view').boundingBox();             // visible en 3D y en SVG
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 60, { steps: 8 });
    await expect(zone).toHaveAttribute('data-spin', 'off');                  // al arrastrar se para
    await page.mouse.up();
    await expect(zone).toHaveAttribute('data-spin', 'on', { timeout: 3000 }); // y, ~1 s después, vuelve a girar
  });

  test('3. un país del ranking lleva el globo hasta él (flyTo) y vuelve a girar a 1 s', async ({ page }) => {
    await open(page, FIXTURE.real);
    await globeReady(page);
    const zone = page.locator('#globe-zone');
    // El click se dispara en la página: flyTo() llama a hold() de forma síncrona, así que leer
    // data-spin justo después es determinista (la ventana de reanudación es de ~1 s)
    await page.locator('.cc__b').first().evaluate((b) => b.click());
    expect(await page.evaluate(() => document.querySelector('#globe-zone').dataset.spin)).toBe('off');
    await expect(zone).toHaveAttribute('data-spin', 'on', { timeout: 3000 }); // y vuelve a girar a ~1 s
  });

  test('sin zoom: no hay botones + / − / ⟲ y la rueda hace scroll de la página', async ({ page }) => {
    await open(page, FIXTURE.real);
    await globeReady(page);
    await expect(page.getByRole('button', { name: 'Acercar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Alejar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Volver a la vista inicial' })).toHaveCount(0);
    await expect(page.locator('.globe-hint')).toHaveText('Arrastra para girar');
    const box = await page.locator('#globe').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 400); await page.waitForTimeout(400);           // rueda sobre el globo
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(y0);           // hace scroll, no zoom
  });

  test('rayas de Cloudflare Radar: rótulo honesto, atribución con enlace y 0 violaciones de CSP', async ({ page }) => {
    await open(page, FIXTURE.real);
    await globeReady(page);
    await expect(page.locator('#map-arcs')).toHaveText('Ataques web mitigados por Cloudflare · origen → destino · últimas 24 h');
    const link = page.locator('#map-foot a', { hasText: 'Cloudflare Radar' });
    await expect(link).toHaveAttribute('href', /^https:\/\/radar\.cloudflare\.com/);
    await expect(link).toHaveAttribute('rel', /noopener noreferrer/);
    await expect(page.locator('#map-foot')).toContainText('CC BY-NC 4.0');
    expect(await csp(page)).toEqual([]);                                 // los arcos no violan la CSP
  });

  test('5. pasar por una fila del top resalta su punto del radar, y al revés', async ({ page }) => {
    await open(page, FIXTURE.real);
    const row = page.locator('#panel-top .orow').first();
    const id = await row.getAttribute('data-id');
    await row.hover();
    await expect(page.locator(`.rb[data-id="${id}"]`)).toHaveClass(/is-hot/);
    await page.mouse.move(2, 2);
    const blip = page.locator('.rb').nth(3);
    const id2 = await blip.getAttribute('data-id');
    await blip.focus();
    await expect(page.locator(`#panel-top .orow[data-id="${id2}"]`)).toHaveClass(/is-hot/);
  });

  test('textos del mapa coherentes: «IPs activas» y «ataques acumulados» como en map.json', async ({ page }) => {
    await open(page, FIXTURE.real);
    await expect(page.locator('#h-map')).toHaveText('Ranking DShield · IPs activas hoy');
    const name = await page.locator('.cc__b').first().evaluate((b) => b.textContent.replace(/\s+/g, ' ').trim());
    expect(name).toMatch(/^Llevar el globo a .+ ataques acumulados, [\d.]+ IPs? activas? \(DShield\)$/);
    expect(await page.locator('.cc__b').first().getAttribute('title')).toMatch(/: [\d.]+ ataques acumulados · [\d.]+ IPs? activas? \(DShield\)$/);
    const note = await page.evaluate(async () => (await (await fetch('fixtures/real-2026-10-31-fase6.json')).json()).map.note);
    await expect(page.locator('#map-foot')).toContainText(note);             // map.note tal cual
  });

  test('plazo CISA y desglose en las accionables; «PoC*» con su pie obligatorio', async ({ page }) => {
    await open(page, FIXTURE.normal);
    await expect(page.locator('#panel-top .odue').first()).toContainText(/Plazo CISA .+ · (en \d+ días?|vence hoy|vencido hace \d+ días?)/);
    expect(await page.locator('#panel-top .obd__bar').first().getAttribute('aria-label')).toMatch(/^Desglose del score: CVSS/);
    await expect(page.locator('#panel-top .ofoot')).toContainText('PoC* = PoC pública sin verificar');
    expect(await page.locator('#panel-top .orow--min .obd').count()).toBe(0);  // «vigilar» sin desglose
  });

  test('6. contraste AA y accesibilidad (axe, WCAG 2.1 A/AA) en las 4 rutas', async ({ page }) => {
    await open(page, FIXTURE.real);
    for (const hash of Object.values(VIEWS)) {
      await go(page, hash);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('#globe').analyze();
      expect(violations.map((v) => `${hash} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    }
  });

  test('7. CSP intacta: sin style=, sin manejadores inline y sin peticiones a terceros', async ({ page }) => {
    const external = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && u.protocol !== 'data:') external.push(r.url()); });
    await open(page, FIXTURE.real);
    await globeReady(page);
    for (const hash of Object.values(VIEWS)) await go(page, hash);
    // Los estilos dinámicos se ponen con CSSOM (setProperty), que la CSP permite; un style=""
    // del marcado o un setAttribute('style') sí la violarían y saldrían en el recuento de abajo
    const handlers = await page.evaluate(() => [...document.querySelectorAll('*')].filter((n) => [...n.attributes].some((a) => /^on/i.test(a.name))).length);
    expect(handlers).toBe(0);
    expect(external).toEqual([]);
    expect(await csp(page)).toEqual([]);
  });
});

test.describe('sin WebGL: globo SVG de respaldo', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  for (const why of ['librería bloqueada', 'sin WebGL']) {
    test(`${why} → globo SVG con el mismo comportamiento y 0 violaciones`, async ({ page }) => {
      if (why === 'librería bloqueada') await page.route('**/assets/vendor/globe.gl-*.js', (r) => r.abort());
      else await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
      const errors = await open(page, FIXTURE.real);
      expect(await globeReady(page)).toContain('is-flat');
      await expect(page.locator('#globe-flat svg.gp')).toBeVisible();
      const zone = page.locator('#globe-zone');
      await expect(zone).toHaveAttribute('data-spin', 'on');                     // gira solo
      // Arrastrar lo para y, a 1 s de soltar, vuelve a girar (mismo comportamiento que el 3D)
      const box = await page.locator('#globe-flat').boundingBox();
      await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 8 });
      await expect(zone).toHaveAttribute('data-spin', 'off');
      await page.mouse.up();
      await expect(zone).toHaveAttribute('data-spin', 'on', { timeout: 3000 });
      await expect(page.getByRole('button', { name: 'Acercar' })).toHaveCount(0);  // sin zoom
      expect(await page.locator('#globe-flat path.gp-arc').count()).toBeGreaterThan(0);  // mismas rayas en SVG
      expect(await csp(page)).toEqual([]);
      // El único error es la petición bloqueada a propósito
      expect(errors.filter((e) => !/globo no disponible|Failed to load resource/.test(e))).toEqual([]);
    });
  }
});

test.describe('§9 · móvil 390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('2. sin scroll horizontal; primero lead, cifras y globo, y el top justo después', async ({ page }) => {
    await open(page, FIXTURE.real);
    await globeReady(page);
    expect(await noHorizontalScroll(page)).toBe(true);
    const order = await page.evaluate(() => ['.lead', '.kpis', '.mapp', '.top10', '.radarp', '.ports'].map((s) => document.querySelector(s).getBoundingClientRect().top));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const g = await rect(page, '.globe-box');
    expect(g.bottom - g.top).toBeLessThanOrEqual(844 * 0.45);               // ≈ 40 % de la pantalla
    await expect(page.locator('.globe-hint')).toHaveText('Arrastra para girar');
  });

  test('top: 5 filas y «Ver las 10» con <details>, también con teclado', async ({ page }) => {
    await open(page, FIXTURE.real);
    await expect(page.locator('#panel-top details.more10 summary')).toHaveText('Ver las 10');
    await page.locator('#panel-top details.more10 summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#panel-top details.more10')).toHaveAttribute('open', '');
    await expect(page.locator('#panel-top .orow:visible')).toHaveCount(10);
  });

  test('zonas táctiles de 44 px o más', async ({ page }) => {
    await open(page, FIXTURE.real);
    await globeReady(page);
    const small = await page.evaluate(() => [...document.querySelectorAll('.nav__a, .cc__b, .more10 summary')]
      .filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length);
    expect(small).toBe(0);
  });
});

test.describe('estados especiales (órdenes de dirección §1.3)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('día vacío: cifras a 0 sin variación, «Nada que priorizar todavía» y sin «Lo primero hoy»', async ({ page }) => {
    await open(page, FIXTURE.vacio);
    await expect(page.locator('.lead')).toHaveCount(0);
    await expect(page.locator('.kpi__d')).toHaveCount(0);
    await expect(page.locator('.kpi--zero')).toHaveCount(6);
    await expect(page.locator('#panel-top')).toContainText('Nada que priorizar todavía');
  });

  test('fuente caída: aviso visible y fuentes en rojo («N fuentes con error»)', async ({ page }) => {
    await open(page, FIXTURE.error);
    await expect(page.locator('#alerts .alert')).toHaveCount(2);
    await expect(page.locator('.srcs.has-err summary')).toHaveText(/2 fuentes con error/);
  });

  test('map.json caído: el resto de la web funciona', async ({ page }) => {
    await page.route('**/fixtures/normal.json', async (route) => {
      const res = await route.fetch(); const b = await res.json(); delete b.map;
      await route.fulfill({ response: res, json: b });
    });
    await open(page, FIXTURE.normal);
    await expect(page.locator('.mapp')).toContainText('no se pudo leer');
    await expect(page.locator('#panel-top .orow')).toHaveCount(10);
    expect(await csp(page)).toEqual([]);
  });

  test('sin coincidencias en el listado', async ({ page }) => {
    await open(page, FIXTURE.real, '#listado');
    await page.locator('#q').fill('zzzz-no-existe-zzzz');
    await expect(page.locator('#lrows')).toContainText('Sin coincidencias');
  });
});

test.describe('4. reducir movimiento', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  test('no gira solo, sin pulsos ni barrido', async ({ page }) => {
    await open(page, FIXTURE.real);
    await globeReady(page);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
    const clip = await south(page);
    const a = await shot(page, clip); await page.waitForTimeout(1200);
    expect(same(a, await shot(page, clip))).toBe(true);
  });
});

test.describe('capturas (1440, 1024, 768 y 390)', () => {
  for (const [w, h, m] of [[1440, 900, false], [1024, 768, false], [768, 1024, true], [390, 844, true]]) {
    test(`${w} × ${h}`, async ({ browser }, info) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: m, hasTouch: m });
      const page = await ctx.newPage();
      await open(page, FIXTURE.real);
      await globeReady(page);
      await page.waitForTimeout(1500);
      for (const hash of Object.values(VIEWS)) expect(await (await go(page, hash), noHorizontalScroll(page)), hash).toBe(true);
      await go(page, VIEWS.briefing);
      await page.screenshot({ path: info.outputPath(`orbita-${w}.png`) });
      expect(await csp(page)).toEqual([]);
      await ctx.close();
    });
  }
});
