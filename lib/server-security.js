/**
 * UrbanScope - Shared Serverless Security Utilities
 * =================================================
 * Centralizes session tokens, CSRF/origin validation, rate limiting,
 * bot protection, password hashing, input/URL sanitization, and
 * PostgREST service-role communication for all Vercel `/api/*` handlers.
 */

import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPABASE_URL = 'https://vfspjuqymfbagesjxjmc.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_96sfQ4F18ypajf6bitBRqg_JtWTL4__';
export const USER_SESSION_COOKIE = 'urbanscope_user_session';
export const USER_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const CSRF_COOKIE = 'urbanscope_csrf';

export const SUPERADMIN_EMAIL = 'urbanscope.cvsu@gmail.com';
export const ALLOWED_ADMIN_EMAILS = new Set([
    'admin.realestate@gmail.com',
    'miriamalobren@gmail.com',
    'miriam@gmail.com',
    'urbanscope.cvsu@gmail.com'
]);

const VALID_ROLES = new Set(['user', 'admin', 'superadmin']);
const VALID_INQUIRY_STATUSES = new Set([
    'Under Review',
    'Pending',
    'Submitted',
    'Requirements Submitted',
    'For Resubmission',
    'Approved',
    'Scheduled',
    'Contacted',
    'Completed',
    'Closed',
    'Cancelled'
]);

// Local fallback sliding window store (used only if distributed RPC table isn't migrated yet)
const LOCAL_RATE_BUCKETS = new Map();
let EPHEMERAL_DEV_SECRET = null;

function loadDotEnvIfNeeded() {
    try {
        const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
        const envPath = resolve(rootDir, '.env');
        if (!existsSync(envPath)) return;
        const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#') || !line.includes('=')) continue;
            const eqIdx = line.indexOf('=');
            const key = line.slice(0, eqIdx).trim();
            let val = line.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            if (key && val && !(key in process.env)) {
                process.env[key] = val;
            }
        }
    } catch (_) {
        // Safe to ignore in production serverless sandboxes
    }
}

loadDotEnvIfNeeded();

export function isProductionRuntime() {
    const env = String(process.env.URBANSCOPE_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || '').toLowerCase();
    return process.env.VERCEL === '1' || env === 'production';
}

export function getHeader(req, name) {
    if (!req) return null;
    if (typeof req.headers?.get === 'function') {
        return req.headers.get(name);
    }
    const lower = String(name || '').toLowerCase();
    return req.headers?.[lower] || req.headers?.[name] || null;
}

export function isHttpsRequest(req) {
    const proto = String(getHeader(req, 'x-forwarded-proto') || '').toLowerCase();
    if (proto.includes('https')) return true;
    const host = String(getHeader(req, 'x-forwarded-host') || getHeader(req, 'host') || '').toLowerCase();
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')) {
        return false;
    }
    return isProductionRuntime();
}

export function getClientIp(req) {
    const xff = getHeader(req, 'x-forwarded-for');
    if (xff) return String(xff).split(',')[0].trim();
    const realIp = getHeader(req, 'x-real-ip');
    if (realIp) return String(realIp).trim();
    return req?.socket?.remoteAddress || 'unknown';
}

export function cleanEnvSecret(value) {
    const trimmed = String(value || '').trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1).trim();
    }
    return trimmed;
}

export const DEFAULT_GOOGLE_CLIENT_ID = '981770655747-t222jr0ias09rl7aga3302p9am64so43.apps.googleusercontent.com';

export function getGoogleClientId() {
    const configured = cleanEnvSecret(process.env.GOOGLE_CLIENT_ID || '');
    if (configured && !configured.toLowerCase().startsWith('your_google_client_id')) {
        return configured;
    }
    return DEFAULT_GOOGLE_CLIENT_ID;
}

