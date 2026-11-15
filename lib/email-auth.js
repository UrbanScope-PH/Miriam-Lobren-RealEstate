import { createHmac, pbkdf2Sync, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildCookieString,
    cleanEnvSecret,
    escapePostgrestFilterValue,
    getOtpSecret,
    getServiceRoleKey,
    isStrictSameOrigin,
    parseCookies,
    serviceHeaders as strictServiceHeaders
} from './server-security.js';

const SUPABASE_URL = 'https://vfspjuqymfbagesjxjmc.supabase.co';
const DEFAULT_RESEND_FROM_EMAIL = 'UrbanScope <noreply@miriamlobren.site>';

function loadLocalEnv() {
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
        // Ignore .env read errors in serverless environments
    }
}

loadLocalEnv();

export function getHeader(req, name) {
    if (!req) return null;
    if (typeof req.headers?.get === 'function') {
        return req.headers.get(name);
    }
    const lower = name.toLowerCase();
    return req.headers?.[lower] || req.headers?.[name] || null;
}

export function jsonResponse(payload, status = 200, res = null, extraHeaders = {}) {
    if (res && typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        for (const [k, v] of Object.entries(extraHeaders)) {
            res.setHeader(k, v);
        }
        res.statusCode = status;
        res.end(JSON.stringify(payload));
        return;
    }
    return Response.json(payload, {
        status,
        headers: { 'Cache-Control': 'private, no-store, max-age=0', ...extraHeaders }
    });
}

export async function parseJsonBody(req) {
    if (!req) return {};
    const isStreamBody = Boolean(req.body && typeof req.body.getReader === 'function');
    if (req.body && typeof req.body === 'object' && !isStreamBody && !Buffer.isBuffer(req.body)) {
        return req.body;
    }
    if (typeof req.json === 'function') {
        try { return await req.json(); } catch (_) { return {}; }
    }
    if (Buffer.isBuffer(req.body)) {
        try { return JSON.parse(req.body.toString('utf8')); } catch (_) { return {}; }
    }
    if (typeof req.body === 'string') {
        try { return JSON.parse(req.body); } catch (_) { return {}; }
    }
    return new Promise((resolve) => {
        let raw = '';
        if (typeof req.on !== 'function') return resolve({});
        req.on('data', chunk => { raw += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(raw)); } catch (_) { resolve({}); }
        });
        req.on('error', () => resolve({}));
        setTimeout(() => resolve({}), 500);
    });
}

export function isSameOrigin(request) {
    return isStrictSameOrigin(request);
}

export function otpEnvironmentReady() {
    const hasSecret = getOtpSecret().length >= 32;
    const hasResend = Boolean(cleanEnvSecret(process.env.RESEND_API_KEY || ''));
    const hasServiceRole = Boolean(getServiceRoleKey());
    return hasSecret && hasResend && hasServiceRole;
}

export function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

