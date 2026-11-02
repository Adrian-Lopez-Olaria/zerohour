# 🛰️ Radar CVE

Briefing diario de vulnerabilidades: cada mañana cruza varias fuentes públicas, puntúa lo que de verdad importa y deja los datos listos para la web. Además, cada 3 horas actualiza un mapa mundial de actividad de ataques.

Todo corre gratis en **GitHub Actions**; la web (estática) lee los JSON de la carpeta `data/`.

## Fuentes

| Fuente | Qué aporta |
|---|---|
| [NVD (NIST)](https://nvd.nist.gov/developers/vulnerabilities) | CVE nuevas, descripción, CVSS, productos (CPE), CWE |
| [CVE.org (cvelistV5)](https://github.com/CVEProject/cvelistV5) + [CISA Vulnrichment](https://github.com/cisagov/vulnrichment) | SSVC de CISA (explotación, automatizable, impacto) y CVSS del CNA o de CISA cuando NVD aún no puntúa |
| [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | Explotación activa confirmada y uso en ransomware |
| [EPSS (FIRST)](https://www.first.org/epss/) | Probabilidad de explotación en los próximos 30 días |
| [GitHub Advisories](https://github.com/advisories) | Vulnerabilidades en librerías (npm, PyPI, Maven…) |
| [Metasploit](https://github.com/rapid7/metasploit-framework) · [Nuclei](https://github.com/projectdiscovery/nuclei-templates) · [Exploit-DB](https://gitlab.com/exploit-database/exploitdb) | Exploits verificados (módulos de Metasploit, exploits verificados de Exploit-DB) y plantillas de detección de Nuclei |
| [PoC-in-GitHub](https://github.com/nomi-sec/PoC-in-GitHub) | PoC públicas **sin verificar** (algunas son falsas o maliciosas) |
| [INCIBE-CERT](https://www.incibe.es/incibe-cert/alerta-temprana/avisos) · [CERT-EU](https://cert.europa.eu/publications/security-advisories) + noticias (RSS) | Avisos oficiales (CERT-EU solo publica los que considera graves) y contexto |
| [SANS ISC / DShield](https://isc.sans.edu/) | IPs que más atacan y puertos más atacados (mapa) |
| [DB-IP Lite](https://db-ip.com/db/lite.php) | Geolocalización **offline** de esas IPs: la base mensual se descarga por HTTPS, se verifica con el SHA-1 que publica DB-IP y se consulta en local (en el mapa solo se publican zonas, nunca IPs) |

> Geolocalización: <a href="https://db-ip.com">IP Geolocation by DB-IP</a>, con licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Puesta en marcha

1. Crea un repo en GitHub (público = minutos de Actions ilimitados) y sube esta carpeta.
2. Pide una API key gratuita de NVD en <https://nvd.nist.gov/developers/request-an-api-key> y guárdala en **Settings → Secrets and variables → Actions** como `NVD_API_KEY`. Funciona sin ella, pero mucho más lento.
3. Ve a **Actions → Radar CVE → Run workflow** para lanzarlo la primera vez. Desde ahí se ejecuta solo.
4. Si el último paso falla al hacer `push`: **Settings → Actions → General → Workflow permissions → Read and write permissions**.

### Ejecutarlo en local

```bash
pip install -r requirements.txt
export NVD_API_KEY=tu_clave        # opcional
python scripts/radar.py daily      # informe del día
python scripts/radar.py map        # mapa de ataques
python scripts/radar.py all        # ambos
```

## Personalizar (`config.toml`)

- **`[stack]`**: palabras que marcan una CVE con ⭐ "afecta a mi stack". Cuentan si aparecen en fabricante, producto, CNA o CPE (fabricante:producto) o en la descripción.
- **`[stack.excluir]`**: patrones por palabra que anulan la coincidencia en la descripción. Por ejemplo, "wordpress" no cuenta en "The X plugin for WordPress…" (un plugin de terceros), pero sí en un fallo de WordPress core aunque aún no tenga CPE.
- **`[[fabricante]]`**: patrones para deducir fabricante y producto de la descripción cuando NVD aún no los da (p. ej. "Plugin WordPress · X"). Si ninguno casa, la web muestra el CNA que publicó la CVE.
- **`[puntuacion]`**: pesos de la puntuación propia (0-100).
- **`[[rss]]`**: añade o quita fuentes de avisos y noticias.
- **`[ia]`**: pon `activado = true` para que el resumen lo escriba un LLM gratis vía GitHub Models. Si falla, se usa el resumen por plantilla.

### Cómo se calcula la puntuación

| Factor | Puntos |
|---|---|
| CVSS (sin puntuar aún → 40 %) | hasta 35 |
| Percentil EPSS | hasta 20 |
| En CISA KEV | +25 |
| Usada en ransomware | +5 |
| PoC pública | +10 |
| Afecta a mi stack | +5 |

## Datos generados (para el frontend)

| Fichero | Contenido | Se actualiza |
|---|---|---|
| `data/latest.json` | Informe del día | Diario |
| `data/days/AAAA-MM-DD.json` | Informes anteriores (90 días) | Diario |
| `data/index.json` | Lista de días con estadísticas (para histórico y gráficas) | Diario |
| `data/linkedin.md` | Borrador de post con el top 3 del día | Diario |
| `data/map.json` | Puntos del mapa, ranking por país y puertos más atacados | Cada 3 h |

**`latest.json`**

```jsonc
{
  "date": "2026-10-27",
  "summary": "Hoy se han publicado 143 CVE nuevas: 9 críticas y 31 altas…",
  "stats": { "new_cves": 143, "by_severity": {"CRITICAL": 9, "HIGH": 31, "UNSCORED": 60},
             "kev_new": 2, "with_poc": 4, "in_stack": 3, "remote": 88, "ghsa": 25, "news": 30 },
  "top":      [ /* las N con mayor puntuación (objetos CVE) */ ],
  "kev_new":  [ /* recién añadidas a KEV, aunque sean CVE antiguas */ ],
  "cves":     [ /* todas, ordenadas por puntuación */ ],
  "advisories": [ /* avisos GHSA sin CVE asociada */ ],
  "news":     [ /* avisos INCIBE y noticias */ ],
  "linkedin_post": "…",
  "sources_status": { "nvd": "ok", "kev": "ok", "epss": "ok", "ghsa": "ok", "rss": "ok", "poc": "ok" }
}
```

**Severidad (`severity` y claves de `by_severity`).** NVD usa las bandas CVSS v3.1: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` y `NONE` (CVSS 0.0). Las CVE todavía sin puntuar aparecen como `UNSCORED` (`severity: null`). El frontend muestra cuatro bandas de color; por eso **pliega `NONE` dentro de `LOW`** (la banda más baja) al contar `by_severity`, de modo que la suma de las bandas sigue cuadrando con `new_cves`. No se pierde ningún CVE: `NONE` son casos sin impacto de seguridad (p. ej. registro insuficiente) que se agrupan con los de menor severidad. `UNSCORED` se cuenta aparte, nunca como 0 puntos (ver [Cómo se calcula la puntuación](#cómo-se-calcula-la-puntuación)).

**Objeto CVE**

```jsonc
{
  "id": "CVE-2026-12345",
  "description": "…",
  "vendor": "Fortinet", "product": "Fortios",
  "cvss": 9.8, "severity": "CRITICAL", "vector": "CVSS:3.1/AV:N/…", "attack_vector": "NETWORK",
  "epss": 0.42, "epss_percentile": 0.97,
  "kev": { "date_added": "2026-10-26", "ransomware": true, "action": "…", "due_date": "…" },
  "poc": [ { "url": "https://github.com/…", "stars": 120 } ],
  "ghsa": [], "news": [ { "title": "…", "url": "…", "source": "INCIBE-CERT Avisos" } ],
  "stack": ["fortinet", "fortios"],
  "score": 93,
  "tags": ["kev", "ransomware", "poc", "stack", "incibe", "news", "remote", "library"],
  "cwe": ["CWE-787"], "references": [], "links": { "nvd": "…", "mitre": "…" },
  "old_cve": true   // solo si es antigua pero entró en KEV estos días
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

## Ideas para seguir

- Honeypot propio (T-Pot / Cowrie) en un VPS aislado para un mapa en tiempo real de verdad.
- Traducir descripciones al español con el modo IA.
- Publicar `linkedin.md` automáticamente o enviarlo por Telegram cada mañana.
