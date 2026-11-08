"""Tests de la publicación (fase 6.4): validador, montaje del sitio y force-push a deploy.
El force-push se prueba contra un repositorio bare LOCAL: no se toca GitHub."""
import copy
import importlib.util
import json
import os
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


@pytest.mark.parametrize("romper,motivo", [
    (lambda m: m.__setitem__("attack_pairs", [{"from_cc": "CN", "to_cc": "US", "share": 1.0}] * 101), "más de 100 pares"),
    (lambda m: m["attack_pairs"][0].__setitem__("share", 140), "fuera de rango"),
    (lambda m: m["attack_pairs"][0].__setitem__("to_cc", "usa"), "código de país inválido"),
    (lambda m: m["attack_pairs"][0].__setitem__("scope", "ES"), "campos de más"),
])
def test_rechaza_pares_de_radar_invalidos(tmp_path, romper, motivo):
    m = copy.deepcopy(FX["map"])
    romper(m)
    with pytest.raises(val.Invalido, match=motivo):
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
    shutil.copy2(ROOT / "cabeceras.toml", tmp_path / "cabeceras.toml")
    shutil.copy2(ROOT / "wrangler.jsonc", tmp_path / "wrangler.jsonc")
    out = tmp_path / "_deploy"
    info = mon.montar(web, data, out, tmp_path)
    pub = sorted(p.relative_to(out / "web" / "data").as_posix() for p in (out / "web" / "data").rglob("*") if p.is_file())
    assert pub == sorted(["latest.json", "index.json", "map.json", f"days/{DATE}.json"])
    assert (out / "web" / "index.html").is_file() and (out / "cabeceras.toml").is_file()
    assert (out / "wrangler.jsonc").is_file()
    assert (out / "web" / "_headers").read_text(encoding="utf-8") == mon.cabeceras_cloudflare(ROOT / "cabeceras.toml")
    assert info["dias"] == 1


def test_montar_no_publica_design_ni_nada_fuera_de_web(tmp_path):
    """Material de trabajo en la raíz (design/, zips) nunca se publica: solo web/ y la configuración."""
    (tmp_path / "design").mkdir()
    (tmp_path / "design" / "prototipo.html").write_text("<p>x</p>")
    (tmp_path / "paquete.zip").write_bytes(b"PK")
    shutil.copy2(ROOT / "cabeceras.toml", tmp_path / "cabeceras.toml")
    shutil.copy2(ROOT / "wrangler.jsonc", tmp_path / "wrangler.jsonc")
    out = tmp_path / "_deploy"
    mon.montar(ROOT / "web", write_data(tmp_path / "data"), out, tmp_path)
    top = {p.name for p in out.iterdir()}
    assert top == {"web", "cabeceras.toml", "wrangler.jsonc"}
    assert not any("design" in p.parts or p.suffix == ".zip" or "orbita" in p.name for p in out.rglob("*"))


def test_montar_exige_cabeceras_toml(tmp_path):
    """Sin cabeceras.toml el sitio saldría sin CSP ni cabeceras: no se monta."""
    with pytest.raises(SystemExit, match="cabeceras.toml"):
        mon.montar(ROOT / "web", write_data(tmp_path / "data"), tmp_path / "_deploy", tmp_path)


def test_montar_exige_wrangler_jsonc(tmp_path):
    shutil.copy2(ROOT / "cabeceras.toml", tmp_path / "cabeceras.toml")
    with pytest.raises(SystemExit, match="wrangler.jsonc"):
        mon.montar(ROOT / "web", write_data(tmp_path / "data"), tmp_path / "_deploy", tmp_path)


