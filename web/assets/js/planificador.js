/* =============================================================================
   planificador.js · reparto de «disparos» entre pares de ataque (Cloudflare Radar)
   Round-robin ponderado determinista, no aleatorio. Con T = suma de pesos, el k-ésimo disparo
   de un par de peso w tiene una ventana [floor((k−1)·T/w), ceil(k·T/w)) y un instante ideal
   (k−½)·T/w (ventanas Pfair). En cada turno dispara el par cuya ventana se cierra ya; si no
   hay ninguno, el que lleva más retraso respecto a su instante ideal. Así la proporción es
   exacta en cada ciclo de T disparos y los pares pequeños quedan repartidos de forma uniforme
   (el SWRR de nginx da la misma proporción pero deja huecos de hasta ~2·T/w).
   Sin estado global y sin DOM: lo usan el globo 3D y el globo SVG.
   ============================================================================= */

/* Peso fijo para un par de otro ámbito (scope ≠ null: % del tráfico de un país de origen, no
   del total mundial): el de un par del 0,5 % del total, por debajo del último par del top
   mundial (~0,57 %), así que nunca dispara más que un par global real. */
export const PESO_OTRO_AMBITO = 0.5;

/** Peso de un par: su share si es del total mundial; si es de otro ámbito, el peso fijo. */
export const pesoDe = (p) => (p.scope == null ? p.share : PESO_OTRO_AMBITO);

const EPS = 1e-9;

/**
 * Planificador sobre `pares` ({ from_cc, to_cc, share, scope? }). Descarta los pares sin peso
 * positivo. siguiente() devuelve el par al que le toca disparar, o null si no hay ninguno.
 */
export function crearPlanificador(pares) {
  const fuentes = [];
  let total = 0;
  for (const p of pares || []) {
    const w = pesoDe(p);
    if (!(w > 0) || !Number.isFinite(w)) continue;
    fuentes.push({ par: p, w, k: 1 });
    total += w;
  }
  for (const f of fuentes) f.paso = total / f.w;      // disparos entre dos del mismo par
  let t = 0;                                           // turno actual
  const abre = (f) => Math.floor((f.k - 1) * f.paso + EPS);
  const cierra = (f) => Math.ceil(f.k * f.paso - EPS);
  const ideal = (f) => (f.k - 0.5) * f.paso;
  const antes = (a, b) => {                            // ¿a dispara antes que b?
    const ua = cierra(a) <= t + 1, ub = cierra(b) <= t + 1;
    if (ua !== ub) return ua;
    if (ua && cierra(a) !== cierra(b)) return cierra(a) < cierra(b);
    return ideal(a) < ideal(b) - EPS;
  };
  return {
    size: fuentes.length,
    siguiente() {
      let best = null;
      for (const f of fuentes) if (abre(f) <= t && (!best || antes(f, best))) best = f;
      if (!best) for (const f of fuentes) if (!best || ideal(f) < ideal(best)) best = f;   // redondeo
      if (!best) return null;
      best.k++;
      t++;
      return best.par;
    },
  };
}
