# ZEROHOUR · Cambios de diseño v2

**Para:** desarrollo · **De:** diseño · **Fecha:** 02/11/2026

**Referencias:**
- `zerohour-prototipo-v2.html`: el prototipo funcional.
- `zerohour-estilo.md` v2: la guía, con las secciones cambiadas marcadas.

La web está programada y auditada, así que **esto no es un rediseño desde cero**: es una lista de cambios para aplicar sobre lo que ya hay. Cada punto dice **qué** cambia, **dónde** (archivo de producción según la estructura de `ordenes-desarrollo.md`) y **por qué**. Los nombres de clase son los del prototipo; si en producción se llaman distinto, mantened los vuestros.

---

## 0. Lo que NO cambia

- **Datos:**
  - El contrato de datos (`latest.json`, `map.json`, `index.json`). **No se ha inventado ningún campo.**
  - Los pesos (`scoring_weights`) y el cálculo del score.
- **Veredictos:** los cuatro, con sus textos (ACTUAR HOY / ESTA SEMANA / PLANIFICAR / VIGILAR), sus cortes (85 / 70 / 40) y el orden por urgencia.
- **Chips:** los 12 tags aprobados (`kev, ssvc, ransomware, exploit, deteccion, poc, stack, incibe, certeu, news, remote, library`), con **vuestros estilos de familia y relleno**. Los chips del prototipo son una aproximación: si no coinciden, gana producción. Solo cambian el tamaño, el máximo por fila y el orden (punto 7).
- **Identidad:** el nombre, el logo, el wordmark y las tres familias tipográficas.
- **Navegación:** las rutas, el atajo `/`, el selector de días con flechas y el visor de estados solo en desarrollo.
- **Seguridad:**
  - La CSP, `el()` / `safeUrl()`, el aviso de PoC y los `rel` de los enlaces.
  - No se añade ninguna librería.

---

## 1. Prioridades

Si no da tiempo a todo, este es el orden. Las tres primeras son las que Adrián nota cada mañana en el móvil.

| # | Cambio | Esfuerzo | Punto |
|---|---|---|---|
| 1 | Cabecera compacta y opaca, franja de edición de 32 px; se elimina el bloque de titular | Bajo | 3 |
| 2 | Top 10 compacto, agrupado por veredicto; en móvil 5 y «Ver las 10» | Medio | 5 |
| 3 | Mapa: un marcador por país, escala logarítmica, etiquetas sin solapes y zoom | Medio | 6 |
| 4 | Escritorio: rejilla del briefing en una pantalla (top · mapa · radar) | Medio | 4 |
| 5 | Paleta SOC y paneles planos (tokens y CSS, sin tocar JS) | Bajo | 2 |
| 6 | Radar más legible y con el reparto por veredicto | Bajo | 8 |
| 7 | Ficha: panel «Qué hacer» primero | Medio | 9 |
| 8 | Animaciones que sobran | Bajo | 11 |

---

## 2. Tokens y fondo → `assets/css/tokens.css`, `base.css`

**Qué:** sustituir los valores de `:root` por los de la v2. La tabla completa está en la guía (§2 y §3); el bloque listo para pegar es el `:root` del prototipo.

**Lo esencial:**
```css
--bg-0:#0A0E13; --bg-1:#10161D; --bg-2:#151D26; --bg-3:#1B2531;
--line-1:#1C2631; --line-2:#26323F; --line-3:#3A4859;
--text-1:#E6EBF1; --text-2:#AEB9C7; --text-3:#8A97A8;
--ok:#38D996; --warn:#F5B544; --fail:#FF5A6E; --info:#6CB6FF;
--v-hoy:#FF4F6D; --v-semana:#FF9940; --v-planificar:#E9D55B; --v-vigilar:#7F8FA3;
--fs-label:11px; --fs-chip:10px; --track-label:.08em; --radius:2px;
```

**Quitar del fondo:**
- La retícula, el grano (`feTurbulence`), la viñeta y el barrido del héroe.
- Las reglas laterales, las marcas de esquina (`--mark`, `--corner`) y los códigos de sección (`TOP-10`, `RDR-01`…).
- `body` queda con `background: var(--bg-0)` liso.

**Por qué:**
- Adrián pidió un aspecto «más profesional, estilo SOC».
- La decoración competía con los datos y daba aire de demo.
- Quitar el SVG de grano y los degradados a pantalla completa además alivia el pintado en móvil.

