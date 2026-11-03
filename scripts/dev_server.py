#!/usr/bin/env python3
"""
dev_server.py · sirve web/ en local con las MISMAS cabeceras que Netlify (solo biblioteca estándar)

Lee las reglas [[headers]] de netlify.toml y las aplica igual que Netlify: se juntan todas
las reglas cuyo `for` casa con la ruta pedida y, si dos fijan la misma cabecera, se unen con
", " (como hace Netlify; así un solape se ve también aquí). Así la CSP, Trusted Types, nosniff
y la caché se prueban en local antes de publicar.

  python scripts/dev_server.py                      # http://127.0.0.1:8000 · datos de data/
  python scripts/dev_server.py --dev                # además /fixtures/ (tests/fixtures), solo en local
  python scripts/dev_server.py --root _deploy/web   # lo que se publicaría (tras montar_deploy.py)

Diferencias deliberadas con producción (y solo estas):
  · Escucha SOLO en 127.0.0.1.
  · Quita `upgrade-insecure-requests` de la CSP: en http://127.0.0.1 haría pedir todo por https.
  · /data/ sale de --data (por defecto web/data si existe, si no data/, que es la salida del pipeline).
  · /fixtures/ (bundles de prueba, incluido el de XSS) solo existe con --dev. En producción nunca.
"""
from __future__ import annotations

import argparse
import re
import sys
import tomllib
from functools import partial
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent

# Tipos MIME explícitos: con nosniff, un JS servido con otro tipo no se ejecuta
MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json",
}


# ───────────────────────── reglas de netlify.toml ─────────────────────────

def load_rules(toml_path: Path) -> list[tuple[re.Pattern, dict[str, str]]]:
    conf = tomllib.loads(toml_path.read_text(encoding="utf-8"))
    rules = []
    for r in conf.get("headers", []):
        rules.append((pattern(r["for"]), {k: str(v) for k, v in r.get("values", {}).items()}))
    return rules


def pattern(spec: str) -> re.Pattern:
    """Ruta de Netlify → regex: `*` es el splat (cualquier resto, incluidas barras);
    `:param` es un segmento. El resto es literal y la ruta casa entera."""
    out = []
    for tok in re.split(r"(\*|:[A-Za-z_]\w*)", spec):
        if tok == "*":
            out.append(".*")
        elif tok.startswith(":"):
            out.append("[^/]+")
        else:
            out.append(re.escape(tok))
    return re.compile("".join(out) + r"\Z")


def headers_for(path: str, rules) -> dict[str, str]:
    """Todas las reglas que casan, en orden; misma cabecera en dos reglas → valores unidos."""
    got: dict[str, str] = {}
    for rx, values in rules:
        if rx.match(path):
            for k, v in values.items():
                got[k] = f"{got[k]}, {v}" if k in got else v
    return got


def dev_csp(value: str) -> str:
    parts = [p.strip() for p in value.split(";") if p.strip()]
    return "; ".join(p for p in parts if p != "upgrade-insecure-requests")


# ───────────────────────── resolución segura de rutas ─────────────────────────

def resolve(base: Path, rel: str) -> Path | None:
    """Ruta dentro de `base` o None. Sin '..', sin ficheros ocultos (salvo .well-known)."""
    parts = [p for p in rel.split("/") if p]
    for p in parts:
        if p in (".", "..") or "\\" in p or "\x00" in p or ":" in p:
            return None
        if p.startswith(".") and p != ".well-known":
            return None
    target = base.joinpath(*parts).resolve()
    try:
        target.relative_to(base.resolve())
    except ValueError:
        return None
    return target


