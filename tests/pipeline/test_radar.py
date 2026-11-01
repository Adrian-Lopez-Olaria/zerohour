"""Tests del pipeline (scripts/radar.py). Sin red: respuestas grabadas en fixtures/."""
import copy

import pytest

from conftest import load_fixture


# ───────────────────────── SANS ISC: las dos formas de respuesta ─────────────────────────

def test_isc_rows_lista(radar):
    rows = radar.isc_rows(load_fixture("isc_attacks_2026-10-31.json"))
    assert len(rows) == 5 and all("ip" in r for r in rows)


def test_isc_rows_claves_numeradas(radar):
    """topports devuelve {"0":{…},…,"date":…,"limit":10}: antes salía [] (bug)."""
    data = load_fixture("isc_topports_2026-10-31.json")
    assert "date" in data and "0" in data
    rows = radar.isc_rows(data)
    assert len(rows) == 10 and rows[0]["targetport"] == 22


def test_isc_rows_envoltura_y_basura(radar):
    assert radar.isc_rows({"x": [{"a": 1}, "ruido", 3]}) == [{"a": 1}]
    assert radar.isc_rows("no es json de ISC") == []
    assert radar.isc_rows(None) == []


def test_fetch_isc_ports_con_respuesta_real(radar, fake_get):
    fake_get({"topports": load_fixture("isc_topports_2026-10-31.json")})
    ports = radar.fetch_isc_ports("2026-10-31")
    assert [p["port"] for p in ports[:3]] == [22, 80, 23]
    assert all(set(p) == {"port", "records", "sources", "targets"} for p in ports)


def test_fetch_isc_ports_descarta_valores_fuera_de_rango(radar, fake_get):
    fake_get({"topports": {"0": {"targetport": 99999, "records": 5}, "1": {"targetport": "443", "records": -3},
                           "2": {"targetport": "<script>", "records": 1}, "date": "x"}})
    assert radar.fetch_isc_ports("2026-10-31") == [{"port": 443, "records": 0, "sources": 0, "targets": 0}]


def test_fetch_isc_attackers_normaliza_y_filtra(radar, fake_get):
    fake_get({"sources/attacks": [{"ip": "045.142.001.007", "attacks": 10}, {"ip": "10.0.0.1", "attacks": 5},
                                  {"ip": "no-ip", "attacks": 1}, {"ip": "8.8.8.8", "attacks": "NaN"}]})
    out, _ = radar.fetch_isc_attackers(4)
    assert out == [("45.142.1.7", 10)]   # ceros quitados; privada, inválida y NaN fuera


# ───────────────────────── stack con exclusiones (config.toml) ─────────────────────────

def rec(**kw):
    base = {"id": "CVE-2026-0001", "description": "", "vendor": "", "product": "", "vendor_source": None, "cna": "", "cpes": []}
    base.update(kw)
    return base


def test_stack_wordpress_core_sin_cpe_marca(radar):
    r = rec(description="WordPress before 6.8.3 allows stored XSS via the block editor.")
    assert "wordpress" in radar.stack_match(r)


def test_stack_plugin_wordpress_no_marca(radar):
    r = rec(description="The SimpleForm plugin for WordPress is vulnerable to SQL injection in all versions up to 2.1.")
    assert radar.stack_match(r) == []


def test_stack_tema_wordpress_no_marca(radar):
    r = rec(description="The Astra theme for WordPress is vulnerable to Stored Cross-Site Scripting.")
    assert radar.stack_match(r) == []


def test_stack_plugin_con_cpe_target_sw_no_marca(radar):
    """El CPE de un plugin lleva target_sw=wordpress; solo cuentan fabricante:producto del CPE."""
    r = rec(description="The Forms plugin for WordPress is vulnerable…",
            cpes=["cpe:2.3:a:acme:simpleform:*:*:*:*:*:wordpress:*:*"], vendor="Acme", product="Simpleform", vendor_source="nvd")
    assert radar.stack_match(r) == []


def test_stack_wordpress_core_con_cpe_marca(radar):
    r = rec(cpes=["cpe:2.3:a:wordpress:wordpress:*:*:*:*:*:*:*:*"], vendor="Wordpress", product="Wordpress", vendor_source="nvd")
    assert "wordpress" in radar.stack_match(r)


def test_stack_fabricante_deducido_por_patron_no_cuenta(radar):
    r = rec(description="The X plugin for WordPress is vulnerable…", vendor="Plugin WordPress", product="X", vendor_source="patron")
    assert radar.stack_match(r) == []


