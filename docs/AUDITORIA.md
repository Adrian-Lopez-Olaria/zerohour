# Autoauditoría de seguridad · 4 de noviembre de 2026

Revisión completa del repositorio (fase 9) antes de dar por cerrado el rediseño «Órbita».
Herramientas ejecutadas en local sobre `main`, en un entorno aparte (no forman parte de las
dependencias del proyecto).

| Herramienta | Versión | Alcance | Resultado |
|---|---|---|---|
| gitleaks | 8.30.1 (checksum de la release verificado) | historial completo (47 commits) y árbol de trabajo | 0 secretos |
| bandit | 1.9.4 | `scripts/`, `tests/pipeline/` | 2 en `scripts/`, corregidos (ver abajo); en los tests, solo avisos bajos por `subprocess` |
| pip-audit | 2.x | `requirements.txt` y `requirements-dev.txt` (con hashes) | 0 vulnerabilidades |
| npm audit | npm 11 | `tests/e2e/`, `despliegue/` | 0 vulnerabilidades |
| zizmor | 1.32.0, perfil `auditor` | `.github/workflows/` | 4 informativos, corregidos; 1 aviso aceptado |
| semgrep | 1.183.0, reglas `p/javascript`, `p/python`, `p/secrets`, `p/github-actions`, `p/xss`, `p/security-audit` | `web/` (sin `vendor/`), `scripts/`, `.github/`, `tests/e2e/` | 5: 2 corregidos y 3 aceptados |
| retire.js | 6.1.0 | `web/` (incluye el bundle de globe.gl con three.js r185) | 0 librerías vulnerables |

## Hallazgos y qué se hizo

1. **bandit B324 / semgrep `insecure-hash-algorithm-sha1`.** Aparece en `scripts/radar.py`, en la verificación de la base de DB-IP.
   - DB-IP solo publica SHA-1, y aquí sirve para comprobar integridad, no como firma: quien pudiera cambiar el fichero en DB-IP también cambiaría el hash de su página.
   - Se marca `hashlib.sha1(usedforsecurity=False)` y se explica en un comentario.
   - **Corregido.**
2. **bandit B310 / semgrep `dynamic-urllib-use-detected`.** Aparece en `scripts/vendor_globe.py`.
   - `urlopen` también abriría `file://`.
   - Ahora `fetch()` rechaza cualquier URL que no empiece por `https://` antes de abrirla.
   - **Corregido.**
3. **zizmor `anonymous-definition` (4).** Eran jobs sin `name`. Se les pone el mismo nombre que el id, así que los checks se siguen llamando igual. **Corregido.**
4. **zizmor `secrets-outside-env`.** `NVD_API_KEY` está en el job `recolectar` sin entorno.
   - Es una clave gratuita que solo amplía el límite de peticiones a la NVD.
   - El job solo corre en `main` (programado, por push o manual) y tiene `contents: read`.
   - Aceptado el 04/11. **Corregido el 05/11:** vive, junto con `CLOUDFLARE_RADAR_TOKEN`, en el entorno `recolectar`, restringido a `main`.
5. **semgrep `unsafe-add-mask-workflow-command` (2).** Aparece en `radar.yml`, en los jobs `recolectar` y `publicar`.
   - El ataque descrito (`::stop-commands::` en un workflow modificado) exige poder ejecutar workflows en el repositorio, y quien puede hacerlo ya tiene el token.
   - El `add-mask` es necesario porque Actions enmascara el token, pero no su base64.
   - **Aceptado**, con la justificación al lado de cada línea.
6. **semgrep `gha-curl-pipe-shell` (1).** Aparece en `radar.yml`, en «Comprobar producción».
   - Es `curl … | python3 -c '<programa fijo>'`: se lee el JSON publicado por la entrada estándar, y no se ejecuta nada descargado.
   - **Falso positivo.**
7. **Código muerto en `detalle.js`.** Ponía el `href` de una pestaña «Ficha» que ya no existe en la navegación.
   - Con un ID no válido habría escrito `href="null"`.
   - **Eliminado.**

> semgrep no reconoce `# nosemgrep` dentro de un bloque `run: |` de YAML, porque para el YAML ese comentario es texto del script. Por eso los puntos 5 y 6 siguen saliendo en sus informes, aunque tengan la justificación en el código.

## Revisión manual

### CSP

