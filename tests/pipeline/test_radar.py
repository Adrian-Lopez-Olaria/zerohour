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


# ───────────────────────── puntuación: pesos, desglose y mínimos ─────────────────────────

KEV = {"ransomware": False}


def c(**kw):
    """CVE mínima para puntuar: sin señales salvo las que se pasen."""
    base = {"cvss": None, "epss_percentile": None, "kev": None, "ssvc": None, "exploits": [], "poc": [], "exploit_refs": [], "stack": []}
    base.update(kw)
    return base


def rows(b):
    return {k: v for k, v in b.items() if k != "floor"}


def test_scoring_weights_desde_config(radar):
    w, p = radar.scoring_weights(), radar.CONFIG["puntuacion"]
    assert w == {"cvss": 30, "epss": 20, "explotada": 25, "ransomware": 5, "exploit": 15, "stack": 5}
    assert w["explotada"] == max(p["explotada_kev"], p["explotada_ssvc"]) and w["exploit"] == max(p["exploit_verificado"], p["exploit_poc"])
    assert sum(w.values()) == 100
    assert set(rows(radar.breakdown(c()))) == set(w)


def test_sin_cvss_cuenta_40_por_ciento(radar):
    assert radar.breakdown(c())["cvss"] == round(0.4 * 30, 4)


def test_kev_y_ssvc_no_se_suman_dos_veces(radar):
    b = radar.breakdown(c(kev=KEV, ssvc={"exploitation": "active"}))
    assert b["explotada"] == 25                                      # KEV manda; SSVC no suma encima
    assert radar.breakdown(c(ssvc={"exploitation": "active"}))["explotada"] == 20


def test_exploit_verificado_y_poc_no_se_suman(radar):
    ver = {"source": "metasploit", "url": "https://x", "name": "m", "verified": True}
    assert radar.breakdown(c(exploits=[ver], poc=[{"url": "https://y"}]))["exploit"] == 15
    assert radar.breakdown(c(poc=[{"url": "https://y"}]))["exploit"] == 6
    assert radar.breakdown(c(ssvc={"exploitation": "poc"}))["exploit"] == 6
    edb_sin_verificar = {"source": "exploitdb", "url": "https://z", "name": "e", "verified": False}
    assert radar.breakdown(c(exploits=[edb_sin_verificar]))["exploit"] == 6


# Mínimos (lo pedido en el punto de control A)

def test_minimo_kev_sin_mas_70(radar):
    r = c(cvss=5.0, kev=KEV)                       # 15 + 0 + 25 = 40 → sube a 70
    assert radar.score(r) == 70
    assert radar.breakdown(r)["floor"] == {"value": 70, "exploited_by": "kev", "aggravating": []}


def test_minimo_kev_mas_stack_85(radar):
    r = c(cvss=5.0, kev=KEV, stack=["vmware"])     # 15 + 25 + 5 = 45 → 85
    assert radar.score(r) == 85
    assert radar.breakdown(r)["floor"] == {"value": 85, "exploited_by": "kev", "aggravating": ["stack"]}


def test_minimo_kev_mas_ransomware_85(radar):
    r = c(cvss=5.0, kev={"ransomware": True})      # 15 + 25 + 5 = 45 → 85
    assert radar.score(r) == 85
    assert radar.breakdown(r)["floor"]["aggravating"] == ["ransomware"]


def test_minimo_ssvc_active_70(radar):
    r = c(cvss=4.0, ssvc={"exploitation": "active"})
    assert radar.score(r) == 70 and radar.breakdown(r)["floor"]["exploited_by"] == "ssvc"


def test_si_ya_supera_el_minimo_no_cambia(radar):
    ver = {"source": "metasploit", "url": "https://x", "name": "m", "verified": True}
    r = c(cvss=10.0, epss_percentile=0.98, kev=KEV, exploits=[ver])  # 30 + 19.6 + 25 + 15 = 89.6
    assert radar.score(r) == 90 and "floor" not in radar.breakdown(r)


def test_sin_explotacion_no_hay_minimo(radar):
    r = c(cvss=9.8, stack=["vmware"], poc=[{"url": "https://y"}])
    assert "floor" not in radar.breakdown(r) and radar.score(r) == round(29.4 + 6 + 5)


def test_minimos_configurables(radar, monkeypatch):
    monkeypatch.setitem(radar.CONFIG["puntuacion"], "minimos", {"explotada": 60, "explotada_critica": 75})
    assert radar.score(c(cvss=5.0, kev=KEV)) == 60
    assert radar.score(c(cvss=5.0, kev=KEV, stack=["x"])) == 75