export function getSessionSecret() {
    const configured = cleanEnvSecret(
        process.env.VERCEL_ADMIN_SESSION_SECRET ||
        process.env.URBANSCOPE_SECRET_KEY ||
        ''
    );
    if (configured.length >= 32) return configured;
    if (!isProductionRuntime()) {
        if (!EPHEMERAL_DEV_SECRET) {
            EPHEMERAL_DEV_SECRET = randomBytes(32).toString('hex');
        }
        return EPHEMERAL_DEV_SECRET;
    }
    return '';
}

export function getOtpSecret() {
    const configured = cleanEnvSecret(
        process.env.AUTH_OTP_SECRET ||
        process.env.VERCEL_ADMIN_SESSION_SECRET ||
        process.env.URBANSCOPE_SECRET_KEY ||
        ''
    );
    if (configured.length >= 32) return configured;
    return isProductionRuntime() ? '' : getSessionSecret();
}

function isValidServiceKeyValue(key) {
    return Boolean(key) && key !== SUPABASE_ANON_KEY && !key.startsWith('sb_publishable_');
}

export function getServiceRoleKey() {
    const preferredKeys = [
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_SECRET_KEY',
        'SUPABASE_SERVICE_KEY',
        'SUPABASE_SERVICE_ROLE',
        'STORAGE_SUPABASE_SERVICE_ROLE_KEY',
        'STORAGE_SUPABASE_SECRET_KEY',
        'STORAGE_SUPABASE_SERVICE_KEY'
    ];
    for (const envName of preferredKeys) {
        const key = cleanEnvSecret(process.env[envName]);
        if (isValidServiceKeyValue(key)) return key;
    }

    const dynamicNames = Object.keys(process.env)
        .filter((name) =>
            /^(?:[A-Z0-9_]+_)?SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY|SERVICE_KEY|SERVICE_ROLE)$/i.test(name) &&
            !/(?:^|_)(?:PUBLIC|ANON|PUBLISHABLE)(?:_|$)/i.test(name)
        )
        .sort();
    for (const envName of dynamicNames) {
        const key = cleanEnvSecret(process.env[envName]);
        if (isValidServiceKeyValue(key)) return key;
    }
    return '';
}

export function serviceHeaders(extra = {}, requireServiceKey = true) {
    const serviceKey = getServiceRoleKey();
    if (requireServiceKey && !serviceKey) {
        throw new Error('Server database service key is not configured (SUPABASE_SERVICE_ROLE_KEY).');
    }
    const key = serviceKey || SUPABASE_ANON_KEY;
    return {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...extra
    };
}

export function restUrl(path, query = {}) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
        }
    }
    return url;
}

/**
 * Escapes untrusted input before interpolating inside a PostgREST `or=(...)` expression.
 * Strips filter-syntax control characters (`(`, `)`, `,`, `\`) cleanly.
 */
export function escapePostgrestFilterValue(value) {
    return String(value || '').replace(/[(),\\*]/g, '').trim();
}

export function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

export function isValidEmail(email) {
    return typeof email === 'string' && email.length >= 3 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeAccountRole(role, email = '') {
    const cleanEmail = normalizeEmail(email);
    const raw = String(role || '').trim().toLowerCase();
    if (cleanEmail === SUPERADMIN_EMAIL) return 'superadmin';
    if (raw === 'admin' || ALLOWED_ADMIN_EMAILS.has(cleanEmail)) return 'admin';
    if (raw === 'superadmin') return cleanEmail === SUPERADMIN_EMAIL ? 'superadmin' : 'admin';
    return 'user';
}

export function isConfiguredAdminEmail(email) {
    const clean = normalizeEmail(email);
    if (!clean) return false;
    if (ALLOWED_ADMIN_EMAILS.has(clean)) return true;
    const extra = String(process.env.VERCEL_ADMIN_EMAILS || '')
        .split(',')
        .map((s) => normalizeEmail(s))
        .filter(Boolean);
    return extra.includes(clean);
}

export function parseCookies(req) {
    const raw = String(getHeader(req, 'cookie') || '');
    const map = {};
    for (const part of raw.split(';')) {
        const idx = part.indexOf('=');
        if (idx <= 0) continue;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k) map[k] = v;
    }
    return map;
}

