import { isAuthorizedAdminRole, readAdminSession } from '../lib/admin-session.js';
import { parseJsonBody, sendEmailWithFallback } from '../lib/email-auth.js';
import {
    checkRateLimit,
    escapePostgrestFilterValue,
    getClientIp,
    getServiceRoleKey,
    isStrictSameOrigin,
    isValidEmail,
    isValidInquiryStatus,
    jsonWithCookies,
    normalizeAccountRole,
    normalizeEmail,
    readUserSession,
    restUrl,
    serviceHeaders,
    verifyBotDefense,
    verifyCsrfIfAuthenticated
} from '../lib/server-security.js';

async function fetchRowsByNormalizedEmail(table, col, targetEmail, extraQuery = {}) {
    const cleanEmail = normalizeEmail(targetEmail);
    if (!cleanEmail) return { ok: true, status: 200, rows: [] };

    const escaped = escapePostgrestFilterValue(cleanEmail);
    const useDirectIlike = Boolean(escaped && escaped === cleanEmail);
    const query = {
        ...extraQuery,
        [col]: useDirectIlike ? `ilike.${escaped}` : `eq.${cleanEmail}`
    };
    if (query.select && query.select !== '*') {
        const parts = String(query.select).split(',').map((s) => s.trim()).filter(Boolean);
        if (!parts.includes(col)) query.select = [...parts, col].join(',');
    }

    const res = await fetch(restUrl(table, query), {
        headers: serviceHeaders({}, true)
    }).catch(() => null);
    if (!res) return { ok: false, status: 502, rows: [] };
    if (!res.ok) return { ok: false, status: res.status, rows: [] };

    const rawRows = await res.json().catch(() => []);
    const matched = (Array.isArray(rawRows) ? rawRows : []).filter(
        (row) => row && normalizeEmail(row[col]) === cleanEmail
    );
    if (matched.length > 0 || useDirectIlike || !escaped) {
        return { ok: true, status: 200, rows: matched };
    }

    const fallbackQuery = { ...query, [col]: `ilike.${escaped}` };
    const fallbackRes = await fetch(restUrl(table, fallbackQuery), {
        headers: serviceHeaders({}, true)
    }).catch(() => null);
    if (!fallbackRes || !fallbackRes.ok) {
        return { ok: true, status: 200, rows: [] };
    }
    const fallbackRows = await fallbackRes.json().catch(() => []);
    return {
        ok: true,
        status: 200,
        rows: (Array.isArray(fallbackRows) ? fallbackRows : []).filter(
            (row) => row && normalizeEmail(row[col]) === cleanEmail
        )
    };
}

function resolveSession(req) {
    const admin = readAdminSession(req);
    const user = readUserSession(req);
    const primary = admin || user;
    if (!primary) return null;
    const email = normalizeEmail(primary.email);
    const role = normalizeAccountRole(primary.role, email);
    const isStaff = (role === 'admin' || role === 'superadmin') && isAuthorizedAdminRole(email, role);
    return { id: primary.id, email, role, isStaff };
}

async function fetchInquiryById(id) {
    const res = await fetch(restUrl('inquiries', { id: `eq.${id}`, limit: '1' }), {
        headers: serviceHeaders({}, true)
    });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function escapeHtmlText(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const OPTIONAL_NOTIFICATION_COLS = ['is_seen', 'client_name', 'property_title', 'inquiry_id', 'type', 'recipient_role'];

async function insertNotificationSafe(payload, prefer = 'return=representation') {
    const candidate = { ...(payload || {}) };
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const res = await fetch(restUrl('notifications'), {
            method: 'POST',
            headers: serviceHeaders(prefer ? { Prefer: prefer } : {}, true),
            body: JSON.stringify(candidate)
        }).catch(() => null);
        if (!res) return null;
        if (res.ok) {
            const rows = await res.json().catch(() => []);
            return Array.isArray(rows) ? (rows[0] || candidate) : candidate;
        }
        if (res.status !== 400) return null;
        const errText = await res.text().catch(() => '');
        const colMatch = errText.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);
        const missingCol = colMatch?.[1];
        if (missingCol && OPTIONAL_NOTIFICATION_COLS.includes(missingCol) && Object.prototype.hasOwnProperty.call(candidate, missingCol)) {
            delete candidate[missingCol];
            continue;
        }
        return null;
    }
    return null;
}

