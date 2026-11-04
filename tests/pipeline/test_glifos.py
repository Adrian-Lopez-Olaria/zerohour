"""Cobertura tipográfica (órdenes de dirección de Órbita §1.2).

El subconjunto latin de Saira y Azeret Mono no trae ■ ◧ □ ○ ⟲ → ≥ ▲ ▼…: si la web pintara uno
de esos caracteres, el navegador lo sacaría de una fuente del sistema. Las formas de veredicto,
flechas e iconos son SVG propios; aquí se comprueba que todo carácter no ASCII que la web puede
pintar (texto del HTML, literales del JS y `content` del CSS) tiene glifo en Saira.
"""
import re

import pytest

from conftest import ROOT

fontTools = pytest.importorskip("fontTools.ttLib")

WEB = ROOT / "web"
FONTS = WEB / "assets" / "fonts"


def cmap(name):
    return set(fontTools.TTFont(FONTS / name).getBestCmap())


SAIRA = cmap("saira-latin-wdth-normal.woff2") & cmap("saira-latin-wdth-italic.woff2")
AZERET = cmap("azeret-mono-latin-400-normal.woff2") & cmap("azeret-mono-latin-500-normal.woff2")


def sin_comentarios_js(src):
    # Comentarios /* … */ y // … (los literales con // de las URLs no llevan caracteres no ASCII)
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"(^|[^:'\"`\\])//[^\n]*", r"\1", src)


def textos_html(src):
    src = re.sub(r"<!--.*?-->", "", src, flags=re.S)
    src = re.sub(r"<(script|style)\b.*?</\1>", "", src, flags=re.S | re.I)
    return re.sub(r"<[^>]+>", " ", src)          # el contenido de las etiquetas, no los atributos


def literales_js(src):
    out = []
    for m in re.finditer(r"'((?:\\.|[^'\\\n])*)'|\"((?:\\.|[^\"\\\n])*)\"|`((?:\\.|[^`\\])*)`", sin_comentarios_js(src)):
        out.append(next(g for g in m.groups() if g is not None))
    return out


def caracteres_pintados():
    found = {}
    def add(where, txt):
        for ch in txt:
            if ord(ch) > 127 and not ch.isspace():
                found.setdefault(ch, where)
    for f in (WEB / "index.html", WEB / "404.html"):
        add(f.name, textos_html(f.read_text(encoding="utf-8")))
    for f in sorted((WEB / "assets" / "js").rglob("*.js")):
        for lit in literales_js(f.read_text(encoding="utf-8")):
            if lit.startswith(("http", "data:")):
                continue
            add(f.relative_to(WEB).as_posix(), lit)
    for f in sorted((WEB / "assets" / "css").glob("*.css")):
        css = re.sub(r"/\*.*?\*/", "", f.read_text(encoding="utf-8"), flags=re.S)
        for m in re.finditer(r"content:\s*(['\"])(.*?)\1", css):
            add(f.name, m.group(2))
    return found


def test_las_fuentes_son_las_de_orbita():
    assert {p.name for p in FONTS.glob("*.woff2")} == {
        "saira-latin-wdth-normal.woff2", "saira-latin-wdth-italic.woff2",
        "azeret-mono-latin-400-normal.woff2", "azeret-mono-latin-500-normal.woff2"}
    assert {p.name for p in FONTS.glob("OFL-*.txt")} == {"OFL-Saira.txt", "OFL-AzeretMono.txt"}
    md = (FONTS / "FUENTES.md").read_text(encoding="utf-8")
    import hashlib
    for p in FONTS.glob("*.woff2"):
        assert hashlib.sha256(p.read_bytes()).hexdigest() in md, p.name   # hashes al día


def test_ningun_caracter_pintado_cae_en_una_fuente_del_sistema():
    faltan = {ch: where for ch, where in caracteres_pintados().items() if ord(ch) not in SAIRA}
    assert not faltan, "sin glifo en Saira (usar un SVG propio): " + ", ".join(f"{ch} U+{ord(ch):04X} ({w})" for ch, w in faltan.items())


@pytest.mark.parametrize("ch", list("■◧□○⟲→≥▲▼▾"))
def test_el_subconjunto_no_trae_formas_ni_flechas(ch):
    """Si un día cambian las fuentes y traen estos glifos, este test avisa de que ya no hace falta el SVG."""
    assert ord(ch) not in SAIRA and ord(ch) not in AZERET


def test_lo_que_va_en_mono_es_ascii():
    """Azeret Mono solo pinta IDs de CVE y números de puerto: todo ASCII, siempre cubierto."""
    assert set(range(0x20, 0x7F)) <= AZERET