export function isValidRole(role) {
    return VALID_ROLES.has(String(role || '').toLowerCase());
}

export function isValidInquiryStatus(status) {
    return VALID_INQUIRY_STATUSES.has(String(status || '').trim());
}

/**
 * Validates and sanitizes image URLs & raster data URIs.
 * Blocks javascript:, vbscript:, data:image/svg+xml, and oversized payloads.
 */
export function sanitizeImageUrl(rawUrl, { maxDataUrlBytes = 3 * 1024 * 1024, defaultValue = '' } = {}) {
    const val = String(rawUrl || '').trim();
    if (!val) return { ok: true, value: defaultValue };
    if (val.length > maxDataUrlBytes + 128) {
        return { ok: false, error: 'Image payload exceeds maximum permitted size.' };
    }

    const lower = val.toLowerCase();
    if (/^(javascript|vbscript|data:text\/html|data:image\/svg\+xml)/i.test(lower)) {
        return { ok: false, error: 'Unsupported or unsafe image format.' };
    }

    if (lower.startsWith('data:image/')) {
        if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(val)) {
            return { ok: false, error: 'Only PNG, JPEG, and WebP images are permitted.' };
        }
        return { ok: true, value: val };
    }

    if (lower.startsWith('https://')) {
        try {
            const u = new URL(val);
            if (u.protocol !== 'https:') return { ok: false, error: 'Invalid HTTPS URL.' };
            return { ok: true, value: u.toString() };
        } catch (_) {
            return { ok: false, error: 'Invalid image URL.' };
        }
    }

    // Relative local asset paths only (prevent traversal `..`)
    const stripped = val.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');
    if (stripped.includes('..') || !/^assets\/images\/[A-Za-z0-9._\/-]+$/.test(stripped)) {
        return { ok: false, error: 'Image path must reference valid PNG/JPEG/WebP image or asset.' };
    }
    return { ok: true, value: stripped };
}

export function sanitizeUser(row) {
    if (!row || typeof row !== 'object') return null;
    const role = normalizeAccountRole(row.role, row.email);
    return {
        id: row.id,
        email: row.email || '',
        full_name: row.full_name || row.name || '',
        name: row.full_name || row.name || '',
        phone: row.phone || '',
        role,
        avatar_url: row.avatar_url || '',
        license_number: row.license_number || '',
        title: row.title || '',
        brokerage: row.brokerage || '',
        bio: row.bio === '__URBANSCOPE_DELETED__' ? '' : (row.bio || ''),
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        email_verified: Boolean(row.email_verified_at) || role !== 'user'
    };
}

export function sanitizePublicLeadAgent(row) {
    if (!row || typeof row !== 'object') {
        return {
            name: 'Miriam Lobren',
            full_name: 'Miriam Lobren',
            email: 'miriamalobren@gmail.com',
            phone: '+63 918 964 5434',
            license: 'PRC REB #402',
            license_number: 'PRC REB #402',
            title: 'Real Estate Salesperson',
            brokerage: 'CD Miranda Realty',
            bio: 'Serving Las Piñas, Cavite, and surrounding prime locations with high-integrity real estate solutions.',
            avatar_url: 'assets/images/agent.jpg'
        };
    }
    const brok = String(row.brokerage || '').trim();
    const title = String(row.title || '').trim();
    const safeTitle = (!title || /^(real estate agent|licensed real estate broker \/ agent)$/i.test(title))
        ? 'Real Estate Salesperson'
        : title;
    return {
        name: row.full_name || 'Miriam Lobren',
        full_name: row.full_name || 'Miriam Lobren',
        email: row.email || 'miriamalobren@gmail.com',
        phone: row.phone || '+63 918 964 5434',
        license: row.license_number || '',
        license_number: row.license_number || '',
        title: safeTitle,
        brokerage: (!brok || /^(urbanscope|cdmiranda realty)$/i.test(brok)) ? 'CD Miranda Realty' : brok,
        bio: row.bio || 'Serving Las Piñas, Cavite, and surrounding prime locations with high-integrity real estate solutions.',
        avatar_url: row.avatar_url || 'assets/images/agent.jpg'
    };
}

