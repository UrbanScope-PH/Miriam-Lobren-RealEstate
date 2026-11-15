"""
UrbanScope - Client & Admin Inquiry Lifecycle Router
Handles inquiry submission, admin listing, client history, modifications, cancellations, and notifications.
"""

import re
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status

from backend.auth import (
    AUTHORIZED_ADMIN_EMAILS,
    AUTHORIZED_ADMIN_ROLES,
    AUTHORIZED_SUPERADMIN_EMAILS,
    require_admin,
    require_user,
)
from backend.database import get_db_connection, row_to_dict
from backend.models import InquiryCreate, InquiryResponse
from backend.security import check_rate_limit, get_client_ip, verify_bot_defense

router = APIRouter()

_ALLOWED_ADMIN_STATUSES = {"Under Review", "Pending", "Approved", "Scheduled", "Contacted", "Completed", "Cancelled"}


def _is_staff_user(user: dict) -> bool:
    role = (user.get("role") or "").strip().lower()
    email = (user.get("email") or "").strip().lower()
    return (
        role in AUTHORIZED_ADMIN_ROLES
        or email in AUTHORIZED_ADMIN_EMAILS
        or email in AUTHORIZED_SUPERADMIN_EMAILS
    )


# ==========================================================
# INQUIRY ENDPOINTS
# ==========================================================

