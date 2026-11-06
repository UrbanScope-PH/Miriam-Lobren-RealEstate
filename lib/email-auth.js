import { createHmac, pbkdf2Sync, randomBytes, randomInt } from 'node:crypto';
import nodemailer from 'nodemailer';

const SUPABASE_URL = 'https://vfspjuqymfbagesjxjmc.supabase.co';
const SUPABASE_DEFAULT_ANON = 'sb_publishable_96sfQ4F18ypajf6bitBRqg_JtWTL4__';

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
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.json === 'function') {
        try { return await req.json(); } catch (_) { return {}; }
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
    const origin = getHeader(request, 'origin');
    if (!origin) return true;
    const host = getHeader(request, 'x-forwarded-host') || getHeader(request, 'host');
    if (!host) return true;
    try {
        const originUrl = new URL(origin);
        return originUrl.host === host;
    } catch (_) {
        return true;
    }
}

export function otpEnvironmentReady() {
    const hasSecret = String(process.env.AUTH_OTP_SECRET || 'urbanscope-otp-fallback-secret-key-at-least-32-chars').trim().length >= 32;
    const hasSmtp = Boolean(String(process.env.SMTP_USER || 'gianticaya@gmail.com').trim() && String(process.env.SMTP_PASS || 'gtszlggkmcvvkpsz').trim());
    const hasResend = Boolean(String(process.env.RESEND_API_KEY || '').trim());
    return hasSecret && (hasSmtp || hasResend);
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
        return 'UrbanScope <onboarding@resend.dev>';
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

    return `${s} <onboarding@resend.dev>`;
}

export async function sendEmailWithFallback({ to, subject, text, html }) {
    const smtpUser = String(process.env.SMTP_USER || 'gianticaya@gmail.com').trim();
    const smtpPass = String(process.env.SMTP_PASS || 'gtszlggkmcvvkpsz').trim().replace(/\s+/g, '');

    // 1. Prioritize Gmail SMTP if configured (no domain restrictions, delivers to ANY inbox!)
    if (smtpUser && smtpPass) {
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                }
            });

            await transporter.sendMail({
                from: `UrbanScope <${smtpUser}>`,
                to: to,
                subject: subject,
                text: text,
                html: html
            });

            return { success: true, provider: 'smtp' };
        } catch (smtpErr) {
            console.error('Gmail SMTP delivery error:', smtpErr);
            throw new Error(`Gmail SMTP delivery failed: ${smtpErr.message}`);
        }
    }

    // 2. Fallback to Resend if RESEND_API_KEY is configured
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    if (apiKey) {
        const sender = getValidFromSender(process.env.RESEND_FROM_EMAIL);
        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
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

    return { success: false, notConfigured: true };
}

function hmac(value) {
    const secret = String(process.env.AUTH_OTP_SECRET || 'urbanscope-otp-fallback-secret-key-at-least-32-chars').trim();
    return createHmac('sha256', secret).update(value).digest('hex');
}

function serviceHeaders(extra = {}) {
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || SUPABASE_DEFAULT_ANON).trim();
    return {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...extra
    };
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
        await sendEmailWithFallback({
            to: email,
            subject: isRegistration ? 'Verify your UrbanScope email' : 'Your UrbanScope password reset code',
            text: `Your UrbanScope code to ${action} is ${code}. It expires in 10 minutes and can only be used once. If you did not request this, ignore this email.`,
            html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#20352a"><h2>UrbanScope</h2><p>Use this code to ${action}:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#245b37">${code}</p><p>This code expires in 10 minutes and can be used once.</p><p>If you did not request this, you can ignore this email.</p></div>`
        });
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

export async function createPasswordHash(password) {
    const salt = randomBytes(16).toString('hex');
    const derived = pbkdf2Sync(password, Buffer.from(salt, 'utf8'), 100000, 32, 'sha256').toString('hex');
    return `${salt}$${derived}`;
}

export async function updateCloudUser(email, patch) {
    const safePatch = { ...patch };
    delete safePatch.email_verified_at;
    const response = await fetch(restUrl('users', {
        email: `eq.${email}`
    }), {
        method: 'PATCH',
        headers: serviceHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(safePatch)
    });
    if (!response.ok) throw new Error('Account update failed.');
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? (rows[0] || null) : null;
}

export async function updateCloudUserById(id, patch) {
    const safePatch = { ...patch };
    delete safePatch.email_verified_at;
    const response = await fetch(restUrl('users', { id: `eq.${id}` }), {
        method: 'PATCH',
        headers: serviceHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(safePatch)
    });
    if (!response.ok) throw new Error('Account update failed.');
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? (rows[0] || null) : null;
}

export async function insertCloudUser(record) {
    const safeRecord = { ...record };
    delete safeRecord.email_verified_at;
    const response = await fetch(restUrl('users'), {
        method: 'POST',
        headers: serviceHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(safeRecord)
    });
    if (!response.ok) throw new Error('Account creation failed.');
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? (rows[0] || null) : null;
}
