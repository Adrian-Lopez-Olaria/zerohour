# ZEROHOUR — guía de estilo

**Inteligencia de vulnerabilidades** · por Adrián López Olaria

Versión 2 · acompaña a `zerohour-prototipo-v2.html` y a `zerohour-cambios-v2.md`

> **Qué ha cambiado respecto a la v1.1.** Las secciones marcadas con **[v2]** se han reescrito. Las marcadas con **[=]** no cambian. Las cifras y las reglas de la v1.1 que ya no valen están tachadas o sustituidas, no eliminadas en silencio.
>
> | Sección | Estado |
> |---|---|
> | 0. Dirección de arte | [v2] |
> | 1. Fondo | [v2] (se elimina casi todo) |
> | 2. Paleta | [v2] |
> | 3. Tipografía | [v2] (mismas familias, escala y mínimos nuevos) |
> | 4. Logotipo | [=] (solo cambia el fondo del favicon) |
> | 5. Componentes | [v2] |
> | 6. Iconos | [=] (se añaden 4 iconos de etiqueta y 3 de mapa) |
> | 7. Movimiento | [v2] (menos animación) |
> | 8. Datos | [v2] |

Todos los valores de esta guía están en `:root` como variables CSS.

---

## 0. Dirección de arte · «consola SOC» [v2]

La v1 era un «centro de mando» de película: fondo con retícula, grano, viñeta, marcas de esquina y códigos de sección. Quedaba vistoso, pero restaba credibilidad profesional, y cada adorno competía con los datos.

La v2 se parece más a una consola de SOC de verdad, como las de Elastic, Splunk o Sentinel:
- **Superficies planas de grafito.** Paneles con un borde sólido de 1 px y una barra de cabecera. Nada de decoración.
- **El color es información.** El verde de marca solo indica estado, foco y navegación activa. El rojo, el ámbar y el amarillo solo indican urgencia. Si algo tiene color, significa algo.
- **Densidad.** En escritorio, el briefing cabe entero en 1440 × 900 sin hacer scroll. En móvil, lo importante aparece en la primera pantalla.
- **Cifras grandes solo donde se comparan.** Big Shoulders queda para los contadores, los scores y el ID de la ficha. Todo lo demás va en mono o en sans a tamaño de lectura.

---

## 1. Fondo [v2]

| Capa v1.1 | v2 |
|---|---|
| Base con degradado radial | **Se quita.** El fondo es `--bg-0` liso |
| Retícula de 48 / 240 px | **Se quita** |
| Grano `feTurbulence` | **Se quita** |
| Viñeta | **Se quita** |
| Barrido de radar detrás del héroe | **Se quita** (ya no hay héroe) |
| Reglas con marcas en los laterales | **Se quitan** |

Motivo: con datos reales, la retícula y el grano ensuciaban la lectura en móvil y daban un aire de «demo». Además, eliminar el SVG de grano y los degradados a pantalla completa ahorra tiempo de pintado en móviles modestos.

---

## 2. Paleta [v2]

### Superficies y líneas

Las superficies pasan de un negro verdoso a un grafito azulado neutro, y las líneas pasan de ser verdes con transparencia a sólidas.

| Token | v1.1 | **v2** | Uso |
|---|---|---|---|
| `--bg-0` | `#050A0A` | **`#0A0E13`** | Fondo de página, cabeceras de grupo |
| `--bg-1` | `#081110` | **`#10161D`** | Paneles, cabecera de la web |
| `--bg-2` | `#0C1816` | **`#151D26`** | Barra de título de panel, hover |
| `--bg-3` | — | **`#1B2531`** | Controles activos (filtros, día seleccionado) |
| `--line-1` | `rgba(150,235,205,.10)` | **`#1C2631`** | Filete entre filas |
| `--line-2` | `rgba(150,235,205,.18)` | **`#26323F`** | Borde de panel |
| `--line-3` | `rgba(150,235,205,.34)` | **`#3A4859`** | Borde de controles (contraste 1,95:1 sobre `--bg-1`, solo decorativo) |
| `--mark` | `#9FD9C4` | **Se elimina** | Ya no hay marcas de esquina |

### Texto

Los contrastes son sobre `--bg-1`, que es donde se lee casi todo.