class Handler(BaseHTTPRequestHandler):
    server_version = "zerohour-dev"

    def version_string(self):            # sin versión de Python en la cabecera Server
        return self.server_version

    def __init__(self, *a, cfg, **kw):
        self.cfg = cfg
        super().__init__(*a, **kw)

    # Solo lectura: GET y HEAD
    def do_GET(self):
        self.serve(body=True)

    def do_HEAD(self):
        self.serve(body=False)

    def do_POST(self):
        self.send_error(HTTPStatus.METHOD_NOT_ALLOWED)

    do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_POST

    def map_path(self, path: str) -> Path | None:
        c = self.cfg
        if path.startswith("/fixtures/"):
            return resolve(c.fixtures, path[len("/fixtures/"):]) if c.fixtures else None
        if path.startswith("/data/"):
            return resolve(c.data, path[len("/data/"):])
        f = resolve(c.root, path)
        if f is not None and f.is_dir():
            f = f / "index.html"
        return f

    def serve(self, body: bool):
        try:
            path = unquote(urlsplit(self.path).path, errors="strict")
        except UnicodeDecodeError:
            path = None
        f = self.map_path(path) if path and path.startswith("/") else None
        status = HTTPStatus.OK
        if f is None or not f.is_file():
            status, f = HTTPStatus.NOT_FOUND, self.cfg.root / "404.html"   # como Netlify
        data = f.read_bytes() if f.is_file() else b"404"

        h = headers_for(path or "/", self.cfg.rules)
        if "Content-Security-Policy" in h:
            h["Content-Security-Policy"] = dev_csp(h["Content-Security-Policy"])
        h.setdefault("Content-Type", MIME.get(f.suffix.lower(), "application/octet-stream"))
        h.setdefault("Cache-Control", "public, max-age=0, must-revalidate")   # el valor por defecto de Netlify
        self.send_response(status)
        for k, v in h.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if body:
            self.wfile.write(data)

    def log_message(self, fmt, *args):
        if not self.cfg.quiet:
            sys.stderr.write(f"{self.log_date_time_string()} {fmt % args}\n")


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 64        # el valor por defecto (5) se queda corto con 30 peticiones en paralelo


class Cfg:
    def __init__(self, root: Path, data: Path, fixtures: Path | None, netlify: Path, quiet: bool):
        self.root, self.data, self.fixtures, self.netlify, self.quiet = root, data, fixtures, netlify, quiet
        self.rules = load_rules(netlify)


def build(argv=None) -> tuple[Server, Cfg]:
    ap = argparse.ArgumentParser(description="Servidor local con las cabeceras de netlify.toml")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--root", type=Path, default=ROOT / "web", help="carpeta publicada (por defecto web/)")
    ap.add_argument("--data", type=Path, help="carpeta servida en /data/ (por defecto <root>/data o data/)")
    ap.add_argument("--netlify", type=Path, default=ROOT / "netlify.toml")
    ap.add_argument("--dev", action="store_true", help="sirve tests/fixtures en /fixtures/ (?fixtures=normal|xss|…)")
    ap.add_argument("--fixtures", type=Path, default=ROOT / "tests" / "fixtures", help="carpeta de fixtures (con --dev)")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)

    root = a.root.resolve()
    if not (root / "index.html").is_file():
        ap.error(f"{root} no contiene index.html")
    data = (a.data or (root / "data" if (root / "data" / "latest.json").is_file() else ROOT / "data")).resolve()
    cfg = Cfg(root, data, a.fixtures.resolve() if a.dev else None, a.netlify, a.quiet)
    return Server(("127.0.0.1", a.port), partial(Handler, cfg=cfg)), cfg


def main(argv=None) -> int:
    # En Windows, con la salida redirigida (cp1252), imprimir «·» o «→» tumbaba el servidor
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    httpd, cfg = build(argv)
    print(f"ZEROHOUR dev · http://127.0.0.1:{httpd.server_port}/  (cabeceras de {cfg.netlify.name}: {len(cfg.rules)} reglas)")
    print(f"  web: {cfg.root}\n  datos: {cfg.data}"
          + (f"\n  fixtures: {cfg.fixtures}  → /?fixtures=normal" if cfg.fixtures else ""))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
