"""Rendimiento de la web (fase 8, Lighthouse): lo que no se ve en la pantalla pero se rompe fácil.

- index.html precarga con <link rel="modulepreload"> TODO el grafo estático de módulos que cuelga
  de main.js: si se añade un módulo y no se precarga, vuelve la cascada de viajes de red.
- La textura del globo 3D (assets/geo/tierra.png) está al día con tierra.json y es la que genera
  scripts/textura_tierra.py.
"""
import hashlib
import importlib.util
import re
import struct
import zlib
from pathlib import PurePosixPath

import pytest

from conftest import ROOT

WEB = ROOT / "web"
IMPORT = re.compile(r"^\s*import\s[^;]*?from\s+'(\.[^']+)'", re.M)


def grafo(entrada="assets/js/main.js"):
    vistos, pendientes = [], [entrada]
    while pendientes:
        f = pendientes.pop(0)
        if f in vistos:
            continue
        vistos.append(f)
        for rel in IMPORT.findall((WEB / f).read_text(encoding="utf-8")):
            partes = []
            for p in str(PurePosixPath(f).parent / rel).split("/"):
                if p == "..":
                    partes.pop()
                elif p != ".":
                    partes.append(p)
            pendientes.append("/".join(partes))
    return vistos


def test_modulepreload_cubre_todo_el_grafo_de_main():
    html = (WEB / "index.html").read_text(encoding="utf-8")
    pre = re.findall(r'<link rel="modulepreload" href="([^"]+)">', html)
    mods = grafo()
    assert len(mods) > 10                                      # el recorrido funciona
    assert sorted(pre) == sorted(mods[1:])                     # ni falta ni sobra ninguno
    assert all((WEB / m).is_file() for m in pre)
    # main.js sigue siendo la única entrada, después de los estilos
    assert html.count('<script type="module" src="assets/js/main.js"></script>') == 1


def leer_png(datos):
    assert datos[:8] == b"\x89PNG\r\n\x1a\n"
    i, chunks = 8, {}
    while i < len(datos):
        (n,), tipo = struct.unpack(">I", datos[i:i + 4]), datos[i + 4:i + 8]
        cuerpo = datos[i + 8:i + 8 + n]
        assert zlib.crc32(tipo + cuerpo) & 0xFFFFFFFF == struct.unpack(">I", datos[i + 8 + n:i + 12 + n])[0]
        chunks.setdefault(tipo, []).append(cuerpo)
        i += 12 + n
    return chunks


@pytest.fixture(scope="module")
def textura():
    spec = importlib.util.spec_from_file_location("textura_tierra", ROOT / "scripts" / "textura_tierra.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_textura_tierra_al_dia_con_tierra_json(textura):
    png = (WEB / "assets" / "geo" / "tierra.png").read_bytes()
    ch = leer_png(png)
    w, h, bits, color = struct.unpack(">IIBB", ch[b"IHDR"][0][:10])
    assert (w, h, bits, color) == (1536, 768, 8, 3)
    texto = dict(c.split(b"\x00", 1) for c in ch.get(b"tEXt", []))
    sha = hashlib.sha256((WEB / "assets" / "geo" / "tierra.json").read_bytes()).hexdigest()
    assert texto[b"zh-fuente"] == f"sha256={sha}".encode(), "regenera con: python scripts/textura_tierra.py"
    # Es la que genera el script (con tolerancia por si el coseno difiere en el último bit entre libm)
    nuevo = leer_png(textura.generar())
    a = zlib.decompress(b"".join(ch[b"IDAT"]))
    b = zlib.decompress(b"".join(nuevo[b"IDAT"]))
    assert len(a) == len(b) == h * (w + 1)
    assert sum(x != y for x, y in zip(a, b)) < w * h // 1000
    assert ch[b"PLTE"] == nuevo[b"PLTE"]
    assert len(png) < 60_000


def test_globe_usa_la_textura_estatica():
    js = (WEB / "assets" / "js" / "globe.js").read_text(encoding="utf-8")
    assert "../geo/tierra.png" in js and ".globeImageUrl(LAND_TEX)" in js
    assert "toDataURL" not in js and "getContext('2d')" not in js
