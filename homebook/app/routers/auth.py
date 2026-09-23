"""First-run setup, sign in/out, the current user, and household members."""
from __future__ import annotations

import re
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from ..auth import COOKIE, create_session, current_user, hash_password, require_admin, verify_password
from ..config import settings
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["auth"])

USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{2,40}$")
# Verified against on unknown usernames so a miss takes as long as a wrong password.
_DUMMY_HASH = hash_password("homebook-timing-guard")


class NewUser(BaseModel):
    name: str
    username: str
    password: str


class Login(BaseModel):
    username: str
    password: str


class PasswordChange(BaseModel):
    current: str
    new: str


def _validate(u: NewUser) -> NewUser:
    u.name, u.username = u.name.strip(), u.username.strip()
    if not u.name:
        raise HTTPException(422, "Name is required")
    if not USERNAME_RE.match(u.username):
        raise HTTPException(422, "Username: 2-40 letters, numbers, dots, dashes or underscores")
    if len(u.password) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")
    return u


def _insert_user(conn: sqlite3.Connection, u: NewUser, is_admin: bool) -> int:
    try:
        cur = conn.execute("INSERT INTO users (name, username, password_hash, is_admin) VALUES (?,?,?,?)",
                           (u.name, u.username, hash_password(u.password), int(is_admin)))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "That username is taken") from None
    return cur.lastrowid


def _sign_in(conn: sqlite3.Connection, response: Response, user_id: int) -> None:
    token = create_session(conn, user_id)
    response.set_cookie(COOKIE, token, max_age=settings.session_days * 86400, httponly=True,
                        samesite="lax", secure=settings.secure_cookies, path="/")


def _public(conn: sqlite3.Connection, user_id: int) -> dict:
    r = conn.execute("SELECT id, name, username, is_admin FROM users WHERE id = ?", (user_id,)).fetchone()
    return {**dict(r), "is_admin": bool(r["is_admin"])}


@router.get("/setup-status")
def setup_status(conn: sqlite3.Connection = Depends(get_conn)):
    return {"needs_setup": conn.execute("SELECT 1 FROM users LIMIT 1").fetchone() is None}


@router.post("/setup")
def setup(body: NewUser, response: Response, conn: sqlite3.Connection = Depends(get_conn)):
    """Create the first (admin) account. Only works while there are no users."""
    body = _validate(body)
    conn.execute("BEGIN IMMEDIATE")
    if conn.execute("SELECT 1 FROM users LIMIT 1").fetchone():
        conn.rollback()
        raise HTTPException(409, "Setup is already done. Sign in instead.")
    user_id = _insert_user(conn, body, is_admin=True)
    conn.commit()
    _sign_in(conn, response, user_id)
    return _public(conn, user_id)


@router.post("/login")
def login(body: Login, response: Response, conn: sqlite3.Connection = Depends(get_conn)):
    r = conn.execute("SELECT id, password_hash FROM users WHERE username = ?", (body.username.strip(),)).fetchone()
    ok = verify_password(body.password, r["password_hash"] if r else _DUMMY_HASH)
    if not r or not ok:
        raise HTTPException(401, "Wrong username or password")
    _sign_in(conn, response, r["id"])
    return _public(conn, r["id"])


@router.post("/logout")
def logout(request: Request, response: Response, conn: sqlite3.Connection = Depends(get_conn)):
    token = request.cookies.get(COOKIE)
    if token:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(current_user)):
    return {**user, "is_admin": bool(user["is_admin"]), "ai_enabled": settings.ai_enabled,
            "product_lookup": settings.product_lookup}


@router.post("/me/password")
def change_password(body: PasswordChange, response: Response, user: dict = Depends(current_user),
                    conn: sqlite3.Connection = Depends(get_conn)):
    r = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
    if not verify_password(body.current, r["password_hash"]):
        raise HTTPException(403, "Current password is wrong")
    if len(body.new) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(body.new), user["id"]))
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))  # sign out everywhere
    conn.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/users")
def list_users(_: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    return [{**dict(r), "is_admin": bool(r["is_admin"])}
            for r in conn.execute("SELECT id, name, username, is_admin FROM users ORDER BY is_admin DESC, name")]


@router.post("/users")
def add_user(body: NewUser, _: dict = Depends(require_admin), conn: sqlite3.Connection = Depends(get_conn)):
    body = _validate(body)
    user_id = _insert_user(conn, body, is_admin=False)
    conn.commit()
    return _public(conn, user_id)
