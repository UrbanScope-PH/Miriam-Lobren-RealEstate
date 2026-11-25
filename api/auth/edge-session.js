import {
    createAdminSessionToken,
    isAuthorizedAdminRole
} from '../../lib/admin-session.js';
import {
    buildClearSessionCookies,
    buildSessionCookieHeaders,
    checkRateLimit,
    createUserSessionToken,
    fetchCloudUserByEmailResult,
    generateCsrfToken,
    getClientIp,
    getGoogleClientId,
    getServiceRoleKey,
    isConfiguredAdminEmail,
    isStrictSameOrigin,
    jsonWithCookies,
    normalizeAccountRole,
    normalizeEmail,
    sanitizeUser,
    verifyBotDefense,
    verifyCsrfIfAuthenticated,
    verifyLiveAdminSession,
    verifyPBKDF2Password
} from '../../lib/server-security.js';

async function verifyGoogleCredentials({ accessToken = '', credential = '' }) {
    const clientId = getGoogleClientId();
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(6500)
        : undefined;

    if (credential) {
        try {
            const res = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
                signal ? { signal } : undefined
            );
            if (!res.ok) return null;
            const info = await res.json().catch(() => ({}));
            if (info.aud !== clientId && info.azp !== clientId) return null;
            const email = normalizeEmail(info.email);
            const verified = info.email_verified === true || String(info.email_verified).toLowerCase() === 'true';
            return email && verified && info.sub ? { email, id: String(info.sub) } : null;
        } catch (_) {
            return null;
        }
    }

    if (accessToken) {
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
            return email && verified && profile.sub ? { email, id: String(profile.sub) } : null;
        } catch (_) {
            return null;
        }
    }

    return null;
}

async function lookupCloudStaffUser(cleanEmail, googleId = null) {
    if (!getServiceRoleKey()) {
        throw new Error('Server database credentials are not configured.');
    }
    const lookup = await fetchCloudUserByEmailResult(cleanEmail, { googleId });
    if (lookup.dbError) {
        throw new Error('Unable to verify staff credentials.');
    }
    return lookup;
}

function createSessionResponse(request, user) {
    const cleanEmail = normalizeEmail(user.email);
    const cleanRole = normalizeAccountRole(user.role, cleanEmail);
    const staffPayload = { id: user.id ?? cleanEmail, email: cleanEmail, role: cleanRole };
    const adminToken = createAdminSessionToken(staffPayload);
    const userToken = createUserSessionToken(staffPayload);
    const csrfToken = generateCsrfToken();
    const cookies = buildSessionCookieHeaders({ req: request, userToken, adminToken, csrfToken });

    return jsonWithCookies(
        { success: true, token: adminToken, user: sanitizeUser({ ...user, email: cleanEmail, role: cleanRole }) },
        200,
        null,
        { cookies }
    );
}

export default {
    async fetch(request) {
        if (request.method === 'GET') {
            const verified = await verifyLiveAdminSession(request);
            if (verified.ok && verified.session) {
                return jsonWithCookies({
                    authenticated: true,
                    user: {
                        id: verified.session.id,
                        email: verified.session.email,
                        role: verified.session.role
                    }
                }, 200);
            }
            if (verified.status === 503) {
                return jsonWithCookies({ authenticated: false, error: verified.error || 'Unable to verify admin session.' }, 503);
            }
            return jsonWithCookies(
                { authenticated: false },
                401,
                null,
                verified.clearCookies?.length ? { cookies: verified.clearCookies } : undefined
            );
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
            // Option 1: Google OAuth Sign-In (access_token or ID credential)
            if (payload.access_token || payload.credential) {
                const accessToken = payload.access_token ? String(payload.access_token) : '';
                const credential = payload.credential ? String(payload.credential) : '';
                if (accessToken.length > 8192 || credential.length > 8192) {
                    return jsonWithCookies({ success: false, error: 'Invalid Google token.' }, 400);
                }
                const identity = await verifyGoogleCredentials({ accessToken, credential });
                if (!identity) {
                    return jsonWithCookies({ success: false, error: 'Google sign-in could not be verified.' }, 401);
                }

                const lookup = await lookupCloudStaffUser(identity.email, identity.id);
                if (lookup.deleted) {
                    return jsonWithCookies({ success: false, error: 'This account has been deactivated.' }, 403);
                }
                const cloudUser = lookup.row;
                const resolvedEmail = normalizeEmail(cloudUser?.email || identity.email);
                const role = cloudUser
                    ? normalizeAccountRole(cloudUser.role, resolvedEmail)
                    : (isConfiguredAdminEmail(resolvedEmail) ? normalizeAccountRole('', resolvedEmail) : 'user');

                if (!isAuthorizedAdminRole(resolvedEmail, role)) {
                    return jsonWithCookies({ success: false, error: 'This Google account does not have admin access.' }, 403);
                }

                return createSessionResponse(request, cloudUser || { id: identity.id, email: resolvedEmail, role });
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

                const lookup = await lookupCloudStaffUser(cleanEmail);
                const cloudUser = lookup.row;
                const resolvedEmail = normalizeEmail(cloudUser?.email || cleanEmail);
                const role = normalizeAccountRole(cloudUser?.role, resolvedEmail);

                if (!cloudUser || !isAuthorizedAdminRole(resolvedEmail, role)) {
                    return jsonWithCookies({ success: false, error: 'This account does not have administrative access.' }, 403);
                }

                if (!cloudUser.password_hash || !verifyPBKDF2Password(password, cloudUser.password_hash)) {
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