export function isValidEmail(email) {
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function getValidFromSender(envSender) {
    let s = String(envSender || process.env.RESEND_FROM_EMAIL || '').trim();
    s = s.replace(/^["']|["']$/g, '').trim();

    if (!s) {
        return DEFAULT_RESEND_FROM_EMAIL;
    }

    const matchWithAngle = s.match(/^([^<]*)<([^>]+)>$/);
    if (matchWithAngle) {
        const name = matchWithAngle[1].trim();
        const email = matchWithAngle[2].trim();
        if (email.includes('@')) {
            return name ? `${name} <${email}>` : email;
        }
    }

    if (s.includes('@') && !s.includes('<') && !s.includes('>')) {
        return `UrbanScope <${s}>`;
    }

    if (s.includes('.') && !s.includes('@') && !s.includes('<') && !s.includes('>') && !/\s/.test(s)) {
        return `UrbanScope <noreply@${s}>`;
    }

    return `${s} <noreply@miriamlobren.site>`;
}

function escapeEmailHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getValidReplyTo(rawValue) {
    const cleaned = String(rawValue || '').replace(/[\r\n]+/g, ' ').trim();
    if (!cleaned) return null;
    const namedMatch = cleaned.match(/^([^<>]{1,100})<\s*([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)\s*>$/);
    if (namedMatch) {
        const displayName = namedMatch[1].trim().replace(/^["']|["']$/g, '');
        const address = namedMatch[2].trim().toLowerCase();
        return displayName ? `${displayName} <${address}>` : address;
    }
    if (/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(cleaned)) {
        return cleaned.toLowerCase();
    }
    return null;
}

export function wrapEmailHtmlDocument(title, bodyHtml) {
    const safeTitle = escapeEmailHtml(title || 'UrbanScope Notification');
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '<meta http-equiv="x-ua-compatible" content="ie=edge">',
        `<title>${safeTitle}</title>`,
        '</head>',
        '<body style="margin:0;padding:24px 16px;background-color:#f6faf6;font-family:Arial,\'Helvetica Neue\',Helvetica,sans-serif;color:#172b1d;line-height:1.55;">',
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #d7e5dc;border-radius:12px;">',
        '<tr>',
        '<td style="padding:20px 24px 16px;border-bottom:1px solid #e6efe8;">',
        '<div style="font-size:20px;font-weight:700;color:#1e5c33;letter-spacing:-0.01em;">UrbanScope</div>',
        '<div style="font-size:12px;color:#4f6856;margin-top:2px;">Miriam Lobren Real Estate</div>',
        '</td>',
        '</tr>',
        '<tr>',
        `<td style="padding:24px;font-size:15px;color:#20352a;">${bodyHtml}</td>`,
        '</tr>',
        '<tr>',
        '<td style="padding:16px 24px 20px;border-top:1px solid #e6efe8;background-color:#fbfdfb;font-size:12px;color:#5a7262;border-radius:0 0 12px 12px;">',
        'UrbanScope &middot; Miriam Lobren Real Estate &middot; Las Pi&ntilde;as City &amp; Cavite, Philippines<br>',
        '<a href="https://miriamlobren.site" style="color:#1e5c33;text-decoration:none;">https://miriamlobren.site</a><br>',
        'Automated transactional email sent in response to your account or inquiry activity.',
        '</td>',
        '</tr>',
        '</table>',
        '</body>',
        '</html>'
    ].join('');
}

export async function sendEmailWithFallback({ to, subject, text, html, replyTo = '', headers = {} }) {
    const apiKey = cleanEnvSecret(process.env.RESEND_API_KEY || '');
    if (!apiKey) {
        return { success: false, notConfigured: true };
    }

    const sender = getValidFromSender(process.env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM_EMAIL);
    const resolvedReplyTo = getValidReplyTo(replyTo || cleanEnvSecret(process.env.RESEND_REPLY_TO || ''));
    const extraHeaders = headers && typeof headers === 'object' ? headers : {};
    const payload = {
        from: sender,
        to: [to],
        subject: subject,
        text: text,
        html: html,
        headers: {
            'X-Entity-Ref-ID': randomUUID(),
            ...extraHeaders
        }
    };
    if (resolvedReplyTo) {
        payload.reply_to = resolvedReplyTo;
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(8000)
            : undefined,
        body: JSON.stringify(payload)
    });

    const resData = await emailRes.json().catch(() => ({}));
    if (!emailRes.ok) {
        const msg = String(resData.message || resData.error || '');
        throw new Error(msg || 'Resend delivery failed.');
    }

    return { success: true, provider: 'resend' };
}

function hmac(value) {
    const secret = getOtpSecret();
    if (secret.length < 32) {
        throw new Error('OTP secret is not configured.');
    }
    return createHmac('sha256', secret).update(value).digest('hex');
}

function serviceHeaders(extra = {}) {
    return strictServiceHeaders(extra, true);
}

function restUrl(path, query = {}) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return url;
}

export async function getCloudUser(email) {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return null;
    const headers = serviceHeaders();
    const response = await fetch(restUrl('users', {
        email: `eq.${cleanEmail}`,
        select: '*',
        limit: '1'
    }), { headers, cache: 'no-store' });
    if (!response.ok) throw new Error('Account lookup failed.');
    const rows = await response.json();
    if (Array.isArray(rows) && rows[0]) return rows[0];

    const escaped = escapePostgrestFilterValue(cleanEmail);
    if (!escaped) return null;
    const ilikeRes = await fetch(restUrl('users', {
        email: `ilike.${escaped}`,
        select: '*',
        limit: '5'
    }), { headers, cache: 'no-store' });
    if (!ilikeRes.ok) throw new Error('Account lookup failed.');
    const ilikeRows = await ilikeRes.json();
    if (!Array.isArray(ilikeRows)) return null;
    return ilikeRows.find((row) => normalizeEmail(row?.email) === cleanEmail) || null;
}

export async function getCloudUserById(id) {
    const response = await fetch(restUrl('users', {
        id: `eq.${id}`,
        select: '*'
    }), { headers: serviceHeaders(), cache: 'no-store' });
    if (!response.ok) throw new Error('Account lookup failed.');
    const rows = await response.json();
    return Array.isArray(rows) ? (rows[0] || null) : null;
}

function timeoutSignal(ms = 6000) {
    return (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
        ? AbortSignal.timeout(ms)
        : undefined;
}

function makeOtpError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

export function mapOtpErrorMessage(err, fallback = 'Verification service storage is temporarily unavailable. Please try again shortly.') {
    if (err?.code === 'OTP_SCHEMA_MISSING') {
        return 'Email verification database setup is incomplete. Apply the Supabase OTP migrations and try again.';
    }
    if (err?.code === 'OTP_DB_AUTH_FAILED') {
        return 'Database service credentials were rejected for email verification.';
    }
    if (/email delivery|resend/i.test(String(err?.message || ''))) {
        return 'Unable to send the verification code to your email right now. Please try again shortly.';
    }
    return fallback;
}

async function inspectPostgrestFailure(response) {
    const raw = await response.text().catch(() => '');
    let parsed = {};
    if (raw) {
        try { parsed = JSON.parse(raw); } catch (_) { parsed = {}; }
    }
    const code = String(parsed.code || '');
    const message = String(parsed.message || parsed.error || raw || '').slice(0, 240);
    const combined = `${code} ${message}`;
    return {
        status: response.status,
        code,
        message,
        isMissingSchema: response.status === 404 || /PGRST202|PGRST205|42P01|42883|Could not find the function|Could not find the table/i.test(combined),
        isAuthError: response.status === 401 || response.status === 403 || /42501|PGRST301|Invalid API key/i.test(combined)
    };
}

function throwFromFailure(failure, defaultMessage) {
    if (failure?.isMissingSchema) {
        throw makeOtpError('OTP_SCHEMA_MISSING', 'Challenge storage schema is not initialized in Supabase.');
    }
    if (failure?.isAuthError) {
        throw makeOtpError('OTP_DB_AUTH_FAILED', 'Challenge storage credentials rejected.');
    }
    throw makeOtpError('OTP_STORAGE_UNAVAILABLE', defaultMessage);
}

async function issueOtpViaTable(email, purpose, codeHash, ipHash) {
    const existingRes = await fetch(restUrl('auth_email_challenges', {
        email: `eq.${email}`,
        purpose: `eq.${purpose}`,
        select: 'created_at',
        limit: '1'
    }), { headers: serviceHeaders(), signal: timeoutSignal(6000) });
    if (!existingRes.ok) {
        const failure = await inspectPostgrestFailure(existingRes);
        console.error('[email-auth] auth_email_challenges lookup failed:', failure.status, failure.code, failure.message);
        throwFromFailure(failure, 'Challenge storage is unavailable.');
    }
    const existingRows = await existingRes.json().catch(() => []);
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (existing?.created_at) {
        const ageMs = Date.now() - new Date(existing.created_at).getTime();
        if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 60_000) {
            return false;
        }
    }

    // Best-effort IP hourly rate check against auth_email_challenge_requests if present
    try {
        const hourAgoIso = new Date(Date.now() - 60 * 60_000).toISOString();
        const ipRes = await fetch(restUrl('auth_email_challenge_requests', {
            ip_hash: `eq.${ipHash}`,
            created_at: `gt.${hourAgoIso}`,
            select: 'id',
            limit: '10'
        }), { headers: serviceHeaders(), signal: timeoutSignal(5000) });
        if (ipRes.ok) {
            const recent = await ipRes.json().catch(() => []);
            if (Array.isArray(recent) && recent.length >= 10) return false;
            await fetch(restUrl('auth_email_challenge_requests'), {
                method: 'POST',
                headers: serviceHeaders({ Prefer: 'return=minimal' }),
                signal: timeoutSignal(5000),
                body: JSON.stringify({ ip_hash: ipHash, created_at: new Date().toISOString() })
            }).catch(() => {});
        }
    } catch (_) {}

    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 10 * 60_000).toISOString();
    const upsertRes = await fetch(restUrl('auth_email_challenges', { on_conflict: 'email,purpose' }), {
        method: 'POST',
        headers: serviceHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        signal: timeoutSignal(6000),
        body: JSON.stringify({
            email,
            purpose,
            code_hash: codeHash,
            expires_at: expiresIso,
            attempts: 0,
            created_at: nowIso
        })
    });
    if (!upsertRes.ok) {
        const failure = await inspectPostgrestFailure(upsertRes);
        console.error('[email-auth] auth_email_challenges upsert failed:', failure.status, failure.code, failure.message);
        throwFromFailure(failure, 'Challenge storage is unavailable.');
    }
    return true;
}

async function verifyChallengeViaTable({ email, purpose, codeHash, consume }) {
    const res = await fetch(restUrl('auth_email_challenges', {
        email: `eq.${email}`,
        purpose: `eq.${purpose}`,
        select: 'code_hash,expires_at,attempts',
        limit: '1'
    }), { headers: serviceHeaders(), signal: timeoutSignal(6000) });
    if (!res.ok) {
        const failure = await inspectPostgrestFailure(res);
        console.error('[email-auth] auth_email_challenges read failed:', failure.status, failure.code, failure.message);
        throwFromFailure(failure, consume ? 'Challenge verification is unavailable.' : 'Challenge check is unavailable.');
    }
    const rows = await res.json().catch(() => []);
    const challenge = Array.isArray(rows) ? rows[0] : null;
    if (!challenge) return false;

    const attempts = Number(challenge.attempts) || 0;
    const expired = new Date(challenge.expires_at).getTime() <= Date.now();
    if (expired || attempts >= 5) {
        await fetch(restUrl('auth_email_challenges', {
            email: `eq.${email}`,
            purpose: `eq.${purpose}`
        }), { method: 'DELETE', headers: serviceHeaders(), signal: timeoutSignal(5000) }).catch(() => {});
        return false;
    }

    if (challenge.code_hash === codeHash) {
        if (consume) {
            await fetch(restUrl('auth_email_challenges', {
                email: `eq.${email}`,
                purpose: `eq.${purpose}`
            }), { method: 'DELETE', headers: serviceHeaders(), signal: timeoutSignal(5000) }).catch(() => {});
        }
        return true;
    }

    await fetch(restUrl('auth_email_challenges', {
        email: `eq.${email}`,
        purpose: `eq.${purpose}`
    }), {
        method: 'PATCH',
        headers: serviceHeaders({ Prefer: 'return=minimal' }),
        signal: timeoutSignal(5000),
        body: JSON.stringify({ attempts: attempts + 1 })
    }).catch(() => {});
    return false;
}

const OTP_CHALLENGE_COOKIE = 'urbanscope_otp_challenge';
const OTP_CHALLENGE_TTL_MS = 10 * 60_000;
const OTP_COOLDOWN_MS = 60_000;
const FALLBACK_CACHE_LIMIT = 1000;
const CONSUMED_FALLBACK_NONCES = new Map();
const FALLBACK_ATTEMPTS = new Map();
const FALLBACK_COOLDOWNS = new Map();

function pruneMapEntries(map, nowMs, extractExp) {
    for (const [key, value] of map.entries()) {
        if (extractExp(value) <= nowMs) {
            map.delete(key);
        }
    }
    while (map.size > FALLBACK_CACHE_LIMIT) {
        const oldestKey = map.keys().next().value;
        if (oldestKey === undefined) break;
        map.delete(oldestKey);
    }
}

function pruneFallbackMaps(nowMs = Date.now()) {
    pruneMapEntries(CONSUMED_FALLBACK_NONCES, nowMs, (expMs) => Number(expMs) || 0);
    pruneMapEntries(FALLBACK_ATTEMPTS, nowMs, (entry) => Number(entry?.expMs) || 0);
    pruneMapEntries(FALLBACK_COOLDOWNS, nowMs, (sentMs) => (Number(sentMs) || 0) + OTP_CHALLENGE_TTL_MS);
}

export function getOtpBindFingerprint(value) {
    const raw = String(value ?? '');
    if (!raw) return '';
    return createHmac('sha256', getOtpSecret())
        .update(`otp_bind:${raw}`)
        .digest('base64url')
        .slice(0, 24);
}

function encodeOtpChallengeToken(payload) {
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = createHmac('sha256', getOtpSecret())
        .update(`otp_cookie_v1:${payloadB64}`)
        .digest('base64url');
    return `${payloadB64}.${sig}`;
}

function decodeOtpChallengeToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const dot = rawToken.indexOf('.');
    if (dot <= 0) return null;
    const payloadB64 = rawToken.slice(0, dot);
    const sig = rawToken.slice(dot + 1);
    if (!payloadB64 || !sig) return null;

    const expectedSig = createHmac('sha256', getOtpSecret())
        .update(`otp_cookie_v1:${payloadB64}`)
        .digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
        const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || parsed.v !== 1) return null;
        return parsed;
    } catch (_) {
        return null;
    }
}

