import { randomBytes } from 'node:crypto';
import {
    createAdminSessionToken,
    isAuthorizedAdminRole,
    readAdminSession
} from '../lib/admin-session.js';
import {
    consumeOtp,
    createPasswordHash,
    issueOtp,
    otpEnvironmentReady,
    parseJsonBody
} from '../lib/email-auth.js';
import {
    ALLOWED_ADMIN_EMAILS,
    buildClearSessionCookies,
    buildCookieString,
    buildSessionCookieHeaders,
    checkRateLimit,
    createUserSessionToken,
    CSRF_COOKIE,
    escapePostgrestFilterValue,
    generateCsrfToken,
    getClientIp,
    getServiceRoleKey,
    getSessionSecret,
    isStrictSameOrigin,
    isValidEmail,
    jsonWithCookies,
    normalizeAccountRole,
    normalizeEmail,
    parseCookies,
    readUserSession,
    restUrl,
    sanitizeImageUrl,
    sanitizePublicLeadAgent,
    sanitizeUser,
    serviceHeaders,
    verifyBotDefense,
    verifyCsrfIfAuthenticated,
    verifyPBKDF2Password
} from '../lib/server-security.js';

const DEFAULT_GOOGLE_CLIENT_ID = '981770655747-t222jr0ias09rl7aga3302p9am64so43.apps.googleusercontent.com';

function getGoogleClientId() {
    return String(process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID).trim();
}

function getActiveSession(req) {
    return readUserSession(req) || readAdminSession(req);
}

function parseMissingColumnFromPostgrestError(errText) {
    const match = String(errText || '').match(/Could not find the '([A-Za-z0-9_]+)' column/);
    return match ? match[1] : null;
}

const PROTECTED_USER_COLUMNS = new Set(['id', 'email', 'password_hash', 'role', 'google_id']);

async function writeUserMutation(url, method, payload, extraHeaders = {}) {
    const mutablePayload = { ...payload };
    for (let attempt = 0; attempt < 8; attempt += 1) {
        if (Object.keys(mutablePayload).length === 0) {
            return { ok: false, noOp: true, data: null };
        }
        let res;
        try {
            res = await fetch(url, {
                method,
                headers: serviceHeaders(extraHeaders, true),
                body: JSON.stringify(mutablePayload)
            });
        } catch (_) {
            return { ok: false, noOp: false, data: null };
        }
        if (res.ok) {
            const data = await res.json().catch(() => null);
            return { ok: true, res, data };
        }
        const errText = await res.text().catch(() => '');
        const missingCol = (res.status === 400 && (errText.includes('PGRST204') || errText.includes('Could not find the')))
            ? parseMissingColumnFromPostgrestError(errText)
            : null;
        if (missingCol && !PROTECTED_USER_COLUMNS.has(missingCol) && Object.prototype.hasOwnProperty.call(mutablePayload, missingCol)) {
            delete mutablePayload[missingCol];
            continue;
        }
        return { ok: false, res, noOp: false, data: null };
    }
    return { ok: false, noOp: false, data: null };
}

function isDeletedUserRow(row) {
    return !row || row.bio === '__URBANSCOPE_DELETED__' || row.password_hash === '__DELETED_ACCOUNT__';
}

