// ─────────────────────────────────────────────────────────────────────────────
// disparo.js · lanza el workflow radar.yml por la API de GitHub (workflow_dispatch)
//
// Sin dependencias: fetch del runtime. Se prueba con `node --test tests/unit/cron.test.mjs`.
// El token NUNCA se escribe en el log: solo se registran el estado y el cuerpo de la respuesta.
// ─────────────────────────────────────────────────────────────────────────────

export const REPO = "Adrian-Lopez-Olaria/zerohour";
export const WORKFLOW = "radar.yml";
export const URL_DISPATCH =
  `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;

// Cron (UTC) → modo del workflow. Los mismos crons que el respaldo en radar.yml.
export const MODOS = Object.freeze({
  "0 5 * * *": "daily",      // 06:00 en invierno / 07:00 en verano (hora de España)
  "41 */3 * * *": "map",     // cada 3 h, alineado con el schedule de GitHub
});

export const ESPERA_MS = 20_000;          // un solo reintento, a los ~20 s
export const ESPERA_MAX_MS = 5 * 60_000;  // un Retry-After mayor no se espera: lo cubre el respaldo
const MAX_CUERPO = 500;

/** Retry-After en segundos o como fecha HTTP → milisegundos (null si no viene o no se entiende). */
export function retryAfterMs(valor, ahora = Date.now()) {
  if (valor == null || valor === "") return null;
  const s = String(valor).trim();
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : Math.max(0, t - ahora);
}

const transitorio = (estado) => estado === 429 || (estado >= 500 && estado <= 599);

async function cuerpo(res) {
  try {
    return (await res.text()).slice(0, MAX_CUERPO);
  } catch {
    return "(sin cuerpo)";
  }
}

/**
 * Lanza radar.yml en `modo`. Devuelve true si GitHub responde 204.
 * Reintenta UNA vez, y solo ante error de red, 5xx o 429 (respetando Retry-After).
 * 401, 403, 404, 422… solo se registran: reintentar no los arregla.
 */
export async function disparar(modo, token, {
  fetchImpl = fetch,
  esperar = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console,
} = {}) {
  if (!token) {
    log.error("zerohour-cron: falta el secret GITHUB_TOKEN; no se lanza nada");
    return false;
  }
  const peticion = {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "zerohour-cron",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { mode: modo } }),
  };

  for (let intento = 1; intento <= 2; intento++) {
    let espera = ESPERA_MS;
    try {
      const res = await fetchImpl(URL_DISPATCH, peticion);
      if (res.status === 204) {
        log.log(`zerohour-cron: ${modo} lanzado (204, intento ${intento})`);
        return true;
      }
      log.error(`zerohour-cron: ${modo} → HTTP ${res.status} (intento ${intento}): ${await cuerpo(res)}`);
      if (!transitorio(res.status)) return false;
      const ra = retryAfterMs(res.headers?.get?.("retry-after"));
      if (ra != null) espera = Math.max(ESPERA_MS, ra);
    } catch (e) {
      log.error(`zerohour-cron: ${modo} → error de red (intento ${intento}): ${e?.name ?? "Error"}: ${e?.message ?? e}`);
    }
    if (intento === 2) break;
    if (espera > ESPERA_MAX_MS) {
      log.error(`zerohour-cron: ${modo} → Retry-After de ${Math.round(espera / 1000)} s; no se reintenta (queda el schedule de GitHub)`);
      return false;
    }
    await esperar(espera);
  }
  return false;
}
