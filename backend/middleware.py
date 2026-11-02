"""
UrbanScope - Server-Side Route Guard Middleware & Portal Error Templates
Enforces strict RBAC navigation rules across Admin, Superadmin, and Public pages.
"""

from typing import Optional

from fastapi import Request, status
from fastapi.responses import HTMLResponse, RedirectResponse

from backend.auth import (
    AUTHORIZED_ADMIN_EMAILS,
    AUTHORIZED_ADMIN_ROLES,
    AUTHORIZED_SUPERADMIN_EMAILS,
    decode_access_token,
)
from backend.database import get_db_connection


# ==========================================================
# PORTAL 403 FORBIDDEN TEMPLATES
# ==========================================================

FORBIDDEN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>403 Forbidden - Access Restricted</title>
    <style>
        body {
            font-family: 'Plus Jakarta Sans', Arial, sans-serif;
            background: #fdfefe;
            color: #1b2e21;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .error-box {
            max-width: 500px;
            width: 100%;
            background: #ffffff;
            border: 1.5px solid #e2b3b0;
            border-radius: 16px;
            padding: 40px 32px;
            text-align: center;
            box-shadow: 0 14px 36px rgba(179, 56, 44, 0.09);
        }
        .badge {
            display: inline-block;
            padding: 6px 14px;
            background: #fdeeec;
            color: #b3382c;
            font-size: 0.8rem;
            font-weight: 700;
            border-radius: 999px;
            margin-bottom: 18px;
            letter-spacing: 0.8px;
        }
        h1 {
            font-size: 1.85rem;
            color: #b3382c;
            margin: 0 0 12px;
            font-weight: 800;
        }
        p {
            font-size: 0.95rem;
            color: #5f7364;
            line-height: 1.6;
            margin: 0 0 28px;
        }
        .btn-home {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 12px 26px;
            background: #2d5c39;
            color: #ffffff;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.92rem;
            transition: background 0.2s;
        }
        .btn-home:hover {
            background: #1a3b23;
        }
    </style>
</head>
<body>
    <div class="error-box">
        <span class="badge">403 FORBIDDEN</span>
        <h1>Access Restricted</h1>
        <p>Your account does not have administrator privileges to view this portal. Access is strictly limited to authorized administrators (<code>admin.realestate@gmail.com</code> and <code>urbanscope.cvsu@gmail.com</code>).</p>
        <a href="/" class="btn-home">Return to Home Page</a>
    </div>
</body>
</html>"""

FORBIDDEN_SUPERADMIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>403 Forbidden - Superadmin Clearance Required</title>
    <style>
        body {
            font-family: 'Plus Jakarta Sans', Arial, sans-serif;
            background: #0f1610;
            color: #e8eee9;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .error-box {
            max-width: 520px;
            width: 100%;
            background: #172219;
            border: 1.5px solid #2d4530;
            border-radius: 16px;
            padding: 42px 34px;
            text-align: center;
            box-shadow: 0 20px 48px rgba(0, 0, 0, 0.45);
        }
        .badge {
            display: inline-block;
            padding: 6px 16px;
            background: rgba(201, 162, 74, 0.15);
            color: #e5c068;
            font-size: 0.8rem;
            font-weight: 700;
            border: 1px solid rgba(201, 162, 74, 0.35);
            border-radius: 999px;
            margin-bottom: 20px;
            letter-spacing: 1px;
        }
        h1 {
            font-size: 1.85rem;
            color: #ffffff;
            margin: 0 0 12px;
            font-weight: 800;
        }
        p {
            font-size: 0.95rem;
            color: #9cb1a2;
            line-height: 1.6;
            margin: 0 0 28px;
        }
        .btn-group {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
        }
        .btn-admin {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 12px 24px;
            background: #c9a24a;
            color: #0d140e;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 700;
            font-size: 0.92rem;
            transition: background 0.2s;
        }
        .btn-admin:hover {
            background: #dfb960;
        }
        .btn-home {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 12px 24px;
            background: #253928;
            color: #ffffff;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.92rem;
            transition: background 0.2s;
        }
        .btn-home:hover {
            background: #2e4732;
        }
    </style>
</head>
<body>
    <div class="error-box">
        <span class="badge">403 SUPERADMIN CLEARANCE REQUIRED</span>
        <h1>Executive Access Restricted</h1>
        <p>Access to the UrbanScope Superadmin Console is strictly restricted to the primary superadministrator (<code>urbanscope.cvsu@gmail.com</code>). Regular administrator and client accounts are forbidden from accessing this console.</p>
        <div class="btn-group">
            <a href="/pages/admin/dashboard.html" class="btn-admin">Go to Admin Portal</a>
        </div>
    </div>
</body>
</html>"""


# ==========================================================
# REQUEST TOKEN & ROLE HELPERS
# ==========================================================

def extract_token_from_request(request: Request) -> Optional[str]:
    """Extracts JWT bearer token from Authorization header, access_token cookie, or query param."""
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    if "access_token" in request.cookies:
        return request.cookies.get("access_token")
    if "token" in request.query_params:
        return request.query_params.get("token")
    return None