def test_stack_patchstack_plugin_llamado_wordpress_no_marca(radar):
    """Formato Patchstack con un plugin cuyo nombre empieza por "WordPress" (CVE-2026-66570, real)."""
    r = rec(description="Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting') vulnerability "
                        "in Nickboss WordPress File Upload wp-file-upload allows Stored XSS.This issue affects WordPress File "
                        "Upload: from n/a through 5.2.1.", cna="patchstack.com")
    assert radar.stack_match(r) == []


def test_stack_patchstack_core_si_marca(radar):
    r = rec(description="Missing Authorization vulnerability in WordPress allows… This issue affects WordPress: from n/a through 6.8.2.")
    assert radar.stack_match(r) == ["wordpress"]


def test_stack_otras_palabras_sin_cambios(radar):
    assert radar.stack_match(rec(description="Wazuh manager allows RCE")) == ["wazuh"]
    assert radar.stack_match(rec(vendor="Vmware", product="Esxi", vendor_source="nvd")) == ["vmware", "esxi"]


def test_stack_en_datos_reales_baja_de_110_a_unas_pocas(radar, real_cves):
    hits = {}
    for c in copy.deepcopy(real_cves):
        c.setdefault("vendor_source", "nvd" if (c.get("vendor") or c.get("product")) else None)
        if m := radar.stack_match(c):
            hits[c["id"]] = m
    assert sum(1 for c in real_cves if c.get("stack")) == 110      # antes
    # después: VMware ESXi, Wazuh, Windows Server… y un WordPress CORE (RCE, aún sin CPE), que
    # es justo lo que la exclusión tiene que seguir cazando; los ~106 plugins ya no cuentan
    assert hits == {
        "CVE-2026-41709": ["vmware", "esxi"], "CVE-2026-61729": ["wazuh"],
        "CVE-2026-116243": ["windows server"], "CVE-2026-119977": ["wordpress"],
    }, hits


# ───────────────────────── fabricante deducido ─────────────────────────

def test_fabricante_plugin_wordpress(radar):
    r = rec(description="The SimpleForm – Form Maker plugin for WordPress is vulnerable to…", cna="wordfence.com")
    radar.infer_vendor(r)
    assert (r["vendor"], r["product"], r["vendor_source"]) == ("Plugin WordPress", "SimpleForm – Form Maker", "patron")


def test_fabricante_tema_wordpress(radar):
    r = rec(description="The Astra theme for WordPress is vulnerable to XSS")
    radar.infer_vendor(r)
    assert (r["vendor"], r["product"]) == ("Tema WordPress", "Astra")


def test_fabricante_sin_patron_usa_cna(radar):
    r = rec(description="A flaw in some router firmware", cna="vuldb.com")
    radar.infer_vendor(r)
    assert r["vendor"] == "" and r["vendor_source"] == "cna"


def test_fabricante_de_nvd_no_se_toca(radar):
    r = rec(description="The X plugin for WordPress…", vendor="Gitlab", product="Gitlab", vendor_source="nvd")
    radar.infer_vendor(r)
    assert (r["vendor"], r["vendor_source"]) == ("Gitlab", "nvd")


def test_fabricante_en_datos_reales(radar, real_cves):
    vacios = [copy.deepcopy(c) for c in real_cves if not c.get("vendor") and not c.get("product")]
    for c in vacios:
        radar.infer_vendor(c)
    por_patron = [c for c in vacios if c["vendor_source"] == "patron"]
    # Todas las que mencionan WordPress son plugins salvo CVE-2026-119977 (el core). Ojo: varios
    # plugins citan "WordPress core" de pasada ("…because WordPress core executes…").
    wp_plugins = [c for c in vacios if "wordpress" in c["description"].lower() and c["id"] != "CVE-2026-119977"]
    assert len(por_patron) == len(wp_plugins), [c["description"][:80] for c in wp_plugins if c["vendor_source"] != "patron"]
    assert all(c["vendor_source"] in ("patron", "cna", None) for c in vacios)
    core = next(c for c in vacios if c["id"] == "CVE-2026-119977")
    assert core["vendor_source"] != "patron"                       # WordPress core no es un plugin
    wpscan = next(c for c in vacios if c["id"] == "CVE-2026-119714")
    assert (wpscan["vendor"], wpscan["product"]) == ("Plugin WordPress", "My Calendar")


# ───────────────────────── safe_url: mismos casos que la web ─────────────────────────

@pytest.mark.parametrize("u", [
    "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "java&#x09;script:alert(1)",
    "%6Aavascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)",
    "//evil.com", "/ruta-relativa", "https://exa\u0007mple.com/", "https://ok.com/\tpath", "https://ok.com/a b",
    "ftp://ok.com/f", "https://user:pass@evil.com/", "https://", "https://ok.com/" + "a" * 2100, None, 42, "",
])
def test_safe_url_rechaza(radar, u):
    assert radar.safe_url(u) is None


