"""
Empower Hope Online Roll & Attendance System

Milestone 3
- Authentication
- Role-based access control
- Student registration and approval
- Staff management
- Attendance management
- Daily reports
- Monthly reports
- CSV export
- Excel export
- Audit logging
"""

import csv
import io
import os
import sqlite3
from datetime import datetime
from functools import wraps

from flask import (
    Flask,
    g,
    jsonify,
    render_template,
    request,
    session,
    send_file,
)
from werkzeug.security import check_password_hash, generate_password_hash


# ============================================================================
# CONFIGURATION
# ============================================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "empower_hope.db")

DEFAULT_CLASSES = [
    "IT Class",
    "Hair and Beauty",
    "Catering",
]

USER_TYPES = [
    "Student",
    "Staff",
    "Other",
]

ROLES = [
    "student",
    "staff",
    "admin",
]

ATTENDANCE_STATUSES = [
    "Present",
    "Absent",
    "Late",
    "Excused",
]

app = Flask(__name__)

ENVIRONMENT = os.environ.get(
    "FLASK_ENV",
    "development"
).lower()

SECRET_KEY = os.environ.get("SECRET_KEY")

if not SECRET_KEY:
    if ENVIRONMENT == "production":
        raise RuntimeError(
            "SECRET_KEY must be set in production"
        )

    SECRET_KEY = "development-only-change-this-key"

app.config["SECRET_KEY"] = SECRET_KEY

app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

if ENVIRONMENT == "production":
    app.config["SESSION_COOKIE_SECURE"] = True


ADMIN_USERNAME = os.environ.get(
    "ADMIN_USERNAME",
    "admin"
)

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")

if not ADMIN_PASSWORD:
    if ENVIRONMENT == "production":
        raise RuntimeError(
            "ADMIN_PASSWORD must be set in production"
        )

    ADMIN_PASSWORD = "ChangeMe123!"


# ============================================================================
# DATABASE
# ============================================================================

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(
            DATABASE,
            timeout=10
        )

        g.db.row_factory = sqlite3.Row

        g.db.execute("PRAGMA foreign_keys = ON")

    return g.db


