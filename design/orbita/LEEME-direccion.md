# ZEROHOUR · Entrega de DISEÑO → DIRECCIÓN · «Órbita» (04/11/2026)

**Estado:** Adrián ha elegido la propuesta **Órbita v2.2**. Según el traspaso, pasa primero por dirección y después a desarrollo.

## Qué hay en este paquete

| Archivo | Para quién | Qué es |
|---|---|---|
| `zerohour-orbita-v2-2.html` | Dirección y desarrollo | Prototipo del **briefing** con los datos reales de hoy (latest.json y map.json del 04/11). Se abre solo. Arriba se elige escritorio 1440 × 900, móvil 390 × 844 o las dos. El globo es interactivo. |
| `zerohour-estilo-orbita.md` | Desarrollo | Guía de estilo: paleta con contrastes, tipografía, composición, componentes, movimiento, accesibilidad y datos. |
| `zerohour-cambios-orbita.md` | Desarrollo | Lista de cambios: qué, en qué archivo del repo, por qué y con qué prioridad, más los criterios de aceptación. |
| `capturas/` | Todos | Escritorio, móvil (primera pantalla) y móvil completo, a 2×. |
| `fuentes/` | Desarrollo | Saira variable (normal e italic) y Azeret Mono 400/500, subconjunto latin, con sus licencias OFL. |

## Cómo se llegó aquí (resumen)

- **Ronda 1** (Boletín, Frente, Señal): rechazada por «poco ciber».
- **Ronda 2** (Perímetro, Órbita, Expediente, Táctico, Consola): Adrián elige **Órbita**.
- **v2:** globo con más «wow», top más legible y radar grande.
- **v3** «premium» (negro y champán, Michroma): **rechazada**; Adrián quiere los colores y la letra de la v2.
- **v2.1:** globo interactivo (girar, zoom y vuelta a girar a los 3 s) y márgenes corregidos.
- **v2.2:** «Lo primero hoy», plazo CISA, desglose del score, top ↔ radar enlazados, países que llevan el globo y control con teclado. **Aprobada por Adrián.**

## Qué necesito que revise dirección

1. **Las 4 decisiones abiertas** (§8 de la lista de cambios). Las importantes son dos:
   - **D1:** la rueda del ratón sobre el globo; propongo mantener «Ctrl + rueda».
   - **D2:** qué pasa con el panel de noticias, el resumen y la variación frente a ayer de la v2.
2. **Que el contrato de datos se cumple.** No he usado ningún campo nuevo. La interfaz solo **calcula** cinco cosas:
   - los días hasta el plazo de CISA;
   - el marcador por país;
   - los tramos del mapa;
   - la frase de «Lo primero hoy»;
   - el nombre del servicio de cada puerto.
3. **Alcance (D3):** si se implementa ya el briefing y las demás vistas heredan, o si quieres antes el prototipo de listado, ficha e histórico.

## Reglas del traspaso: cómo quedan

- **Contrato de datos:** sin campos nuevos.
- **4 veredictos con cortes 85/70/40:** con forma y texto, así que no dependen del color.
- **12 chips y sus familias:** se mantienen; Nuclei es «plantilla de detección».
- **Como mucho 3 + «+N»:** sí.
- **CSP:** en el prototipo no hay `style=`, handlers inline, `innerHTML`, CDN ni librerías nuevas. El globo de producción sigue siendo globe.gl.
- **AA:** el texto más flojo da 5,6:1; los chips rellenos, 7,3:1 o más. Se respeta `prefers-reduced-motion` y las zonas táctiles miden 44 px o más.
- **Mapa:** «Ranking DShield · IPs activas hoy», con `map.note` y `map.source` tal cual.
- **Aviso «PoC sin verificar»:** presente.
- **Tipografías:** Saira y Azeret Mono, ninguna de la lista negra.
