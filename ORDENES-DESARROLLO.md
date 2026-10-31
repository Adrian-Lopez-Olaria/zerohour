# ZEROHOUR · Órdenes para el departamento de desarrollo

Eres el desarrollador principal de **ZEROHOUR**, una web de inteligencia de vulnerabilidades que irá al portfolio de LinkedIn de Adrián López Olaria, técnico de ciberseguridad. El listón es el de un producto profesional y el de un proyecto de seguridad: **va a revisarla gente del sector, así que la propia web tiene que ser un ejemplo de buenas prácticas.**

Trabaja por fases. Al terminar cada fase: comprueba que funciona, haz un commit con un mensaje claro y dame un resumen corto (qué has hecho, qué has comprobado y qué decisiones has tomado). No empieces la siguiente fase sin mi OK.

---

## 0. Antes de tocar nada: lee y planifica

Lee enteros estos archivos:
- `README.md`: el pipeline de datos y el formato de los JSON.
- `scripts/radar.py` y `config.toml`: el script que genera los datos cada día en GitHub Actions.
- `design/zerohour-prototipo.html`: el prototipo de diseño. **Es la referencia visual; respétalo al píxel.**
- `design/zerohour-estilo.md`: la guía de estilo (tokens, componentes, animaciones y estados).

Después, preséntame un plan breve con la estructura de archivos, el orden de trabajo y las dudas que tengas. **No programes hasta que lo apruebe.**

---

## 1. Discrepancias entre el diseño y los datos reales

**Manda el contrato de datos del script.** El prototipo usa datos inventados en `ZEROHOUR_DATA`; la web real lee los JSON.

| Tema | Prototipo | Realidad / qué hacer |
|---|---|---|
| `latest.top` | Lista de IDs | El script ya da **objetos CVE completos**. Usa los objetos directamente. |
| Desglose de la puntuación | CVSS /35, EPSS /30, KEV /20, PoC /10, stack /5 | Los pesos reales están en `config.toml` → `[puntuacion]`: CVSS 35, EPSS 20, KEV 25, ransomware 5, PoC 10, stack 5. **Modifica `radar.py`** para que cada CVE lleve `score_breakdown` ({cvss, epss, kev, ransomware, poc, stack} con los puntos obtenidos) y `latest.json` lleve `scoring_weights` con los máximos. El dial del detalle se pinta a partir de esos datos; nada de valores fijos en el código. |
| Reloj T+ | Cuenta desde las 07:00 (`EDITION_HOUR`) | Debe contar desde `latest.generated_at`. Quita la constante. |
| Hora de la edición | 07:00 | El cron va a las 05:17 UTC (06:17 en invierno y 07:17 en verano). En los textos, usa la hora real de `generated_at` en horario de Madrid. |
| Estado de las fuentes | OK / PARCIAL / ERROR | `sources_status` trae `"ok"` o `"error: Tipo"`. `"ok"` se muestra como OK, cualquier `error` como ERROR (con el mensaje en el tooltip) y una fuente que no venga como PARCIAL. |
| Delta frente a la media de 7 días | — | Calcúlalo con `data/index.json`. Si no hay 7 días de histórico, no muestres delta, en lugar de inventarlo. |
| Puertos más atacados | — | `map.json` → `top_ports`. |
| Descripciones | — | Vienen en inglés desde NVD. Se muestran tal cual, con `lang="en"` en el elemento. |
| Estados `?estado=vacio` / `?estado=error` | Datos de ejemplo | Mantén el visor de estados **solo en desarrollo** (por ejemplo, detrás de `?debug=1` o en un archivo `fixtures/`), nunca en producción. |

Si encuentras más discrepancias, apúntalas y pregúntame antes de decidir.

---

## 2. Arquitectura del frontend

- **Vanilla HTML, CSS y JS (módulos ES), sin framework y sin paso de build.** Es estático y ligero, y así se audita fácil.
- **Estructura:**
  ```
  web/
    index.html
    assets/css/        (tokens.css, base.css, componentes…)
    assets/js/         (main.js, router.js, data.js, render/*.js, globe.js, radar.js, chart.js, util/dom.js)
    assets/fonts/      (woff2 autoalojadas)
    assets/vendor/     (globe.gl y three.js, versión fija, autoalojados)
    assets/geo/        (datos de tierra para el globo y la vista plana)
    .well-known/security.txt
    404.html
    robots.txt
  ```