async function fetchUserByEmailResult(email, preferredId = null) {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || !getServiceRoleKey()) {
        return { row: null, notFound: false, dbError: true };
    }

    const runQuery = async (query) => {
        try {
            const res = await fetch(restUrl('users', query), { headers: serviceHeaders({}, true) });
            if (!res.ok) return { ok: false, rows: [] };
            const rows = await res.json().catch(() => []);
            return { ok: true, rows: Array.isArray(rows) ? rows : [] };
        } catch (_) {
            return { ok: false, rows: [] };
        }
    };

    const exact = await runQuery({
        email: `eq.${cleanEmail}`,
        select: '*',
        limit: '1'
    });
    if (!exact.ok) {
        return { row: null, notFound: false, dbError: true };
    }
    if (exact.rows.length > 0) {
        const row = exact.rows[0];
        return isDeletedUserRow(row)
            ? { row: null, notFound: true, dbError: false }
            : { row, notFound: false, dbError: false };
    }

    // Fallback for legacy mixed-case emails in Supabase or ID-matched sessions
    if (preferredId !== undefined && preferredId !== null && String(preferredId) !== cleanEmail && /^\d+$/.test(String(preferredId))) {
        const byId = await runQuery({
            id: `eq.${String(preferredId)}`,
            select: '*',
            limit: '1'
        });
        if (!byId.ok) {
            return { row: null, notFound: false, dbError: true };
        }
        const idRow = byId.rows[0] || null;
        if (idRow && normalizeEmail(idRow.email) === cleanEmail) {
            return isDeletedUserRow(idRow)
                ? { row: null, notFound: true, dbError: false }
                : { row: idRow, notFound: false, dbError: false };
        }
    }

    const ci = await runQuery({
        email: `ilike.${escapePostgrestFilterValue(cleanEmail)}`,
        select: '*',
        limit: '10'
    });
    if (!ci.ok) {
        return { row: null, notFound: false, dbError: true };
    }
    const matched = ci.rows.find((r) => normalizeEmail(r.email) === cleanEmail) || null;
    if (!matched || isDeletedUserRow(matched)) {
        return { row: null, notFound: true, dbError: false };
    }
    return { row: matched, notFound: false, dbError: false };
}

async function fetchUserByEmail(email) {
    const result = await fetchUserByEmailResult(email);
    return result.row;
}