export function verifyPBKDF2Password(plainPassword, storedHash) {
    if (!plainPassword || !storedHash || typeof storedHash !== 'string') return false;
    try {
        // Support format 1: pbkdf2_sha256$<iterations>$<salt>$<hex>
        if (storedHash.startsWith('pbkdf2_sha256$')) {
            const parts = storedHash.split('$');
            if (parts.length !== 4) return false;
            const iterations = parseInt(parts[1], 10);
            const salt = parts[2];
            const hashHex = parts[3];
            if (!iterations || iterations < 10000 || !salt || !hashHex) return false;
            const derived = pbkdf2Sync(String(plainPassword), Buffer.from(salt, 'utf8'), iterations, 32, 'sha256').toString('hex');
            const a = Buffer.from(derived, 'hex');
            const b = Buffer.from(hashHex, 'hex');
            return a.length === b.length && timingSafeEqual(a, b);
        }
        // Support format 2: <salt>$<hex> (100,000 iterations PBKDF2-SHA256)
        if (!storedHash.includes('$')) return false;
        const [salt, hashHex] = storedHash.split('$');
        if (!salt || !hashHex) return false;
        const derived = pbkdf2Sync(String(plainPassword), Buffer.from(salt, 'utf8'), 100000, 32, 'sha256').toString('hex');
        const a = Buffer.from(derived, 'hex');
        const b = Buffer.from(hashHex, 'hex');
        return a.length === b.length && timingSafeEqual(a, b);
    } catch (_) {
        return false;
    }
}

export function hashPBKDF2Password(plainPassword) {
    const salt = randomBytes(16).toString('hex');
    const derived = pbkdf2Sync(String(plainPassword), Buffer.from(salt, 'utf8'), 100000, 32, 'sha256').toString('hex');
    return `${salt}$${derived}`;
}

export function createUserSessionToken(user) {
    const secret = getSessionSecret();
    if (secret.length < 32) {
        throw new Error('Server session secret is not configured.');
    }
    const cleanEmail = normalizeEmail(user?.email);
    const role = normalizeAccountRole(user?.role, cleanEmail);
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        sub: String(user?.id ?? cleanEmail),
        email: cleanEmail,
        role,
        iat: now,
        exp: now + USER_SESSION_TTL_SECONDS
    })).toString('base64url');
    const unsigned = `${header}.${payload}`;
    const sig = createHmac('sha256', secret).update(unsigned).digest('base64url');
    return `${unsigned}.${sig}`;
}

export function verifyUserSessionToken(token) {
    const secret = getSessionSecret();
    if (secret.length < 32 || typeof token !== 'string' || !token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

        const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
        const supplied = Buffer.from(parts[2], 'base64url');
        if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        const now = Math.floor(Date.now() / 1000);
        if (!payload?.exp || Number(payload.exp) <= now) return null;
        const email = normalizeEmail(payload.email);
        if (!isValidEmail(email)) return null;
        const role = normalizeAccountRole(payload.role, email);
        return {
            id: payload.sub,
            email,
            role,
            expires_at: Number(payload.exp)
        };
    } catch (_) {
        return null;
    }
}

export function readUserSession(req) {
    const cookies = parseCookies(req);
    const token = cookies[USER_SESSION_COOKIE];
    if (token) {
        const parsed = verifyUserSessionToken(token);
        if (parsed) return parsed;
    }
    return null;
}

export function generateCsrfToken() {
    return randomBytes(24).toString('base64url');
}

export function buildCookieString(name, value, { req = null, maxAge = 0, httpOnly = true, sameSite = 'Lax' } = {}) {
    const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
    const httpOnlyFlag = httpOnly ? '; HttpOnly' : '';
    return `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=${sameSite}${httpOnlyFlag}${secureFlag}`;
}