function queueChallengeCookie(otpCtx, cookieStr) {
    if (!otpCtx) return;
    if (!Array.isArray(otpCtx.cookies)) otpCtx.cookies = [];
    const prefix = `${OTP_CHALLENGE_COOKIE}=`;
    otpCtx.cookies = otpCtx.cookies.filter((c) => typeof c === 'string' && !c.startsWith(prefix));
    otpCtx.cookies.push(cookieStr);
}

function clearChallengeCookieOnCtx(otpCtx) {
    if (!otpCtx?.req) return;
    queueChallengeCookie(
        otpCtx,
        buildCookieString(OTP_CHALLENGE_COOKIE, '', {
            req: otpCtx.req,
            maxAge: 0,
            httpOnly: true,
            sameSite: 'Lax'
        })
    );
}

function issueOtpViaCookie({ email, purpose, codeHash, otpCtx }) {
    const now = Date.now();
    pruneFallbackMaps(now);

    const cooldownKey = `${purpose}:${email}`;
    const lastSentMs = Number(FALLBACK_COOLDOWNS.get(cooldownKey) || 0);
    if (lastSentMs > 0 && now - lastSentMs < OTP_COOLDOWN_MS) {
        return false;
    }

    const existingCookies = parseCookies(otpCtx.req);
    const existing = decodeOtpChallengeToken(existingCookies?.[OTP_CHALLENGE_COOKIE]);
    if (
        existing
        && existing.e === email
        && existing.p === purpose
        && Number(existing.exp || 0) > now
        && (now - Number(existing.iat || 0)) < OTP_COOLDOWN_MS
    ) {
        return false;
    }

    const nonce = randomBytes(12).toString('base64url');
    const exp = now + OTP_CHALLENGE_TTL_MS;
    const token = encodeOtpChallengeToken({
        v: 1,
        e: email,
        p: purpose,
        h: codeHash,
        n: nonce,
        b: String(otpCtx.bindValue || ''),
        iat: now,
        exp,
        a: 0
    });
    queueChallengeCookie(
        otpCtx,
        buildCookieString(OTP_CHALLENGE_COOKIE, token, {
            req: otpCtx.req,
            maxAge: Math.ceil(OTP_CHALLENGE_TTL_MS / 1000),
            httpOnly: true,
            sameSite: 'Lax'
        })
    );
    FALLBACK_COOLDOWNS.set(cooldownKey, now);
    return true;
}

