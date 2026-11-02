"""
UrbanScope - Client & Admin Inquiry Lifecycle Router
Handles inquiry submission, admin listing, client history, modifications, cancellations, and notifications.
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

    # Record notification for admin on new inquiry submission
    code = f"INQ-2026-{str(inq_id).zfill(3)}"
    cursor.execute("""
        INSERT INTO notifications (recipient_role, recipient_email, type, inquiry_id, property_title, client_name, title, message, is_read, is_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    """, (
        "admin",
        "admin.realestate@gmail.com",
        "new_inquiry",
        inq_id,
        payload.property_title or "General Inquiry",
        payload.client_name.strip(),
        f"New inquiry submitted by {payload.client_name.strip()}",
        f"{payload.client_name.strip()} submitted inquiry {code}."
    ))
    conn.commit()

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

    current_status = (inq.get("status") or "Under Review").strip().lower()
    requested_status = str(payload.get("status")).strip() if ("status" in payload and payload["status"] is not None) else None
    is_cancelling = bool(requested_status and requested_status.lower() == "cancelled")

    # Clients can only modify details when the inquiry is still Under Review / Pending
    if not is_admin and not is_cancelling:
        has_detail_edits = any(
            k in payload and payload[k] is not None
            for k in ("message", "client_phone", "property_title")
        )
        if has_detail_edits and current_status not in ("under review", "pending", ""):
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Approved or processed inquiries can no longer be modified."
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

    if requested_status is not None:
        if not is_admin and requested_status not in ["Cancelled", "Under Review"]:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Clients can only cancel an inquiry."
            )
        updates.append("status = ?")
        params.append(requested_status)

    if not updates:
        conn.close()
        return {"success": True, "data": inq, "message": "No fields to update."}

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(inquiry_id)
    cursor.execute(f"UPDATE inquiries SET {', '.join(updates)} WHERE id = ?", tuple(params))

    cursor.execute("SELECT * FROM inquiries WHERE id = ?", (inquiry_id,))
    updated_inq = row_to_dict(cursor.fetchone())

    # Record notifications on status transitions
    prop_title = (updated_inq.get("property_title") or "General Inquiry").strip()
    client_name = (updated_inq.get("client_name") or "Client").strip()
    code = f"INQ-2026-{str(inquiry_id).zfill(3)}"

    if requested_status and requested_status.lower() == "cancelled" and current_status != "cancelled":
        cursor.execute("""
            INSERT INTO notifications (recipient_role, recipient_email, type, inquiry_id, property_title, client_name, title, message, is_read, is_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
        """, (
            "admin",
            "admin.realestate@gmail.com",
            "cancelled",
            inquiry_id,
            prop_title,
            client_name,
            f"Inquiry {code} cancelled by {client_name}",
            f"{client_name} cancelled their inquiry for {prop_title}."
        ))
    elif requested_status and requested_status.lower() == "approved" and current_status != "approved":
        cursor.execute("""
            INSERT INTO notifications (recipient_role, recipient_email, type, inquiry_id, property_title, client_name, title, message, is_read, is_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
        """, (
            "client",
            inq_email,
            "approved",
            inquiry_id,
            prop_title,
            client_name,
            f"Inquiry {code} Approved!",
            f"Your inquiry for \"{prop_title}\" has been approved by Miriam Lobren!"
        ))
        # Mark admin's inquiry notification as read and seen upon approval
        cursor.execute("""
            UPDATE notifications SET is_read = 1, is_seen = 1
            WHERE inquiry_id = ? AND LOWER(recipient_role) = 'admin'
        """, (inquiry_id,))

    conn.commit()
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

    prop_title = (inq.get("property_title") or "General Inquiry").strip()
    client_name = (inq.get("client_name") or "Client").strip()
    code = f"INQ-2026-{str(inquiry_id).zfill(3)}"

    cursor.execute("DELETE FROM inquiries WHERE id = ?", (inquiry_id,))

    # Notify admin when a client deletes/cancels their inquiry
    if not is_admin:
        cursor.execute("""
            INSERT INTO notifications (recipient_role, recipient_email, type, inquiry_id, property_title, client_name, title, message, is_read, is_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
        """, (
            "admin",
            "admin.realestate@gmail.com",
            "cancelled",
            inquiry_id,
            prop_title,
            client_name,
            f"Inquiry {code} cancelled by {client_name}",
            f"{client_name} cancelled and removed their inquiry for {prop_title}."
        ))

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


@router.get("/api/notifications", tags=["Notifications"])
def list_notifications(
    role: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    current_user: Optional[dict] = Depends(get_current_user_from_request)
):
    """
    Lists notifications for either administrators (role='admin') or a specific client email.
    Auto-synchronizes notification records for approved inquiries.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    target_role = (role or "").strip().lower()
    target_email = (email or (current_user.get("email") if current_user else "") or "").strip().lower()

    if target_role == "admin":
        cursor.execute(
            "SELECT * FROM notifications WHERE LOWER(recipient_role) = 'admin' ORDER BY id DESC LIMIT 50"
        )
    elif target_email:
        # Ensure any approved inquiries for this email have a corresponding notification row
        cursor.execute(
            "SELECT id, property_title, client_name, updated_at, created_at FROM inquiries "
            "WHERE LOWER(client_email) = ? AND LOWER(status) IN ('approved', 'scheduled')",
            (target_email,)
        )
        approved_inqs = cursor.fetchall()
        for inq_row in approved_inqs:
            inq_id, prop_t, c_name, u_at, c_at = inq_row
            prop_t = (prop_t or "General Inquiry").strip()
            c_name = (c_name or "Client").strip()
            cursor.execute(
                "SELECT id FROM notifications WHERE inquiry_id = ? AND LOWER(recipient_email) = ? AND type = 'approved'",
                (inq_id, target_email)
            )
            if not cursor.fetchone():
                code = f"INQ-2026-{str(inq_id).zfill(3)}"
                cursor.execute("""
                    INSERT INTO notifications (recipient_role, recipient_email, type, inquiry_id, property_title, client_name, title, message, is_read, is_seen)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
                """, (
                    "client",
                    target_email,
                    "approved",
                    inq_id,
                    prop_t,
                    c_name,
                    f"Inquiry {code} Approved!",
                    f"Your inquiry for \"{prop_t}\" has been approved by Miriam Lobren!"
                ))
        conn.commit()

        cursor.execute(
            "SELECT * FROM notifications WHERE LOWER(recipient_email) = ? ORDER BY id DESC LIMIT 50",
            (target_email,)
        )
    else:
        conn.close()
        return []

    rows = cursor.fetchall()
    notifs = [row_to_dict(r) for r in rows]
    conn.close()
    return notifs


@router.post("/api/notifications/read", tags=["Notifications"])
def mark_notifications_read(
    payload: Optional[dict] = None,
    current_user: Optional[dict] = Depends(get_current_user_from_request)
):
    """
    Marks notifications as read and seen for admin, a specific client email, or single inquiry.
    """
    data = payload or {}
    target_role = str(data.get("role") or "").strip().lower()
    target_email = str(data.get("email") or (current_user.get("email") if current_user else "") or "").strip().lower()
    notif_id = data.get("id") or data.get("notif_id")
    inquiry_id = data.get("inquiry_id") or data.get("inquiryId")

    conn = get_db_connection()
    cursor = conn.cursor()
    if target_role == "admin":
        cursor.execute("UPDATE notifications SET is_read = 1, is_seen = 1 WHERE LOWER(recipient_role) = 'admin'")
    elif notif_id:
        cursor.execute("UPDATE notifications SET is_read = 1, is_seen = 1 WHERE id = ?", (notif_id,))
    elif inquiry_id and target_email:
        cursor.execute("UPDATE notifications SET is_read = 1, is_seen = 1 WHERE LOWER(recipient_email) = ? AND inquiry_id = ?", (target_email, inquiry_id))
    elif target_email:
        cursor.execute("UPDATE notifications SET is_read = 1, is_seen = 1 WHERE LOWER(recipient_email) = ?", (target_email,))
    conn.commit()
    conn.close()
    return {"success": True}


@router.post("/api/notifications/seen", tags=["Notifications"])
def mark_notifications_seen(
    payload: Optional[dict] = None,
    current_user: Optional[dict] = Depends(get_current_user_from_request)
):
    """
    Marks notifications as seen (toasted/presented to user) so they won't notify again on other devices.
    """
    data = payload or {}
    target_role = str(data.get("role") or "").strip().lower()
    target_email = str(data.get("email") or (current_user.get("email") if current_user else "") or "").strip().lower()
    notif_id = data.get("id") or data.get("notif_id")
    inquiry_id = data.get("inquiry_id") or data.get("inquiryId")

    conn = get_db_connection()
    cursor = conn.cursor()
    if target_role == "admin":
        cursor.execute("UPDATE notifications SET is_seen = 1 WHERE LOWER(recipient_role) = 'admin'")
    elif notif_id:
        cursor.execute("UPDATE notifications SET is_seen = 1 WHERE id = ?", (notif_id,))
    elif inquiry_id and target_email:
        cursor.execute("UPDATE notifications SET is_seen = 1 WHERE LOWER(recipient_email) = ? AND inquiry_id = ?", (target_email, inquiry_id))
    elif target_email:
        cursor.execute("UPDATE notifications SET is_seen = 1 WHERE LOWER(recipient_email) = ?", (target_email,))
    conn.commit()
    conn.close()
    return {"success": True}
