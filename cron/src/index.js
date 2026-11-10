// ─────────────────────────────────────────────────────────────────────────────
// zerohour-cron · Worker planificador, separado del de la web
//
// Cloudflare Cron Triggers → POST workflow_dispatch de radar.yml en GitHub. Llega a su hora; el
// schedule de GitHub (que se encola con horas de retraso) queda solo como respaldo, y el gate
// del workflow evita publicar dos veces.
//
// Sin endpoint HTTP: no tiene URL pública (workers_dev y preview_urls a false, sin rutas) y,
// aun así, cualquier petición recibe 404. Nadie puede lanzar runs desde fuera.
// El secret GITHUB_TOKEN (fine-grained, solo el repo zerohour, Actions: Read and write) solo
// existe en este Worker: la web pública no tiene acceso a él.
// ─────────────────────────────────────────────────────────────────────────────
import { MODOS, disparar } from "./disparo.js";

export default {
  async scheduled(controller, env) {
    const modo = MODOS[controller.cron];
    if (!modo) {
      console.error(`zerohour-cron: cron no previsto «${controller.cron}»; no se lanza nada`);
      return;
    }
    // Se espera aquí (no waitUntil): el reintento de ~20 s cabe en el tiempo de un Cron Trigger
    await disparar(modo, env.GITHUB_TOKEN);
  },

  async fetch() {
    return new Response("Not Found", { status: 404 });
  },
};