@pytest.mark.parametrize("toml, motivo", [
    ("", "no tiene"),                                                                    # sin reglas
    ('[[headers]]\nfor = "assets/*"\n[headers.values]\nX = "1"\n', "no válida"),         # ruta relativa
    ('[[headers]]\nfor = "/a/*/b/*"\n[headers.values]\nX = "1"\n', "no válida"),         # dos splats
    ('[[headers]]\nfor = "/*"\n[headers.values]\n"X Y" = "1"\n', "no válida"),           # nombre con espacio
    ('[[headers]]\nfor = "/*"\n[headers.values]\nX = "a\\nb"\n', "no válida"),           # salto de línea
    ('[[headers]]\nfor = "/*"\n[headers.values]\nX = "' + "a" * 2000 + '"\n', "máximo"),
    ("".join(f'[[headers]]\nfor = "/r{i}"\n[headers.values]\nX = "1"\n' for i in range(101)), "admite 100"),
])
def test_cabeceras_cloudflare_rechaza_lo_que_no_se_puede_traducir(tmp_path, toml, motivo):
    """Si cabeceras.toml tiene algo que _headers no expresa (o pasa sus límites), no se publica."""
    (tmp_path / "cabeceras.toml").write_text(toml, encoding="utf-8")
    with pytest.raises(SystemExit, match=motivo):
        mon.cabeceras_cloudflare(tmp_path / "cabeceras.toml")


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
    salida = tmp_path / "github_output"
    for n in (1, 2):                                        # dos publicaciones seguidas
        salida.write_text("")
        subprocess.run(["bash", str(SCRIPTS / "publicar_deploy.sh"), str(montado(tmp_path, n)), str(remoto), f"deploy {n}"],
                       check=True, capture_output=True, text=True, env={**os.environ, "GITHUB_OUTPUT": str(salida)})
    # El job desplegar sube a Cloudflare exactamente este commit
    assert salida.read_text().strip() == f"commit={git('--git-dir', str(remoto), 'rev-parse', 'deploy')}"
    assert git("--git-dir", str(remoto), "rev-list", "--count", "deploy") == "1"      # siempre un solo commit
    assert git("--git-dir", str(remoto), "log", "-1", "--format=%s", "deploy") == "deploy 2"
    assert git("--git-dir", str(remoto), "rev-parse", "main") == main_antes             # main intacta
    files = git("--git-dir", str(remoto), "ls-tree", "-r", "--name-only", "deploy").splitlines()
    assert "web/index.html" in files and "web/data/latest.json" in files
    assert "cabeceras.toml" in files and "web/.well-known/security.txt" in files and "web/404.html" in files
    assert "wrangler.jsonc" in files and "web/_headers" in files
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


# ───────────────────────── workflow: sin datos publicados todavía ─────────────────────────

def _workflow():
    import yaml
    return yaml.safe_load((ROOT / ".github/workflows/radar.yml").read_text(encoding="utf-8"))


@pytest.mark.skipif(shutil.which("bash") is None, reason="necesita bash")
@pytest.mark.parametrize("modo, previos, esperado", [
    ("deploy", "false", "nada"), ("map", "false", "nada"),      # primer push de main / cron del mapa
    ("all", "false", "all"), ("daily", "false", "daily"),        # estos crean la primera edición
    ("deploy", "true", "deploy"), ("map", "true", "map"),
])
def test_workflow_no_publica_sin_datos_previos(tmp_path, modo, previos, esperado):
    """El script real del paso «¿Hay algo que publicar?», ejecutado con bash."""
    paso = next(s for s in _workflow()["jobs"]["recolectar"]["steps"] if s.get("id") == "gate")
    out = tmp_path / "out"
    out.write_text("")
    r = subprocess.run(["bash", "-c", paso["run"]], capture_output=True, text=True,
                       env={"MODE": modo, "PREVIOS": previos, "GITHUB_OUTPUT": str(out), "PATH": "/usr/bin:/bin"})
    assert r.returncode == 0
    assert out.read_text().strip() == f"mode={esperado}"
    assert ("::notice::" in r.stdout) == (esperado == "nada")


def test_workflow_si_no_hay_nada_no_valida_ni_publica():
    w = _workflow()
    pasos = {s.get("name", ""): s for s in w["jobs"]["recolectar"]["steps"]}
    assert "nada" in pasos["Validar los datos (si no cuadran, no se publica nada)"]["if"]
    assert "nada" in pasos["Pasar los datos al job que publica"]["if"]
    assert w["jobs"]["publicar"]["if"] == "needs.recolectar.outputs.mode != 'nada'"
    assert w["jobs"]["recolectar"]["outputs"]["mode"].startswith("${{ steps.gate.outputs.mode }}")


@pytest.mark.skipif(shutil.which("bash") is None, reason="necesita bash")
@pytest.mark.parametrize("codigo_git, rc_esperado, existe", [
    (0, 0, "true"),       # la rama deploy existe
    (2, 0, "false"),      # no existe (primer run): caso esperado, sin error
    (128, 128, None),     # fallo real (red, permisos): el run se pone en rojo
])
def test_workflow_comprueba_si_existe_deploy(tmp_path, codigo_git, rc_esperado, existe):
    """El script real del paso «¿Existe ya la rama deploy?», con un git falso en el PATH."""
    paso = next(s for s in _workflow()["jobs"]["recolectar"]["steps"] if s.get("id") == "rama")
    falso = tmp_path / "bin"
    falso.mkdir()
    (falso / "git").write_text(f"#!/bin/sh\nexit {codigo_git}\n", newline="\n")
    (falso / "git").chmod(0o755)
    out = tmp_path / "out"
    out.write_text("")
    r = subprocess.run(["bash", "-e", "-c", paso["run"]], capture_output=True, text=True,
                       env={"GH_TOKEN": "t", "REPO": "u/r", "GITHUB_OUTPUT": str(out),
                            "PATH": f"{falso.as_posix()}:/usr/bin:/bin"})
    assert r.returncode == rc_esperado, r.stdout + r.stderr
    assert out.read_text().strip() == (f"existe={existe}" if existe else "")
    pasos = {s.get("id"): s for s in _workflow()["jobs"]["recolectar"]["steps"]}
    assert pasos["prev"]["if"] == "steps.rama.outputs.existe == 'true'"
    assert "continue-on-error" not in pasos["prev"]