**Accesibilidad:** todos los textos cumplen AA sobre `--bg-1` (los ratios están en la guía). `--line-3` es solo decorativo.

---

## 3. Cabecera y franja de edición → `index.html`, `assets/css/` (cabecera), `render/briefing.js`

**Qué:**

1. **Cabecera (`.hdr`):**
   - 52 px (48 px en móvil), **opaca** (`background: var(--bg-1)`, sin `backdrop-filter` ni transparencia) y `sticky`.
   - Contenido: logo · navegación · UTC · local · LIVE.
2. **Franja de edición (`.strip`), nueva:** 32 px, sticky junto a la cabecera (las dos dentro de `.top`).
   - **Izquierda:** `LUN 02 NOV 2026 · EDICIÓN 13:47 · T+00:53:52`. En móvil, `02.11 · 13:47 · T+…`.
   - **Derecha, desde 1180 px:** las fuentes en línea (`● NVD OK`).
   - **Derecha, por debajo de 1180 px:** un `<details class="srcs">` con el resumen «11/11 FUENTES OK ▾» que despliega la lista. Si alguna falla, el resumen dice «N FUENTES CON ERROR» en `--fail`, y el aviso `.alert` se mantiene como ahora.
3. **Eliminar el bloque «SEC-01 BRIEFING + fecha + edición + T+».** Sus datos ya están en la franja.
4. **Eliminar el titular «2 EXPLOTADAS ACTIVAMENTE» y su párrafo.** El texto de `latest.summary` pasa al panel «Resumen del día», debajo del primer pantallazo (punto 4).
5. **Móvil:** la navegación pasa a una barra inferior fija de 58 px y 4 pestañas, como ya está.

**Por qué:**
- Petición literal de Adrián: «el bloque de fecha/edición/T+ ocupa demasiado» y «no me gusta el texto de 2 explotadas activamente».
- En las capturas reales, la cabecera translúcida dejaba ver el texto que pasaba por debajo.
- La barra de fuentes se cortaba en móvil.

**CSP:** `<details>` no necesita JS. Los contadores del resumen salen de `sources_status`, como ahora.

---

## 4. Rejilla del briefing → `assets/css/` (layout), `render/briefing.js`

**Qué:** el briefing en escritorio cabe en **1440 × 900 sin scroll**. Comprobado en el prototipo: el top 10 termina en y = 883.

```
┌──────────────────── CONTADORES (6 en una franja, 105 px) ────────────────────┐
├──────── TOP 10 (1,5 fr) ────────┬──── MAPA (1 fr) ────┬── RADAR (300 px) ───┤
│ grupos por veredicto            │ globo + zoom        │ radar + reparto     │
└─────────────────────────────────┴─────────────────────┴─────────────────────┘
── debajo del primer pantallazo ──
│ RESUMEN DEL DÍA + datos edición │ PAÍSES (top 10)     │ PUERTOS             │
│ AVISOS Y PRENSA                 │                     │                     │
```

```css
.brief { display:grid; gap:12px;
  grid-template-columns: minmax(0,1.5fr) minmax(0,1fr) 300px;
  grid-template-areas: "kpis kpis kpis" "top map radar"; }
.more  { grid-template-columns: minmax(0,1.5fr) minmax(0,1fr) 300px;
  grid-template-areas: "sum geo ports" "news geo ports"; }
```

| Ancho | Distribución |
|---|---|
| 761–1179 px | Contadores en 3 × 2 · top a todo el ancho · mapa y radar lado a lado |
| ≤ 760 px | Una columna: contadores (3 × 2 mini) → top → mapa (300 px) → radar → resumen → países → puertos → prensa |

**Contadores (`.kpis`):**
- Un solo `<dl>` con 6 celdas: CVE nuevas (2,1 fr, con barra de severidad y leyenda) · Críticas · Explotadas · KEV · Con PoC · Mi stack · Remotas.
- Cifra de 34 px (26 px en móvil).
- **En móvil:** sin deltas ni leyenda, y la etiqueta de KEV acortada a «KEV». La versión larga se queda para los lectores de pantalla.
- **Si `stats.new_cves === 0`:** no se pinta ningún delta (antes salía «▼ 100 %»).

**Por qué:**
- «El mapa ocupa más de la mitad, lo quiero a un lado.»
- «Quiero ver sin scroll un resumen del top 5 o 10, el mapa y el radar.»
- «Lo demás puede ir abajo.»

---

