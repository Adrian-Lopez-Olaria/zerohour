# ZEROHOUR — guía de estilo

**Inteligencia de vulnerabilidades** · por Adrián López Olaria

Prototipo v1.1 · acompaña a `zerohour-prototipo.html`

**Dirección de arte: «centro de mando».** La referencia es la sala de operaciones de un SOC, pero sobria: instrumentación de precisión, no un videojuego. Fondo por capas, filetes de 1 px, marcas de esquina, cifras enormes junto a etiquetas diminutas y textos escritos como los escribiría un analista.

Todos los valores de esta guía están en `:root` como variables CSS.

---

## 1. Fondo por capas

Las capas van fijas detrás del contenido, en el orden en que se pintan:

| # | Capa | Implementación | Valor |
|---|---|---|---|
| 1 | Base | `radial-gradient` muy suave sobre `--bg-0` | `#050A0A` → foco `#0A1716` arriba a la derecha |
| 2 | Retícula | 4 `linear-gradient` | Menor cada 48 px a `rgba(150,235,205,.045)`; mayor cada 240 px a `.075` |
| 3 | Grano | SVG `feTurbulence` (fractalNoise, `baseFrequency .9`, 3 octavas) como fondo en mosaico de 180 px | `--grain-opacity: .07` |
| 4 | Viñeta | `radial-gradient` que oscurece los bordes | `--vignette: rgba(0,0,0,.62)` desde el 52 % |
| 5 | Barrido de radar | Cuña cónica de 1300 px detrás del héroe de la portada | Una vuelta cada 11 s (`--t-sweep-bg`), máximo 10 % de opacidad, con anillos cada 130 px |

**Reglas de borde.** En los laterales de la ventana hay reglas con marcas: una principal cada 24 px y otra secundaria cada 6 px. Se ocultan por debajo de 1100 px.

---

## 2. Paleta

### Superficies y líneas

| Token | Valor | Uso |
|---|---|---|
| `--bg-0` | `#050A0A` | Fondo base: casi negro con matiz verde azulado |
| `--bg-1` | `#081110` | Paneles |
| `--bg-2` | `#0C1816` | Hover de filas, día seleccionado |
| `--line-1` | `rgba(150,235,205,.10)` | Filete entre filas |
| `--line-2` | `rgba(150,235,205,.18)` | Borde de panel |
| `--line-3` | `rgba(150,235,205,.34)` | Borde de controles |
| `--mark` | `#9FD9C4` | Marcas de esquina de los paneles |

### Texto

Los contrastes son sobre `--bg-0`.

| Token | Hex | Contraste | Uso |
|---|---|---|---|
| `--text-1` | `#E3EEEA` | 16:1 | Texto principal y cifras |
| `--text-2` | `#A9BBB5` | 9:1 | Párrafos y descripciones |
| `--text-3` | `#7E928C` | 5,9:1 | Etiquetas y metadatos (AA incluso a 10 px) |

### Acentos de sistema

| Token | Hex | Significado |
|---|---|---|
| `--ok` | `#4CF2A3` | Verde fósforo: sistema normal, fuente OK, piloto LIVE, foco de teclado, «mi stack» en contadores |
| `--warn` | `#FFB547` | Ámbar: atención, fuente parcial, PoC, aviso INCIBE, nota del analista |
| `--fail` | `#FF5C7A` | Fuente caída (con parpadeo) |

### Severidad

La severidad nunca depende solo del color. Cada etiqueta lleva **de 1 a 4 barras de señal** y su nombre, y además los colores se separan por luminosidad, para que se distingan también con daltonismo.

| `severity` | Token | Hex | Barras | Etiqueta |
|---|---|---|---|---|
| `CRITICAL` | `--sev-critical` | `#FF4F6D` | ▂▄▆█ (4) | CRÍTICA |
| `HIGH` | `--sev-high` | `#FF9940` | ▂▄▆ (3) | ALTA |
| `MEDIUM` | `--sev-medium` | `#E9D55B` | ▂▄ (2) | MEDIA |
| `LOW` | `--sev-low` | `#6CB6FF` | ▂ (1) | BAJA |
| `null` | `--sev-unscored` | `#8A9C97` | 4 barras huecas | SIN PUNTUAR |

El score (0–100) usa la misma escala de color, con estos cortes:

| Score | Color | Veredicto |
|---|---|---|
| ≥ 85 | Crítica | ACTUAR HOY |
| 70–84 | Alta | ESTA SEMANA |
| 40–69 | Media | PLANIFICAR |
| < 40 | Baja | VIGILAR |