- **Sin CSS ni JS inline en el HTML.** Todo va en archivos externos, para que la CSP pueda ser estricta (ver la fase 4). Los manejadores de eventos se ponen con `addEventListener`, nunca con `onclick=""`.
- **Datos:** `fetch('data/latest.json')`, `data/map.json`, `data/index.json` y `data/days/AAAA-MM-DD.json` para el histórico. Usa `cache: 'no-cache'`. Vuelve a pedir `map.json` cada 10 minutos si la pestaña está visible.
- **Rutas con hash, como en el prototipo:** `#briefing`, `#listado`, `#cve/<id>` y `#historico`. Valida `<id>` con la regex `^CVE-\d{4}-\d{4,7}$` antes de usarlo.
- **Errores:** si falla un JSON, muestra el estado de error del diseño, nunca una pantalla en blanco. Si falla `map.json`, el resto de la web debe seguir funcionando.
- **Globo:** globe.gl autoalojado, con el respaldo de vista plana en SVG del prototipo (sin WebGL o si tarda más de 9 s). Que cargue en diferido (después del contenido principal), para no penalizar el LCP.

---

## 3. Seguridad del código (crítico: los datos vienen de fuentes externas)

Las descripciones de NVD, los títulos de RSS, los nombres de repos de PoC y las URLs vienen de internet. **Trátalos como hostiles.**

1. **Nunca uses `innerHTML`, `outerHTML`, `insertAdjacentHTML` ni `document.write` con datos.** Crea los nodos con un helper `el(tag, attrs, children)` y escribe el texto con `textContent`. Si necesitas plantillas, solo con contenido estático y fijo.
2. **URLs:** pasa todas las URLs externas por `safeUrl()`. Solo se aceptan `https:` y `http:`; si no, el enlace no se pinta. Así se evitan los enlaces `javascript:` y `data:`.
3. **Enlaces externos:** `target="_blank" rel="noopener noreferrer"`.
4. **Sin `eval`, `new Function` ni `setTimeout` con strings.**
5. **Trusted Types:** activa `require-trusted-types-for 'script'` en la CSP y comprueba que la web funciona sin violaciones. Si globe.gl o three.js lo rompen, dímelo antes de quitarlo.
6. **Saneamiento también en el script Python:** en `radar.py`, descarta las URLs de referencias, noticias y PoC que no sean http(s) y recorta los textos a una longitud máxima razonable. Es defensa en profundidad.
7. **Las PoC son contenido controlado por terceros.** Cualquiera puede crear un repo en GitHub llamado como una CVE, con el nombre y la descripción que quiera. En consecuencia:
   - Trata `poc[].name` y `poc[].description` como texto 100 % hostil.
   - Muestra junto a las PoC el aviso: *«PoC públicas sin verificar: algunas son falsas o contienen malware. No las ejecutes fuera de un laboratorio aislado.»*
   - Los enlaces a PoC llevan además `rel="noopener noreferrer nofollow ugc"`.
8. **Sin secretos en el frontend** (ni claves de API ni tokens). Todo lo que necesite claves va en GitHub Actions.
9. **Sin trackers ni analytics de terceros.** Si quiero estadísticas más adelante, lo decidiremos aparte.

---

## 4. Despliegue en Netlify y cabeceras de seguridad

Usamos **Netlify** y no GitHub Pages porque GitHub Pages no deja configurar cabeceras HTTP. El objetivo es sacar **A+ en securityheaders.com y en Mozilla HTTP Observatory**, para poder enseñarlo en LinkedIn.

Crea `netlify.toml` en la raíz:
- **Build:** `command = "mkdir -p web/data && cp -r data/. web/data/"` y `publish = "web"`. Así en la web solo se publica `web/` (no se publican `scripts/` ni `config.toml`).
- **Cabeceras para `/*`:**
  - `Content-Security-Policy`: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests; require-trusted-types-for 'script'`. Ajústala **solo si algo lo exige de verdad** y justifica cada excepción. Si globe.gl necesita `blob:` para workers, déjalo solo en `worker-src`.
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy`: desactiva lo que no se usa: `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()…`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `X-Frame-Options: DENY`, por compatibilidad con navegadores antiguos.
- **Caché:** `assets/*` inmutable durante 1 año (los nombres de archivo llevan versión o hash); `data/*.json` con `no-cache` (se revalida siempre); `index.html` con `no-cache`.
- **`.well-known/security.txt`** (RFC 9116), con contacto y `Expires`. Pídeme el email que quiero poner.
- **`404.html`** con el estilo de la web.

**Comprueba la CSP en local** sirviendo `web/` con un pequeño servidor que mande las mismas cabeceras. Prepara `scripts/dev_server.py`, que lea las cabeceras de `netlify.toml`, para que no haya sorpresas en producción. La consola tiene que quedar con **0 violaciones de CSP**.

---

## 5. Seguridad del repo y de la cadena de suministro

- **GitHub Actions:**
  - Fija cada acción por **SHA de commit** (con un comentario indicando la versión) en lugar de `@v4`.
  - Mantén `permissions` mínimos.
  - Añade `step-security/harden-runner` en modo audit si no complica.