def test_score_coherente_con_desglose_en_las_453_reales(radar, real_cves):
    """El score es la suma de filas redondeada (.5 hacia arriba, como Math.round) o el mínimo."""
    import math
    for r in real_cves:
        b = radar.breakdown(r)
        suma = math.floor(sum(rows(b).values()) + 0.5)
        assert radar.score(r) == (max(suma, b["floor"]["value"]) if "floor" in b else suma)
        if radar.exploitation(r):
            assert radar.score(r) >= 70                              # una explotada nunca es "PLANIFICAR"


def test_redondeo_de_medios_hacia_arriba(radar):
    assert radar.score(c(cvss=5.0, epss_percentile=0.375)) == 23     # 15 + 7.5 = 22.5 → 23 (round() daría 22)


def test_etiquetas_nuevas(radar):
    ver = {"source": "nuclei", "url": "https://x", "name": "n", "verified": True}
    assert "ssvc" in radar.tags({**c(ssvc={"exploitation": "active"}), "news": []})
    t = radar.tags({**c(kev=KEV, ssvc={"exploitation": "active"}, exploits=[ver], poc=[{"url": "https://y"}]), "news": []})
    assert "kev" in t and "ssvc" not in t and "exploit" in t and "poc" not in t


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


# ───────────────────────── CVE.org (cvelistV5) + CISA Vulnrichment ─────────────────────────

def test_cvelist_url_por_bloques(radar):
    assert radar.cvelist_url("CVE-2026-97229").endswith("/cves/2026/97xxx/CVE-2026-97229.json")
    assert radar.cvelist_url("CVE-2026-118527").endswith("/cves/2026/118xxx/CVE-2026-118527.json")
    assert radar.cvelist_url("CVE-2024-1234").endswith("/cves/2024/1xxx/CVE-2024-1234.json")


def test_parse_cvelist_registro_real(radar):
    out = radar.parse_cvelist(load_fixture("cvelist_CVE-2026-97229.json"))
    assert out["ssvc"]["exploitation"] == "active" and out["ssvc"]["automatable"] == "yes"
    assert out["ssvc"]["technical_impact"] == "total"
    assert out["cna_cvss"]["score"] == 10.0 and out["cna_cvss"]["vector"].startswith("CVSS:3.1/")


def test_parse_ssvc_valores_hostiles(radar):
    assert radar.parse_ssvc({"options": [{"Exploitation": "<script>"}]}) is None
    s = radar.parse_ssvc({"options": [{"Exploitation": "POC"}, {"Automatable": "maybe"}], "version": "2.0.3"})
    assert s == {"exploitation": "poc", "automatable": None, "technical_impact": None, "version": "2.0.3"}


def test_fetch_cvelist_404_es_sin_dato(radar, fake_get):
    fake_get({"97xxx/CVE-2026-97229": load_fixture("cvelist_CVE-2026-97229.json")})   # el resto → 404
    out = radar.fetch_cvelist(["CVE-2026-97229", "CVE-2026-118527"])
    assert set(out) == {"CVE-2026-97229"}


# ───────────────────────── exploits verificados ─────────────────────────

def test_index_metasploit_solo_exploits(radar):
    idx = radar.index_metasploit(load_fixture("metasploit_extracto.json"))
    assert list(idx) == ["CVE-2026-97229"]                     # el auxiliary del extracto no cuenta
    e = idx["CVE-2026-97229"][0]
    assert e["source"] == "metasploit" and e["verified"] is True
    assert e["url"].startswith("https://github.com/rapid7/metasploit-framework/blob/master/modules/exploits/")


def test_index_metasploit_ruta_hostil(radar):
    data = {"x": {"type": "exploit", "path": "../../javascript:alert(1)", "references": ["CVE-2026-1111"]},
            "y": {"type": "exploit", "path": "/modules/exploits/a.rb", "references": ["CVE-2026-2222", "<img>", "CVE-1"]}}
    idx = radar.index_metasploit(data)
    assert list(idx) == ["CVE-2026-2222"]


def test_index_nuclei_real_y_hostil(radar):
    text = load_fixture("nuclei_extracto.jsonl") + '{"ID":"CVE-2026-3333","file_path":"javascript:alert(1)"}\nbasura\n'
    idx = radar.index_nuclei(text)
    assert len(idx) == 3 and "CVE-2026-3333" not in idx
    e = next(iter(idx.values()))[0]
    assert e["source"] == "nuclei" and e["url"].startswith("https://github.com/projectdiscovery/nuclei-templates/blob/main/")


