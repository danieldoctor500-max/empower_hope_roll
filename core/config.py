import os

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

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

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.environ.get(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:5000/auth/google/callback",
)

MAIL_SERVER = os.environ.get("MAIL_SERVER")
MAIL_PORT = int(os.environ.get("MAIL_PORT", "587"))
MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
MAIL_FROM = os.environ.get("MAIL_FROM", MAIL_USERNAME or "noreply@empowerhope.org")