function verifyChallengeViaCookie({ email, purpose, codeHash, consume, otpCtx }) {
    const now = Date.now();
    pruneFallbackMaps(now);

    const existingCookies = parseCookies(otpCtx.req);
    const decoded = decodeOtpChallengeToken(existingCookies?.[OTP_CHALLENGE_COOKIE]);
    if (!decoded) return false;

    const expectedBind = String(otpCtx.bindValue || '');
    if (decoded.e !== email || decoded.p !== purpose) return false;
    if (String(decoded.b || '') !== expectedBind) {
        clearChallengeCookieOnCtx(otpCtx);
        return false;
    }

    const nonce = String(decoded.n || '');
    const exp = Number(decoded.exp || 0);
    if (!nonce || !Number.isFinite(exp) || exp <= now || CONSUMED_FALLBACK_NONCES.has(nonce)) {
        clearChallengeCookieOnCtx(otpCtx);
        return false;
    }

    const prevAttempts = Math.max(Number(decoded.a) || 0, Number(FALLBACK_ATTEMPTS.get(nonce)?.count || 0));
    if (prevAttempts >= 5) {
        CONSUMED_FALLBACK_NONCES.set(nonce, exp);
        FALLBACK_ATTEMPTS.delete(nonce);
        clearChallengeCookieOnCtx(otpCtx);
        return false;
    }

    const hashA = Buffer.from(String(decoded.h || ''), 'utf8');
    const hashB = Buffer.from(String(codeHash || ''), 'utf8');
    const match = hashA.length > 0 && hashA.length === hashB.length && timingSafeEqual(hashA, hashB);

    if (match) {
        if (consume) {
            CONSUMED_FALLBACK_NONCES.set(nonce, exp);
            FALLBACK_ATTEMPTS.delete(nonce);
            FALLBACK_COOLDOWNS.delete(`${purpose}:${email}`);
            clearChallengeCookieOnCtx(otpCtx);
        }
        return true;
    }

    const nextAttempts = prevAttempts + 1;
    if (nextAttempts >= 5) {
        CONSUMED_FALLBACK_NONCES.set(nonce, exp);
        FALLBACK_ATTEMPTS.delete(nonce);
        clearChallengeCookieOnCtx(otpCtx);
    } else {
        FALLBACK_ATTEMPTS.set(nonce, { count: nextAttempts, expMs: exp });
        const updatedToken = encodeOtpChallengeToken({ ...decoded, a: nextAttempts });
        queueChallengeCookie(
            otpCtx,
            buildCookieString(OTP_CHALLENGE_COOKIE, updatedToken, {
                req: otpCtx.req,
                maxAge: Math.max(1, Math.ceil((exp - now) / 1000)),
                httpOnly: true,
                sameSite: 'Lax'
            })
        );
    }
    return false;
}