---

## 3. Tipografía

Todas las fuentes vienen de Google Fonts. Cada familia se carga con su propia `<link>`, para que si una falla las demás sigan cargando.

| Rol | Familia | Ajustes |
|---|---|---|
| Wordmark | **Big Shoulders Display** | 800, MAYÚSCULAS, `letter-spacing .05em` |
| Titulares y cifras grandes | **Big Shoulders Display** | 800–900, MAYÚSCULAS, `line-height .86`, `tabular-nums` |
| Datos: IDs, métricas, etiquetas, navegación | **Martian Mono** | `font-stretch 87.5%`, 300–700 |
| Texto corrido | **Hanken Grotesk** | 400–600, 15/23 |

**Fuentes de respaldo:** si no carga ninguna, se usan las genéricas `sans-serif` y `monospace`. No se nombra ninguna de las familias prohibidas en el brief.

**Etiquetas:** Martian Mono a 10 px, MAYÚSCULAS, `letter-spacing .16em` (`--track-label`).

### Escala

| Token | Valor | Dónde |
|---|---|---|
| `--fs-hero` | `clamp(54px, 6.4vw, 104px)` | Titular de la portada |
| `--fs-id` | `clamp(52px, 8.5vw, 132px)` | ID de la CVE en el detalle |
| `--fs-kpi` | `clamp(44px, 4.4vw, 68px)` | Contadores |
| `--fs-h2` | `clamp(30px, 3vw, 42px)` | Títulos de sección |
| `--fs-lead` | 17 px | Resumen del briefing |
| `--fs-body` | 15 px | Texto corrido |
| `--fs-small` | 13 px | Descripciones secundarias |
| `--fs-data` | 12 px | IDs y métricas en tabla |
| `--fs-label` | 10 px | Etiquetas |

**Jerarquía:** la cifra va siempre al menos 5 veces más grande que su etiqueta. Por ejemplo, un contador de 68 px lleva una etiqueta de 10 px.

### Espaciado y forma
- **Escala de 4:** `--sp-1` 4 · 8 · 12 · 16 · 24 · 32 · 48 · `--sp-8` 64.
- **Márgenes laterales (`--gutter`):** 32 px, o 14 px por debajo de 760 px. Ancho máximo: 1440 px.
- **Radios:** `--radius-0: 0` en paneles, chips y botones. Solo son redondos los puntos del globo y los pilotos (`--radius-dot`).

---

## 4. Logotipo

**Concepto: la «hora cero».** El símbolo es una esfera de cronómetro parada en las 00:00 que funciona a la vez como pantalla de radar. Se dibuja como SVG inline (`<symbol id="logo">`, viewBox 32):

| Pieza | Dibujo | Significado |
|---|---|---|
| Esfera | Círculo r 11,6 con trazo de 2,6 px en `currentColor` | El reloj, y también el «0» |
| Corona | Rectángulo de 6 × 2,8 encima de la esfera, separado de ella | Pulsador de cronómetro: cuenta el tiempo desde la hora cero |
| Marcas | Trazos de 1,6 px a las 3, las 6 y las 9 | Lectura de esfera; a tamaño grande muerden el aro |
| Aguja | Trazo de 2,2 px en `--ok` del centro a las 12, más un eje de r 2 | 00:00 |
| Barrido | Cuarto de círculo verde al 30 % entre las 9 y las 12, detrás de la aguja | Pantalla de radar que acaba de pasar |
| Blip | Punto de r 2,1 en `--sev-critical`, hacia la 1:30 | Lo que ha aparecido justo después de la hora cero |

**Pruebas de legibilidad:** el símbolo se ha comprobado a 16, 24, 32, 64 y 160 px. A 16 px se siguen leyendo el aro, la aguja y el blip. Un primer intento con un «0» alargado se descartó porque, con la aguja vertical, parecía un ratón de ordenador.

**Wordmark.** Se probaron dos versiones en Big Shoulders Display 800:
- `ZEROHOUR` en una pieza: correcto, pero plano.
- `ZERO│HOUR` con un filete vertical de 1 px en `--ok` (alto 0,74 em). **Es la elegida:** el filete repite la aguja a las 12, separa las dos palabras sin perder la unidad y aguanta bien en pequeño.

También se probó una tercera variante, ZERO en 900 y HOUR en 500 gris, pero a tamaño de cabecera perdía legibilidad.