def get_authenticated_user_role(token: str) -> Optional[tuple[str, str]]:
    """Returns (email, role) if token is valid and user exists in database, else None."""
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub") or payload.get("id")
    user_role = payload.get("role")
    user_email = (payload.get("email") or "").lower().strip()
    if user_role and user_email:
        return user_email, user_role

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT email, role FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return row["email"].lower().strip(), row["role"]
    return None


# ==========================================================
# STRICT SERVER-SIDE ROUTE GUARD (RBAC MIDDLEWARE)
# ==========================================================

async def rbac_admin_guard_middleware(request: Request, call_next):
    """
    Strict server-side route guard:
    - Superadmin portal (/superadmin, /pages/superadmin/*): ONLY urbanscope.cvsu@gmail.com with role == 'superadmin'.
    - Admin portal (/admin, /pages/admin/*): ONLY authorized admins/superadmins (admin.realestate@gmail.com / urbanscope.cvsu@gmail.com).
    - Public home/catalog pages: Admins/superadmins are forbidden from viewing public pages (home page, catalog, inquiry). They are redirected directly to their admin dashboard.
    """
    path = request.url.path

    # Check if request targets superadmin portal page
    is_superadmin_path = (
        path == "/superadmin" or
        path.startswith("/superadmin/") or
        path == "/pages/superadmin" or
        path.startswith("/pages/superadmin/")
    )

    # Check if request targets an admin portal page
    is_admin_path = (
        path == "/admin" or
        path.startswith("/admin/") or
        path == "/pages/admin" or
        path.startswith("/pages/admin/")
    )

    if is_superadmin_path or is_admin_path:
        file_name = path.split("/")[-1].lower()

        # Public files in portal directories (legacy login URL and static assets)
        is_public_portal_file = (
            file_name == "login.html" or
            file_name.endswith(".js") or
            file_name.endswith(".css") or
            file_name.endswith(".js.map") or
            file_name.endswith(".png") or
            file_name.endswith(".jpg") or
            file_name.endswith(".jpeg") or
            file_name.endswith(".svg") or
            file_name.endswith(".ico") or
            file_name.endswith(".webp")
        )

        if not is_public_portal_file:
            token = extract_token_from_request(request)

            # 1. Unauthenticated visitors: redirect to the shared login page
            if not token:
                login_redirect = f"/pages/auth/login.html?redirect={request.url.path.lstrip('/')}"
                return RedirectResponse(url=login_redirect, status_code=status.HTTP_302_FOUND)

            user_info = get_authenticated_user_role(token)
            if not user_info:
                login_redirect = "/pages/auth/login.html?reason=expired"
                return RedirectResponse(url=login_redirect, status_code=status.HTTP_302_FOUND)

            user_email, user_role = user_info

            # 2. Strict Role Checks:
            if is_superadmin_path:
                is_authorized_superadmin = (
                    user_email in AUTHORIZED_SUPERADMIN_EMAILS and
                    user_role == "superadmin"
                )
                if not is_authorized_superadmin:
                    return HTMLResponse(content=FORBIDDEN_SUPERADMIN_HTML, status_code=status.HTTP_403_FORBIDDEN)

            elif is_admin_path:
                is_authorized_admin = (
                    user_role in AUTHORIZED_ADMIN_ROLES or
                    user_email in AUTHORIZED_ADMIN_EMAILS
                )
                if not is_authorized_admin:
                    return HTMLResponse(content=FORBIDDEN_HTML, status_code=status.HTTP_403_FORBIDDEN)

    else:
        # Check if request targets public/client HTML pages (home page, catalog, inquiry)
        # Administrators and superadmin are restricted strictly to the admin portal and cannot access the home page.
        is_home_path = (path == "/" or path == "/index.html")
        is_public_catalog = (
            path.startswith("/pages/properties/") or
            path.startswith("/pages/inquiry/") or
            path.startswith("/properties/") or
            path.startswith("/inquiry/")
        )
        file_name = path.split("/")[-1].lower()
        is_html_request = is_home_path or file_name.endswith(".html") or ("." not in file_name and not path.startswith("/api/"))

        if (is_home_path or is_public_catalog) and is_html_request:
            token = extract_token_from_request(request)
            if token:
                user_info = get_authenticated_user_role(token)
                if user_info:
                    user_email, user_role = user_info
                    if user_role == "superadmin" and user_email in AUTHORIZED_SUPERADMIN_EMAILS:
                        return RedirectResponse(url="/pages/superadmin/dashboard.html", status_code=status.HTTP_302_FOUND)
                    elif user_role in AUTHORIZED_ADMIN_ROLES or user_email in AUTHORIZED_ADMIN_EMAILS:
                        return RedirectResponse(url="/pages/admin/dashboard.html", status_code=status.HTTP_302_FOUND)

    response = await call_next(request)
    return response
