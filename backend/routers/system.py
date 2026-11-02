"""
UrbanScope - System Health & Admin Dashboard Analytics Router
"""

from fastapi import APIRouter, Depends

from backend.auth import require_admin
from backend.database import get_db_connection

router = APIRouter()


# ==========================================================
# HEALTH & STATS ENDPOINTS
# ==========================================================

@router.get("/api/health", tags=["System"])
def health_check():
    """System health check and backend status."""
    return {"status": "ok", "service": "UrbanScope Python Backend", "version": "1.0.0"}


@router.get("/api/stats", tags=["Dashboard"])
def get_dashboard_stats(admin_user: dict = Depends(require_admin)):
    """Aggregated stats for the admin analytics dashboard (strictly admin only)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM properties")
    total_properties = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM inquiries")
    total_inquiries = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM inquiries WHERE LOWER(status) LIKE '%review%' OR LOWER(status) LIKE '%pending%'")
    pending_inquiries = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM inquiries WHERE LOWER(status) LIKE '%completed%'")
    completed_inquiries = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM users WHERE LOWER(role) IN ('client', 'user') OR role IS NULL")
    total_clients = cursor.fetchone()[0]

    conn.close()

    return {
        "total_properties": total_properties,
        "total_inquiries": total_inquiries,
        "pending_inquiries": pending_inquiries,
        "completed_inquiries": completed_inquiries,
        "total_clients": total_clients
    }


@router.get("/api/view_dashboard_kpis", tags=["Dashboard"])
def get_view_dashboard_kpis(admin_user: dict = Depends(require_admin)):
    """KPI summary view for dashboard services."""
    stats = get_dashboard_stats(admin_user=admin_user)
    return [stats]