| Tamaño | Versión | Dónde |
|---|---|---|
| 16–32 px | Solo el símbolo, sobre cuadrado `#050A0A` y con trazos un poco más gruesos | Favicon (data-URI en el `<head>`) |
| 30 px + wordmark de 29 px | Símbolo + `ZERO│HOUR` + subtítulo y firma en mono de 9,5 px | Cabecera (`.brand`) |
| 60 px + wordmark de 64 px | Lockup grande (`.lockup`) | Pie de página |

**Subtítulo y firma:** «Inteligencia de vulnerabilidades» y debajo «por Adrián López Olaria», en mono de 9,5 px en MAYÚSCULAS, con un filete a la izquierda que los separa del wordmark.

---

## 5. Componentes

### Panel con marcas de esquina (`.panel`)
- **Contorno:** filete de 1 px hecho con `box-shadow: inset 0 0 0 1px var(--line-2)`.
- **Esquinas:** 8 `linear-gradient` dibujan marcas en L de 10 px (`--corner`) en `--mark`. No hay radio ni sombra difusa.
- **Cabecera (`.panel__head`):** un código de sección en verde (`TOP-10`, `RDR-01`, `KEV-05`…), el título en mono de 11 px en MAYÚSCULAS y metadatos a la derecha.
- **Variante KEV (`.kev-box`):** el contorno y las marcas pasan a crítica y la cabecera va en bloque rojo con texto oscuro.

### Fila del top (`.trow`)
- **Rejilla de 7 columnas:** posición (Big Shoulders 26 px, gris), ID, fabricante / producto, barra de score, CVSS con severidad, percentil EPSS y chips.
- **Hover:** fondo `--bg-2`, filete izquierdo de 2 px del color del score y el ID en verde.
- **Entrada:** escalonada, ver la sección 7.
- **Móvil:** se reordena en 3 filas (posición · ID / producto · score grande / chips) y se ocultan CVSS y EPSS.

### Contador (`.kpi`)
- Etiqueta mono de 10 px, cifra en Big Shoulders 800 a `--fs-kpi` con `tabular-nums`, y debajo el delta frente a la media de 7 días. El delta usa ▲ en ámbar cuando sube y ▼ en verde cuando baja.
- **Variantes:**
  - `--alert` (KEV): cifra en crítica.
  - `--stack`: cifra en verde.
  - `--wide` (CVE nuevas): ocupa 2 columnas y lleva debajo una barra de reparto por severidad de 6 px.

### Chip de etiqueta (`.chip`)
- Mono de 9 px, MAYÚSCULAS, 20 px de alto, esquinas rectas y un icono de 11 px. En la tabla muestra el código corto y en el detalle (`.chips--lg`) el texto largo.
- Cada etiqueta se distingue **por el estilo del borde o del relleno**, así que funcionan sin color:

| Tag | Corto / largo | Estilo |
|---|---|---|
| `kev` | KEV / EXPLOTADA | Relleno crítica, texto oscuro |
| `ransomware` | RANSOM / RANSOMWARE | Borde doble de 3 px en crítica, fondo al 12 % |
| `poc` | POC / EXPLOIT PÚBLICO | Borde ámbar |
| `stack` | STACK / MI STACK | Relleno claro (`--text-1`), texto oscuro |
| `incibe` | INCIBE / AVISO INCIBE | Borde discontinuo ámbar |
| `news` | NEWS / EN NOTICIAS | Borde `--line-3`, texto `--text-2` |
| `remote` | RED / REMOTA | Borde punteado `--text-3` |
| `library` | LIB / LIBRERÍA | Borde azul (`--sev-low`) |

### Indicador de puntuación
- **Barra (`.sbar`):**
  - Pista de 8 px con marcas verticales en 40, 70 y 85, y un relleno del color del score.
  - La cifra va en Big Shoulders a 24 px.
  - **Provisional** (CVE sin CVSS): relleno a rayas a 45° y asterisco tras la cifra.
- **Dial (`.gauge`, en el detalle):**
  - Arco de 270° con 51 marcas (una cada 2 puntos, y una larga cada 10). Cada marca encendida toma el color de su tramo, así que el dial también sirve de escala.
  - En el centro va la cifra en Big Shoulders 900 a 104 px y, debajo, el veredicto.
  - Bajo el dial, el desglose: CVSS /35, EPSS /30, KEV /20, PoC /10, stack /5.

### Punto del globo (`.gm`, capa `htmlElementsData` de globe.gl)
- **Tamaño:** `7 + √attacks / 5` px, es decir, unos 10 px con 290 ataques y 21 px con 4.812. En móvil se multiplica por 0,65.
- **Color por volumen:**

