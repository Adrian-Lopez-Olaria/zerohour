#!/usr/bin/env python3
"""
validar_datos.py · comprueba los JSON antes de publicarlos (solo biblioteca estándar)

Si algo no cuadra, sale con código 1 y el workflow NO publica: la web sigue sirviendo la
edición anterior, que es mejor que una rota. Se ejecuta dos veces: al terminar de recolectar
y otra vez en el job que publica, justo antes del push (por si el artifact llegara mal).

Uso:
  python scripts/validar_datos.py data/                      # valida la carpeta de datos
  python scripts/validar_datos.py data/ --previo prev/index.json
      además comprueba que el histórico no ha encogido (salvo la poda de los 90 días)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ID_RE = re.compile(r"^CVE-\d{4}-\d{4,7}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_FILE = 8 * 1024 * 1024          # un latest.json real ronda los 0,7 MB
MAX_DAYS = 120                       # dias_historico es 90; margen
SOURCES = {"nvd", "kev", "epss", "ghsa", "poc", "rss"}


class Invalido(Exception):
    pass


def check(cond: bool, msg: str) -> None:
    if not cond:
        raise Invalido(msg)


def load(path: Path):
    check(path.is_file(), f"falta {path.name}")
    check(path.stat().st_size <= MAX_FILE, f"{path.name} es demasiado grande ({path.stat().st_size} B)")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeDecodeError) as e:
        raise Invalido(f"{path.name} no es JSON válido: {e}") from e


def http_ok(u) -> bool:
    if not isinstance(u, str):
        return False
    p = urlsplit(u)
    return p.scheme in ("http", "https") and bool(p.hostname)


def validar_edicion(rep: dict, nombre: str) -> None:
    check(isinstance(rep, dict), f"{nombre}: no es un objeto")
    check(DATE_RE.match(str(rep.get("date", ""))) is not None, f"{nombre}: fecha inválida")
    check(isinstance(rep.get("generated_at"), str), f"{nombre}: falta generated_at")
    cves = rep.get("cves")
    check(isinstance(cves, list), f"{nombre}: cves no es una lista")
    ids = set()
    for c in cves:
        check(isinstance(c, dict) and ID_RE.match(str(c.get("id", ""))) is not None, f"{nombre}: CVE con ID inválido")
        check(c["id"] not in ids, f"{nombre}: {c['id']} duplicada")
        ids.add(c["id"])
        check(isinstance(c.get("score"), int) and 0 <= c["score"] <= 100, f"{nombre}: score fuera de rango en {c['id']}")
        b = c.get("score_breakdown")
        if b is not None:
            rows = {k: v for k, v in b.items() if k != "floor"}
            check(all(isinstance(v, (int, float)) for v in rows.values()), f"{nombre}: desglose no numérico en {c['id']}")
            suma = int(sum(rows.values()) + 0.5)
            esperado = max(suma, b["floor"]["value"]) if "floor" in b else suma
            check(min(100, esperado) == c["score"], f"{nombre}: el desglose no cuadra con el score en {c['id']}")
        urls = [r.get("url") for r in c.get("references", [])] + [p.get("url") for p in c.get("poc", [])] \
            + [e.get("url") for e in c.get("exploits", [])] + [n.get("url") for n in c.get("news", [])]
        check(all(http_ok(u) for u in urls), f"{nombre}: URL no http(s) en {c['id']}")
    for lista in ("top", "kev_new"):
        refs = rep.get(lista, [])
        check(isinstance(refs, list), f"{nombre}: {lista} no es una lista")
        for r in refs:   # esquema ligero: IDs que deben existir en cves
            rid = r if isinstance(r, str) else (r or {}).get("id")
            check(rid in ids, f"{nombre}: {lista} apunta a {rid}, que no está en cves")
    st = rep.get("sources_status")
    check(isinstance(st, dict) and SOURCES <= set(st), f"{nombre}: sources_status incompleto")
    check(st.get("nvd") == "ok", f"{nombre}: NVD no está ok (sin NVD no hay edición)")


def validar(data: Path, previo: Path | None = None) -> list[str]:
    avisos = []
    latest = load(data / "latest.json")
    validar_edicion(latest, "latest.json")

    idx = load(data / "index.json")
    days = idx.get("days")
    check(isinstance(days, list) and days, "index.json sin días")
    check(len(days) <= MAX_DAYS, f"index.json con demasiados días ({len(days)})")
    fechas = [d.get("date") for d in days]
    check(all(DATE_RE.match(str(f)) for f in fechas), "index.json con fechas inválidas")
    check(len(set(fechas)) == len(fechas), "index.json con días repetidos")
    check(latest["date"] in fechas, "la edición de latest.json no está en index.json")
    for f in fechas:
        check((data / "days" / f"{f}.json").is_file(), f"index.json apunta a days/{f}.json, que no existe")
    huerfanos = sorted(p.stem for p in (data / "days").glob("*.json") if p.stem not in fechas)
    if huerfanos:
        avisos.append(f"ficheros diarios fuera del índice (se publicarán igualmente): {huerfanos[:5]}")

    if previo and previo.is_file():
        antes = {d.get("date") for d in (load(previo).get("days") or [])}
        perdidos = antes - set(fechas)
        # Solo se pueden perder los más antiguos (la poda de dias_historico), nunca días recientes
        if perdidos:
            check(max(perdidos) < min(fechas), f"el histórico ha perdido días que no tocaba podar: {sorted(perdidos)[:5]}")
            avisos.append(f"podados por antigüedad: {sorted(perdidos)}")

    mp = load(data / "map.json")
    check(isinstance(mp.get("points"), list) and isinstance(mp.get("by_country"), list), "map.json mal formado")
    for p in mp["points"]:
        check(-90 <= p.get("lat", 999) <= 90 and -180 <= p.get("lon", 999) <= 180, "map.json con coordenadas fuera de rango")
        check(re.fullmatch(r"[A-Z]{2}", str(p.get("cc", ""))) is not None, "map.json con código de país inválido")
    # Rayas de Cloudflare Radar: como mucho 100 pares, códigos ISO-2 y % entre 0 y 100
    pares = mp.get("attack_pairs", [])
    check(isinstance(pares, list) and len(pares) <= 100, "map.json con attack_pairs mal formado o con más de 100 pares")
    for q in pares:
        check(isinstance(q, dict) and all(re.fullmatch(r"[A-Z]{2}", str(q.get(k, ""))) for k in ("from_cc", "to_cc")),
              "map.json con un par de Radar con código de país inválido")
        check(isinstance(q.get("share"), (int, float)) and 0 <= q["share"] <= 100, "map.json con un % de Radar fuera de rango")
        # Solo la llamada global (H1): ningún campo más, tampoco el antiguo «scope»
        check(set(q) <= {"from_cc", "to_cc", "share"}, "map.json con un par de Radar con campos de más (¿scope?)")
    return avisos


def main() -> int:
    ap = argparse.ArgumentParser(description="Valida los JSON de datos antes de publicarlos")
    ap.add_argument("data", type=Path)
    ap.add_argument("--previo", type=Path, default=None, help="index.json de la publicación anterior")
    a = ap.parse_args()
    try:
        avisos = validar(a.data, a.previo)
    except Invalido as e:
        print(f"✗ DATOS NO VÁLIDOS: {e}", file=sys.stderr)
        return 1
    for w in avisos:
        print(f"⚠ {w}")
    print("✓ datos válidos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