async function sendApprovalEmailBestEffort({ email, code, propertyTitle, clientName }) {
    if (!email) return;
    const safeName = String(clientName || 'Client').trim() || 'Client';
    const safeProp = String(propertyTitle || 'General Inquiry').trim() || 'General Inquiry';
    const sendPromise = sendEmailWithFallback({
        to: email,
        subject: `Inquiry ${code} Approved - Miriam Lobren / UrbanScope`,
        text: `Hi ${safeName},\n\nGood news! Your inquiry (${code}) for "${safeProp}" has been approved by Miriam Lobren.\nView details anytime in your UrbanScope Inquiry History: https://miriamlobren.site/pages/inquiry/history.html\n`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#20352a"><h2 style="color:#1e5c33">UrbanScope &mdash; Inquiry Approved</h2><p>Hi ${escapeHtmlText(safeName)},</p><p>Good news! Your inquiry (<strong>${escapeHtmlText(code)}</strong>) for <strong>${escapeHtmlText(safeProp)}</strong> has been approved by Miriam Lobren.</p><p><a href="https://miriamlobren.site/pages/inquiry/history.html" style="display:inline-block;padding:10px 18px;background:#1e5c33;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">View Inquiry History</a></p></div>`
    }).catch(() => null);
    let timerId;
    const timeoutPromise = new Promise((resolve) => {
        timerId = setTimeout(resolve, 2500);
    });
    await Promise.race([sendPromise, timeoutPromise]).finally(() => {
        if (timerId) clearTimeout(timerId);
    });
}

async function notifyAdminCancelled(inquiry) {
    const code = `INQ-2026-${String(inquiry.id).padStart(3, '0')}`;
    const clientName = String(inquiry.client_name || 'Client').trim();
    const propTitle = String(inquiry.property_title || 'General Inquiry').trim();
    await insertNotificationSafe({
        recipient_role: 'admin',
        recipient_email: 'miriamalobren@gmail.com',
        type: 'cancelled',
        inquiry_id: inquiry.id,
        property_title: propTitle,
        client_name: clientName,
        title: `Inquiry ${code} cancelled by ${clientName}`,
        message: `${clientName} cancelled their inquiry for ${propTitle}.`,
        is_read: false,
        is_seen: false
    }, 'return=minimal');
}

async function ensureClientApprovalNotifications(clientEmail, approvedInquiries, prefetchedNotifications = null) {
    if (!approvedInquiries.length) return [];
    let existingRows = Array.isArray(prefetchedNotifications)
        ? prefetchedNotifications.filter((n) => String(n && n.type ? n.type : '').toLowerCase() === 'approved')
        : null;
    if (!existingRows) {
        const existingResult = await fetchRowsByNormalizedEmail('notifications', 'recipient_email', clientEmail, {
            type: 'eq.approved',
            select: 'inquiry_id,recipient_email'
        }).catch(() => ({ ok: false, rows: [] }));
        existingRows = existingResult.ok ? existingResult.rows : [];
    }
    const seenIds = new Set(existingRows.map((n) => String(n.inquiry_id)));

    const missing = approvedInquiries.filter((inq) => !seenIds.has(String(inq.id)));
    if (!missing.length) return [];

    const createdResults = await Promise.all(missing.map(async (inq) => {
        const code = `INQ-2026-${String(inq.id).padStart(3, '0')}`;
        const propTitle = String(inq.property_title || 'General Inquiry').trim();
        const payload = {
            recipient_role: 'client',
            recipient_email: clientEmail,
            type: 'approved',
            inquiry_id: inq.id,
            property_title: propTitle,
            client_name: String(inq.client_name || 'Client').trim(),
            title: `Inquiry ${code} Approved!`,
            message: `Your inquiry for "${propTitle}" has been approved by Miriam Lobren!`,
            is_read: false,
            is_seen: false
        };
        const created = await insertNotificationSafe(payload, 'return=representation');
        return created || payload;
    }));

    return createdResults.filter(Boolean);
}

