from datetime import datetime
from functools import wraps

from flask import jsonify, session

from .database import get_db


def log_action(actor_id, action, target=None):
    db = get_db()
    db.execute(
        "INSERT INTO audit_log (actor_id, action, target, timestamp) VALUES (?, ?, ?, ?)",
        (actor_id, action, target, datetime.utcnow().isoformat()),
    )
    db.commit()


def current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    return get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "Login required"}), 401
        if not user["approved"]:
            session.clear()
            return jsonify({"error": "Account is not approved"}), 403
        return fn(*args, **kwargs)
    return wrapper


def role_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if not user:
                return jsonify({"error": "Login required"}), 401
            if not user["approved"]:
                session.clear()
                return jsonify({"error": "Account is not approved"}), 403
            if user["role"] not in roles:
                return jsonify({"error": "You do not have permission to do that"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def user_to_dict(row):
    return {
        "id": row["id"], "username": row["username"], "full_name": row["full_name"],
        "user_type": row["user_type"], "role": row["role"], "class_id": row["class_id"],
        "student_number": row["student_number"], "approved": bool(row["approved"]),
        "created_at": row["created_at"],
    }


def class_exists(class_id):
    if not class_id:
        return False
    return get_db().execute("SELECT id FROM classes WHERE id = ?", (class_id,)).fetchone() is not None


def valid_date(date_value):
    try:
        datetime.strptime(date_value, "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


def valid_month(month_value):
    try:
        datetime.strptime(month_value, "%Y-%m")
        return True
    except (ValueError, TypeError):
        return False