export function buildSessionCookieHeaders({ req, userToken, adminToken = null, csrfToken = null }) {
    const cookies = [
        buildCookieString(USER_SESSION_COOKIE, userToken, {
            req,
            maxAge: USER_SESSION_TTL_SECONDS,
            httpOnly: true,
            sameSite: 'Lax'
        })
    ];
    if (adminToken) {
        cookies.push(buildCookieString('urbanscope_admin_session', adminToken, {
            req,
            maxAge: 12 * 60 * 60,
            httpOnly: true,
            sameSite: 'Lax'
        }));
    }
    if (csrfToken) {
        cookies.push(buildCookieString(CSRF_COOKIE, csrfToken, {
            req,
            maxAge: USER_SESSION_TTL_SECONDS,
            httpOnly: false,
            sameSite: 'Lax'
        }));
    }
    return cookies;
}

export function buildClearSessionCookies(req = null) {
    return [
        buildCookieString(USER_SESSION_COOKIE, '', { req, maxAge: 0, httpOnly: true }),
        buildCookieString('urbanscope_admin_session', '', { req, maxAge: 0, httpOnly: true }),
        buildCookieString(CSRF_COOKIE, '', { req, maxAge: 0, httpOnly: false })
    ];
}

/**
 * Strict Origin / Referer / Sec-Fetch-Site validation. Fails CLOSED on unknown/cross-site origins.
 */
