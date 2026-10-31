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

Modos:
  python scripts/radar.py daily   → data/latest.json, data/days/AAAA-MM-DD.json,
                                    data/index.json, data/linkedin.md
  python scripts/radar.py map     → data/map.json (ataques geolocalizados)
  python scripts/radar.py all     → ambos

Variables de entorno opcionales:
  NVD_API_KEY   clave gratuita de NVD (sube mucho el límite de peticiones)
  GITHUB_TOKEN  en GitHub Actions ya existe; para GHSA y el resumen con IA
"""

from __future__ import annotations

import argparse
import html
import ipaddress
import json
import os
import re
import sys
import time
import tomllib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import feedparser
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
GEO_URL = "http://ip-api.com/batch?fields=status,query,country,countryCode,lat,lon"

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
    return name.replace("_", " ").strip().title() if name else ""


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
        "cna": cna_domain,
        "cwe": cwes,
        "cpes": cpes[:10],
        "references": [{"url": r["url"], "tags": r.get("tags", [])} for r in refs[:10]],
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


# ──────────────────────────────── RSS ────────────────────────────────

def clean(text: str, limit: int = 300) -> str:
    t = html.unescape(TAG_RE.sub(" ", text or ""))
    t = re.sub(r"\s+", " ", t).strip()
    return t if len(t) <= limit else t[:limit].rsplit(" ", 1)[0] + "…"


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
            items.append({
                "title": clean(e.get("title", ""), 200),
                "summary": clean(e.get("summary", "")),
                "url": e.get("link"),
                "date": dt.isoformat(),
                "source": feed["nombre"],
                "type": feed.get("tipo", "noticia"),
                "lang": feed.get("idioma", "en"),
                "cves": sorted({m.upper() for m in CVE_RE.findall(raw)}),
            })
            n += 1
        log(f"RSS ✓ {feed['nombre']}: {n} entradas recientes")
    items.sort(key=lambda x: x["date"], reverse=True)
    return items


# ─────────────────────────── puntuación y etiquetas ───────────────────────────

def stack_match(rec: dict) -> list[str]:
    hay = " ".join([rec.get("description", ""), rec.get("vendor", ""), rec.get("product", ""),
                    rec.get("cna", ""), " ".join(rec.get("cpes", []))]).lower().replace("_", " ")
    return [w for w in CONFIG["stack"]["palabras"] if w.lower() in hay]


def score(rec: dict) -> int:
    w = CONFIG["puntuacion"]
    s = 0.0
    # Sin CVSS todavía (muy habitual el primer día): valor neutro del 40 %
    s += (rec["cvss"] / 10 if rec.get("cvss") is not None else 0.4) * w["cvss_max"]
    if rec.get("epss_percentile") is not None:
        s += rec["epss_percentile"] * w["epss_max"]
    if rec.get("kev"):
        s += w["kev"]
        if rec["kev"].get("ransomware"):
            s += w["ransomware"]
    if rec.get("poc") or rec.get("exploit_refs"):
        s += w["poc"]
    if rec.get("stack"):
        s += w["stack"]
    return min(100, round(s))


def tags(rec: dict) -> list[str]:
    t = []
    if rec.get("kev"):
        t.append("kev")
        if rec["kev"].get("ransomware"):
            t.append("ransomware")
    if rec.get("poc") or rec.get("exploit_refs"):
        t.append("poc")
    if rec.get("stack"):
        t.append("stack")
    if any(n["type"] == "aviso" and n["lang"] == "es" for n in rec.get("news", [])):
        t.append("incibe")
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
        if "poc" in r["tags"]:
            bits.append("💣 PoC pública")
        if r.get("cvss") is not None:
            bits.append(f"CVSS {r['cvss']}")
        lines.append(f"{i}. {label(r)} — {' · '.join(bits) or 'pendiente de análisis'}")
    lines += ["", "Datos cruzados de NVD, CISA KEV, EPSS, GitHub Advisories e INCIBE-CERT.",
              "#ciberseguridad #CVE #vulnerabilidades #threatintel"]
    return "\n".join(lines)


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
                             "cna": "", "cwe": [], "cpes": [], "references": [], "exploit_refs": [],
                             "attack_vector": None,
                             "links": {"nvd": f"https://nvd.nist.gov/vuln/detail/{cid}",
                                       "mitre": f"https://www.cve.org/CVERecord?id={cid}"}}
            recs[cid]["old_cve"] = True  # no es nueva de hoy, pero entra en KEV hoy
    for cid, r in recs.items():
        r["kev"] = kev.get(cid)
        if r["kev"] and not r.get("vendor"):  # NVD aún sin CPE: KEV sí trae fabricante/producto
            r["vendor"], r["product"] = r["kev"]["vendor"] or "", r["kev"]["product"] or ""

    # 3) EPSS
    epss = _safe(fetch_epss, list(recs), default={}, status=status, name="epss")
    for cid, r in recs.items():
        e = epss.get(cid)
        r["epss"] = e["epss"] if e else None
        r["epss_percentile"] = e["percentile"] if e else None

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
        r["score"] = score(r)
        r["tags"] = tags(r)

    ordered = sorted(recs.values(), key=lambda r: (r["score"], r.get("cvss") or 0), reverse=True)
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
            "with_poc": sum(1 for r in ordered if "poc" in r["tags"]),
            "in_stack": sum(1 for r in ordered if r["stack"]),
            "remote": sum(1 for r in new_only if "remote" in r["tags"]),
            "ghsa": len(ghsa),
            "news": len(news),
        },
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

    write_json(DATA / "latest.json", rep)
    write_json(DAYS / f"{date}.json", rep)
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
    """La API de ISC a veces envuelve la lista; nos quedamos con los dicts de datos."""
    if isinstance(data, dict):
        data = next((v for v in data.values() if isinstance(v, list)), [])
    return [x for x in data if isinstance(x, dict)]


def fetch_isc_attackers(n: int) -> tuple[list[tuple[str, int]], str]:
    today = datetime.now(timezone.utc).date()
    for d in (today, today - timedelta(days=1)):  # el día en curso puede venir vacío
        r = HTTP.get(ISC_ATTACKS_URL.format(n=n, date=d), timeout=60)
        r.raise_for_status()
        out = []
        for row in isc_rows(r.json()):
            ip = norm_ip(row.get("ip") or row.get("source") or "")
            hits = row.get("attacks") or row.get("reports") or row.get("count") or 1
            if ip:
                out.append((ip, int(hits)))
        if out:
            return out, str(d)
    return [], str(today)


def fetch_isc_ports(date: str) -> list[dict]:
    r = HTTP.get(ISC_PORTS_URL.format(date=date), timeout=60)
    r.raise_for_status()
    out = []
    for row in isc_rows(r.json()):
        port = row.get("targetport") or row.get("port")
        if port is None:
            continue
        out.append({"port": int(port), "records": int(row.get("records") or 0),
                    "sources": int(row.get("sources") or 0), "targets": int(row.get("targets") or 0)})
    return out


def geolocate(ips: list[str]) -> dict[str, dict]:
    out = {}
    for i in range(0, len(ips), 100):  # ip-api: 100 IPs por lote, 15 lotes/min gratis
        r = HTTP.post(GEO_URL, json=[{"query": ip} for ip in ips[i:i + 100]], timeout=60)
        r.raise_for_status()
        for g in r.json():
            if g.get("status") == "success":
                out[g["query"]] = g
        time.sleep(4.5)
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
                                    "cc": g["countryCode"], "attacks": 0, "sources": 0})
        p["attacks"] += hits
        p["sources"] += 1
        c = countries.setdefault(g["countryCode"], {"cc": g["countryCode"], "country": g["country"],
                                                    "attacks": 0, "sources": 0})
        c["attacks"] += hits
        c["sources"] += 1

    ports = _safe(fetch_isc_ports, day, default=[], name="isc puertos")
    write_json(DATA / "map.json", {
        "updated_at": now.isoformat(),
        "data_day": day,
        "source": "SANS Internet Storm Center (DShield) · geolocalización ip-api.com",
        "note": "IPs con más ataques reportados por sensores DShield, agregadas por zona.",
        "points": sorted(points.values(), key=lambda p: p["attacks"], reverse=True),
        "by_country": sorted(countries.values(), key=lambda c: c["attacks"], reverse=True),
        "top_ports": ports,
    })
    log(f"✔ Mapa: {len(points)} puntos en {len(countries)} países")


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
