import { isAuthorizedAdminRole, readAdminSession } from '../lib/admin-session.js';
import { parseJsonBody } from '../lib/email-auth.js';
import {
    checkRateLimit,
    getClientIp,
    getServiceRoleKey,
    isStrictSameOrigin,
    jsonWithCookies,
    restUrl,
    sanitizeImageUrl,
    serviceHeaders,
    verifyCsrfIfAuthenticated
} from '../lib/server-security.js';

const ALLOWED_PROPERTY_STATUSES = new Set(['Available', 'Sold', 'Reserved', 'Pre-Selling', 'Draft']);

function validatePropertyFields(raw, { requireAll = false } = {}) {
    const out = {};

    if (requireAll || raw.title !== undefined) {
        const title = String(raw.title || '').trim();
        if (title.length < 2 || title.length > 200) return { error: 'Title must be between 2 and 200 characters.' };
        out.title = title;
    }
    if (requireAll || raw.location !== undefined) {
        const location = String(raw.location || '').trim();
        if (location.length < 2 || location.length > 200) return { error: 'Location must be between 2 and 200 characters.' };
        out.location = location;
    }
    if (requireAll || raw.property_type !== undefined) {
        const propType = String(raw.property_type || '').trim();
        if (propType.length < 2 || propType.length > 100) return { error: 'Property type must be between 2 and 100 characters.' };
        out.property_type = propType;
    }
    if (requireAll || raw.price !== undefined) {
        const price = Number(raw.price);
        if (!Number.isFinite(price) || price < 0 || price > 10_000_000_000) return { error: 'Price must be a valid non-negative number.' };
        out.price = price;
    }

    const intBounds = [
        ['bedrooms', 0, 100],
        ['bathrooms', 0, 100],
        ['carports', 0, 50],
        ['storeys', 1, 150]
    ];
    for (const [key, minVal, maxVal] of intBounds) {
        if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
            const val = Number(raw[key]);
            if (!Number.isFinite(val) || val < minVal || val > maxVal) {
                return { error: `Invalid ${key} value.` };
            }
            out[key] = Math.trunc(val);
        }
    }

    for (const areaKey of ['lot_area', 'floor_area']) {
        if (raw[areaKey] !== undefined && raw[areaKey] !== null && raw[areaKey] !== '') {
            const val = Number(raw[areaKey]);
            if (!Number.isFinite(val) || val < 0 || val > 10_000_000) {
                return { error: `Invalid ${areaKey} value.` };
            }
            out[areaKey] = val;
        }
    }

    if (raw.status !== undefined) {
        const st = String(raw.status || '').trim();
        if (!ALLOWED_PROPERTY_STATUSES.has(st)) {
            return { error: 'Invalid property status.' };
        }
        out.status = st;
    } else if (requireAll) {
        out.status = 'Available';
    }

    if (raw.image_url !== undefined) {
        const imgCheck = sanitizeImageUrl(raw.image_url, { maxDataUrlBytes: 3 * 1024 * 1024, defaultValue: 'assets/images/placeholder-house.jpg' });
        if (!imgCheck.ok) return { error: imgCheck.error };
        out.image_url = imgCheck.value;
    } else if (requireAll) {
        out.image_url = 'assets/images/placeholder-house.jpg';
    }

    if (raw.description !== undefined) {
        out.description = String(raw.description || '').trim().slice(0, 5000);
    }
    if (raw.amenities !== undefined) {
        out.amenities = String(raw.amenities || '').trim().slice(0, 2000);
    }

    return { fields: out };
}