## 5. Top 10 → `render/briefing.js`, `render/rows.js` (o donde se pinte `.trow`), CSS de filas

**Qué:** la `.trow` de 7 columnas pasa a una **fila de dos líneas** (`.row`) con **cabeceras de grupo por veredicto**. El mismo componente sirve para el listado.

1. **Cabecera de grupo (`.grp`, 24 px):** `■ ACTUAR HOY ········ 2 CVE`. Se inserta cada vez que cambia el veredicto, en el orden por score de siempre.
2. **Fila (`.row`, 46 px):**
   - **Rejilla:** posición | bloque principal | score.
   - **Línea 1:** ID (mono 12,5 / 600) y fabricante · producto (Hanken 13,5).
   - **Línea 2:** severidad (barras de color y **texto neutro**) · `CVSS 9.8` · `EPSS P96`, y después los chips.
   - **Chips:** como máximo **3 + «+N»** (2 + «+N» en móvil). El «+N» lleva `title` y un `.sr-only` con los nombres largos.
   - **Borde izquierdo** de 3 px en el color del veredicto.
   - **VIGILAR (`.is-dim`):** el ID y el producto en `--text-2`.
3. **Score (`.score`):** cifra de 26 px y barra de 64 × 4 px con marcas en 40, 70 y 85. Si es provisional, rayas y `*`.
4. **Móvil:**
   - **5 filas visibles y un botón «Ver las 10»** (`aria-expanded`). Las filas 6–10 llevan `.is-extra` y se muestran con `.top10.is-open`.
   - Cada fila: ID / fabricante · producto / chips, con el score a la derecha. Se ocultan la severidad, el CVSS y el EPSS.
5. **Fabricante vacío o relleno con la CNA:** ver el punto 12.2. La fila muestra *«Fabricante pendiente en NVD · CNA vuldb.com»* en cursiva `--text-3`.
6. **Se elimina la entrada escalonada de las filas** (punto 11).

**Por qué:**
- «El top 10 está bien, pero en móvil ocupa demasiada pantalla.»
- En escritorio tenía que caber junto al mapa y el radar.
- Agrupar por veredicto explica por qué aparecen CVE de score 30 en un día flojo: quedan bajo VIGILAR, atenuadas, en lugar de parecer igual de importantes.

**Accesibilidad:**
- Cada fila es un `<a>` a la ficha.
- El score lleva `aria-label` («Score 44 de 100, provisional, PLANIFICAR»).
- El veredicto se lee por la forma del icono (■ ◧ □ ○), no solo por el color.

---

## 6. Mapa → `assets/js/globe.js`, CSS del mapa

### 6.1 Escala (diseño)

**Qué:**
1. **Agregar por país** antes de pintar: un marcador por `cc`, con la suma de `attacks`, colocado en el punto de ese país con más ataques. Ver `countryMarkers()` en el prototipo.
2. **Escala logarítmica relativa** al día: `t = (log10(a+1) − min) / (max − min)`.
   - **Tamaño:** `6 + t × 14` px (× 0,75 en móvil).
   - **Color por tramo de `t`:**

     | `t` | Color |
     |---|---|
     | ≥ 0,72 | `--map-hi` (rojo) |
     | ≥ 0,40 | `--map-mid` (ámbar) |
     | Resto | `--map-lo` (azul) |

   - **Leyenda:** convierte los umbrales a cifras reales (`≥ 44K`, `≥ 5,1K`, `menos`).
3. **Etiquetas:**
   - Solo los 6 primeros países.
   - Nunca dos a menos de 9° de distancia (`labelSet()`), para que no se solapen NL y DE.
   - Formato `US 289K`.
4. **Ondas (`ringsData`):** solo para los 12 primeros.
5. **Un solo anillo** de pulso por marcador (antes eran dos).
6. **Encuadre:** `altitude = max(1,9; 1,8 × alto / ancho)`, centrado en 30° N, 10° E. Así el globo cabe entero en un panel alto y estrecho.
7. **Colores del globo:**
   - Material `#0E151D` y atmósfera `#3D7FB8` (antes era verde).
   - Tierra en `rgba(126,152,178,.5)`.

**Por qué:** con datos reales (US 288.522 frente a KR 2.650), los umbrales fijos de la v1 (≥ 3.000 = rojo) lo pintaban todo de rojo y enorme, y las etiquetas se pisaban.

### 6.2 Zoom (diseño y programación)