export async function issueOtp(email, purpose, clientIp, otpCtx = null) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = hmac(`${purpose}:${email}:${code}`);
    const ipHash = hmac(`ip:${clientIp || 'unknown'}`);

    let response;
    try {
        response = await fetch(restUrl('rpc/issue_auth_email_challenge'), {
            method: 'POST',
            headers: serviceHeaders(),
            signal: timeoutSignal(6000),
            body: JSON.stringify({
                p_email: email,
                p_purpose: purpose,
                p_code_hash: codeHash,
                p_ip_hash: ipHash
            })
        });
    } catch (netErr) {
        console.error('[email-auth] rpc/issue_auth_email_challenge network error:', netErr?.message || netErr);
        throw makeOtpError('OTP_STORAGE_UNAVAILABLE', 'Challenge storage is unavailable.');
    }

    let allowed = false;
    let storageMode = 'rpc';
    if (response.ok) {
        const issued = await response.json().catch(() => false);
        allowed = issued === true || (Array.isArray(issued) && issued[0] === true);
    } else {
        const failure = await inspectPostgrestFailure(response);
        console.error('[email-auth] rpc/issue_auth_email_challenge failed:', failure.status, failure.code, failure.message);
        if (failure.isMissingSchema) {
            try {
                allowed = await issueOtpViaTable(email, purpose, codeHash, ipHash);
                storageMode = 'table';
            } catch (tableErr) {
                if (tableErr?.code === 'OTP_SCHEMA_MISSING' && otpCtx?.req) {
                    console.warn('[email-auth] Supabase OTP schema missing; using signed HttpOnly challenge cookie fallback.');
                    allowed = issueOtpViaCookie({ email, purpose, codeHash, otpCtx });
                    storageMode = 'cookie';
                } else {
                    throw tableErr;
                }
            }
        } else {
            throwFromFailure(failure, 'Challenge storage is unavailable.');
        }
    }
    if (!allowed) return false;

    const isRegistration = purpose === 'register';
    const action = isRegistration ? 'verify your email address' : 'reset your password';
    const heading = isRegistration ? 'Email Verification Code' : 'Password Reset Code';
    const subject = isRegistration
        ? `Your UrbanScope verification code: ${code}`
        : `Your UrbanScope password reset code: ${code}`;
    const safeCode = escapeEmailHtml(code);
    const text = [
        'UrbanScope - Miriam Lobren Real Estate',
        '',
        `Use this one-time security code to ${action}:`,
        '',
        `${code}`,
        '',
        'This verification code expires in 10 minutes and can only be used once.',
        'For your security, do not share this code with anyone.',
        'If you did not request this code, you can safely ignore this message.',
        '',
        'UrbanScope | Miriam Lobren Real Estate',
        'Las Pinas City & Cavite, Philippines | https://miriamlobren.site'
    ].join('\n');
    const html = wrapEmailHtmlDocument(
        subject,
        `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#172b1d;">${heading}</h1>`
        + `<p style="margin:0 0 14px;">Use this one-time security code to ${action}:</p>`
        + '<div style="margin:18px 0;padding:16px 20px;background-color:#f0f7f2;border:1px solid #cbe0d1;border-radius:10px;text-align:center;">'
        + `<span style="font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#1e5c33;">${safeCode}</span>`
        + '</div>'
        + '<p style="margin:0 0 10px;font-size:14px;color:#2c4234;">This verification code expires in <strong>10 minutes</strong> and can only be used once.</p>'
        + '<p style="margin:0;font-size:13px;color:#4f6856;">For your security, do not share this code with anyone. If you did not request this code, you can safely ignore this message.</p>'
    );
    try {
        const dispatch = await sendEmailWithFallback({
            to: email,
            subject,
            text,
            html
        });
        if (!dispatch?.success) {
            throw new Error('Email delivery failed.');
        }
        return true;
    } catch (_) {
        if (storageMode === 'cookie') {
            FALLBACK_COOLDOWNS.delete(`${purpose}:${email}`);
            clearChallengeCookieOnCtx(otpCtx);
        } else {
            await fetch(restUrl('auth_email_challenges', {
                email: `eq.${email}`,
                purpose: `eq.${purpose}`
            }), { method: 'DELETE', headers: serviceHeaders() }).catch(() => {});
        }
        throw new Error('Email delivery failed.');
    }
}