| Token | **v2** | Contraste | Uso |
|---|---|---|---|
| `--text-1` | `#E6EBF1` | 15,2:1 | Texto principal y cifras |
| `--text-2` | `#AEB9C7` | 9,2:1 | Párrafos y metadatos importantes |
| `--text-3` | `#8A97A8` | 6,1:1 | Etiquetas y metadatos (AA desde 11 px) |

### Acentos de sistema

| Token | v1.1 | **v2** | Contraste | Significado |
|---|---|---|---|---|
| `--ok` | `#4CF2A3` | **`#38D996`** | 10:1 | Marca, LIVE, fuente OK, foco, navegación activa, «mi stack» |
| `--warn` | `#FFB547` | **`#F5B544`** | 10:1 | Fuente parcial, exploit/PoC, aviso de PoC |
| `--fail` | `#FF5C7A` | **`#FF5A6E`** | 6:1 | Fuente caída |
| `--info` | — | **`#6CB6FF`** | 8,5:1 | Librerías y nivel bajo del mapa |

El verde baja de saturación porque el fósforo puro quedaba «gamer» y además peleaba con el verde del barrido del radar.

### Severidad CVSS [=]

Los colores no cambian. Lo que cambia es cómo se pintan: en v2 **las barras llevan el color y el texto es neutro** (`--text-2`). Así una tabla con diez CVE críticas no se convierte en un muro rojo.

| `severity` | Token | Hex | Barras | Etiqueta |
|---|---|---|---|---|
| `CRITICAL` | `--sev-critical` | `#FF4F6D` | 4 | CRÍTICA |
| `HIGH` | `--sev-high` | `#FF9940` | 3 | ALTA |
| `MEDIUM` | `--sev-medium` | `#E9D55B` | 2 | MEDIA |
| `LOW` | `--sev-low` | `#6CB6FF` | 1 | BAJA |
| `null` | `--sev-unscored` | `#8A97A8` | 4 huecas | SIN PUNTUAR |

### Veredicto y color del score [v2]

**Los cortes y los textos no cambian.** Cambian tres cosas:
- VIGILAR pasa de azul a **gris**.
- Cada veredicto tiene **forma propia**, para que funcione sin color.
- Los veredictos tienen tokens propios, separados de la severidad.

| Score | Token | Hex | Contraste | Forma | Veredicto |
|---|---|---|---|---|---|
| ≥ 85 | `--v-hoy` | `#FF4F6D` | 5,7:1 | ■ cuadrado lleno | ACTUAR HOY |
| 70–84 | `--v-semana` | `#FF9940` | 8,6:1 | ◧ medio lleno | ESTA SEMANA |
| 40–69 | `--v-planificar` | `#E9D55B` | 12,2:1 | □ cuadrado vacío | PLANIFICAR |
| < 40 | `--v-vigilar` | **`#7F8FA3`** | 5,5:1 | ○ círculo vacío | VIGILAR |

Motivo del gris: en las capturas reales, las CVE de score 30 con el azul de «baja» llamaban más la atención que las de 58 en amarillo. Lo que solo hay que vigilar no debe gritar.

### Mapa [v2]

| Token | Hex | Uso |
|---|---|---|
| `--map-land` | `rgba(126,152,178,.55)` | Puntos de tierra |
| `--map-hi` | `#FF4F6D` | Tramo alto de ataques |
| `--map-mid` | `#F5B544` | Tramo medio |
| `--map-lo` | `#6CB6FF` | Tramo bajo |

Globo: material `#0E151D`, emisivo `#05080B`, atmósfera `#3D7FB8` a altitud 0,1. La atmósfera pasa de verde a azul acero.

---

## 3. Tipografía [v2]

**Las familias no cambian** (Big Shoulders Display, Martian Mono y Hanken Grotesk, las tres OFL y autoalojadas). Cambia el reparto entre ellas:

| Rol | Familia | v2 |
|---|---|---|
| Wordmark | Big Shoulders Display 800 | Sin cambios |
| Contadores, scores, ID en la ficha, día del histórico | Big Shoulders Display 800 | **Único uso** de la display. Ya no hay titulares en display |
| Títulos de panel, etiquetas, IDs, métricas, navegación | Martian Mono, `font-stretch 87.5%` | Pesos 400–600 |
| Texto corrido, fabricante · producto, noticias | Hanken Grotesk | 400–600 |