def test_index_exploitdb_verified(radar):
    idx = radar.index_exploitdb(load_fixture("exploitdb_extracto.csv"))
    assert idx["CVE-2009-3699"][0] == {"source": "exploitdb", "url": "https://www.exploit-db.com/exploits/16929",
                                       "name": idx["CVE-2009-3699"][0]["name"], "verified": True}
    assert idx["CVE-2014-9349"][0]["verified"] is False


def test_fuente_de_exploits_caida_no_tumba_el_resto(radar, fake_get, monkeypatch):
    texts = {radar.NUCLEI_URL: load_fixture("nuclei_extracto.jsonl"), radar.EDB_URL: load_fixture("exploitdb_extracto.csv")}

    def fake_text(url):
        if url == radar.MSF_URL:
            raise RuntimeError("HTTP 503")
        return texts[url]
    monkeypatch.setattr(radar, "_get_text", fake_text)
    status = {}
    idx = radar.fetch_exploit_indexes(status)
    assert status == {"metasploit": "error: RuntimeError", "nuclei": "ok", "exploitdb": "ok"}
    assert "CVE-2009-3699" in idx


def test_pick_exploits_verificados_primero_sin_duplicados(radar):
    e = lambda s, v, u: {"source": s, "url": u, "name": "n", "verified": v}  # noqa: E731
    out = radar.pick_exploits([e("exploitdb", False, "https://a"), e("metasploit", True, "https://b"), e("nuclei", True, "https://b")])
    assert [x["url"] for x in out] == ["https://b", "https://a"]


def test_sanitize_exploits_y_ssvc(radar):
    h = hostile()
    h["exploits"] = [{"source": "metasploit", "url": "javascript:x", "name": "a", "verified": True},
                     {"source": "otro", "url": "https://ok.com", "name": "a"},
                     {"source": "nuclei", "url": "https://github.com/x.yaml", "name": "<b>" * 100, "verified": "sí"}]
    h["ssvc"] = {"exploitation": "active", "automatable": "<x>", "technical_impact": "total"}
    r = radar.sanitize_cve(h)
    assert [x["source"] for x in r["exploits"]] == ["nuclei"] and r["exploits"][0]["verified"] is False
    assert r["ssvc"] == {"exploitation": "active", "automatable": None, "technical_impact": "total", "version": None}
    h2 = hostile(); h2["ssvc"] = {"exploitation": "<script>"}
    assert radar.sanitize_cve(h2)["ssvc"] is None


# ───────────────────────── CERT-EU: CVE desde la página del aviso ─────────────────────────

class _Stream:
    def __init__(self, body: str):
        self.body, self.status_code = body.encode(), 200
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def raise_for_status(self): pass
    def iter_content(self, n): yield from (self.body[i:i + n] for i in range(0, len(self.body), n))


def test_page_cves_mismo_dominio(radar, monkeypatch):
    page = load_fixture("certeu_aviso_2026-019.html")
    monkeypatch.setattr(radar.HTTP, "get", lambda url, **kw: _Stream(page))
    feed = "https://cert.europa.eu/publications/security-advisories-rss"
    assert radar.page_cves("https://cert.europa.eu/publications/security-advisories/2026-019/", feed) == ["CVE-2026-110264"]
    # Un enlace del RSS a otro dominio (o no http) no se descarga
    assert radar.page_cves("https://evil.example/aviso", feed) == []
    assert radar.page_cves("javascript:alert(1)", feed) == []


def test_page_cves_tope_de_tamano(radar, monkeypatch):
    big = "x" * (radar.PAGE_MAX_BYTES + 10) + " CVE-2026-9999 "
    monkeypatch.setattr(radar.HTTP, "get", lambda url, **kw: _Stream(big))
    assert radar.page_cves("https://cert.europa.eu/a", "https://cert.europa.eu/rss") == []   # lo que pasa del tope no se lee


def test_rss_certeu_real_extrae_cves_de_las_paginas(radar, monkeypatch):
    rss, page = load_fixture("certeu_rss.xml"), load_fixture("certeu_aviso_2026-019.html")

    class R:
        def __init__(self, b): self.content, self.status_code = b.encode(), 200
        def raise_for_status(self): pass

    def get(url, **kw):
        return _Stream(page) if kw.get("stream") else R(rss if "rss" in url else "")
    monkeypatch.setattr(radar.HTTP, "get", get)
    monkeypatch.setitem(radar.CONFIG, "rss", [f for f in radar.CONFIG["rss"] if f["nombre"] == "CERT-EU"])
    from datetime import datetime, timezone
    items = radar.fetch_rss(datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert items and all(i["source"] == "CERT-EU" and i["type"] == "aviso" for i in items)
    assert all("CVE-2026-110264" in i["cves"] for i in items)    # todas leen la misma página simulada
