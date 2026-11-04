#!/usr/bin/env python3
"""
Radar CVE · recolector diario de vulnerabilidades
==================================================

Cruza varias fuentes públicas y gratuitas y genera JSON listos para la web:

  NVD (NIST) ............ CVE nuevas, descripción, CVSS, productos, CWE
  CISA KEV .............. ¿se está explotando activamente? ¿ransomware?
  EPSS (FIRST) .......... probabilidad de explotación en 30 días
  GitHub Advisories ..... vulnerabilidades en librerías (npm, pip, maven…)
  PoC-in-GitHub ......... ¿hay exploit/PoC público?
  RSS (INCIBE, noticias)  contexto y avisos en español
  SANS ISC (DShield) .... IPs que más atacan y puertos más atacados (mapa)
  DB-IP Lite ............ geolocalización offline de esas IPs (CC BY 4.0)

Todo lo que llega de fuera se trata como hostil: antes de escribir los JSON se
sanean URLs (solo http/https), textos (longitud máxima, sin caracteres de control),
IDs y números (rangos válidos). Es defensa en profundidad: la web vuelve a hacerlo.

Modos:
  python scripts/radar.py daily   → data/latest.json, data/days/AAAA-MM-DD.json,
                                    data/index.json, data/advisories.json, data/linkedin.md
  python scripts/radar.py map     → data/map.json (ataques geolocalizados)
  python scripts/radar.py all     → ambos

Variables de entorno opcionales:
  NVD_API_KEY   clave gratuita de NVD (sube mucho el límite de peticiones)
  GITHUB_TOKEN  en GitHub Actions ya existe; para GHSA y el resumen con IA
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import html
import ipaddress
import json
import math
import os
import re
import sys
import time
import tomllib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import feedparser
import maxminddb
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ─────────────────────────── rutas y configuración ───────────────────────────

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DAYS = DATA / "days"
CONFIG = tomllib.loads((ROOT / "config.toml").read_text(encoding="utf-8"))

TZ = ZoneInfo("Europe/Madrid")
NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
EPSS_URL = "https://api.first.org/data/v1/epss"
GHSA_URL = "https://api.github.com/advisories"
POC_URL = "https://raw.githubusercontent.com/nomi-sec/PoC-in-GitHub/master/{year}/{cve}.json"
ISC_ATTACKS_URL = "https://isc.sans.edu/api/sources/attacks/{n}/{date}?json"
ISC_PORTS_URL = "https://isc.sans.edu/api/topports/records/10/{date}?json"
DBIP_URL = "https://download.db-ip.com/free/dbip-city-lite-{month}.mmdb.gz"
DBIP_PAGE = "https://db-ip.com/db/download/ip-to-city-lite"   # publica el SHA-1 de cada fichero
GEO_CACHE = ROOT / CONFIG["mapa"].get("geo_cache", ".cache/geo")

CVE_RE = re.compile(r"CVE-\d{4}-\d{4,7}", re.I)
TAG_RE = re.compile(r"<[^>]+>")

SEV_ES = {"CRITICAL": "crítica", "HIGH": "alta", "MEDIUM": "media", "LOW": "baja", "NONE": "ninguna"}


def log(msg: str) -> None:
    print(f"[{datetime.now(TZ):%H:%M:%S}] {msg}", flush=True)


def session() -> requests.Session:
    s = requests.Session()
    retry = Retry(total=4, backoff_factor=3, status_forcelist=(429, 500, 502, 503, 504),
                  allowed_methods=("GET", "POST"), respect_retry_after_header=True)
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.mount("http://", HTTPAdapter(max_retries=retry))
    s.headers["User-Agent"] = CONFIG["general"]["user_agent"]
    return s


HTTP = session()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def nvd_time(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000")


# ─────────────────────── saneamiento (defensa en profundidad) ───────────────────────
# Todo lo que viene de NVD, KEV, RSS, PoC-in-GitHub, GHSA o ISC es hostil. Antes de escribir
# los JSON se valida cada campo; la web vuelve a tratarlo como hostil (textContent + safeUrl).

ID_RE = re.compile(r"^CVE-\d{4}-\d{4,7}$")
GHSA_RE = re.compile(r"^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$")
CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")      # control salvo \t \n \r
URL_CTRL_RE = re.compile(r"[\x00-\x20\x7f-\x9f]")                   # en una URL, ni espacios
CWE_OK = re.compile(r"^(CWE-\d{1,5}|NVD-CWE-noinfo|NVD-CWE-Other)$")
VECTOR_OK = re.compile(r"^[A-Za-z0-9:./]{1,300}$")
DATE_OK = re.compile(r"^\d{4}-\d{2}-\d{2}$")
LANG_OK = re.compile(r"^[a-z]{2}$")
SEVERITIES = {"CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"}
ATTACK_VECTORS = {"NETWORK", "ADJACENT_NETWORK", "ADJACENT", "LOCAL", "PHYSICAL"}
MAX_URL = 2048
LIMIT = {"description": 4000, "vendor": 120, "product": 160, "cna": 120, "title": 300, "summary": 500,
         "name": 200, "poc_desc": 300, "kev_text": 1000, "source": 80, "tag": 60, "country": 60}


def safe_url(u) -> str | None:
    """Solo URLs http(s) absolutas, sin espacios ni caracteres de control, sin credenciales
    (user@host) y de longitud razonable. Mismo criterio que safeUrl() en la web."""
    if not isinstance(u, str) or not u or len(u) > MAX_URL or URL_CTRL_RE.search(u):
        return None
    try:
        p = urlsplit(u)
    except ValueError:
        return None
    if p.scheme.lower() not in ("http", "https") or not p.hostname or "@" in p.netloc:
        return None
    return u


def cap(text, limit: int) -> str:
    """Texto sin caracteres de control, espacios normalizados y como mucho `limit` caracteres."""
    if text is None:
        return ""
    t = re.sub(r"[ \t]+", " ", CTRL_RE.sub("", str(text))).strip()
    return t if len(t) <= limit else t[:limit].rstrip() + "…"


def num(v, lo: float, hi: float) -> float | None:
    """Número dentro de [lo, hi]; si no lo es (o no es número), None."""
    if isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and lo <= f <= hi else None  # f == f descarta NaN


def safe_date(v) -> str | None:
    return v if isinstance(v, str) and DATE_OK.match(v) else None


def sanitize_news(n: dict) -> dict | None:
    if not isinstance(n, dict) or not (url := safe_url(n.get("url"))):
        return None
    return {
        "title": cap(n.get("title"), LIMIT["title"]),
        "summary": cap(n.get("summary"), LIMIT["summary"]),
        "url": url,
        "date": cap(n.get("date"), 40) or None,
        "source": cap(n.get("source"), LIMIT["source"]),
        "type": n.get("type") if n.get("type") in ("aviso", "noticia") else "noticia",
        "lang": n.get("lang") if isinstance(n.get("lang"), str) and LANG_OK.match(n["lang"]) else "",
        "cves": [c for c in (n.get("cves") or []) if isinstance(c, str) and ID_RE.match(c)],
    }


def sanitize_ghsa(a: dict) -> dict | None:
    if not isinstance(a, dict) or not GHSA_RE.match(str(a.get("id", ""))) or not (url := safe_url(a.get("url"))):
        return None
    sev = str(a.get("severity") or "").upper()
    return {
        "id": a["id"],
        "cve": a["cve"] if isinstance(a.get("cve"), str) and ID_RE.match(a["cve"]) else None,
        "summary": cap(a.get("summary"), LIMIT["summary"]),
        "severity": sev if sev in SEVERITIES or sev == "MODERATE" else None,
        "cvss": num(a.get("cvss"), 0, 10),
        "published": cap(a.get("published"), 40) or None,
        "url": url,
        "packages": [{"ecosystem": cap(p.get("ecosystem"), 40), "name": cap(p.get("name"), 200),
                      "vulnerable": cap(p.get("vulnerable"), 120), "patched": cap(p.get("patched"), 60)}
                     for p in (a.get("packages") or [])[:5] if isinstance(p, dict)],
    }


def sanitize_cve(r: dict) -> dict | None:
    """Valida y recorta un registro de CVE. Devuelve None si el ID no es válido."""
    if not isinstance(r, dict) or not ID_RE.match(str(r.get("id", ""))):
        return None
    cid = r["id"]
    r["description"] = cap(r.get("description"), LIMIT["description"])
    for k in ("vendor", "product", "cna"):
        r[k] = cap(r.get(k), LIMIT[k])
    r["cvss"] = num(r.get("cvss"), 0, 10)
    sev = str(r.get("severity") or "").upper()
    r["severity"] = sev if r["cvss"] is not None and sev in SEVERITIES else None
    r["cvss_version"] = cap(r.get("cvss_version"), 8) or None
    r["vector"] = r["vector"] if isinstance(r.get("vector"), str) and VECTOR_OK.match(r["vector"]) else None
    av = str(r.get("attack_vector") or "").upper()
    r["attack_vector"] = av if av in ATTACK_VECTORS else None
    r["epss"] = num(r.get("epss"), 0, 1)
    r["epss_percentile"] = num(r.get("epss_percentile"), 0, 1)
    r["cwe"] = [w for w in (r.get("cwe") or []) if isinstance(w, str) and CWE_OK.match(w)][:10]
    r["references"] = [{"url": u, "tags": [cap(t, LIMIT["tag"]) for t in (x.get("tags") or [])][:8]}
                       for x in (r.get("references") or []) if isinstance(x, dict) and (u := safe_url(x.get("url")))]
    r["exploit_refs"] = [u for u in (safe_url(x) for x in (r.get("exploit_refs") or [])) if u]
    r["poc"] = [{"url": u, "name": cap(p.get("name"), LIMIT["name"]),
                 "stars": int(num(p.get("stars"), 0, 1e9) or 0),
                 "description": cap(p.get("description"), LIMIT["poc_desc"])}
                for p in (r.get("poc") or []) if isinstance(p, dict) and (u := safe_url(p.get("url")))]
    r["news"] = [n for n in (sanitize_news(x) for x in (r.get("news") or [])) if n]
    r["ghsa"] = [a for a in (sanitize_ghsa(x) for x in (r.get("ghsa") or [])) if a]
    k = r.get("kev")
    if isinstance(k, dict):
        r["kev"] = {
            "date_added": safe_date(k.get("date_added")), "due_date": safe_date(k.get("due_date")),
            "vendor": cap(k.get("vendor"), LIMIT["vendor"]), "product": cap(k.get("product"), LIMIT["product"]),
            "name": cap(k.get("name"), LIMIT["title"]), "description": cap(k.get("description"), LIMIT["kev_text"]),
            "action": cap(k.get("action"), LIMIT["kev_text"]), "ransomware": k.get("ransomware") is True,
        }
    else:
        r["kev"] = None
    r["cvss_source"] = r.get("cvss_source") if r.get("cvss_source") in ("nvd", "cna", "adp") and r["cvss"] is not None else None
    s = r.get("ssvc")
    r["ssvc"] = ({"exploitation": s["exploitation"],
                  "automatable": s.get("automatable") if s.get("automatable") in SSVC_VALUES["automatable"] else None,
                  "technical_impact": s.get("technical_impact") if s.get("technical_impact") in SSVC_VALUES["technical impact"] else None,
                  "version": cap(s.get("version"), 12) or None}
                 if isinstance(s, dict) and s.get("exploitation") in SSVC_VALUES["exploitation"] else None)
    r["exploits"] = [{"source": e["source"], "url": u, "name": cap(e.get("name"), LIMIT["name"]), "verified": e.get("verified") is True}
                     for e in (r.get("exploits") or [])
                     if isinstance(e, dict) and e.get("source") in ("metasploit", "nuclei", "exploitdb") and (u := safe_url(e.get("url")))][:10]
    r["published"] = cap(r.get("published"), 40) or None
    # Los enlaces se construyen aquí a partir del ID ya validado, no se copian de fuera
    r["links"] = {"nvd": f"https://nvd.nist.gov/vuln/detail/{cid}", "mitre": f"https://www.cve.org/CVERecord?id={cid}"}
    return r


# ──────────────────────────────── NVD ────────────────────────────────

def nvd_get(params: dict) -> dict:
    headers = {}
    key = os.getenv("NVD_API_KEY")
    if key:
        headers["apiKey"] = key
    r = HTTP.get(NVD_URL, params=params, headers=headers, timeout=60)
    r.raise_for_status()
    # Sin clave: 5 peticiones / 30 s. Con clave: 50 / 30 s.
    time.sleep(0.7 if key else 6.5)
    return r.json()


def fetch_nvd_window(start: datetime, end: datetime) -> list[dict]:
    """Todas las CVE publicadas entre start y end (paginando)."""
    items, idx = [], 0
    while True:
        data = nvd_get({"pubStartDate": nvd_time(start), "pubEndDate": nvd_time(end),
                        "resultsPerPage": 2000, "startIndex": idx})
        batch = data.get("vulnerabilities", [])
        items.extend(batch)
        total = data.get("totalResults", 0)
        idx += len(batch)
        if not batch or idx >= total:
            break
    log(f"NVD: {len(items)} CVE publicadas en la ventana")
    return items


def fetch_nvd_one(cve_id: str) -> dict | None:
    data = nvd_get({"cveId": cve_id})
    v = data.get("vulnerabilities", [])
    return v[0] if v else None


def pick_cvss(metrics: dict) -> dict | None:
    """Elige la mejor métrica CVSS: v3.1 > v4.0 > v3.0 > v2, y la 'Primary' (NVD) antes que la del CNA."""
    for key in ("cvssMetricV31", "cvssMetricV40", "cvssMetricV30", "cvssMetricV2"):
        lst = metrics.get(key) or []
        if not lst:
            continue
        m = next((x for x in lst if x.get("type") == "Primary"), lst[0])
        d = m.get("cvssData", {})
        return {
            "score": d.get("baseScore"),
            "severity": (d.get("baseSeverity") or m.get("baseSeverity") or "").upper() or None,
            "version": d.get("version"),
            "vector": d.get("vectorString"),
            "attack_vector": d.get("attackVector") or d.get("accessVector"),
            "source": m.get("source"),
        }
    return None


def parse_cpe(cpe: str) -> tuple[str, str]:
    p = cpe.split(":")
    return (p[3] if len(p) > 3 else "", p[4] if len(p) > 4 else "")


def pretty(name: str) -> str:
    return brand(name.replace("_", " ").strip().title()) if name else ""


def brand(text: str) -> str:
    """Grafía oficial de marcas según [marcas] (config.toml): "Gitlab" → "GitLab", "Ios Xe" → "IOS XE".
    Solo palabras o expresiones completas; lo que no está en el mapa se deja igual."""
    if not text:
        return text
    for key in sorted(CONFIG.get("marcas", {}), key=len, reverse=True):   # primero las más largas
        text = re.sub(r"(?<![\w-])" + re.escape(key) + r"(?![\w-])", CONFIG["marcas"][key], text, flags=re.I)
    return text


def parse_nvd(item: dict) -> dict:
    c = item["cve"]
    desc = next((d["value"] for d in c.get("descriptions", []) if d.get("lang") == "en"), "")
    cvss = pick_cvss(c.get("metrics", {}))

    cwes = sorted({d["value"] for w in c.get("weaknesses", []) for d in w.get("description", [])
                   if d.get("value", "").startswith("CWE-")})

    cpes = [m["criteria"] for conf in c.get("configurations", []) for node in conf.get("nodes", [])
            for m in node.get("cpeMatch", []) if m.get("vulnerable")]
    vendor, product = parse_cpe(cpes[0]) if cpes else ("", "")

    # El CNA (p. ej. psirt@fortinet.com) da pista del fabricante aunque NVD aún no lo haya analizado
    cna = c.get("sourceIdentifier", "")
    cna_domain = cna.split("@")[-1] if "@" in cna else ""

    refs = c.get("references", [])
    exploit_refs = [r["url"] for r in refs if "Exploit" in r.get("tags", [])]

    return {
        "id": c["id"],
        "published": c.get("published"),
        "modified": c.get("lastModified"),
        "status": c.get("vulnStatus"),
        "description": desc,
        "cvss": cvss["score"] if cvss else None,
        "severity": cvss["severity"] if cvss else None,
        "cvss_version": cvss["version"] if cvss else None,
        "vector": cvss["vector"] if cvss else None,
        "attack_vector": cvss["attack_vector"] if cvss else None,
        "vendor": pretty(vendor),
        "product": pretty(product),
        "vendor_source": "nvd" if (vendor or product) else None,
        "cna": cna_domain,
        "cwe": cwes,
        "cpes": cpes[:10],
        # Se guardan hasta 40: al escribir se eligen las 8 más útiles (ver slim_cve)
        "references": [{"url": r["url"], "tags": r.get("tags", [])} for r in refs[:40]],
        "exploit_refs": exploit_refs[:5],
        "links": {
            "nvd": f"https://nvd.nist.gov/vuln/detail/{c['id']}",
            "mitre": f"https://www.cve.org/CVERecord?id={c['id']}",
        },
    }


# ──────────────────────────────── KEV ────────────────────────────────

def fetch_kev() -> dict[str, dict]:
    r = HTTP.get(KEV_URL, timeout=60)
    r.raise_for_status()
    out = {}
    for v in r.json().get("vulnerabilities", []):
        out[v["cveID"]] = {
            "date_added": v.get("dateAdded"),
            "due_date": v.get("dueDate"),
            "vendor": v.get("vendorProject"),
            "product": v.get("product"),
            "name": v.get("vulnerabilityName"),
            "description": v.get("shortDescription"),
            "action": v.get("requiredAction"),
            "ransomware": (v.get("knownRansomwareCampaignUse") or "").lower() == "known",
        }
    log(f"KEV: {len(out)} vulnerabilidades en el catálogo")
    return out


# ──────────────────────────────── EPSS ────────────────────────────────

def fetch_epss(cve_ids: list[str]) -> dict[str, dict]:
    out = {}
    for i in range(0, len(cve_ids), 100):
        chunk = cve_ids[i:i + 100]
        r = HTTP.get(EPSS_URL, params={"cve": ",".join(chunk)}, timeout=60)
        r.raise_for_status()
        for d in r.json().get("data", []):
            out[d["cve"]] = {"epss": float(d["epss"]), "percentile": float(d["percentile"])}
    log(f"EPSS: puntuación para {len(out)}/{len(cve_ids)} CVE")
    return out


# ──────────────────────────── GitHub Advisories ────────────────────────────

def fetch_ghsa(since: datetime) -> list[dict]:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = GHSA_URL
    params = {"type": "reviewed", "per_page": 100, "sort": "published", "direction": "desc"}
    out = []
    for _ in range(5):  # máx. 500 avisos
        r = HTTP.get(url, params=params, headers=headers, timeout=60)
        r.raise_for_status()
        page = r.json()
        stop = False
        for a in page:
            pub = datetime.fromisoformat(a["published_at"].replace("Z", "+00:00"))
            if pub < since:
                stop = True
                break
            sev_scores = a.get("cvss_severities") or {}
            score = ((sev_scores.get("cvss_v3") or {}).get("score")
                     or (sev_scores.get("cvss_v4") or {}).get("score")
                     or (a.get("cvss") or {}).get("score"))
            out.append({
                "id": a["ghsa_id"],
                "cve": a.get("cve_id"),
                "summary": a.get("summary"),
                "severity": (a.get("severity") or "").upper() or None,
                "cvss": score,
                "published": a["published_at"],
                "url": a["html_url"],
                "packages": [
                    {"ecosystem": v["package"]["ecosystem"], "name": v["package"]["name"],
                     "vulnerable": v.get("vulnerable_version_range"),
                     "patched": v.get("first_patched_version")}
                    for v in a.get("vulnerabilities") or [] if v.get("package")
                ][:5],
            })
        if stop or "next" not in r.links:
            break
        url, params = r.links["next"]["url"], None
    log(f"GHSA: {len(out)} avisos de librerías")
    return out


# ─────────────────────────────── PoC públicas ───────────────────────────────

def fetch_poc(cve_id: str) -> list[dict]:
    year = cve_id.split("-")[1]
    r = HTTP.get(POC_URL.format(year=year, cve=cve_id.upper()), timeout=30)
    if r.status_code == 404:
        return []
    r.raise_for_status()
    repos = sorted(r.json(), key=lambda x: x.get("stargazers_count", 0), reverse=True)
    return [{"url": x["html_url"], "name": x.get("full_name"), "stars": x.get("stargazers_count", 0),
             "description": (x.get("description") or "")[:200]} for x in repos[:5]]


def fetch_pocs(cve_ids: list[str]) -> dict[str, list]:
    out = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for cid, res in zip(cve_ids, ex.map(lambda c: _safe(fetch_poc, c, default=[]), cve_ids)):
            if res:
                out[cid] = res
    log(f"PoC: encontradas para {len(out)}/{len(cve_ids)} candidatas")
    return out


# ─────────────────── CVE.org (cvelistV5) + CISA Vulnrichment (ADP) ───────────────────
# Registro oficial de cada CVE. Aporta: SSVC de CISA (¿se explota? ¿automatizable? ¿impacto?)
# y CVSS del CNA o de CISA cuando NVD aún no lo ha puesto. Formato verificado el 2026-11-01.

CVELIST_URL = "https://raw.githubusercontent.com/CVEProject/cvelistV5/main/cves/{year}/{block}xxx/{cve}.json"
SSVC_VALUES = {"exploitation": {"none", "poc", "active"}, "automatable": {"yes", "no"},
               "technical impact": {"partial", "total"}}
CVSS_KEYS = ("cvssV3_1", "cvssV4_0", "cvssV3_0")   # misma preferencia que con NVD: 3.1 > 4.0 > 3.0


def cvelist_url(cve_id: str) -> str:
    _, year, num_ = cve_id.split("-")
    return CVELIST_URL.format(year=year, block=int(num_) // 1000, cve=cve_id)


def _cvss_from_metrics(metrics) -> dict | None:
    for m in metrics or []:
        for k in CVSS_KEYS:
            d = (m or {}).get(k)
            if isinstance(d, dict) and num(d.get("baseScore"), 0, 10) is not None:
                return {"score": float(d["baseScore"]), "severity": str(d.get("baseSeverity") or "").upper() or None,
                        "version": str(d.get("version") or k[5:].replace("_", ".")), "vector": d.get("vectorString"),
                        "attack_vector": d.get("attackVector")}
    return None


def parse_ssvc(content) -> dict | None:
    if not isinstance(content, dict):
        return None
    vals = {}
    for opt in content.get("options") or []:
        for k, v in (opt or {}).items():
            k, v = str(k).strip().lower(), str(v).strip().lower()
            if k in SSVC_VALUES and v in SSVC_VALUES[k]:
                vals[k] = v
    if "exploitation" not in vals:
        return None
    return {"exploitation": vals["exploitation"], "automatable": vals.get("automatable"),
            "technical_impact": vals.get("technical impact"), "version": cap(content.get("version"), 12) or None}


def parse_cvelist(doc) -> dict:
    """De un registro CVE JSON 5: SSVC de CISA-ADP y CVSS del CNA o de CISA-ADP."""
    out = {"ssvc": None, "cna_cvss": None, "adp_cvss": None}
    cont = (doc or {}).get("containers") or {}
    out["cna_cvss"] = _cvss_from_metrics((cont.get("cna") or {}).get("metrics"))
    for adp in cont.get("adp") or []:
        if ((adp or {}).get("providerMetadata") or {}).get("shortName") != "CISA-ADP":
            continue
        for m in adp.get("metrics") or []:
            o = (m or {}).get("other") or {}
            if o.get("type") == "ssvc":
                out["ssvc"] = parse_ssvc(o.get("content"))
        out["adp_cvss"] = out["adp_cvss"] or _cvss_from_metrics(adp.get("metrics"))
    return out


def fetch_cvelist_one(cve_id: str) -> dict | None:
    """None si el registro no existe todavía (404: reservada o recién publicada) → "sin dato"."""
    r = HTTP.get(cvelist_url(cve_id), timeout=30)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return parse_cvelist(r.json())


def fetch_cvelist(cve_ids: list[str]) -> dict[str, dict]:
    """Concurrencia moderada (5) y reintentos con espera (sesión HTTP). Si fallan muchas
    peticiones (no 404), la fuente se da por caída para que se vea en sources_status."""
    out, errors = {}, 0

    def one(cid):
        try:
            return cid, fetch_cvelist_one(cid), None
        except Exception as e:  # noqa: BLE001
            return cid, None, e

    with ThreadPoolExecutor(max_workers=5) as ex:
        for cid, res, err in ex.map(one, cve_ids):
            if err:
                errors += 1
            elif res:
                out[cid] = res
    log(f"CVE.org: {len(out)}/{len(cve_ids)} registros, {sum(1 for v in out.values() if v['ssvc'])} con SSVC de CISA, {errors} errores")
    if cve_ids and errors > max(5, len(cve_ids) // 5):
        raise RuntimeError(f"{errors} de {len(cve_ids)} peticiones fallaron")
    return out


# ───────────────── exploits verificados: Metasploit, Nuclei, Exploit-DB ─────────────────
# Ficheros grandes (11, 2 y 10 MB): se descargan una vez por ejecución y se indexan por CVE.
# Las URLs se construyen a partir de piezas validadas, nunca se copian tal cual.

MSF_URL = "https://raw.githubusercontent.com/rapid7/metasploit-framework/master/db/modules_metadata_base.json"
NUCLEI_URL = "https://raw.githubusercontent.com/projectdiscovery/nuclei-templates/main/cves.json"
EDB_URL = "https://gitlab.com/exploit-database/exploitdb/-/raw/main/files_exploits.csv"
MAX_INDEX_BYTES = 64 * 1024 * 1024
MSF_PATH_OK = re.compile(r"^/?modules/[A-Za-z0-9_./-]{1,200}\.(?:rb|py|go)$")
NUCLEI_PATH_OK = re.compile(r"^[A-Za-z0-9_./-]{1,200}\.ya?ml$")


def _get_text(url: str) -> str:
    """Descarga con tope de tamaño (son ficheros de terceros que pueden crecer o romperse)."""
    with HTTP.get(url, timeout=120, stream=True) as r:
        r.raise_for_status()
        buf, size = [], 0
        for chunk in r.iter_content(1 << 20):
            size += len(chunk)
            if size > MAX_INDEX_BYTES:
                raise ValueError(f"respuesta demasiado grande ({url})")
            buf.append(chunk)
    return b"".join(buf).decode("utf-8", errors="replace")


def index_metasploit(data: dict) -> dict[str, list]:
    """Solo módulos de tipo exploit (los auxiliary suelen ser escáneres o DoS)."""
    idx: dict[str, list] = {}
    for mod in (data or {}).values():
        if not isinstance(mod, dict) or mod.get("type") != "exploit":
            continue
        path = str(mod.get("path") or "")
        if not MSF_PATH_OK.match(path):
            continue
        url = "https://github.com/rapid7/metasploit-framework/blob/master/" + path.lstrip("/")
        entry = {"source": "metasploit", "url": url, "name": cap(mod.get("fullname") or mod.get("name"), LIMIT["name"]), "verified": True}
        for ref in mod.get("references") or []:
            if isinstance(ref, str) and ID_RE.match(ref):
                idx.setdefault(ref, []).append(entry)
    return idx


def index_nuclei(text: str) -> dict[str, list]:
    idx: dict[str, list] = {}
    for line in text.splitlines():
        try:
            t = json.loads(line)
        except ValueError:
            continue
        cid, path = str((t or {}).get("ID") or "").upper(), str((t or {}).get("file_path") or "")
        if not ID_RE.match(cid) or not NUCLEI_PATH_OK.match(path):
            continue
        idx.setdefault(cid, []).append({
            "source": "nuclei", "url": "https://github.com/projectdiscovery/nuclei-templates/blob/main/" + path,
            "name": cap(((t.get("Info") or {}).get("Name")), LIMIT["name"]), "verified": True})
    return idx


def index_exploitdb(text: str) -> dict[str, list]:
    import csv
    idx: dict[str, list] = {}
    for row in csv.DictReader(text.splitlines()):
        eid = str(row.get("id") or "")
        if not eid.isdigit():
            continue
        cves = {c.strip().upper() for c in str(row.get("codes") or "").split(";")}
        entry = {"source": "exploitdb", "url": f"https://www.exploit-db.com/exploits/{eid}",
                 "name": cap(row.get("description"), LIMIT["name"]), "verified": str(row.get("verified")).strip() == "1"}
        for cid in cves:
            if ID_RE.match(cid):
                idx.setdefault(cid, []).append(entry)
    return idx


def fetch_exploit_indexes(status: dict) -> dict[str, list]:
    """Índice CVE → [{source, url, name, verified}]. Cada fuente puede fallar sin tumbar al resto."""
    merged: dict[str, list] = {}
    for name, fn in (("metasploit", lambda: index_metasploit(json.loads(_get_text(MSF_URL)))),
                     ("nuclei", lambda: index_nuclei(_get_text(NUCLEI_URL))),
                     ("exploitdb", lambda: index_exploitdb(_get_text(EDB_URL)))):
        idx = _safe(fn, default={}, status=status, name=name)
        for cid, entries in idx.items():
            merged.setdefault(cid, []).extend(entries)
        log(f"{name}: {len(idx)} CVE con exploit o plantilla")
    return merged


def pick_exploits(entries: list) -> list:
    """Hasta 10, primero los verificados; sin duplicados de URL."""
    seen, out = set(), []
    for e in sorted(entries, key=lambda e: (not e["verified"], e["source"])):
        if e["url"] not in seen:
            seen.add(e["url"])
            out.append(e)
    return out[:10]


# ──────────────────────────────── RSS ────────────────────────────────

def clean(text: str, limit: int = 300) -> str:
    t = html.unescape(TAG_RE.sub(" ", text or ""))
    t = re.sub(r"\s+", " ", t).strip()
    return t if len(t) <= limit else t[:limit].rsplit(" ", 1)[0] + "…"


PAGE_MAX_BYTES = 1024 * 1024


def page_cves(url: str, feed_url: str) -> list[str]:
    """IDs de CVE de la página de un aviso (CERT-EU casi nunca los pone en el RSS).
    Sin interpretar el HTML: solo una regex sobre el texto. Únicamente se descargan páginas
    del MISMO dominio que el feed (un RSS manipulado no puede llevarnos a cualquier URL),
    con timeout y tamaño máximo."""
    u = safe_url(url)
    if not u or urlsplit(u).hostname != urlsplit(feed_url).hostname:
        return []
    with HTTP.get(u, timeout=15, stream=True) as r:
        r.raise_for_status()
        buf, size = [], 0
        for chunk in r.iter_content(64 * 1024):
            size += len(chunk)
            if size > PAGE_MAX_BYTES:
                break                                    # basta con lo leído hasta el tope
            buf.append(chunk)
    text = b"".join(buf).decode("utf-8", errors="replace")
    return sorted({m.upper() for m in CVE_RE.findall(text)})[:50]


def fetch_rss(since: datetime) -> list[dict]:
    items = []
    for feed in CONFIG.get("rss", []):
        try:
            r = HTTP.get(feed["url"], timeout=30)
            r.raise_for_status()
            parsed = feedparser.parse(r.content)
        except Exception as e:  # una fuente caída no tumba el resto
            log(f"RSS ✗ {feed['nombre']}: {e}")
            continue
        n = 0
        for e in parsed.entries:
            st = e.get("published_parsed") or e.get("updated_parsed")
            if not st:
                continue
            dt = datetime(*st[:6], tzinfo=timezone.utc)
            if dt < since:
                continue
            raw = f"{e.get('title', '')} {e.get('summary', '')}"
            cves = {m.upper() for m in CVE_RE.findall(raw)}
            if feed.get("leer_pagina") and e.get("link"):
                cves |= set(_safe(page_cves, e.get("link"), feed["url"], default=[], name=f"página {feed['nombre']}"))
            items.append({
                "title": clean(e.get("title", ""), 200),
                "summary": clean(e.get("summary", "")),
                "url": e.get("link"),
                "date": dt.isoformat(),
                "source": feed["nombre"],
                "type": feed.get("tipo", "noticia"),
                "lang": feed.get("idioma", "en"),
                "cves": sorted(cves),
            })
            n += 1
        log(f"RSS ✓ {feed['nombre']}: {n} entradas recientes")
    items.sort(key=lambda x: x["date"], reverse=True)
    return items


# ─────────────────────────── puntuación y etiquetas ───────────────────────────

def _cpe_vendor_product(cpe: str) -> str:
    """Solo fabricante y producto del CPE: en un plugin, el campo target_sw dice "wordpress"
    y no debe contar como si la CVE fuera de WordPress."""
    p = str(cpe).split(":")
    return f"{p[3]} {p[4]}" if len(p) > 4 else ""


def stack_match(rec: dict) -> list[str]:
    """Palabras de [stack] que afectan a la CVE. Cuentan si aparecen en datos estructurados
    (fabricante/producto de NVD o KEV, CNA, CPE) o en la descripción, salvo que la descripción
    case con un patrón de [stack.excluir] para esa palabra."""
    st = CONFIG["stack"]
    excl = st.get("excluir", {})
    own = rec.get("vendor_source") in ("nvd", "kev")  # un fabricante deducido por patrón no cuenta
    structured = " ".join(
        ([rec.get("vendor", ""), rec.get("product", "")] if own else [])
        + [rec.get("cna", "")] + [_cpe_vendor_product(c) for c in rec.get("cpes", [])]
    ).lower().replace("_", " ")
    desc = (rec.get("description") or "").lower()
    out = []
    for w in st["palabras"]:
        wl = w.lower()
        if wl in structured or (wl in desc and not any(re.search(p, desc, re.I) for p in excl.get(w, []))):
            out.append(w)
    return out


def infer_vendor(rec: dict) -> None:
    """Si NVD/KEV no dan fabricante ni producto, lo intenta deducir con los patrones de
    [[fabricante]] (config.toml). Si no hay suerte y hay CNA, la web mostrará el CNA."""
    if rec.get("vendor") or rec.get("product"):
        return
    for pat in CONFIG.get("fabricante", []):
        m = re.search(pat["regex"], rec.get("description") or "", re.I)
        if m and m.group("producto"):
            rec["vendor"], rec["product"] = cap(pat["nombre"], LIMIT["vendor"]), cap(m.group("producto"), LIMIT["product"])
            rec["vendor_source"] = "patron"
            return
    rec["vendor_source"] = "cna" if rec.get("cna") else None


def exploitation(rec: dict) -> str | None:
    """'kev' si está en KEV; si no, 'ssvc' si CISA la marca con SSVC "active"; si no, None."""
    if rec.get("kev"):
        return "kev"
    return "ssvc" if (rec.get("ssvc") or {}).get("exploitation") == "active" else None


def has_verified_exploit(rec: dict) -> bool:
    return any(e.get("verified") for e in rec.get("exploits") or [])


def has_unverified_poc(rec: dict) -> bool:
    return bool(rec.get("poc") or rec.get("exploit_refs") or rec.get("exploits")
                or (rec.get("ssvc") or {}).get("exploitation") == "poc")


def scoring_weights() -> dict[str, int]:
    """Máximo de cada fila del desglose (lo que pinta el dial de la web). Suman 100."""
    w = CONFIG["puntuacion"]
    return {"cvss": w["cvss_max"], "epss": w["epss_max"],
            "explotada": max(w["explotada_kev"], w["explotada_ssvc"]), "ransomware": w["ransomware"],
            "exploit": max(w["exploit_verificado"], w["exploit_poc"]), "stack": w["stack"]}


def _breakdown_raw(rec: dict) -> dict[str, float]:
    w = CONFIG["puntuacion"]
    kev = rec.get("kev") or {}
    ex = exploitation(rec)
    return {
        # Sin CVSS todavía (muy habitual el primer día): valor neutro del 40 %
        "cvss": (rec["cvss"] / 10 if rec.get("cvss") is not None else 0.4) * w["cvss_max"],
        "epss": (rec.get("epss_percentile") or 0) * w["epss_max"],
        # Una sola fila de explotación: KEV o SSVC "active", nunca las dos
        "explotada": w["explotada_kev"] if ex == "kev" else w["explotada_ssvc"] if ex == "ssvc" else 0,
        "ransomware": w["ransomware"] if kev.get("ransomware") else 0,
        # Una sola fila de exploit: verificado o, si no, PoC sin verificar
        "exploit": w["exploit_verificado"] if has_verified_exploit(rec) else w["exploit_poc"] if has_unverified_poc(rec) else 0,
        "stack": w["stack"] if rec.get("stack") else 0,
    }


def score_floor(rec: dict) -> dict | None:
    """Mínimo que corresponde a la CVE (o None): explotada → 70; explotada y además en tu stack,
    con ransomware o con exploit verificado → 85 (config: [puntuacion.minimos])."""
    ex = exploitation(rec)
    if not ex:
        return None
    m = CONFIG["puntuacion"].get("minimos", {})
    agg = [k for k, on in (("stack", bool(rec.get("stack"))),
                           ("ransomware", bool((rec.get("kev") or {}).get("ransomware"))),
                           ("exploit", has_verified_exploit(rec))) if on]
    value = (m.get("explotada_critica") if agg else None) or m.get("explotada")
    return {"value": int(value), "exploited_by": ex, "aggravating": agg} if value else None


def _round_half_up(x: float) -> int:
    # Los .5 suben, como Math.round en la web (round() de Python va al par: 58.5 → 58)
    return math.floor(x + 0.5)


def breakdown(rec: dict) -> dict:
    """Puntos de cada fila (4 decimales) y, SOLO si se aplica un mínimo, la clave "floor":
    {"value": 70|85, "exploited_by": "kev"|"ssvc", "aggravating": ["stack", "ransomware"]}.
    El score sale de estos mismos valores, así que la web y el pipeline nunca discrepan."""
    b: dict = {k: round(v, 4) for k, v in _breakdown_raw(rec).items()}
    f = score_floor(rec)
    if f and _round_half_up(sum(b.values())) < f["value"]:
        b["floor"] = f
    return b


# Tramos de veredicto de la guía de estilo (los mismos que verdict() en la web)
VERDICT_BANDS = (85, 70, 40)   # ACTUAR HOY · ESTA SEMANA · PLANIFICAR · (por debajo) VIGILAR


def verdict_band(s: float) -> int:
    return sum(1 for b in VERDICT_BANDS if s >= b)        # 3, 2, 1 o 0


def rows_sum(rec: dict) -> float:
    """Suma real de las filas del desglose, sin el mínimo."""
    return sum(v for k, v in (rec.get("score_breakdown") or breakdown(rec)).items() if k != "floor")


def rank_key(rec: dict) -> tuple:
    """Orden del informe: primero el veredicto (el mínimo decide la urgencia) y, dentro de cada
    veredicto, la suma real de filas (el mínimo no adelanta a quien tiene más mérito propio)."""
    return (verdict_band(rec["score"]), rows_sum(rec), rec.get("cvss") or 0)


def score(rec: dict) -> int:
    b = breakdown(rec)
    raw = _round_half_up(sum(v for k, v in b.items() if k != "floor"))
    return min(100, max(raw, b["floor"]["value"]) if "floor" in b else raw)


def tags(rec: dict) -> list[str]:
    t = []
    if rec.get("kev"):
        t.append("kev")
        if rec["kev"].get("ransomware"):
            t.append("ransomware")
    elif exploitation(rec) == "ssvc":
        t.append("ssvc")             # explotada según CISA (SSVC), aún sin entrar en KEV
    # Código de ataque: una sola etiqueta, la de más certeza. Nuclei puntúa como verificado, pero
    # se rotula aparte: es una plantilla de detección, no un exploit.
    srcs = {e["source"] for e in rec.get("exploits") or [] if e.get("verified")}
    if srcs & {"metasploit", "exploitdb"}:
        t.append("exploit")          # módulo de Metasploit o exploit verificado de Exploit-DB
    elif "nuclei" in srcs:
        t.append("deteccion")        # solo plantilla de detección de Nuclei
    elif has_unverified_poc(rec):
        t.append("poc")              # solo PoC sin verificar
    if rec.get("stack"):
        t.append("stack")
    if any(n["type"] == "aviso" and n["lang"] == "es" for n in rec.get("news", [])):
        t.append("incibe")
    if any(n.get("source") == "CERT-EU" for n in rec.get("news", [])):
        t.append("certeu")
    if any(n["type"] == "noticia" for n in rec.get("news", [])):
        t.append("news")
    if (rec.get("attack_vector") or "").upper() == "NETWORK":
        t.append("remote")
    if rec.get("ghsa"):
        t.append("library")
    return t


# ─────────────────────────────── resumen ───────────────────────────────

def label(rec: dict) -> str:
    who = " ".join(x for x in (rec.get("vendor"), rec.get("product")) if x)
    return f"{rec['id']} ({who})" if who else rec["id"]


def summary_template(rep: dict) -> str:
    s = rep["stats"]
    sev = s["by_severity"]
    def pl(n: int, one: str, many: str) -> str:
        return f"{n} {one if n == 1 else many}"

    parts = [f"Hoy se han publicado {pl(s['new_cves'], 'CVE nueva', 'CVE nuevas')}: "
             f"{pl(sev.get('CRITICAL', 0), 'crítica', 'críticas')} y {pl(sev.get('HIGH', 0), 'alta', 'altas')}."]
    kev_new = rep["kev_new"]
    if kev_new:
        names = ", ".join(label(r) for r in kev_new[:2])
        extra = f" y {len(kev_new) - 2} más" if len(kev_new) > 2 else ""
        parts.append(f"CISA ha añadido {pl(len(kev_new), 'vulnerabilidad', 'vulnerabilidades')} a su catálogo "
                     f"de explotación activa (KEV): {names}{extra}.")
    else:
        parts.append("CISA no ha añadido vulnerabilidades nuevas al catálogo KEV.")
    if s["with_poc"]:
        parts.append(f"Hay PoC pública para {pl(s['with_poc'], 'de las relevantes', 'de las relevantes')}.")
    if s["in_stack"]:
        parts.append(f"{pl(s['in_stack'], 'afecta', 'afectan')} a tu stack.")
    if rep["top"]:
        t = rep["top"][0]
        cv = f"CVSS {t['cvss']}, " if t.get("cvss") is not None else ""
        parts.append(f"La más preocupante: {label(t)} — {cv}puntuación {t['score']}/100.")
    return " ".join(parts)


def summary_ai(rep: dict) -> str | None:
    ia = CONFIG.get("ia", {})
    token = os.getenv("GITHUB_TOKEN")
    if not ia.get("activado") or not token:
        return None
    compact = {
        "stats": rep["stats"],
        "top": [{k: r.get(k) for k in ("id", "vendor", "product", "cvss", "severity", "score",
                                         "tags", "description")} for r in rep["top"]],
    }
    prompt = ("Eres analista de ciberseguridad. Con estos datos, escribe en español un briefing matinal "
              "de 3-5 frases para un técnico de sistemas: qué ha salido hoy, qué es lo más urgente y por qué. "
              "Sin listas ni markdown, sin inventar datos que no estén aquí.\n\n" + json.dumps(compact, ensure_ascii=False))
    r = HTTP.post(ia["endpoint"], timeout=60,
                  headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                  json={"model": ia["modelo"], "temperature": 0.3,
                        "messages": [{"role": "user", "content": prompt}]})
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"].strip()


def linkedin_post(rep: dict, date: str) -> str:
    lines = [f"🛰️ Radar CVE · {date}", "",
             f"{rep['stats']['new_cves']} CVE nuevas hoy. Las 3 que yo miraría primero:", ""]
    for i, r in enumerate(rep["top"][:3], 1):
        bits = []
        if "kev" in r["tags"]:
            bits.append("🔥 explotada activamente")
        if "exploit" in r["tags"]:
            bits.append("💣 exploit verificado")
        elif "poc" in r["tags"]:
            bits.append("💣 PoC pública")
        if r.get("cvss") is not None:
            bits.append(f"CVSS {r['cvss']}")
        lines.append(f"{i}. {label(r)} — {' · '.join(bits) or 'pendiente de análisis'}")
    lines += ["", "Datos cruzados de NVD, CISA KEV, EPSS, GitHub Advisories e INCIBE-CERT.",
              "#ciberseguridad #CVE #vulnerabilidades #threatintel"]
    return "\n".join(lines)


# ─────────────────────── esquema de salida (ligero, opción c1) ───────────────────────
# Lo que la web no usa no se publica: menos peso por visita y por edición guardada.

REF_PRIORITY = ["Vendor Advisory", "Patch", "Mitigation", "Release Notes", "Third Party Advisory", "US Government Resource"]
MAX_REFS = 8
DROP_FIELDS = ("links", "cpes", "modified", "status")  # links: la web los construye desde el ID


def _ref_rank(ref: dict) -> int:
    return min((REF_PRIORITY.index(t) for t in ref.get("tags", []) if t in REF_PRIORITY), default=len(REF_PRIORITY))


def slim_cve(r: dict) -> dict:
    o = {k: v for k, v in r.items() if k not in DROP_FIELDS}
    refs = sorted(r.get("references") or [], key=_ref_rank)  # sorted es estable: dentro de cada prioridad, orden de NVD
    o["references"] = refs[:MAX_REFS]
    o["references_total"] = len(refs)
    return o


def slim_report(rep: dict) -> dict:
    """Versión que se escribe en latest.json y days/AAAA-MM-DD.json: top y kev_new como IDs
    (los objetos ya están en cves) y sin advisories (van a advisories.json)."""
    out = {k: v for k, v in rep.items() if k != "advisories"}
    out["cves"] = [slim_cve(r) for r in rep["cves"]]
    out["top"] = [r["id"] for r in rep["top"]]
    out["kev_new"] = [r["id"] for r in rep["kev_new"]]
    return out


# ─────────────────────────────── utilidades ───────────────────────────────

def _safe(fn, *args, default=None, status: dict | None = None, name: str = ""):
    try:
        res = fn(*args)
        if status is not None:
            status[name] = "ok"
        return res
    except Exception as e:
        log(f"⚠ {name or fn.__name__}: {e}")
        if status is not None:
            status[name] = f"error: {type(e).__name__}"
        return default


# ─────────────────────────────── modo diario ───────────────────────────────

def build_daily() -> None:
    g = CONFIG["general"]
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=g["ventana_horas"])
    date = now.astimezone(TZ).strftime("%Y-%m-%d")
    status: dict[str, str] = {}

    # 1) NVD es la base: si falla, abortamos y se conserva el informe anterior
    raw = fetch_nvd_window(since, now)
    status["nvd"] = "ok"
    recs = {r["id"]: r for r in (parse_nvd(x) for x in raw)}

    # 2) KEV: recién añadidas (aunque la CVE sea antigua, que suele ser lo más grave)
    kev = _safe(fetch_kev, default={}, status=status, name="kev")
    kev_cut = (now - timedelta(days=g["kev_dias"])).strftime("%Y-%m-%d")
    kev_new_ids = [cid for cid, k in kev.items() if (k["date_added"] or "") >= kev_cut]
    for cid in kev_new_ids:
        if cid not in recs:
            item = _safe(fetch_nvd_one, cid, name=f"nvd {cid}")
            if item:
                recs[cid] = parse_nvd(item)
            else:  # mínimo viable con lo que da KEV
                k = kev[cid]
                recs[cid] = {"id": cid, "published": None, "description": k["description"],
                             "cvss": None, "severity": None, "vendor": k["vendor"], "product": k["product"],
                             "vendor_source": "kev" if (k["vendor"] or k["product"]) else None,
                             "cna": "", "cwe": [], "cpes": [], "references": [], "exploit_refs": [],
                             "attack_vector": None,
                             "links": {"nvd": f"https://nvd.nist.gov/vuln/detail/{cid}",
                                       "mitre": f"https://www.cve.org/CVERecord?id={cid}"}}
            recs[cid]["old_cve"] = True  # no es nueva de hoy, pero entra en KEV hoy
    for cid, r in recs.items():
        r["kev"] = kev.get(cid)
        if r["kev"] and not r.get("vendor"):  # NVD aún sin CPE: KEV sí trae fabricante/producto
            r["vendor"], r["product"] = brand(r["kev"]["vendor"] or ""), brand(r["kev"]["product"] or "")
            r["vendor_source"] = "kev" if (r["vendor"] or r["product"]) else None

    # 3) EPSS
    epss = _safe(fetch_epss, list(recs), default={}, status=status, name="epss")
    for cid, r in recs.items():
        e = epss.get(cid)
        r["epss"] = e["epss"] if e else None
        r["epss_percentile"] = e["percentile"] if e else None

    # 3b) CVE.org + CISA Vulnrichment: SSVC y CVSS de respaldo (CNA o CISA) si NVD no lo trae
    cvelist = _safe(fetch_cvelist, list(recs), default={}, status=status, name="cvelist")
    for cid, r in recs.items():
        info = cvelist.get(cid) or {}
        r["ssvc"] = info.get("ssvc")
        r["cvss_source"] = "nvd" if r.get("cvss") is not None else None
        if r.get("cvss") is None:
            for src in ("cna", "adp"):
                c = info.get(f"{src}_cvss")
                if c:
                    r.update({"cvss": c["score"], "severity": c["severity"], "cvss_version": c["version"],
                              "vector": c["vector"], "attack_vector": c["attack_vector"] or r.get("attack_vector"),
                              "cvss_source": src})
                    break

    # 3c) Exploits verificados (Metasploit, Nuclei, Exploit-DB)
    exploit_idx = fetch_exploit_indexes(status)
    for cid, r in recs.items():
        r["exploits"] = pick_exploits(exploit_idx.get(cid, []))

    # 4) GitHub Advisories
    ghsa = _safe(fetch_ghsa, since, default=[], status=status, name="ghsa")
    for a in ghsa:
        if a["cve"] and a["cve"] in recs:
            recs[a["cve"]].setdefault("ghsa", []).append(a)

    # 5) RSS (avisos INCIBE y noticias) — ventana algo más amplia
    news = _safe(fetch_rss, now - timedelta(hours=48), default=[], status=status, name="rss")
    seen_urls: set[str] = set()
    news = [n for n in news if not (n["url"] in seen_urls or seen_urls.add(n["url"]))]
    for n in news:
        for cid in n["cves"]:
            if cid in recs:
                recs[cid].setdefault("news", []).append(
                    {k: n[k] for k in ("title", "url", "source", "type", "lang", "date")})

    # 6) Stack + puntuación previa → buscar PoC sólo en las mejores candidatas
    for r in recs.values():
        r["stack"] = stack_match(r)
        r["score"] = score(r)
    candidates = sorted(recs.values(), key=lambda r: r["score"], reverse=True)[:g["poc_candidatas"]]
    pocs = _safe(fetch_pocs, [r["id"] for r in candidates], default={}, status=status, name="poc")
    for r in recs.values():
        r["poc"] = pocs.get(r["id"], [])
        r.setdefault("news", [])
        r.setdefault("ghsa", [])

    # 7) Saneamiento y puntuación final, sobre datos ya validados (una PoC con URL no
    #    http(s) se descarta y no suma). Registros con ID inválido se descartan enteros.
    clean_recs = {}
    for r in recs.values():
        r = sanitize_cve(r)
        if r is None:
            continue
        infer_vendor(r)
        r["stack"] = stack_match(r)
        r["score"] = score(r)
        r["score_breakdown"] = breakdown(r)
        r["tags"] = tags(r)
        clean_recs[r["id"]] = r
    recs = clean_recs
    kev_new_ids = [cid for cid in kev_new_ids if cid in recs]
    news = [n for n in (sanitize_news(x) for x in news) if n]
    ghsa = [a for a in (sanitize_ghsa(x) for x in ghsa) if a]

    ordered = sorted(recs.values(), key=rank_key, reverse=True)
    new_only = [r for r in ordered if not r.get("old_cve")]
    kev_new = [r for r in ordered if r["id"] in kev_new_ids]

    by_sev: dict[str, int] = {}
    for r in new_only:
        k = r.get("severity") or "UNSCORED"
        by_sev[k] = by_sev.get(k, 0) + 1

    rep = {
        "date": date,
        "generated_at": now.isoformat(),
        "window": {"from": since.isoformat(), "to": now.isoformat()},
        "stats": {
            "new_cves": len(new_only),
            "by_severity": by_sev,
            "kev_new": len(kev_new),
            "with_poc": sum(1 for r in ordered if {"poc", "exploit", "deteccion"} & set(r["tags"])),  # cualquier código de ataque
            "with_exploit": sum(1 for r in ordered if "exploit" in r["tags"]),         # exploit verificado
            "with_detection": sum(1 for r in ordered if "deteccion" in r["tags"]),     # solo plantilla de Nuclei
            "in_stack": sum(1 for r in ordered if r["stack"]),
            "remote": sum(1 for r in new_only if "remote" in r["tags"]),
            "ghsa": len(ghsa),
            "news": len(news),
        },
        "scoring_weights": scoring_weights(),
        "top": ordered[:g["top_n"]],
        "kev_new": kev_new,
        "cves": ordered,
        "advisories": [a for a in ghsa if not a["cve"] or a["cve"] not in recs],
        "news": news[:40],
        "sources_status": status,
    }
    rep["summary_template"] = summary_template(rep)
    rep["summary"] = _safe(summary_ai, rep, name="ia") or rep["summary_template"]
    rep["linkedin_post"] = linkedin_post(rep, date)

    slim = slim_report(rep)
    write_json(DATA / "latest.json", slim)
    write_json(DAYS / f"{date}.json", slim)
    # Avisos de GitHub sin CVE: aparte, para el futuro panel "Librerías"
    write_json(DATA / "advisories.json", {"date": date, "generated_at": rep["generated_at"], "advisories": rep["advisories"]})
    (DATA / "linkedin.md").write_text(rep["linkedin_post"] + "\n", encoding="utf-8")
    update_index(rep)
    log(f"✔ Informe {date}: {rep['stats']['new_cves']} nuevas, {len(kev_new)} KEV, top: "
        + ", ".join(f"{r['id']}({r['score']})" for r in rep["top"][:3]))


def update_index(rep: dict) -> None:
    path = DATA / "index.json"
    idx = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"days": []}
    days = [d for d in idx["days"] if d["date"] != rep["date"]]
    days.append({"date": rep["date"], "stats": rep["stats"],
                 "top": [{"id": r["id"], "score": r["score"]} for r in rep["top"][:3]]})
    days.sort(key=lambda d: d["date"], reverse=True)
    keep = CONFIG["general"]["dias_historico"]
    for old in days[keep:]:  # borra ficheros fuera del histórico para no engordar el repo
        (DAYS / f"{old['date']}.json").unlink(missing_ok=True)
    write_json(path, {"updated_at": rep["generated_at"], "days": days[:keep]})


# ─────────────────────────────── modo mapa ───────────────────────────────

def norm_ip(raw: str) -> str | None:
    """SANS ISC rellena con ceros (045.142.001.007): los quitamos y validamos."""
    try:
        ip = ".".join(str(int(p)) for p in str(raw).strip().split(".")) if "." in str(raw) else str(raw)
        addr = ipaddress.ip_address(ip)
        return None if (addr.is_private or addr.is_reserved or addr.is_loopback) else ip
    except ValueError:
        return None


def isc_rows(data) -> list[dict]:
    """Filas de datos de la API de ISC, que responde en tres formas según el endpoint:
       - lista:                 [{…}, {…}]                      (sources/attacks)
       - dict que envuelve:     {"clave": [{…}, {…}]}
       - dict de claves numéricas con escalares sueltos:
                                {"0": {…}, "1": {…}, "date": "…", "limit": 10}   (topports)
    En el último caso los escalares (date, limit) se descartan por no ser dicts."""
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
        return [v for v in data.values() if isinstance(v, dict)]
    return []


def fetch_isc_attackers(n: int) -> tuple[list[tuple[str, int]], str]:
    today = datetime.now(timezone.utc).date()
    for d in (today, today - timedelta(days=1)):  # el día en curso puede venir vacío
        r = HTTP.get(ISC_ATTACKS_URL.format(n=n, date=d), timeout=60)
        r.raise_for_status()
        out = []
        for row in isc_rows(r.json()):
            ip = norm_ip(row.get("ip") or row.get("source") or "")
            hits = num(row.get("attacks") or row.get("reports") or row.get("count") or 1, 0, 1e9)
            if ip and hits is not None:
                out.append((ip, int(hits)))
        if out:
            return out, str(d)
    return [], str(today)


def fetch_isc_ports(date: str) -> list[dict]:
    r = HTTP.get(ISC_PORTS_URL.format(date=date), timeout=60)
    r.raise_for_status()
    out = []
    for row in isc_rows(r.json()):
        port = num(row.get("targetport") if row.get("targetport") is not None else row.get("port"), 0, 65535)
        if port is None:
            continue
        cnt = lambda k: int(num(row.get(k), 0, 1e12) or 0)  # noqa: E731
        out.append({"port": int(port), "records": cnt("records"), "sources": cnt("sources"), "targets": cnt("targets")})
    return out


# ─────────────── geolocalización offline: DB-IP Lite (CC BY 4.0) ───────────────
# Antes se usaba ip-api.com, cuyo plan gratuito solo funciona por HTTP (IPs y respuestas en
# claro). Ahora la base mensual de DB-IP se descarga por HTTPS, se verifica con el SHA-1 que
# publica DB-IP y se consulta en local. Se cachea por mes: el mapa corre 8 veces al día y la
# base solo cambia una vez al mes (60 MB por descarga).

DBIP_MAX_GZ = 200 * 1024 * 1024       # tope de descarga
DBIP_MAX_MMDB = 600 * 1024 * 1024     # tope al descomprimir (defensa ante un gzip anómalo)


def dbip_sha1(page: str, month: str) -> str | None:
    """SHA-1 que publica DB-IP para el MMDB de ese mes. En su página cada tarjeta es
    <dt>SHA1SUM</dt><dd>HASH</dd> … <a href='…/dbip-city-lite-AAAA-MM.mmdb.gz'>. Ojo: el hash
    es el del fichero .mmdb DESCOMPRIMIDO, no el del .gz (comprobado el 2026-11-01)."""
    m = re.search(r"SHA1SUM(?:\s|<[^>]{0,80}>){0,10}([0-9a-f]{40})(?:(?!SHA1SUM).){0,1500}?"
                  r"dbip-city-lite-" + re.escape(month) + r"\.mmdb\.gz", page, re.S | re.I)
    return m.group(1).lower() if m else None


def _dbip_expected_sha1(month: str) -> str | None:
    r = HTTP.get(DBIP_PAGE, timeout=30)
    r.raise_for_status()
    return dbip_sha1(r.text[:2_000_000], month)


def _dbip_download(month: str) -> Path | None:
    """Descarga y verifica la base de un mes. None si DB-IP aún no la ha publicado (404)."""
    GEO_CACHE.mkdir(parents=True, exist_ok=True)
    dest = GEO_CACHE / f"dbip-city-lite-{month}.mmdb"
    gz_tmp, mmdb_tmp = dest.with_suffix(".mmdb.gz.part"), dest.with_suffix(".mmdb.part")
    try:
        with HTTP.get(DBIP_URL.format(month=month), timeout=300, stream=True) as r:
            if r.status_code == 404:
                return None
            r.raise_for_status()
            size = 0
            with gz_tmp.open("wb") as f:
                for chunk in r.iter_content(1 << 20):
                    size += len(chunk)
                    if size > DBIP_MAX_GZ:
                        raise ValueError("descarga de DB-IP demasiado grande")
                    f.write(chunk)
        # SHA-1 porque es el único hash que publica DB-IP: comprueba que la descarga llegó entera
        # e intacta (integridad), no es una firma. Quien pudiera cambiar el fichero en DB-IP también
        # cambiaría el hash de su página, así que un hash más fuerte no añadiría nada aquí.
        sha1, out = hashlib.sha1(usedforsecurity=False), 0   # nosemgrep: insecure-hash-algorithm-sha1
        with gzip.open(gz_tmp, "rb") as src, mmdb_tmp.open("wb") as dst:
            while chunk := src.read(1 << 20):
                out += len(chunk)
                if out > DBIP_MAX_MMDB:
                    raise ValueError("base de DB-IP descomprimida demasiado grande")
                sha1.update(chunk)
                dst.write(chunk)
        expected = _safe(_dbip_expected_sha1, month, name="dbip sha1")
        if expected and sha1.hexdigest() != expected:
            raise ValueError(f"SHA-1 de DB-IP no coincide ({sha1.hexdigest()} ≠ {expected})")
        log(f"DB-IP {month}: descargada ({size // 1024 // 1024} MB), "
            + ("SHA-1 verificado" if expected else "⚠ sin SHA-1 publicado para verificar"))
        mmdb_tmp.replace(dest)
    finally:
        gz_tmp.unlink(missing_ok=True)
        mmdb_tmp.unlink(missing_ok=True)
    for old in GEO_CACHE.glob("dbip-city-lite-*.mmdb"):  # solo se guarda la del mes vigente
        if old != dest:
            old.unlink(missing_ok=True)
    return dest


def dbip_path() -> Path:
    """Base del mes en curso (de la caché o descargada); si aún no está publicada, la anterior."""
    now = datetime.now(timezone.utc)
    cur = now.strftime("%Y-%m")
    prev = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    for month in (cur, prev):
        cached = GEO_CACHE / f"dbip-city-lite-{month}.mmdb"
        if cached.exists():
            return cached
        try:
            got = _dbip_download(month)
            if got:
                return got
        except Exception as e:  # p. ej. el mes en curso aún no está o el SHA-1 no cuadra
            log(f"⚠ DB-IP {month}: {e}")
    raise RuntimeError("no hay base de DB-IP disponible")


def geo_fields(rec) -> dict | None:
    """Campos útiles de un registro de DB-IP, validados (coordenadas en rango, país ISO-2)."""
    if not isinstance(rec, dict):
        return None
    loc, ctry = rec.get("location") or {}, rec.get("country") or {}
    lat, lon = num(loc.get("latitude"), -90, 90), num(loc.get("longitude"), -180, 180)
    cc = str(ctry.get("iso_code") or "").upper()
    names = ctry.get("names") or {}
    if lat is None or lon is None or not re.fullmatch(r"[A-Z]{2}", cc):
        return None
    return {"lat": lat, "lon": lon, "cc": cc, "country": cap(names.get("es") or names.get("en") or cc, LIMIT["country"])}


def geolocate(ips: list[str]) -> dict[str, dict]:
    out = {}
    with maxminddb.open_database(str(dbip_path())) as db:
        for ip in ips:
            g = geo_fields(db.get(ip))
            if g:
                out[ip] = g
    return out


def build_map() -> None:
    now = datetime.now(timezone.utc)
    attackers, day = fetch_isc_attackers(CONFIG["mapa"]["ips"])
    log(f"ISC: {len(attackers)} IPs atacantes ({day})")
    geo = geolocate([ip for ip, _ in attackers])

    points: dict[tuple, dict] = {}
    countries: dict[str, dict] = {}
    for ip, hits in attackers:
        g = geo.get(ip)
        if not g:
            continue
        key = (round(g["lat"], 1), round(g["lon"], 1))  # agregamos por zona, sin exponer IPs
        p = points.setdefault(key, {"lat": key[0], "lon": key[1], "country": g["country"],
                                    "cc": g["cc"], "attacks": 0, "sources": 0})
        p["attacks"] += hits
        p["sources"] += 1
        c = countries.setdefault(g["cc"], {"cc": g["cc"], "country": g["country"],
                                           "attacks": 0, "sources": 0})
        c["attacks"] += hits
        c["sources"] += 1

    ports = _safe(fetch_isc_ports, day, default=[], name="isc puertos")
    write_json(DATA / "map.json", {
        "updated_at": now.isoformat(),
        "data_day": day,
        "source": "SANS Internet Storm Center (DShield) · geolocalización IP Geolocation by DB-IP (CC BY 4.0)",
        # Lo que es de verdad: el ranking acumulado de DShield, no un recuento de las últimas 24 h
        "note": (f"Ranking de DShield: las {len(attackers)} IPs con más ataques acumulados entre las que "
                 f"siguen activas el {day}, geolocalizadas y agregadas por zona. No es un recuento de 24 horas."),
        "points": sorted(points.values(), key=lambda p: p["attacks"], reverse=True),
        "by_country": sorted(countries.values(), key=lambda c: c["attacks"], reverse=True),
        "top_ports": ports,
    })
    log(f"✔ Mapa: {len(points)} puntos en {len(countries)} países")
    map_coverage_warning(len(countries), len(attackers))


def map_coverage_warning(n_countries: int, n_ips: int) -> bool:
    """Avisa si el mapa sale con pocos países (criterio: al menos [mapa] min_paises). No falla
    el job: el mapa se publica igual, pero queda una anotación visible en GitHub Actions."""
    minimum = int(CONFIG["mapa"].get("min_paises", 10))
    if n_countries >= minimum:
        return False
    msg = f"Mapa con solo {n_countries} países (mínimo {minimum}) a partir de {n_ips} IPs de DShield"
    log(f"⚠ {msg}")
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print(f"::warning title=Mapa de ataques::{msg}", flush=True)
    return True


# ──────────────────────────────── main ────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="Radar CVE")
    ap.add_argument("mode", choices=["daily", "map", "all"])
    mode = ap.parse_args().mode
    ok = True
    if mode in ("daily", "all"):
        try:
            build_daily()
        except Exception as e:
            log(f"✗ Informe diario falló: {e}")
            ok = False
    if mode in ("map", "all"):
        try:
            build_map()
        except Exception as e:
            log(f"✗ Mapa falló: {e}")
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