@pytest.mark.parametrize("u", ["https://github.com/real/repo", "http://ok.example.com/legit?q=1",
                               "https://nvd.nist.gov/vuln/detail/CVE-2026-1234"])
def test_safe_url_acepta(radar, u):
    assert radar.safe_url(u) == u


# ───────────────────────── saneamiento de una CVE hostil ─────────────────────────

def hostile():
    return {
        "id": "CVE-2026-12345", "description": "x" * 9000 + "\u0000\u0007",
        "vendor": "<img src=x onerror=alert(1)>" * 20, "product": "P", "cna": "c.com",
        "cvss": 11.5, "severity": "CRITICAL", "vector": "CVSS:3.1/AV:N\"><script>", "attack_vector": "SPACE",
        "epss": -0.2, "epss_percentile": float("nan"),
        "cwe": ["CWE-79", "<b>", "NVD-CWE-noinfo", "CWE-999999"],
        "references": [{"url": "javascript:alert(1)", "tags": ["Patch"]}, {"url": "https://ok.com/a", "tags": ["Patch"]}],
        "exploit_refs": ["data:text/html,x", "https://ok.com/e"],
        "poc": [{"url": "javascript:alert(1)", "name": "x"}, {"url": "https://github.com/a/b", "name": "<svg onload=1>", "stars": "7"}],
        "news": [{"title": "t", "url": "vbscript:x"}, {"title": "ok", "url": "https://n.com/1", "lang": "es\"><", "cves": ["CVE-1", "CVE-2026-1111"]}],
        "kev": {"date_added": "2026-10-29", "due_date": "<script>", "ransomware": "yes", "action": "a" * 5000},
        "links": {"nvd": "javascript:alert(1)"},
    }


def test_sanitize_cve_hostil(radar):
    r = radar.sanitize_cve(hostile())
    assert len(r["description"]) <= radar.LIMIT["description"] + 1 and "\u0000" not in r["description"]
    assert len(r["vendor"]) <= radar.LIMIT["vendor"] + 1
    assert r["cvss"] is None and r["severity"] is None          # 11.5 fuera de rango → sin severidad
    assert r["vector"] is None and r["attack_vector"] is None
    assert r["epss"] is None and r["epss_percentile"] is None
    assert r["cwe"] == ["CWE-79", "NVD-CWE-noinfo"]
    assert [x["url"] for x in r["references"]] == ["https://ok.com/a"]
    assert r["exploit_refs"] == ["https://ok.com/e"]
    assert [p["url"] for p in r["poc"]] == ["https://github.com/a/b"] and r["poc"][0]["stars"] == 7
    assert [n["url"] for n in r["news"]] == ["https://n.com/1"] and r["news"][0]["lang"] == "" and r["news"][0]["cves"] == ["CVE-2026-1111"]
    assert r["kev"]["due_date"] is None and r["kev"]["ransomware"] is False and len(r["kev"]["action"]) <= 1001
    assert r["links"]["nvd"] == "https://nvd.nist.gov/vuln/detail/CVE-2026-12345"   # reconstruido desde el ID


@pytest.mark.parametrize("bad", ["CVE-2026-1", "cve-2026-12345", "CVE-2026-12345\"><script>", "", None])
def test_sanitize_cve_descarta_id_invalido(radar, bad):
    h = hostile()
    h["id"] = bad
    assert radar.sanitize_cve(h) is None


def test_sanitize_ghsa(radar):
    bad = {"id": "GHSA-abcd-efgh-jkmp", "url": "https://github.com/advisories/GHSA-abcd-efgh-jkmp", "summary": "s"}
    assert radar.sanitize_ghsa(bad) is None   # 'a','b','d','e' no son del alfabeto de los ID de GHSA
    ok = {"id": "GHSA-2c3f-4g5h-6j7m", "url": "https://github.com/advisories/GHSA-2c3f-4g5h-6j7m", "summary": "s"}
    assert radar.sanitize_ghsa(ok)["id"] == "GHSA-2c3f-4g5h-6j7m"
    assert radar.sanitize_ghsa({**ok, "url": "javascript:x"}) is None


# ───────────────────────── puntuación: desglose y pesos ─────────────────────────

def test_score_igual_que_antes_en_las_453_reales(radar, real_cves):
    """El desglose no cambia ningún score del día 31, salvo empates exactos en .5, que antes
    round() de Python mandaba al par y ahora suben (como Math.round en la web)."""
    distintos = [(c["id"], c["score"], radar.score(c)) for c in real_cves if radar.score(c) != c["score"]]
    for cid, antes, ahora in distintos:
        raw = sum(radar._breakdown_raw(next(c for c in real_cves if c["id"] == cid)).values())
        assert abs(raw - int(raw) - 0.5) < 1e-6 and ahora == antes + 1, (cid, antes, ahora, raw)
    assert len(distintos) <= 5


