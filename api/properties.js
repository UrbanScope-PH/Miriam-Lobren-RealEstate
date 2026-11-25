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
    verifyCsrfIfAuthenticated,
    verifyLiveAdminSession
} from '../lib/server-security.js';

const ALLOWED_PROPERTY_STATUSES = new Set(['Available', 'Sold', 'Reserved', 'Under Review', 'Pre-Selling', 'Draft']);

const CANONICAL_MIDORI_PROPERTY = {
    title: 'Midori Mid-Rise Condo – Zone 1',
    location: 'Zone 1, Buildings 14–21, Dasmariñas, Cavite',
    city: 'Dasmariñas City',
    province: 'Cavite',
    property_type: 'Mid-Rise Condominium',
    price: 3140000.0,
    bedrooms: 2,
    bathrooms: 1,
    lot_area: 0.0,
    floor_area: 50.0,
    carports: 0,
    storeys: 2,
    status: 'Available',
    image_url: 'assets/images/midori-main.webp',
    description: 'Midori Mid-Rise Condo – Zone 1 offers a convenient and comfortable living experience for young professionals, couples, and starting families looking for an affordable home in Dasmariñas, Cavite. Each 50 sqm unit features two bedrooms, a toilet and bath, a living area, a dining and kitchen area, and a patio, with Inner and End unit options.',
    amenities: '2nd Floor Units, Inner & End Unit Types, Living Area, Dining Area, Kitchen Area, Patio, Convenient Access to Public Transportation, Near Dasmariñas Bayan, Close to Schools and Essential Establishments, Accessible to Daily Needs'
};

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
    if (requireAll || raw.city !== undefined) {
        const locFallback = String(out.location || raw.location || '').trim();
        const derivedCity = String(
            raw.city || (locFallback.includes(',') ? locFallback.split(',')[0] : locFallback) || 'Cavite'
        ).trim().slice(0, 100);
        if (derivedCity.length < 1) return { error: 'City must not be empty.' };
        out.city = derivedCity;
    }
    if (requireAll || raw.province !== undefined) {
        const locFallback = String(out.location || raw.location || '').trim();
        const locSecond = locFallback.includes(',') ? locFallback.split(',').slice(1).join(',').trim() : '';
        const derivedProvince = String(raw.province || locSecond || 'Cavite').trim().slice(0, 100) || 'Cavite';
        out.province = derivedProvince;
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
        const imgCheck = sanitizeImageUrl(raw.image_url, { maxDataUrlBytes: 3 * 1024 * 1024, defaultValue: 'assets/images/property1.jpg' });
        if (!imgCheck.ok) return { error: imgCheck.error };
        out.image_url = imgCheck.value;
    } else if (requireAll) {
        out.image_url = 'assets/images/property1.jpg';
    }

    if (raw.description !== undefined) {
        out.description = String(raw.description || '').trim().slice(0, 5000);
    }
    if (raw.amenities !== undefined) {
        out.amenities = String(raw.amenities || '').trim().slice(0, 2000);
    }

    const rawGallery = Array.isArray(raw.gallery_images)
        ? raw.gallery_images
        : (Array.isArray(raw.images) ? raw.images : null);
    let galleryImages = [];
    if (rawGallery) {
        const seen = new Set();
        for (const candidate of rawGallery.slice(0, 10)) {
            const check = sanitizeImageUrl(candidate, { maxDataUrlBytes: 3 * 1024 * 1024, defaultValue: '' });
            if (!check.ok) return { error: check.error };
            if (check.value && !seen.has(check.value)) {
                seen.add(check.value);
                galleryImages.push(check.value);
            }
        }
        if (out.image_url === undefined && galleryImages.length > 0) {
            out.image_url = galleryImages[0];
        }
    }

    return { fields: out, galleryImages };
}

async function insertPropertySafe(rawFields) {
    const body = { ...rawFields };
    for (let attempt = 0; attempt < 6; attempt++) {
        const r = await fetch(restUrl('properties'), {
            method: 'POST',
            headers: serviceHeaders({ Prefer: 'return=representation' }, true),
            body: JSON.stringify(body)
        });
        if (r.ok) {
            const created = await r.json().catch(() => []);
            return { ok: true, data: Array.isArray(created) ? created[0] : created };
        }
        const errText = await r.text().catch(() => '');
        let errJson = {};
        try { errJson = JSON.parse(errText); } catch (_) {}
        const msg = String(errJson.message || errJson.details || errText || '');
        const pgrstMatch = msg.match(/Could not find the '([a-zA-Z0-9_]+)' column/i) || msg.match(/column "([a-zA-Z0-9_]+)" of relation/i);
        const missingCol = pgrstMatch ? pgrstMatch[1] : null;
        if (missingCol && missingCol in body && !['title', 'location', 'property_type', 'price'].includes(missingCol)) {
            delete body[missingCol];
            continue;
        }
        console.error('[properties/create] Supabase insert failed:', r.status, msg);
        const clientStatus = r.status >= 400 && r.status < 500 ? 400 : 502;
        return {
            ok: false,
            status: clientStatus,
            error: errJson.message || errJson.hint || 'Failed to create property listing.'
        };
    }
    return { ok: false, status: 502, error: 'Failed to create property listing.' };
}