Producción sirve (desde el 08/11, con los dos endurecimientos de abajo aplicados):

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'none'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests; require-trusted-types-for 'script'; trusted-types 'none'
```

Junto con:
- HSTS con preload;
- COOP y CORP `same-origin`;
- `X-Frame-Options: DENY`;
- `nosniff`;
- `Referrer-Policy`;
- una `Permissions-Policy` restrictiva.

Lo que se ha comprobado:
- No hay `unsafe-inline`, `unsafe-eval` ni ningún origen de terceros.
- Los estilos dinámicos usan CSSOM (`style.setProperty`), que la CSP permite.
- La librería del globo se carga con `import()`, que no es un sink de Trusted Types, así que no hay ninguna política creada.
- Las pruebas E2E verifican que no se produce ninguna violación en las 4 vistas, también con los datos XSS.

Endurecimientos propuestos en esta auditoría y **aplicados el 08/11** (aprobados por dirección):
- `trusted-types 'none'`: ningún script puede crear una política para saltarse Trusted Types.
- `img-src 'self'`: los favicons pasan de `data:` a ficheros propios (`web/assets/favicon.svg` y `favicon-404.svg`).
- Tras el cambio: 0 violaciones en los E2E y Mozilla HTTP Observatory A+ (145, 12/12) en un escaneo nuevo.

### Flujo dato externo → DOM

Los datos de NVD, KEV, GHSA, RSS, PoC y DShield se tratan como hostiles.
- `data.js` normaliza cada campo: números con `num()`, que deja `null` si no es finito; textos con `String()`; e IDs con `ID_RE` anclado.
- Todo el DOM se construye con `el()`/`svg()` (`util/dom.js`). Esas funciones:
  - escriben el texto con `textContent`;
  - descartan atributos `on*`, `html`, `innerHTML`, `outerHTML` y `srcdoc`, y nombres de atributo raros;
  - pasan por `safeUrl()` toda URL que no empiece por `#`. `safeUrl()` solo acepta `http(s)` absolutas y rechaza cualquier carácter de control.
- Los enlaces externos salen de `extLink()`, con `rel="noopener noreferrer"`; los de PoC añaden `nofollow ugc`.
- No hay `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function` ni `setTimeout` con cadenas en el código propio. Se ha comprobado con grep y con semgrep.
- Los únicos valores de datos que acaban en CSS son números (anchos de barra, `flex` del histórico y tamaño de los marcadores).

## Actualización · 8 de noviembre de 2026 (antes del lanzamiento)

| Cambio | Commit | Comprobación |
|---|---|---|
| CSP: `trusted-types 'none'` e `img-src 'self'` (ver arriba) | `66c501e` | 0 violaciones en E2E; Observatory A+ (145) |
| `user_agent` sin marcadores de posición: `ZEROHOUR/1.0 (+https://zerohour-cve.dev)` | `6d20238` | sin `TU_USUARIO`, `RadarCVE` ni `radar-cve` en el código |
| Fuera la plataforma de hosting anterior: las cabeceras viven en `cabeceras.toml` (única fuente) | `535e303`, `0db0572` | cabeceras servidas en producción idénticas antes y después (`curl -sI` en 5 rutas) |
| Fuera del repo el material de trabajo (prototipos, órdenes, traspasos, encargo del pentest) | `82af2c7` | sin enlaces rotos; `.gitignore` impide que vuelva |
| Correo personal en el historial | — | clon nuevo, `git log --all -p` en todas las ramas: 0 apariciones; solo direcciones `noreply` como autoras |
| Test de secretos de los workflows al día | `66c501e` | distingue el token de Radar (`recolectar`) del de despliegue (`desplegar`) |

### Honestidad de los datos del mapa

- **Frecuencia de las rayas.** Las rayas de Cloudflare Radar se ven como disparos cuya frecuencia es proporcional al % real de cada par. El reparto es determinista (`web/assets/js/planificador.js`, ventanas Pfair centradas) y está probado: con 50/2/1, recuentos exactos, ±1 en cualquier prefijo y sin huecos largos en los pares pequeños; con los 28 pares reales, ±1,5. La web lo explica en el panel ⓘ del mapa.
- **H1, cerrado el 08/11 sin `scope`.** Solo queda la llamada global de Radar (`limit=100`): los % filtrados por país (`&location=XX`) son del tráfico con origen en ese país y no son comparables con los globales. Se quitaron `RADAR_LOCATIONS`, el campo `scope` y su peso fijo de 0,5 en el planificador; todos los share de `map.json` son del total mundial.

### Mapa: cambios de la noche del 08/11

