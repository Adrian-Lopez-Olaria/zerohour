"""Tests de la fase 6.5: netlify.toml (cabeceras y caché), dev_server.py, security.txt y 404.
El servidor se levanta en 127.0.0.1 con un puerto libre; no sale nada a la red."""
import datetime as dt
import http.client
import importlib.util
import json
import re
import threading
import tomllib

import pytest

from conftest import ROOT

WEB = ROOT / "web"
CONF = tomllib.loads((ROOT / "netlify.toml").read_text(encoding="utf-8"))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


dev = _load("dev_server")
RULES = dev.load_rules(ROOT / "netlify.toml")


def global_headers():
    return next(r["values"] for r in CONF["headers"] if r["for"] == "/*")


def csp_directives(value):
    return {d.split()[0]: d.split()[1:] for d in (x.strip() for x in value.split(";")) if d}


# ───────────────────────── netlify.toml ─────────────────────────

def test_publica_web_sin_comando_de_build():
    assert CONF["build"]["publish"] == "web"
    assert "command" not in CONF["build"]          # el sitio llega montado en la rama deploy


def test_csp_estricta():
    d = csp_directives(global_headers()["Content-Security-Policy"])
    assert d["default-src"] == ["'none'"]
    for k in ("script-src", "style-src", "connect-src", "font-src", "manifest-src"):
        assert d[k] == ["'self'"], k
    assert d["img-src"] == ["'self'", "data:"]
    assert d["worker-src"] == ["'none'"]
    assert d["base-uri"] == d["form-action"] == d["frame-ancestors"] == ["'none'"]
    assert d["require-trusted-types-for"] == ["'script'"]
    assert "upgrade-insecure-requests" in d
    todo = " ".join(" ".join(v) for v in d.values())
    assert not re.search(r"unsafe-|blob:|\*|https?:", todo)


