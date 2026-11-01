#!/usr/bin/env python3
"""
vendor_globe.py · autoaloja globe.gl (incluye three.js) con un parche mínimo para la CSP.

Por qué existe
--------------
La web se sirve con `style-src 'self'` y `require-trusted-types-for 'script'`.
globe.gl 2.46.2 (bundle UMD) rompe ambas al montarse:
  1. Inyecta 3 etiquetas <style> en tiempo de ejecución (patrón "styleInject")
     → violación de style-src-elem.
  2. Vacía su contenedor con `e.innerHTML=""` (dos veces: three-render-objects y
     globe.gl) → Trusted Types lo bloquea y el globo no arranca.

Parche (mínimo y verificable):
  1. Las 3 inyecciones se sustituyen por `void 0` y su CSS, sin tocar, se escribe
     en globe.gl-<versión>.zh.css (se sirve desde 'self').
  2. Los 2 `e.innerHTML=""` del montaje pasan a `e.replaceChildren()` (mismo efecto
     sin pasar por un sink de Trusted Types).
Cada sustitución exige un número exacto de coincidencias; si el original cambia, el
script aborta en vez de parchear a ciegas.

Uso
---
  python scripts/vendor_globe.py           # descarga, verifica, parchea y escribe
  python scripts/vendor_globe.py --check   # regenera en memoria y compara con lo commiteado
"""
import base64
import hashlib
import io
import json
import sys
import tarfile
import urllib.request
from pathlib import Path

NAME = "globe.gl"
VERSION = "2.46.2"
TARBALL = f"https://registry.npmjs.org/{NAME}/-/{NAME}-{VERSION}.tgz"
# Integridad publicada en npm para esta versión (fijada aquí: no se confía en la respuesta del momento)
INTEGRITY = "sha512-oh5fx/sTVtFa06OrLXxgfZ5TV1xhDzLKw0muc0fxJfpHrvfDNRspGqrgURpEBBYWS7REzQA78vodUrjbpfYoqA=="
THREE_LICENSE_URL = "https://raw.githubusercontent.com/mrdoob/three.js/r185/LICENSE"
THREE_LICENSE_SHA256 = "8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc"  # MIT, revisada

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "assets" / "vendor"
JS_OUT = OUT / f"{NAME}-{VERSION}.zh.min.js"
CSS_OUT = OUT / f"{NAME}-{VERSION}.zh.css"
LIC_OUT = OUT / "LICENSE-globe.gl.txt"
THREE_LIC_OUT = OUT / "LICENSE-three.js.txt"

STYLE_INJECT_HEAD = 'function(e,t){void 0===t&&(t={});var n=t.insertAt;if("undefined"!=typeof document){'
STYLE_INJECT_TAIL = 'i.styleSheet?i.styleSheet.cssText=e:i.appendChild(document.createTextNode(e))}}('
MOUNT_OLD = 'e.innerHTML="",e.appendChild(t.container=document.createElement("div"))'
MOUNT_NEW = 'e.replaceChildren(),e.appendChild(t.container=document.createElement("div"))'
HEADER = ("// ZEROHOUR: copia autoalojada y PARCHEADA de globe.gl {v} (sin <style> inyectados ni innerHTML al montar).\n"
          "// Generada por scripts/vendor_globe.py; hashes y detalle del parche en web/assets/vendor/VERSIONS.md\n")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "zerohour-vendor/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:  # noqa: S310 (URL fija https)
        return r.read()


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def read_js_string(s: str, i: int) -> tuple[str, int]:
    """Lee un literal "..." de JS que empieza en s[i] == '"'. Devuelve (valor, índice tras la comilla)."""
    if s[i] != '"':
        raise ValueError(f"se esperaba comilla en {i}")
    j = i + 1
    while True:
        c = s[j]
        if c == "\\":
            j += 2
            continue
        if c == '"':
            break
        if c == "\n":
            raise ValueError("salto de línea dentro de literal")
        j += 1
    return json.loads(s[i:j + 1]), j + 1  # los literales del bundle solo usan escapes compatibles con JSON


