"""
UrbanScope API Routers Package
"""

from backend.routers.auth import router as auth_router
from backend.routers.inquiries import router as inquiries_router
from backend.routers.properties import router as properties_router
from backend.routers.superadmin import router as superadmin_router
from backend.routers.system import router as system_router
from backend.routers.web import register_web_hosting

__all__ = [
    "system_router",
    "auth_router",
    "properties_router",
    "inquiries_router",
    "superadmin_router",
    "register_web_hosting",
]
