# ZEROHOUR — guía de estilo «Órbita» (v3 de la web)

**Inteligencia de vulnerabilidades** · por Adrián López Olaria
Versión 1.0 · 04/11/2026 · acompaña a `zerohour-orbita-v2-2.html` (prototipo) y a `zerohour-cambios-orbita.md` (lista de cambios)

> **Sustituye por completo a la guía v2 «consola SOC»**, que queda rechazada y congelada.
> Las reglas que no cambian (contrato de datos, cortes de veredicto, 12 chips, CSP, AA y honestidad del mapa) se repiten aquí para que esta guía se pueda leer sola.

---

## 0. Dirección de arte

**«Órbita»: el globo manda y los datos orbitan a su alrededor.** Es un mapa de amenazas en directo, pero creíble: espacio azul profundo, un globo vivo en el centro y, a sus lados, el top 10 y el radar.

Tres ideas que no se negocian:

1. **El globo es la pieza central, pero no se come los datos.** En escritorio ocupa la columna central. En el móvil va primero, pero no pasa del ~40 % de la primera pantalla, y justo debajo empieza el top.
2. **El color es información.** Coral, ámbar y amarillo solo marcan veredicto y urgencia. El ámbar `--acc` también hace de marca (navegación activa, enlaces, títulos del mapa). El azul es el «espacio» y el tramo bajo del mapa.
3. **Nada que suene a «hecho con IA».** Prohibido:
   - degradados de fondo a pantalla completa;
   - cristal o desenfoque;
   - cabeceras translúcidas;
   - emojis;
   - tarjetas con borde de color a la izquierda;
   - las tipografías de la lista negra.

   El único degradado permitido es la iluminación del propio globo.

---

## 1. Paleta

Todos los valores van como variables CSS en `tokens.css`. El contraste está medido contra los tres fondos.

### Superficies y líneas

| Token | Hex | Uso |
|---|---|---|
| `--bg-0` | `#04060C` | Fondo de página |
| `--bg-1` | `#0A0F1C` | Paneles (top 10, radar, puertos), tira de cifras, botones |
| `--bg-2` | `#111A2E` | Hover de fila, pista de barras, «Ver las 10» |
| `--line` | `#1C2945` | Bordes de panel y filetes entre filas (decorativo, no lleva texto) |

### Texto

| Token | Hex | Sobre bg-0 / bg-1 / bg-2 | Uso |
|---|---|---|---|
| `--text-1` | `#EAF1FF` | 17,9 / 16,9 / 15,3 | Texto principal, cifras |
| `--text-2` | `#A9B7D3` | 10,0 / 9,5 / 8,6 | Secundario, producto, chips técnicos |
| `--text-3` | `#8393B4` | 6,6 / 6,2 / 5,6 | Terciario, notas, pies |

### Acento de marca

| Token | Hex | Contraste | Uso |
|---|---|---|---|
| `--acc` | `#FFB547` | 11,5 / 10,9 / 9,9 | Navegación activa, enlaces, título del mapa, foco (`outline` de 2 px), núcleo del radar |

### Veredictos — **cortes fijos 85 / 70 / 40**

| Score | Token | Hex | Contraste (bg-1) | Forma (funciona sin color) | Texto |
|---|---|---|---|---|---|
| ≥ 85 | `--v-hoy` | `#FF7D6E` | 7,7:1 | ■ cuadrado lleno | Actuar hoy |
| 70–84 | `--v-semana` | `#FFB547` | 10,9:1 | ◧ medio lleno | Esta semana |
| 40–69 | `--v-planificar` | `#E9D56E` | 12,9:1 | □ cuadrado vacío | Planificar |
| < 40 | `--v-vigilar` | `#8393B4` | 6,2:1 | ○ círculo vacío | Vigilar |

Reglas:
- **El texto nunca va en rojo en masa.** El color va en la forma, en el rótulo del grupo y en la cifra del score de «actuar hoy» y «esta semana».
- **«Vigilar» siempre llama menos la atención que «planificar»:** cifra en `--text-2`, peso 300 y filas compactas.

### Mapa y globo

