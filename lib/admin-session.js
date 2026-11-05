import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'urbanscope_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;
export const SUPERADMIN_EMAIL = 'urbanscope.cvsu@gmail.com';
export const ADMIN_EMAILS = new Set([
    'admin.realestate@gmail.com',
    'miriam@gmail.com'
]);

function configuredAdminEmails() {
    const configured = String(process.env.VERCEL_ADMIN_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
    return new Set([...ADMIN_EMAILS, ...configured]);
}

function sessionSecret() {
    return String(process.env.VERCEL_ADMIN_SESSION_SECRET || '');
}

function encodeBase64Url(value) {
    return Buffer.from(value).toString('base64url');
}

export function isAuthorizedAdminRole(email, role) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanRole = String(role || '').trim().toLowerCase();
    return (cleanRole === 'admin' && configuredAdminEmails().has(cleanEmail)) ||
        (cleanRole === 'superadmin' && cleanEmail === SUPERADMIN_EMAIL);
}

export function createAdminSessionToken(user) {
    const secret = sessionSecret();
    if (secret.length < 32) {
        throw new Error('VERCEL_ADMIN_SESSION_SECRET must contain at least 32 characters.');
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: 'urbanscope-admin',
        sub: String(user.id),
        email: String(user.email).trim().toLowerCase(),
        role: String(user.role).trim().toLowerCase(),
        iat: now,
        exp: now + ADMIN_SESSION_TTL_SECONDS
    };
    const encodedHeader = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const encodedPayload = encodeBase64Url(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', secret).update(unsignedToken).digest('base64url');
    return `${unsignedToken}.${signature}`;
}

export function verifyAdminSessionToken(token) {
    const secret = sessionSecret();
    if (secret.length < 32 || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    try {
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

        const unsignedToken = `${parts[0]}.${parts[1]}`;
        const expected = createHmac('sha256', secret).update(unsignedToken).digest();
        const supplied = Buffer.from(parts[2], 'base64url');
        if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        const now = Math.floor(Date.now() / 1000);
        const email = String(payload.email || '').trim().toLowerCase();
        const role = String(payload.role || '').trim().toLowerCase();
        if (payload.iss !== 'urbanscope-admin' ||
            !payload.sub ||
            !Number.isInteger(payload.exp) || payload.exp <= now ||
            !Number.isInteger(payload.iat) || payload.iat > now + 60 ||
            !isAuthorizedAdminRole(email, role)) {
            return null;
        }

        return { id: payload.sub, email, role, expires_at: payload.exp };
    } catch (_) {
        return null;
    }
}

export function readAdminSession(request) {
    const cookieHeader = request?.headers?.get?.('cookie') || '';
    const cookie = cookieHeader.split(';').map((part) => part.trim())
        .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));
    if (!cookie) return null;
    return verifyAdminSessionToken(cookie.slice(ADMIN_SESSION_COOKIE.length + 1));
}

export function adminSessionCookie(token) {
    return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; Max-Age=${ADMIN_SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearAdminSessionCookie() {
    return `${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