def test_desglose_suma_el_score_como_lo_suma_la_web(radar, real_cves):
    import math
    for c in real_cves:
        assert math.floor(sum(radar.breakdown(c).values()) + 0.5) == radar.score(c)   # = Math.round()


def test_redondeo_de_medios_hacia_arriba(radar):
    # cvss 7.0 → 24.5 · KEV 25 · nada más → 49.5 → 50 (antes: round(49.5) = 50) y 48.5 → 49 (antes 48)
    assert radar.score({"cvss": 7.0, "kev": {"ransomware": False}}) == 50
    assert radar.score({"cvss": 6.71428571, "kev": {"ransomware": False}, "epss_percentile": 0}) == 49


def test_scoring_weights_desde_config(radar):
    w = radar.scoring_weights()
    p = radar.CONFIG["puntuacion"]
    assert w == {"cvss": p["cvss_max"], "epss": p["epss_max"], "kev": p["kev"], "ransomware": p["ransomware"], "poc": p["poc"], "stack": p["stack"]}
    assert sum(w.values()) == 100
    assert set(radar.breakdown({"cvss": None}).keys()) == set(w)


def test_sin_cvss_cuenta_40_por_ciento(radar):
    assert radar.breakdown({"cvss": None})["cvss"] == round(0.4 * radar.scoring_weights()["cvss"], 2)


# ───────────────────────── DB-IP ─────────────────────────

def test_dbip_sha1_de_la_pagina_real(radar):
    page = load_fixture("dbip_download_page_2026-11.html")
    assert radar.dbip_sha1(page, "2026-11") == "a6f14e8da5565c713cdda9f1959a904b2eb88337"   # el del MMDB, no el del CSV
    assert radar.dbip_sha1(page, "2026-10") is None


@pytest.mark.parametrize("rec_, ok", [
    ({"location": {"latitude": 40.4, "longitude": -3.7}, "country": {"iso_code": "ES", "names": {"es": "España"}}}, True),
    ({"location": {"latitude": 95, "longitude": 0}, "country": {"iso_code": "ES"}}, False),
    ({"location": {"latitude": 1, "longitude": -181}, "country": {"iso_code": "ES"}}, False),
    ({"location": {"latitude": 1, "longitude": 1}, "country": {"iso_code": "E<"}}, False),
    ({"location": {"latitude": "x", "longitude": 1}, "country": {"iso_code": "ES"}}, False),
    (None, False),
])
def test_geo_fields_valida(radar, rec_, ok):
    g = radar.geo_fields(rec_)
    assert (g is not None) == ok
    if ok:
        assert g == {"lat": 40.4, "lon": -3.7, "cc": "ES", "country": "España"}


# ───────────────────────── esquema ligero (c1) ─────────────────────────

def test_slim_report_sobre_la_edicion_real(radar):
    import json
    from conftest import ROOT
    rep = json.loads((ROOT / "tests" / "fixtures" / "real-2026-10-31.json").read_text(encoding="utf-8"))["latest"]
    slim = radar.slim_report(rep)
    assert "advisories" not in slim
    assert slim["top"] == [c["id"] for c in rep["top"]] and all(isinstance(x, str) for x in slim["kev_new"])
    ids = {c["id"] for c in slim["cves"]}
    assert set(slim["top"]) <= ids and set(slim["kev_new"]) <= ids        # la web resuelve los IDs contra cves
    for c in slim["cves"]:
        assert not set(radar.DROP_FIELDS) & set(c)
        assert len(c["references"]) <= radar.MAX_REFS and c["references_total"] >= len(c["references"])
    antes = len(json.dumps(rep, ensure_ascii=False, separators=(",", ":")).encode())
    despues = len(json.dumps(slim, ensure_ascii=False, separators=(",", ":")).encode())
    assert despues < antes * 0.85, (antes, despues)


def test_slim_cve_prioriza_referencias_accionables(radar):
    refs = [{"url": f"https://x.com/{i}", "tags": []} for i in range(10)]
    refs[7]["tags"] = ["Patch"]
    refs[9]["tags"] = ["Vendor Advisory"]
    o = radar.slim_cve({"id": "CVE-2026-1111", "references": refs, "links": {}, "cpes": ["x"]})
    assert [r["url"] for r in o["references"][:2]] == ["https://x.com/9", "https://x.com/7"]
    assert len(o["references"]) == 8 and o["references_total"] == 10
    assert "links" not in o and "cpes" not in o