| Token | Hex | Uso |
|---|---|---|
| `--map-hi` | `#FF8A5C` | Tramo alto (tercio superior en escala logarítmica) |
| `--map-mid` | `#FFC46B` | Tramo medio |
| `--map-lo` | `#7FB8FF` | Tramo bajo, barras de puertos, barrido del radar |
| `--globe-land` | `#4F82D6` | Puntos de tierra en la cara visible |
| `--globe-land-far` | `#284C86` | Puntos de tierra cerca del borde (profundidad) |
| `--globe-rim` | `#3D6CC4` | Borde de la esfera |
| `--globe-atm` | `#3B7BFF` al 28 % | Atmósfera: anillo que se difumina hacia fuera |
| `--globe-sph` | `#0F2A57` → `#071634` → `#030914` | Esfera, luz desde arriba a la izquierda (único degradado permitido) |
| `--star` | `#9DB6E6` al 30–50 % | Estrellas de fondo, fijas, muy tenues |

### Desglose del score (barra de las accionables)

| Parte | Hex |
|---|---|
| CVSS | `#7FB8FF` |
| EPSS | `#B7A6FF` |
| Explotada | `--v-hoy` |
| Ransomware | `#FF4D6D` |
| Exploit | `--acc` |
| Mi stack | `--text-1` |
| Mínimo por explotada | Sin relleno, contorno de puntos `--text-3` |

La barra lleva `aria-label` con el desglose en texto, y debajo va siempre la versión escrita («CVSS 24 · EPSS 10 · …»). **El color nunca es la única pista.**

---

## 2. Tipografía

**Las dos familias son OFL y autoalojables.** Los `.woff2` y las licencias van en `fuentes/` dentro de este paquete. Ninguna está en la lista negra del traspaso.

| Familia | Archivo | Uso |
|---|---|---|
| **Saira** (variable, ejes `wght` 100–900 y `wdth` 50–125 %) | `saira-latin-wdth-normal.woff2` + `-italic` | Todo el texto y todas las cifras |
| **Azeret Mono** 400 / 500 | `azeret-mono-latin-400/500-normal.woff2` | Solo IDs de CVE y números de puerto |

Sustituyen a Big Shoulders, Hanken Grotesk y Martian Mono, que se retiran.

### Escala

| Elemento | Escritorio | Móvil | Peso / ancho |
|---|---|---|---|
| Marca «ZEROHOUR» | 19 px, tracking .12em | 19 px | 700 · 112 % |
| Cifras de la tira (844, 63…) | 26 px | 24 px | 300, `tabular-nums` |
| Título de panel | 15 px | 15 px | 700 |
| Título del mapa (MAYÚSCULAS) | 12,5 px, tracking .1em | igual | 700 · 87,5 % · `--acc` |
| Rótulo de grupo (MAYÚSCULAS) | 12,5 px, tracking .08em | igual | 700 · 87,5 % · color del veredicto |
| Fabricante · producto (accionables) | 16 px | 17 px | 600 / 400 |
| ID de CVE | 13 px | 13 px | Azeret 400 |
| Score (accionables) | 26 px | 30 px | 600 en el color del veredicto |
| Score («vigilar») | 18 px | 20 px | 300 · `--text-2` |
| Chips | 12 px (11 en filas compactas) | 12,5 px | 600 · 87,5 % |
| Notas y pies | 11–12 px | 11,5 px | 400 · `--text-3` |

Reglas:
- **Las mayúsculas solo van en rótulos de 1-3 palabras** (títulos del mapa, grupos de veredicto, «Plazo CISA»). Todo lo demás va en minúsculas normales. Adrián rechazó el «todo mayúsculas y mono» de la v2.
- **El mono solo se usa en IDs y puertos.**
- **Ningún texto de interfaz baja de 10,5 px.**

---

## 3. Logotipo

Se mantiene la idea del **cronómetro a las 00:00**, en su versión «barrido»:
- esfera con borde `--map-lo`;
- aguja vertical en las 12;
- un sector de barrido en `--acc` que sale de las 12 y avanza un poco en el sentido de las agujas del reloj.

Junto a él, el logotipo de texto «ZEROHOUR» en Saira 700, con ancho 112 % y tracking .12em.

