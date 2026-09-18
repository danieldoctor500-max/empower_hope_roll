import os


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE = os.path.join(BASE_DIR, "empower_hope.db")

DEFAULT_CLASSES = [
    "IT Class",
    "Hair and Beauty",
    "Catering",
]

USER_TYPES = ["Student", "Staff", "Other"]
ROLES = ["student", "staff", "admin"]
SUPER_ADMIN_ROLE = "super_admin"
ATTENDANCE_STATUSES = ["Present", "Absent", "Late", "Excused"]

ENVIRONMENT = os.environ.get("FLASK_ENV", "development").lower()

SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    if ENVIRONMENT == "production":
        raise RuntimeError("SECRET_KEY must be set in production")
    SECRET_KEY = "development-only-change-this-key"

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    if ENVIRONMENT == "production":
        raise RuntimeError("ADMIN_PASSWORD must be set in production")
    ADMIN_PASSWORD = "ChangeMe123!"

SUPER_ADMIN_USERNAME = os.environ.get("SUPER_ADMIN_USERNAME", "superadmin")
SUPER_ADMIN_PASSWORD = os.environ.get("SUPER_ADMIN_PASSWORD")
if not SUPER_ADMIN_PASSWORD:
    if ENVIRONMENT == "production":
        raise RuntimeError("SUPER_ADMIN_PASSWORD must be set in production")
    SUPER_ADMIN_PASSWORD = "ChangeMe123!"