### Escala

| Token | v1.1 | **v2** | Dónde |
|---|---|---|---|
| `--fs-hero` | `clamp(54px…104px)` | **Se elimina** | Ya no hay héroe |
| `--fs-h2` | `clamp(30px…42px)` | **Se elimina** | Los títulos de sección son títulos de panel en mono de 11,5 px |
| `--fs-kpi` | `clamp(44px…68px)` | **34 px** (26 px en móvil) | Contadores |
| `--fs-score` | 24 px | **26 px** (24 px en móvil) | Score en filas |
| `--fs-id` | `clamp(52px…132px)` | **`clamp(36px, 5vw, 56px)`** | ID en la ficha |
| `--fs-body` | 15 px | 15 px | Texto corrido |
| `--fs-small` | 13 px | 13 px | Secundario |
| `--fs-data` | 12 px | **12,5 px** | IDs en filas |
| `--fs-label` | 10 px | **11 px** | Etiquetas, mínimo absoluto en la interfaz |
| `--fs-chip` | 9 px | **10 px** | Chips |
| `--track-label` | `.16em` | **`.08em`** | Tracking de etiquetas |

**Regla v2:** ningún texto de interfaz baja de 10 px, y solo los chips llegan a ese tamaño. La regla de la v1 de «cifra al menos 5 veces más grande que su etiqueta» se sustituye por **cifra unas 3 veces más grande**, porque con 5× el top 10 no cabía en pantalla.

### Espaciado y forma

| | v1.1 | **v2** |
|---|---|---|
| `--gutter` | 32 / 14 px | **24 / 12 px** |
| Separación entre paneles (`--gap`) | 16–24 px (`--sp-4`/`--sp-5`) | **12 px** (10 px en móvil) |
| `--radius` | 0 | **2 px** en paneles, chips y botones |
| Alto de cabecera (`--hdr-h`) | 60 px (52 px en móvil) | **52 px** (48 px en móvil) |
| `--strip-h` | — | **32 px** (franja de edición) |

---

## 4. Logotipo [=]

Sin cambios: símbolo de cronómetro/radar a las 00:00, wordmark `ZERO│HOUR` con filete en `--ok`, subtítulo y firma.

Ajustes menores:
- **Favicon:** el cuadrado de fondo pasa a `#0A0E13`.
- **Cabecera:** el símbolo pasa a 26 px y el wordmark a 24 px. El subtítulo y la firma van en mono de 10 px y se ocultan por debajo de 1180 px.
- **Pie:** el lockup pasa a 40 px.

---

## 5. Componentes [v2]

### Cabecera y franja de edición (`.top` = `.hdr` + `.strip`)

La v1 tenía una cabecera translúcida y, debajo, un bloque grande «SEC-01 BRIEFING + fecha + edición + T+». En v2 todo eso se reduce a **dos barras opacas y fijas (sticky)**:

| Barra | Alto | Contenido |
|---|---|---|
| `.hdr` | 52 px, fondo `--bg-1` | Logo · navegación · UTC · hora local · LIVE |
| `.strip` | 32 px, fondo `--bg-0` | `LUN 02 NOV 2026 · EDICIÓN 13:47 · T+00:53:52` y, a la derecha, el estado de las fuentes |

- **Estado de las fuentes:**
  - Desde 1180 px: una lista en línea (`● NVD OK`).
  - Por debajo: un `<details>` con «11/11 FUENTES OK ▾», que abre la lista completa. Si alguna falla, el resumen pasa a «1 FUENTE CON ERROR» con borde `--fail`.
- **Móvil:**
  - La franja muestra `02.11 · 13:47 · T+…` y el desplegable de fuentes.
  - Los relojes UTC y local se ocultan; LIVE se queda.
  - La navegación baja a una barra inferior fija de 58 px con 4 pestañas.
- **Opacas:** el contenido ya no se transparenta al hacer scroll (era un defecto visible en las capturas reales).

### Panel (`.panel`)