export default async function handler(req, res) {
    const reqUrl = new URL(req.url, 'https://urbanscope.local');
    const queryAction = String(reqUrl.searchParams.get('action') || '').trim().toLowerCase();

    if (req.method === 'GET') {
        if (queryAction === 'get') {
            const id = String(reqUrl.searchParams.get('id') || '').trim();
            if (!/^\d+$/.test(id)) return jsonWithCookies({ success: false, error: 'Invalid property ID.' }, 400, res);
            const r = await fetch(restUrl('properties', { id: `eq.${id}`, select: '*', limit: '1' }), {
                headers: serviceHeaders({}, false)
            });
            if (!r.ok) return jsonWithCookies({ success: false, error: 'Unable to fetch property.' }, 502, res);
            const rows = await r.json().catch(() => []);
            const prop = Array.isArray(rows) && rows[0] ? rows[0] : null;
            if (!prop) return jsonWithCookies({ success: false, error: 'Property listing not found.' }, 404, res);
            return jsonWithCookies({ success: true, data: prop }, 200, res);
        }

        const r = await fetch(restUrl('properties', { select: '*', order: 'created_at.desc' }), {
            headers: serviceHeaders({}, false)
        });
        if (!r.ok) return jsonWithCookies({ success: false, error: 'Unable to list properties.' }, 502, res);
        let rows = await r.json().catch(() => []);
        if (!Array.isArray(rows)) rows = [];

        const typeFilter = String(reqUrl.searchParams.get('type') || '').trim().toLowerCase();
        const locFilter = String(reqUrl.searchParams.get('location') || '').trim().toLowerCase();
        const searchFilter = String(reqUrl.searchParams.get('search') || '').trim().toLowerCase();

        if (typeFilter && typeFilter !== 'all') {
            rows = rows.filter((p) => String(p.property_type || '').toLowerCase().includes(typeFilter));
        }
        if (locFilter && locFilter !== 'all') {
            rows = rows.filter((p) => String(p.location || '').toLowerCase().includes(locFilter));
        }
        if (searchFilter) {
            rows = rows.filter((p) =>
                [p.title, p.location, p.property_type, p.description, p.amenities]
                    .some((v) => String(v || '').toLowerCase().includes(searchFilter))
            );
        }

        return jsonWithCookies({ success: true, data: rows }, 200, res);
    }

    if (req.method !== 'POST') {
        return jsonWithCookies({ success: false, error: 'Method not allowed.' }, 405, res);
    }

    if (!isStrictSameOrigin(req) || !verifyCsrfIfAuthenticated(req)) {
        return jsonWithCookies({ success: false, error: 'This request is not allowed.' }, 403, res);
    }

    const session = readAdminSession(req);
    if (!session || !isAuthorizedAdminRole(session.email, session.role)) {
        return jsonWithCookies({ success: false, error: 'Administrator privileges required.' }, 403, res);
    }

    if (!getServiceRoleKey()) {
        return jsonWithCookies({ success: false, error: 'Server database credentials are not configured.' }, 503, res);
    }

    const ip = getClientIp(req);
    if (!await checkRateLimit({ key: `props_admin:ip:${ip}`, limit: 40, windowSeconds: 300, blockSeconds: 300 })) {
        return jsonWithCookies({ success: false, error: 'Too many requests. Please slow down.' }, 429, res);
    }

    const body = await parseJsonBody(req);
    const action = String(body.action || queryAction || '').trim().toLowerCase();

    if (action === 'create') {
        const { fields, error } = validatePropertyFields(body.payload || body, { requireAll: true });
        if (error) return jsonWithCookies({ success: false, error }, 400, res);

        const r = await fetch(restUrl('properties'), {
            method: 'POST',
            headers: serviceHeaders({ Prefer: 'return=representation' }, true),
            body: JSON.stringify(fields)
        });
        if (!r.ok) return jsonWithCookies({ success: false, error: 'Failed to create property listing.' }, 502, res);
        const created = await r.json().catch(() => []);
        return jsonWithCookies({ success: true, data: Array.isArray(created) ? created[0] : created }, 200, res);
    }

    const id = String(body.id ?? body.property_id ?? '').trim();
    if (!/^\d+$/.test(id)) {
        return jsonWithCookies({ success: false, error: 'Valid property ID is required.' }, 400, res);
    }

    if (action === 'update') {
        const { fields, error } = validatePropertyFields(body.payload || body, { requireAll: false });
        if (error) return jsonWithCookies({ success: false, error }, 400, res);
        if (Object.keys(fields).length === 0) {
            return jsonWithCookies({ success: false, error: 'No valid property fields supplied.' }, 400, res);
        }

        const r = await fetch(restUrl('properties', { id: `eq.${id}` }), {
            method: 'PATCH',
            headers: serviceHeaders({ Prefer: 'return=representation' }, true),
            body: JSON.stringify(fields)
        });
        if (!r.ok) return jsonWithCookies({ success: false, error: 'Failed to update property listing.' }, 502, res);
        const updated = await r.json().catch(() => []);
        return jsonWithCookies({ success: true, data: Array.isArray(updated) ? updated[0] : updated }, 200, res);
    }

    if (action === 'delete') {
        const r = await fetch(restUrl('properties', { id: `eq.${id}` }), {
            method: 'DELETE',
            headers: serviceHeaders({}, true)
        });
        if (!r.ok) return jsonWithCookies({ success: false, error: 'Failed to delete property listing.' }, 502, res);
        return jsonWithCookies({ success: true, message: `Property #${id} deleted.` }, 200, res);
    }

    return jsonWithCookies({ success: false, error: 'Unsupported property action.' }, 400, res);
}

export { handler as fetch };