def test_cabeceras_de_seguridad():
    h = global_headers()
    assert h["Strict-Transport-Security"] == "max-age=63072000; includeSubDomains; preload"
    assert h["X-Content-Type-Options"] == "nosniff"
    assert h["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert h["Cross-Origin-Opener-Policy"] == "same-origin"
    assert h["Cross-Origin-Resource-Policy"] == "same-origin"
    assert h["X-Frame-Options"] == "DENY"
    pp = [x.strip() for x in h["Permissions-Policy"].split(",")]
    assert all(x.endswith("=()") for x in pp)                       # todo desactivado
    assert {"camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()"} <= set(pp)
    assert not any(x.startswith("interest-cohort") for x in pp)


def rutas_publicadas():
    """Todas las rutas del sitio (sin datos locales) + rutas de datos tipo."""
    rutas = ["/"] + ["/" + p.relative_to(WEB).as_posix() for p in WEB.rglob("*")
                     if p.is_file() and "data" not in p.relative_to(WEB).parts[:1]]
    return rutas + ["/data/latest.json", "/data/days/2026-10-31.json", "/no/existe"]


@pytest.mark.parametrize("ruta", rutas_publicadas())
def test_ninguna_cabecera_se_define_dos_veces(ruta):
    """Netlify une los valores si dos reglas fijan la misma cabecera: no debe pasar nunca."""
    vistos = {}
    for rx, values in RULES:
        if rx.match(ruta):
            for k in values:
                assert k not in vistos, f"{ruta}: {k} en dos reglas"
                vistos[k] = True


def test_cache_inmutable_solo_en_vendor_y_fuentes():
    for ruta in rutas_publicadas():
        cc = dev.headers_for(ruta, RULES).get("Cache-Control")
        if ruta.startswith(("/assets/vendor/", "/assets/fonts/")):
            assert cc == "public, max-age=31536000, immutable", ruta
        elif ruta == "/no/existe":
            assert cc is None                                         # 404: valor por defecto de la plataforma
        elif ruta in ("/", "/index.html", "/404.html"):
            assert cc == "no-cache, no-transform", ruta               # HTML: que ningún proxy lo reescriba
        else:
            assert cc == "no-cache", ruta                             # código, página y datos: revalidar


def test_patron_de_rutas_como_netlify():
    assert dev.pattern("/*").match("/a/b/c.js")
    assert dev.pattern("/assets/js/*").match("/assets/js/render/detalle.js")
    assert not dev.pattern("/assets/js/*").match("/assets/json")
    assert dev.pattern("/").match("/") and not dev.pattern("/").match("/index.html")
    assert not dev.pattern("/data/*").match("/database.json")


# ───────────────────────── Cloudflare: _headers y wrangler.jsonc ─────────────────────────

mon = _load("montar_deploy")


def leer_headers_cf(texto):
    """Parser del formato _headers de Cloudflare: ruta sin sangría, cabeceras sangradas."""
    reglas, actual = [], None
    for ln in texto.splitlines():
        if not ln.strip() or ln.lstrip().startswith("#"):
            continue
        if not ln[0].isspace():
            actual = (dev.pattern(ln.strip()), {})
            reglas.append(actual)
        else:
            k, _, v = ln.strip().partition(":")
            actual[1][k.strip()] = v.strip()
    return reglas


@pytest.mark.parametrize("ruta", rutas_publicadas())
def test_headers_de_cloudflare_identicas_a_netlify_toml(ruta):
    """Una sola fuente de verdad: el _headers generado da, ruta a ruta, las mismas cabeceras."""
    cf = leer_headers_cf(mon.cabeceras_cloudflare(ROOT / "netlify.toml"))
    assert dev.headers_for(ruta, cf) == dev.headers_for(ruta, RULES)


def test_wrangler_solo_estaticos_y_sin_vistas_previas():
    texto = (ROOT / "wrangler.jsonc").read_text(encoding="utf-8")
    conf = json.loads("\n".join(ln for ln in texto.splitlines() if not ln.strip().startswith("//")))
    assert "main" not in conf                                         # sin código de Worker
    assert conf["assets"] == {"directory": "./web", "not_found_handling": "404-page",
                              "html_handling": "auto-trailing-slash"}
    assert conf["workers_dev"] is False and conf["preview_urls"] is False   # solo el dominio propio
    assert conf["send_metrics"] is False
    assert not set(conf) & {"routes", "route", "vars", "kv_namespaces", "r2_buckets", "d1_databases"}


# ───────────────────────── dev_server ─────────────────────────

@pytest.fixture
def servidor(request):
    args = ["--port", "0", "--quiet"] + getattr(request, "param", [])
    httpd, cfg = dev.build(args)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield httpd.server_port
    httpd.shutdown()
    httpd.server_close()


def get(port, path, method="GET"):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    c.request(method, path)
    r = c.getresponse()
    body = r.read()
    c.close()
    return r.status, {k.lower(): v for k, v in r.getheaders()}, body


def test_dev_server_manda_las_cabeceras_de_netlify(servidor):
    st, h, body = get(servidor, "/")
    assert st == 200 and b"<title>ZEROHOUR" in body
    prod = global_headers()
    for k, v in prod.items():
        esperado = dev.dev_csp(v) if k == "Content-Security-Policy" else v
        assert h[k.lower()] == esperado, k
    assert "upgrade-insecure-requests" not in h["content-security-policy"]   # única diferencia
    assert h["cache-control"] == "no-cache, no-transform"
    assert h["server"].startswith("zerohour-dev")


@pytest.mark.parametrize("ruta, tipo", [
    ("/assets/js/main.js", "text/javascript; charset=utf-8"),
    ("/assets/css/base.css", "text/css; charset=utf-8"),
    ("/assets/fonts/saira-latin-wdth-normal.woff2", "font/woff2"),
    ("/assets/geo/tierra.json", "application/json; charset=utf-8"),
    ("/.well-known/security.txt", "text/plain; charset=utf-8"),
])
def test_dev_server_tipos_mime(servidor, ruta, tipo):
    st, h, _ = get(servidor, ruta)
    assert st == 200 and h["content-type"] == tipo


@pytest.mark.parametrize("ruta", [
    "/no/existe", "/../netlify.toml", "/%2e%2e/netlify.toml", "/..%5cnetlify.toml",
    "/assets/../../config.toml", "/.git/config", "/%00", "/C:/Windows/win.ini",
    "/fixtures/xss.json",                                # sin --dev no hay fixtures
])
def test_dev_server_404_y_sin_salir_de_la_raiz(servidor, ruta):
    st, h, body = get(servidor, ruta)
    assert st == 404
    assert b"Esta ruta no existe" in body and "default-src 'none'" in h["content-security-policy"]


@pytest.mark.parametrize("servidor", [["--dev"]], indirect=True)
def test_dev_server_fixtures_solo_con_dev(servidor):
    st, _, body = get(servidor, "/fixtures/xss.json")
    assert st == 200 and body.startswith(b"{")
    assert get(servidor, "/fixtures/../../config.toml")[0] == 404


def test_dev_server_solo_lectura(servidor):
    assert get(servidor, "/", "POST")[0] == 405
    st, h, body = get(servidor, "/", "HEAD")
    assert st == 200 and body == b"" and int(h["content-length"]) > 0


# ───────────────────────── security.txt, robots, 404, HTML ─────────────────────────

def campos_security_txt():
    campos = {}
    for ln in (WEB / ".well-known" / "security.txt").read_text(encoding="utf-8").splitlines():
        if ln.strip() and not ln.startswith("#"):
            k, _, v = ln.partition(":")
            campos.setdefault(k.strip(), []).append(v.strip())
    return campos


def test_security_txt_rfc9116():
    c = campos_security_txt()
    assert c["Contact"] == ["mailto:zerohour.sec@gmail.com"]
    assert c["Canonical"] == ["https://zerohour-cve.dev/.well-known/security.txt"]
    assert c["Policy"] == ["https://github.com/Adrian-Lopez-Olaria/zerohour/security/policy"]
    assert "PENDIENTE" not in (WEB / ".well-known" / "security.txt").read_text(encoding="utf-8")
    assert len(c["Expires"]) == 1
    exp = dt.datetime.fromisoformat(c["Expires"][0].replace("Z", "+00:00"))
    ahora = dt.datetime.now(dt.timezone.utc)
    # Si este test falla por caducado: renovar Expires (máximo recomendable, un año)
    assert ahora < exp < ahora + dt.timedelta(days=366)
    assert set(c) <= {"Contact", "Expires", "Preferred-Languages", "Canonical", "Policy",
                      "Encryption", "Acknowledgments", "Hiring", "CSAF"}


def test_robots_txt():
    assert (WEB / "robots.txt").read_text(encoding="utf-8").startswith("User-agent: *")


@pytest.mark.parametrize("pagina", ["index.html", "404.html"])
def test_html_sin_codigo_inline(pagina):
    """La CSP no permite inline: ni <script> sin src, ni <style>, ni style=, ni on*=."""
    html = (WEB / pagina).read_text(encoding="utf-8")
    assert not re.search(r"<script(?![^>]*\bsrc=)[^>]*>", html, re.I)
    assert not re.search(r"<style\b", html, re.I)
    assert not re.search(r"\sstyle\s*=", html, re.I)
    assert not re.search(r"\son[a-z]+\s*=", html, re.I)


def test_404_usa_rutas_absolutas_que_existen():
    """Netlify sirve 404.html en cualquier ruta (/a/b/c): sus recursos tienen que ser absolutos."""
    html = (WEB / "404.html").read_text(encoding="utf-8")
    refs = re.findall(r'(?:href|src)="([^"#][^"]*)"', html)
    locales = [r for r in refs if not r.startswith(("data:", "#"))]
    assert locales and all(r.startswith("/") for r in locales)
    for r in locales:
        ruta = r.split("#")[0]
        if ruta != "/":
            assert (WEB / ruta.lstrip("/")).is_file(), r
    assert "<script" not in html                                  # página estática
