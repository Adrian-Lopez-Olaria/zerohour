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
   - **Aceptado.** Mejora opcional: moverla a un entorno restringido a `main`, como el de Cloudflare.
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

Producción sirve:

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'none'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests; require-trusted-types-for 'script'
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
- Las 32 pruebas E2E verifican que no se produce ninguna violación en las 4 vistas, también con los datos XSS.

Posibles endurecimientos, que **no se aplican** sin aprobación porque cambian la CSP aprobada:
- `trusted-types 'none'`: ningún script podría crear una política para saltarse Trusted Types.
- `img-src 'self'`: pasaría el favicon de `data:` a un fichero. La textura del globo ya no usa `data:`.

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
