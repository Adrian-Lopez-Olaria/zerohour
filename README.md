# 🛰️ Radar CVE

Briefing diario de vulnerabilidades: cada mañana cruza varias fuentes públicas, puntúa lo que de verdad importa y deja los datos listos para la web. Además, cada 3 horas actualiza un mapa mundial de actividad de ataques.

Todo corre gratis en **GitHub Actions**; la web (estática) lee los JSON de la carpeta `data/`.

## Fuentes

| Fuente | Qué aporta |
|---|---|
| [NVD (NIST)](https://nvd.nist.gov/developers/vulnerabilities) | CVE nuevas, descripción, CVSS, productos (CPE), CWE |
| [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | Explotación activa confirmada y uso en ransomware |
| [EPSS (FIRST)](https://www.first.org/epss/) | Probabilidad de explotación en los próximos 30 días |
| [GitHub Advisories](https://github.com/advisories) | Vulnerabilidades en librerías (npm, PyPI, Maven…) |
| [PoC-in-GitHub](https://github.com/nomi-sec/PoC-in-GitHub) | Si existe PoC/exploit público |
| [INCIBE-CERT](https://www.incibe.es/incibe-cert/alerta-temprana/avisos) + noticias (RSS) | Avisos en español y contexto |
| [SANS ISC / DShield](https://isc.sans.edu/) + [ip-api](https://ip-api.com/) | IPs atacantes geolocalizadas para el mapa |

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

- **`[stack]`**: palabras que marcan una CVE con ⭐ "afecta a mi stack".
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