**Qué:**
- **Botones** `+` / `−` / `⌖` (36 px, arriba a la derecha, `role="group"` y `aria-label` en cada uno).
  - `+` y `−` cambian la altitud en ±0,45 con una transición de 400 ms.
  - `⌖` vuelve a la vista inicial y reactiva el autogiro.
- **Controles de cámara:**
  ```js
  const c = globe.controls();
  c.enableZoom = true; c.enablePan = false;
  c.minDistance = 100 * (1 + 0.45); c.maxDistance = 100 * (1 + 3.2);
  // Rueda sin Ctrl → scroll de la página; Ctrl + rueda → zoom. El pellizco siempre hace zoom.
  el.addEventListener('wheel', (e) => { if (!e.ctrlKey) e.stopPropagation(); }, { capture: true });
  ```
- **Autogiro:** se detiene en el primer `pointerdown`.
- **CSS:** el contenedor lleva `touch-action: pan-y`, para que en el móvil el scroll vertical siga funcionando sobre el globo.
- **Vista plana (respaldo SVG):** el mismo zoom, cambiando el `viewBox` entre ×1 y ×4 (`applyFlatZoom()`).
- **Leyenda:** cambia según el dispositivo («pellizca para zoom» o «Ctrl + rueda para zoom»), detectado con `matchMedia('(pointer: coarse)')`.

**Por qué:** Adrián: «pon zoom en el mapa». Si la rueda hiciera zoom directamente, el globo «atraparía» el scroll de la página en escritorio.

### 6.3 Ubicación

- **Escritorio:** columna central, a la altura del top.
- **Móvil:** después del top, con 300 px de alto. Adrián dijo que en móvil el tamaño está bien.

---

## 7. Chips → CSS de chips (sin tocar vuestra lógica de familias)

| Propiedad | Antes | v2 |
|---|---|---|
| Tamaño de letra | 9 px | 10 px (11 px en la ficha) |
| Alto | 20 px | 18 px en filas, 26 px en la ficha |
| Radio | 0 | 2 px |
| Máximo en filas | Todos | 3 + «+N» (2 + «+N» en móvil) |
| Orden | El del JSON | El de la lista aprobada (`kev, ssvc, ransomware, exploit, deteccion, poc, stack, incibe, certeu, news, remote, library`) |

Fuera de esto, los colores, los bordes y los rellenos son **los de producción**.

---

## 8. Radar → `assets/js/radar.js`

**Qué (diseño):**
- Nombres de sector a 14 unidades de viewBox (unos 9–10 px reales) en `--text-2`, cortados a 9 caracteres. Antes eran ilegibles.
- Etiquetas de los anillos a 11,5 unidades.
- ViewBox de `-80 -18 460 336`, para que quepan los nombres.
- Debajo del radar, en lugar de la lista del anillo HOY:
  1. Una frase de lectura: «Cuanto más al centro, más urgente. Cada sector es un fabricante.»
  2. El reparto del top por veredicto: lista `.vdist` con forma, nombre y número. Los veredictos con 0 se atenúan.
  3. La nota del `*` si hay scores provisionales.
- El panel se estira a la altura del top, y el reparto rellena ese hueco con información útil.

**Qué (datos):** ver el punto 12.2. Un sector **nunca** se llama como una CNA.

**Por qué:** «el radar mola, pero los datos son confusos». Parte de la confusión es de diseño (no se explicaba cómo se lee y las etiquetas eran diminutas) y parte es de datos (sectores con nombres de CNA).

---

## 9. Ficha de CVE → `render/detail.js`

**Qué:** cambia el orden a **decisión → contexto → evidencias**.

1. **Cabecera:**
   - El ID con `CVE-2026-` en `--text-3` y el número en `--text-1`. Tamaño `clamp(36px, 5vw, 56px)`, antes llegaba a 132 px.
   - El fabricante y el producto (o el texto de pendiente).
   - Los chips en versión larga.
2. **Panel «Qué hacer» (`.decision`), nuevo y primero:**
   - El dial (132 px, arco de 270°, sin las 51 marcas animadas) y el veredicto grande.
   - Una lista de acciones construida con **campos existentes** (`todoList()` en el prototipo):

     | Condición | Texto |
     |---|---|
     | `kev` | «CISA da de plazo hasta el `due_date`: quedan N días» |
     | `kev.ransomware === 'Known'` | Aviso de ransomware |
     | `kev.action` | Texto en inglés, con `lang="en"` |
     | Tag `ssvc` | Explotación activa según SSVC (aún no está en KEV) |
     | Tag `exploit` / `poc` | Exploit verificado / PoC sin verificar |
     | Tag `deteccion` | Existe plantilla de detección |
     | Tag `stack` | Afecta a tu stack |
     | Tag `library` | Es una dependencia: revisa los lockfiles |
     | Ninguna | Frase por defecto según el score |

