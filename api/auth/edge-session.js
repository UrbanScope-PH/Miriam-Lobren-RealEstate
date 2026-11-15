import {
    createAdminSessionToken,
    isAuthorizedAdminRole,
    readAdminSession
} from '../../lib/admin-session.js';
import {
    buildClearSessionCookies,
    buildSessionCookieHeaders,
    checkRateLimit,
    createUserSessionToken,
    generateCsrfToken,
    getClientIp,
    getGoogleClientId,
    getServiceRoleKey,
    isStrictSameOrigin,
    jsonWithCookies,
    normalizeAccountRole,
    normalizeEmail,
    restUrl,
    sanitizeUser,
    serviceHeaders,
    verifyBotDefense,
    verifyCsrfIfAuthenticated,
    verifyPBKDF2Password
} from '../../lib/server-security.js';

async function verifyGoogleAccessToken(accessToken) {
    const clientId = getGoogleClientId();
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(6500)
        : undefined;
    try {
        const tokenInfoResponse = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
            signal ? { signal } : undefined
        );
        if (!tokenInfoResponse.ok) return null;
        const tokenInfo = await tokenInfoResponse.json().catch(() => ({}));
        if (tokenInfo.aud !== clientId && tokenInfo.azp !== clientId) return null;

        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
            ...(signal ? { signal } : {})
        });
        if (!profileResponse.ok) return null;
        const profile = await profileResponse.json().catch(() => ({}));
        const email = normalizeEmail(profile.email);
        const verified = profile.email_verified === true || String(profile.email_verified).toLowerCase() === 'true';
        return email && verified && profile.sub ? { email, id: profile.sub } : null;
    } catch (_) {
        return null;
    }
}

async function fetchCloudStaffUser(cleanEmail) {
    if (!getServiceRoleKey()) {
        throw new Error('Server database credentials are not configured.');
    }
    const res = await fetch(restUrl('users', {
        email: `eq.${cleanEmail}`,
        select: '*'
    }), {
        headers: serviceHeaders({}, true)
    });
    if (!res.ok) {
        throw new Error('Unable to verify staff credentials.');
    }
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const u = rows[0];
    if (u.bio === '__URBANSCOPE_DELETED__' || u.password_hash === '__DELETED_ACCOUNT__') return null;
    return u;
}

function createSessionResponse(request, user) {
    const cleanRole = normalizeAccountRole(user.role, user.email);
    const staffPayload = { id: user.id ?? user.email, email: user.email, role: cleanRole };
    const adminToken = createAdminSessionToken(staffPayload);
    const userToken = createUserSessionToken(staffPayload);
    const csrfToken = generateCsrfToken();
    const cookies = buildSessionCookieHeaders({ req: request, userToken, adminToken, csrfToken });

    return jsonWithCookies(
        { success: true, token: adminToken, user: sanitizeUser({ ...user, role: cleanRole }) },
        200,
        null,
        { cookies }
    );
}

export default {
    async fetch(request) {
        if (request.method === 'GET') {
            const user = readAdminSession(request);
            return user
                ? jsonWithCookies({ authenticated: true, user: { id: user.id, email: user.email, role: user.role } }, 200)
                : jsonWithCookies({ authenticated: false }, 401);
        }

        if (request.method === 'DELETE') {
            if (!verifyCsrfIfAuthenticated(request)) {
                return jsonWithCookies({ success: false, error: 'This request is not allowed.' }, 403);
            }
            return jsonWithCookies({ success: true }, 200, null, { cookies: buildClearSessionCookies(request) });
        }

        if (request.method !== 'POST') {
            return jsonWithCookies({ success: false, error: 'Method not allowed.' }, 405, null, {
                extraHeaders: { Allow: 'GET, POST, DELETE' }
            });
        }

        if (!isStrictSameOrigin(request)) {
            return jsonWithCookies({ success: false, error: 'This request is not allowed.' }, 403);
        }

        const ip = getClientIp(request);
        if (!await checkRateLimit({ key: `edge_login:ip:${ip}`, limit: 12, windowSeconds: 300, blockSeconds: 600 })) {
            return jsonWithCookies({ success: false, error: 'Too many sign-in attempts. Please wait a few minutes.' }, 429);
        }

        let payload;
        try {
            payload = await request.json();
        } catch (_) {
            return jsonWithCookies({ success: false, error: 'Invalid sign-in request.' }, 400);
        }

        try {
            // Option 1: Google OAuth Sign-In
            if (payload.access_token) {
                const accessToken = String(payload.access_token);
                if (accessToken.length > 8192) return jsonWithCookies({ success: false, error: 'Invalid Google token.' }, 400);
                const identity = await verifyGoogleAccessToken(accessToken);
                if (!identity) return jsonWithCookies({ success: false, error: 'Google sign-in could not be verified.' }, 401);

                const cloudUser = await fetchCloudStaffUser(identity.email).catch(() => null);
                const role = normalizeAccountRole(cloudUser?.role, identity.email);
                if (!isAuthorizedAdminRole(identity.email, role)) {
                    return jsonWithCookies({ success: false, error: 'This Google account does not have admin access.' }, 403);
                }

                return createSessionResponse(request, cloudUser || { id: identity.id, email: identity.email, role });
            }

            // Option 2: Email & Password Sign-In (requires verified PBKDF2 hash in cloud DB)
            if (payload.email && payload.password) {
                const cleanEmail = normalizeEmail(payload.email);
                const password = String(payload.password || '');

                if (!await checkRateLimit({ key: `edge_login:acct:${cleanEmail}`, limit: 10, windowSeconds: 300, blockSeconds: 600 })) {
                    return jsonWithCookies({ success: false, error: 'Too many attempts for this account. Please wait a few minutes.' }, 429);
                }

                const botCheck = await verifyBotDefense(request, payload);
                if (!botCheck.ok) {
                    return jsonWithCookies({ success: false, error: botCheck.error || 'Request rejected.' }, 400);
                }

                const cloudUser = await fetchCloudStaffUser(cleanEmail);
                const role = normalizeAccountRole(cloudUser?.role, cleanEmail);

                if (!isAuthorizedAdminRole(cleanEmail, role)) {
                    return jsonWithCookies({ success: false, error: 'This account does not have administrative access.' }, 403);
                }

                if (!cloudUser || !cloudUser.password_hash || !verifyPBKDF2Password(password, cloudUser.password_hash)) {
                    return jsonWithCookies({ success: false, error: 'Incorrect email or password.' }, 401);
                }

                return createSessionResponse(request, cloudUser);
            }

            return jsonWithCookies({
                success: false,
                error: 'Please provide valid login credentials (email and password or Google Sign-In).'
            }, 400);
        } catch (error) {
            const message = error?.message || '';
            if (message.includes('VERCEL_ADMIN_SESSION_SECRET') || message.includes('credentials are not configured')) {
                return jsonWithCookies({ success: false, error: 'Hosted authentication is not fully configured on the server.' }, 503);
            }
            return jsonWithCookies({ success: false, error: 'Unable to create an admin session. Please try again.' }, 502);
        }
    }
};
