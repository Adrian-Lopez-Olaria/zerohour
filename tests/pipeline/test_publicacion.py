"""Tests de la publicación (fase 6.4): validador, montaje del sitio y force-push a deploy.
El force-push se prueba contra un repositorio bare LOCAL: no se toca GitHub."""
import copy
import importlib.util
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from conftest import ROOT

SCRIPTS = ROOT / "scripts"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


val = _load("validar_datos")
mon = _load("montar_deploy")
FX = json.loads((ROOT / "tests/fixtures/real-2026-10-31-fase6.json").read_text(encoding="utf-8"))
DATE = FX["latest"]["date"]


def write_data(d: Path, latest=None, index=None, mapa=None, extra_days=()):
    (d / "days").mkdir(parents=True, exist_ok=True)
    latest = latest or copy.deepcopy(FX["latest"])
    index = index or {"days": [{"date": DATE, "stats": latest["stats"], "top": []}]}
    (d / "latest.json").write_text(json.dumps(latest), encoding="utf-8")
    (d / "index.json").write_text(json.dumps(index), encoding="utf-8")
    (d / "map.json").write_text(json.dumps(mapa or FX["map"]), encoding="utf-8")
    for day in [x["date"] for x in index["days"]] + list(extra_days):
        (d / "days" / f"{day}.json").write_text(json.dumps(latest), encoding="utf-8")
    return d


# ───────────────────────── validador ─────────────────────────

def test_valida_la_edicion_real(tmp_path):
    assert val.validar(write_data(tmp_path)) == []


@pytest.mark.parametrize("romper, motivo", [
    (lambda L: L["cves"][0].__setitem__("score", 99), "no cuadra con el score"),
    (lambda L: L["cves"][0]["references"].append({"url": "javascript:alert(1)"}), "URL no http(s)"),
    (lambda L: L["top"].append("CVE-2099-0001"), "no está en cves"),
    (lambda L: L["sources_status"].__setitem__("nvd", "error: HTTPError"), "NVD no está ok"),
    (lambda L: L["cves"].append(copy.deepcopy(L["cves"][0])), "duplicada"),
    (lambda L: L["cves"][1].__setitem__("id", "CVE-26-1"), "ID inválido"),
    (lambda L: L.__setitem__("date", "ayer"), "fecha inválida"),
])
def test_rechaza_ediciones_rotas(tmp_path, romper, motivo):
    L = copy.deepcopy(FX["latest"])
    romper(L)
    with pytest.raises(val.Invalido, match=re.escape(motivo)):
        val.validar(write_data(tmp_path, latest=L))


def test_rechaza_indice_que_apunta_a_un_dia_inexistente(tmp_path):
    d = write_data(tmp_path)
    (d / "days" / f"{DATE}.json").unlink()
    with pytest.raises(val.Invalido, match="no existe"):
        val.validar(d)


def test_rechaza_mapa_con_coordenadas_o_pais_invalidos(tmp_path):
    m = copy.deepcopy(FX["map"])
    m["points"][0]["lat"] = 123
    with pytest.raises(val.Invalido, match="coordenadas"):
        val.validar(write_data(tmp_path, mapa=m))


def test_historico_no_puede_perder_dias_recientes(tmp_path):
    """Si una ejecución pierde días que no tocaba podar, no se publica (protege los 90 días)."""
    prev = tmp_path / "prev-index.json"
    prev.write_text(json.dumps({"days": [{"date": d} for d in ("2026-10-29", "2026-10-30", DATE)]}), encoding="utf-8")
    idx = {"days": [{"date": "2026-10-29", "stats": {}, "top": []}, {"date": DATE, "stats": {}, "top": []}]}  # falta el 30
    with pytest.raises(val.Invalido, match="perdido días"):
        val.validar(write_data(tmp_path / "data", index=idx), prev)


def test_poda_de_los_mas_antiguos_si_se_permite(tmp_path):
    prev = tmp_path / "prev-index.json"
    prev.write_text(json.dumps({"days": [{"date": d} for d in ("2026-08-01", "2026-10-30", DATE)]}), encoding="utf-8")
    idx = {"days": [{"date": "2026-10-30", "stats": {}, "top": []}, {"date": DATE, "stats": {}, "top": []}]}
    avisos = val.validar(write_data(tmp_path / "data", index=idx), prev)
    assert any("podados" in a for a in avisos)


# ───────────────────────── montaje del sitio ─────────────────────────

