// Mapa del 08/11 (órdenes de dirección): desplegables que se cierran fuera y con Esc, bolitas
// WebGL de todos los países del mismo tamaño, España en gris, panel de país al pasar o tocar,
// solo sus rayas iluminadas, y 0 violaciones de CSP / Trusted Types.
// Fixture: map.json REAL publicado el 08/11 18:04 UTC (España sin IPs en el top 3000 de DShield).
import { test, expect } from '@playwright/test';
import { open, csp, globeReady } from './helpers.mjs';

const FX = 'real-2026-11-08-mapa';
const zone = (page) => page.locator('#globe-zone');
const flyTo = (page, lat, lon) => page.evaluate(async ([a, b]) => (await import('/assets/js/globe.js')).flyTo(a, b), [lat, lon]);

/** Pasa el ratón en espiral alrededor del centro del globo hasta que haya un país enfocado. */
async function hoverAnyDot(page) {
  const box = await page.locator('#globe').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (let r = 0; r <= 90; r += 5) {
    for (let k = 0; k < Math.max(1, r); k += 3) {
      const a = (k / Math.max(1, r)) * 2 * Math.PI;
      await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
      if (await page.evaluate(() => !!document.getElementById('globe-zone').dataset.focus)) return true;
    }
  }
  return false;
}

test.describe('desplegables: fuentes y ⓘ', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const [name, sel] of [['fuentes', '.srcs'], ['ⓘ del mapa', '#map-infobox']]) {
    test(`${name}: aria-expanded, se cierra con Esc (foco al botón) y con un clic fuera`, async ({ page }) => {
      await open(page, FX);
      const det = page.locator(sel), sum = det.locator('summary');
      await expect(sum).toHaveAttribute('aria-expanded', 'false');
      await sum.click();
      await expect(det).toHaveAttribute('open', '');
      await expect(sum).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(det).not.toHaveAttribute('open', '');
      await expect(sum).toHaveAttribute('aria-expanded', 'false');
      await expect(sum).toBeFocused();                                       // el foco vuelve al botón
      await sum.click();
      await expect(det).toHaveAttribute('open', '');
      await page.mouse.click(5, 880);                                        // clic fuera
      await expect(det).not.toHaveAttribute('open', '');
      await expect(sum).toHaveAttribute('aria-expanded', 'false');
      await sum.click();                                                     // y se vuelve a abrir
      await expect(det).toHaveAttribute('open', '');
      expect(await csp(page)).toEqual([]);
    });
  }
});

test.describe('bolitas y panel de país · escritorio', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('todas las bolitas son WebGL (sin nodos DOM por país) y entran todos los países', async ({ page }) => {
    const errors = await open(page, FX);
    expect(await globeReady(page)).toContain('is-globe');
    await expect.poll(async () => Number(await zone(page).getAttribute('data-dots')), { timeout: 10_000 }).toBeGreaterThan(150);
    expect(await page.locator('#globe .gm__dot').count()).toBe(0);          // sin foco: ninguna bolita DOM
    expect(await page.locator('#globe .gm').count()).toBeLessThanOrEqual(6); // solo las etiquetas
    // Ocultación por solape: al acercar, se ven más bolitas que a la altitud por defecto
    const d0 = Number(await zone(page).getAttribute('data-dots'));
    await page.getByRole('button', { name: 'Acercar' }).click();
    await page.getByRole('button', { name: 'Acercar' }).click();
    await expect.poll(async () => Number(await zone(page).getAttribute('data-dots')), { timeout: 5000 }).toBeGreaterThan(d0);
    expect(await csp(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('España sin datos de DShield: bolita gris, «Actividad baja», «Fuera de las N IPs más activas» y sus rayas de Radar', async ({ page }) => {
    await open(page, FX);
    await globeReady(page);
    await page.evaluate(async () => (await import('/assets/js/globe.js')).focusCountry('ES'));
    const tip = page.locator('#globe-tip');
    await expect(tip).toContainText('España');
    await expect(tip).toContainText('Actividad baja');
    await expect(tip).toContainText('Fuera de las 3000 IPs más activas de DShield hoy');
    await expect(tip).not.toContainText('Sin actividad');
    await expect(tip).not.toContainText('DShield:');                         // no se inventa nada
    await expect(tip).toContainText('Destinos (Radar): Estados Unidos 43,6 %');
    await expect(tip).toContainText('Dentro del país (Radar): 22,0 %');
    await expect(zone(page)).toHaveAttribute('data-focus', 'ES');
    await expect(page.locator('#globe .gm--hot.gm--none')).toHaveCount(1);  // bolita grande, gris
    expect(await csp(page)).toEqual([]);
  });

  test('hover: se para el giro, sale el panel y la bolita crece; al salir se cierra y vuelve a girar', async ({ page }) => {
    await open(page, FX);
    await globeReady(page);
    await flyTo(page, 51, 5);                                                // Europa: muchas bolitas
    await page.waitForTimeout(950);
    expect(await hoverAnyDot(page)).toBe(true);
    await expect(zone(page)).toHaveAttribute('data-spin', 'off');
    await expect(page.locator('#globe-tip .gpan__t')).toHaveCount(1);
    await expect(page.locator('#globe .gm--hot')).toHaveCount(1);
    await page.mouse.move(5, 5);
    await expect(zone(page)).toHaveAttribute('data-focus', '');
    await expect(page.locator('#globe-tip')).toBeEmpty();
    await expect(zone(page)).toHaveAttribute('data-spin', 'on', { timeout: 3000 });
    expect(await csp(page)).toEqual([]);
  });

  test('ranking: enfocar un país con el teclado muestra su panel', async ({ page }) => {
    await open(page, FX);
    await globeReady(page);
    await page.locator('.cc__b').first().focus();
    await expect(page.locator('#globe-tip')).toContainText('IPs activas');
    await expect(page.locator('#globe-tip')).toContainText('Actividad alta');
    await page.keyboard.press('Tab');
    await page.locator('body').focus();
  });
});

test.describe('bolitas y panel de país · móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('un toque abre el panel y otro toque fuera lo cierra', async ({ page }) => {
    await open(page, FX);
    await globeReady(page);
    await flyTo(page, 40.2, -3.7);
    await page.waitForTimeout(950);
    const box = await page.locator('#globe').boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#globe-tip')).toContainText('España');
    await page.waitForTimeout(1500);
    await expect(zone(page)).toHaveAttribute('data-spin', 'off');             // fijo mientras está abierto
    await page.touchscreen.tap(20, 200);                                      // toque fuera del globo
    await expect(page.locator('#globe-tip')).toBeEmpty();
    expect(await csp(page)).toEqual([]);
  });
});