async function verifyChallengeCode({ email, purpose, code, consume, otpCtx = null }) {
    const codeHash = hmac(`${purpose}:${email}:${code}`);
    const rpcName = consume ? 'consume_auth_email_challenge' : 'check_auth_email_challenge';
    const defaultMsg = consume ? 'Challenge verification is unavailable.' : 'Challenge check is unavailable.';

    let response;
    try {
        response = await fetch(restUrl(`rpc/${rpcName}`), {
            method: 'POST',
            headers: serviceHeaders(),
            signal: timeoutSignal(6000),
            body: JSON.stringify({ p_email: email, p_purpose: purpose, p_code_hash: codeHash })
        });
    } catch (netErr) {
        console.error(`[email-auth] rpc/${rpcName} network error:`, netErr?.message || netErr);
        throw makeOtpError('OTP_STORAGE_UNAVAILABLE', defaultMsg);
    }

    if (response.ok) {
        const result = await response.json().catch(() => false);
        return result === true || (Array.isArray(result) && result[0] === true);
    }

    const failure = await inspectPostgrestFailure(response);
    console.error(`[email-auth] rpc/${rpcName} failed:`, failure.status, failure.code, failure.message);
    if (failure.isMissingSchema) {
        try {
            return await verifyChallengeViaTable({ email, purpose, codeHash, consume });
        } catch (tableErr) {
            if (tableErr?.code === 'OTP_SCHEMA_MISSING' && otpCtx?.req) {
                return verifyChallengeViaCookie({ email, purpose, codeHash, consume, otpCtx });
            }
            throw tableErr;
        }
    }
    throwFromFailure(failure, defaultMsg);
}

