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

export async function issueOtp(email, purpose, clientIp) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = hmac(`${purpose}:${email}:${code}`);
    const ipHash = hmac(`ip:${clientIp || 'unknown'}`);
    const response = await fetch(restUrl('rpc/issue_auth_email_challenge'), {
        method: 'POST',
        headers: serviceHeaders(),
        body: JSON.stringify({
            p_email: email,
            p_purpose: purpose,
            p_code_hash: codeHash,
            p_ip_hash: ipHash
        })
    });
    if (!response.ok) throw new Error('Challenge storage is unavailable.');
    const issued = await response.json().catch(() => false);
    const allowed = issued === true || (Array.isArray(issued) && issued[0] === true);
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

export async function consumeOtp(email, purpose, code) {
    const codeHash = hmac(`${purpose}:${email}:${code}`);
    const response = await fetch(restUrl('rpc/consume_auth_email_challenge'), {
        method: 'POST',
        headers: serviceHeaders(),
        body: JSON.stringify({ p_email: email, p_purpose: purpose, p_code_hash: codeHash })
    });
    if (!response.ok) throw new Error('Challenge verification is unavailable.');
    const consumed = await response.json().catch(() => false);
    return consumed === true || (Array.isArray(consumed) && consumed[0] === true);
}

export async function checkOtp(email, purpose, code) {
    const codeHash = hmac(`${purpose}:${email}:${code}`);
    const response = await fetch(restUrl('rpc/check_auth_email_challenge'), {
        method: 'POST',
        headers: serviceHeaders(),
        body: JSON.stringify({ p_email: email, p_purpose: purpose, p_code_hash: codeHash })
    });
    if (!response.ok) throw new Error('Challenge check is unavailable.');
    const valid = await response.json().catch(() => false);
    return valid === true || (Array.isArray(valid) && valid[0] === true);
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