| Ataques | Color |
|---|---|
| ≥ 3.000 | Crítica |
| 1.000–2.999 | Ámbar |
| < 1.000 | Verde fósforo |

- **Estructura:**
  - Un núcleo con un resplandor del 140 % de su tamaño.
  - Dos anillos de 1 px desfasados 1,8 s.
  - Una etiqueta mono (`US 4,8K`) solo a partir de 2.000 ataques.
- **Ondas de superficie:** se dibujan con `ringsData`, y su frecuencia también depende de `attacks`:
  - Radio máximo: `1,6 + √attacks / 18` grados.
  - Repetición: cada `max(900, 2600 − √attacks × 18)` ms.
- **Tierra:** unos 4.800 discos planos de 0,36° (Natural Earth 1:50m rasterizado a 1,5°) en `rgba(159,217,196,.5)`. El globo usa el color `#071312` y lleva atmósfera verde fósforo de altitud 0,13 y la cuadrícula de meridianos y paralelos (graticules) activada.
- **Respaldo:** si no hay WebGL o globe.gl tarda más de 9 s en cargar, se muestra una proyección plana en SVG con los mismos puntos y pulsos, y un aviso en ámbar.

### Blip del radar (`.blip`)
- **Posición:**
  - **Distancia al centro:** `6 + (100 − score) / 100 × 112` en un lienzo de 300, con anillos en 85 (HOY, discontinuo en crítica), 70 y 40.
  - **Ángulo:** 360° se reparten en sectores iguales entre los fabricantes del top 10, en orden alfabético. Si un fabricante tiene varias CVE, cada blip ocupa su propia fracción del sector.
- **Aspecto:** círculo de 3,2 a 5 px del color del score, con un área de clic de 9 px.
- **Interacción:**
  - Es un enlace a la ficha, accesible con teclado.
  - Al pasar el ratón o darle el foco, aparece el ID, el fabricante y el score en la línea de estado.
  - Debajo del radar se listan las CVE del anillo interior.

### Reloj T+ (`.tplus`)
- Muestra el tiempo transcurrido desde la última actualización del briefing, en formato `T+HH:MM:SS`. Es el concepto de la hora cero llevado a la interfaz.
- **Dónde:** en la cabecera, junto a UTC y la hora local (es el único reloj que se mantiene en móvil, además del piloto LIVE), y en la línea superior del héroe de la portada: «T+09:25:13 DESDE LA ÚLTIMA ACTUALIZACIÓN».
- **Estilo:** «T+» en mono `--text-3` y las cifras en mono 600 `--ok` con `tabular-nums`, para que no bailen al cambiar.
- **Base del cálculo:** la edición diaria de las 07:00 (hora de Madrid, con horario de verano incluido). Si aún no son las 07:00, cuenta desde la edición del día anterior.

### Barra de fuentes y avisos
- **Barra de fuentes:** cada fuente lleva un piloto de 6 px con resplandor y su estado: `NVD ● OK` en verde, `PARCIAL` en ámbar, `ERROR` en `--fail` con parpadeo de 1 s. Al pasar el ratón se lee el mensaje de error.
- **Fuente caída:** aparece además un aviso (`.alert`, borde `--fail` y fondo al 7 %) que explica qué datos pueden estar incompletos y cuándo es el próximo reintento.

### Estados especiales
- **Día vacío:** el titular pasa a «Sin CVE todavía», con la hora habitual del primer lote. El radar queda «Sin contactos» y el top y el listado muestran un bloque vacío (`.empty`) con el icono de radar apagado.
- **Sin coincidencias en los filtros:** bloque vacío con el texto «Sin coincidencias» y una indicación de quitar filtros o pulsar LIMPIAR.
- **CVE sin puntuar:**
  - Etiqueta SIN PUNTUAR con barras huecas y score provisional con asterisco.
  - En el detalle, nota gris «Pendiente de NVD» en lugar de la tabla CVSS.
  - Vector de ataque: «PENDIENTE».

El pie del prototipo incluye «VER ESTADO: NORMAL / DÍA VACÍO / FUENTE CAÍDA» para revisarlos. Los mismos estados se pueden abrir por URL con `?estado=vacio` y `?estado=error`.

---

## 6. Iconos de etiqueta

Son propios: viewBox 16, trazo de 1,5 px, extremos rectos (`square`) y uniones en inglete. No hay emojis ni librerías de iconos.