export function isStrictSameOrigin(req) {
    const secFetchSite = String(getHeader(req, 'sec-fetch-site') || '').toLowerCase();
    if (secFetchSite === 'cross-site') return false;

    const host = String(getHeader(req, 'x-forwarded-host') || getHeader(req, 'host') || '').trim().toLowerCase();
    const allowedExtra = String(process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((o) => {
            try { return new URL(o.trim()).host.toLowerCase(); } catch (_) { return ''; }
        })
        .filter(Boolean);

    const isAllowedHost = (candidateHost) => {
        if (!candidateHost) return false;
        const clean = candidateHost.toLowerCase();
        if (host && clean === host) return true;
        if (allowedExtra.includes(clean)) return true;
        if (!isProductionRuntime() && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(clean)) return true;
        return false;
    };

    const origin = getHeader(req, 'origin');
    if (origin) {
        if (origin === 'null') return false;
        try {
            const originUrl = new URL(origin);
            return isAllowedHost(originUrl.host);
        } catch (_) {
            return false;
        }
    }

    const referer = getHeader(req, 'referer');
    if (referer) {
        try {
            const refUrl = new URL(referer);
            return isAllowedHost(refUrl.host);
        } catch (_) {
            return false;
        }
    }

    // If neither Origin nor Referer is present in production, deny cross-origin state changes
    if (isProductionRuntime()) {
        return secFetchSite === 'same-origin';
    }
    return true;
}

/**
 * Double-submit CSRF check: when a session cookie exists, require X-CSRF-Token matching urbanscope_csrf.
 * Falls back cleanly if client hasn't obtained CSRF cookie yet ONLY for unauthenticated login/public forms.
 */
export function verifyCsrfIfAuthenticated(req) {
    if (!isStrictSameOrigin(req)) return false;
    const cookies = parseCookies(req);
    const hasSessionCookie = Boolean(cookies[USER_SESSION_COOKIE] || cookies.urbanscope_admin_session);
    if (!hasSessionCookie) return true;

    const cookieCsrf = cookies[CSRF_COOKIE];
    const headerCsrf = String(getHeader(req, 'x-csrf-token') || '').trim();
    if (!cookieCsrf || !headerCsrf) return false;
    const a = Buffer.from(cookieCsrf, 'utf8');
    const b = Buffer.from(headerCsrf, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rate limiter backed by Supabase PostgreSQL atomic RPC (with safe in-memory fallback).
 */
export async function checkRateLimit({ key, limit = 10, windowSeconds = 60, blockSeconds = 300 }) {
    const cleanKey = String(key || '').slice(0, 250);
    if (!cleanKey) return true;

    const serviceKey = getServiceRoleKey();
    if (serviceKey) {
        try {
            const res = await fetch(restUrl('rpc/check_and_increment_rate_limit'), {
                method: 'POST',
                headers: serviceHeaders({}, true),
                body: JSON.stringify({
                    p_bucket: cleanKey,
                    p_limit: limit,
                    p_window_seconds: windowSeconds,
                    p_block_seconds: blockSeconds
                })
            });
            if (res.ok) {
                const allowed = await res.json().catch(() => null);
                if (typeof allowed === 'boolean') return allowed;
                if (Array.isArray(allowed) && typeof allowed[0] === 'boolean') return allowed[0];
            }
        } catch (_) {
            // Fall through to in-memory window if DB RPC isn't migrated yet
        }
    }

    const now = Date.now();
    const entry = LOCAL_RATE_BUCKETS.get(cleanKey);
    if (!entry) {
        LOCAL_RATE_BUCKETS.set(cleanKey, { count: 1, windowStart: now, blockedUntil: 0 });
        return true;
    }
    if (entry.blockedUntil && entry.blockedUntil > now) {
        return false;
    }
    if (now - entry.windowStart >= windowSeconds * 1000) {
        entry.count = 1;
        entry.windowStart = now;
        entry.blockedUntil = 0;
        return true;
    }
    entry.count += 1;
    if (entry.count > limit) {
        entry.blockedUntil = now + blockSeconds * 1000;
        return false;
    }
    return true;
}

/**
 * Bot defense: checks invisible honeypot field, optional form load timing, and optional Cloudflare Turnstile.
 */
export async function verifyBotDefense(req, body = {}) {
    const hp = String(body._hp ?? body.company_website ?? body.companyWebsite ?? body.website ?? '').trim();
    if (hp.length > 0) {
        return { ok: false, isHoneypot: true, error: 'Request rejected by automated spam filter.' };
    }

    const renderedRaw = body._ft ?? body.form_rendered_ms;
    if (renderedRaw !== undefined && renderedRaw !== null && renderedRaw !== '') {
        const renderedAt = Number(renderedRaw);
        if (Number.isFinite(renderedAt) && renderedAt > 0) {
            const elapsedMs = Date.now() - renderedAt;
            if (elapsedMs >= 0 && elapsedMs < 450) {
                return { ok: false, error: 'Submitted too quickly. Please try again.' };
            }
        }
    }

    const turnstileSecret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
    if (turnstileSecret) {
        const token = String(body.turnstileToken || body.turnstile_token || body['cf-turnstile-response'] || '').trim();
        if (!token) {
            return { ok: false, error: 'Please complete the human verification challenge.' };
        }
        try {
            const form = new URLSearchParams();
            form.set('secret', turnstileSecret);
            form.set('response', token);
            const ip = getClientIp(req);
            if (ip && ip !== 'unknown') form.set('remoteip', ip);

            const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: form.toString()
            });
            const data = await verifyRes.json().catch(() => ({}));
            if (!data.success) {
                return { ok: false, error: 'Human verification failed. Please reload and try again.' };
            }
        } catch (_) {
            return { ok: false, error: 'Bot verification service could not be reached.' };
        }
    }

    return { ok: true };
}

export function jsonWithCookies(payload, status = 200, res = null, { cookies = [], extraHeaders = {} } = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        ...extraHeaders
    };

    if (res && typeof res.setHeader === 'function') {
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        if (cookies.length > 0) res.setHeader('Set-Cookie', cookies);
        res.statusCode = status;
        res.end(JSON.stringify(payload));
        return;
    }

    const outHeaders = new Headers(headers);
    for (const c of cookies) outHeaders.append('Set-Cookie', c);
    return Response.json(payload, { status, headers: outHeaders });
}
