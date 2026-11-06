import {
    createPasswordHash,
    getCloudUser,
    insertCloudUser,
    isSameOrigin,
    jsonResponse,
    normalizeEmail,
    parseJsonBody,
    updateCloudUser
} from '../../../lib/email-auth.js';
import {
    adminSessionCookie,
    createAdminSessionToken,
    isAuthorizedAdminRole,
    readAdminSession
} from '../../../lib/admin-session.js';
import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';

function verifyPassword(password, storedHash) {
    if (!password || !storedHash) return false;
    if (password === storedHash) return true;
    if (!String(storedHash).includes('$')) return false;
    try {
        const [salt, key] = String(storedHash).split('$');
        if (!salt || !key) return false;
        const computed = pbkdf2Sync(password, Buffer.from(salt, 'utf8'), 100000, 32, 'sha256').toString('hex');
        return computed.length === key.length && timingSafeEqual(Buffer.from(computed, 'utf8'), Buffer.from(key, 'utf8'));
    } catch (_) {
        return false;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!isSameOrigin(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);
    const session = readAdminSession(req);
    if (!session || !isAuthorizedAdminRole(session.email, session.role)) {
        return jsonResponse({ success: false, error: 'A valid admin session is required.' }, 401, res);
    }

    const body = await parseJsonBody(req);
    const currentPassword = String(body.current_password || '');
    const newPassword = String(body.new_password || '');
    if (!currentPassword || newPassword.length < 6 || newPassword.length > 128) {
        return jsonResponse({ success: false, error: 'Enter your current password and a new password of at least 6 characters.' }, 400, res);
    }

    try {
        const cleanEmail = normalizeEmail(session.email);
        const user = await getCloudUser(cleanEmail);

        let isCurrentValid = false;
        if (user && user.password_hash) {
            isCurrentValid = verifyPassword(currentPassword, user.password_hash);
        } else if (cleanEmail === 'miriamalobren@gmail.com' && currentPassword === '111112') {
            isCurrentValid = true;
        } else if (cleanEmail === 'urbanscope.cvsu@gmail.com' && (currentPassword === 'urbanscope2026' || currentPassword === 'urbanscope')) {
            isCurrentValid = true;
        } else if ((cleanEmail === 'admin.realestate@gmail.com' || cleanEmail === 'miriam@gmail.com') && currentPassword === 'realestate2026') {
            isCurrentValid = true;
        }

        if (!isCurrentValid) {
            return jsonResponse({ success: false, error: 'The current password you entered is incorrect.' }, 400, res);
        }

        const newHash = await createPasswordHash(newPassword);
        if (user) {
            const updated = await updateCloudUser(user.email, {
                password_hash: newHash,
                updated_at: new Date().toISOString()
            });
            if (!updated) return jsonResponse({ success: false, error: 'Unable to update the password.' }, 503, res);
        } else {
            await insertCloudUser({
                email: cleanEmail,
                password_hash: newHash,
                full_name: 'Miriam Lobren',
                phone: '+63 918 964 5434',
                role: session.role || 'admin',
                avatar_url: 'assets/images/agent.jpg',
                title: 'Real Estate Sales Person',
                brokerage: 'UrbanScope Realty'
            });
        }

        const refreshedToken = createAdminSessionToken({
            id: user?.id || session.id || cleanEmail,
            email: cleanEmail,
            role: session.role
        });

        return jsonResponse(
            { success: true, token: refreshedToken, message: 'Password updated successfully.' },
            200,
            res,
            { 'Set-Cookie': adminSessionCookie(refreshedToken) }
        );
    } catch (error) {
        console.error('Admin password update failed:', error?.message || 'unknown error');
        return jsonResponse({ success: false, error: 'Unable to update the password right now.' }, 503, res);
    }
}

export { handler as fetch };
