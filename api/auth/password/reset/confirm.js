import {
    consumeOtp,
    createPasswordHash,
    getCloudUser,
    isSameOrigin,
    isValidEmail,
    jsonResponse,
    normalizeEmail,
    otpEnvironmentReady,
    updateCloudUser
} from '../../../../lib/email-auth.js';

export default async function handler(request) {
    if (request.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405);
    if (!isSameOrigin(request)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403);
    if (!otpEnvironmentReady()) return jsonResponse({ success: false, error: 'Email recovery is not configured on the server.' }, 503);

    let body;
    try { body = await request.json(); } catch (_) { return jsonResponse({ success: false, error: 'Invalid request.' }, 400); }
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').trim();
    const password = String(body.password || '');
    if (!isValidEmail(email) || !/^\d{6}$/.test(code) || password.length < 8 || password.length > 128) {
        return jsonResponse({ success: false, error: 'Enter the six-digit code and a password with at least 8 characters.' }, 400);
    }

    try {
        const user = await getCloudUser(email);
        if (!user || !user.password_hash || user.bio === '__URBANSCOPE_DELETED__' || user.password_hash === '__DELETED_ACCOUNT__') {
            return jsonResponse({ success: false, error: 'That code is invalid or expired. Request a new code and try again.' }, 400);
        }
        if (!await consumeOtp(email, 'password_reset', code)) {
            return jsonResponse({ success: false, error: 'That code is invalid or expired. Request a new code and try again.' }, 400);
        }
        const updated = await updateCloudUser(email, {
            password_hash: await createPasswordHash(password),
            email_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        if (!updated) return jsonResponse({ success: false, error: 'Unable to update that account. Request a new code and try again.' }, 400);
        return jsonResponse({ success: true, message: 'Password updated. You can now log in with your new password.' });
    } catch (error) {
        console.error('Password recovery could not be completed:', error?.message || 'unknown error');
        return jsonResponse({ success: false, error: 'Unable to update the password right now. Please try again.' }, 503);
    }
}
