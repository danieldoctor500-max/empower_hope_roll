# Empower Hope Roll & Attendance System

A Flask-based student registration, roll-call, attendance, reporting, and user administration system.

## Features

- Student self-registration with mandatory admission numbers and automatic approval
- Visitor self-registration with administrator approval
- Login, logout, and password changes
- Role-based access for students, staff, administrators, and super administrators
- Sign-in and sign-out for class sessions, morning devotion, and social skills
- Daily and monthly attendance marking and reports
- CSV and Excel report exports
- Staff account management and password resets
- Audit logging for administrative actions
- SQLite database with default classes created automatically

## Requirements

- Python 3.11 or newer
- Packages listed in `requirements.txt`

## Setup

Create and activate a virtual environment, then install the dependencies:

```bash
python -m venv venv
```

On Windows PowerShell:

```powershell
venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

On Windows Command Prompt:

```bat
venv\Scripts\activate.bat
pip install -r requirements.txt
```

## Run Locally

With the virtual environment activated:

```bash
python app.py
```

Windows users can also run `run.bat`. Open the application at [http://127.0.0.1:5000](http://127.0.0.1:5000).

The SQLite database, `empower_hope.db`, is created in the project directory on first startup. The default classes are:

- IT Class
- Hair and Beauty
- Catering

## Default Development Accounts

Development defaults are created automatically if they do not already exist:

| Account | Username | Password |
| --- | --- | --- |
| Administrator | `admin` | `ChangeMe123!` |
| Super administrator | `superadmin` | `ChangeMe123!` |

Change these passwords immediately in any shared or deployed environment.

## Configuration

Environment variables can override the development defaults:

| Variable | Purpose | Default |
| --- | --- | --- |
| `FLASK_ENV` | Runtime environment | `development` |
| `SECRET_KEY` | Flask session signing key | Development-only key |
| `ADMIN_USERNAME` | Initial administrator username | `admin` |
| `ADMIN_PASSWORD` | Initial administrator password | `ChangeMe123!` |
| `SUPER_ADMIN_USERNAME` | Initial super administrator username | `superadmin` |
| `SUPER_ADMIN_PASSWORD` | Initial super administrator password | `ChangeMe123!` |

For production, `SECRET_KEY`, `ADMIN_PASSWORD`, and `SUPER_ADMIN_PASSWORD` are required. Set `FLASK_ENV=production` and use strong, unique values.

Example PowerShell configuration:

```powershell
$env:FLASK_ENV = "production"
$env:SECRET_KEY = "replace-with-a-long-random-value"
$env:ADMIN_PASSWORD = "replace-with-a-strong-password"
$env:SUPER_ADMIN_PASSWORD = "replace-with-another-strong-password"
python app.py
```

## Roles

- **Student:** Register with a unique admission number, sign in and out for an assigned class, and view personal attendance information.
- **Staff:** Mark attendance and view attendance and session reports.
- **Administrator:** Approve registrations, create staff accounts, manage users, reset passwords, and review audit logs.
- **Super administrator:** Manage organization administrators and access system-wide operational dashboards.

Student registrations are approved automatically after validation. Other visitor registrations remain pending until an administrator approves them. After a successful registration, the page switches back to the Login tab.

## Project Structure

```text
app.py                  Flask application and API routes
super_admin.py          Super administrator blueprint
core/config.py          Environment and application configuration
core/database.py        SQLite schema and initial data
core/auth.py            Authentication and authorization helpers
templates/              HTML templates
static/                 JavaScript and CSS assets
requirements.txt        Python dependencies
run.bat                 Windows startup script
```

## Production Notes

Use a production WSGI server such as Gunicorn rather than Flask's development server:

```bash
gunicorn app:app
```

Protect the SQLite database and environment variables, use HTTPS, and change all default development credentials before deployment.
