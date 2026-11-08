#!/usr/bin/env python3
"""
montar_deploy.py · monta el contenido de la rama `deploy` (solo biblioteca estándar)

La rama `deploy` es el sitio ya montado que publica Cloudflare: el código de `web/` (de main)
más los datos (de la última recolección). Se regenera entera en cada publicación como un
commit huérfano, así que el historial de git no crece con los datos.

  _deploy/
    wrangler.jsonc        (de main: configuración de Cloudflare Workers; obligatorio)
    cabeceras.toml        (de main: la ÚNICA fuente de las cabeceras de seguridad y caché)
    web/                  (de main, sin web/data/ local)
    web/_headers          (GENERADO aquí desde cabeceras.toml: cabeceras para Cloudflare)
    web/data/             (datos: solo lo que la web usa, ver PUBLICABLE)

Uso:
  python scripts/montar_deploy.py --web web --data data --out _deploy
"""
from __future__ import annotations

import argparse
import shutil
import sys
import tomllib
from pathlib import Path

# Lista blanca de lo que se publica de data/: nada de borradores (linkedin.md) ni restos
PUBLICABLE = ("latest.json", "index.json", "map.json", "advisories.json")
DAYS_GLOB = "days/????-??-??.json"

# Límites del fichero _headers de Cloudflare (developers.cloudflare.com/workers/static-assets/headers/)
CF_MAX_REGLAS = 100
CF_MAX_LINEA = 2000


def cabeceras_cloudflare(toml_path: Path) -> str:
    """_headers de Cloudflare a partir de las reglas [[headers]] de cabeceras.toml.

    La semántica es la misma en los dos: se aplican TODAS las reglas cuyo patrón casa con la
    ruta, una cabecera repetida en dos reglas se une con comas y `*` es el splat. Por eso la
    traducción es línea a línea, sin reordenar ni fusionar nada. Si algo no se puede expresar
    en _headers (o pasa de los límites de Cloudflare), no se publica."""
    reglas = tomllib.loads(toml_path.read_text(encoding="utf-8")).get("headers", [])
    if not reglas:
        raise SystemExit(f"{toml_path} no tiene [[headers]]: sin cabeceras de seguridad no se publica")
    if len(reglas) > CF_MAX_REGLAS:
        raise SystemExit(f"{len(reglas)} reglas de cabeceras: Cloudflare admite {CF_MAX_REGLAS}")
    out = ["# GENERADO por scripts/montar_deploy.py desde cabeceras.toml. No se edita a mano.", ""]
    for r in reglas:
        ruta = str(r.get("for", ""))
        if not ruta.startswith("/") or any(c.isspace() for c in ruta) or ruta.count("*") > 1:
            raise SystemExit(f"ruta de cabeceras no válida para Cloudflare: {ruta!r}")
        out.append(ruta)
        for k, v in (r.get("values") or {}).items():
            linea = f"  {k}: {v}"
            if not k or any(c in k for c in " :\t") or any(c in str(v) for c in "\r\n"):
                raise SystemExit(f"cabecera no válida en {ruta}: {k!r}")
            if len(linea) > CF_MAX_LINEA:
                raise SystemExit(f"{ruta} · {k}: {len(linea)} caracteres (máximo de Cloudflare: {CF_MAX_LINEA})")
            out.append(linea)
        out.append("")
    return "\n".join(out)


def montar(web: Path, data: Path, out: Path, root: Path) -> dict:
    if not (web / "index.html").is_file():
        raise SystemExit(f"{web} no parece la web (falta index.html)")
    # Sin cabeceras.toml el sitio saldría sin CSP ni cabeceras: no se monta
    if not (root / "cabeceras.toml").is_file():
        raise SystemExit(f"falta {root / 'cabeceras.toml'}: sin cabeceras de seguridad no se publica")
    if not (root / "wrangler.jsonc").is_file():
        raise SystemExit(f"falta {root / 'wrangler.jsonc'}: sin configuración de Cloudflare no se publica")
    headers = cabeceras_cloudflare(root / "cabeceras.toml")    # antes de borrar nada: si falla, no se toca _deploy
    if out.exists():
        shutil.rmtree(out)
    # Código: web/ entero salvo web/data (copia local de desarrollo, gitignored)
    shutil.copytree(web, out / "web", ignore=lambda d, names: ["data"] if Path(d) == web else [])
    (out / "web" / "_headers").write_text(headers, encoding="utf-8", newline="\n")
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
    shutil.copy2(root / "cabeceras.toml", out / "cabeceras.toml")
    shutil.copy2(root / "wrangler.jsonc", out / "wrangler.jsonc")
    return {"datos": copiados, "dias": len(dias)}


def main() -> int:
    ap = argparse.ArgumentParser(description="Monta el contenido de la rama deploy")
    ap.add_argument("--web", type=Path, default=Path("web"))
    ap.add_argument("--data", type=Path, default=Path("data"))
    ap.add_argument("--out", type=Path, default=Path("_deploy"))
    ap.add_argument("--root", type=Path, default=Path("."), help="raíz del repo (cabeceras.toml y wrangler.jsonc)")
    a = ap.parse_args()
    info = montar(a.web, a.data, a.out, a.root)
    print(f"✓ sitio montado en {a.out}: wrangler.jsonc + _headers + {', '.join(info['datos'])} + {info['dias']} días")
    return 0


if __name__ == "__main__":
    sys.exit(main())