3. **Métricas** en una franja de 4 (CVSS, severidad, EPSS y percentil); 2 × 2 en móvil.
4. **Descripción** (`lang="en"`) y **vector CVSS** decodificado: igual que ahora, con el estilo nuevo.
5. **Columna derecha:**
   - El catálogo KEV, con las fechas en formato `05 NOV` y la fila «Quedan N días».
   - El desglose, **pintado de forma genérica desde `scoring_weights` y `score_breakdown`**: una barra por clave, sin valores fijos en el código.
   - PoC, con el aviso obligatorio.
   - Noticias, CWE y fuentes.
6. **Móvil:** los botones Anterior / Siguiente ocupan todo el ancho, encima del ID.

**Por qué:** por la mañana la pregunta es «¿qué hago con esto?». La v1 obligaba a leer todas las métricas antes de llegar a la respuesta.

---

## 10. Listado e histórico → `render/list.js`, `render/history.js`

**Listado:**
- La barra de búsqueda (sticky bajo la franja) lleva el buscador, el **orden** (Urgencia / CVSS / EPSS) y el botón **Filtros (n)**, con `aria-expanded`.
- Los filtros van en un panel que se pliega (`hidden`). Así en móvil no ocupan media pantalla.
- **Filtros:**
  - Veredicto, severidad, explotada, exploit o PoC, mi stack y fabricante.
  - El fabricante incluye la opción «Pendiente en NVD».
- **Ordenado por urgencia:** se agrupa por veredicto, con las mismas `.grp`.
- **Filas:** la `.row` de 58 px. Desde 1180 px añade una tercera línea con el principio de la descripción.
- **Paginación:** «Mostrar 50 más», en lugar de pintar todo.

**Histórico:** solo cambia el estilo (tokens y paneles). La gráfica deja de animarse.

---

## 11. Movimiento → CSS y JS de animaciones

| Animación | Qué hacer |
|---|---|
| Barrido de fondo | Quitar (ya no existe el héroe) |
| Contadores que cuentan al cargar (`--t-count`) | **Quitar**: con datos reales parecía que la cifra no estaba lista |
| Entrada escalonada del top 10 (`--t-row`, `--t-stagger`) | Quitar |
| Aparición de los puntos del globo | Quitar |
| Pulso de un punto del globo | 1 anillo en lugar de 2; escala de 1 a 2,6 en 2,4 s |
| Animación del dial y de la gráfica del histórico | Quitar |
| Fundido al cambiar de pantalla | Quitar |
| Radar, LIVE, T+, autogiro (0,3) | **Se quedan** |

`prefers-reduced-motion` sigue igual: todo a cero, sin autogiro ni ondas.

---

## 12. Para programación (no es diseño)

### 12.1 El mapa solo muestra EE. UU., Rusia, Bulgaria y algo de Europa

**Síntoma:** en las capturas solo salen 4–5 países. El diseño v2 necesita datos de todo el mundo; en el prototipo hay 21 países.

**Qué revisar en `radar.py` (job de `map.json`):**
- **Límite de filas al pedir a SANS ISC/DShield:** si se pide un top N pequeño de IPs o de fuentes, salen sobre todo los grandes emisores. Hay que pedir un top amplio (cientos o miles de IPs) o el endpoint agregado por país, si se usa.
- **Geolocalización con DB-IP Lite:** comprobad que **todas** las IPs se resuelven. Un fallo silencioso, o un descarte de las que no tienen `lat`/`lon` de ciudad, dejaría solo a los países «fáciles». Con DB-IP Lite *country* no hay coordenadas: usad el centroide del país.
- **El arreglo de `isc_rows`** (claves numeradas) que ya está aprobado en la fase 6: si la respuesta viene con claves numeradas y solo se leía la primera página o el primer bloque, se perderían países.
- **Agregación:** que `by_country` y `points` no se corten antes de tiempo. El diseño agrupa por país en el frontend, así que no hace falta recortar puntos en el script.

