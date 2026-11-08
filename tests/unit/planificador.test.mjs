// Planificador de disparos (SWRR). Se ejecuta con: node --test tests/unit/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPlanificador, pesoDe } from '../../web/assets/js/planificador.js';

const par = (from_cc, to_cc, share) => ({ from_cc, to_cc, share });
const clave = (p) => `${p.from_cc}>${p.to_cc}`;

function disparar(pares, n) {
  const pl = crearPlanificador(pares);
  return Array.from({ length: n }, () => clave(pl.siguiente()));
}

const PARES = [par('CN', 'US', 50), par('US', 'FR', 2), par('DE', 'GB', 1)];
const PESOS = { 'CN>US': 50, 'US>FR': 2, 'DE>GB': 1 };
const TOTAL = 53;

test('50/2/1 en 530 disparos: recuentos exactos 500/20/10', () => {
  const cuenta = {};
  for (const k of disparar(PARES, 530)) cuenta[k] = (cuenta[k] || 0) + 1;
  assert.deepEqual(cuenta, { 'CN>US': 500, 'US>FR': 20, 'DE>GB': 10 });
});

test('en cualquier prefijo, cada par a ±1 de lo esperado', () => {
  const cuenta = { 'CN>US': 0, 'US>FR': 0, 'DE>GB': 0 };
  disparar(PARES, 530).forEach((k, i) => {
    cuenta[k]++;
    for (const [c, w] of Object.entries(PESOS)) {
      const esperado = ((i + 1) * w) / TOTAL;
      assert.ok(Math.abs(cuenta[c] - esperado) <= 1, `prefijo ${i + 1}: ${c} = ${cuenta[c]}, esperado ${esperado.toFixed(2)}`);
    }
  });
});

test('los pares pequeños, repartidos de forma uniforme: hueco ≤ ceil(total/peso) + 1', () => {
  const serie = disparar(PARES, 530);
  for (const [c, w] of Object.entries(PESOS)) {
    const pos = serie.flatMap((k, i) => (k === c ? [i] : []));
    const hueco = Math.max(...pos.slice(1).map((p, i) => p - pos[i]));
    assert.ok(hueco <= Math.ceil(TOTAL / w) + 1, `${c}: hueco máximo ${hueco}`);
  }
});

test('intercala los pares: no hay rachas de un par pequeño', () => {
  const serie = disparar(PARES, 530);
  for (let i = 1; i < serie.length; i++) {
    if (serie[i] !== 'CN>US') assert.notEqual(serie[i], serie[i - 1], `racha de ${serie[i]} en ${i}`);
  }
});

test('el peso de un par es su share (todos son % del total mundial: sin campo scope)', () => {
  assert.equal(pesoDe(par('CN', 'US', 4.5)), 4.5);
  assert.equal(pesoDe({ ...par('ES', 'US', 2), scope: 'ES' }), 2);           // un scope heredado no cambia nada
  const pl = crearPlanificador([par('CN', 'US', 4.5), par('ES', 'US', 0.5)]);
  const cuenta = {};
  for (let i = 0; i < 500; i++) { const k = clave(pl.siguiente()); cuenta[k] = (cuenta[k] || 0) + 1; }
  assert.equal(cuenta['ES>US'], 50);
});

test('28 pares reales (04/11): proporción a ±1,5 en todo momento y todos los pares disparan', async () => {
  const fs = await import('node:fs');
  const fx = JSON.parse(fs.readFileSync(new URL('../fixtures/real-2026-11-04-orbita.json', import.meta.url), 'utf8'));
  const pares = (fx.map || fx).attack_pairs;
  const total = pares.reduce((t, p) => t + p.share, 0);
  const pl = crearPlanificador(pares), cuenta = new Map(pares.map((p) => [p, 0]));
  for (let i = 1; i <= 3000; i++) {
    const p = pl.siguiente();
    cuenta.set(p, cuenta.get(p) + 1);
    for (const [q, c] of cuenta) assert.ok(Math.abs(c - (i * q.share) / total) <= 1.5, `${clave(q)} en ${i}`);
  }
  assert.ok([...cuenta.values()].every((c) => c > 0));
});

test('sin pares válidos devuelve null; ignora shares no positivos o no numéricos', () => {
  assert.equal(crearPlanificador([]).siguiente(), null);
  assert.equal(crearPlanificador(null).siguiente(), null);
  const pl = crearPlanificador([par('US', 'US', 0), par('XX', 'YY', NaN), par('CN', 'US', 3)]);
  assert.equal(pl.size, 1);
  assert.equal(clave(pl.siguiente()), 'CN>US');
  assert.equal(clave(pl.siguiente()), 'CN>US');
});