El SVG del símbolo es `logoMark('sweep')` en el prototipo (32 × 32, trazos de 1,6–2 px), sin cambios de forma respecto al actual.

---

## 4. Composición

### Escritorio (1440 × 900, sin scroll)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ◔ ZEROHOUR                                Briefing Listado Ficha Histórico ●│  cabecera 52 px
│ ┌ LO PRIMERO HOY ─────────┐  ┌ 844 │ 63 │ 1 │ 35 │ 3 │ 482 ┐                │  lectura + tira de cifras
│ └─────────────────────────┘  └────────────────────────────────┘             │
│                                   ↕ 24 px                                    │
│ ┌ Las 10 que importan ┐   RANKING DSHIELD · IPS ACTIVAS HOY    ┌ Radar ────┐ │
│ │ ■ ACTUAR HOY        │                                       │           │ │
│ │ ◧ ESTA SEMANA       │             ( globo 560 px )          │  ( 290 )  │ │
│ │ ○ VIGILAR (compacta)│                                  + − ⟲│ reparto   │ │
│ │                     │   EE.UU. │ R.Unido │ Alemania │ …     ├ Puertos ──┤ │
│ └─────────────────────┘   pie con la fuente y la nota         └───────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
  columnas: 440 px | 1fr | 330 px · separación 20 px · margen lateral 24 px
```

- **El top 10, el globo y el radar empiezan a la misma altura, 24 px por debajo de la tira de cifras.** Es una petición expresa de Adrián: nada pegado.
- La tira de cifras mide 640 px y va centrada; «Lo primero hoy» ocupa el hueco de la izquierda, 360 px.

### Móvil (390 × 844, prioritario)

Orden, de arriba abajo:
1. cabecera;
2. fecha y fuentes;
3. «Lo primero hoy»;
4. cifras en 3 × 2;
5. globo (≈ 40 % de la pantalla) con los controles a la derecha;
6. 3 países;
7. pie del mapa;
8. **top 10** (5 visibles y «Ver las 10»);
9. radar;
10. puertos.

Sin scroll horizontal. Todas las zonas táctiles miden 44 px o más.

---

## 5. Componentes

### 5.1 «Lo primero hoy» (`.lead`)
- Es una frase que se arma con datos que ya existen, a partir de `top[0]`:
  - fabricante y producto (con la regla de «Fabricante pendiente en NVD», en cuyo caso se usa el ID);
  - el score;
  - «explotada (KEV)» si tiene el tag `kev`; si no, el veredicto;
  - «· en mi stack» si tiene el tag `stack`.
- Lleva la forma del veredicto a la derecha y enlaza a la ficha.
- **Si el top está vacío, no se pinta.**

### 5.2 Tira de cifras (`.strip`)
- Seis celdas: CVE nuevas, Críticas, Nuevas en KEV, Con PoC · sin verificar, Mi stack, Remotas.
- La de KEV lleva la cifra en `--v-hoy` y peso 500.
- Celdas separadas por un filete de 1 px de `--line`, con radio de 12 px en el conjunto.

### 5.3 Top 10 (`.top10`)
- **Rótulo por veredicto** antes de cada grupo: forma, texto en MAYÚSCULAS y, a la derecha, el número de CVE del top en ese veredicto.
- **Fila accionable** (actuar hoy, esta semana, planificar):
  - línea 1: posición, forma e ID (Azeret);
  - línea 2: fabricante · producto;
  - línea 3: chips (como mucho 3 + «+N») y CVSS;
  - línea 4: **Plazo CISA** (§5.4);
  - línea 5: **desglose del score** (§5.5);
  - a la derecha, el score grande y debajo «mín.» o «prov.».
- **Fila compacta** («vigilar»): una línea con el ID encima de fabricante · producto, los chips sin icono y el score pequeño.
- **Pie del panel:**
  - «PoC* = PoC pública sin verificar» (obligatorio cuando salen PoC);
  - «mín. = mínimo por explotada»;
  - «prov. = sin CVSS».
- En el móvil se muestran 5 filas y `<details>` «Ver las 10». En escritorio, las 10 abiertas.

### 5.4 Plazo CISA (`.due`)
- Sale de `kev.due_date` y se cuenta en días desde la fecha de `generated_at`. Textos: «en N días», «vence hoy» o «vencido hace N días».
- Si faltan 2 días o menos, se pinta entero en `--v-hoy`.
- El `title` explica que es la fecha límite de CISA para las agencias federales de EE. UU.
- **Solo aparece si la CVE está en KEV.**

### 5.5 Desglose del score (`.breakdown`)
- Barra de 0 a 100 y 6 px de alto, con un segmento por cada parte de `score_breakdown` distinta de 0, en el orden cvss, epss, explotada, ransomware, exploit, stack.
- Si existe `floor` y su valor supera la suma, un segmento punteado completa hasta `floor.value`.
- Debajo, el texto: «CVSS 24 · EPSS 10 · Explotada 25 · Exploit 6 · Mi stack 5 · mín. KEV → 85».
- **Solo en las filas accionables**, no en «vigilar».

### 5.6 Chips — los 12 aprobados, en 5 familias

El tratamiento depende de la familia:

| Familia | Chips | Tratamiento |
|---|---|---|
| Explotación | `kev` · `ssvc` · `ransomware` | `kev` relleno `--v-hoy` con texto `#2A0B06` (7,3:1); `ssvc` con contorno discontinuo coral; `ransomware` con doble filete interior |
| Código de ataque | `exploit` · `deteccion` · `poc` | `exploit` relleno `--acc` con texto `#2A1A04` (9,6:1); `poc` con contorno discontinuo ámbar y asterisco («PoC*»); `deteccion` con contorno ámbar (**«plantilla de detección», nunca «exploit»**) |
| Avisos | `incibe` · `certeu` · `news` | Contorno discontinuo `--line`, texto `--text-2` |
| Técnica | `remote` · `library` | Fondo `--bg-2`, sin borde |
| Propio | `stack` | Relleno `--text-1` con texto `--bg-0` (17,9:1) |

