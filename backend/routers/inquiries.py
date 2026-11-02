"""
UrbanScope - Client & Admin Inquiry Lifecycle Router
Handles inquiry submission, admin listing, client history, modifications, and cancellations.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.auth import (
    AUTHORIZED_ADMIN_EMAILS,
    AUTHORIZED_ADMIN_ROLES,
    get_current_user_from_request,
    require_admin,
)
from backend.database import get_db_connection, row_to_dict
from backend.models import InquiryCreate, InquiryResponse

router = APIRouter()


# ==========================================================
# INQUIRY ENDPOINTS
# ==========================================================

@router.post("/api/inquiries", tags=["Inquiries"])
def submit_inquiry(payload: InquiryCreate):
    """Submits a new client inquiry (Public / Client)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO inquiries (property_title, client_name, client_email, client_phone, message, status)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        payload.property_title or "General Inquiry",
        payload.client_name.strip(),
        payload.client_email.strip(),
        payload.client_phone.strip() if payload.client_phone else "",
        payload.message.strip(),
        payload.status or "Under Review"
    ))
    conn.commit()

    inq_id = cursor.lastrowid
    cursor.execute("SELECT * FROM inquiries WHERE id = ?", (inq_id,))
    new_inq = row_to_dict(cursor.fetchone())
    conn.close()

    return {"success": True, "data": new_inq}


@router.get("/api/inquiries", response_model=List[InquiryResponse], tags=["Inquiries"])
def list_inquiries(admin_user: dict = Depends(require_admin)):
    """Lists all submitted inquiries (strictly admin only)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inquiries ORDER BY created_at DESC")
    rows = cursor.fetchall()
    inquiries = [row_to_dict(r) for r in rows]
    conn.close()

    return inquiries


@router.get("/api/inquiries/my", response_model=List[InquiryResponse], tags=["Inquiries"])
def list_my_inquiries(
    email: Optional[str] = Query(None),
    current_user: Optional[dict] = Depends(get_current_user_from_request)
):
    """
    Lists inquiries submitted by the current client.
    Matches either the authenticated session email, or the provided email query parameter.
    """
    user_email = (current_user.get("email") if current_user else email) or ""
    user_email = user_email.strip().lower()

    if not user_email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required or client email must be provided."
        )

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM inquiries WHERE LOWER(client_email) = ? ORDER BY created_at DESC",
        (user_email,)
    )
    rows = cursor.fetchall()
    inquiries = [row_to_dict(r) for r in rows]
    conn.close()

    return inquiries


@router.put("/api/inquiries/{inquiry_id}", tags=["Inquiries"])
@router.patch("/api/inquiries/{inquiry_id}", tags=["Inquiries"])
def modify_inquiry(
    inquiry_id: int,
    payload: dict,
    current_user: Optional[dict] = Depends(get_current_user_from_request)
):
    """
    Modifies or cancels an inquiry.
    Authorized for the client who submitted the inquiry (matching email) or administrators.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inquiries WHERE id = ?", (inquiry_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Inquiry not found")

    inq = row_to_dict(row)
    inq_email = (inq.get("client_email") or "").strip().lower()

    is_admin = False
    is_owner = False

    if current_user:
        role = (current_user.get("role") or "").lower()
        caller_email = (current_user.get("email") or "").strip().lower()
        if role in AUTHORIZED_ADMIN_ROLES or caller_email in AUTHORIZED_ADMIN_EMAILS:
            is_admin = True
        if caller_email and caller_email == inq_email:
            is_owner = True
    else:
        admin_candidate = (payload.get("admin_email") or payload.get("caller_email") or "").strip().lower()
        if admin_candidate in AUTHORIZED_ADMIN_EMAILS:
            is_admin = True
        passed_email = (payload.get("client_email") or "").strip().lower()
        if passed_email and passed_email == inq_email:
            is_owner = True

    if not is_admin and not is_owner:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to modify this inquiry."
        )

    updates = []
    params = []

    if "message" in payload and payload["message"] is not None:
        updates.append("message = ?")
        params.append(str(payload["message"]).strip())

    if "client_phone" in payload and payload["client_phone"] is not None:
        updates.append("client_phone = ?")
        params.append(str(payload["client_phone"]).strip())

    if "property_title" in payload and payload["property_title"] is not None:
        updates.append("property_title = ?")
        params.append(str(payload["property_title"]).strip())

    if "status" in payload and payload["status"] is not None:
        new_status = str(payload["status"]).strip()
        if not is_admin and new_status not in ["Cancelled", "Under Review"]:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Clients can only cancel an inquiry."
            )
        updates.append("status = ?")
        params.append(new_status)

    if not updates:
        conn.close()
        return {"success": True, "data": inq, "message": "No fields to update."}

    params.append(inquiry_id)
    cursor.execute(f"UPDATE inquiries SET {', '.join(updates)} WHERE id = ?", tuple(params))
    conn.commit()

    cursor.execute("SELECT * FROM inquiries WHERE id = ?", (inquiry_id,))
    updated_inq = row_to_dict(cursor.fetchone())
    conn.close()

    return {"success": True, "data": updated_inq}


@router.delete("/api/inquiries/{inquiry_id}", tags=["Inquiries"])
def delete_inquiry(
    inquiry_id: int,
    client_email: Optional[str] = Query(None),
    current_user: Optional[dict] = Depends(get_current_user_from_request)
):
    """
    Deletes an inquiry permanently.
    Authorized for the client owner (matching email) or administrators.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM inquiries WHERE id = ?", (inquiry_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Inquiry not found")

    inq = row_to_dict(row)
    inq_email = (inq.get("client_email") or "").strip().lower()

    is_admin = False
    is_owner = False

    if current_user:
        role = (current_user.get("role") or "").lower()
        caller_email = (current_user.get("email") or "").strip().lower()
        if role in AUTHORIZED_ADMIN_ROLES or caller_email in AUTHORIZED_ADMIN_EMAILS:
            is_admin = True
        if caller_email and caller_email == inq_email:
            is_owner = True
    elif client_email:
        if client_email.strip().lower() == inq_email:
            is_owner = True

    if not is_admin and not is_owner:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to delete this inquiry."
        )

    cursor.execute("DELETE FROM inquiries WHERE id = ?", (inquiry_id,))
    conn.commit()
    conn.close()

    return {"success": True, "message": f"Inquiry #{inquiry_id} successfully deleted"}


@router.post("/api/inquiries/{inquiry_id}/cancel", tags=["Inquiries"])
def cancel_inquiry(
    inquiry_id: int,
    payload: Optional[dict] = None,
    current_user: Optional[dict] = Depends(get_current_user_from_request)
):
    """
    Cancels an inquiry by setting its status to 'Cancelled'.
    """
    data = {"status": "Cancelled"}
    if payload and "client_email" in payload:
        data["client_email"] = payload["client_email"]
    return modify_inquiry(inquiry_id, data, current_user)