| Parte | Estilo |
|---|---|
| Contenedor | Fondo `--bg-1`, borde de 1 px `--line-2`, radio de 2 px. Sin marcas de esquina ni sombras |
| Cabecera (`.panel__head`) | 40 px, fondo `--bg-2`, filete inferior `--line-2`. Título en mono de 11,5 px, peso 600, MAYÚSCULAS, tracking `.08em`. Metadatos a la derecha en mono de 11 px `--text-3` |
| Cuerpo | Padding de 12 × 14 px |
| Pie (`.panel__foot`) | Filete superior `--line-1`, padding de 8 × 14 px |

- **Se eliminan los códigos de sección** (`TOP-10`, `RDR-01`…). Eran decoración que no aportaba información.
- **Variante KEV (`.kevp`):** el borde pasa a crítica y la cabecera va en crítica al 14 % con el título en `#FF8095` (7,6:1).

### Franja de contadores (`.kpis`)

Seis contadores en **un solo panel**, separados por filetes verticales. En v1 eran seis tarjetas grandes.

| Contador | Dato | Notas |
|---|---|---|
| CVE nuevas (2,1 fr) | `stats.new_cves` | Barra de reparto por severidad de 5 px y leyenda `12 crítica 46 alta…` |
| Críticas | `stats.by_severity.CRITICAL` | |
| Explotadas · KEV | `stats.kev_new` | Cifra en crítica. En móvil la etiqueta es «KEV» |
| Con PoC | `stats.with_poc` | Producción puede mantener aquí su «EXPLOIT VERIFICADO» |
| Mi stack | `stats.in_stack` | Cifra en `--ok` |
| Remotas | `stats.remote` | |

- **Formato:** etiqueta mono de 11 px, cifra en Big Shoulders de 34 px y delta `▲ 47 % vs 7 d` en mono de 11 px. El delta va en ámbar si sube y en verde si baja.
- **Valor 0:** la cifra se pinta en `--text-3`.
- **Día vacío:** no se muestra ningún delta.
- **Altura:** 105 px en escritorio.
- **Móvil:** rejilla de 3 × 2, sin deltas ni leyenda, pero con la barra de severidad.

### Fila de CVE (`.row`) — top y listado

Sustituye a la `.trow` de la v1, que tenía 7 columnas.

```
│▌ 01  CVE-2026-117902  Fortinet · FortiWeb                      88 │
│▌     ▂▄▆█ CRÍTICA  CVSS 9.8  EPSS P96  [SSVC][EXPLOIT][DETECC.] +4  ▬▬▬│▬│ │
```

- **Rejilla:** posición (22 px) | bloque principal (1 fr) | score.
- **Línea 1:**
  - El ID en mono de 12,5 px y peso 600.
  - El fabricante y el producto en Hanken de 13,5 px.
  - Si `vendor` está vacío, se muestra *«Fabricante pendiente en NVD»* en cursiva `--text-3`.
- **Línea 2:**
  - Severidad (barras de color y texto neutro), CVSS y percentil EPSS en mono de 11 px `--text-3`.
  - Detrás, los chips: **como máximo 3 y un chip «+N»** con el resto en `title` y en texto para lectores de pantalla.
- **Línea 3 (solo en el listado, desde 1180 px):** el principio de la descripción en una línea, con `lang="en"`.
- **Borde izquierdo** de 3 px en el color del veredicto. Así el veredicto se lee en vertical.
- **Altura:** 46 px en el top y 58 px en el listado.
- **VIGILAR (`.is-dim`):** el ID y el producto pasan a `--text-2`.
- **Hover:** fondo `--bg-2` y el ID subrayado en `--ok`.
- **Móvil:**
  - El ID va solo en la línea 1 y el fabricante y producto en la línea 2.
  - Los chips van en la línea 3, como máximo 2 y «+N».
  - Se ocultan la severidad, el CVSS y el EPSS.
  - El score queda centrado a la derecha.

### Cabecera de grupo (`.grp`)

Separa el top y el listado (cuando se ordena por urgencia) por veredicto: `■ ACTUAR HOY · · · 2 CVE`.

- **Medidas:** 24 px de alto, fondo `--bg-0` y filete `--line-1`.
- **Si hay pocas CVE relevantes:** el top no se rellena de CVE de score 30 sin explicación. Quedan agrupadas bajo VIGILAR y atenuadas.

### Score (`.score`)