Además:
- Alto 21 px en escritorio (23 en móvil), radio 4 px e icono de 11 px.
- **Como mucho 3 + «+N».** El resto va en `title` y en un texto para lectores de pantalla.

### 5.7 Globo (`.globe`)

**Aspecto:**
- Esfera iluminada con atmósfera.
- Tierra en puntos, más tenue cerca del borde.
- Retícula muy fina y estrellas de fondo.
- **Un marcador por país:** la suma de ataques, colocada en la zona del país con más ataques. Tamaño y tramo en escala logarítmica.
- Los 5 primeros laten: anillo de 1 a 3,4 veces el radio, cada 2,8 s, con desfase entre ellos.
- Etiquetas «CC 1179,5 k» para los 6 primeros. **Se recolocan para no pisarse:** derecha, izquierda, arriba o abajo, y si no caben, no se pintan.

**Comportamiento (lo que ha pedido Adrián):**

| Acción | Resultado |
|---|---|
| Sin tocar | Gira solo, unos 5°/s |
| Arrastrar (ratón o dedo) | Gira el globo; el giro automático se para |
| Rueda / pellizco / botones + y − | Zoom de ×1 a ×3 |
| **Soltar** | **A los 3 s vuelve a girar solo desde donde estaba, con el mismo zoom** |
| ⟲ / tecla 0 | Vuelve a la vista inicial (lat 32, lon −36, ×1) |
| Pulsar un país del ranking | El globo vuela hasta él en 0,9 s (ease-in-out) y se acerca a ×1,6 como mínimo; luego, la regla de los 3 s |
| Teclado con el globo enfocado | Flechas = girar 12°/zoom · + y − = zoom · 0 = vista inicial |
| `prefers-reduced-motion` | No gira solo, sin pulsos y el vuelo es instantáneo; arrastrar y hacer zoom siguen funcionando |

**Controles y textos:**
- Botones de 44 × 44 px, radio 12 px, `--bg-1` y borde `--line`, con `aria-label` («Acercar», «Alejar», «Volver a la vista inicial»).
- El de alejar se desactiva a ×1 y el de acercar a ×3.
- Texto de ayuda: «Arrastra para girar · pellizca para acercar» en táctil, o «rueda para acercar» con ratón (`matchMedia('(pointer: coarse)')`).
- Al pasar por encima de un marcador sale «País: N ataques acumulados» en `--acc`, encima del globo (`aria-live="polite"`).