**Criterio de aceptación:** `map.json` con al menos 15–20 países en un día normal y `by_country` con 10.

### 12.2 Fabricante relleno con la CNA (radar y filas)

**Origen:** según la fase 6, `radar.py` rellena `vendor` con la CNA (por ejemplo, `CNA · vuldb.com`) cuando NVD no trae fabricante. Eso hace que el radar tenga sectores llamados «VULDB.COM» y que el top parezca lleno de un fabricante que no existe.

**Propuesta sin campos nuevos (la del prototipo):** el frontend detecta el prefijo y lo trata como «pendiente».
```js
const CNA_RE = /^CNA\s*[·:-]\s*/i;
const realVendor = (c) => (c.vendor && !CNA_RE.test(c.vendor) ? c.vendor : '');
const cnaOf = (c) => (c.vendor && CNA_RE.test(c.vendor) ? c.vendor.replace(CNA_RE, '') : '');
```

| Dónde | Qué se muestra |
|---|---|
| Filas y ficha | «Fabricante pendiente en NVD · CNA vuldb.com» |
| Radar | Sector «SIN FABRICANTE» |
| Filtro del listado | «Pendiente en NVD» |

**Confirmad el formato exacto** con el que `radar.py` escribe la CNA y ajustad la regex. El relleno «Plugin WordPress · X» **sí** es un fabricante legítimo y no se toca.

**Sobre los datos del radar:** los sectores son los fabricantes **del top 10**, en orden alfabético. Si un día el top tiene 7 «sin fabricante», el radar tendrá un sector enorme llamado «SIN FABRICANTE», y eso es honesto. No hay que esconderlo.

### 12.3 Contador «Con PoC» o «Exploit verificado»

En el prototipo el cuarto contador es «Con PoC» (`stats.with_poc`). Si producción ya enseña «EXPLOIT VERIFICADO» con un dato existente, **mantenedlo**. El diseño solo fija la posición y el estilo.

### 12.4 Reloj T+

Sigue contando desde `latest.generated_at`. Ahora vive en la franja, y su `aria-live` debe seguir siendo educado: que no lea cada segundo.

### 12.5 globe.gl, CSP y Trusted Types

Probado con vuestra CSP literal:
- **Nuestro código: 0 violaciones** en las 4 rutas y en los 3 estados.
- **globe.gl genera 7:** 6 por el `<style>` que inyecta y 1 por un `innerHTML` interno.

Son las mismas que ya tenéis resueltas en producción, así que **mantened vuestra solución actual**. Si cargáis globe.gl de forma dinámica, el prototipo usa una política mínima:
```js
const tt = trustedTypes.createPolicy('zh-globe', { createScriptURL: (u) => {
  if (u === GLOBE_SRC) return u; throw new TypeError('URL de script no permitida'); } });
```

### 12.6 Campos

**No necesito ningún campo nuevo.** Solo si queréis mejorar lo del punto 12.2, lo limpio sería que `radar.py` dejara `vendor` vacío y pusiera la CNA en un campo aparte (por ejemplo, `cna`). **Es opcional y requiere el OK de Adrián**, porque cambia el contrato. Mientras tanto, la detección por prefijo funciona.

---

## 13. Comprobaciones antes de dar el cambio por bueno

- [ ] 1440 × 900: los contadores, el top 10 completo, el mapa y el radar caben sin scroll.
- [ ] 1024 × 768, 768 y 380 px: sin scroll horizontal.
- [ ] Móvil: cabecera, franja, contadores y las 5 primeras del top en el primer pantallazo y medio. «Ver las 10» funciona con teclado y lector de pantalla.
- [ ] La cabecera y la franja son opacas: no se transparenta nada al hacer scroll.
- [ ] Mapa:
  - [ ] Un marcador por país y sin etiquetas solapadas.
  - [ ] Zoom con los botones, con el pellizco y con Ctrl + rueda.
  - [ ] La rueda sola hace scroll de la página.
  - [ ] La vista plana también hace zoom.
- [ ] Radar: ningún sector con nombre de CNA.
- [ ] Ficha: «Qué hacer» aparece primero; el desglose sale de `scoring_weights`.
- [ ] Día vacío: sin deltas. Fuente caída: el desplegable en rojo y el aviso visible.
- [ ] Playwright con la CSP: 0 violaciones propias.
- [ ] Contraste AA: barras de severidad + texto neutro, y veredicto con forma.
- [ ] `prefers-reduced-motion`: nada se mueve.
