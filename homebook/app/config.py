"""Settings from environment variables and an optional .env file (safe defaults)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env reader: KEY=VALUE lines, # comments. Real env vars win."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    return default if v is None or v == "" else v.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    v = os.environ.get(name, "").strip()
    return int(v) if v else default


@dataclass
class Settings:
    host: str = "127.0.0.1"
    port: int = 8420
    data_dir: Path = field(default_factory=lambda: ROOT / "data")
    anthropic_api_key: str = ""
    ai_model: str = "claude-sonnet-5"
    product_lookup: bool = True
    secure_cookies: bool = False
    session_days: int = 30
    max_upload_bytes: int = 15 * 1024 * 1024

    @property
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def db_path(self) -> Path:
        return self.data_dir / "homebook.db"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @classmethod
    def from_env(cls) -> "Settings":
        _load_dotenv(ROOT / ".env")
        data_dir = os.environ.get("HOMEBOOK_DATA_DIR", "").strip()
        return cls(
            host=os.environ.get("HOMEBOOK_HOST", "").strip() or "127.0.0.1",
            port=_int("HOMEBOOK_PORT", 8420),
            data_dir=(Path(data_dir) if Path(data_dir).is_absolute() else ROOT / data_dir) if data_dir else ROOT / "data",
            anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", "").strip(),
            ai_model=os.environ.get("HOMEBOOK_AI_MODEL", "").strip() or "claude-sonnet-5",
            product_lookup=_bool("HOMEBOOK_PRODUCT_LOOKUP", True),
            secure_cookies=_bool("HOMEBOOK_SECURE_COOKIES", False),
            session_days=_int("HOMEBOOK_SESSION_DAYS", 30),
        )


settings = Settings.from_env()