| Tag | Dibujo |
|---|---|
| `kev` | Retícula de puntería: círculo de r 5,5, cuatro marcas exteriores y un cuadrado relleno de 2,2 px en el centro |
| `ransomware` | Candado rectangular con el arco del cierre y una ranura vertical |
| `poc` | Prompt de terminal `>_` |
| `stack` | Tres capas en rombo apiladas |
| `incibe` | Escudo con signo de exclamación |
| `news` | Periódico: rectángulo, tres líneas de texto y un recuadro de foto relleno |
| `remote` | Punto de origen con dos ondas |
| `library` | Paquete o cubo en perspectiva isométrica |

---

## 7. Movimiento

| Animación | Duración | Curva | Detalle |
|---|---|---|---|
| Barrido de fondo (portada) | 11 s / vuelta (`--t-sweep-bg`) | `linear` | Cuña cónica, máximo 10 % de opacidad |
| Barrido del radar | 6 s / vuelta (`--t-radar`) | `linear` | Cuña de 35° con línea de barrido |
| Destello del blip | 6 s, sincronizado | `linear` | Retardo = ángulo / 360 × 6 s. Escala 1,9 → 1 en el primer 8 %, luego se apaga hasta 0,35 |
| Piloto LIVE | 1,6 s (`--t-blink`) | `steps(2)` | Parpadeo seco, sin fundido |
| Reloj T+ | Cada 1 s | — | Cambio de cifra sin animación; cifras tabulares |
| Contadores al cargar | 1100 ms (`--t-count`), **una vez** | ease-out cúbica (rAF) | De 0 al valor; no se repite al volver a la portada |
| Aparición del top 10 | 420 ms (`--t-row`) + 45 ms × posición (`--t-stagger`) | `--ease-out` `cubic-bezier(.16,1,.3,1)` | Fundido con desplazamiento lateral de 10 px |
| Aparición de un punto del globo | 700 ms, escalonada 90 ms | `--ease-out` | Escala 0 → 1,5 → 1 |
| Pulso de un punto del globo | 2,2 s, infinito (`--t-pulse`) | `ease-out` | Anillo de escala 1 → 4 y opacidad 0,9 → 0. Dos anillos desfasados 1,8 s |
| Ondas de superficie | `ringPropagationSpeed 1,4°/s` | — | Repetición en función de `attacks` |
| Autogiro del globo | `autoRotateSpeed 0,35` | — | Arrastrable; zoom y desplazamiento desactivados |
| Dial del detalle | 280 ms por marca, escalonadas 14 ms | `--ease-out` | Las marcas se encienden en secuencia |
| Gráfica del histórico | 520 ms por barra, escalonadas 30 ms | `--ease-out` | `scaleY` desde la base. La línea KEV se dibuja en 1,1 s |
| Hover y foco | 140 ms (`--t-fast`) | `ease` | Fondo de fila, color del ID |
| Cambio de pantalla | 260 ms | `--ease-out` | Solo fundido |

Con `prefers-reduced-motion: reduce`:
- Se quitan el barrido de fondo, el del radar, el autogiro, los pulsos y las ondas.
- Los contadores muestran el valor final directamente.
- El resto de animaciones dura 1 ms.

---

## 8. Datos y notas para desarrollo

- **Origen de los datos:** el objeto `ZEROHOUR_DATA` va al principio del archivo y contiene `latest`, `map` e `index`, con los nombres de campo exactos del brief. Cada clave corresponde a un JSON del pipeline: `data/latest.json`, `data/map.json` y `data/index.json`.
- **Decisiones mías sobre los datos:**
  - `latest.top` es una lista de IDs, en orden, que apuntan a objetos de `latest.cves`.
  - `points[].sources` es el número de sensores o fuentes que reportan ese origen.
- **Rutas:** `#briefing`, `#listado`, `#cve/<id>` y `#historico`. Son anclas, así que funcionan sin servidor.
- **Atajo:** la tecla `/` lleva al buscador del listado desde cualquier pantalla.
- **Selector de días:** se recorre con las flechas ← y →.
- **globe.gl:** se carga con versión fija (`globe.gl@2.46.1`, jsDelivr) desde JavaScript, con un tiempo máximo de 9 s; si no llega, se pasa a la vista plana.
- **Reloj T+:** en el prototipo cuenta desde la edición de las 07:00 del día en curso (constante `EDITION_HOUR`). En producción debe contar desde la hora real en que se generó `latest.json`.