@app.teardown_appcontext
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

        CREATE INDEX IF NOT EXISTS idx_users_class
        ON users(class_id);

        CREATE INDEX IF NOT EXISTS idx_attendance_date
        ON attendance(date);

        CREATE INDEX IF NOT EXISTS idx_attendance_student
        ON attendance(student_id);

        CREATE INDEX IF NOT EXISTS idx_audit_timestamp
        ON audit_log(timestamp);
        """
    )

    # ------------------------------------------------------------------------
    # Seed classes
    # ------------------------------------------------------------------------

    for class_name in DEFAULT_CLASSES:
        db.execute(
            "INSERT OR IGNORE INTO classes (name) VALUES (?)",
            (class_name,)
        )

    # ------------------------------------------------------------------------
    # Seed admin
    # ------------------------------------------------------------------------

    existing_admin = db.execute(
        "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    ).fetchone()

    if not existing_admin:

        db.execute(
            """
            INSERT INTO users (
                username,
                password_hash,
                full_name,
                user_type,
                role,
                approved,
                created_at
            )
            VALUES (?, ?, ?, 'Staff', 'admin', 1, ?)
            """,
            (
                ADMIN_USERNAME,
                generate_password_hash(ADMIN_PASSWORD),
                "System Administrator",
                datetime.utcnow().isoformat(),
            )
        )

        print("=" * 70)
        print("FIRST-RUN ADMIN ACCOUNT CREATED")
        print(f"Username: {ADMIN_USERNAME}")
        print(f"Password: {ADMIN_PASSWORD}")
        print("Change the password immediately after login.")
        print("=" * 70)

    db.commit()
    db.close()


# ============================================================================
# AUDIT LOGGING
# ============================================================================

def log_action(actor_id, action, target=None):
    db = get_db()

    db.execute(
        """
        INSERT INTO audit_log (
            actor_id,
            action,
            target,
            timestamp
        )
        VALUES (?, ?, ?, ?)
        """,
        (
            actor_id,
            action,
            target,
            datetime.utcnow().isoformat(),
        )
    )

    db.commit()


# ============================================================================
# AUTHENTICATION
# ============================================================================

def current_user():
    user_id = session.get("user_id")

    if not user_id:
        return None

    db = get_db()

    return db.execute(
        "SELECT * FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()


def login_required(fn):

    @wraps(fn)
    def wrapper(*args, **kwargs):

        user = current_user()

        if not user:
            return jsonify({
                "error": "Login required"
            }), 401

        if not user["approved"]:
            session.clear()

            return jsonify({
                "error": "Account is not approved"
            }), 403

        return fn(*args, **kwargs)

    return wrapper


def role_required(*roles):

    def decorator(fn):

        @wraps(fn)
        def wrapper(*args, **kwargs):

            user = current_user()

            if not user:
                return jsonify({
                    "error": "Login required"
                }), 401

            if not user["approved"]:
                session.clear()

                return jsonify({
                    "error": "Account is not approved"
                }), 403

            if user["role"] not in roles:

                return jsonify({
                    "error": "You do not have permission to do that"
                }), 403

            return fn(*args, **kwargs)

        return wrapper

    return decorator


# ============================================================================
# SERIALIZATION
# ============================================================================

def user_to_dict(row):

    return {
        "id": row["id"],
        "username": row["username"],
        "full_name": row["full_name"],
        "user_type": row["user_type"],
        "role": row["role"],
        "class_id": row["class_id"],
        "student_number": row["student_number"],
        "approved": bool(row["approved"]),
        "created_at": row["created_at"],
    }


def class_exists(class_id):

    if not class_id:
        return False

    db = get_db()

    row = db.execute(
        "SELECT id FROM classes WHERE id = ?",
        (class_id,)
    ).fetchone()

    return row is not None


def valid_date(date_value):

    try:
        datetime.strptime(
            date_value,
            "%Y-%m-%d"
        )

        return True

    except (ValueError, TypeError):
        return False


def valid_month(month_value):

    try:
        datetime.strptime(
            month_value,
            "%Y-%m"
        )

        return True

    except (ValueError, TypeError):
        return False


# ============================================================================
# PAGE ROUTES
# ============================================================================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/dashboard")
def dashboard_page():
    return render_template("dashboard.html")


@app.route("/admin")
def admin_page():
    return render_template("admin_dashboard.html")


# ============================================================================
# CLASSES
# ============================================================================

@app.route("/api/classes", methods=["GET"])
def api_classes():

    db = get_db()

    rows = db.execute(
        """
        SELECT id, name
        FROM classes
        ORDER BY name
        """
    ).fetchall()

    return jsonify([
        {
            "id": row["id"],
            "name": row["name"]
        }
        for row in rows
    ])


# ============================================================================
# REGISTRATION
# ============================================================================

@app.route("/api/register", methods=["POST"])
def api_register():

    data = request.get_json(silent=True) or {}

    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    full_name = (data.get("full_name") or "").strip()

    user_type = data.get(
        "user_type",
        "Student"
    )

    class_id = data.get("class_id")

    student_number = (
        data.get("student_number") or ""
    ).strip() or None

    # ------------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------------

    if not username or not full_name or not password:

        return jsonify({
            "error": "Username, full name and password are required"
        }), 400

    if len(username) < 3:

        return jsonify({
            "error": "Username must contain at least 3 characters"
        }), 400

    if len(username) > 50:

        return jsonify({
            "error": "Username is too long"
        }), 400

    if len(password) < 8:

        return jsonify({
            "error": "Password must be at least 8 characters"
        }), 400

    if user_type not in ("Student", "Other"):

        return jsonify({
            "error": (
                "Public registration only allows "
                "Student or Other accounts"
            )
        }), 400

    if user_type == "Student" and not class_id:

        return jsonify({
            "error": "Students must select a class"
        }), 400

    if class_id and not class_exists(class_id):

        return jsonify({
            "error": "Selected class does not exist"
        }), 400

    db = get_db()

    existing = db.execute(
        """
        SELECT id
        FROM users
        WHERE username = ?
        """,
        (username,)
    ).fetchone()

    if existing:

        return jsonify({
            "error": "That username is already taken"
        }), 409

    db.execute(
        """
        INSERT INTO users (
            username,
            password_hash,
            full_name,
            user_type,
            role,
            class_id,
            student_number,
            approved,
            created_at
        )
        VALUES (?, ?, ?, ?, 'student', ?, ?, 0, ?)
        """,
        (
            username,
            generate_password_hash(password),
            full_name,
            user_type,
            class_id,
            student_number,
            datetime.utcnow().isoformat(),
        )
    )

    db.commit()

    return jsonify({
        "message": (
            "Registration submitted successfully. "
            "An administrator must approve your account "
            "before you can log in."
        )
    }), 201


# ============================================================================
# LOGIN
# ============================================================================

@app.route("/api/login", methods=["POST"])
def api_login():

    data = request.get_json(silent=True) or {}

    username = (
        data.get("username") or ""
    ).strip()

    password = data.get("password") or ""

    if not username or not password:

        return jsonify({
            "error": "Username and password are required"
        }), 400

    db = get_db()

    user = db.execute(
        """
        SELECT *
        FROM users
        WHERE username = ?
        """,
        (username,)
    ).fetchone()

    if not user:

        return jsonify({
            "error": "Invalid username or password"
        }), 401

    if not check_password_hash(
        user["password_hash"],
        password
    ):

        return jsonify({
            "error": "Invalid username or password"
        }), 401

    if not user["approved"]:

        return jsonify({
            "error": (
                "Your account is pending "
                "administrator approval"
            )
        }), 403

    session.clear()

    session["user_id"] = user["id"]
    session["role"] = user["role"]

    log_action(
        user["id"],
        "login",
        target=f"user:{user['id']}"
    )

    return jsonify({
        "message": "Logged in successfully",
        "user": user_to_dict(user)
    })


# ============================================================================
# LOGOUT
# ============================================================================

@app.route("/api/logout", methods=["POST"])
@login_required
def api_logout():

    user = current_user()

    log_action(
        user["id"],
        "logout",
        target=f"user:{user['id']}"
    )

    session.clear()

    return jsonify({
        "message": "Logged out successfully"
    })


# ============================================================================
# CURRENT USER
# ============================================================================

@app.route("/api/me", methods=["GET"])
@login_required
def api_me():

    user = current_user()

    return jsonify({
        "user": user_to_dict(user)
    })


# ============================================================================
# CHANGE PASSWORD
# ============================================================================

@app.route("/api/change-password", methods=["POST"])
@login_required
def api_change_password():

    data = request.get_json(silent=True) or {}

    current_password = (
        data.get("current_password") or ""
    )

    new_password = (
        data.get("new_password") or ""
    )

    user = current_user()

    if not check_password_hash(
        user["password_hash"],
        current_password
    ):

        return jsonify({
            "error": "Current password is incorrect"
        }), 401

    if len(new_password) < 8:

        return jsonify({
            "error": (
                "New password must be at least "
                "8 characters"
            )
        }), 400

    if check_password_hash(
        user["password_hash"],
        new_password
    ):

        return jsonify({
            "error": (
                "New password must be different "
                "from the current password"
            )
        }), 400

    db = get_db()

    db.execute(
        """
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
        """,
        (
            generate_password_hash(new_password),
            user["id"],
        )
    )

    db.commit()

    log_action(
        user["id"],
        "change_own_password",
        target=f"user:{user['id']}"
    )

    return jsonify({
        "message": "Password updated successfully"
    })


# ============================================================================
# SIGN IN
# ============================================================================

@app.route("/api/signin", methods=["POST"])
@login_required
def api_signin():

    user = current_user()

    data = request.get_json(silent=True) or {}

    class_id = data.get("class_id")

    if not class_id:
        class_id = user["class_id"]

    if not class_id:

        return jsonify({
            "error": "Please select a class"
        }), 400

    if user["role"] == "student":

        if not user["class_id"]:

            return jsonify({
                "error": "Your account is not assigned to a class"
            }), 400

        if str(user["class_id"]) != str(class_id):

            return jsonify({
                "error": (
                    "You can only sign in for your assigned class"
                )
            }), 403

    if not class_exists(class_id):

        return jsonify({
            "error": "Selected class does not exist"
        }), 400

    today = datetime.now().strftime("%Y-%m-%d")
    now = datetime.now().strftime("%H:%M:%S")

    db = get_db()

    existing = db.execute(
        """
        SELECT *
        FROM sign_records
        WHERE user_id = ?
        AND date = ?
        AND class_id = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (
            user["id"],
            today,
            class_id,
        )
    ).fetchone()

    if existing and existing["sign_in"]:

        return jsonify({
            "error": "Already signed in today"
        }), 409

    if existing:

        db.execute(
            """
            UPDATE sign_records
            SET sign_in = ?
            WHERE id = ?
            """,
            (
                now,
                existing["id"],
            )
        )

    else:

        db.execute(
            """
            INSERT INTO sign_records (
                user_id,
                class_id,
                date,
                sign_in
            )
            VALUES (?, ?, ?, ?)
            """,
            (
                user["id"],
                class_id,
                today,
                now,
            )
        )

    db.commit()

    log_action(
        user["id"],
        "sign_in",
        target=f"class:{class_id} date:{today}"
    )

    return jsonify({
        "message": f"Signed in at {now}"
    })


