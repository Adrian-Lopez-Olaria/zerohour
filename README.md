# ZEROHOUR

**Inteligencia de vulnerabilidades** · por Adrián López Olaria

Briefing diario de vulnerabilidades: cada mañana cruza fuentes públicas, puntúa de 0 a 100 lo que de verdad importa y publica una web estática con el resultado. Además, cada 3 horas actualiza un mapa mundial de actividad de ataques.

Todo corre gratis: el pipeline en **GitHub Actions** y la web en **Netlify**, con cabeceras de seguridad estrictas (CSP sin excepciones y Trusted Types).

## Fuentes

Doce fuentes de datos, más prensa especializada y geolocalización offline:

| Fuente | Qué aporta |
|---|---|
| [NVD (NIST)](https://nvd.nist.gov/developers/vulnerabilities) | CVE nuevas, descripción, CVSS, productos (CPE), CWE |
| [CVE.org (cvelistV5)](https://github.com/CVEProject/cvelistV5) + [CISA Vulnrichment](https://github.com/cisagov/vulnrichment) | SSVC de CISA (explotación, automatizable, impacto) y CVSS del CNA o de CISA cuando NVD aún no puntúa |
| [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | Explotación activa confirmada y uso en ransomware |
| [EPSS (FIRST)](https://www.first.org/epss/) | Probabilidad de explotación en los próximos 30 días |
| [GitHub Advisories](https://github.com/advisories) | Vulnerabilidades en librerías (npm, PyPI, Maven…) |
| [Metasploit](https://github.com/rapid7/metasploit-framework) · [Nuclei](https://github.com/projectdiscovery/nuclei-templates) · [Exploit-DB](https://gitlab.com/exploit-database/exploitdb) | Exploits verificados (módulos de Metasploit, exploits verificados de Exploit-DB) y plantillas de detección de Nuclei |
| [PoC-in-GitHub](https://github.com/nomi-sec/PoC-in-GitHub) | PoC públicas **sin verificar** (algunas son falsas o maliciosas) |
| [INCIBE-CERT](https://www.incibe.es/incibe-cert/alerta-temprana/avisos) · [CERT-EU](https://cert.europa.eu/publications/security-advisories) + noticias (RSS) | Avisos oficiales (CERT-EU solo publica los que considera graves) y contexto de prensa especializada |
| [SANS ISC / DShield](https://isc.sans.edu/) | IPs que más atacan y puertos más atacados (mapa) |
| [DB-IP Lite](https://db-ip.com/db/lite.php) | Geolocalización **offline** de esas IPs: la base mensual se descarga por HTTPS, se verifica con el SHA-1 que publica DB-IP y se consulta en local (en el mapa solo se publican zonas, nunca IPs) |

> Geolocalización: <a href="https://db-ip.com">IP Geolocation by DB-IP</a>, con licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
>
> This product uses the NVD API but is not endorsed or certified by the NVD.

## Cómo se publica

```
main  ──(código: web/, scripts/, config.toml)──────────────┐
                                                           ▼
GitHub Actions ─ recolectar (solo lectura) ─ validar ─ publicar (solo escribe en deploy)
                                                           │  commit huérfano + force-push
                                                           ▼
deploy  ──(sitio montado: web/ + web/data/ + netlify.toml)──► Netlify
```

- **`main` solo tiene código.** Los datos nunca se suben a `main`, así que su historial no crece cada día.
- **`deploy` es el sitio ya montado** y tiene siempre **un único commit**: cada publicación lo reemplaza con un commit huérfano y *force-push*. El *force-push* solo existe hacia `deploy`: el destino está fijado en `scripts/publicar_deploy.sh` y un test lo comprueba.
- **Dos jobs con permisos mínimos.** `recolectar` (`contents: read`) ejecuta el pipeline y recupera el histórico de 90 días **desde `deploy`**. `publicar` (`contents: write`) solo valida, monta y empuja.
- **Si los datos no pasan `scripts/validar_datos.py`, no se publica nada** y la web sigue con la edición anterior. Lo mismo si el histórico pierde días recientes.
- **Un cambio de código en `main`** (web, `netlify.toml` o scripts de publicación) regenera `deploy` reutilizando los datos ya publicados.
- Cada recolección diaria guarda además una copia de los datos como *artifact* durante 7 días.

## Puesta en marcha

1. **Repo público en GitHub** (minutos de Actions ilimitados). En **Settings → Actions → General → Workflow permissions** deja **Read repository contents** (solo lectura): el único job que escribe pide `contents: write` él mismo, y solo puede escribir en `deploy`.
2. **Clave de NVD:** pide una gratuita en <https://nvd.nist.gov/developers/request-an-api-key> y guárdala en **Settings → Secrets and variables → Actions** como `NVD_API_KEY`. Funciona sin ella, pero mucho más lento.
3. **Primera ejecución:** **Actions → Radar CVE → Run workflow** con el modo `all`. Crea la rama `deploy`. Desde ahí se ejecuta solo: briefing a las 05:17 UTC y mapa cada 3 horas.
4. **Netlify:** importa el repo y configura:
   - Rama de producción: **`deploy`**.
   - Sin comando de build. Carpeta de publicación: **`web`**.
   - *Branch deploys* y *Deploy Previews* **desactivados**, para que no se publiquen `main` ni las PR (por ejemplo, las de Dependabot).

   Las cabeceras y la caché vienen en `netlify.toml`, que viaja dentro de la rama `deploy`.
5. *(Solo si Netlify no despliega con el push del bot)*: crea un *build hook* en Netlify y guárdalo como secret `NETLIFY_BUILD_HOOK`. El workflow lo llama después de publicar.

### Ejecutarlo en local

```bash
python -m venv .venv && . .venv/bin/activate      # en Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
export NVD_API_KEY=tu_clave                        # opcional
python scripts/radar.py daily                      # informe del día → data/
python scripts/radar.py map                        # mapa de ataques → data/map.json
python scripts/radar.py all                        # ambos

python scripts/dev_server.py                       # http://127.0.0.1:8000 con las cabeceras de netlify.toml
python scripts/dev_server.py --dev                 # además /?fixtures=normal|vacio|error|xss (solo en local)
python -m pytest tests/pipeline                    # tests del pipeline, la publicación y las cabeceras
```

`dev_server.py` lee `netlify.toml` y manda las mismas cabeceras que producción, así que una violación de CSP o de Trusted Types aparece en local antes de publicar. Solo escucha en `127.0.0.1` y, a diferencia de producción, quita `upgrade-insecure-requests`, que en `http://127.0.0.1` haría pedirlo todo por https. Los *fixtures* de prueba, incluido el de XSS, solo se sirven con `--dev` y nunca llegan a `deploy`.

## Personalizar (`config.toml`)

- **`[stack]`**: palabras que marcan una CVE con ⭐ "afecta a mi stack". Cuentan si aparecen en fabricante, producto, CNA o CPE (fabricante:producto) o en la descripción.
- **`[stack.excluir]`**: patrones por palabra que anulan la coincidencia en la descripción. Por ejemplo, "wordpress" no cuenta en "The X plugin for WordPress…" (un plugin de terceros), pero sí en un fallo de WordPress core aunque aún no tenga CPE.
- **`[[fabricante]]`**: patrones para deducir fabricante y producto de la descripción cuando NVD aún no los da (p. ej. "Plugin WordPress · X"). Si ninguno casa, la web muestra el CNA que publicó la CVE.
- **`[marcas]`**: grafía correcta de marcas (GitLab, VMware ESXi, FortiOS, pfSense…). Lo que no está en el mapa se deja como venga.
- **`[puntuacion]`** y **`[puntuacion.minimos]`**: pesos y mínimos de la puntuación (ver abajo).
- **`[[rss]]`**: añade o quita fuentes de avisos y noticias.
- **`[ia]`**: pon `activado = true` para que el resumen lo escriba un LLM gratis vía GitHub Models. Si falla, se usa el resumen por plantilla.

### Cómo se calcula la puntuación

La puntuación (0-100) es la suma de seis filas. Los pesos viajan en el JSON (`scoring_weights`) y el desglose de cada CVE en `score_breakdown`, de modo que la web pinta el dial a partir de los datos, sin pesos fijos en el código.

| Fila | Puntos | Cuándo |
|---|---|---|
| CVSS | hasta 30 | 3 por punto de CVSS. Si aún no hay CVSS (ni de NVD, ni del CNA, ni de CISA): valor neutro del 40 % y score provisional (marcado con *) |
| EPSS | hasta 20 | Percentil EPSS × 20 |
| Explotada | 25 / 20 | 25 si está en CISA KEV. 20 si CISA la marca con SSVC «active» sin estar aún en KEV. Nunca las dos |
| Ransomware | 5 | Uso conocido en campañas de ransomware (según KEV) |
| Exploit | 15 / 6 | 15 con exploit verificado (Metasploit, Exploit-DB verificado o plantilla de Nuclei). 6 con PoC sin verificar (PoC-in-GitHub, referencia de NVD etiquetada como exploit o SSVC «poc») |
| Stack | 5 | Afecta a tu stack |

**Mínimos por explotación activa.** Una CVE explotada nunca puede quedar en «PLANIFICAR»:

- explotada (KEV o SSVC «active») → **al menos 70** («ESTA SEMANA»);
- explotada y además en tu stack, con ransomware o con exploit verificado → **al menos 85** («ACTUAR HOY»).

Cuando se aplica un mínimo, el JSON lo indica en `score_breakdown.floor` (valor, por qué está explotada y qué lo agrava) y la ficha lo explica debajo del dial.

**Veredicto y orden.** ACTUAR HOY ≥ 85 · ESTA SEMANA ≥ 70 · PLANIFICAR ≥ 40 · VIGILAR < 40. Las listas se ordenan por veredicto y, dentro de cada uno, por la suma real de las filas (y después por CVSS). Así, de dos CVE subidas a 85 por el mínimo, va primero la que más puntos tenía de verdad.

## Datos generados (para el frontend)

El pipeline escribe en `data/` (ignorada por git). Al publicar, `scripts/montar_deploy.py` copia a `deploy` **solo** lo que la web usa, desde una lista blanca:

| Fichero | Contenido | Se actualiza | ¿Se publica? |
|---|---|---|---|
| `latest.json` | Informe del día | Diario | Sí |
| `days/AAAA-MM-DD.json` | Informes anteriores (90 días) | Diario | Sí |
| `index.json` | Lista de días con estadísticas y top (histórico y gráficas) | Diario | Sí |
| `advisories.json` | Avisos de GitHub sin CVE asociada (para un futuro panel de librerías) | Diario | Sí |
| `map.json` | Puntos del mapa, ranking por país y puertos más atacados | Cada 3 h | Sí |
| `linkedin.md` | Borrador de post con el top 3 del día | Diario | **No** |

**`latest.json`**

```jsonc
{
  "date": "2026-10-31",
  "generated_at": "2026-10-31T05:24:10+00:00",
  "summary": "Hoy se han publicado 447 CVE nuevas: 37 críticas…",
  "stats": { "new_cves": 447, "by_severity": {"CRITICAL": 37, "HIGH": 176, "UNSCORED": 18},
             "kev_new": 6, "with_poc": 20, "with_exploit": 2, "with_detection": 0,
             "in_stack": 4, "remote": 370, "ghsa": 70, "news": 36 },
  "scoring_weights": { "cvss": 30, "epss": 20, "explotada": 25, "ransomware": 5, "exploit": 15, "stack": 5 },
  "top":      ["CVE-2026-97229", "CVE-2026-46300"],   // IDs: los objetos están en cves
  "kev_new":  ["CVE-2026-97229"],                     // recién añadidas a KEV, aunque sean antiguas
  "cves":     [ /* todas, ordenadas por urgencia */ ],
  "news":     [ /* avisos INCIBE-CERT y CERT-EU, y noticias */ ],
  "sources_status": { "nvd": "ok", "kev": "ok", "epss": "ok", "ghsa": "ok", "rss": "ok", "poc": "ok",
                      "cvelist": "ok", "metasploit": "ok", "nuclei": "ok", "exploitdb": "ok" }
}
```

**Severidad (`severity` y claves de `by_severity`).** NVD usa las bandas CVSS v3.1: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` y `NONE` (CVSS 0.0). Las CVE todavía sin puntuar aparecen como `UNSCORED` (`severity: null`). El frontend muestra cuatro bandas de color; por eso **pliega `NONE` dentro de `LOW`** (la banda más baja) al contar `by_severity`, de modo que la suma de las bandas sigue cuadrando con `new_cves`. No se pierde ningún CVE: `NONE` son casos sin impacto de seguridad (p. ej. registro insuficiente) que se agrupan con los de menor severidad. `UNSCORED` se cuenta aparte, nunca como 0 puntos (ver [Cómo se calcula la puntuación](#cómo-se-calcula-la-puntuación)).

**Objeto CVE**

```jsonc
{
  "id": "CVE-2026-46300",
  "description": "…",
  "vendor": "Linux", "product": "Linux Kernel", "cna": "",
  "cvss": 7.8, "severity": "HIGH", "vector": "CVSS:3.1/AV:L/…", "attack_vector": "LOCAL",
  "cvss_source": "nvd",                         // nvd | cna | cisa
  "epss": 0.1613, "epss_percentile": 0.969,
  "kev": { "date_added": "2026-10-28", "due_date": "2026-10-31", "ransomware": false, "action": "…" },
  "ssvc": { "exploitation": "active", "automatable": "no", "technical_impact": "total" },
  "exploits": [ { "source": "metasploit", "name": "exploit/linux/local/…", "url": "https://…", "verified": true } ],
  "poc": [ { "url": "https://github.com/…", "name": "…", "stars": 16, "description": "…" } ],
  "ghsa": [], "news": [ { "title": "…", "url": "…", "source": "INCIBE-CERT Avisos" } ],
  "stack": [],
  "score": 85,
  "score_breakdown": { "cvss": 23.4, "epss": 19.3854, "explotada": 25, "ransomware": 0, "exploit": 15, "stack": 0,
                       "floor": { "value": 85, "exploited_by": "kev", "aggravating": ["exploit"] } },
  "tags": ["kev", "exploit"],                   // kev ssvc ransomware exploit deteccion poc stack incibe certeu news remote library
  "cwe": ["CWE-787"],
  "references": [ { "url": "https://…", "tags": ["Patch"] } ],   // las 8 primeras
  "references_total": 10,
  "old_cve": true                               // solo si es antigua pero entró en KEV estos días
}
```

**`map.json`**

```jsonc
{
  "updated_at": "…",
  "points": [ { "lat": 39.9, "lon": 116.4, "country": "China", "cc": "CN", "attacks": 15230, "sources": 12 } ],
  "by_country": [ { "cc": "CN", "country": "China", "attacks": 80000, "sources": 40 } ],
  "top_ports": [ { "port": 23, "records": 500000, "sources": 9000, "targets": 30000 } ]
}
```

> El mapa muestra IPs que más atacan según los sensores de DShield, agregadas por zona (no se publican IPs). Se actualiza cada 3 horas; el efecto "en directo" lo pone la animación del frontend.

## Seguridad

Los textos y URLs de las fuentes (descripciones de NVD, titulares RSS, nombres y descripciones de repos de PoC) se tratan como **hostiles**.

- **Web.**
  - Sin `innerHTML` ni plantillas con datos: los nodos se crean con `textContent`.
  - Cada URL externa pasa por `safeUrl()`: solo admite http(s) y rechaza la URL entera si trae caracteres de control.
  - Enlaces externos con `rel="noopener noreferrer"`, y los de PoC además con `nofollow ugc` y un aviso de que pueden ser maliciosas.
  - Sin `eval`, sin trackers y sin secretos en el frontend.
- **Pipeline.** `radar.py` vuelve a sanear en origen: descarta URLs que no sean http(s), recorta textos y valida coordenadas, códigos de país y fechas. Es defensa en profundidad. Los datos se validan otra vez antes de publicar.
- **Cabeceras (`netlify.toml`).**
  - CSP `default-src 'none'` con solo `'self'`, sin `unsafe-*` ni `blob:` y con `require-trusted-types-for 'script'`.
  - HSTS con *preload*, `nosniff`, `Referrer-Policy`, `Permissions-Policy` con todo desactivado, COOP, CORP y `X-Frame-Options: DENY`.
  - Caché: inmutable solo en `vendor/` y fuentes. El resto se revalida siempre.
- **Librerías de terceros.**
  - globe.gl y three.js van autoalojados, en versión fija, con su SHA-256 en `web/assets/vendor/VERSIONS.md`.
  - La copia está parcheada para cumplir la CSP con un script reproducible (`scripts/vendor_globe.py --check`).
- **Divulgación responsable.** Ver [`SECURITY.md`](SECURITY.md) y `/.well-known/security.txt` (RFC 9116).

## Ideas para seguir

- Honeypot propio (T-Pot / Cowrie) en un VPS aislado para un mapa en tiempo real de verdad.
- Traducir descripciones al español con el modo IA.
- Publicar `linkedin.md` automáticamente o enviarlo por Telegram cada mañana.
