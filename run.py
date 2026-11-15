#!/usr/bin/env python3
"""
UrbanScope Real Estate Platform - Server Runner
Executes the FastAPI application and hosts the entire platform.
"""

import os
import uvicorn

from backend.security import is_production_mode

if __name__ == "__main__":
    prod_mode = is_production_mode()
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    display_host = "localhost" if host in ("127.0.0.1", "0.0.0.0") else host
    reload_enabled = (not prod_mode) and os.environ.get("UVICORN_RELOAD", "true").strip().lower() == "true"
    docs_enabled = (not prod_mode) or os.environ.get("ENABLE_API_DOCS", "false").strip().lower() == "true"

    print("\n" + "=" * 60)
    print(" 🏙️  URBANSCOPE REAL ESTATE PLATFORM")
    print(" Miriam Lobren Real Estate Platform")
    print("=" * 60)
    print(f" ▸ Environment:          {'production' if prod_mode else 'development'}")
    print(f" ▸ Web Application:      http://{display_host}:{port}/")
    print(f" ▸ Sign-In Portal:       http://{display_host}:{port}/pages/auth/login.html")
    if docs_enabled:
        print(f" ▸ Swagger API Docs:    http://{display_host}:{port}/docs")
        print(f" ▸ ReDoc Documentation: http://{display_host}:{port}/redoc")
    print("=" * 60 + "\n")

    uvicorn.run("backend.app:app", host=host, port=port, reload=reload_enabled)
