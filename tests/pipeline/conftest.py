"""Carga scripts/radar.py como módulo para los tests (sin red: cada test simula lo que necesita)."""
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIX = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture(scope="session")
def radar():
    spec = importlib.util.spec_from_file_location("radar", ROOT / "scripts" / "radar.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="session")
def real_cves():
    """Las 453 CVE de la ejecución real del 2026-10-31 (antes de los cambios de la fase 6)."""
    return json.loads((ROOT / "tests" / "fixtures" / "real-2026-10-31.json").read_text(encoding="utf-8"))["latest"]["cves"]


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload, self.status_code = payload, status

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


@pytest.fixture
def fake_get(monkeypatch, radar):
    """Sustituye radar.HTTP.get por respuestas grabadas: fake_get({"fragmento de URL": payload})."""
    def install(routes: dict):
        def get(url, *a, **kw):
            for frag, payload in routes.items():
                if frag in url:
                    return FakeResponse(payload)
            return FakeResponse(None, 404)
        monkeypatch.setattr(radar.HTTP, "get", get)
    return install


def load_fixture(name: str):
    p = FIX / name
    return json.loads(p.read_text(encoding="utf-8")) if p.suffix == ".json" else p.read_text(encoding="utf-8")