- **Dependencias Python fijadas:** versiones exactas en `requirements.txt`. Mejor aún, con hashes (`pip-compile --generate-hashes`) e `--require-hashes` en el workflow.
- **`.github/dependabot.yml`** para `pip` y `github-actions`.
- **Librerías del frontend autoalojadas:** apunta en `web/assets/vendor/VERSIONS.md` la versión, la URL de origen y el hash SHA-256 de cada archivo.
- **`SECURITY.md`** con la política de reporte de vulnerabilidades.
- **`LICENSE`:** recomiéndame una (MIT, por ejemplo).
- **Avisos legales en el pie:**
  - Atribución de las fuentes (NVD, CISA KEV, FIRST EPSS, GitHub Advisories, INCIBE-CERT, SANS ISC, ip-api).
  - La frase que exigen las condiciones de uso de NVD: *"This product uses the NVD API but is not endorsed or certified by the NVD."*

---

## 6. Calidad, accesibilidad y rendimiento

- **Responsive real:**
  - Comprueba en 1440, 1024, 768 y 380 px.
  - En móvil manda el top 10 (se consulta por la mañana desde el móvil).
- **Accesibilidad AA:**
  - Foco visible.
  - Navegable entero con teclado (incluidos los blips del radar y los filtros).
  - `aria-live` educado para el reloj T+ (que no lea cada segundo).
  - Respeta `prefers-reduced-motion` tal como dice la guía.
  - Textos alternativos en el globo y el radar, con resumen textual de los datos.
- **Rendimiento:**
  - Fuentes `woff2` autoalojadas, con subset latino y `font-display: swap`.
  - Precarga solo de la fuente del titular.
  - El globo, en diferido.
  - El listado de CVE tiene que ir fluido con 300 CVE, así que pagina o virtualiza si hace falta.
- **Pruebas automáticas** con Playwright (el de Node vale):
  - Carga las 4 rutas con datos de ejemplo (`fixtures/`) y comprueba que **no hay errores en consola ni violaciones de CSP**.
  - Un test de XSS: una fixture con `<img src=x onerror=alert(1)>` en descripción y título y un enlace `javascript:alert(1)`. Debe mostrarse como texto, sin ejecutarse, y el enlace no debe pintarse.
  - Comprueba que el respaldo de vista plana aparece si WebGL no está disponible.
  - Capturas de pantalla en escritorio y móvil para compararlas con el prototipo.
- Al final, pasa **Lighthouse** y pásame las puntuaciones (objetivo: 90 o más en las cuatro categorías).

---

## 7. Fases de trabajo

| Fase | Entregable |
|---|---|
| **0** | Plan y dudas (sin código) |
| **1** | Estructura de `web/` + tokens, fondo por capas, tipografías autoalojadas y cabecera, a partir del prototipo |
| **2** | Capa de datos (`data.js`), helpers seguros (`el`, `safeUrl`), router y fixtures (normal, vacío, error y XSS) |
| **3** | Pantalla BRIEFING completa: contadores, resumen, radar, top 10, ranking de países y puertos, y barra de fuentes |
| **4** | Globo 3D + respaldo de vista plana |
| **5** | Pantallas LISTADO (filtros, buscador, orden), DETALLE (dial con `score_breakdown`) e HISTÓRICO |
| **6** | Cambios en `radar.py` (`score_breakdown`, `scoring_weights`, saneamiento de URLs) + `netlify.toml`, cabeceras, `security.txt`, `404` y `dev_server.py` |
| **7** | Endurecimiento del repo: actions por SHA, hashes, Dependabot, `SECURITY.md`, `LICENSE` y README actualizado con capturas, arquitectura y una sección «Seguridad» |
| **8** | Pruebas Playwright + Lighthouse + revisión final contra el prototipo, con la lista de diferencias |
| **9** | Autoauditoría de seguridad previa al pentest externo (ver abajo) |

### Fase 9 · Autoauditoría

Antes del pentest externo, pasa estas herramientas y corrige todo lo que salga. Entrégame un informe con lo encontrado y lo corregido.
- **Secretos:** `gitleaks detect` sobre todo el historial del repo.
- **Python:** `bandit -r scripts/` y `pip-audit -r requirements.txt`.
- **GitHub Actions:** `zizmor .github/workflows/`.
- **Frontend:** `semgrep --config p/javascript --config p/xss web/` y `retire --path web/assets/vendor`. Comprueba también las versiones autoalojadas frente a CVE conocidas.
- **CSP:** valídala con la lógica de CSP Evaluator de Google y explica cada directiva.
- Revisa manualmente el flujo completo de un dato externo hasta el DOM: NVD, RSS y PoC → `radar.py` → JSON → render. Cada punto donde se escribe texto en la página tiene que usar `textContent` o `safeUrl()`.

**Reglas:**
- No te inventes datos ni APIs. Si algo no está claro, pregunta.
- No borres ni reescribas el pipeline de datos sin avisar.
- Antes de cada commit, comprueba que no se cuela ningún secreto.
- El README final debe vender el proyecto: qué hace, captura, fuentes, cómo se calcula la puntuación y las medidas de seguridad aplicadas (CSP, cabeceras, Trusted Types, cadena de suministro…). Esa sección es oro para LinkedIn.

Empieza por la **fase 0**.
