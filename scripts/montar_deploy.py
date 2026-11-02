#!/usr/bin/env python3
"""
montar_deploy.py · monta el contenido de la rama `deploy` (solo biblioteca estándar)

La rama `deploy` es el sitio ya montado que publica Netlify: el código de `web/` (de main) más
los datos (de la última recolección). Se regenera entera en cada publicación como un commit
huérfano, así que el historial de git no crece con los datos.

  _deploy/
    netlify.toml          (de main: cabeceras de seguridad y caché; obligatorio)
    web/                  (de main, sin web/data/ local)
    web/data/             (datos: solo lo que la web usa, ver PUBLICABLE)

Uso:
  python scripts/montar_deploy.py --web web --data data --out _deploy
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

# Lista blanca de lo que se publica de data/: nada de borradores (linkedin.md) ni restos
PUBLICABLE = ("latest.json", "index.json", "map.json", "advisories.json")
DAYS_GLOB = "days/????-??-??.json"


def montar(web: Path, data: Path, out: Path, root: Path) -> dict:
    if not (web / "index.html").is_file():
        raise SystemExit(f"{web} no parece la web (falta index.html)")
    # Sin netlify.toml el sitio saldría sin CSP ni cabeceras: no se monta
    if not (root / "netlify.toml").is_file():
        raise SystemExit(f"falta {root / 'netlify.toml'}: sin cabeceras de seguridad no se publica")
    if out.exists():
        shutil.rmtree(out)
    # Código: web/ entero salvo web/data (copia local de desarrollo, gitignored)
    shutil.copytree(web, out / "web", ignore=lambda d, names: ["data"] if Path(d) == web else [])
    # Datos: solo lo publicable
    dest = out / "web" / "data"
    (dest / "days").mkdir(parents=True)
    copiados = []
    for name in PUBLICABLE:
        if (data / name).is_file():
            shutil.copy2(data / name, dest / name)
            copiados.append(name)
    dias = sorted(data.glob(DAYS_GLOB))
    for f in dias:
        shutil.copy2(f, dest / "days" / f.name)
    shutil.copy2(root / "netlify.toml", out / "netlify.toml")
    return {"datos": copiados, "dias": len(dias)}


def main() -> int:
    ap = argparse.ArgumentParser(description="Monta el contenido de la rama deploy")
    ap.add_argument("--web", type=Path, default=Path("web"))
    ap.add_argument("--data", type=Path, default=Path("data"))
    ap.add_argument("--out", type=Path, default=Path("_deploy"))
    ap.add_argument("--root", type=Path, default=Path("."), help="raíz del repo (para netlify.toml)")
    a = ap.parse_args()
    info = montar(a.web, a.data, a.out, a.root)
    print(f"✓ sitio montado en {a.out}: netlify.toml + {', '.join(info['datos'])} + {info['dias']} días")
    return 0


if __name__ == "__main__":
    sys.exit(main())