- **Cifra:** Big Shoulders 800 a 26 px, en el color del veredicto.
- **Barra:** 64 × 4 px con marcas en 40, 70 y 85.
- **Provisional:** relleno a rayas y asterisco en mono de 11 px.
- **`aria-label`:** «Score 44 de 100, provisional, PLANIFICAR».

### Chip de etiqueta (`.chip`) — **manda producción**

En la v1 se definieron 8 tags. Producción ya tiene aprobados 12 (`kev, ssvc, ransomware, exploit, deteccion, poc, stack, incibe, certeu, news, remote, library`), con su lógica de familias y relleno, y **esa lógica no cambia**.

Lo que cambia en v2 se aplica a todos los chips por igual:

| Propiedad | v1.1 | **v2** |
|---|---|---|
| Tamaño de letra | 9 px | **10 px** (11 px en la ficha) |
| Alto | 20 px | **18 px** en filas, 20 px base, 26 px en la ficha |
| Radio | 0 | **2 px** |
| Cuántos en una fila | Todos | **3 + «+N»** (2 + «+N» en móvil) |
| Orden | El del JSON | **El de la lista aprobada** (de explotación a técnica) |

La tabla del prototipo es una **aproximación** para poder enseñarlo. Si no coincide con producción, gana producción.

| Tag | Corto / largo (prototipo) | Familia |
|---|---|---|
| `kev` | KEV / EXPLOTADA · KEV | Explotación (relleno) |
| `ssvc` | SSVC / EXPLOTACIÓN ACTIVA · SSVC | Explotación (fondo tintado) |
| `ransomware` | RANSOM / RANSOMWARE | Explotación (borde doble) |
| `exploit` | EXPLOIT / EXPLOIT VERIFICADO | Exploit (relleno) |
| `deteccion` | DETECC. / PLANTILLA DE DETECCIÓN | Exploit (discontinuo) |
| `poc` | POC / POC SIN VERIFICAR | Exploit (borde) |
| `stack` | STACK / MI STACK | Propio (relleno claro) |
| `incibe` | INCIBE / AVISO INCIBE | Avisos (discontinuo) |
| `certeu` | CERT-EU / AVISO CERT-EU | Avisos (discontinuo) |
| `news` | NEWS / EN NOTICIAS | Avisos (borde) |
| `remote` | RED / REMOTA | Técnica (punteado) |
| `library` | LIB / LIBRERÍA | Técnica (borde azul) |

### Mapa de origen de ataques (`.mapp`) [v2]

**Ubicación:**

| Pantalla | Dónde va |
|---|---|
| Escritorio ≥ 1180 px | Columna central del briefing (unos 430 px de ancho), a la altura del top 10. Ya no ocupa más de media pantalla |
| 761–1179 px | Debajo del top, junto al radar |
| Móvil | Después del top, con 300 px de alto |

**Encuadre:** la altitud de cámara se calcula a partir de la forma del panel, `max(1,9; 1,8 × alto / ancho)`, para que el globo quepa a lo ancho en un panel alto. Al iniciar, la vista se centra en 30° N, 10° E.

**Zoom:**
- **Botones** `+` / `−` / `⌖`: 36 × 36 px, arriba a la derecha.
- **Gestos:** pellizco en táctil y **Ctrl + rueda** en escritorio. La rueda sola hace scroll de la página, para que el globo no «atrape» el scroll.
- **Límites:** altitud entre 0,45 y 3,2.
- **Autogiro:** se detiene al interactuar y vuelve con el botón de restablecer.
- **Vista plana:** el zoom funciona igual, cambiando el `viewBox` del SVG entre ×1 y ×4.

**Marcadores — un marcador por país** (antes había uno por punto, y con datos reales se solapaban):
- **Posición:** el punto de ese país con más ataques.
- **Tamaño:** `6 + t × 14` px, donde `t` es la escala logarítmica de ataques normalizada entre el mínimo y el máximo del día. En móvil se multiplica por 0,75.
- **Color por tramos relativos** (antes eran umbrales fijos, que con cientos de miles de ataques lo ponían todo en rojo):

  | `t` | Color |
  |---|---|
  | ≥ 0,72 | Alto (`--map-hi`) |
  | 0,40–0,72 | Medio (`--map-mid`) |
  | < 0,40 | Bajo (`--map-lo`) |

  La leyenda traduce los tramos a cifras reales: `● ≥ 44K ● ≥ 5,1K ● menos`.