# ============================================================================
# SIGN OUT
# ============================================================================

@app.route("/api/signout", methods=["POST"])
@login_required
def api_signout():

    user = current_user()

    today = datetime.now().strftime("%Y-%m-%d")
    now = datetime.now().strftime("%H:%M:%S")

    db = get_db()

    record = db.execute(
        """
        SELECT *
        FROM sign_records
        WHERE user_id = ?
        AND date = ?
        AND sign_in IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
        """,
        (
            user["id"],
            today,
        )
    ).fetchone()

    if not record:

        return jsonify({
            "error": "You have not signed in today"
        }), 409

    if record["sign_out"]:

        return jsonify({
            "error": "Already signed out today"
        }), 409

    db.execute(
        """
        UPDATE sign_records
        SET sign_out = ?
        WHERE id = ?
        """,
        (
            now,
            record["id"],
        )
    )

    db.commit()

    log_action(
        user["id"],
        "sign_out",
        target=f"date:{today}"
    )

    return jsonify({
        "message": f"Signed out at {now}"
    })


# ============================================================================
# STAFF / ADMIN - STUDENTS
# ============================================================================

@app.route("/api/students", methods=["GET"])
@role_required("staff", "admin")
def api_students():

    class_id = request.args.get("class_id")

    db = get_db()

    if class_id:

        rows = db.execute(
            """
            SELECT *
            FROM users
            WHERE role = 'student'
            AND approved = 1
            AND class_id = ?
            ORDER BY full_name
            """,
            (class_id,)
        ).fetchall()

    else:

        rows = db.execute(
            """
            SELECT *
            FROM users
            WHERE role = 'student'
            AND approved = 1
            ORDER BY full_name
            """
        ).fetchall()

    return jsonify([
        user_to_dict(row)
        for row in rows
    ])