### 5.8 Ranking de países (`.cc`)
- Los 5 primeros países en escritorio y 3 en el móvil.
- Encima de cada uno, un filete de 2 px del color de su tramo.
- Nombre del país en español (`Intl.DisplayNames('es')`) y ataques acumulados en formato corto («1179,5 k»).
- **Cada país es un `<button>`** que lleva el globo hasta él (§5.7).

### 5.9 Radar (`.radar`)
- Distancia al centro = urgencia y ángulo = fabricante.
- **Sin fabricante, el sector se llama «Sin fabricante». Nunca la CNA.**
- Anillos en 85 (discontinuo coral), 70 y 40. Puntos con la forma de su veredicto.
- Barrido azul que da una vuelta cada 6 s. Se para con reducir movimiento.
- Debajo, el reparto del top por veredicto: forma, texto y número.
- **Enlazado con el top 10:** al pasar o enfocar una fila, su punto crece ×1,7 y la fila se ilumina (`--bg-2`), y al revés. Se enlazan por `data-id` = ID de la CVE.

### 5.10 Puertos más atacados (`.ports`)
- Sale de `map.json · top_ports`, con los 6 primeros: puerto (Azeret), servicio y registros en formato corto.
- Barra de 3 px de `--map-lo` proporcional al primero.
- **El nombre del servicio (SSH, RDP…) es una etiqueta de la interfaz a partir del número de puerto, no un dato del JSON.** Si el puerto no está en la tabla, el nombre va vacío.

---

## 6. Movimiento

| Qué | Duración | Con reducir movimiento |
|---|---|---|
| Giro del globo | ~5°/s, continuo | No hay |
| Pulso de los focos | 2,8 s | Anillo fijo al 50 % |
| Barrido del radar | 6 s por vuelta | Quieto |
| Vuelo a un país | 0,9 s | Instantáneo |
| Hover de fila o punto | 150 ms | Sin transición |

---

## 7. Accesibilidad (AA)

- **Contraste:** todo el texto pasa 4,5:1 o más (el mínimo real es 5,6:1, `--text-3` sobre `--bg-2`). Los textos sobre chips rellenos, 7,3:1 o más.
- **Sin depender del color:** los veredictos llevan forma y texto, la PoC lleva asterisco, el desglose tiene versión escrita y los tramos del mapa también se distinguen por tamaño.
- **Foco visible:** `outline` de 2 px en `--acc` y, en el globo, contorno circular.
- **Teclado:** el globo es enfocable (`tabindex="0"`) y tiene `aria-label` con las teclas; los países y los controles son `<button>`; las filas son enlaces a la ficha.
- **Lectores de pantalla:**
  - el globo y el radar son `role="img"` con un resumen;
  - el score tiene `aria-label` completo («Score 85 de 100, mínimo por explotada (KEV), actuar hoy»);
  - el «+N» de los chips lleva el texto oculto.
- **Zonas táctiles de 44 px o más.**

---

## 8. Datos y honestidad

- **Sin campos nuevos.** Todo sale de latest.json (`top`, `cves[*].{id, vendor, product, cna, cvss, epss_percentile, score, score_breakdown, tags, kev.due_date}`, `stats`, `sources_status`, `generated_at`) y de map.json (`points`, `by_country`, `top_ports`, `source`, `note`, `data_day`).
- **Lo que sí calcula la interfaz:**
  - los días hasta el plazo de CISA;
  - el marcador por país;
  - los tramos del mapa;
  - la frase de «Lo primero hoy»;
  - el nombre del servicio de cada puerto.
- **El mapa se titula «Ranking DShield · IPs activas hoy»** y en el pie va `map.note` y `map.source` tal cual. Nunca «ataques de las últimas 24 h».
- **Fabricante vacío:** se escribe «Fabricante pendiente en NVD · CNA x» y, en el radar, «Sin fabricante».
- **El aviso de PoC sin verificar es obligatorio** donde haya PoC.
