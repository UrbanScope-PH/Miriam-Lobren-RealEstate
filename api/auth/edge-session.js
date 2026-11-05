import {
    adminSessionCookie,
    clearAdminSessionCookie,
    createAdminSessionToken,
    isAuthorizedAdminRole,
    readAdminSession
} from '../../lib/admin-session.js';

const DEFAULT_GOOGLE_CLIENT_ID = '981770655747-t222jr0ias09rl7aga3302p9am64so43.apps.googleusercontent.com';

function jsonResponse(payload, status = 200, headers = {}) {
    return Response.json(payload, {
        status,
        headers: { 'Cache-Control': 'private, no-store, max-age=0', ...headers }
    });
}

function hasValidOrigin(request) {
    const origin = request.headers.get('origin');
    if (!origin) return false;
    try {
        return new URL(origin).origin === new URL(request.url).origin;
    } catch (_) {
        return false;
    }
}

async function verifyGoogleAccessToken(accessToken) {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID).trim();
    const tokenInfoResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!tokenInfoResponse.ok) return null;
    const tokenInfo = await tokenInfoResponse.json();
    if (tokenInfo.aud !== clientId && tokenInfo.azp !== clientId) return null;

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!profileResponse.ok) return null;
    const profile = await profileResponse.json();
    const email = String(profile.email || '').trim().toLowerCase();
    const verified = profile.email_verified === true || String(profile.email_verified).toLowerCase() === 'true';
    return email && verified && profile.sub ? { email, id: profile.sub } : null;
}

function createSessionResponse(user) {
    const token = createAdminSessionToken(user);
    return jsonResponse(
        { success: true, user: { id: user.id, email: user.email, role: user.role } },
        200,
        { 'Set-Cookie': adminSessionCookie(token) }
    );
}

export default {
    async fetch(request) {
        if (request.method === 'GET') {
            const user = readAdminSession(request);
            return user
                ? jsonResponse({ authenticated: true, user: { id: user.id, email: user.email, role: user.role } })
                : jsonResponse({ authenticated: false }, 401);
        }

        if (request.method === 'DELETE') {
            return jsonResponse({ success: true }, 200, { 'Set-Cookie': clearAdminSessionCookie() });
        }

        if (request.method !== 'POST') {
            return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, DELETE' });
        }

        if (!hasValidOrigin(request)) {
            return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403);
        }

        if (String(process.env.VERCEL_ADMIN_SESSION_SECRET || '').length < 32) {
            return jsonResponse({
                success: false,
                error: 'Admin sessions are not configured. Set VERCEL_ADMIN_SESSION_SECRET in the Vercel project settings.'
            }, 503);
        }

        let payload;
        try {
            payload = await request.json();
        } catch (_) {
            return jsonResponse({ success: false, error: 'Invalid sign-in request.' }, 400);
        }

        try {
            if (!payload.access_token) {
                return jsonResponse({
                    success: false,
                    error: 'For secure admin access on Vercel, sign in with Google using an authorized staff account.'
                }, 403);
            }

            const accessToken = String(payload.access_token);
            if (accessToken.length > 8192) return jsonResponse({ success: false, error: 'Invalid Google token.' }, 400);
            const identity = await verifyGoogleAccessToken(accessToken);
            if (!identity) return jsonResponse({ success: false, error: 'Google sign-in could not be verified.' }, 401);

            const role = identity.email === 'urbanscope.cvsu@gmail.com' ? 'superadmin' : 'admin';
            if (!isAuthorizedAdminRole(identity.email, role)) {
                return jsonResponse({ success: false, error: 'This Google account does not have admin access.' }, 403);
            }

            return createSessionResponse({ id: identity.id, email: identity.email, role });
        } catch (error) {
            const message = error?.message || '';
            if (message.includes('VERCEL_ADMIN_SESSION_SECRET')) {
                return jsonResponse({ success: false, error: message }, 503);
            }
            return jsonResponse({ success: false, error: 'Unable to create an admin session. Please try again.' }, 502);
        }
    }
};
