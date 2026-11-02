"""
UrbanScope - Static Website Hosting, Portal Shortcuts & Legacy URL Redirects
Registers portal route aliases, StaticFiles mounts, 301 legacy redirects, and root assets.
"""

from pathlib import Path

from fastapi import APIRouter, FastAPI, Request, status
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from backend.auth import (
    AUTHORIZED_ADMIN_EMAILS,
    AUTHORIZED_ADMIN_ROLES,
    AUTHORIZED_SUPERADMIN_EMAILS,
    get_current_user_from_request,
)
from backend.middleware import extract_token_from_request, get_authenticated_user_role

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"


# ==========================================================
# PORTAL SHORTCUTS & LEGACY ADMIN OVERRIDES (PRE-MOUNT)
# ==========================================================

shortcut_router = APIRouter()


@shortcut_router.get("/superadmin", include_in_schema=False)
@shortcut_router.get("/superadmin/", include_in_schema=False)
def redirect_superadmin():
    """Shortcut redirect to the superadmin dashboard."""
    return RedirectResponse(url="/pages/superadmin/dashboard.html", status_code=status.HTTP_302_FOUND)


@shortcut_router.get("/admin", include_in_schema=False)
@shortcut_router.get("/admin/", include_in_schema=False)
@shortcut_router.get("/admin_dashboard", include_in_schema=False)
def redirect_admin():
    """Shortcut redirect to the admin dashboard."""
    return RedirectResponse(url="/pages/admin/dashboard.html", status_code=status.HTTP_302_FOUND)


@shortcut_router.get("/dashboard", include_in_schema=False)
@shortcut_router.get("/user_dashboard", include_in_schema=False)
def redirect_user_dashboard():
    """Shortcut redirect to normal user page."""
    return RedirectResponse(url="/index.html", status_code=status.HTTP_302_FOUND)


@shortcut_router.get("/pages/admin/properties.html", include_in_schema=False)
@shortcut_router.get("/pages/admin/manage-properties.html", include_in_schema=False)
def redirect_admin_properties_html():
    """Redirects legacy or alias admin properties link to propertylist.html."""
    return RedirectResponse(url="/pages/admin/propertylist.html", status_code=status.HTTP_302_FOUND)


@shortcut_router.get("/pages/admin/login.html", include_in_schema=False)
def redirect_admin_login_html(request: Request):
    """The separate admin login page was removed; everyone signs in on the shared login page."""
    target = "/pages/auth/login.html"
    if request.url.query:
        target += f"?{request.url.query}"
    return RedirectResponse(url=target, status_code=status.HTTP_302_FOUND)


@shortcut_router.get("/pages/admin/users.html", include_in_schema=False)
@shortcut_router.get("/admin/users.html", include_in_schema=False)
def redirect_admin_users_html(request: Request):
    """User management is centralized under superadmin governance."""
    user = get_current_user_from_request(request)
    if user and user.get("role") == "superadmin":
        return RedirectResponse(url="/pages/superadmin/dashboard.html#users", status_code=status.HTTP_302_FOUND)
    return RedirectResponse(url="/pages/admin/dashboard.html", status_code=status.HTTP_302_FOUND)


# ==========================================================
# LEGACY 301 REDIRECTS & ROOT STATIC PAGES (POST-MOUNT)
# ==========================================================

public_web_router = APIRouter()


def _make_legacy_redirect(section: str):
    """Creates a 301 redirect handler for pre-reorganization URLs (/{section}/* -> /pages/{section}/*)."""
    def redirect_legacy(path: str, request: Request):
        target = f"/pages/{section}/{path}"
        if request.url.query:
            target += f"?{request.url.query}"
        return RedirectResponse(url=target, status_code=status.HTTP_301_MOVED_PERMANENTLY)
    return redirect_legacy


for _section in ["properties", "inquiry", "auth", "admin"]:
    public_web_router.add_api_route(
        f"/{_section}/{{path:path}}",
        _make_legacy_redirect(_section),
        methods=["GET"],
        include_in_schema=False,
    )


def _resolve_admin_portal_redirect(request: Request):
    """Returns a dashboard RedirectResponse if the visitor holds an active admin/superadmin session."""
    token = extract_token_from_request(request)
    if token:
        user_info = get_authenticated_user_role(token)
        if user_info:
            user_email, user_role = user_info
            if user_role == "superadmin" and user_email in AUTHORIZED_SUPERADMIN_EMAILS:
                return RedirectResponse(url="/pages/superadmin/dashboard.html", status_code=status.HTTP_302_FOUND)
            if user_role in AUTHORIZED_ADMIN_ROLES or user_email in AUTHORIZED_ADMIN_EMAILS:
                return RedirectResponse(url="/pages/admin/dashboard.html", status_code=status.HTTP_302_FOUND)
    return None


@public_web_router.get("/", include_in_schema=False)
def serve_home(request: Request):
    """Serves root landing page index.html, redirecting administrators to admin portal."""
    portal_redirect = _resolve_admin_portal_redirect(request)
    if portal_redirect:
        return portal_redirect
    return FileResponse(str(FRONTEND_DIR / "index.html"))


@public_web_router.get("/index.html", include_in_schema=False)
def serve_index(request: Request):
    """Serves index.html, redirecting administrators to admin portal."""
    portal_redirect = _resolve_admin_portal_redirect(request)
    if portal_redirect:
        return portal_redirect
    return FileResponse(str(FRONTEND_DIR / "index.html"))


@public_web_router.get("/index.css", include_in_schema=False)
def serve_index_css():
    return FileResponse(str(FRONTEND_DIR / "index.css"), media_type="text/css")


@public_web_router.get("/index.js", include_in_schema=False)
def serve_index_js():
    return FileResponse(str(FRONTEND_DIR / "index.js"), media_type="application/javascript")


@public_web_router.get("/favicon.ico", include_in_schema=False)
def serve_favicon():
    fav = FRONTEND_DIR / "assets" / "images" / "favicon.jpg"
    if fav.exists():
        return FileResponse(str(fav))
    return JSONResponse(status_code=404, content={"detail": "Not found"})


def register_web_hosting(app: FastAPI, frontend_dir: Path = FRONTEND_DIR) -> None:
    """
    Mounts portal overrides, static asset directories (pages/, shared/, assets/),
    legacy 301 redirects, and root landing routes in exact precedence order.
    """
    app.include_router(shortcut_router)

    for folder in ["pages", "shared", "assets"]:
        dir_path = frontend_dir / folder
        if dir_path.is_dir():
            app.mount(f"/{folder}", StaticFiles(directory=str(dir_path), html=True), name=folder)

    app.include_router(public_web_router)
