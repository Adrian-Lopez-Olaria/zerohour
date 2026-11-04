# ZEROHOUR — lista de cambios para desarrollo · «Órbita»

Versión 1.0 · 04/11/2026 · de diseño a **dirección (revisión)** → **desarrollo**
Referencias: `zerohour-orbita-v2-2.html` (prototipo del briefing) · `zerohour-estilo-orbita.md` (guía) · capturas en `capturas/`

> **Qué es:** el nuevo diseño del **briefing**, que sustituye a la v2 «consola SOC» (rechazada y congelada).
> **Qué no toca:**
> - el contrato de datos;
> - el pipeline (`radar.py`);
> - la CSP;
> - el enrutado;
> - las otras vistas (listado, ficha, histórico), que de momento solo heredan tokens, tipografía y chips (§7).
>
> **Cómo leer el prototipo:** es un solo archivo para poder abrirlo suelto, pero está escrito para separarse sin reescribirlo:
> - no hay atributos `style` ni handlers inline;
> - no hay `innerHTML`: todo es `createElement` y `textContent`;
> - el `<style>` pasa a `assets/css/*.css` y el `<script>` a `assets/js/*.js`.
>
> **Lo único que no va a producción** es el marco de presentación (`.viewer`, `.stage`, `.frame`, `zhViewer()`) y el globo SVG (§3.1).

Prioridad: **P1** = sin esto no es «Órbita» · **P2** = mejora acordada con Adrián · **P3** = pulido.

---

## 1. Tokens y tipografía

| # | P | Archivo | Cambio | Por qué |
|---|---|---|---|---|
| 1.1 | P1 | `assets/css/tokens.css` | Sustituir la paleta grafito v2 por la de la guía §1: `--bg-0 #04060C`, `--bg-1 #0A0F1C`, `--bg-2 #111A2E`, `--line #1C2945`, `--text-1/2/3`, `--acc #FFB547`, veredictos `#FF7D6E / #FFB547 / #E9D56E / #8393B4`, mapa `#FF8A5C / #FFC46B / #7FB8FF` y los tokens del globo. Retirar `--ok` como color de marca; el verde queda solo para el piloto de fuentes OK. | Nueva dirección de arte. Todo pasa AA (guía §1). |
| 1.2 | P1 | `assets/css/tokens.css` | `--radius` pasa de 2 px a: paneles 14 px, tira de cifras 12 px, chips 4 px, botones del globo 12 px. | Aspecto de producto, no de consola. |
| 1.3 | P1 | `assets/fonts/` + `fuentes.css` + `FUENTES.md` | Añadir **Saira** variable (`wdth` 50–125, `wght` 100–900, normal e italic) y **Azeret Mono** 400/500, subconjunto latin. Los archivos y sus OFL están en `fuentes/` de este paquete. Retirar Big Shoulders, Hanken Grotesk y Martian Mono, y actualizar los hashes de `FUENTES.md`. | Adrián eligió esta letra. Ambas OFL y autoalojables. |
| 1.4 | P1 | `tokens.css` | `--f-text: 'Saira'`, `--f-mono: 'Azeret Mono'`. Se elimina `--f-display`: las cifras van en Saira 300 con `tabular-nums`. Escala según la guía §2. | Una sola familia de texto. El mono solo para IDs y puertos. |
| 1.5 | P2 | `componentes.css` | Quitar `text-transform: uppercase` y el mono de `.panel__title`, `.btn`, `.sev`, `.vtag` y `.chip`. Las MAYÚSCULAS quedan solo en los rótulos cortos de la guía §2. | Adrián rechazó «todo mayúsculas y mono». |

## 2. Estructura del briefing — `render/briefing.js` y `briefing.css`

