"""
UrbanScope - Property Catalog & Admin Listing CRUD Router
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.auth import require_admin
from backend.database import get_db_connection, row_to_dict
from backend.models import PropertyCreate, PropertyResponse, PropertyUpdate

router = APIRouter()


# ==========================================================
# PROPERTIES ENDPOINTS
# ==========================================================

@router.get("/api/properties", response_model=List[PropertyResponse], tags=["Properties"])
def list_properties(
    type: Optional[str] = Query(None, description="Filter by property type (e.g. Townhouse, Subdivision)"),
    location: Optional[str] = Query(None, description="Filter by location keyword"),
    search: Optional[str] = Query(None, description="Search keyword in title or location")
):
    """Retrieves properties with optional filtering (Public catalog)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM properties WHERE 1=1"
    params = []

    type_val = type.strip() if isinstance(type, str) and type.strip() else None
    loc_val = location.strip() if isinstance(location, str) and location.strip() else None
    search_val = search.strip() if isinstance(search, str) and search.strip() else None

    # Filter by property type
    if type_val and type_val.lower() != "all":
        t_clean = type_val.lower()
        if t_clean in ["villa", "villas"]:
            query += " AND NORMALIZE(property_type) LIKE '%villa%'"
        elif t_clean in ["townhouse", "townhouses"]:
            query += " AND NORMALIZE(property_type) LIKE '%townhouse%'"
        elif t_clean in ["apartment", "apartments", "condo", "condominium", "condominiums"]:
            query += " AND (NORMALIZE(property_type) LIKE '%condominium%' OR NORMALIZE(property_type) LIKE '%apartment%')"
        elif t_clean in ["subdivision", "subdivisions"]:
            query += " AND NORMALIZE(property_type) LIKE '%subdivision%'"
        elif t_clean in ["triplex", "triplexes"]:
            query += " AND NORMALIZE(property_type) LIKE '%triplex%'"
        elif t_clean in ["single attached", "single-attached"]:
            query += " AND NORMALIZE(property_type) LIKE '%single attached%'"
        elif t_clean in ["luxury", "luxury villas"]:
            query += " AND (NORMALIZE(property_type) LIKE '%villa%' OR price >= 5000000)"
        elif t_clean in ["house-lot", "house & lot", "house", "houses"]:
            query += " AND (NORMALIZE(property_type) LIKE '%townhouse%' OR NORMALIZE(property_type) LIKE '%subdivision%' OR NORMALIZE(property_type) LIKE '%single attached%' OR NORMALIZE(property_type) LIKE '%triplex%' OR NORMALIZE(property_type) LIKE '%villa%')"
        else:
            query += " AND NORMALIZE(property_type) LIKE '%' || NORMALIZE(?) || '%'"
            params.append(type_val)

    # Filter by location
    if loc_val and loc_val.lower() != "all":
        query += " AND NORMALIZE(location) LIKE '%' || NORMALIZE(?) || '%'"
        params.append(loc_val)

    # Search keyword across title, location, type, description, amenities
    if search_val:
        query += " AND (NORMALIZE(title) LIKE '%' || NORMALIZE(?) || '%' OR NORMALIZE(location) LIKE '%' || NORMALIZE(?) || '%' OR NORMALIZE(property_type) LIKE '%' || NORMALIZE(?) || '%' OR NORMALIZE(description) LIKE '%' || NORMALIZE(?) || '%' OR NORMALIZE(amenities) LIKE '%' || NORMALIZE(?) || '%')"
        params.extend([search_val, search_val, search_val, search_val, search_val])

    query += " ORDER BY created_at DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    properties = [row_to_dict(r) for r in rows]
    conn.close()

    return properties


@router.get("/api/properties/{property_id}", response_model=PropertyResponse, tags=["Properties"])
def get_property(property_id: int):
    """Retrieves a single property by its ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM properties WHERE id = ?", (property_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property listing not found")

    return row_to_dict(row)


@router.post("/api/properties", response_model=PropertyResponse, tags=["Properties"])
def create_property(payload: PropertyCreate, admin_user: dict = Depends(require_admin)):
    """Creates a new property listing (strictly admin only)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO properties (
            title, location, property_type, price,
            bedrooms, bathrooms, lot_area, floor_area, carports, storeys,
            status, image_url, description, amenities
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        payload.title.strip(),
        payload.location.strip(),
        payload.property_type.strip(),
        payload.price,
        payload.bedrooms,
        payload.bathrooms,
        payload.lot_area,
        payload.floor_area,
        payload.carports,
        payload.storeys,
        payload.status,
        payload.image_url,
        payload.description,
        payload.amenities
    ))
    conn.commit()

    new_id = cursor.lastrowid
    cursor.execute("SELECT * FROM properties WHERE id = ?", (new_id,))
    new_prop = row_to_dict(cursor.fetchone())
    conn.close()

    return new_prop


@router.put("/api/properties/{property_id}", response_model=PropertyResponse, tags=["Properties"])
def update_property(property_id: int, payload: PropertyUpdate, admin_user: dict = Depends(require_admin)):
    """Updates an existing property listing (strictly admin only)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM properties WHERE id = ?", (property_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    updates = []
    params = []
    data = payload.model_dump(exclude_unset=True)

    for field, val in data.items():
        updates.append(f"{field} = ?")
        params.append(val)

    if updates:
        params.append(property_id)
        cursor.execute(f"UPDATE properties SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    cursor.execute("SELECT * FROM properties WHERE id = ?", (property_id,))
    updated = row_to_dict(cursor.fetchone())
    conn.close()

    return updated


@router.delete("/api/properties/{property_id}", tags=["Properties"])
def delete_property(property_id: int, admin_user: dict = Depends(require_admin)):
    """Deletes a property listing by ID (strictly admin only)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM properties WHERE id = ?", (property_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    cursor.execute("DELETE FROM properties WHERE id = ?", (property_id,))
    conn.commit()
    conn.close()

    return {"success": True, "message": f"Property #{property_id} successfully deleted"}
