"""Authentication and household persistence for WattWise.

Uses SQLite from the standard library so local development needs no separate
database service. Passwords are hashed server-side with PBKDF2-HMAC-SHA256 and
sessions are opaque random bearer tokens stored as SHA-256 hashes.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field

BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.getenv("WATTWISE_DB_PATH", BASE_DIR / "data" / "wattwise.sqlite3"))
SESSION_DAYS = int(os.getenv("WATTWISE_SESSION_DAYS", "30"))
PBKDF2_ITERATIONS = 310_000

router = APIRouter(prefix="/auth", tags=["authentication"])


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with _connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS households (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL DEFAULT 'My Home',
                property_type TEXT NOT NULL DEFAULT '3 BHK Apartment',
                household_members INTEGER NOT NULL DEFAULT 1,
                electricity_tariff REAL NOT NULL DEFAULT 8,
                fixed_charges REAL NOT NULL DEFAULT 120,
                bill_alert REAL NOT NULL DEFAULT 1500,
                carbon_intensity REAL NOT NULL DEFAULT 0.79,
                billing_days INTEGER NOT NULL DEFAULT 30,
                updated_at TEXT NOT NULL,
                initialized INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS household_state (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                appliances_json TEXT NOT NULL DEFAULT '[]',
                scenarios_json TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL,
                initialized INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
            
            -- Safe migration for databases created before initialized existed.
            

            """
        )
        try:
            db.execute("ALTER TABLE household_state ADD COLUMN initialized INTEGER NOT NULL DEFAULT 0")
        except sqlite3.OperationalError:
            pass


init_db()


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class HouseholdState(BaseModel):
    appliances: list[dict] = Field(default_factory=list)
    scenarios: list[dict] = Field(default_factory=list)


class HouseholdPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    property_type: str | None = Field(default=None, max_length=80)
    household_members: int | None = Field(default=None, ge=1, le=20)
    electricity_tariff: float | None = Field(default=None, ge=0.5, le=50)
    fixed_charges: float | None = Field(default=None, ge=0, le=5000)
    bill_alert: float | None = Field(default=None, ge=100, le=50000)
    carbon_intensity: float | None = Field(default=None, ge=0.1, le=2)
    billing_days: int | None = Field(default=None, ge=1, le=31)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS).hex()


def _new_session(db: sqlite3.Connection, user_id: str) -> str:
    raw = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    now = _now()
    expires = now + timedelta(days=SESSION_DAYS)
    db.execute(
        "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
        (token_hash, user_id, expires.isoformat(), now.isoformat()),
    )
    return raw


def _token_from_request(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip()
    cookie = request.cookies.get("wattwise_session", "")
    if cookie:
        return cookie
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")

def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        "wattwise_session",
        token,
        httponly=True,
        secure=os.getenv("WATTWISE_COOKIE_SECURE", "0") == "1",
        samesite=os.getenv("WATTWISE_COOKIE_SAMESITE", "lax"),
        max_age=SESSION_DAYS * 86400,
        path="/",
    )


def current_user(request: Request) -> dict:
    raw = _token_from_request(request)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    with _connect() as db:
        row = db.execute(
            """
            SELECT u.id,u.email,u.name,s.expires_at
            FROM sessions s JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=?
            """,
            (token_hash,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
        if datetime.fromisoformat(row["expires_at"]) <= _now():
            db.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
            raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
        return dict(row)


@router.post("/register")
def register(payload: RegisterRequest, response: Response) -> dict:
    email = str(payload.email).strip().lower()
    salt = secrets.token_bytes(16)
    password_hash = _hash_password(payload.password, salt)
    user_id = secrets.token_hex(16)
    household_id = secrets.token_hex(16)
    now = _now().isoformat()

    with _connect() as db:
        try:
            db.execute(
                "INSERT INTO users(id,email,name,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?)",
                (user_id, email, payload.name.strip(), password_hash, salt.hex(), now),
            )
            db.execute(
                """INSERT INTO households(id,user_id,name,updated_at)
                   VALUES(?,?,?,?)""",
                (household_id, user_id, "My Home", now),
            )
            db.execute(
                "INSERT INTO household_state(user_id,updated_at) VALUES(?,?)",
                (user_id, now),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="An account with that email already exists.")

        token = _new_session(db, user_id)

    _set_session_cookie(response, token)
    return {"user": {"id": user_id, "email": email, "name": payload.name.strip()}, "household": {"id": household_id, "name": "My Home"}}


@router.post("/login")
def login(payload: LoginRequest, response: Response) -> dict:
    email = str(payload.email).strip().lower()
    with _connect() as db:
        row = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Email or password is incorrect.")
        expected = _hash_password(payload.password, bytes.fromhex(row["password_salt"]))
        if not hmac.compare_digest(expected, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Email or password is incorrect.")
        token = _new_session(db, row["id"])
        household = db.execute("SELECT id,name FROM households WHERE user_id=?", (row["id"],)).fetchone()

    _set_session_cookie(response, token)
    return {"user": {"id": row["id"], "email": row["email"], "name": row["name"]}, "household": dict(household)}


@router.post("/logout")
def logout(request: Request, response: Response) -> dict:
    raw = _token_from_request(request)
    with _connect() as db:
        db.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(raw.encode()).hexdigest(),))
    response.delete_cookie("wattwise_session", path="/")
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(current_user)) -> dict:
    with _connect() as db:
        household = db.execute("SELECT * FROM households WHERE user_id=?", (user["id"],)).fetchone()
    return {"user": {"id": user["id"], "email": user["email"], "name": user["name"]}, "household": dict(household) if household else None}


@router.patch("/household")
def update_household(payload: HouseholdPatch, user: dict = Depends(current_user)) -> dict:
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        return me(user)
    allowed = set(HouseholdPatch.model_fields)
    columns = [key for key in changes if key in allowed]
    values = [changes[key] for key in columns]
    values.extend([_now().isoformat(), user["id"]])
    assignments = ", ".join(f"{column}=?" for column in columns)
    with _connect() as db:
        db.execute(
            f"UPDATE households SET {assignments}, updated_at=? WHERE user_id=?",
            values,
        )
    return me(user)


@router.get("/state")
def get_state(user: dict = Depends(current_user)) -> dict:
    with _connect() as db:
        row = db.execute(
            "SELECT appliances_json,scenarios_json,initialized FROM household_state WHERE user_id=?",
            (user["id"],),
        ).fetchone()
    if not row:
        return {"appliances": [], "scenarios": [], "initialized": False}
    return {
        "appliances": json.loads(row["appliances_json"]),
        "scenarios": json.loads(row["scenarios_json"]),
        "initialized": bool(row["initialized"]),
    }


@router.put("/state")
def save_state(payload: HouseholdState, user: dict = Depends(current_user)) -> dict:
    now = _now().isoformat()
    with _connect() as db:
        db.execute(
            """INSERT INTO household_state(user_id,appliances_json,scenarios_json,updated_at,initialized)
               VALUES(?,?,?,?,1)
               ON CONFLICT(user_id) DO UPDATE SET
                 appliances_json=excluded.appliances_json,
                 scenarios_json=excluded.scenarios_json,
                 updated_at=excluded.updated_at,
                 initialized=1""",
            (user["id"], json.dumps(payload.appliances), json.dumps(payload.scenarios), now),
        )
    return {"ok": True, "updated_at": now}