| # | P | Dónde | Cambio | Por qué |
|---|---|---|---|---|
| 2.1 | P1 | `renderBriefing()` + `briefing.css` | Rejilla de escritorio en **3 columnas: top 10 (440 px) · globo (1fr) · radar y puertos (330 px)**, separación 20 px y margen lateral 24 px. **Las tres columnas empiezan a la misma altura, 24 px por debajo de la tira de cifras.** | Composición «Órbita» y petición expresa de márgenes. |
| 2.2 | P1 | `briefing.css` (móvil) | Orden en el móvil: cabecera → lead → cifras 3 × 2 → globo (≈ 40 % de la primera pantalla) → 3 países → pie del mapa → top 10 (5 + «Ver las 10» con `<details>`) → radar → puertos. | Móvil prioritario. El globo engancha, pero el top llega pronto. |
| 2.3 | P1 | `kpiStrip()` | Tira de 6 celdas centrada (640 px en escritorio, 3 × 2 en el móvil) con el estilo de la guía §5.2. La cifra de KEV en `--v-hoy`. | Nuevo diseño. |
| 2.4 | P2 | nuevo `leadLine(latest)` | Componente **«Lo primero hoy»** (guía §5.1), en el hueco izquierdo de la fila de cifras en escritorio y bajo la fecha en el móvil. Se arma con `top[0]`: fabricante · producto (o el ID si el fabricante está pendiente), score, «explotada (KEV)» si tiene el tag `kev` y «en mi stack» si tiene `stack`. No se pinta con el top vacío. | La lectura de 5 segundos de cada mañana. |
| 2.5 | P1 | `topPanel()` + `comunes.js · cveRow()` | Top 10 agrupado con **rótulo por veredicto** (forma, texto y número). Filas accionables en 5 líneas y filas **compactas para «vigilar»** (guía §5.3). Se quita el borde izquierdo de 3 px de la v2. | Legibilidad, y que «vigilar» no compita con lo importante. |
| 2.6 | P2 | nuevo `dueLine(c)` en `comunes.js` | **Plazo CISA** desde `kev.due_date`, contado desde la fecha de `generated_at`, con los textos de la guía §5.4. Rojo si faltan 2 días o menos. | Es lo que de verdad marca la prisa de una KEV. |
| 2.7 | P2 | nuevo `breakdownBar(c)` en `comunes.js` | **Desglose del score** desde `score_breakdown` y `floor` (guía §5.5): barra SVG con `role="img"` y `aria-label`, más el texto debajo. Solo en las filas accionables. **Sirve también para la ficha (§7).** | Explica el número, y eso da credibilidad. |
| 2.8 | P2 | `topPanel()` + `radar.js` | **Top 10 ↔ radar enlazados.** Cada fila y cada punto llevan `data-id="CVE-…"`. Con `pointerover`/`focusin` en uno, `.is-hot` se pone en los dos (fila con `--bg-2`, punto ×1,7). Un solo listener delegado en la vista. | Por fin se entiende qué es cada punto del radar. |
| 2.9 | P1 | `mapPanel()` / `countriesPanel()` | Ranking de países **debajo del globo** (5 en escritorio, 3 en el móvil), con un filete del color de su tramo. **Cada país es un `<button>`** que lleva el globo hasta él (§3.4). | Integración del globo con los datos. |
| 2.10 | P2 | `portsPanel()` | Panel de puertos en la columna derecha, bajo el radar (6 puertos). El nombre del servicio sale de una tabla de la interfaz (`PORT_NAME` en el prototipo), no del JSON. | Ya estaba en el contrato y aprovecha el hueco. |
| 2.11 | P1 | `mapMeta()` / `mapFoot()` | El título sigue siendo **«Ranking DShield · IPs activas hoy»**, ahora en minúsculas normales y en MAYÚSCULAS solo por CSS. En el pie va `map.note` y `map.source` tal cual. | Honestidad del mapa (sin cambios de fondo). |
| 2.12 | — | `sumPanel()`, `newsPanel()`, `makeDelta()` | **No están en el prototipo. Lo decide dirección (§8, D2).** | — |

