// Disparos de las rayas de Cloudflare Radar (planificador.js): corren con el globo visible, se
// paran del todo con reducir movimiento, con la pestaña oculta o fuera de pantalla, y no
// producen violaciones de CSP ni errores. Datos reales del 04/11 (28 pares).
import { test, expect } from '@playwright/test';
import { open, csp, globeReady, FIXTURE } from './helpers.mjs';

const zone = (page) => page.locator('#globe-zone');
const fired = async (page) => Number(await zone(page).getAttribute('data-shots')) || 0;

/** Disparos en una ventana medida con el reloj de la propia página (el del runner, con carga, no vale). */
const rate = (page, ms) => page.evaluate((w) => new Promise((res) => {
  const z = document.getElementById('globe-zone'), n0 = Number(z.dataset.shots) || 0, t0 = performance.now();
  setTimeout(() => res({ n: (Number(z.dataset.shots) || 0) - n0, dt: performance.now() - t0 }), w);
}), ms);

/** Ritmo: nunca más rápido que 1 cada `every` ms (±1 por el borde de la ventana) y al menos el 50 %. */
function expectRate({ n, dt }, every) {
  expect(n).toBeLessThanOrEqual(Math.floor(dt / every) + 1);
  expect(n).toBeGreaterThanOrEqual(Math.floor((dt / every) * 0.5));
}

async function setHidden(page, hidden) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('disparos · escritorio', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('disparan a ~1 cada 300 ms, con la frecuencia explicada en el panel ⓘ, sin violaciones ni errores', async ({ page }) => {
    const errors = await open(page, FIXTURE.orbita);
    expect(await globeReady(page)).toContain('is-globe');
    await expect(zone(page)).toHaveAttribute('data-disparos', 'on');
    await expect(page.locator('#map-info')).toContainText('Cada raya sale con una frecuencia proporcional a su %.', { useInnerText: false });
    expectRate(await rate(page, 3000), 300);
    expect(await csp(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('pestaña oculta: el planificador se para y no dispara; al volver, sigue', async ({ page }) => {
    await open(page, FIXTURE.orbita);
    await globeReady(page);
    await expect(zone(page)).toHaveAttribute('data-disparos', 'on');
    await setHidden(page, true);
    await expect(zone(page)).toHaveAttribute('data-disparos', 'off');
    const a = await fired(page);
    await page.waitForTimeout(1500);
    expect(await fired(page)).toBe(a);
    await setHidden(page, false);
    await expect(zone(page)).toHaveAttribute('data-disparos', 'on');
  });
});

test.describe('disparos · reducir movimiento', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

  test('sin disparos: rayas estáticas y sin la frase de frecuencia', async ({ page }) => {
    const errors = await open(page, FIXTURE.orbita);
    await globeReady(page);
    await page.waitForTimeout(1500);
    await expect(zone(page)).toHaveAttribute('data-disparos', 'off');
    expect(await fired(page)).toBe(0);
    await expect(page.locator('#map-info')).toContainText('Se muestran quietas.', { useInnerText: false });
    expect(await csp(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('disparos · móvil 390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('~1 cada 500 ms; fuera de pantalla se para', async ({ page }) => {
    await open(page, FIXTURE.orbita);
    await globeReady(page);
    await expect(zone(page)).toHaveAttribute('data-disparos', 'on');
    expectRate(await rate(page, 3000), 500);
    // Fuera de pantalla: se baja hasta que el globo queda entero por encima de la ventana
    await page.evaluate(() => { const r = document.getElementById('globe-zone').getBoundingClientRect(); window.scrollBy(0, r.bottom + 50); });
    await expect(zone(page)).toHaveAttribute('data-disparos', 'off');
  });
});

test.describe('disparos · globo SVG de respaldo', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('mismo planificador, como mucho 6 rayas a la vez y 0 violaciones', async ({ page }) => {
    await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
    const errors = await open(page, FIXTURE.orbita);
    expect(await globeReady(page)).toContain('is-flat');
    await expect(zone(page)).toHaveAttribute('data-disparos', 'on');
    let max = 0;
    for (let i = 0; i < 12; i++) {
      max = Math.max(max, await page.locator('#globe-flat path.gp-arc').count());
      await page.waitForTimeout(250);
    }
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(6);
    expect(await fired(page)).toBeGreaterThanOrEqual(4);
    expect(await csp(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
