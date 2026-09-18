"""System-wide controls reserved for super administrators."""

from datetime import datetime

from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash

from core.auth import (
    current_user,
    log_action,
    role_required,
    user_to_dict,
)
from core.config import SUPER_ADMIN_ROLE
from core.database import get_db


super_admin_blueprint = Blueprint("super_admin", __name__)


@super_admin_blueprint.route("/api/super-admin/overview")
@role_required(SUPER_ADMIN_ROLE)
def overview():
    db = get_db()
    counts = {}
    for role in ("student", "staff", "admin", SUPER_ADMIN_ROLE):
        counts[role] = db.execute(
            "SELECT COUNT(*) AS total FROM users WHERE role = ?",
            (role,)
        ).fetchone()["total"]

    counts["pending"] = db.execute(
        "SELECT COUNT(*) AS total FROM users WHERE approved = 0"
    ).fetchone()["total"]
    counts["classes"] = db.execute(
        "SELECT COUNT(*) AS total FROM classes"
    ).fetchone()["total"]
    return jsonify(counts)


@super_admin_blueprint.route("/api/super-admin/users")
@role_required(SUPER_ADMIN_ROLE)
def users():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM users ORDER BY created_at DESC"
    ).fetchall()
    return jsonify([user_to_dict(row) for row in rows])


@super_admin_blueprint.route("/api/super-admin/set-role/<int:user_id>", methods=["POST"])
@role_required(SUPER_ADMIN_ROLE)
def set_role(user_id):
    data = request.get_json(silent=True) or {}
    new_role = data.get("role")
    allowed_roles = {"student", "staff", "admin", SUPER_ADMIN_ROLE}

    if new_role not in allowed_roles:
        return jsonify({"error": "Invalid role"}), 400

    actor = current_user()
    if user_id == actor["id"] and new_role != SUPER_ADMIN_ROLE:
        return jsonify({"error": "You cannot demote your own account"}), 400

    db = get_db()
    row = db.execute(
        "SELECT * FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()
    if not row:
        return jsonify({"error": "User not found"}), 404

    if row["role"] == SUPER_ADMIN_ROLE and new_role != SUPER_ADMIN_ROLE:
        total = db.execute(
            "SELECT COUNT(*) AS total FROM users WHERE role = ? AND approved = 1",
            (SUPER_ADMIN_ROLE,)
        ).fetchone()["total"]
        if total <= 1:
            return jsonify({"error": "You cannot remove the last super administrator"}), 400

    db.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
    db.commit()
    log_action(actor["id"], f"super_admin_set_role:{new_role}", f"user:{user_id}")
    return jsonify({"message": f"{row['full_name']} is now {new_role}"})


@super_admin_blueprint.route("/api/super-admin/create-admin", methods=["POST"])
@role_required(SUPER_ADMIN_ROLE)
def create_admin():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    full_name = (data.get("full_name") or "").strip()

    if not username or not full_name or len(password) < 8:
        return jsonify({"error": "Full name, username and an 8-character password are required"}), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?",
        (username,)
    ).fetchone()
    if existing:
        return jsonify({"error": "That username is already taken"}), 409

    db.execute(
        """
        INSERT INTO users (username, password_hash, full_name, user_type, role, approved, created_at)
        VALUES (?, ?, ?, 'Staff', 'admin', 1, ?)
        """,
        (username, generate_password_hash(password), full_name, datetime.utcnow().isoformat())
    )
    db.commit()

    actor = current_user()
    log_action(actor["id"], "super_admin_create_admin", f"username:{username}")
    return jsonify({"message": f"Organization admin '{username}' created successfully"}), 201


@super_admin_blueprint.route("/api/super-admin/audit-log")
@role_required(SUPER_ADMIN_ROLE)
def audit_log():
    db = get_db()
    rows = db.execute(
        """
        SELECT audit_log.*, users.username AS actor_username
        FROM audit_log LEFT JOIN users ON users.id = audit_log.actor_id
        ORDER BY audit_log.id DESC LIMIT 200
        """
    ).fetchall()
    return jsonify([dict(row) for row in rows])