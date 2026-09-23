import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import connect
from app.main import app

ADMIN = {"name": "Alex", "username": "alex", "password": "correct horse"}


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    """A fresh data folder per test, with every outbound feature off."""
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "product_lookup", False)
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    return tmp_path


@pytest.fixture
def anon(data_dir):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def client(anon):
    """Signed in as the household admin."""
    r = anon.post("/api/setup", json=ADMIN)
    assert r.status_code == 200, r.text
    return anon


@pytest.fixture
def conn(data_dir):
    c = connect()
    yield c
    c.close()


@pytest.fixture
def cat(conn):
    """Look up a seeded category id by name."""
    def find(name: str) -> int:
        return conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()[0]
    return find