# ============================================================================
# MARK ATTENDANCE
# ============================================================================

@app.route("/api/attendance/mark", methods=["POST"])
@role_required("staff", "admin")
def api_mark_attendance():

    data = request.get_json(silent=True) or {}

    student_id = data.get("student_id")
    class_id = data.get("class_id")
    date = data.get("date")
    status = data.get("status")

    if not student_id:

        return jsonify({
            "error": "student_id is required"
        }), 400

    if not class_id:

        return jsonify({
            "error": "class_id is required"
        }), 400

    if not date:

        date = datetime.now().strftime("%Y-%m-%d")

    if not valid_date(date):

        return jsonify({
            "error": "Invalid date format"
        }), 400

    if status not in ATTENDANCE_STATUSES:

        return jsonify({
            "error": (
                "Status must be Present, Absent, Late, or Excused"
            )
        }), 400

    if not class_exists(class_id):

        return jsonify({
            "error": "Class does not exist"
        }), 400

    db = get_db()

    student = db.execute(
        """
        SELECT *
        FROM users
        WHERE id = ?
        AND role = 'student'
        AND approved = 1
        """,
        (student_id,)
    ).fetchone()

    if not student:

        return jsonify({
            "error": "Student not found"
        }), 404

    if str(student["class_id"]) != str(class_id):

        return jsonify({
            "error": (
                "The selected student does not "
                "belong to this class"
            )
        }), 400

    actor = current_user()

    now = datetime.utcnow().isoformat()

    db.execute(
        """
        INSERT INTO attendance (
            student_id,
            class_id,
            date,
            status,
            marked_by,
            marked_at
        )
        VALUES (?, ?, ?, ?, ?, ?)

        ON CONFLICT(student_id, class_id, date)
        DO UPDATE SET
            status = excluded.status,
            marked_by = excluded.marked_by,
            marked_at = excluded.marked_at
        """,
        (
            student_id,
            class_id,
            date,
            status,
            actor["id"],
            now,
        )
    )

    db.commit()

    log_action(
        actor["id"],
        f"mark_attendance:{status}",
        target=(
            f"student:{student_id} "
            f"class:{class_id} "
            f"date:{date}"
        )
    )

    return jsonify({
        "message": "Attendance recorded successfully"
    })


# ============================================================================
# GET ATTENDANCE
# ============================================================================

@app.route("/api/attendance", methods=["GET"])
@role_required("staff", "admin")
def api_attendance():

    class_id = request.args.get("class_id")

    date = request.args.get(
        "date",
        datetime.now().strftime("%Y-%m-%d")
    )

    if not valid_date(date):

        return jsonify({
            "error": "Invalid date"
        }), 400

    db = get_db()

    query = """
        SELECT
            a.*,
            u.full_name,
            u.student_number,
            c.name AS class_name
        FROM attendance a
        JOIN users u
            ON u.id = a.student_id
        JOIN classes c
            ON c.id = a.class_id
        WHERE a.date = ?
    """

    params = [date]

    if class_id:

        query += " AND a.class_id = ?"
        params.append(class_id)

    query += " ORDER BY u.full_name"

    rows = db.execute(
        query,
        params
    ).fetchall()

    return jsonify([
        dict(row)
        for row in rows
    ])


# ============================================================================
# DAILY REPORT
# ============================================================================