@router.post("/api/inquiries", tags=["Inquiries"])
def submit_inquiry(payload: InquiryCreate, request: Request):
    """Submits a new client inquiry (Public / Client)."""
    ip = get_client_ip(request)
    if not check_rate_limit(f"inq_create:ip:{ip}", limit=8, window_seconds=300, block_seconds=600):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many inquiry submissions. Please try again in a few minutes.",
        )

    honeypot = (
        getattr(payload, "company_website", None)
        or getattr(payload, "website", None)
        or getattr(payload, "hp", None)
    )
    rendered_ms = getattr(payload, "form_rendered_ms", None)
    if rendered_ms is None:
        rendered_ms = getattr(payload, "ft", None)
    ok, msg = verify_bot_defense(
        request,
        honeypot_val=honeypot,
        form_rendered_ms=rendered_ms,
        turnstile_token=getattr(payload, "turnstile_token", None),
    )
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg or "Submission blocked.")

    conn = get_db_connection()
    cursor = conn.cursor()

    property_title = (payload.property_title or "General Inquiry").strip()
    lookup_title = re.sub(
        r"^specific\s+property\s+inquiry\s*:\s*",
        "",
        property_title,
        flags=re.IGNORECASE,
    ).strip()
    cursor.execute(
        "SELECT status FROM properties WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) LIMIT 1",
        (lookup_title,)
    )
    matching_property = cursor.fetchone()
    if matching_property:
        property_status = " ".join(
            str(matching_property["status"] or "")
            .lower()
            .replace("_", " ")
            .replace("-", " ")
            .split()
        )
        if property_status in {"sold", "sold out"}:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This property is sold out and is no longer accepting inquiries."
            )

    # Always force initial inquiry status server-side to prevent status tampering
    forced_status = "Under Review"
    cursor.execute("""
        INSERT INTO inquiries (property_title, client_name, client_email, client_phone, message, status)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        property_title,
        payload.client_name.strip(),
        payload.client_email.strip().lower(),
        payload.client_phone.strip() if payload.client_phone else "",
        payload.message.strip(),
        forced_status,
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
        "miriamalobren@gmail.com",
        "new_inquiry",
        inq_id,
        property_title,
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
    current_user: dict = Depends(require_user)
):
    """
    Lists inquiries submitted by the authenticated client (or specified client email if admin).
    """
    caller_email = (current_user.get("email") or "").strip().lower()
    is_admin = _is_staff_user(current_user)
    requested_email = (email or "").strip().lower()

    if requested_email and requested_email != caller_email and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view another user's inquiries."
        )

    user_email = requested_email if (requested_email and is_admin) else caller_email
    if not user_email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required."
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
    payload: dict = Body(...),
    current_user: dict = Depends(require_user)
):
    """
    Modifies or cancels an inquiry.
    Authorized strictly for the authenticated client owner or authenticated administrators.
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
    caller_email = (current_user.get("email") or "").strip().lower()
    is_admin = _is_staff_user(current_user)
    is_owner = bool(caller_email and caller_email == inq_email)

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
        clean_msg = str(payload["message"]).strip()
        if not clean_msg or len(clean_msg) > 4000:
            conn.close()
            raise HTTPException(status_code=400, detail="Message must be between 1 and 4000 characters.")
        updates.append("message = ?")
        params.append(clean_msg)

    if "client_phone" in payload and payload["client_phone"] is not None:
        clean_phone = str(payload["client_phone"]).strip()
        if len(clean_phone) > 40:
            conn.close()
            raise HTTPException(status_code=400, detail="Phone number is too long.")
        updates.append("client_phone = ?")
        params.append(clean_phone)

    if "property_title" in payload and payload["property_title"] is not None:
        clean_title = str(payload["property_title"]).strip()
        if not clean_title or len(clean_title) > 250:
            conn.close()
            raise HTTPException(status_code=400, detail="Property title must be between 1 and 250 characters.")
        updates.append("property_title = ?")
        params.append(clean_title)

    if requested_status is not None:
        if not is_admin:
            if requested_status != "Cancelled":
                conn.close()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Clients can only cancel an inquiry."
                )
        elif requested_status not in _ALLOWED_ADMIN_STATUSES:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid inquiry status value."
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
            "miriamalobren@gmail.com",
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
    current_user: dict = Depends(require_user)
):
    """
    Deletes an inquiry permanently.
    Authorized strictly for the authenticated client owner or authenticated administrators.
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
    caller_email = (current_user.get("email") or "").strip().lower()
    is_admin = _is_staff_user(current_user)
    is_owner = bool(caller_email and caller_email == inq_email)

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
            "miriamalobren@gmail.com",
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
    current_user: dict = Depends(require_user)
):
    """
    Cancels an inquiry by setting its status to 'Cancelled'.
    """
    return modify_inquiry(inquiry_id, {"status": "Cancelled"}, current_user)


@router.get("/api/notifications", tags=["Notifications"])
def list_notifications(
    role: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    current_user: dict = Depends(require_user)
):
    """
    Lists notifications for either authenticated administrators (role='admin')
    or the currently authenticated client.
    """
    is_admin = _is_staff_user(current_user)
    caller_email = (current_user.get("email") or "").strip().lower()
    requested_role = (role or "").strip().lower()
    requested_email = (email or "").strip().lower()

    if requested_role == "admin" and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    if requested_email and requested_email != caller_email and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot view another user's notifications.")

    conn = get_db_connection()
    cursor = conn.cursor()

    target_role = requested_role if is_admin else "client"
    target_email = requested_email if (requested_email and is_admin) else caller_email

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


def _update_notification_flags(payload: Optional[dict], current_user: dict, *, set_read: bool) -> dict:
    is_admin = _is_staff_user(current_user)
    caller_email = (current_user.get("email") or "").strip().lower()
    data = payload or {}
    requested_role = str(data.get("role") or "").strip().lower()
    requested_email = str(data.get("email") or "").strip().lower()
    notif_id = data.get("id") or data.get("notif_id")
    inquiry_id = data.get("inquiry_id") or data.get("inquiryId")

    if requested_role == "admin" and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    if requested_email and requested_email != caller_email and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot update notifications for another user.")

    target_email = requested_email if (requested_email and is_admin) else caller_email
    set_clause = "is_read = 1, is_seen = 1" if set_read else "is_seen = 1"

    conn = get_db_connection()
    cursor = conn.cursor()
    if requested_role == "admin" and is_admin:
        cursor.execute(f"UPDATE notifications SET {set_clause} WHERE LOWER(recipient_role) = 'admin'")
    elif notif_id is not None:
        if is_admin:
            cursor.execute(f"UPDATE notifications SET {set_clause} WHERE id = ?", (notif_id,))
        else:
            cursor.execute(
                f"UPDATE notifications SET {set_clause} WHERE id = ? AND LOWER(recipient_email) = ?",
                (notif_id, caller_email),
            )
    elif inquiry_id is not None and target_email:
        cursor.execute(
            f"UPDATE notifications SET {set_clause} WHERE LOWER(recipient_email) = ? AND inquiry_id = ?",
            (target_email, inquiry_id),
        )
    elif target_email:
        cursor.execute(
            f"UPDATE notifications SET {set_clause} WHERE LOWER(recipient_email) = ?",
            (target_email,),
        )
    conn.commit()
    conn.close()
    return {"success": True}


@router.post("/api/notifications/read", tags=["Notifications"])
def mark_notifications_read(
    payload: Optional[dict] = None,
    current_user: dict = Depends(require_user)
):
    """Marks notifications as read and seen for the authenticated admin or client."""
    return _update_notification_flags(payload, current_user, set_read=True)


@router.post("/api/notifications/seen", tags=["Notifications"])
def mark_notifications_seen(
    payload: Optional[dict] = None,
    current_user: dict = Depends(require_user)
):
    """Marks notifications as seen so they won't toast repeatedly."""
    return _update_notification_flags(payload, current_user, set_read=False)