def patch(src: str) -> tuple[str, list[str]]:
    css_blocks = []
    out, pos = [], 0
    while True:
        k = src.find("!" + STYLE_INJECT_HEAD, pos)
        if k < 0:
            break
        tail = src.find(STYLE_INJECT_TAIL, k)
        if tail < 0 or tail - k > 600:
            raise SystemExit(f"styleInject en {k}: no se encuentra el final esperado")
        css, after = read_js_string(src, tail + len(STYLE_INJECT_TAIL))
        if src[after] != ")":
            raise SystemExit(f"styleInject en {k}: se esperaba ')' tras el CSS")
        out.append(src[pos:k])
        out.append("void 0")  # la expresión sigue siendo válida en cualquier contexto (sentencia o coma)
        css_blocks.append(css)
        pos = after + 1
    out.append(src[pos:])
    patched = "".join(out)
    if len(css_blocks) != 3:
        raise SystemExit(f"se esperaban 3 inyecciones de <style>, hay {len(css_blocks)}")
    if "insertAt" in patched and "document.createTextNode(e))}}(" in patched:
        raise SystemExit("queda alguna inyección de <style> sin parchear")

    n = patched.count(MOUNT_OLD)
    if n != 2:
        raise SystemExit(f"se esperaban 2 'innerHTML=\"\"' de montaje, hay {n}")
    patched = patched.replace(MOUNT_OLD, MOUNT_NEW)
    return patched, css_blocks


def build() -> dict[Path, bytes]:
    tgz = fetch(TARBALL)
    got = "sha512-" + base64.b64encode(hashlib.sha512(tgz).digest()).decode()
    if got != INTEGRITY:
        raise SystemExit(f"INTEGRIDAD NO COINCIDE\n  esperada {INTEGRITY}\n  obtenida {got}")
    with tarfile.open(fileobj=io.BytesIO(tgz), mode="r:gz") as tar:  # solo se leen dos miembros concretos
        js = tar.extractfile("package/dist/globe.gl.min.js").read()
        lic = tar.extractfile("package/LICENSE").read()
    patched, css_blocks = patch(js.decode("utf-8"))

    three_lic = fetch(THREE_LICENSE_URL)
    if THREE_LICENSE_SHA256 and sha256(three_lic) != THREE_LICENSE_SHA256:
        raise SystemExit("La licencia de three.js no coincide con el hash fijado")

    css = (f"/* CSS que globe.gl {VERSION} inyectaba con <style> en tiempo de ejecución.\n"
           f"   Extraído sin cambios por scripts/vendor_globe.py para servirlo desde 'self' (CSP style-src). */\n\n"
           + "\n\n".join(b.strip() for b in css_blocks) + "\n")
    files = {
        JS_OUT: (HEADER.format(v=VERSION) + patched).encode("utf-8"),
        CSS_OUT: css.encode("utf-8"),
        LIC_OUT: lic,
        THREE_LIC_OUT: three_lic,
    }
    print(f"tarball          {TARBALL}")
    print(f"  integridad OK  {INTEGRITY}")
    print(f"  sha256 tarball {sha256(tgz)}")
    print(f"original         dist/globe.gl.min.js  sha256 {sha256(js)}  ({len(js)} B)")
    for p, b in files.items():
        print(f"{p.relative_to(ROOT).as_posix():48} sha256 {sha256(b)}  ({len(b)} B)")
    return files


def main() -> int:
    check = "--check" in sys.argv[1:]
    files = build()
    if check:
        bad = [p for p, b in files.items() if not p.exists() or p.read_bytes() != b]
        for p in bad:
            print(f"DIFERENTE: {p.relative_to(ROOT).as_posix()}")
        print("OK: lo commiteado coincide con lo regenerado" if not bad else "FALLO: regenera con vendor_globe.py")
        return 1 if bad else 0
    OUT.mkdir(parents=True, exist_ok=True)
    for p, b in files.items():
        p.write_bytes(b)
    return 0


if __name__ == "__main__":
    sys.exit(main())