@app.route("/api/reports/daily", methods=["GET"])
@role_required("staff", "admin")
def api_daily_report():

    date = request.args.get(
        "date",
        datetime.now().strftime("%Y-%m-%d")
    )

    class_id = request.args.get("class_id")

    if not valid_date(date):

        return jsonify({
            "error": "Invalid date"
        }), 400

    db = get_db()

    query = """
        SELECT
            u.id AS student_id,
            u.full_name,
            u.student_number,
            c.id AS class_id,
            c.name AS class_name,
            COALESCE(a.status, 'Not marked') AS status
        FROM users u
        JOIN classes c
            ON c.id = u.class_id
        LEFT JOIN attendance a
            ON a.student_id = u.id
            AND a.class_id = c.id
            AND a.date = ?
        WHERE u.role = 'student'
        AND u.approved = 1
    """

    params = [date]

    if class_id:

        query += " AND u.class_id = ?"
        params.append(class_id)

    query += " ORDER BY c.name, u.full_name"

    rows = db.execute(
        query,
        params
    ).fetchall()

    results = [
        dict(row)
        for row in rows
    ]

    total = len(results)

    present = sum(
        1
        for row in results
        if row["status"] == "Present"
    )

    absent = sum(
        1
        for row in results
        if row["status"] == "Absent"
    )

    marked = present + absent

    percentage = (
        round((present / marked) * 100, 2)
        if marked
        else 0
    )

    return jsonify({
        "date": date,
        "summary": {
            "total_students": total,
            "present": present,
            "absent": absent,
            "marked": marked,
            "attendance_percentage": percentage,
        },
        "rows": results,
    })


# ============================================================================
# MONTHLY REPORT
# ============================================================================

@app.route("/api/reports/monthly", methods=["GET"])
@role_required("staff", "admin")
def api_monthly_report():

    month = request.args.get(
        "month",
        datetime.now().strftime("%Y-%m")
    )

    class_id = request.args.get("class_id")

    if not valid_month(month):

        return jsonify({
            "error": "Invalid month"
        }), 400

    db = get_db()

    query = """
        SELECT
            u.id AS student_id,
            u.full_name,
            c.id AS class_id,
            c.name AS class_name,

            SUM(
                CASE
                    WHEN a.status = 'Present'
                    THEN 1 ELSE 0
                END
            ) AS present,

            SUM(
                CASE
                    WHEN a.status = 'Absent'
                    THEN 1 ELSE 0
                END
            ) AS absent,

            COUNT(a.id) AS marked

        FROM users u

        JOIN classes c
            ON c.id = u.class_id

        LEFT JOIN attendance a
            ON a.student_id = u.id
            AND a.class_id = c.id
            AND substr(a.date, 1, 7) = ?

        WHERE u.role = 'student'
        AND u.approved = 1
    """

    params = [month]

    if class_id:

        query += " AND u.class_id = ?"
        params.append(class_id)

    query += """
        GROUP BY
            u.id,
            u.full_name,
            c.id,
            c.name

        ORDER BY
            c.name,
            u.full_name
    """

    rows = db.execute(
        query,
        params
    ).fetchall()

    results = []

    for row in rows:

        present = row["present"] or 0
        absent = row["absent"] or 0
        marked = row["marked"] or 0

        percentage = (
            round((present / marked) * 100, 2)
            if marked
            else 0
        )

        results.append({
            "student_id": row["student_id"],
            "full_name": row["full_name"],
            "class_id": row["class_id"],
            "class_name": row["class_name"],
            "present": present,
            "absent": absent,
            "marked": marked,
            "attendance_percentage": percentage,
        })

    return jsonify({
        "month": month,
        "rows": results,
    })


# ============================================================================
# CSV EXPORT
# ============================================================================

def make_csv(filename, headers, rows):

    output = io.StringIO()

    writer = csv.writer(output)

    writer.writerow(headers)

    for row in rows:
        writer.writerow(row)

    data = io.BytesIO(
        output.getvalue().encode("utf-8-sig")
    )

    data.seek(0)

    return send_file(
        data,
        mimetype="text/csv",
        as_attachment=True,
        download_name=filename,
    )


# ============================================================================
# DAILY CSV
# ============================================================================

@app.route("/api/reports/daily/export.csv")
@role_required("staff", "admin")
def export_daily_csv():

    date = request.args.get(
        "date",
        datetime.now().strftime("%Y-%m-%d")
    )

    class_id = request.args.get("class_id")

    if not valid_date(date):

        return jsonify({
            "error": "Invalid date"
        }), 400

    db = get_db()

    query = """
        SELECT
            c.name,
            u.full_name,
            u.student_number,
            COALESCE(a.status, 'Not marked')
        FROM users u
        JOIN classes c
            ON c.id = u.class_id
        LEFT JOIN attendance a
            ON a.student_id = u.id
            AND a.class_id = c.id
            AND a.date = ?
        WHERE u.role = 'student'
        AND u.approved = 1
    """

    params = [date]

    if class_id:

        query += " AND u.class_id = ?"
        params.append(class_id)

    query += " ORDER BY c.name, u.full_name"

    rows = db.execute(
        query,
        params
    ).fetchall()

    return make_csv(
        f"daily_attendance_{date}.csv",
        [
            "Class",
            "Student",
            "Student Number",
            "Status",
        ],
        rows,
    )