# ───────────────────────── workflow: despliegue en Cloudflare ─────────────────────────

def test_workflow_despliega_con_permisos_minimos():
    w = _workflow()
    pub, dep = w["jobs"]["publicar"], w["jobs"]["desplegar"]
    assert w["permissions"] == {}
    assert dep["needs"] == "publicar" and dep["permissions"] == {"contents": "read"}
    assert dep["environment"]["name"] == "cloudflare"                       # secrets solo en ese entorno
    assert pub["outputs"]["commit"] == "${{ steps.push.outputs.commit }}"
    pasos = dep["steps"]
    ref = next(s for s in pasos if s.get("with", {}).get("path") == "_deploy")["with"]["ref"]
    assert ref == "${{ needs.publicar.outputs.commit }}"                    # el commit exacto de deploy
    assert all(s["with"].get("persist-credentials") is False for s in pasos if "checkout" in s.get("uses", ""))
    npm = next(s for s in pasos if "npm" in s.get("run", ""))
    assert "npm ci --ignore-scripts" in npm["run"]                           # lockfile y sin scripts de terceros


def test_workflow_secrets_de_cloudflare_solo_en_el_paso_de_despliegue():
    assert "NETLIFY" not in (ROOT / ".github/workflows/radar.yml").read_text(encoding="utf-8")   # sin build hook
    w = _workflow()
    for nombre, job in w["jobs"].items():
        for paso in job["steps"]:
            txt = json.dumps(paso)
            if "CLOUDFLARE_RADAR_TOKEN" in txt:
                assert nombre == "recolectar"                              # token de Radar, solo ahí
            elif "CLOUDFLARE" in txt:
                assert (nombre, paso.get("name")) == ("desplegar", "Desplegar en Cloudflare Workers")
    paso = next(p for p in w["jobs"]["desplegar"]["steps"] if p.get("name") == "Desplegar en Cloudflare Workers")
    assert paso["env"]["CLOUDFLARE_API_TOKEN"] == "${{ secrets.CLOUDFLARE_API_TOKEN }}"
    assert paso["env"]["CLOUDFLARE_ACCOUNT_ID"] == "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"
    assert "wrangler deploy --config _deploy/wrangler.jsonc" in paso["run"]


def test_wrangler_con_version_exacta_y_lockfile():
    pkg = json.loads((ROOT / "despliegue/package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "despliegue/package-lock.json").read_text(encoding="utf-8"))
    v = pkg["devDependencies"]["wrangler"]
    assert re.fullmatch(r"\d+\.\d+\.\d+", v)                                  # sin ^ ni ~
    assert set(pkg.get("dependencies", {})) | set(pkg["devDependencies"]) == {"wrangler"}
    w = lock["packages"]["node_modules/wrangler"]
    assert w["version"] == v and w["integrity"].startswith("sha512-")
    assert all(p.get("integrity") or p.get("link") for k, p in lock["packages"].items() if k)


# ───────────────────────── cadena de suministro (fase 7) ─────────────────────────

def test_acciones_fijadas_por_sha_con_su_version():
    """Cada `uses:` apunta a un commit (40 hex) y lleva la versión en un comentario: una etiqueta
    se puede mover; un SHA, no. Dependabot actualiza SHA y comentario a la vez."""
    import re as _re
    for f in (ROOT / ".github/workflows").glob("*.yml"):
        for ln in f.read_text(encoding="utf-8").splitlines():
            if "uses:" in ln and not ln.strip().startswith("#"):
                assert _re.search(r"uses: [\w.-]+/[\w./-]+@[0-9a-f]{40} # v\d+(\.\d+){1,2}$", ln.strip()), f"{f.name}: {ln.strip()}"


def test_dependencias_de_python_con_hashes():
    for f in ("requirements.txt", "requirements-dev.txt"):
        lines = (ROOT / f).read_text(encoding="utf-8").splitlines()
        pins = [l for l in lines if l and not l[0].isspace() and not l.startswith("#")]
        assert pins and all(_ver(l) for l in pins), f
        assert sum("--hash=sha256:" in l for l in lines) >= len(pins), f
    assert "--require-hashes" in (ROOT / ".github/workflows/radar.yml").read_text(encoding="utf-8")


def _ver(line):
    import re as _re
    return _re.match(r"^[A-Za-z0-9_.-]+==[0-9][^ ]* \\$", line)
