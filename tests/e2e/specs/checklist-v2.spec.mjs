// Checklist del punto 13 de design/zerohour-cambios-v2.md, automatizada.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { open, go, globeReady, noHorizontalScroll, FIXTURE, VIEWS } from './helpers.mjs';

const bottoms = (page, sels) => page.evaluate((ss) => ss.map((s) => Math.round(document.querySelector(s).getBoundingClientRect().bottom)), sels);

test.describe('§13 · escritorio', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('1440 × 900: contadores, top 10 completo, mapa y radar caben sin scroll', async ({ page }) => {
    await open(page, FIXTURE.normal);                     // 4 grupos de veredicto: el caso más alto
    expect(await page.locator('#panel-top li').count()).toBe(10);
    for (const y of await bottoms(page, ['.kpis', '#panel-top', '.mapp', '.radarp'])) expect(y).toBeLessThanOrEqual(900);
  });

  test('cabecera y franja opacas y fijas: no se transparenta nada al hacer scroll', async ({ page }) => {
    await open(page, FIXTURE.normal);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const opaque = (s) => { const c = getComputedStyle(document.querySelector(s)).backgroundColor; return /^rgb\(/.test(c) || /,\s*1\)$/.test(c); };
      const top = document.querySelector('.top').getBoundingClientRect();
      const hit = document.elementFromPoint(700, top.bottom - 4);
      return { scrolled: scrollY > 0, sticky: getComputedStyle(document.querySelector('.top')).position, hdr: opaque('.hdr'), strip: opaque('.strip'), onTop: !!hit && !!hit.closest('.top'), filter: getComputedStyle(document.querySelector('.hdr')).backdropFilter };
    });
    expect(r).toEqual({ scrolled: true, sticky: 'sticky', hdr: true, strip: true, onTop: true, filter: 'none' });
  });

  // Labels sin solaparse: rectángulos de los .gm__lbl / .ff-lbl visibles, dos a dos
  const overlaps = (page, sel) => page.evaluate((s) => {
    const r = [...document.querySelectorAll(s)].map((l) => l.getBoundingClientRect()).filter((x) => x.width);
    let n = 0;
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const a = r[i], c = r[j];
      if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) n++;
    }
    return { labels: r.length, overlap: n };
  }, sel);
  const fixtureCountries = (page) => page.evaluate(async () => new Set((await (await fetch('fixtures/normal.json')).json()).map.points.map((p) => p.cc)).size);

  test('mapa: un marcador por país (vista plana, que los pinta todos) y etiquetas sin solaparse', async ({ page }) => {
    await page.route('**/assets/vendor/globe.gl-*.js', (r) => r.abort());
    await open(page, FIXTURE.normal);
    expect(await globeReady(page)).toContain('is-flat');
    expect(await page.locator('.ff-dot').count()).toBe(await fixtureCountries(page));
    const o = await overlaps(page, '.ff-lbl');
    expect(o.labels).toBeGreaterThan(0);
    expect(o.labels).toBeLessThanOrEqual(6);
    expect(o.overlap).toBe(0);
  });

  test('mapa: en el globo, ningún país repetido y etiquetas sin solaparse', async ({ page }) => {
    // El CSS2DRenderer de globe.gl solo mete en el DOM los marcadores que han estado a la vista
    await open(page, FIXTURE.normal);
    expect(await globeReady(page)).toContain('is-globe');
    const ccs = await page.locator('.gm__lbl').evaluateAll((ls) => ls.map((l) => l.firstChild.textContent));
    expect(new Set(ccs).size).toBe(ccs.length);
    expect(await page.locator('.gm').count()).toBeLessThanOrEqual(await fixtureCountries(page));
    const o = await overlaps(page, '.gm__lbl');
    expect(o.labels).toBeLessThanOrEqual(6);
    expect(o.overlap).toBe(0);
  });

  test('mapa: zoom con los botones y con Ctrl + rueda; la rueda sola hace scroll de la página', async ({ page }) => {
    await open(page, FIXTURE.normal);
    await globeReady(page);
    const canvas = page.locator('#globe canvas');
    await page.getByRole('button', { name: 'Alejar' }).click();          // también para el autogiro
    await page.waitForTimeout(800);
    const a = await canvas.screenshot();
    await page.getByRole('button', { name: 'Acercar' }).click();
    await page.waitForTimeout(800);
    const b = await canvas.screenshot();
    expect(Buffer.compare(a, b)).not.toBe(0);

    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const y0 = await page.evaluate(() => scrollY);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -400);
    await page.keyboard.up('Control');
    await page.waitForTimeout(800);
    const c = await canvas.screenshot();
    expect(Buffer.compare(b, c)).not.toBe(0);                            // Ctrl + rueda: zoom
    expect(await page.evaluate(() => scrollY)).toBe(y0);                 // y la página no se mueve

    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(y0);      // rueda sola: scroll
  });

  test('mapa: la vista plana también hace zoom', async ({ page }) => {
    await page.route('**/assets/vendor/globe.gl-*.js', (r) => r.abort());
    await open(page, FIXTURE.normal);
    expect(await globeReady(page)).toContain('is-flat');
    const vb = () => page.locator('#globe-flat svg').getAttribute('viewBox');
    const v0 = await vb();
    await page.getByRole('button', { name: 'Acercar' }).click();
    expect(await vb()).not.toBe(v0);
    await page.getByRole('button', { name: 'Restablecer la vista' }).click();
    expect(await vb()).toBe(v0);
  });

  test('radar: ningún sector con nombre de CNA; sin fabricante → «SIN FABRICANTE»', async ({ page }) => {
    await open(page, FIXTURE.real);
    const r = await page.evaluate(async () => {
      const b = await (await fetch('fixtures/real-2026-10-31-fase6.json')).json();
      const top = b.latest.cves.filter((c) => b.latest.top.includes(c.id));
      const cnaOnly = new Set(top.filter((c) => !c.vendor && c.cna).map((c) => c.cna.toUpperCase().slice(0, 9)));
      const vendors = new Set(top.filter((c) => c.vendor).map((c) => c.vendor.toUpperCase().slice(0, 9)));
      const labels = [...document.querySelectorAll('.radar__lbl')].map((t) => t.textContent);
      return { cnaSectors: labels.filter((l) => cnaOnly.has(l) && !vendors.has(l)), none: labels.includes('SINFABRICANTE'), hasCnaOnly: cnaOnly.size > 0 };
    });
    expect(r.hasCnaOnly).toBe(true);
    expect(r.cnaSectors).toEqual([]);
    expect(r.none).toBe(true);
  });

  test('compatibilidad: un vendor antiguo «CNA · x» se muestra como fabricante pendiente', async ({ page }) => {
    await page.route('**/fixtures/normal.json', async (route) => {
      const res = await route.fetch(); const b = await res.json();
      b.latest.top[0].vendor = 'CNA · vuldb.com'; b.latest.top[0].product = '';
      await route.fulfill({ response: res, json: b });
    });
    await open(page, FIXTURE.normal);
    await expect(page.locator('#panel-top li').first()).toContainText('Fabricante pendiente en NVD · CNA vuldb.com');
    expect(await page.locator('.radar__lbl', { hasText: /VULDB/ }).count()).toBe(0);
  });

  test('ficha: «Qué hacer» aparece primero y el desglose sale de scoring_weights', async ({ page }) => {
    await open(page, FIXTURE.real, '#cve');
    const r = await page.evaluate(async () => {
      const b = await (await fetch('fixtures/real-2026-10-31-fase6.json')).json();
      return {
        first: document.querySelector('.det-col .panel .panel__title').textContent,
        rows: document.querySelectorAll('.breakdown .bd').length,
        keys: Object.keys(b.latest.scoring_weights).length,
      };
    });
    expect(r.first).toBe('Qué hacer');
    expect(r.rows).toBe(r.keys);
  });

  test('día vacío: sin deltas, top y radar vacíos con su texto', async ({ page }) => {
    await open(page, FIXTURE.vacio);
    expect(await page.locator('.kpi__d').count()).toBe(0);
    await expect(page.locator('#panel-top')).toContainText('Nada que priorizar todavía');
    await expect(page.locator('.radarp')).toContainText('Sin contactos');
    await expect(page.locator('.sum')).toContainText('Sin datos de NVD para hoy todavía');
  });

  test('contraste AA y accesibilidad (axe, WCAG 2.1 A/AA) en las 4 vistas', async ({ page }) => {
    await open(page, FIXTURE.real);
    for (const hash of Object.values(VIEWS)) {
      await go(page, hash);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('#globe').analyze();
      expect(violations.map((v) => `${hash} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    }
  });

  test('severidad: barras de color y texto neutro; veredicto con forma propia', async ({ page }) => {
    await open(page, FIXTURE.normal);
    const r = await page.evaluate(() => {
      const t2 = getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim();
      const sev = [...document.querySelectorAll('#panel-top .sev')].map((s) => getComputedStyle(s).color);
      const shapes = [...new Set([...document.querySelectorAll('.vdist .vtag')].map((v) => { const b = getComputedStyle(v, '::before'); return `${b.backgroundImage}|${b.backgroundColor}|${b.borderRadius}`; }))];
      const probe = document.createElement('span'); probe.style.color = t2; document.body.append(probe);
      const neutral = getComputedStyle(probe).color; probe.remove();
      return { allNeutral: sev.every((c) => c === neutral), shapes: shapes.length };
    });
    expect(r.allNeutral).toBe(true);
    expect(r.shapes).toBe(4);                               // ■ ◧ □ ○: cuatro formas distintas
  });
});

test.describe('§13 · sin scroll horizontal', () => {
  for (const [w, h] of [[1024, 768], [768, 1024], [380, 800]]) {
    test(`${w} × ${h}: ninguna vista desborda`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page, FIXTURE.real);
      for (const hash of Object.values(VIEWS)) {
        await go(page, hash);
        expect(await noHorizontalScroll(page), hash).toBe(true);
      }
    });
  }
});

test.describe('§13 · móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('cabecera, franja, contadores y las 5 primeras del top en pantalla y media', async ({ page }) => {
    await open(page, FIXTURE.normal);
    const visible = page.locator('#panel-top li:visible');
    expect(await visible.count()).toBe(5);
    const fifth = await visible.nth(4).boundingBox();
    expect(fifth.y + fifth.height).toBeLessThanOrEqual(844 * 1.5);
    for (const y of await bottoms(page, ['.top', '.kpis'])) expect(y).toBeLessThan(fifth.y);
  });

  test('«Ver las 10» funciona con teclado y avisa a los lectores de pantalla', async ({ page }) => {
    await open(page, FIXTURE.normal);
    const btn = page.getByRole('button', { name: 'Ver las 10' });
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toHaveAttribute('aria-controls', 'top-rows');
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#panel-top li:visible')).toHaveCount(10);
    await expect(page.getByRole('button', { name: 'Ver solo las 5 primeras' })).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate(() => document.activeElement.getAttribute('aria-label'))).toMatch(/^6\. CVE-/);
  });

  test('fuente caída: el desplegable de fuentes en rojo y el aviso visible', async ({ page }) => {
    await open(page, FIXTURE.error);
    await expect(page.locator('details.srcs.has-err summary')).toHaveText(/2 FUENTES CON ERROR/);
    await expect(page.locator('#alerts .alert')).toHaveCount(2);
    await expect(page.locator('#alerts .alert').first()).toBeVisible();
  });

  test('contraste AA (axe) en móvil', async ({ page }) => {
    await open(page, FIXTURE.real);
    for (const hash of Object.values(VIEWS)) {
      await go(page, hash);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).exclude('#globe').analyze();
      expect(violations.map((v) => `${hash} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    }
  });
});

test.describe('§13 · movimiento reducido', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

  test('prefers-reduced-motion: nada se mueve (ni animaciones CSS, ni autogiro, ni ondas)', async ({ page }) => {
    await open(page, FIXTURE.normal);
    await globeReady(page);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
    const canvas = page.locator('#globe canvas');
    const a = await canvas.screenshot();
    await page.waitForTimeout(1200);
    expect(Buffer.compare(a, await canvas.screenshot())).toBe(0);
  });
});
