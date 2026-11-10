// Worker planificador zerohour-cron: disparo de radar.yml con fetch simulado (no toca GitHub).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import worker from "../../cron/src/index.js";
import { disparar, retryAfterMs, MODOS, URL_DISPATCH, ESPERA_MS } from "../../cron/src/disparo.js";

const TOKEN = "TOKEN-FALSO-SOLO-PARA-EL-TEST-0123456789";   // no es un token real

function respuesta(status, cuerpo = "", cabeceras = {}) {
  return new Response(status === 204 ? null : cuerpo, { status, headers: cabeceras });
}

/** fetch falso que devuelve (o lanza) lo de `guion` en orden y apunta cada llamada. */
function simulado(...guion) {
  const llamadas = [];
  const fetchImpl = async (url, opts) => {
    llamadas.push({ url, opts });
    const paso = guion[llamadas.length - 1];
    if (paso instanceof Error) throw paso;
    return paso;
  };
  const esperas = [];
  const lineas = [];
  const log = { log: (m) => lineas.push(String(m)), error: (m) => lineas.push(String(m)) };
  return { fetchImpl, esperar: async (ms) => { esperas.push(ms); }, log, llamadas, esperas, lineas };
}

test("204: una sola llamada, con la petición que pide GitHub", async () => {
  const s = simulado(respuesta(204));
  assert.equal(await disparar("daily", TOKEN, s), true);
  assert.equal(s.llamadas.length, 1);
  const { url, opts } = s.llamadas[0];
  assert.equal(url, "https://api.github.com/repos/Adrian-Lopez-Olaria/zerohour/actions/workflows/radar.yml/dispatches");
  assert.equal(url, URL_DISPATCH);
  assert.equal(opts.method, "POST");
  assert.equal(opts.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(opts.headers.Accept, "application/vnd.github+json");
  assert.match(opts.headers["X-GitHub-Api-Version"], /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(opts.headers["User-Agent"], "zerohour-cron");
  assert.deepEqual(JSON.parse(opts.body), { ref: "main", inputs: { mode: "daily" } });
  assert.deepEqual(s.esperas, []);
});

for (const estado of [401, 403, 404, 422]) {
  test(`${estado}: se registra y NO se reintenta`, async () => {
    const s = simulado(respuesta(estado, '{"message":"Bad credentials"}'));
    assert.equal(await disparar("map", TOKEN, s), false);
    assert.equal(s.llamadas.length, 1);
    assert.deepEqual(s.esperas, []);
    assert.ok(s.lineas.some((l) => l.includes(`HTTP ${estado}`) && l.includes("Bad credentials")));
  });
}

for (const estado of [500, 502, 503, 429]) {
  test(`${estado}: un único reintento a los ~20 s`, async () => {
    const s = simulado(respuesta(estado, "fallo"), respuesta(204));
    assert.equal(await disparar("map", TOKEN, s), true);
    assert.equal(s.llamadas.length, 2);
    assert.deepEqual(s.esperas, [ESPERA_MS]);
    assert.ok(ESPERA_MS >= 15_000 && ESPERA_MS <= 30_000);
  });
}

test("error de red: un reintento; si vuelve a fallar, no hay un tercero", async () => {
  const s = simulado(new TypeError("Network connection lost"), respuesta(503, "no"));
  assert.equal(await disparar("daily", TOKEN, s), false);
  assert.equal(s.llamadas.length, 2);
  assert.deepEqual(s.esperas, [ESPERA_MS]);
});

test("429 con Retry-After: se respeta (segundos y fecha HTTP)", async () => {
  const s = simulado(respuesta(429, "slow down", { "retry-after": "60" }), respuesta(204));
  assert.equal(await disparar("map", TOKEN, s), true);
  assert.deepEqual(s.esperas, [60_000]);
  assert.equal(retryAfterMs("Wed, 11 Nov 2026 05:01:00 GMT", Date.parse("2026-11-11T05:00:00Z")), 60_000);
  assert.equal(retryAfterMs("5"), 5_000);                    // nunca menos de ~20 s: lo aplica disparar
  assert.equal(retryAfterMs("basura"), null);
});

test("Retry-After desmesurado: no se espera ni se reintenta (queda el respaldo de GitHub)", async () => {
  const s = simulado(respuesta(429, "", { "retry-after": "3600" }), respuesta(204));
  assert.equal(await disparar("map", TOKEN, s), false);
  assert.equal(s.llamadas.length, 1);
  assert.deepEqual(s.esperas, []);
});

test("el token nunca aparece en el log", async () => {
  const s = simulado(respuesta(500, "Internal error"), new Error("caída"));
  await disparar("daily", TOKEN, s);
  assert.ok(s.lineas.length >= 2);
  for (const l of s.lineas) assert.ok(!l.includes(TOKEN) && !l.includes("github_pat_"), l);
});

test("sin secret: no llama a GitHub", async () => {
  const s = simulado(respuesta(204));
  assert.equal(await disparar("daily", undefined, s), false);
  assert.equal(s.llamadas.length, 0);
});

test("fetch del Worker: 404 siempre, sin lanzar nada", async () => {
  const res = await worker.fetch(new Request("https://zerohour-cron.example/dispatch?mode=daily", { method: "POST" }), {});
  assert.equal(res.status, 404);
});

test("scheduled: cron desconocido no lanza nada", async () => {
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; return respuesta(204); };
  const errorOriginal = console.error;
  console.error = () => {};
  try {
    await worker.scheduled({ cron: "* * * * *" }, { GITHUB_TOKEN: TOKEN });
    assert.equal(llamadas, 0);
  } finally {
    globalThis.fetch = original;
    console.error = errorOriginal;
  }
});

test("scheduled: cada cron lanza su modo con el secret del entorno", async () => {
  const original = globalThis.fetch;
  const cuerpos = [];
  globalThis.fetch = async (_u, o) => { cuerpos.push(JSON.parse(o.body).inputs.mode); return respuesta(204); };
  const logOriginal = console.log;
  console.log = () => {};
  try {
    await worker.scheduled({ cron: "0 5 * * *" }, { GITHUB_TOKEN: TOKEN });
    await worker.scheduled({ cron: "41 */3 * * *" }, { GITHUB_TOKEN: TOKEN });
    assert.deepEqual(cuerpos, ["daily", "map"]);
  } finally {
    globalThis.fetch = original;
    console.log = logOriginal;
  }
});

test("los crons del Worker son los del respaldo en radar.yml y los de cron/wrangler.jsonc", () => {
  assert.deepEqual(MODOS, { "0 5 * * *": "daily", "41 */3 * * *": "map" });
  const conf = JSON.parse(readFileSync(new URL("../../cron/wrangler.jsonc", import.meta.url), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"));
  assert.deepEqual(conf.triggers.crons, Object.keys(MODOS));
  const yml = readFileSync(new URL("../../.github/workflows/radar.yml", import.meta.url), "utf8");
  assert.match(yml, /- cron: "41 \*\/3 \* \* \*"/);   // mapa: mismo cron que el Worker
  assert.match(yml, /- cron: "17 5 \* \* \*"/);       // diario: respaldo 17 min después del Worker
});
