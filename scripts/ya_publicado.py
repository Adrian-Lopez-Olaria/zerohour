#!/usr/bin/env python3
"""
ya_publicado.py · ¿lo que va a recolectar este run ya está publicado? (solo biblioteca estándar)

El Worker zerohour-cron lanza radar.yml a su hora y el schedule de GitHub llega después (a veces
horas tarde) como respaldo. Para no publicar dos veces, el paso «gate» del workflow pregunta aquí,
sobre los datos que ya están en la rama deploy:

  daily · fresco si latest.json ya es la edición de HOY (fecha de Madrid, igual que radar.py)
  map   · fresco si map.json se generó hace menos de 150 min (los runs del Worker van cada 3 h)
  otros · nunca fresco (all y deploy no se saltan)

Imprime dos líneas para $GITHUB_OUTPUT: `fresco=true|false` y `detalle=…`. Cualquier duda
(fichero ausente, JSON roto, fecha ilegible) cuenta como NO fresco: ante la duda, se publica,
y validar_datos.py sigue siendo el filtro de calidad.

Uso:
  python3 scripts/ya_publicado.py daily data/
  python3 scripts/ya_publicado.py map data/ --ahora 2026-11-10T05:00:00+00:00   (tests)
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Madrid")
MAPA_FRESCO = timedelta(minutes=150)


def _leer(path: Path) -> dict | None:
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else None
    except (OSError, ValueError):
        return None


def _fecha(valor) -> datetime | None:
    try:
        t = datetime.fromisoformat(str(valor))
    except ValueError:
        return None
    return t if t.tzinfo else None          # sin zona horaria no se puede comparar: no fresco


def comprobar(modo: str, data: Path, ahora: datetime) -> tuple[bool, str]:
    if modo == "daily":
        hoy = ahora.astimezone(TZ).strftime("%Y-%m-%d")
        latest = _leer(data / "latest.json") or {}
        fecha = latest.get("date")
        if fecha == hoy:
            return True, f"la edición del {hoy} ya está publicada (generated_at {latest.get('generated_at')})"
        return False, f"última edición {fecha!r}, hoy es {hoy}"
    if modo == "map":
        mapa = _leer(data / "map.json") or {}
        t = _fecha(mapa.get("updated_at"))
        if t is None:
            return False, "map.json sin updated_at legible"
        edad = ahora - t
        minutos = int(edad.total_seconds() // 60)
        if timedelta(0) <= edad < MAPA_FRESCO:
            return True, f"el mapa tiene {minutos} min (updated_at {mapa['updated_at']})"
        return False, f"el mapa tiene {minutos} min"
    return False, f"el modo {modo} no se salta nunca"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("modo")
    ap.add_argument("data", type=Path)
    ap.add_argument("--ahora", type=_fecha, default=None, help="ISO 8601 con zona (solo tests)")
    a = ap.parse_args(argv)
    ahora = a.ahora or datetime.now(timezone.utc)
    fresco, detalle = comprobar(a.modo, a.data, ahora)
    sys.stdout.reconfigure(encoding="utf-8")          # $GITHUB_OUTPUT es UTF-8 (y en Windows, no por defecto)
    print(f"fresco={'true' if fresco else 'false'}")
    print("detalle=" + " ".join(detalle.split()))     # una sola línea para $GITHUB_OUTPUT
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