# ============================================================================
# MONTHLY CSV
# ============================================================================

@app.route("/api/reports/monthly/export.csv")
@role_required("staff", "admin")
def export_monthly_csv():

    month = request.args.get(
        "month",
        datetime.now().strftime("%Y-%m")
    )

    class_id = request.args.get("class_id")

    if not valid_month(month):

        return jsonify({
            "error": "Invalid month"
        }), 400

    db = get_db()

    query = """
        SELECT
            c.name,
            u.full_name,
            SUM(
                CASE
                    WHEN a.status = 'Present'
                    THEN 1 ELSE 0
                END
            ),
            SUM(
                CASE
                    WHEN a.status = 'Absent'
                    THEN 1 ELSE 0
                END
            ),
            COUNT(a.id)
        FROM users u
        JOIN classes c
            ON c.id = u.class_id
        LEFT JOIN attendance a
            ON a.student_id = u.id
            AND a.class_id = c.id
            AND substr(a.date, 1, 7) = ?
        WHERE u.role = 'student'
        AND u.approved = 1
    """

    params = [month]

    if class_id:

        query += " AND u.class_id = ?"
        params.append(class_id)

    query += """
        GROUP BY
            u.id,
            u.full_name,
            c.id,
            c.name
        ORDER BY
            c.name,
            u.full_name
    """

    rows = db.execute(
        query,
        params
    ).fetchall()

    output_rows = []

    for row in rows:

        present = row[2] or 0
        absent = row[3] or 0
        marked = row[4] or 0

        percentage = (
            round((present / marked) * 100, 2)
            if marked
            else 0
        )

        output_rows.append([
            row[0],
            row[1],
            present,
            absent,
            marked,
            percentage,
        ])

    return make_csv(
        f"monthly_attendance_{month}.csv",
        [
            "Class",
            "Student",
            "Present",
            "Absent",
            "Marked",
            "Attendance %",
        ],
        output_rows,
    )


# ============================================================================
# EXCEL EXPORT
# ============================================================================

def make_excel(filename, headers, rows):

    try:
        from openpyxl import Workbook

    except ImportError:

        return jsonify({
            "error": (
                "Excel export requires openpyxl. "
                "Run: pip install openpyxl"
            )
        }), 500

    workbook = Workbook()

    worksheet = workbook.active
    worksheet.title = "Attendance"

    worksheet.append(headers)

    for row in rows:
        worksheet.append(list(row))

    for column in worksheet.columns:

        maximum = 0

        for cell in column:

            value = str(cell.value or "")

            maximum = max(
                maximum,
                len(value)
            )

        worksheet.column_dimensions[
            column[0].column_letter
        ].width = min(
            maximum + 3,
            40
        )

    output = io.BytesIO()

    workbook.save(output)

    output.seek(0)

    return send_file(
        output,
        mimetype=(
            "application/vnd.openxmlformats-"
            "officedocument.spreadsheetml.sheet"
        ),
        as_attachment=True,
        download_name=filename,
    )


# ============================================================================
# DAILY EXCEL
# ============================================================================

@app.route("/api/reports/daily/export.xlsx")
@role_required("staff", "admin")
def export_daily_excel():

    date = request.args.get(
        "date",
        datetime.now().strftime("%Y-%m-%d")
    )

    class_id = request.args.get("class_id")

    if not valid_date(date):

        return jsonify({
            "error": "Invalid date"
        }), 400

    db = get_db()

    query = """
        SELECT
            c.name,
            u.full_name,
            u.student_number,
            COALESCE(a.status, 'Not marked')
        FROM users u
        JOIN classes c
            ON c.id = u.class_id
        LEFT JOIN attendance a
            ON a.student_id = u.id
            AND a.class_id = c.id
            AND a.date = ?
        WHERE u.role = 'student'
        AND u.approved = 1
    """

    params = [date]

    if class_id:

        query += " AND u.class_id = ?"
        params.append(class_id)

    query += " ORDER BY c.name, u.full_name"

    rows = db.execute(
        query,
        params
    ).fetchall()

    return make_excel(
        f"daily_attendance_{date}.xlsx",
        [
            "Class",
            "Student",
            "Student Number",
            "Status",
        ],
        rows,
    )


# ============================================================================
# MONTHLY EXCEL
# ============================================================================