def test_montar_solo_publica_la_lista_blanca(tmp_path):
    web = tmp_path / "web"
    shutil.copytree(ROOT / "web", web, ignore=shutil.ignore_patterns("data"))
    (web / "data").mkdir()
    (web / "data" / "copia-local.json").write_text("{}")          # copia de desarrollo: no se publica
    data = write_data(tmp_path / "data")
    (data / "linkedin.md").write_text("borrador")                  # borrador: no se publica
    (data / "days" / "notas.txt").write_text("x")                  # resto: no se publica
    (tmp_path / "netlify.toml").write_text("[build]\n")
    out = tmp_path / "_deploy"
    info = mon.montar(web, data, out, tmp_path)
    pub = sorted(p.relative_to(out / "web" / "data").as_posix() for p in (out / "web" / "data").rglob("*") if p.is_file())
    assert pub == sorted(["latest.json", "index.json", "map.json", f"days/{DATE}.json"])
    assert (out / "web" / "index.html").is_file() and (out / "netlify.toml").is_file()
    assert info["dias"] == 1


# ───────────────────────── force-push a deploy (repo bare local) ─────────────────────────

def git(*args, cwd=None):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


@pytest.fixture
def remoto(tmp_path):
    """Remoto bare con una rama main que el script NO debe tocar."""
    bare = tmp_path / "remoto.git"
    git("init", "-q", "--bare", str(bare))
    src = tmp_path / "src"
    src.mkdir()
    git("init", "-q", "-b", "main", cwd=src)
    (src / "README.md").write_text("código")
    git("add", "-A", cwd=src)
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "main", cwd=src)
    git("push", "-q", str(bare), "main", cwd=src)
    return bare


def montado(tmp_path, n):
    web = tmp_path / f"web{n}"
    shutil.copytree(ROOT / "web", web, ignore=shutil.ignore_patterns("data"))
    out = tmp_path / f"_deploy{n}"
    mon.montar(web, write_data(tmp_path / f"data{n}"), out, ROOT)
    return out


@pytest.mark.skipif(shutil.which("bash") is None, reason="necesita bash")
def test_publicar_es_huerfano_y_no_toca_main(tmp_path, remoto):
    main_antes = git("--git-dir", str(remoto), "rev-parse", "main")
    for n in (1, 2):                                        # dos publicaciones seguidas
        subprocess.run(["bash", str(SCRIPTS / "publicar_deploy.sh"), str(montado(tmp_path, n)), str(remoto), f"deploy {n}"],
                       check=True, capture_output=True, text=True)
    assert git("--git-dir", str(remoto), "rev-list", "--count", "deploy") == "1"      # siempre un solo commit
    assert git("--git-dir", str(remoto), "log", "-1", "--format=%s", "deploy") == "deploy 2"
    assert git("--git-dir", str(remoto), "rev-parse", "main") == main_antes             # main intacta
    files = git("--git-dir", str(remoto), "ls-tree", "-r", "--name-only", "deploy").splitlines()
    assert "web/index.html" in files and "web/data/latest.json" in files
    assert not any(f.startswith(("scripts/", "tests/", "design/")) or f.endswith((".py", ".toml.bak")) for f in files)


@pytest.mark.skipif(shutil.which("bash") is None, reason="necesita bash")
def test_publicar_rechaza_una_carpeta_sin_datos(tmp_path, remoto):
    vacio = tmp_path / "vacio" / "web"
    vacio.mkdir(parents=True)
    (vacio / "index.html").write_text("x")
    r = subprocess.run(["bash", str(SCRIPTS / "publicar_deploy.sh"), str(tmp_path / "vacio"), str(remoto), "x"], capture_output=True, text=True)
    assert r.returncode != 0 and "no contiene datos" in r.stdout
    with pytest.raises(subprocess.CalledProcessError):
        git("--git-dir", str(remoto), "rev-parse", "--verify", "deploy")


def test_el_script_solo_puede_empujar_a_deploy():
    s = (SCRIPTS / "publicar_deploy.sh").read_text(encoding="utf-8")
    asignaciones = re.findall(r'^\s*(?:readonly\s+)?TARGET=(\S+)', s, re.M)
    assert asignaciones == ['"refs/heads/deploy"']                         # una sola asignación, fija a deploy
    pushes = [ln for ln in s.splitlines() if re.search(r"\bgit\b.*\bpush\b", ln)]
    assert len(pushes) == 2 and all('"HEAD:${TARGET}"' in ln for ln in pushes)   # todo push va a TARGET
