"""
UrbanScope Real Estate - FastAPI Backend Application
Assembles REST API routers, SQLite initialization, RBAC route protection,
security headers, strict CORS/CSRF enforcement, and static website hosting.
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from backend.database import init_db
from backend.middleware import rbac_admin_guard_middleware
from backend.routers import (
    auth_router,
    inquiries_router,
    properties_router,
    register_web_hosting,
    superadmin_router,
    system_router,
)
from backend.security import (
    get_allowed_origins,
    is_https_request,
    is_production_mode,
    is_transport_https,
    verify_csrf_protection,
)

# Root directory of the repository and static frontend folder
ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"

# Guarantee database tables, triggers, and RBAC seeds exist
init_db()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager to initialize database and seeds on startup."""
    init_db()
    yield


_prod_mode = is_production_mode()
_docs_enabled = (not _prod_mode) or os.environ.get("ENABLE_API_DOCS", "false").strip().lower() == "true"

app = FastAPI(
    title="UrbanScope Real Estate API",
    description="Python Backend for UrbanScope & Miriam Lobren Real Estate Platform with RBAC",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

# Strict Cross-Origin Resource Sharing (explicit origins only)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Requested-With"],
)


@app.middleware("http")
async def security_hardening_middleware(request: Request, call_next):
    """Enforce optional HTTPS redirect, CSRF origin checks on mutations, and response security headers."""
    force_https = os.environ.get("FORCE_HTTPS", "false").strip().lower() == "true"
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").lower().split(":")[0]
    if force_https and not is_transport_https(request) and host not in ("localhost", "127.0.0.1", "::1"):
        https_url = request.url.replace(scheme="https")
        return RedirectResponse(url=str(https_url), status_code=status.HTTP_308_PERMANENT_REDIRECT)

    path = request.url.path
    if path.startswith("/api/") and request.method in ("POST", "PUT", "PATCH", "DELETE"):
        if not verify_csrf_protection(request):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"success": False, "detail": "Cross-site or invalid CSRF request rejected."},
            )

    response = await call_next(request)

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://accounts.google.com https://challenges.cloudflare.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: blob: https://*.googleusercontent.com https://vfspjuqymfbagesjxjmc.supabase.co https://www.google.com https://maps.google.com; "
        "connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 https://vfspjuqymfbagesjxjmc.supabase.co https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://challenges.cloudflare.com; "
        "frame-src 'self' https://maps.google.com https://www.google.com https://accounts.google.com https://challenges.cloudflare.com; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self' https://accounts.google.com; "
        "frame-ancestors 'none'",
    )
    if is_https_request(request):
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

    if path.startswith("/api/auth/") or path.startswith("/api/superadmin/") or path.startswith("/api/inquiries") or path.startswith("/api/admin/") or path.startswith("/pages/admin/") or path.startswith("/pages/superadmin/"):
        response.headers["Cache-Control"] = "private, no-store, max-age=0"

    return response


# Enforce server-side RBAC portal navigation guard
app.middleware("http")(rbac_admin_guard_middleware)

# Register modular API routers
app.include_router(system_router)
app.include_router(auth_router)
app.include_router(properties_router)
app.include_router(inquiries_router)
app.include_router(superadmin_router)

# Register portal shortcuts, StaticFiles mounts, legacy redirects, and root landing pages
register_web_hosting(app, FRONTEND_DIR)