@app.route("/api/reports/monthly/export.xlsx")
@role_required("staff", "admin")
def export_monthly_excel():

    month = request.args.get(
        "month",
        datetime.now().strftime("%Y-%m")
    )

    class_id = request.args.get("class_id")

    if not valid_month(month):

        return jsonify({
            "error": "Invalid month"
        }), 400

    db = get_db()

    query = """
        SELECT
            c.name,
            u.full_name,
            SUM(
                CASE
                    WHEN a.status = 'Present'
                    THEN 1 ELSE 0
                END
            ),
            SUM(
                CASE
                    WHEN a.status = 'Absent'
                    THEN 1 ELSE 0
                END
            ),
            COUNT(a.id)
        FROM users u
        JOIN classes c
            ON c.id = u.class_id
        LEFT JOIN attendance a
            ON a.student_id = u.id
            AND a.class_id = c.id
            AND substr(a.date, 1, 7) = ?
        WHERE u.role = 'student'
        AND u.approved = 1
    """

    params = [month]

    if class_id:

        query += " AND u.class_id = ?"
        params.append(class_id)

    query += """
        GROUP BY
            u.id,
            u.full_name,
            c.id,
            c.name
        ORDER BY
            c.name,
            u.full_name
    """

    rows = db.execute(
        query,
        params
    ).fetchall()

    output_rows = []

    for row in rows:

        present = row[2] or 0
        absent = row[3] or 0
        marked = row[4] or 0

        percentage = (
            round((present / marked) * 100, 2)
            if marked
            else 0
        )

        output_rows.append([
            row[0],
            row[1],
            present,
            absent,
            marked,
            percentage,
        ])

    return make_excel(
        f"monthly_attendance_{month}.xlsx",
        [
            "Class",
            "Student",
            "Present",
            "Absent",
            "Marked",
            "Attendance %",
        ],
        output_rows,
    )


# ============================================================================
# ADMIN - PENDING USERS
# ============================================================================

@app.route("/api/admin/pending", methods=["GET"])
@role_required("admin")
def api_admin_pending():

    db = get_db()

    rows = db.execute(
        """
        SELECT *
        FROM users
        WHERE approved = 0
        ORDER BY created_at
        """
    ).fetchall()

    return jsonify([
        user_to_dict(row)
        for row in rows
    ])


# ============================================================================
# ADMIN - ALL USERS
# ============================================================================

@app.route("/api/admin/users", methods=["GET"])
@role_required("admin")
def api_admin_users():

    db = get_db()

    rows = db.execute(
        """
        SELECT *
        FROM users
        ORDER BY created_at DESC
        """
    ).fetchall()

    return jsonify([
        user_to_dict(row)
        for row in rows
    ])


# ============================================================================
# ADMIN - APPROVE
# ============================================================================

@app.route(
    "/api/admin/approve/<int:user_id>",
    methods=["POST"]
)
@role_required("admin")
def api_admin_approve(user_id):

    db = get_db()

    row = db.execute(
        """
        SELECT *
        FROM users
        WHERE id = ?
        """,
        (user_id,)
    ).fetchone()

    if not row:

        return jsonify({
            "error": "User not found"
        }), 404

    if row["approved"]:

        return jsonify({
            "error": "User is already approved"
        }), 409

    db.execute(
        """
        UPDATE users
        SET approved = 1
        WHERE id = ?
        """,
        (user_id,)
    )

    db.commit()

    actor = current_user()

    log_action(
        actor["id"],
        "approve_user",
        target=f"user:{user_id}"
    )

    return jsonify({
        "message": (
            f"{row['full_name']} approved successfully"
        )
    })


# ============================================================================
# ADMIN - REJECT
# ============================================================================

@app.route(
    "/api/admin/reject/<int:user_id>",
    methods=["POST"]
)
@role_required("admin")
def api_admin_reject(user_id):

    db = get_db()

    row = db.execute(
        """
        SELECT *
        FROM users
        WHERE id = ?
        """,
        (user_id,)
    ).fetchone()

    if not row:

        return jsonify({
            "error": "User not found"
        }), 404

    if row["role"] == "admin":

        return jsonify({
            "error": "Cannot reject an admin account"
        }), 400

    db.execute(
        """
        DELETE FROM users
        WHERE id = ?
        """,
        (user_id,)
    )

    db.commit()

    actor = current_user()

    log_action(
        actor["id"],
        "reject_user",
        target=f"user:{user_id}"
    )

    return jsonify({
        "message": (
            f"{row['full_name']} rejected and removed"
        )
    })


# ============================================================================
# ADMIN - CREATE STAFF
# ============================================================================