export async function consumeOtp(email, purpose, code, otpCtx = null) {
    return verifyChallengeCode({ email, purpose, code, consume: true, otpCtx });
}

export async function checkOtp(email, purpose, code, otpCtx = null) {
    return verifyChallengeCode({ email, purpose, code, consume: false, otpCtx });
}

export async function createPasswordHash(password) {
    const salt = randomBytes(16).toString('hex');
    const derived = pbkdf2Sync(password, Buffer.from(salt, 'utf8'), 100000, 32, 'sha256').toString('hex');
    return `${salt}$${derived}`;
}

const OPTIONAL_USER_COLUMNS = ['email_verified_at', 'bio', 'updated_at', 'google_id'];

async function writeCloudUserMutation(method, query, payload, errorMessage) {
    const url = restUrl('users', query);
    const headers = serviceHeaders({ Prefer: 'return=representation' });
    const candidatePayload = { ...(payload || {}) };

    for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await fetch(url, {
            method,
            headers,
            body: JSON.stringify(candidatePayload)
        });
        if (response.ok) {
            const rows = await response.json().catch(() => []);
            return Array.isArray(rows) ? (rows[0] || null) : null;
        }
        if (response.status !== 400) {
            throw new Error(errorMessage);
        }
        const errText = await response.text().catch(() => '');
        const colMatch = errText.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);
        const missingCol = colMatch?.[1];
        if (missingCol && OPTIONAL_USER_COLUMNS.includes(missingCol) && Object.prototype.hasOwnProperty.call(candidatePayload, missingCol)) {
            delete candidatePayload[missingCol];
            continue;
        }
        const matchedOptional = OPTIONAL_USER_COLUMNS.find(
            (col) => Object.prototype.hasOwnProperty.call(candidatePayload, col) && new RegExp(`\\b${col}\\b`, 'i').test(errText)
        );
        if (matchedOptional && /pgrst204|column/i.test(errText)) {
            delete candidatePayload[matchedOptional];
            continue;
        }
        throw new Error(errorMessage);
    }
    throw new Error(errorMessage);
}

export async function updateCloudUser(email, patch) {
    return writeCloudUserMutation('PATCH', { email: `eq.${email}` }, { ...patch }, 'Account update failed.');
}

export async function updateCloudUserById(id, patch) {
    return writeCloudUserMutation('PATCH', { id: `eq.${id}` }, { ...patch }, 'Account update failed.');
}

