import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import {
    adminSessionCookie,
    clearAdminSessionCookie,
    createAdminSessionToken,
    isAuthorizedAdminRole,
    readAdminSession
} from '../../lib/admin-session.js';

const DEFAULT_GOOGLE_CLIENT_ID = '981770655747-t222jr0ias09rl7aga3302p9am64so43.apps.googleusercontent.com';
const SUPABASE_REST_URL = 'https://vfspjuqymfbagesjxjmc.supabase.co/rest/v1';
const SUPABASE_DEFAULT_ANON = 'sb_publishable_96sfQ4F18ypajf6bitBRqg_JtWTL4__';

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

function verifyPBKDF2Hash(plainPassword, storedHash) {
    if (!plainPassword || !storedHash) return false;
    if (plainPassword === storedHash) return true;
    if (!storedHash.includes('$')) return false;
    try {
        const [saltHex, keyHex] = storedHash.split('$');
        if (!saltHex || !keyHex) return false;
        const derived = pbkdf2Sync(
            plainPassword,
            Buffer.from(saltHex, 'utf8'),
            100000,
            32,
            'sha256'
        ).toString('hex');
        if (derived.length !== keyHex.length) return false;
        return timingSafeEqual(Buffer.from(derived, 'utf8'), Buffer.from(keyHex, 'utf8'));
    } catch (_) {
        return false;
    }
}

async function verifyStaffPassword(email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPass = String(password || '');

    // A stored password hash takes precedence so recovery invalidates the old password.
    try {
        const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || SUPABASE_DEFAULT_ANON;
        const res = await fetch(`${SUPABASE_REST_URL}/users?email=ilike.${encodeURIComponent(cleanEmail)}&select=id,password_hash,role`, {
            headers: {
                'apikey': apiKey,
                'Authorization': `Bearer ${apiKey}`
            }
        });
        if (res.ok) {
            const users = await res.json();
            if (Array.isArray(users) && users.length > 0) {
                const u = users[0];
                if (u.password_hash) return verifyPBKDF2Hash(cleanPass, u.password_hash);
            }
        }
    } catch (err) {
        console.warn('Supabase password verification check error:', err);
    }

    // Keep environment/default credentials only as a bootstrap fallback when no cloud hash exists.
    if (cleanEmail === 'urbanscope.cvsu@gmail.com' && process.env.SUPERADMIN_PASSWORD && cleanPass === process.env.SUPERADMIN_PASSWORD) {
        return true;
    }
    if (process.env.ADMIN_PASSWORD && cleanPass === process.env.ADMIN_PASSWORD) {
        return true;
    }
    if (cleanEmail === 'urbanscope.cvsu@gmail.com' && (cleanPass === 'urbanscope2026' || cleanPass === 'urbanscope')) {
        return true;
    }
    if ((cleanEmail === 'admin.realestate@gmail.com' || cleanEmail === 'miriam@gmail.com') && cleanPass === 'realestate2026') {
        return true;
    }

    return false;
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
            // Option 1: Google OAuth Sign-In
            if (payload.access_token) {
                const accessToken = String(payload.access_token);
                if (accessToken.length > 8192) return jsonResponse({ success: false, error: 'Invalid Google token.' }, 400);
                const identity = await verifyGoogleAccessToken(accessToken);
                if (!identity) return jsonResponse({ success: false, error: 'Google sign-in could not be verified.' }, 401);

                const role = identity.email === 'urbanscope.cvsu@gmail.com' ? 'superadmin' : 'admin';
                if (!isAuthorizedAdminRole(identity.email, role)) {
                    return jsonResponse({ success: false, error: 'This Google account does not have admin access.' }, 403);
                }

                return createSessionResponse({ id: identity.id, email: identity.email, role });
            }

            // Option 2: Email & Password Sign-In
            if (payload.email && payload.password) {
                const cleanEmail = String(payload.email || '').trim().toLowerCase();
                const password = String(payload.password || '');
                const role = cleanEmail === 'urbanscope.cvsu@gmail.com' ? 'superadmin' : 'admin';

                if (!isAuthorizedAdminRole(cleanEmail, role)) {
                    return jsonResponse({ success: false, error: 'This account does not have administrative access.' }, 403);
                }

                const isValid = await verifyStaffPassword(cleanEmail, password);
                if (!isValid) {
                    return jsonResponse({ success: false, error: 'Incorrect email or password.' }, 401);
                }

                return createSessionResponse({ id: cleanEmail, email: cleanEmail, role });
            }

            return jsonResponse({
                success: false,
                error: 'Please provide valid login credentials (email and password or Google Sign-In).'
            }, 400);
        } catch (error) {
            const message = error?.message || '';
            if (message.includes('VERCEL_ADMIN_SESSION_SECRET')) {
                return jsonResponse({ success: false, error: message }, 503);
            }
            return jsonResponse({ success: false, error: 'Unable to create an admin session. Please try again.' }, 502);
        }
    }
};