export default async function handler(req, res) {
    if (!getServiceRoleKey()) {
        return jsonWithCookies({ success: false, error: 'Server database credentials are not configured.' }, 503, res);
    }

    const reqUrl = new URL(req.url, 'https://urbanscope.local');
    const queryAction = String(reqUrl.searchParams.get('action') || '').trim().toLowerCase();

    if (req.method === 'GET') {
        const session = resolveSession(req);
        if (!session) {
            return jsonWithCookies({ success: false, error: 'Authentication required.' }, 401, res);
        }

        if (queryAction === 'all') {
            if (!session.isStaff) {
                return jsonWithCookies({ success: false, error: 'Administrator privileges required.' }, 403, res);
            }
            const r = await fetch(restUrl('inquiries', { select: '*', order: 'created_at.desc' }), {
                headers: serviceHeaders({}, true)
            });
            if (!r.ok) return jsonWithCookies({ success: false, error: 'Failed to load inquiries.' }, 502, res);
            const data = await r.json().catch(() => []);
            return jsonWithCookies({ success: true, data: Array.isArray(data) ? data : [] }, 200, res);
        }

        if (queryAction === 'my') {
            const requestedEmail = normalizeEmail(reqUrl.searchParams.get('email') || '');
            if (requestedEmail && requestedEmail !== session.email && !session.isStaff) {
                return jsonWithCookies({ success: false, error: 'Forbidden: cannot access another client history.' }, 403, res);
            }
            const targetEmail = (requestedEmail && session.isStaff) ? requestedEmail : session.email;
            const myResult = await fetchRowsByNormalizedEmail('inquiries', 'client_email', targetEmail, {
                select: '*',
                order: 'created_at.desc'
            });
            if (!myResult.ok) return jsonWithCookies({ success: false, error: 'Failed to load inquiry history.' }, 502, res);
            return jsonWithCookies({ success: true, data: myResult.rows }, 200, res);
        }

        if (queryAction === 'notifications') {
            const requestedRole = String(reqUrl.searchParams.get('role') || '').trim().toLowerCase();
            const requestedEmail = normalizeEmail(reqUrl.searchParams.get('email') || '');

            if (requestedRole === 'admin' && !session.isStaff) {
                return jsonWithCookies({ success: false, error: 'Admin role required.' }, 403, res);
            }
            if (requestedEmail && requestedEmail !== session.email && !session.isStaff) {
                return jsonWithCookies({ success: false, error: 'Cannot view another client notifications.' }, 403, res);
            }

            if (requestedRole === 'admin' && session.isStaff) {
                const r = await fetch(restUrl('notifications', {
                    recipient_role: 'eq.admin',
                    order: 'id.desc',
                    limit: '50'
                }), { headers: serviceHeaders({}, true) });
                const rows = r.ok ? await r.json().catch(() => []) : [];
                return jsonWithCookies({ success: true, data: Array.isArray(rows) ? rows : [] }, 200, res);
            }

            const targetEmail = (requestedEmail && session.isStaff) ? requestedEmail : session.email;
            const [inqResult, notifResult] = await Promise.all([
                fetchRowsByNormalizedEmail('inquiries', 'client_email', targetEmail, {
                    select: '*',
                    order: 'id.desc'
                }).catch(() => ({ ok: false, rows: [] })),
                fetchRowsByNormalizedEmail('notifications', 'recipient_email', targetEmail, {
                    order: 'id.desc',
                    limit: '50'
                }).catch(() => ({ ok: false, rows: [] }))
            ]);

            let rows = notifResult.ok ? notifResult.rows : [];
            if (inqResult.ok && inqResult.rows.length > 0) {
                const approved = inqResult.rows.filter((item) => {
                    const st = String(item.status || '').toLowerCase();
                    return st === 'approved' || st === 'scheduled';
                });
                if (approved.length > 0) {
                    const created = await ensureClientApprovalNotifications(
                        targetEmail,
                        approved,
                        notifResult.ok ? rows : null
                    );
                    if (created.length > 0) {
                        rows = [...created, ...rows].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
                    }
                }
            }

            return jsonWithCookies({
                success: true,
                data: rows,
                inquiries: inqResult.ok ? inqResult.rows : []
            }, 200, res);
        }

        if (queryAction === 'appointments') {
            const requestedEmail = normalizeEmail(reqUrl.searchParams.get('email') || '');
            if (requestedEmail && requestedEmail !== session.email && !session.isStaff) {
                return jsonWithCookies({ success: false, error: 'Forbidden.' }, 403, res);
            }
            if (!requestedEmail && !session.isStaff) {
                const r = await fetch(restUrl('appointments', {
                    client_email: `eq.${session.email}`,
                    order: 'created_at.desc'
                }), { headers: serviceHeaders({}, true) });
                const rows = r.ok ? await r.json().catch(() => []) : [];
                return jsonWithCookies({ success: true, data: Array.isArray(rows) ? rows : [] }, 200, res);
            }
            const query = requestedEmail
                ? { client_email: `eq.${requestedEmail}`, order: 'created_at.desc' }
                : { order: 'created_at.desc' };
            const r = await fetch(restUrl('appointments', query), { headers: serviceHeaders({}, true) });
            const rows = r.ok ? await r.json().catch(() => []) : [];
            return jsonWithCookies({ success: true, data: Array.isArray(rows) ? rows : [] }, 200, res);
        }

        return jsonWithCookies({ success: false, error: 'Unsupported inquiry GET action.' }, 400, res);
    }

    if (req.method !== 'POST') {
        return jsonWithCookies({ success: false, error: 'Method not allowed.' }, 405, res);
    }

    if (!isStrictSameOrigin(req)) {
        return jsonWithCookies({ success: false, error: 'This request is not allowed.' }, 403, res);
    }

    const body = await parseJsonBody(req);
    const rawAction = String(body.action || queryAction || '').trim().toLowerCase();
    const action = rawAction || (body.inquiry_id === undefined && body.id === undefined && !body.mode ? 'create' : '');
    const ip = getClientIp(req);

    if (action === 'create') {
        const clientName = String(body.client_name || body.name || '').trim();
        const clientEmail = normalizeEmail(body.client_email || body.email || '');
        const clientPhone = String(body.client_phone || body.phone || '').trim();
        const propertyTitle = String(body.property_title || 'General Inquiry').trim();
        const message = String(body.message || '').trim();

        if (clientName.length < 2 || clientName.length > 120 || !isValidEmail(clientEmail) || clientPhone.length > 40 || propertyTitle.length < 1 || propertyTitle.length > 250 || message.length < 3 || message.length > 4000) {
            return jsonWithCookies({ success: false, error: 'Please complete all required inquiry fields cleanly.' }, 400, res);
        }

        const lookupTitle = propertyTitle.replace(/^specific\s+property\s+inquiry\s*:\s*/i, '').trim();
        const isGeneralLookup = !lookupTitle || /^general\s+(?:inquiry|consultation)/i.test(lookupTitle);

        const [allowed, botCheck, propRes] = await Promise.all([
            checkRateLimit({ key: `inq_create:ip:${ip}`, limit: 8, windowSeconds: 300, blockSeconds: 600 }),
            verifyBotDefense(req, body),
            isGeneralLookup
                ? Promise.resolve(null)
                : fetch(restUrl('properties', { select: 'title,status' }), {
                    headers: serviceHeaders({}, true)
                }).catch(() => null)
        ]);

        if (!allowed) {
            return jsonWithCookies({ success: false, error: 'Too many inquiries submitted. Please try again shortly.' }, 429, res);
        }
        if (!botCheck.ok) {
            return jsonWithCookies({ success: false, error: botCheck.error || 'Submission rejected.' }, 400, res);
        }

        if (propRes && propRes.ok) {
            const props = await propRes.json().catch(() => []);
            const matched = (Array.isArray(props) ? props : []).find(
                (p) => String(p.title || '').trim().toLowerCase() === lookupTitle.toLowerCase()
            );
            if (matched) {
                const normStatus = String(matched.status || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
                if (normStatus === 'sold' || normStatus === 'sold out') {
                    return jsonWithCookies({ success: false, error: 'This property is sold out and is no longer accepting inquiries.' }, 409, res);
                }
            }
        }

        // Force initial status to 'Under Review' server-side
        const insertPayload = {
            property_title: propertyTitle,
            client_name: clientName,
            client_email: clientEmail,
            client_phone: clientPhone,
            message,
            status: 'Under Review'
        };
        if (body.property_id !== undefined && /^\d+$/.test(String(body.property_id))) {
            insertPayload.property_id = Number(body.property_id);
        }

        const createRes = await fetch(restUrl('inquiries'), {
            method: 'POST',
            headers: serviceHeaders({ Prefer: 'return=representation' }, true),
            body: JSON.stringify(insertPayload)
        });
        if (!createRes.ok) {
            return jsonWithCookies({ success: false, error: 'Unable to submit inquiry right now.' }, 502, res);
        }
        const inserted = await createRes.json().catch(() => []);
        const newInq = Array.isArray(inserted) ? inserted[0] : inserted;

        if (newInq?.id) {
            const code = `INQ-2026-${String(newInq.id).padStart(3, '0')}`;
            await fetch(restUrl('notifications'), {
                method: 'POST',
                headers: serviceHeaders({}, true),
                body: JSON.stringify({
                    recipient_role: 'admin',
                    recipient_email: 'miriamalobren@gmail.com',
                    type: 'new_inquiry',
                    inquiry_id: newInq.id,
                    property_title: propertyTitle,
                    client_name: clientName,
                    title: `New inquiry submitted by ${clientName}`,
                    message: `${clientName} submitted inquiry ${code}.`,
                    is_read: false,
                    is_seen: false
                })
            }).catch(() => {});
        }

        return jsonWithCookies({ success: true, data: newInq }, 200, res);
    }

    // All remaining POST actions require authenticated session + CSRF verification
    if (!verifyCsrfIfAuthenticated(req)) {
        return jsonWithCookies({ success: false, error: 'CSRF validation failed.' }, 403, res);
    }

    const session = resolveSession(req);
    if (!session) {
        return jsonWithCookies({ success: false, error: 'Authentication required.' }, 401, res);
    }

    if (action === 'mark-notifications') {
        const requestedRole = String(body.role || '').trim().toLowerCase();
        const requestedEmail = normalizeEmail(body.email || '');
        const notifId = body.id ?? body.notif_id;
        const inquiryId = body.inquiry_id ?? body.inquiryId;
        const rawInquiryIds = body.inquiry_ids ?? body.inquiryIds;
        const scopedInquiryIds = Array.isArray(rawInquiryIds)
            ? rawInquiryIds.map((v) => String(v || '').trim()).filter((v) => /^\d+$/.test(v))
            : [];
        const setSeenOnly = body.seenOnly === true || body.mode === 'seen';

        if (requestedRole === 'admin' && !session.isStaff) {
            return jsonWithCookies({ success: false, error: 'Admin access required.' }, 403, res);
        }
        if (requestedEmail && requestedEmail !== session.email && !session.isStaff) {
            return jsonWithCookies({ success: false, error: 'Cannot update another user notifications.' }, 403, res);
        }
        if (Array.isArray(rawInquiryIds) && scopedInquiryIds.length === 0) {
            return jsonWithCookies({ success: true }, 200, res);
        }

        const patchBody = JSON.stringify(setSeenOnly ? { is_seen: true } : { is_read: true, is_seen: true });
        const target = (requestedEmail && session.isStaff) ? requestedEmail : session.email;
        const escapedTarget = escapePostgrestFilterValue(target);
        const emailFilter = (escapedTarget && escapedTarget === target) ? `ilike.${escapedTarget}` : `eq.${target}`;

        let query = null;
        if (requestedRole === 'admin' && session.isStaff) {
            query = { recipient_role: 'eq.admin' };
        } else if (notifId !== undefined && /^\d+$/.test(String(notifId))) {
            query = session.isStaff
                ? { id: `eq.${notifId}` }
                : { id: `eq.${notifId}`, recipient_email: emailFilter };
        } else if (scopedInquiryIds.length > 0) {
            query = { inquiry_id: `in.(${scopedInquiryIds.join(',')})`, recipient_email: emailFilter };
        } else if (inquiryId !== undefined && /^\d+$/.test(String(inquiryId))) {
            query = { inquiry_id: `eq.${inquiryId}`, recipient_email: emailFilter };
        } else {
            query = { recipient_email: emailFilter };
        }

        await fetch(restUrl('notifications', query), {
            method: 'PATCH',
            headers: serviceHeaders({}, true),
            body: patchBody
        }).catch(() => {});

        return jsonWithCookies({ success: true }, 200, res);
    }

    const inquiryId = String(body.inquiry_id ?? body.id ?? '').trim();
    if (!/^\d+$/.test(inquiryId)) {
        return jsonWithCookies({ success: false, error: 'Valid inquiry ID is required.' }, 400, res);
    }

    const existing = await fetchInquiryById(inquiryId);
    if (!existing) {
        return jsonWithCookies({ success: false, error: 'Inquiry not found.' }, 404, res);
    }

    const ownerEmail = normalizeEmail(existing.client_email);
    const isOwner = Boolean(ownerEmail && ownerEmail === session.email);
    if (!session.isStaff && !isOwner) {
        return jsonWithCookies({ success: false, error: 'You are not authorized to modify this inquiry.' }, 403, res);
    }

    if (action === 'update-status') {
        if (!session.isStaff) {
            return jsonWithCookies({ success: false, error: 'Only administrators can update inquiry status.' }, 403, res);
        }
        const newStatus = String(body.status || '').trim();
        if (!isValidInquiryStatus(newStatus)) {
            return jsonWithCookies({ success: false, error: 'Invalid inquiry status value.' }, 400, res);
        }

        const updateRes = await fetch(restUrl('inquiries', { id: `eq.${inquiryId}` }), {
            method: 'PATCH',
            headers: serviceHeaders({ Prefer: 'return=representation' }, true),
            body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() })
        });
        if (!updateRes.ok) {
            return jsonWithCookies({ success: false, error: 'Unable to update inquiry status.' }, 502, res);
        }
        const rows = await updateRes.json().catch(() => []);
        const updated = Array.isArray(rows) ? rows[0] : { ...existing, status: newStatus };

        if (newStatus.toLowerCase() === 'approved' && ownerEmail) {
            const code = `INQ-2026-${String(inquiryId).padStart(3, '0')}`;
            const propTitle = updated.property_title || 'General Inquiry';
            const clientName = updated.client_name || 'Client';
            await Promise.all([
                insertNotificationSafe({
                    recipient_role: 'client',
                    recipient_email: ownerEmail,
                    type: 'approved',
                    inquiry_id: Number(inquiryId),
                    property_title: propTitle,
                    client_name: clientName,
                    title: `Inquiry ${code} Approved!`,
                    message: `Your inquiry for "${propTitle}" has been approved by Miriam Lobren!`,
                    is_read: false,
                    is_seen: false
                }, 'return=minimal'),
                fetch(restUrl('notifications', { inquiry_id: `eq.${inquiryId}`, recipient_role: 'eq.admin' }), {
                    method: 'PATCH',
                    headers: serviceHeaders({}, true),
                    body: JSON.stringify({ is_read: true, is_seen: true })
                }).catch(() => {}),
                sendApprovalEmailBestEffort({
                    email: ownerEmail,
                    code,
                    propertyTitle: propTitle,
                    clientName
                })
            ]);
        }

        return jsonWithCookies({ success: true, data: updated }, 200, res);
    }

    if (action === 'cancel-my') {
        const updateRes = await fetch(restUrl('inquiries', { id: `eq.${inquiryId}` }), {
            method: 'PATCH',
            headers: serviceHeaders({ Prefer: 'return=representation' }, true),
            body: JSON.stringify({ status: 'Cancelled', updated_at: new Date().toISOString() })
        });
        if (!updateRes.ok) {
            return jsonWithCookies({ success: false, error: 'Unable to cancel inquiry.' }, 502, res);
        }
        const rows = await updateRes.json().catch(() => []);
        const updated = Array.isArray(rows) ? rows[0] : { ...existing, status: 'Cancelled' };
        if (String(existing.status || '').toLowerCase() !== 'cancelled') {
            await notifyAdminCancelled(updated);
        }
        return jsonWithCookies({ success: true, data: updated }, 200, res);
    }

    if (action === 'update-my') {
        const curStatus = String(existing.status || 'Under Review').toLowerCase();
        if (!session.isStaff && !['under review', 'pending', ''].includes(curStatus)) {
            return jsonWithCookies({ success: false, error: 'Approved or processed inquiries can no longer be modified.' }, 400, res);
        }

        const patch = { updated_at: new Date().toISOString() };
        if (body.message !== undefined) {
            const cleanMsg = String(body.message).trim();
            if (!cleanMsg || cleanMsg.length > 4000) {
                return jsonWithCookies({ success: false, error: 'Message must be between 1 and 4000 characters.' }, 400, res);
            }
            patch.message = cleanMsg;
        }
        if (body.client_phone !== undefined) {
            const cleanPhone = String(body.client_phone).trim();
            if (cleanPhone.length > 40) {
                return jsonWithCookies({ success: false, error: 'Phone number is too long.' }, 400, res);
            }
            patch.client_phone = cleanPhone;
        }
        if (body.property_title !== undefined) {
            const cleanTitle = String(body.property_title).trim();
            if (!cleanTitle || cleanTitle.length > 250) {
                return jsonWithCookies({ success: false, error: 'Property title must be between 1 and 250 characters.' }, 400, res);
            }
            patch.property_title = cleanTitle;
        }
        if (body.status !== undefined) {
            const reqStatus = String(body.status).trim();
            if (!session.isStaff) {
                if (reqStatus !== 'Cancelled') {
                    return jsonWithCookies({ success: false, error: 'Clients can only cancel an inquiry.' }, 400, res);
                }
            } else if (!isValidInquiryStatus(reqStatus)) {
                return jsonWithCookies({ success: false, error: 'Invalid status value.' }, 400, res);
            }
            patch.status = reqStatus;
        }

        const updateRes = await fetch(restUrl('inquiries', { id: `eq.${inquiryId}` }), {
            method: 'PATCH',
            headers: serviceHeaders({ Prefer: 'return=representation' }, true),
            body: JSON.stringify(patch)
        });
        if (!updateRes.ok) {
            return jsonWithCookies({ success: false, error: 'Unable to update inquiry.' }, 502, res);
        }
        const rows = await updateRes.json().catch(() => []);
        const updated = Array.isArray(rows) ? rows[0] : { ...existing, ...patch };
        if (patch.status === 'Cancelled' && curStatus !== 'cancelled') {
            await notifyAdminCancelled(updated);
        }
        return jsonWithCookies({ success: true, data: updated }, 200, res);
    }

    if (action === 'delete-my') {
        const delRes = await fetch(restUrl('inquiries', { id: `eq.${inquiryId}` }), {
            method: 'DELETE',
            headers: serviceHeaders({}, true)
        });
        if (!delRes.ok) {
            return jsonWithCookies({ success: false, error: 'Unable to delete inquiry.' }, 502, res);
        }
        if (!session.isStaff) {
            await notifyAdminCancelled(existing);
        }
        return jsonWithCookies({ success: true, message: `Inquiry #${inquiryId} deleted.` }, 200, res);
    }

    return jsonWithCookies({ success: false, error: 'Unsupported inquiry POST action.' }, 400, res);
}

export { handler as fetch };