export default async function handler(req, res) {
    const reqUrl = new URL(req.url, 'https://urbanscope.local');
    const queryAction = String(reqUrl.searchParams.get('action') || '').trim().toLowerCase();

    if (req.method === 'GET') {
        if (queryAction === 'get') {
            const id = String(reqUrl.searchParams.get('id') || '').trim();
            if (!/^\d+$/.test(id)) return jsonWithCookies({ success: false, error: 'Invalid property ID.' }, 400, res);
            const [r, imgRes] = await Promise.all([
                fetch(restUrl('properties', { id: `eq.${id}`, select: '*', limit: '1' }), {
                    headers: serviceHeaders({}, false)
                }),
                fetch(restUrl('property_images', { property_id: `eq.${id}`, select: 'image_url,display_order', order: 'display_order.asc' }), {
                    headers: serviceHeaders({}, false)
                }).catch(() => null)
            ]);
            if (!r.ok) return jsonWithCookies({ success: false, error: 'Unable to fetch property.' }, 502, res);
            const rows = await r.json().catch(() => []);
            const prop = Array.isArray(rows) && rows[0] ? rows[0] : null;
            if (!prop) return jsonWithCookies({ success: false, error: 'Property listing not found.' }, 404, res);
            if (imgRes && imgRes.ok) {
                const imgs = await imgRes.json().catch(() => []);
                if (Array.isArray(imgs) && imgs.length > 0) {
                    prop.gallery_images = imgs.map((i) => i?.image_url).filter(Boolean);
                }
            }
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

    if (!getServiceRoleKey()) {
        return jsonWithCookies({ success: false, error: 'Server database credentials are not configured.' }, 503, res);
    }

    const adminCheck = await verifyLiveAdminSession(req);
    if (!adminCheck.ok) {
        return jsonWithCookies(
            { success: false, error: adminCheck.error || 'Administrator privileges required.' },
            adminCheck.status === 503 ? 503 : 403,
            res,
            adminCheck.clearCookies?.length ? { cookies: adminCheck.clearCookies } : undefined
        );
    }

    const ip = getClientIp(req);
    if (!await checkRateLimit({ key: `props_admin:ip:${ip}`, limit: 40, windowSeconds: 300, blockSeconds: 300 })) {
        return jsonWithCookies({ success: false, error: 'Too many requests. Please slow down.' }, 429, res);
    }

    const body = await parseJsonBody(req);
    const action = String(body.action || queryAction || '').trim().toLowerCase();

    if (action === 'sync_accredited') {
        const listRes = await fetch(restUrl('properties', { select: 'id,title', limit: '200' }), {
            headers: serviceHeaders({}, false)
        });
        if (!listRes.ok) {
            return jsonWithCookies({ success: false, error: 'Unable to inspect property catalog.' }, 502, res);
        }
        const existingRows = await listRes.json().catch(() => []);
        const rowsList = Array.isArray(existingRows) ? existingRows : [];
        let createdMidori = null;

        const hasMidori = rowsList.some((p) => String(p?.title || '').toLowerCase().includes('midori'));
        if (!hasMidori) {
            const insertRes = await fetch(restUrl('properties'), {
                method: 'POST',
                headers: serviceHeaders({ Prefer: 'return=representation' }, true),
                body: JSON.stringify(CANONICAL_MIDORI_PROPERTY)
            });
            if (!insertRes.ok) {
                return jsonWithCookies({ success: false, error: 'Failed to seed Midori property listing.' }, 502, res);
            }
            const inserted = await insertRes.json().catch(() => []);
            createdMidori = Array.isArray(inserted) ? inserted[0] : inserted;
        }

        const oldKathleen = rowsList.find((p) => {
            const t = String(p?.title || '').toLowerCase();
            return t.includes('kathleen') && p.title !== 'Kathleen - Place 5';
        });
        if (oldKathleen && oldKathleen.id != null) {
            await fetch(restUrl('properties', { id: `eq.${oldKathleen.id}` }), {
                method: 'PATCH',
                headers: serviceHeaders({ Prefer: 'return=minimal' }, true),
                body: JSON.stringify({ title: 'Kathleen - Place 5' })
            }).catch(() => {});
        }

        return jsonWithCookies({
            success: true,
            created: Boolean(createdMidori),
            data: createdMidori || rowsList.find((p) => String(p?.title || '').toLowerCase().includes('midori')) || null
        }, 200, res);
    }

    if (action === 'create') {
        const { fields, galleryImages, error } = validatePropertyFields(body.payload || body, { requireAll: true });
        if (error) return jsonWithCookies({ success: false, error }, 400, res);

        const ins = await insertPropertySafe(fields);
        if (!ins.ok) {
            return jsonWithCookies({ success: false, error: ins.error }, ins.status || 502, res);
        }
        const createdProp = ins.data;
        const imagesToStore = (Array.isArray(galleryImages) && galleryImages.length > 0)
            ? galleryImages
            : (createdProp?.image_url ? [createdProp.image_url] : []);
        if (createdProp && createdProp.id != null && imagesToStore.length > 0) {
            const imageRows = imagesToStore.slice(0, 10).map((url, idx) => ({
                property_id: createdProp.id,
                image_url: url,
                display_order: idx + 1,
                is_primary: idx === 0
            }));
            await fetch(restUrl('property_images'), {
                method: 'POST',
                headers: serviceHeaders({ Prefer: 'return=minimal' }, true),
                body: JSON.stringify(imageRows)
            }).catch(() => {});
            createdProp.gallery_images = imagesToStore.slice(0, 10);
        }
        return jsonWithCookies({ success: true, data: createdProp }, 200, res);
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

