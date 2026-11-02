"""
UrbanScope Real Estate - FastAPI Backend Application
Assembles REST API routers, SQLite initialization, RBAC route protection,
and static website hosting.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


app = FastAPI(
    title="UrbanScope Real Estate API",
    description="Python Backend for UrbanScope & Miriam Lobren Real Estate Platform with RBAC",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