async function verifyGoogleCredentials({ credential, access_token }) {
    const clientId = getGoogleClientId();
    if (credential) {
        const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(credential))}`);
        if (!res.ok) return null;
        const info = await res.json().catch(() => ({}));
        if (info.aud !== clientId && info.azp !== clientId) return null;
        const email = normalizeEmail(info.email);
        const verified = info.email_verified === true || String(info.email_verified).toLowerCase() === 'true';
        if (!email || !verified || !info.sub) return null;
        return {
            google_id: String(info.sub),
            email,
            full_name: String(info.name || info.given_name || email.split('@')[0]).trim(),
            avatar_url: String(info.picture || '').trim()
        };
    }

    if (access_token) {
        const token = String(access_token);
        if (token.length > 8192) return null;
        const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
        if (!infoRes.ok) return null;
        const info = await infoRes.json().catch(() => ({}));
        if (info.aud !== clientId && info.azp !== clientId) return null;

        const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!profileRes.ok) return null;
        const profile = await profileRes.json().catch(() => ({}));
        const email = normalizeEmail(profile.email);
        const verified = profile.email_verified === true || String(profile.email_verified).toLowerCase() === 'true';
        if (!email || !verified || !profile.sub) return null;
        return {
            google_id: String(profile.sub),
            email,
            full_name: String(profile.name || profile.given_name || email.split('@')[0]).trim(),
            avatar_url: String(profile.picture || '').trim()
        };
    }

    return null;
}

function issueCookiesForUser(req, userRow) {
    const cleanEmail = normalizeEmail(userRow.email);
    const cleanRole = normalizeAccountRole(userRow.role, cleanEmail);
    const identity = { id: userRow.id ?? cleanEmail, email: cleanEmail, role: cleanRole };
    const userToken = createUserSessionToken(identity);
    const adminToken = (cleanRole === 'admin' || cleanRole === 'superadmin') && isAuthorizedAdminRole(cleanEmail, cleanRole)
        ? createAdminSessionToken(identity)
        : null;
    const cookiesObj = parseCookies(req);
    const csrfToken = (cookiesObj[CSRF_COOKIE] && cookiesObj[CSRF_COOKIE].length >= 16)
        ? cookiesObj[CSRF_COOKIE]
        : generateCsrfToken();

    return {
        cookies: buildSessionCookieHeaders({ req, userToken, adminToken, csrfToken }),
        role: cleanRole
    };
}

function redirectForRole(email, role) {
    if (role === 'superadmin' && isAuthorizedAdminRole(email, role)) return '/pages/superadmin/dashboard.html';
    if (role === 'admin' && isAuthorizedAdminRole(email, role)) return '/pages/admin/dashboard.html';
    return '/index.html';
}

export default async function handler(req, res) {
    const reqUrl = new URL(req.url, 'https://urbanscope.local');
    const queryAction = String(reqUrl.searchParams.get('action') || '').trim().toLowerCase();

    if (req.method === 'GET') {
        if (queryAction === 'csrf') {
            const cookiesObj = parseCookies(req);
            const csrfToken = (cookiesObj[CSRF_COOKIE] && cookiesObj[CSRF_COOKIE].length >= 16)
                ? cookiesObj[CSRF_COOKIE]
                : generateCsrfToken();
            const cookie = buildCookieString(CSRF_COOKIE, csrfToken, {
                req,
                maxAge: 7 * 24 * 60 * 60,
                httpOnly: false,
                sameSite: 'Lax'
            });
            return jsonWithCookies({ csrfToken }, 200, res, { cookies: [cookie] });
        }

        if (queryAction === 'config') {
            return jsonWithCookies({
                googleEnabled: Boolean(getGoogleClientId()),
                googleClientId: getGoogleClientId(),
                turnstileSiteKey: String(process.env.TURNSTILE_SITE_KEY || '').trim()
            }, 200, res);
        }

        if (queryAction === 'lead-agent') {
            try {
                if (!getServiceRoleKey()) {
                    return jsonWithCookies(sanitizePublicLeadAgent(null), 200, res);
                }
                const r = await fetch(restUrl('users', {
                    or: '(role.eq.admin,role.eq.superadmin,email.eq.miriamalobren@gmail.com,email.eq.admin.realestate@gmail.com,email.eq.miriam@gmail.com)',
                    select: 'email,full_name,phone,license_number,title,brokerage,bio,avatar_url,role',
                    order: 'id.asc'
                }), { headers: serviceHeaders({}, true) });
                if (!r.ok) return jsonWithCookies(sanitizePublicLeadAgent(null), 200, res);
                const rows = await r.json().catch(() => []);
                const activeRows = Array.isArray(rows)
                    ? rows.filter((u) => u && u.bio !== '__URBANSCOPE_DELETED__' && u.password_hash !== '__DELETED_ACCOUNT__')
                    : [];
                const preferred =
                    activeRows.find((u) => normalizeEmail(u.email) === 'miriamalobren@gmail.com') ||
                    activeRows.find((u) => u.role === 'admin' && !['admin.realestate@gmail.com', 'urbanscope.cvsu@gmail.com'].includes(normalizeEmail(u.email))) ||
                    activeRows.find((u) => u.role === 'admin') ||
                    activeRows[0] ||
                    null;
                return jsonWithCookies(sanitizePublicLeadAgent(preferred), 200, res);
            } catch (_) {
                return jsonWithCookies(sanitizePublicLeadAgent(null), 200, res);
            }
        }

        if (queryAction === 'me' || !queryAction) {
            const session = getActiveSession(req);
            if (!session) {
                return jsonWithCookies({ authenticated: false, user: null }, 401, res);
            }
            if (!getServiceRoleKey()) {
                return jsonWithCookies({
                    authenticated: true,
                    user: sanitizeUser({ id: session.id, email: session.email, role: session.role, email_verified_at: true })
                }, 200, res);
            }
            const lookup = await fetchUserByEmailResult(session.email, session.id);
            if (lookup.dbError) {
                return jsonWithCookies({ authenticated: false, error: 'Temporarily unable to verify session.' }, 503, res);
            }
            if (!lookup.row) {
                return jsonWithCookies({ authenticated: false, error: 'Session no longer valid.' }, 401, res, {
                    cookies: buildClearSessionCookies(req)
                });
            }
            return jsonWithCookies({
                authenticated: true,
                user: sanitizeUser(lookup.row)
            }, 200, res);
        }

        return jsonWithCookies({ success: false, error: 'Unsupported session query action.' }, 400, res);
    }

    if (req.method !== 'POST') {
        return jsonWithCookies({ success: false, error: 'Method not allowed.' }, 405, res);
    }

    if (!isStrictSameOrigin(req)) {
        return jsonWithCookies({ success: false, error: 'This request is not allowed.' }, 403, res);
    }

    const body = await parseJsonBody(req);
    const action = String(body.action || queryAction || '').trim().toLowerCase();
    const ip = getClientIp(req);

    if (action === 'logout') {
        if (!verifyCsrfIfAuthenticated(req)) {
            return jsonWithCookies({ success: false, error: 'CSRF validation failed.' }, 403, res);
        }
        return jsonWithCookies({ success: true, message: 'Signed out.' }, 200, res, {
            cookies: buildClearSessionCookies(req)
        });
    }

    if (!getServiceRoleKey()) {
        return jsonWithCookies({ success: false, error: 'Server database credentials are not configured.' }, 503, res);
    }

    if (getSessionSecret().length < 32) {
        return jsonWithCookies({ success: false, error: 'Server session secret is not configured. Set VERCEL_ADMIN_SESSION_SECRET (or URBANSCOPE_SECRET_KEY) in environment variables.' }, 503, res);
    }

    if (action === 'login') {
        const cleanEmail = normalizeEmail(body.email);
        const password = String(body.password || '');

        if (!await checkRateLimit({ key: `login:ip:${ip}`, limit: 12, windowSeconds: 300, blockSeconds: 600 })) {
            return jsonWithCookies({ success: false, error: 'Too many login attempts. Please wait a few minutes.' }, 429, res);
        }
        if (cleanEmail && !await checkRateLimit({ key: `login:acct:${cleanEmail}`, limit: 10, windowSeconds: 300, blockSeconds: 600 })) {
            return jsonWithCookies({ success: false, error: 'Too many login attempts for this account. Please try again later.' }, 429, res);
        }

        const botCheck = await verifyBotDefense(req, body);
        if (!botCheck.ok) {
            return jsonWithCookies({ success: false, error: botCheck.error || 'Verification failed.' }, 400, res);
        }

        if (!isValidEmail(cleanEmail) || !password) {
            return jsonWithCookies({ success: false, error: 'Enter a valid email and password.' }, 400, res);
        }

        const lookup = await fetchUserByEmailResult(cleanEmail);
        if (lookup.dbError) {
            return jsonWithCookies({ success: false, error: 'Unable to verify credentials right now. Please try again.' }, 503, res);
        }
        const userRow = lookup.row;
        if (!userRow || !userRow.password_hash || !verifyPBKDF2Password(password, userRow.password_hash)) {
            return jsonWithCookies({ success: false, error: 'Invalid email or password.' }, 401, res);
        }

        const normRole = normalizeAccountRole(userRow.role, cleanEmail);
        const hasEmailVerifiedCol = Object.prototype.hasOwnProperty.call(userRow, 'email_verified_at');
        if (hasEmailVerifiedCol && !userRow.email_verified_at && normRole === 'user') {
            return jsonWithCookies({ success: false, error: 'Verify your email address before logging in.' }, 403, res);
        }

        const { cookies, role } = issueCookiesForUser(req, userRow);
        return jsonWithCookies({
            success: true,
            user: sanitizeUser(userRow),
            redirect_url: redirectForRole(cleanEmail, role),
            message: 'Sign in successful'
        }, 200, res, { cookies });
    }

    if (action === 'google') {
        if (!await checkRateLimit({ key: `google_auth:ip:${ip}`, limit: 15, windowSeconds: 300, blockSeconds: 600 })) {
            return jsonWithCookies({ success: false, error: 'Too many requests. Please wait before trying again.' }, 429, res);
        }

        const googleInfo = await verifyGoogleCredentials(body);
        if (!googleInfo) {
            return jsonWithCookies({ success: false, error: 'Google token verification failed.' }, 401, res);
        }

        const cleanEmail = googleInfo.email;
        const safeSub = escapePostgrestFilterValue(googleInfo.google_id);
        const safeEmail = escapePostgrestFilterValue(cleanEmail);
        const lookupRes = await fetch(restUrl('users', {
            or: `(google_id.eq.${safeSub},email.eq.${safeEmail})`,
            select: '*'
        }), { headers: serviceHeaders({}, true) });

        if (!lookupRes.ok) {
            return jsonWithCookies({ success: false, error: 'Unable to verify Google account.' }, 502, res);
        }

        const rows = await lookupRes.json().catch(() => []);
        let existing = Array.isArray(rows) ? rows[0] : null;
        if (!existing) {
            const emailFallback = await fetchUserByEmailResult(cleanEmail);
            if (emailFallback.dbError) {
                return jsonWithCookies({ success: false, error: 'Unable to verify Google account.' }, 502, res);
            }
            existing = emailFallback.row;
        }
        if (existing) {
            if (existing.bio === '__URBANSCOPE_DELETED__' || existing.password_hash === '__DELETED_ACCOUNT__') {
                return jsonWithCookies({ success: false, error: 'This account has been deactivated.' }, 403, res);
            }

            const patch = {
                email_verified_at: existing.email_verified_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            if (!existing.google_id) patch.google_id = googleInfo.google_id;
            if (!String(existing.full_name || '').trim() && googleInfo.full_name) {
                patch.full_name = googleInfo.full_name;
            }
            const curAvatar = String(existing.avatar_url || '').trim();
            if (googleInfo.avatar_url && (!curAvatar || (existing.role !== 'admin' && existing.role !== 'superadmin' && curAvatar === 'assets/images/agent.jpg'))) {
                const avatarCheck = sanitizeImageUrl(googleInfo.avatar_url, { defaultValue: '' });
                if (avatarCheck.ok && avatarCheck.value) patch.avatar_url = avatarCheck.value;
            }

            await writeUserMutation(restUrl('users', { id: `eq.${existing.id}` }), 'PATCH', patch);

            const merged = { ...existing, ...patch };
            const { cookies, role } = issueCookiesForUser(req, merged);
            return jsonWithCookies({
                success: true,
                user: sanitizeUser(merged),
                redirect_url: redirectForRole(cleanEmail, role),
                message: 'Google sign-in successful'
            }, 200, res, { cookies });
        }

        // First-time Google signup: issue OTP to verified Gmail
        if (!otpEnvironmentReady()) {
            return jsonWithCookies({ success: false, error: 'Email verification is not configured on the server.' }, 503, res);
        }
        await issueOtp(cleanEmail, 'register', ip);
        const safeAvatarCheck = sanitizeImageUrl(googleInfo.avatar_url, { defaultValue: 'assets/images/agent.jpg' });
        return jsonWithCookies({
            success: true,
            requires_verification: true,
            email: cleanEmail,
            full_name: googleInfo.full_name,
            avatar_url: safeAvatarCheck.ok ? safeAvatarCheck.value : 'assets/images/agent.jpg',
            message: `We sent a 6-digit verification code to your Gmail (${cleanEmail}). Please verify to complete registration.`
        }, 200, res);
    }

    if (action === 'google-verify') {
        if (!await checkRateLimit({ key: `google_verify:ip:${ip}`, limit: 10, windowSeconds: 300, blockSeconds: 600 })) {
            return jsonWithCookies({ success: false, error: 'Too many attempts. Please wait a few minutes.' }, 429, res);
        }

        if (body.terms_accepted !== true) {
            return jsonWithCookies({ success: false, error: 'You must agree to the Terms of Service and Privacy Policy.' }, 400, res);
        }

        const cleanEmail = normalizeEmail(body.email);
        const code = String(body.code || '').trim();
        if (!isValidEmail(cleanEmail) || !/^\d{6}$/.test(code)) {
            return jsonWithCookies({ success: false, error: 'Check the verification code and email address.' }, 400, res);
        }
        if (ALLOWED_ADMIN_EMAILS.has(cleanEmail)) {
            return jsonWithCookies({ success: false, error: 'This email cannot be registered through the client sign-up flow.' }, 400, res);
        }

        const googleInfo = await verifyGoogleCredentials(body);
        if (!googleInfo || googleInfo.email !== cleanEmail) {
            return jsonWithCookies({ success: false, error: 'Google authentication token could not be verified.' }, 401, res);
        }

        if (!otpEnvironmentReady()) {
            return jsonWithCookies({ success: false, error: 'Email verification is not configured on the server.' }, 503, res);
        }
        const consumed = await consumeOtp(cleanEmail, 'register', code);
        if (!consumed) {
            return jsonWithCookies({ success: false, error: 'That verification code is invalid or expired.' }, 400, res);
        }

        const safeAvatarCheck = sanitizeImageUrl(googleInfo.avatar_url || body.avatar_url, { defaultValue: 'assets/images/agent.jpg' });
        const existingLookup = await fetchUserByEmailResult(cleanEmail);
        if (existingLookup.dbError) {
            return jsonWithCookies({ success: false, error: 'Unable to complete registration right now.' }, 503, res);
        }
        const existing = existingLookup.row;
        let savedUser = existing;

        if (existing) {
            const patchRes = await writeUserMutation(
                restUrl('users', { id: `eq.${existing.id}` }),
                'PATCH',
                {
                    email_verified_at: new Date().toISOString(),
                    google_id: existing.google_id || googleInfo.google_id,
                    updated_at: new Date().toISOString()
                },
                { Prefer: 'return=representation' }
            );
            const patched = patchRes.ok ? patchRes.data : [];
            if (Array.isArray(patched) && patched[0]) savedUser = patched[0];
        } else {
            const randomPwdHash = await createPasswordHash(randomBytes(24).toString('hex'));
            const insertRes = await writeUserMutation(
                restUrl('users'),
                'POST',
                {
                    email: cleanEmail,
                    password_hash: randomPwdHash,
                    full_name: googleInfo.full_name || String(body.full_name || cleanEmail.split('@')[0]).trim(),
                    phone: String(body.phone || '').trim().slice(0, 40),
                    role: 'client',
                    avatar_url: safeAvatarCheck.ok ? safeAvatarCheck.value : 'assets/images/agent.jpg',
                    google_id: googleInfo.google_id,
                    bio: '',
                    email_verified_at: new Date().toISOString()
                },
                { Prefer: 'return=representation' }
            );
            if (!insertRes.ok) {
                return jsonWithCookies({ success: false, error: 'Unable to complete registration right now.' }, 503, res);
            }
            const inserted = insertRes.data;
            savedUser = Array.isArray(inserted) ? inserted[0] : inserted;
        }

        const { cookies, role } = issueCookiesForUser(req, savedUser);
        return jsonWithCookies({
            success: true,
            user: sanitizeUser(savedUser),
            redirect_url: redirectForRole(cleanEmail, role),
            message: 'Account verified and registered successfully! Welcome to UrbanScope.'
        }, 200, res, { cookies });
    }

    if (action === 'update-profile') {
        if (!verifyCsrfIfAuthenticated(req)) {
            return jsonWithCookies({ success: false, error: 'CSRF validation failed.' }, 403, res);
        }
        const session = getActiveSession(req);
        if (!session) {
            return jsonWithCookies({ success: false, error: 'Authentication required.' }, 401, res);
        }

        const currentLookup = await fetchUserByEmailResult(session.email, session.id);
        if (currentLookup.dbError) {
            return jsonWithCookies({ success: false, error: 'Unable to update profile right now.' }, 503, res);
        }
        const currentUser = currentLookup.row;
        if (!currentUser) {
            return jsonWithCookies({ success: false, error: 'Account not found.' }, 404, res);
        }

        const sessionRole = normalizeAccountRole(currentUser.role, currentUser.email);
        const isStaff = sessionRole === 'admin' || sessionRole === 'superadmin';
        const patch = { updated_at: new Date().toISOString() };

        if (body.full_name !== undefined && String(body.full_name).trim()) {
            const cleanName = String(body.full_name).trim();
            if (cleanName.length < 2 || cleanName.length > 120) {
                return jsonWithCookies({ success: false, error: 'Full name must be between 2 and 120 characters.' }, 400, res);
            }
            patch.full_name = cleanName;
        }

        if (body.phone !== undefined) {
            const cleanPhone = String(body.phone).trim();
            if (cleanPhone.length > 40) {
                return jsonWithCookies({ success: false, error: 'Phone number is too long.' }, 400, res);
            }
            patch.phone = cleanPhone;
        }

        if (body.email !== undefined && String(body.email).trim()) {
            const nextEmail = normalizeEmail(body.email);
            if (!isValidEmail(nextEmail)) {
                return jsonWithCookies({ success: false, error: 'Enter a valid email address.' }, 400, res);
            }
            if (nextEmail !== normalizeEmail(currentUser.email)) {
                const duplicate = await fetchUserByEmail(nextEmail);
                if (duplicate && String(duplicate.id) !== String(currentUser.id)) {
                    return jsonWithCookies({ success: false, error: 'Email is already in use by another account.' }, 409, res);
                }
                patch.email = nextEmail;
            }
        }

        if (body.avatar_url !== undefined) {
            const avatarCheck = sanitizeImageUrl(body.avatar_url, { defaultValue: 'assets/images/agent.jpg' });
            if (!avatarCheck.ok) {
                return jsonWithCookies({ success: false, error: avatarCheck.error }, 400, res);
            }
            patch.avatar_url = avatarCheck.value;
        }

        if (isStaff) {
            if (body.license_number !== undefined) patch.license_number = String(body.license_number).trim().slice(0, 80);
            if (body.title !== undefined) patch.title = String(body.title).trim().slice(0, 120);
            if (body.brokerage !== undefined) patch.brokerage = String(body.brokerage).trim().slice(0, 160);
            if (body.bio !== undefined) {
                const cleanBio = String(body.bio).trim().slice(0, 2000);
                if (cleanBio === '__URBANSCOPE_DELETED__') {
                    return jsonWithCookies({ success: false, error: 'Invalid bio value.' }, 400, res);
                }
                patch.bio = cleanBio;
            }
        }

        const updateRes = await writeUserMutation(
            restUrl('users', { id: `eq.${currentUser.id}` }),
            'PATCH',
            patch,
            { Prefer: 'return=representation' }
        );
        if (!updateRes.ok) {
            return jsonWithCookies({ success: false, error: 'Unable to update profile right now.' }, 503, res);
        }
        const rows = updateRes.data;
        const updatedUser = Array.isArray(rows) && rows[0] ? rows[0] : { ...currentUser, ...patch };
        const { cookies } = issueCookiesForUser(req, updatedUser);
        return jsonWithCookies({
            success: true,
            user: sanitizeUser(updatedUser)
        }, 200, res, { cookies });
    }

    return jsonWithCookies({ success: false, error: 'Unsupported session action.' }, 400, res);
}

export { handler as fetch };