- **Etiquetas:** solo para los 6 países con más ataques y nunca dos a menos de 9° de distancia. Formato `US 289K` en mono de 10,5 px sobre una placa `rgba(10,14,19,.82)`.
- **Ondas de superficie:** solo para los 12 primeros, con radio máximo de `1,2 + t × 3,4` grados.

**Cabecera del panel:** «ORIGEN DE ATAQUES» y en los metadatos `24 H · 378K · 21 PAÍSES`.

### Radar de urgencia (`.radarp`) [v2]

- **La geometría no cambia:** el centro equivale a 100 y hay anillos en 85, 70 y 40.
- **Legibilidad:**
  - Los nombres de sector pasan a 14 unidades de viewBox (unos 9–10 px reales) en `--text-2`, con un máximo de 9 caracteres.
  - Las etiquetas de los anillos pasan a 11,5 unidades.
- **Debajo del radar**, en lugar de la lista del anillo HOY:
  - Una frase que explica cómo se lee: «Cuanto más al centro, más urgente. Cada sector es un fabricante.»
  - El **reparto del top por veredicto** (ACTUAR HOY 2 · ESTA SEMANA 1 · PLANIFICAR 6 · VIGILAR 1). Los veredictos con 0 se atenúan.
  - La nota del asterisco, si hay scores provisionales.
- Si `vendor` está vacío, el sector se llama «SIN FABRICANTE». **Nunca** se usa el nombre de la CNA (ver `zerohour-cambios-v2.md`, programación).

### Resumen del día (`.sum`) [v2]

- **Contenido:** el texto de `latest.summary` sale del titular y pasa a un panel debajo del primer pantallazo.
- **Datos de la edición:** debajo del resumen va una lista con la edición (fecha larga), la hora de generación local y UTC, el T+ y la hora del mapa.
- **Lo que se elimina:** el titular grande «2 EXPLOTADAS ACTIVAMENTE» y su párrafo.

### Países de origen y puertos (`.rank`)

- Mono de 11,5 px, con una barra de 3 px por fila.
- **Países:** la barra está en escala logarítmica (indicado en la cabecera con «ESCALA LOG») y toma el color de su tramo del mapa.
- **Puertos:** escala lineal, en `--text-3`.

### Ficha de CVE [v2]

El orden de lectura pasa a ser **decisión → contexto → evidencias**:

1. **Migas** y botones Anterior / Siguiente. En móvil, los botones ocupan todo el ancho.
2. **Cabecera:**
   - El ID en Big Shoulders con el prefijo `CVE-2026-` en gris.
   - El fabricante y el producto (o «Fabricante pendiente en NVD»).
   - Los chips en versión larga.
3. **Panel «Qué hacer»** (`.decision`):
   - Un dial de 132 px (arco de 270°, trazo de 9) y el veredicto grande.
   - Una lista de acciones construida **solo con campos existentes**:

     | Si… | La acción dice |
     |---|---|
     | `kev` | Fecha límite (`kev.due_date`) y días que quedan |
     | `kev.ransomware` | Uso en campañas de ransomware |
     | `kev.action` | El texto de la acción requerida, en inglés |
     | Chip `ssvc` | Explotación activa según SSVC |
     | Chip `exploit` / `poc` | Hay exploit verificado / PoC sin verificar |
     | Chip `deteccion` | Existe plantilla de detección |
     | Chip `stack` | Afecta a tu stack |
     | Chip `library` | Es una dependencia |
     | Nada de lo anterior | Frase por defecto según el score |

4. **Métricas:** CVSS, severidad, EPSS y percentil, en una franja de 4 (2 × 2 en móvil).
5. **Descripción** con `lang="en"` y el **vector CVSS** decodificado. Los valores peligrosos van en ámbar.
6. **Columna derecha:**
   - El catálogo KEV, con las fechas en formato `05 NOV`.
   - El desglose del score, **generado a partir de `scoring_weights` y `score_breakdown`**, de modo que se adapta si cambian los pesos.
   - Exploits y PoC, con el aviso obligatorio.
   - Noticias, CWE y fuentes.

### Estados especiales [=, con ajustes]

