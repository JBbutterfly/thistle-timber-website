"""Homebook: a private, self-hosted household budget + inventory app."""
from __future__ import annotations

import sqlite3
from datetime import datetime

from fastapi import Depends, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .auth import require_admin
from .config import ROOT, settings
from .db import get_conn
from .routers import auth, core, items, recognize, reports, transactions

STATIC = ROOT / "static"

app = FastAPI(title="Homebook", version="0.1.0", docs_url="/api/docs", redoc_url=None)
for r in (auth, core, items, transactions, reports, recognize):
    app.include_router(r.router)


@app.middleware("http")
async def security_headers(request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    return resp


@app.post("/api/backup", tags=["admin"])
def backup(_: dict = Depends(require_admin), conn: sqlite3.Connection = Depends(get_conn)):
    """Consistent snapshot of the database into data/backups/."""
    dest_dir = settings.data_dir / "backups"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"homebook-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
    with sqlite3.connect(dest) as out:
        conn.backup(out)
    return {"path": str(dest.relative_to(settings.data_dir)), "bytes": dest.stat().st_size}


@app.get("/api/health", tags=["admin"])
def health():
    return {"ok": True}


# PWA shell: serve static assets, and index.html for the root.
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/sw.js", include_in_schema=False)
def service_worker():
    # Served from the root so it can control the whole app.
    return FileResponse(STATIC / "sw.js", media_type="application/javascript")


@app.get("/manifest.webmanifest", include_in_schema=False)
def manifest():
    return FileResponse(STATIC / "manifest.webmanifest", media_type="application/manifest+json")


def run() -> None:
    import uvicorn
    uvicorn.run("app.main:app", host=settings.host, port=settings.port)


if __name__ == "__main__":
    run()