## 3. Globo — `assets/js/globe.js` (globe.gl, sin librerías nuevas)

> **3.1 · Importante:** el globo del prototipo es **SVG dibujado a mano** para poder enseñar el diseño en un archivo suelto. **En producción sigue siendo globe.gl.** Lo que hay que trasladar es el **aspecto** (§3.2) y el **comportamiento** (§3.3–3.5), no el código SVG.

| # | P | Dónde | Cambio |
|---|---|---|---|
| 3.2 | P1 | `createGlobe()` | **Aspecto.** En `globeMaterial()`: color `#0A1F44`, emissive `#030914`, `shininess` bajo. **Atmósfera** con `.showAtmosphere(true).atmosphereColor('#3B7BFF').atmosphereAltitude(0.18)`. Puntos de tierra en `#4F82D6` y retícula muy tenue. Marcadores `--map-hi/mid/lo` y anillos (`ringsData`) solo en los 5 primeros, con periodo de 2,8 s. |
| 3.3 | **P1** | `createGlobe()` línea 210 | **Que vuelva a girar al soltarlo.** Hoy `pointerdown` pone `autoRotate = false` y no lo devuelve nunca. Cambio: escuchar `ctr.addEventListener('start', …)` para parar y `ctr.addEventListener('end', …)` para programar `setTimeout(() => ctr.autoRotate = !S.reduced, 3000)`, cancelando el temporizador si vuelve a empezar. El zoom y la posición se conservan: OrbitControls ya lo hace. **Aplicar lo mismo a `zoomBy()` y a los botones.** |
| 3.4 | P2 | nuevo `flyTo(lat, lng)` exportado | `S.globe.pointOfView({ lat, lng, altitude: Math.min(actual, ALT_HOME * 0.62) }, S.reduced ? 0 : 900)`, parar el giro y aplicar la regla de los 3 s. Lo llaman los botones de país (2.9). |
| 3.5 | P2 | `createGlobe()` | **Teclado:** host con `tabindex="0"` y `aria-label` («Globo interactivo. Flechas para girar, más y menos para acercar o alejar, cero para volver a la vista inicial.»). `keydown` en el host: flechas → `pointOfView` ±12° · `+`/`-` → `zoomBy` · `0` → `resetView()`. |
| 3.6 | P1 | `zoomControls()` | Botones de 44 × 44 px con el estilo de la guía §5.7. Alejar se desactiva en `ALT_MAX` y acercar en `ALT_MIN`. **El icono ⟲ debe ser un SVG propio** (`zoomIcon`), no el carácter Unicode, que no está en el subconjunto latin de Saira. |
| 3.7 | P3 | `ROTATE_SPEED` | Unos 5°/s, como en el prototipo. En OrbitControls equivale a `autoRotateSpeed ≈ 0.8`; ajustar a ojo. Hoy está en 0.3. |
| 3.8 | P3 | `markerEl()` | Texto flotante «País: N ataques acumulados» con `aria-live="polite"` al pasar por encima. Etiquetas que no se pisen: hoy `labelSet()` elige cuáles; mantener esa lógica y separar las etiquetas cercanas. |

## 4. Radar — `assets/js/radar.js`

| # | P | Cambio |
|---|---|---|
| 4.1 | P1 | Estilo de la guía §5.9: anillo de 85 discontinuo coral, puntos con la forma del veredicto, barrido azul de 6 s y núcleo en `--acc`. En escritorio ocupa 290 px. |
| 4.2 | P2 | `data-id` en cada punto, para el enlace con el top (2.8). |
| 4.3 | P1 | Se mantiene «Sin fabricante» y nunca la CNA. Se mantiene el reparto por veredicto debajo. |

## 5. Chips — `componentes.css` (la lógica de producción no cambia)