export async function insertCloudUser(record) {
    return writeCloudUserMutation('POST', {}, { ...record }, 'Account creation failed.');
}

export async function deleteCloudUserAndAssociatedData(id, email) {
    const cleanEmail = normalizeEmail(email);
    const cleanId = String(id || '').trim();

    // Query all matching user IDs for this email (including historical/deleted)
    const matchingIds = new Set();
    if (/^\d+$/.test(cleanId)) matchingIds.add(cleanId);
    const safeFilterEmail = escapePostgrestFilterValue(cleanEmail);
    if (safeFilterEmail) {
        try {
            const uRes = await fetch(restUrl('users', {
                select: 'id',
                or: `(email.ilike.${safeFilterEmail},email.ilike.deleted_*_${safeFilterEmail})`
            }), {
                headers: serviceHeaders()
            });
            if (uRes.ok) {
                const uRows = await uRes.json().catch(() => []);
                if (Array.isArray(uRows)) {
                    uRows.forEach(u => { if (u && u.id) matchingIds.add(String(u.id)); });
                }
            }
        } catch (_) {}
    }

    // 1. Delete inquiries & appointments by client_email
    if (cleanEmail) {
        await fetch(restUrl('inquiries', { client_email: `ilike.${cleanEmail}` }), {
            method: 'DELETE',
            headers: serviceHeaders()
        }).catch(() => {});
        await fetch(restUrl('appointments', { client_email: `ilike.${cleanEmail}` }), {
            method: 'DELETE',
            headers: serviceHeaders()
        }).catch(() => {});
    }
    // 2. Delete inquiries, saved_properties, notifications, and appointments by all matching user IDs
    for (const uid of matchingIds) {
        await fetch(restUrl('inquiries', { client_id: `eq.${uid}` }), {
            method: 'DELETE',
            headers: serviceHeaders()
        }).catch(() => {});
        await fetch(restUrl('saved_properties', { user_id: `eq.${uid}` }), {
            method: 'DELETE',
            headers: serviceHeaders()
        }).catch(() => {});
        await fetch(restUrl('notifications', { user_id: `eq.${uid}` }), {
            method: 'DELETE',
            headers: serviceHeaders()
        }).catch(() => {});
        await fetch(restUrl('appointments', { client_id: `eq.${uid}` }), {
            method: 'DELETE',
            headers: serviceHeaders()
        }).catch(() => {});
    }
    // 3. Delete user from users table
    let physicallyDeleted = false;
    if (/^\d+$/.test(cleanId)) {
        const delRes = await fetch(restUrl('users', { id: `eq.${cleanId}` }), {
            method: 'DELETE',
            headers: serviceHeaders({ Prefer: 'return=representation' })
        }).catch(() => null);
        if (delRes && delRes.ok) {
            const rows = await delRes.json().catch(() => []);
            if (Array.isArray(rows) && rows.length > 0) physicallyDeleted = true;
        }
    }
    if (!physicallyDeleted && cleanEmail) {
        const delRes = await fetch(restUrl('users', { email: `ilike.${cleanEmail}` }), {
            method: 'DELETE',
            headers: serviceHeaders({ Prefer: 'return=representation' })
        }).catch(() => null);
        if (delRes && delRes.ok) {
            const rows = await delRes.json().catch(() => []);
            if (Array.isArray(rows) && rows.length > 0) physicallyDeleted = true;
        }
    }

    // 4. If physical delete didn't remove row, scramble email and set soft delete markers
    if (!physicallyDeleted) {
        const now = new Date().toISOString();
        const scrambledEmail = `deleted_${Date.now()}_${cleanEmail || cleanId}`;
        const patch = {
            email: scrambledEmail,
            bio: '__URBANSCOPE_DELETED__',
            google_id: null,
            updated_at: now
        };
        let patched = null;
        if (/^\d+$/.test(cleanId)) {
            patched = await updateCloudUserById(cleanId, patch).catch(() => null);
        }
        if (!patched && cleanEmail) {
            patched = await updateCloudUser(cleanEmail, patch).catch(() => null);
        }
        if (!patched) {
            const stillById = /^\d+$/.test(cleanId) ? await getCloudUserById(cleanId).catch(() => null) : null;
            const stillByEmail = !stillById && cleanEmail ? await getCloudUser(cleanEmail).catch(() => null) : null;
            if (stillById || stillByEmail) {
                throw new Error('Unable to remove account from cloud database.');
            }
        }
    }
    return true;
}
