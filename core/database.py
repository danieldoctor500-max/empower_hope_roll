import sqlite3
from datetime import datetime

from flask import g
from werkzeug.security import generate_password_hash

from .config import (
    ADMIN_PASSWORD,
    ADMIN_USERNAME,
    DATABASE,
    DEFAULT_CLASSES,
    SUPER_ADMIN_PASSWORD,
    SUPER_ADMIN_ROLE,
    SUPER_ADMIN_USERNAME,
)


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE, timeout=10)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DATABASE)
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            user_type TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student',
            class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
            student_number TEXT,
            approved INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sign_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
            session_name TEXT NOT NULL DEFAULT 'class_session',
            date TEXT NOT NULL,
            sign_in TEXT,
            sign_out TEXT
        );
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            status TEXT NOT NULL,
            marked_by INTEGER REFERENCES users(id),
            marked_at TEXT NOT NULL,
            UNIQUE(student_id, class_id, date)
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_id INTEGER REFERENCES users(id),
            action TEXT NOT NULL,
            target TEXT,
            timestamp TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_users_class ON users(class_id);
        CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
        CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
        CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
        """
    )

    columns = db.execute("PRAGMA table_info(sign_records)").fetchall()
    if not any(column[1] == "session_name" for column in columns):
        db.execute("ALTER TABLE sign_records ADD COLUMN session_name TEXT NOT NULL DEFAULT 'class_session'")

    user_columns = db.execute("PRAGMA table_info(users)").fetchall()
    if not any(column[1] == "email" for column in user_columns):
        db.execute("ALTER TABLE users ADD COLUMN email TEXT")
    if not any(column[1] == "google_id" for column in user_columns):
        db.execute("ALTER TABLE users ADD COLUMN google_id TEXT")

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT UNIQUE NOT NULL,
            expires_at TEXT NOT NULL,
            used_at TEXT
        )
        """
    )

    for class_name in DEFAULT_CLASSES:
        db.execute("INSERT OR IGNORE INTO classes (name) VALUES (?)", (class_name,))

    if not db.execute("SELECT id FROM users WHERE role = ? LIMIT 1", (SUPER_ADMIN_ROLE,)).fetchone():
        db.execute(
            """INSERT INTO users (username, password_hash, full_name, user_type, role, approved, created_at)
            VALUES (?, ?, ?, 'Staff', ?, 1, ?)""",
            (SUPER_ADMIN_USERNAME, generate_password_hash(SUPER_ADMIN_PASSWORD),
             "System Super Administrator", SUPER_ADMIN_ROLE, datetime.utcnow().isoformat()),
        )

    if not db.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1").fetchone():
        db.execute(
            """INSERT INTO users (username, password_hash, full_name, user_type, role, approved, created_at)
            VALUES (?, ?, ?, 'Staff', 'admin', 1, ?)""",
            (ADMIN_USERNAME, generate_password_hash(ADMIN_PASSWORD),
             "System Administrator", datetime.utcnow().isoformat()),
        )

    db.commit()
    db.close()