@app.route(
    "/api/admin/create-staff",
    methods=["POST"]
)
@role_required("admin")
def api_admin_create_staff():

    data = request.get_json(silent=True) or {}

    username = (
        data.get("username") or ""
    ).strip()

    password = data.get("password") or ""

    full_name = (
        data.get("full_name") or ""
    ).strip()

    if not username or not password or not full_name:

        return jsonify({
            "error": (
                "Username, full name and password "
                "are required"
            )
        }), 400

    if len(username) < 3:

        return jsonify({
            "error": "Username must contain at least 3 characters"
        }), 400

    if len(password) < 8:

        return jsonify({
            "error": "Password must be at least 8 characters"
        }), 400

    db = get_db()

    existing = db.execute(
        """
        SELECT id
        FROM users
        WHERE username = ?
        """,
        (username,)
    ).fetchone()

    if existing:

        return jsonify({
            "error": "That username is already taken"
        }), 409

    db.execute(
        """
        INSERT INTO users (
            username,
            password_hash,
            full_name,
            user_type,
            role,
            approved,
            created_at
        )
        VALUES (?, ?, ?, 'Staff', 'staff', 1, ?)
        """,
        (
            username,
            generate_password_hash(password),
            full_name,
            datetime.utcnow().isoformat(),
        )
    )

    db.commit()

    actor = current_user()

    log_action(
        actor["id"],
        "create_staff",
        target=username
    )

    return jsonify({
        "message": (
            f"Staff account '{username}' created successfully"
        )
    }), 201


# ============================================================================
# ADMIN - RESET PASSWORD
# ============================================================================

@app.route(
    "/api/admin/reset-password/<int:user_id>",
    methods=["POST"]
)
@role_required("admin")
def api_admin_reset_password(user_id):

    data = request.get_json(silent=True) or {}

    new_password = (
        data.get("new_password") or ""
    )

    if len(new_password) < 8:

        return jsonify({
            "error": (
                "New password must be at least "
                "8 characters"
            )
        }), 400

    db = get_db()

    row = db.execute(
        """
        SELECT *
        FROM users
        WHERE id = ?
        """,
        (user_id,)
    ).fetchone()

    if not row:

        return jsonify({
            "error": "User not found"
        }), 404

    db.execute(
        """
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
        """,
        (
            generate_password_hash(new_password),
            user_id,
        )
    )

    db.commit()

    actor = current_user()

    log_action(
        actor["id"],
        "reset_password",
        target=f"user:{user_id}"
    )

    return jsonify({
        "message": (
            f"Password reset for {row['full_name']}"
        )
    })


# ============================================================================
# ADMIN - SET ROLE
# ============================================================================

@app.route(
    "/api/admin/set-role/<int:user_id>",
    methods=["POST"]
)
@role_required("admin")
def api_admin_set_role(user_id):

    data = request.get_json(silent=True) or {}

    new_role = data.get("role")

    if new_role not in ROLES:

        return jsonify({
            "error": (
                f"Role must be one of: "
                f"{', '.join(ROLES)}"
            )
        }), 400

    actor = current_user()

    if user_id == actor["id"] and new_role != "admin":

        return jsonify({
            "error": (
                "You cannot demote your own account"
            )
        }), 400

    db = get_db()

    row = db.execute(
        """
        SELECT *
        FROM users
        WHERE id = ?
        """,
        (user_id,)
    ).fetchone()

    if not row:

        return jsonify({
            "error": "User not found"
        }), 404

    # Prevent accidentally removing the last admin.
    if row["role"] == "admin" and new_role != "admin":

        admin_count = db.execute(
            """
            SELECT COUNT(*) AS total
            FROM users
            WHERE role = 'admin'
            AND approved = 1
            """
        ).fetchone()["total"]

        if admin_count <= 1:

            return jsonify({
                "error": (
                    "You cannot remove the last administrator"
                )
            }), 400

    db.execute(
        """
        UPDATE users
        SET role = ?
        WHERE id = ?
        """,
        (
            new_role,
            user_id,
        )
    )

    db.commit()

    log_action(
        actor["id"],
        f"set_role:{new_role}",
        target=f"user:{user_id}"
    )

    return jsonify({
        "message": (
            f"{row['full_name']} is now {new_role}"
        )
    })


# ============================================================================
# ADMIN - AUDIT LOG
# ============================================================================

@app.route(
    "/api/admin/audit-log",
    methods=["GET"]
)
@role_required("admin")
def api_admin_audit_log():

    db = get_db()

    rows = db.execute(
        """
        SELECT
            audit_log.*,
            users.username AS actor_username
        FROM audit_log
        LEFT JOIN users
            ON users.id = audit_log.actor_id
        ORDER BY audit_log.id DESC
        LIMIT 200
        """
    ).fetchall()

    return jsonify([
        dict(row)
        for row in rows
    ])


# ============================================================================
# START APPLICATION
# ============================================================================

with app.app_context():

    if not os.path.exists(DATABASE):
        init_db()

    else:
        init_db()


if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=(
            ENVIRONMENT != "production"
            and os.environ.get("FLASK_DEBUG") == "1"
        )
    )