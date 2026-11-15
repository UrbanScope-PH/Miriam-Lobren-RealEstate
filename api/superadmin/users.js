import {
    createPasswordHash,
    deleteCloudUserAndAssociatedData,
    getCloudUser,
    getCloudUserById,
    insertCloudUser,
    isValidEmail,
    jsonResponse,
    normalizeEmail,
    parseJsonBody,
    updateCloudUserById
} from '../../lib/email-auth.js';
import { readAdminSession, SUPERADMIN_EMAIL } from '../../lib/admin-session.js';
import {
    checkRateLimit,
    getClientIp,
    getServiceRoleKey,
    restUrl,
    sanitizeUser,
    serviceHeaders,
    verifyCsrfIfAuthenticated
} from '../../lib/server-security.js';

export default async function handler(req, res) {
    const session = readAdminSession(req);
    if (!session || session.email !== SUPERADMIN_EMAIL || session.role !== 'superadmin') {
        return jsonResponse({ success: false, error: 'Only the Superadmin can manage accounts.' }, 403, res);
    }
    if (!getServiceRoleKey()) {
        return jsonResponse({ success: false, error: 'Cloud account management is not configured.' }, 503, res);
    }

    if (req.method === 'GET') {
        try {
            const listRes = await fetch(restUrl('users', {
                select: 'id,email,full_name,phone,role,avatar_url,bio,email_verified_at,created_at,updated_at',
                order: 'id.asc'
            }), { headers: serviceHeaders({}, true) });
            if (!listRes.ok) {
                return jsonResponse({ success: false, error: 'Unable to load user directory.' }, 502, res);
            }
            const rows = await listRes.json().catch(() => []);
            const active = Array.isArray(rows)
                ? rows.filter((u) => u && u.bio !== '__URBANSCOPE_DELETED__' && u.password_hash !== '__DELETED_ACCOUNT__' && !String(u.email || '').startsWith('deleted_')).map(sanitizeUser)
                : [];
            return jsonResponse({ success: true, users: active }, 200, res);
        } catch (_) {
            return jsonResponse({ success: false, error: 'Unable to load user directory.' }, 503, res);
        }
    }

    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!verifyCsrfIfAuthenticated(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);

    const ip = getClientIp(req);
    if (!await checkRateLimit({ key: `sa_users:ip:${ip}`, limit: 40, windowSeconds: 300, blockSeconds: 300 })) {
        return jsonResponse({ success: false, error: 'Too many requests. Please slow down.' }, 429, res);
    }

    const body = await parseJsonBody(req);
    const action = String(body.action || '').trim().toLowerCase();
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const email = normalizeEmail(payload.email);
    const fullName = payload.full_name === undefined ? '' : String(payload.full_name).trim();
    const phone = payload.phone === undefined ? '' : String(payload.phone).trim();
    const role = String(payload.role || 'user').trim().toLowerCase();
    const password = String(payload.password || '');

    try {
        if (action === 'create') {
            if (!['user', 'admin', 'superadmin'].includes(role)) {
                return jsonResponse({ success: false, error: 'Invalid role.' }, 400, res);
            }
            if (!isValidEmail(email) || fullName.length < 2 || fullName.length > 120 || phone.length > 40 || password.length < 8 || password.length > 128) {
                return jsonResponse({ success: false, error: 'Enter a valid email, name, and password of at least 8 characters.' }, 400, res);
            }
            const existing = await getCloudUser(email);
            const now = new Date().toISOString();
            const fields = {
                email,
                password_hash: await createPasswordHash(password),
                full_name: fullName,
                phone,
                role: email === SUPERADMIN_EMAIL ? 'superadmin' : role,
                avatar_url: 'assets/images/agent.jpg',
                bio: '',
                email_verified_at: now,
                updated_at: now
            };
            const user = existing
                ? (existing.bio === '__URBANSCOPE_DELETED__' || existing.password_hash === '__DELETED_ACCOUNT__' || String(existing.email || '').startsWith('deleted_')
                    ? await updateCloudUserById(existing.id, fields)
                    : null)
                : await insertCloudUser(fields);
            if (!user) return jsonResponse({ success: false, error: 'An account with this email already exists.' }, 409, res);
            return jsonResponse({ success: true, message: 'Account created successfully.', user: sanitizeUser(user) }, 200, res);
        }

        if (action === 'update') {
            if (payload.role !== undefined && !['user', 'admin', 'superadmin'].includes(role)) {
                return jsonResponse({ success: false, error: 'Invalid role.' }, 400, res);
            }
            const id = String(body.user_id || '').trim();
            if (!/^\d+$/.test(id)) return jsonResponse({ success: false, error: 'Invalid account ID.' }, 400, res);
            const target = await getCloudUserById(id);
            if (!target) return jsonResponse({ success: false, error: 'User account not found.' }, 404, res);
            const targetEmail = normalizeEmail(target.email);
            const nextEmail = email || targetEmail;
            if (!isValidEmail(nextEmail) || fullName.length > 120 || phone.length > 40) {
                return jsonResponse({ success: false, error: 'Check the account details and try again.' }, 400, res);
            }
            const nextRole = payload.role === undefined ? target.role : role;
            if (targetEmail === SUPERADMIN_EMAIL && (nextEmail !== SUPERADMIN_EMAIL || nextRole !== 'superadmin')) {
                return jsonResponse({ success: false, error: 'The root Superadmin account cannot be renamed or demoted.' }, 400, res);
            }
            if (nextEmail !== targetEmail) {
                const duplicate = await getCloudUser(nextEmail);
                if (duplicate && String(duplicate.id) !== id) return jsonResponse({ success: false, error: 'Email is already in use by another account.' }, 409, res);
            }
            const patch = { updated_at: new Date().toISOString() };
            if (fullName) patch.full_name = fullName;
            if (payload.email !== undefined) patch.email = nextEmail;
            if (payload.phone !== undefined) patch.phone = phone;
            if (payload.role !== undefined) patch.role = role;
            if (password) {
                if (password.length < 8 || password.length > 128) return jsonResponse({ success: false, error: 'Password must contain at least 8 characters.' }, 400, res);
                patch.password_hash = await createPasswordHash(password);
                patch.email_verified_at = new Date().toISOString();
            }
            const updated = await updateCloudUserById(id, patch);
            return updated
                ? jsonResponse({ success: true, message: 'User account updated successfully.', user: sanitizeUser(updated) }, 200, res)
                : jsonResponse({ success: false, error: 'Unable to update the account.' }, 503, res);
        }

        if (action === 'delete') {
            const id = String(body.user_id || '').trim();
            if (!id && !email) {
                return jsonResponse({ success: false, error: 'Invalid account ID.' }, 400, res);
            }
            let target = null;
            if (/^\d+$/.test(id)) {
                target = await getCloudUserById(id).catch(() => null);
            }
            if (!target && email) {
                target = await getCloudUser(email).catch(() => null);
            }
            const targetEmail = target ? normalizeEmail(target.email) : email;
            const targetId = target ? target.id : id;

            if (targetEmail === SUPERADMIN_EMAIL || targetEmail === 'urbanscope.cvsu@gmail.com') {
                return jsonResponse({ success: false, error: 'Cannot delete root Superadmin account.' }, 400, res);
            }
            if (['admin.realestate@gmail.com', 'miriamalobren@gmail.com', 'miriam@gmail.com'].includes(targetEmail)) {
                return jsonResponse({ success: false, error: 'Cannot delete primary Realty Admin account.' }, 400, res);
            }

            await deleteCloudUserAndAssociatedData(targetId, targetEmail);
            return jsonResponse({
                success: true,
                message: `Account ${targetEmail || '#' + targetId} and associated inquiry history deleted successfully.`
            }, 200, res);
        }

        return jsonResponse({ success: false, error: 'Unsupported account action.' }, 400, res);
    } catch (error) {
        console.error('Superadmin account operation failed:', error?.message || 'unknown error');
        return jsonResponse({ success: false, error: 'Unable to complete the account operation right now.' }, 503, res);
    }
}

export { handler as fetch };
