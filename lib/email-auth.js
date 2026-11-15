import { createHmac, pbkdf2Sync, randomBytes, randomInt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    cleanEnvSecret,
    escapePostgrestFilterValue,
    getOtpSecret,
    getServiceRoleKey,
    isStrictSameOrigin,
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

export async function sendEmailWithFallback({ to, subject, text, html }) {
    const apiKey = cleanEnvSecret(process.env.RESEND_API_KEY || '');
    if (!apiKey) {
        return { success: false, notConfigured: true };
    }

    const sender = getValidFromSender(process.env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM_EMAIL);
    const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(8000)
            : undefined,
        body: JSON.stringify({
            from: sender,
            to: [to],
            subject: subject,
            text: text,
            html: html
        })
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
    const response = await fetch(restUrl('users', {
        email: `eq.${email}`,
        select: 'id,email,password_hash,role,full_name,phone,avatar_url,bio'
    }), { headers: serviceHeaders(), cache: 'no-store' });
    if (!response.ok) throw new Error('Account lookup failed.');
    const rows = await response.json();
    return Array.isArray(rows) ? (rows[0] || null) : null;
}

export async function getCloudUserById(id) {
    const response = await fetch(restUrl('users', {
        id: `eq.${id}`,
        select: 'id,email,password_hash,role,full_name,phone,avatar_url,bio,created_at'
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

export async function issueOtp(email, purpose, clientIp) {
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
    if (response.ok) {
        const issued = await response.json().catch(() => false);
        allowed = issued === true || (Array.isArray(issued) && issued[0] === true);
    } else {
        const failure = await inspectPostgrestFailure(response);
        console.error('[email-auth] rpc/issue_auth_email_challenge failed:', failure.status, failure.code, failure.message);
        if (failure.isMissingSchema) {
            allowed = await issueOtpViaTable(email, purpose, codeHash, ipHash);
        } else {
            throwFromFailure(failure, 'Challenge storage is unavailable.');
        }
    }
    if (!allowed) return false;

    const isRegistration = purpose === 'register';
    const action = isRegistration ? 'verify your email address' : 'reset your password';
    try {
        const dispatch = await sendEmailWithFallback({
            to: email,
            subject: isRegistration ? 'Verify your UrbanScope email' : 'Your UrbanScope password reset code',
            text: `Your UrbanScope code to ${action} is ${code}. It expires in 10 minutes and can only be used once. If you did not request this, ignore this email.`,
            html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#20352a"><h2>UrbanScope</h2><p>Use this code to ${action}:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#245b37">${code}</p><p>This code expires in 10 minutes and can be used once.</p><p>If you did not request this, you can ignore this email.</p></div>`
        });
        if (!dispatch?.success) {
            throw new Error('Email delivery failed.');
        }
        return true;
    } catch (_) {
        await fetch(restUrl('auth_email_challenges', {
            email: `eq.${email}`,
            purpose: `eq.${purpose}`
        }), { method: 'DELETE', headers: serviceHeaders() }).catch(() => {});
        throw new Error('Email delivery failed.');
    }
}

async function verifyChallengeCode({ email, purpose, code, consume }) {
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
        return await verifyChallengeViaTable({ email, purpose, codeHash, consume });
    }
    throwFromFailure(failure, defaultMsg);
}

export async function consumeOtp(email, purpose, code) {
    return verifyChallengeCode({ email, purpose, code, consume: true });
}

export async function checkOtp(email, purpose, code) {
    return verifyChallengeCode({ email, purpose, code, consume: false });
}

export async function createPasswordHash(password) {
    const salt = randomBytes(16).toString('hex');
    const derived = pbkdf2Sync(password, Buffer.from(salt, 'utf8'), 100000, 32, 'sha256').toString('hex');
    return `${salt}$${derived}`;
}

async function writeCloudUserMutation(method, query, payload, errorMessage) {
    const url = restUrl('users', query);
    const headers = serviceHeaders({ Prefer: 'return=representation' });
    let response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
    });
    if (!response.ok && response.status === 400 && Object.prototype.hasOwnProperty.call(payload || {}, 'email_verified_at')) {
        const errText = await response.text().catch(() => '');
        if (/email_verified_at|pgrst204/i.test(errText)) {
            const fallbackPayload = { ...payload };
            delete fallbackPayload.email_verified_at;
            response = await fetch(url, {
                method,
                headers,
                body: JSON.stringify(fallbackPayload)
            });
        }
    }
    if (!response.ok) throw new Error(errorMessage);
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? (rows[0] || null) : null;
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