| # | P | Cambio |
|---|---|---|
| 5.1 | P1 | Restilado según la guía §5.6 (familias, rellenos y contornos). Las 12 etiquetas y su orden (`TAG_ORDER`) no cambian; los textos cortos pasan a minúsculas normales («Mi stack», «Red», «Noticias»). |
| 5.2 | P1 | Se mantiene: como mucho 3 + «+N», el resto en `title` y texto oculto, y **«PoC*»** con el pie de aviso obligatorio. |

## 6. Accesibilidad y movimiento

| # | P | Cambio |
|---|---|---|
| 6.1 | P1 | `prefers-reduced-motion`: sin giro automático, sin pulsos, radar quieto y vuelo instantáneo. Arrastrar y hacer zoom siguen funcionando. |
| 6.2 | P1 | Foco visible con `outline` de 2 px en `--acc` en todo lo interactivo; en el globo, circular. |
| 6.3 | P1 | Zonas táctiles de 44 px o más (botones del globo, países, «Ver las 10», navegación). |

## 7. Resto de vistas (listado, ficha, histórico)

Por ahora **solo heredan** los tokens (§1), la tipografía, los chips (§5), la fila de CVE (2.5) y los rótulos de veredicto. Sin cambios de composición.

**En la ficha conviene añadir ya** el desglose del score (2.7) y el plazo CISA (2.6), porque los componentes son los mismos.

Diseño puede preparar el prototipo completo de las tres vistas si dirección lo pide antes de implementar (§8, D3).

## 8. Decisiones abiertas para dirección

| # | Decisión | Propuesta de diseño |
|---|---|---|
| **D1** | **Rueda del ratón sobre el globo.** En producción, hoy la rueda sin Ctrl hace scroll de la página (para no «atrapar» el scroll) y con Ctrl hace zoom. En el prototipo la rueda hace zoom siempre. | **Mantener «Ctrl + rueda» en producción** y que el texto de ayuda lo diga («Ctrl + rueda para acercar»). El pellizco y los botones + y − hacen zoom siempre. Así se cumple lo que pidió Adrián sin romper el scroll. |
| **D2** | **Panel de resumen (`sumPanel`), noticias (`newsPanel`) y variación frente a ayer (`makeDelta`).** No caben en el briefing de 1440 × 900. | Variación: una línea pequeña bajo cada cifra («+12 vs ayer») si `index.json` la da. Noticias: pasan al listado o a una sección bajo el briefing en el móvil. Resumen: lo sustituye «Lo primero hoy». |
| **D3** | **¿Prototipo completo** (listado, ficha, histórico) antes de implementar, o se implementa ya el briefing y las otras vistas heredan (§7)? | Implementar ya el briefing (es lo que Adrián usa cada mañana) y en paralelo prototipar la ficha, que es la que más gana con el desglose y el plazo. |
| **D4** | **Top 10 de relleno.** Hoy el top tiene 8 de 10 en «vigilar», casi todas con el fabricante pendiente. | Diseño ya las compacta. A valorar en el pipeline si el top debe llenarse siempre hasta 10. |

## 9. Cómo comprobarlo (criterios de aceptación)

1. **Escritorio 1440 × 900:** el briefing se ve entero sin scroll, con el top, el globo y el radar alineados arriba y 24 px por debajo de las cifras.
2. **Móvil 390 × 844:** sin scroll horizontal. Lo que debe verse primero: lead, cifras, globo y el top justo después.
3. **El globo:**
   - gira solo;
   - al arrastrarlo se para;
   - **a los 3 s de soltarlo vuelve a girar desde donde estaba y con el mismo zoom**;
   - ⟲ y la tecla 0 lo devuelven a la vista inicial;
   - el país del ranking lo lleva hasta allí.
4. **Con reducir movimiento:** no gira solo y no hay pulsos ni barrido.
5. **Pasar el ratón por una fila del top resalta su punto en el radar, y al revés.**
6. **Contraste AA** en todo el texto, comprobado con los valores de la guía §1.
7. **CSP intacta:** sin `style=`, sin handlers inline, sin `innerHTML` y sin peticiones a terceros.