| Cambio | Comprobación |
|---|---|
| Bolitas de todos los países, mismo tamaño, color por tramo y gris para las zonas de baja actividad | E2E: más de 150 bolitas visibles; España, sin datos de DShield en el fixture, sale en gris y su panel dice solo «Zona de baja actividad»; el criterio de clasificación está solo en el panel ⓘ |
| Bolitas WebGL (`pointsData` con `pointsMerge`) en lugar de nodos DOM | E2E: 0 `.gm__dot` sin foco y como mucho 6 nodos (etiquetas) |
| Hover, toque y panel de país (el giro solo se para sobre una bolita; área de detección de 1,8 radios) | Sin `pointLabel` ni tooltips de globe.gl (van por `innerHTML`); `enablePointerInteraction(false)` se mantiene y la detección es propia. El panel usa `el()` y `textContent`. E2E de hover, toque y ranking con 0 violaciones de CSP y de Trusted Types |
| Desplegables «N de N fuentes» y ⓘ | Se cierran con un clic fuera y con Esc, llevan `aria-expanded` y devuelven el foco al botón (E2E) |
| Radar: hasta 100 pares (`limit=100`) | `validar_datos.py` rechaza ahora `attack_pairs` con más de 100 pares, códigos que no sean ISO-2 o % fuera de 0–100; `data.js` corta en 100 por defensa en profundidad |
| Rendimiento (local, mediana de pasadas alternas) | Escritorio sin cambios (Lighthouse 90 → 90). Móvil: Lighthouse 64,5 → 56 y TBT 439 → 695 ms, una **regresión** que no viene de las bolitas (sin ellas también aparece) ni del JavaScript propio (perfil de CPU igual); pendiente de atribuir y de confirmar en producción |
| España sin marcador | Diagnóstico con datos en bruto: 0 IPs españolas en el top 3000 de DShield del 08/11. No había ningún filtro en el código (ver README) |

| DShield: 3300 IPs (antes 3000) | Medido con la API en bruto: con 10000 la API devuelve 5342 filas y `map.json` crece un 96 %; 3300 es el máximo con ≤ +20 % (126 países frente a 113) |
| Pie de la web: una línea de fuentes | Quedan las licencias obligatorias enlazadas (DB-IP CC BY 4.0, Cloudflare Radar CC BY-NC 4.0) y el aviso de NVD; lo comprueba un E2E |

### Pentest externo

Pendiente. Cuando se haga, el resumen del informe irá en `docs/`.

## Actualización · 10 de noviembre de 2026 · planificador `zerohour-cron`

**Problema.** El `schedule` de GitHub Actions se encola cuando GitHub tiene carga. Del 5 al 9 de noviembre, el diario de las 05:17 UTC arrancó entre 6 h 27 min y 8 h 37 min tarde. El 9/11 la edición salió de un run manual a las 09:31 UTC, y la programada llegó a las 13:54 y la volvió a publicar. Del 9/11 00:41 al 10/11 03:41, de 10 lecturas del mapa salieron 3.

**Decisión.** Los runs los lanza un Cron Trigger de Cloudflare: el Worker `zerohour-cron` hace `workflow_dispatch` a las 05:00 UTC (daily) y a las :41 cada 3 h (map). El `schedule` de GitHub queda solo como respaldo.

| Control | Cómo | Comprobación |
|---|---|---|
| Separación de privilegios | Worker aparte del de la web: el Worker público (`zerohour`) sigue sin código ni secrets. Se despliega a mano; el token de Cloudflare del CI no cambia de permisos ni lo toca | `test_wrangler_solo_estaticos_y_sin_vistas_previas` (la web sigue sin `main`); `cron/` fuera de los `paths` de despliegue |
| Token mínimo | Fine-grained, solo el repo `zerohour`, **Actions: Read and write** (más *Metadata: Read-only*, obligatorio). No permite leer secrets ni escribir en el repo. Caduca en un año: renovar antes del 10/11/2027 | Secret del Worker (`wrangler secret put`), nunca en un fichero ni en el repo |
| Sin superficie pública | `workers_dev: false`, `preview_urls: false`, sin rutas; además el `fetch` responde 404 a todo | `tests/unit/cron.test.mjs` |
| Sin fugas en el log | Ante un fallo se registran el estado y el cuerpo (500 caracteres como máximo), nunca las cabeceras | test «el token nunca aparece en el log» |
| Reintento acotado | Uno solo, a los ~20 s o lo que diga `Retry-After` (hasta 5 min), y solo ante un error de red, un 5xx o un 429. 401/403/404/422 solo se registran | tests de 401–422, 5xx, 429, red y `Retry-After` |
| Sin duplicados | `scripts/ya_publicado.py` en el gate de `recolectar`: un `daily` con la edición de hoy (fecha de Madrid) ya publicada, o un `map` con menos de 150 min, termina en verde sin publicar. `force` lo salta | `test_workflow_gate_no_publica_dos_veces`, `test_ya_publicado_*` |
| Sin dependencias nuevas | `fetch` del runtime; wrangler fijado de `despliegue/` (4.151.1) | `wrangler deploy --dry-run`: 3,22 KiB, sin bindings |
