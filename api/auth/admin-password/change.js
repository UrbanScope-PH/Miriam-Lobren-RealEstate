import {
    createPasswordHash,
    getCloudUser,
    isSameOrigin,
    jsonResponse,
    normalizeEmail,
    updateCloudUser
} from '../../../lib/email-auth.js';
import { isAuthorizedAdminRole, readAdminSession } from '../../../lib/admin-session.js';
import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';

function verifyPassword(password, storedHash) {
    if (!password || !storedHash || !String(storedHash).includes('$')) return false;
    try {
        const [salt, key] = String(storedHash).split('$');
        if (!salt || !key) return false;
        const computed = pbkdf2Sync(password, Buffer.from(salt, 'utf8'), 100000, 32, 'sha256').toString('hex');
        return computed.length === key.length && timingSafeEqual(Buffer.from(computed, 'utf8'), Buffer.from(key, 'utf8'));
    } catch (_) {
        return false;
    }
}

export default async function handler(request) {
    if (request.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405);
    if (!isSameOrigin(request)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403);
    const session = readAdminSession(request);
    if (!session || !isAuthorizedAdminRole(session.email, session.role)) {
        return jsonResponse({ success: false, error: 'A valid admin session is required.' }, 401);
    }
    if (!String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
        return jsonResponse({ success: false, error: 'Cloud password updates are not configured.' }, 503);
    }

    let body;
    try { body = await request.json(); } catch (_) { return jsonResponse({ success: false, error: 'Invalid request.' }, 400); }
    const currentPassword = String(body.current_password || '');
    const newPassword = String(body.new_password || '');
    if (!currentPassword || newPassword.length < 6 || newPassword.length > 128) {
        return jsonResponse({ success: false, error: 'Enter your current password and a new password of at least 6 characters.' }, 400);
    }

    try {
        const user = await getCloudUser(normalizeEmail(session.email));
        if (!user || !verifyPassword(currentPassword, user.password_hash)) {
            return jsonResponse({ success: false, error: 'The current password you entered is incorrect.' }, 400);
        }
        const updated = await updateCloudUser(user.email, {
            password_hash: await createPasswordHash(newPassword),
            updated_at: new Date().toISOString()
        });
        if (!updated) return jsonResponse({ success: false, error: 'Unable to update the password.' }, 503);
        return jsonResponse({ success: true, message: 'Password updated successfully.' });
    } catch (error) {
        console.error('Admin password update failed:', error?.message || 'unknown error');
        return jsonResponse({ success: false, error: 'Unable to update the password right now.' }, 503);
    }
}
