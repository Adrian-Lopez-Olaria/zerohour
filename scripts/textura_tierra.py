#!/usr/bin/env python3
"""
textura_tierra.py · genera web/assets/geo/tierra.png, la textura equirectangular del globo 3D.

La tierra del globo son puntos (web/assets/geo/tierra.json, el mismo dato que usa el globo SVG
de respaldo). Antes se pintaba en un <canvas> en el navegador y se pasaba como data:; eso
bloqueaba el hilo principal (~4.800 elipses + codificar un PNG) justo al cargar la página.
Ahora se pinta aquí, una vez, y el navegador solo descarga y decodifica una imagen.

- 1536 × 768, fondo #0A1F44 (la esfera) y puntos #4F82D6 (la tierra), radio 1,8 px.
- Los puntos se ensanchan con 1/cos(lat) para que en la esfera sigan siendo redondos.
- Suavizado 4 × 4 por píxel y PNG con paleta de 16 tonos (pequeño y rápido de decodificar).
- Lleva un bloque tEXt «zh-fuente» con el SHA-256 de tierra.json: el test comprueba que la
  textura está al día con el dato. Solo biblioteca estándar.

Uso: python scripts/textura_tierra.py   (reescribe web/assets/geo/tierra.png)
"""
from __future__ import annotations

import hashlib
import json
import math
import struct
import sys
import zlib
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FUENTE = RAIZ / "web" / "assets" / "geo" / "tierra.json"
SALIDA = RAIZ / "web" / "assets" / "geo" / "tierra.png"

W, H = 1536, 768
FONDO = (0x0A, 0x1F, 0x44)
TIERRA = (0x4F, 0x82, 0xD6)
RADIO = 1.8
NIVELES = 16                      # tonos de la paleta (0 = fondo, 15 = tierra)
SUB = 4                           # submuestras por eje y píxel


def puntos(filas: str) -> list[tuple[float, float]]:
    """Igual que decodeLand() de globe.js: «N:ini.long,…» por fila, en base 36."""
    pts = []
    for r, row in enumerate(filas.split("|")):
        n_s, _, runs = row.partition(":")
        try:
            n = int(n_s, 36)
        except ValueError:
            continue
        if not runs or n <= 0:
            continue
        step, lat = 360 / n, 81.75 - r * 1.5
        for run in runs.split(","):
            try:
                s, ln = (int(x, 36) for x in run.split("."))
            except ValueError:
                continue
            for i in range(s, s + ln):
                pts.append((lat, -180 + (i + 0.5) * step))
    return pts


def cobertura(pts: list[tuple[float, float]]) -> bytearray:
    """Nivel de paleta (0–15) por píxel: fracción del píxel cubierta por los puntos."""
    cov = [0.0] * (W * H)
    offs = [(k + 0.5) / SUB for k in range(SUB)]
    for lat, lng in pts:
        px, py = (lng + 180) / 360 * W, (90 - lat) / 180 * H
        rx = min(RADIO / max(math.cos(math.radians(lat)), 0.15), 12.0)
        ry = RADIO
        for y in range(max(0, int(py - ry)), min(H, int(py + ry) + 1)):
            for x in range(int(px - rx) - 1, int(px + rx) + 2):
                dentro = 0
                for oy in offs:
                    dy = (y + oy - py) / ry
                    for ox in offs:
                        dx = (x + ox - px) / rx
                        if dx * dx + dy * dy <= 1:
                            dentro += 1
                if dentro:
                    i = y * W + (x % W)            # da la vuelta en el antimeridiano
                    a = dentro / (SUB * SUB)
                    cov[i] = 1 - (1 - cov[i]) * (1 - a)
    return bytearray(min(NIVELES - 1, round(c * (NIVELES - 1))) for c in cov)


def png(niveles: bytearray, texto: dict[str, str]) -> bytes:
    def chunk(tipo: bytes, datos: bytes) -> bytes:
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)

    paleta = b"".join(
        bytes(round(f + (t - f) * k / (NIVELES - 1)) for f, t in zip(FONDO, TIERRA)) for k in range(NIVELES)
    )
    crudo = b"".join(b"\x00" + bytes(niveles[y * W:(y + 1) * W]) for y in range(H))   # filtro 0
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 3, 0, 0, 0))            # 8 bits, paleta
            + chunk(b"PLTE", paleta)
            + b"".join(chunk(b"tEXt", k.encode("latin-1") + b"\x00" + v.encode("latin-1")) for k, v in texto.items())
            + chunk(b"IDAT", zlib.compress(crudo, 9))
            + chunk(b"IEND", b""))


def generar(fuente: Path = FUENTE) -> bytes:
    raw = fuente.read_bytes()
    filas = str(json.loads(raw).get("filas", ""))
    return png(cobertura(puntos(filas)), {"zh-fuente": "sha256=" + hashlib.sha256(raw).hexdigest()})


def main() -> int:
    datos = generar()
    SALIDA.write_bytes(datos)
    print(f"{SALIDA.relative_to(RAIZ)}: {len(datos)} B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