- **Día vacío:**
  - Los contadores quedan a 0 en gris y sin deltas.
  - El top muestra «Nada que priorizar todavía».
  - El radar muestra «Sin contactos».
  - El resumen muestra «Sin datos de NVD para hoy todavía».
- **Fuente caída:**
  - El desplegable de fuentes pasa a rojo.
  - Aparece un aviso `.alert` (borde `--fail` y fondo al 8 %) con el error y la consecuencia: los scores afectados son provisionales.
- **Sin coincidencias:** igual que en v1.
- **Globo no disponible:** vista plana con un aviso en ámbar. El zoom sigue funcionando.

---

## 6. Iconos [=]

Siguen siendo propios: viewBox 16, trazo de 1,5 px y extremos rectos. Se añaden:

| Icono | Dibujo |
|---|---|
| `ssvc` | Semicírculo de indicador con la aguja a la derecha |
| `exploit` | Prompt `>_` con una marca de verificación |
| `deteccion` | Lupa con una raya horizontal |
| `certeu` | Escudo con un círculo |
| `plus` / `minus` / `reset` | Controles del zoom del mapa |

`poc` mantiene el prompt `>_` sin marca de verificación, para que no se confunda con `exploit`.

---

## 7. Movimiento [v2]

Lo que no aporta información se quita. Lo que indica que el sistema está vivo se queda.

| Animación | v2 |
|---|---|
| Barrido de fondo | **Se quita** |
| Barrido del radar (6 s / vuelta) | Se mantiene |
| Destello del blip | Se mantiene |
| Piloto LIVE (1,6 s, `steps(2)`) | Se mantiene |
| Reloj T+ cada 1 s | Se mantiene |
| Contadores que cuentan al cargar | **Se quita.** Con datos reales parecía que la cifra «no estaba lista» |
| Aparición escalonada del top 10 | **Se quita**, para que la primera lectura sea inmediata |
| Aparición de los puntos del globo | **Se quita** |
| Pulso de un punto del globo | Pasa de 2 anillos a **1**, con escala de 1 a 2,6 en 2,4 s (`--t-pulse`) |
| Ondas de superficie | Solo para los 12 primeros países |
| Autogiro del globo | Velocidad de 0,35 a **0,3**. Se detiene al tocar o pulsar zoom |
| Zoom con botones | Transición de cámara de 400 ms; restablecer, 600 ms |
| Dial de la ficha | **Sin animación** |
| Gráfica del histórico | **Sin animación** |
| Hover y foco | 120 ms (`--t-fast`) |
| Cambio de pantalla | **Sin fundido** |

Con `prefers-reduced-motion: reduce` se anulan todas las animaciones y transiciones, el globo no gira y no hay ondas.

---

## 8. Datos y notas para desarrollo [v2]

- **Contrato de datos:** el prototipo usa **el mismo contrato que producción** (`latest`, `map`, `index`). No se ha inventado ningún campo.
  - `latest.top` lleva objetos completos, como en producción, y no IDs como en la v1.
  - El desglose sale de `scoring_weights` y `score_breakdown`.
- **CSP:** el prototipo está escrito para la CSP de producción. Se ha comprobado sirviéndolo con la CSP real (`style-src 'self'`, `script-src 'self'`, `require-trusted-types-for 'script'`):
  - Nuestro código no genera **ninguna** violación en ninguna vista ni estado.
  - globe.gl genera las mismas 7 que ya trata producción (6 de `<style>` inyectado y 1 de `innerHTML`).
  - Patrones usados:
    - Sin `innerHTML` ni atributos `style`.
    - Variables CSS puestas con `el.style.setProperty` (CSSOM).
    - Una política Trusted Types `zh-globe` que solo admite la URL fija de globe.gl.
- **Reloj T+:** cuenta desde `latest.generated_at`, como ya hace producción.
- **Rutas:** `#briefing`, `#listado`, `#cve/<id>` (validado con `^CVE-\d{4}-\d{4,7}$`) y `#historico`. Sin cambios.
- **Comprobado en:**
  - **1440 × 900:** el top 10 termina en y = 883, así que todo el primer pantallazo cabe sin scroll.
  - **1024 × 768**, **390 × 844** (móvil, @2×) y la ficha en móvil.
  - Sin scroll horizontal en ningún caso.
