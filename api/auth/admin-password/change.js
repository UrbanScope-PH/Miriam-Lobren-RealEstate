import {
    createPasswordHash,
    getCloudUser,
    jsonResponse,
    normalizeEmail,
    parseJsonBody,
    updateCloudUser
} from '../../../lib/email-auth.js';
import {
    createAdminSessionToken
} from '../../../lib/admin-session.js';
import {
    buildSessionCookieHeaders,
    checkRateLimit,
    createUserSessionToken,
    generateCsrfToken,
    getClientIp,
    getServiceRoleKey,
    jsonWithCookies,
    verifyCsrfIfAuthenticated,
    verifyLiveAdminSession,
    verifyPBKDF2Password
} from '../../../lib/server-security.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!verifyCsrfIfAuthenticated(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);

    if (!getServiceRoleKey()) {
        return jsonResponse({ success: false, error: 'Server database credentials are not configured.' }, 503, res);
    }

    const adminCheck = await verifyLiveAdminSession(req);
    if (!adminCheck.ok || !adminCheck.session) {
        return jsonWithCookies(
            { success: false, error: adminCheck.error || 'A valid admin session is required.' },
            adminCheck.status === 503 ? 503 : 401,
            res,
            adminCheck.clearCookies?.length ? { cookies: adminCheck.clearCookies } : undefined
        );
    }
    const session = adminCheck.session;

    const ip = getClientIp(req);
    const cleanEmail = normalizeEmail(session.email);
    if (!await checkRateLimit({ key: `admin_pw_chg:ip:${ip}:${cleanEmail}`, limit: 8, windowSeconds: 300, blockSeconds: 600 })) {
        return jsonResponse({ success: false, error: 'Too many password update attempts. Please try again later.' }, 429, res);
    }

    const body = await parseJsonBody(req);
    const currentPassword = String(body.current_password || '');
    const newPassword = String(body.new_password || '');
    if (!currentPassword || newPassword.length < 8 || newPassword.length > 128) {
        return jsonResponse({ success: false, error: 'Enter your current password and a new password of at least 8 characters.' }, 400, res);
    }

    try {
        const user = await getCloudUser(cleanEmail);
        if (
            !user ||
            !user.password_hash ||
            user.bio === '__URBANSCOPE_DELETED__' ||
            user.password_hash === '__DELETED_ACCOUNT__' ||
            !verifyPBKDF2Password(currentPassword, user.password_hash)
        ) {
            return jsonResponse({ success: false, error: 'The current password you entered is incorrect.' }, 400, res);
        }

        const newHash = await createPasswordHash(newPassword);
        const updated = await updateCloudUser(user.email, {
            password_hash: newHash,
            updated_at: new Date().toISOString()
        });
        if (!updated) return jsonResponse({ success: false, error: 'Unable to update the password.' }, 503, res);

        const staffIdentity = {
            id: user.id || session.id || cleanEmail,
            email: cleanEmail,
            role: session.role
        };
        const refreshedAdminToken = createAdminSessionToken(staffIdentity);
        const refreshedUserToken = createUserSessionToken(staffIdentity);
        const csrfToken = generateCsrfToken();
        const cookies = buildSessionCookieHeaders({
            req,
            userToken: refreshedUserToken,
            adminToken: refreshedAdminToken,
            csrfToken
        });

        return jsonWithCookies(
            { success: true, token: refreshedAdminToken, message: 'Password updated successfully.' },
            200,
            res,
            { cookies }
        );
    } catch (error) {
        console.error('Admin password update failed:', error?.message || 'unknown error');
        return jsonResponse({ success: false, error: 'Unable to update the password right now.' }, 503, res);
    }
}

export { handler as fetch };
