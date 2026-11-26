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
    mapOtpErrorMessage,
    otpEnvironmentReady,
    parseJsonBody
} from '../lib/email-auth.js';
import {
    ALLOWED_ADMIN_EMAILS,
    buildClearAdminOnlyCookie,
    buildClearSessionCookies,
    buildCookieString,
    buildSessionCookieHeaders,
    checkRateLimit,
    createUserSessionToken,
    CSRF_COOKIE,
    escapePostgrestFilterValue,
    fetchCloudUserByEmailResult,
    generateCsrfToken,
    getClientIp,
    getGoogleClientId,
    getServiceRoleKey,
    getSessionSecret,
    isDeletedUserRow,
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

function getActiveSession(req) {
    return readUserSession(req) || readAdminSession(req);
}

function parseMissingColumnFromPostgrestError(errText) {
    const match = String(errText || '').match(/Could not find the '([A-Za-z0-9_]+)' column/);
    return match ? match[1] : null;
}

const PROTECTED_USER_COLUMNS = new Set(['id', 'email', 'password_hash', 'role', 'google_id']);

async function writeUserMutation(url, method, payload, extraHeaders = {}, options = {}) {
    const mutablePayload = { ...payload };
    const optionalProtected = new Set(Array.isArray(options.optionalProtectedColumns) ? options.optionalProtectedColumns : []);
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
        if (
            missingCol &&
            (!PROTECTED_USER_COLUMNS.has(missingCol) || optionalProtected.has(missingCol)) &&
            Object.prototype.hasOwnProperty.call(mutablePayload, missingCol)
        ) {
            delete mutablePayload[missingCol];
            continue;
        }
        return { ok: false, res, noOp: false, data: null };
    }
    return { ok: false, noOp: false, data: null };
}

async function fetchUserByEmailResult(email, preferredId = null) {
    return fetchCloudUserByEmailResult(email, { preferredId });
}

async function fetchUserByEmail(email) {
    const result = await fetchUserByEmailResult(email);
    return result.row;
}

async function verifyGoogleCredentials({ credential, access_token }) {
    if (!credential && !access_token) {
        return { ok: false, reason: 'missing' };
    }

    const clientId = getGoogleClientId();
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(6500)
        : undefined;

    if (credential) {
        let res;
        try {
            res = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(credential))}`,
                signal ? { signal } : undefined
            );
        } catch (_) {
            return { ok: false, reason: 'network_error' };
        }
        if (res.status >= 500) return { ok: false, reason: 'network_error' };
        if (!res.ok) return { ok: false, reason: 'invalid_token' };
        const info = await res.json().catch(() => ({}));
        if (info.aud !== clientId && info.azp !== clientId) {
            return { ok: false, reason: 'invalid_token' };
        }
        const email = normalizeEmail(info.email);
        const verified = info.email_verified === true || String(info.email_verified).toLowerCase() === 'true';
        if (!email || !verified || !info.sub) {
            return { ok: false, reason: 'invalid_token' };
        }
        return {
            ok: true,
            data: {
                google_id: String(info.sub),
                email,
                full_name: String(info.name || info.given_name || email.split('@')[0]).trim(),
                avatar_url: String(info.picture || '').trim()
            }
        };
    }

    if (access_token) {
        const token = String(access_token);
        if (token.length > 8192) return { ok: false, reason: 'invalid_token' };

        let infoRes;
        try {
            infoRes = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
                signal ? { signal } : undefined
            );
        } catch (_) {
            return { ok: false, reason: 'network_error' };
        }
        if (infoRes.status >= 500) return { ok: false, reason: 'network_error' };
        if (!infoRes.ok) return { ok: false, reason: 'invalid_token' };
        const info = await infoRes.json().catch(() => ({}));
        if (info.aud !== clientId && info.azp !== clientId) {
            return { ok: false, reason: 'invalid_token' };
        }

        let profileRes;
        try {
            profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${token}` },
                ...(signal ? { signal } : {})
            });
        } catch (_) {
            return { ok: false, reason: 'network_error' };
        }
        if (profileRes.status >= 500) return { ok: false, reason: 'network_error' };
        if (!profileRes.ok) return { ok: false, reason: 'invalid_token' };
        const profile = await profileRes.json().catch(() => ({}));
        const email = normalizeEmail(profile.email);
        const verified = profile.email_verified === true || String(profile.email_verified).toLowerCase() === 'true';
        if (!email || !verified || !profile.sub) {
            return { ok: false, reason: 'invalid_token' };
        }
        return {
            ok: true,
            data: {
                google_id: String(profile.sub),
                email,
                full_name: String(profile.name || profile.given_name || email.split('@')[0]).trim(),
                avatar_url: String(profile.picture || '').trim()
            }
        };
    }

    return { ok: false, reason: 'missing' };
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
        role: cleanRole,
        adminToken
    };
}

function redirectForRole(email, role) {
    if ((role === 'admin' || role === 'superadmin') && isAuthorizedAdminRole(email, role)) return '/pages/admin/dashboard.html';
    return '/index.html';
}

async function handleSessionRequest(req, res) {
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
                    or: '(email.eq.miriamalobren@gmail.com,role.eq.admin)',
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
            const liveUser = sanitizeUser(lookup.row);
            const hasAdminCookie = Boolean(readAdminSession(req));
            const clearStaleAdminCookies = (hasAdminCookie && !isAuthorizedAdminRole(liveUser.email, liveUser.role))
                ? [buildClearAdminOnlyCookie(req)]
                : [];
            return jsonWithCookies(
                {
                    authenticated: true,
                    user: liveUser
                },
                200,
                res,
                clearStaleAdminCookies.length ? { cookies: clearStaleAdminCookies } : undefined
            );
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

        const { cookies, role, adminToken } = issueCookiesForUser(req, userRow);
        return jsonWithCookies({
            success: true,
            ...(adminToken ? { token: adminToken } : {}),
            admin_session_ready: Boolean(adminToken),
            user: sanitizeUser(userRow),
            redirect_url: redirectForRole(cleanEmail, role),
            message: 'Sign in successful'
        }, 200, res, { cookies });
    }

    if (action === 'google') {
        if (!await checkRateLimit({ key: `google_auth:ip:${ip}`, limit: 15, windowSeconds: 300, blockSeconds: 600 })) {
            return jsonWithCookies({ success: false, error: 'Too many requests. Please wait before trying again.' }, 429, res);
        }

        const googleCheck = await verifyGoogleCredentials(body);
        if (!googleCheck.ok) {
            if (googleCheck.reason === 'missing') {
                return jsonWithCookies({ success: false, error: 'Missing Google sign-in token. Please try again.' }, 400, res);
            }
            if (googleCheck.reason === 'network_error') {
                return jsonWithCookies({ success: false, error: 'Unable to reach Google verification service. Please try again.' }, 502, res);
            }
            return jsonWithCookies({ success: false, error: 'Google token verification failed.' }, 401, res);
        }
        const googleInfo = googleCheck.data;

        const cleanEmail = googleInfo.email;
        const safeSub = escapePostgrestFilterValue(googleInfo.google_id);
        const safeEmail = escapePostgrestFilterValue(cleanEmail);
        let existing = null;
        let lookupFailed = false;
        try {
            const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                ? AbortSignal.timeout(5000)
                : undefined;
            const lookupRes = await fetch(restUrl('users', {
                or: `(google_id.eq.${safeSub},email.eq.${safeEmail})`,
                select: '*'
            }), { headers: serviceHeaders({}, true), ...(signal ? { signal } : {}) });
            if (lookupRes.ok) {
                const rows = await lookupRes.json().catch(() => []);
                const activeRows = Array.isArray(rows) ? rows.filter((u) => !isDeletedUserRow(u)) : [];
                existing = activeRows.find((u) => String(u.google_id || '') === String(googleInfo.google_id))
                    || activeRows[0]
                    || null;
            } else {
                lookupFailed = true;
            }
        } catch (_) {
            lookupFailed = true;
        }

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
            if (!String(existing.google_email || '').trim()) patch.google_email = cleanEmail;
            if (!String(existing.full_name || '').trim() && googleInfo.full_name) {
                patch.full_name = googleInfo.full_name;
            }
            const curAvatar = String(existing.avatar_url || '').trim();
            if (googleInfo.avatar_url && (!curAvatar || (existing.role !== 'admin' && existing.role !== 'superadmin' && curAvatar === 'assets/images/agent.jpg'))) {
                const avatarCheck = sanitizeImageUrl(googleInfo.avatar_url, { defaultValue: '' });
                if (avatarCheck.ok && avatarCheck.value) patch.avatar_url = avatarCheck.value;
            }

            await writeUserMutation(
                restUrl('users', { id: `eq.${existing.id}` }),
                'PATCH',
                patch,
                {},
                { optionalProtectedColumns: ['google_id'] }
            );

            const merged = { ...existing, ...patch };
            const { cookies, role, adminToken } = issueCookiesForUser(req, merged);
            return jsonWithCookies({
                success: true,
                ...(adminToken ? { token: adminToken } : {}),
                admin_session_ready: Boolean(adminToken),
                user: sanitizeUser(merged),
                redirect_url: redirectForRole(normalizeEmail(merged.email), role),
                message: 'Google sign-in successful'
            }, 200, res, { cookies });
        }

        // First-time Google signup: issue OTP to verified Gmail
        if (!otpEnvironmentReady()) {
            return jsonWithCookies({ success: false, error: 'Email verification is not configured on the server.' }, 503, res);
        }
        const otpCtx = { req, cookies: [] };
        try {
            const issued = await issueOtp(cleanEmail, 'register', ip, otpCtx);
            if (!issued) {
                return jsonWithCookies({
                    success: false,
                    error: 'Too many verification codes requested. Please wait a few minutes and try again.'
                }, 429, res);
            }
        } catch (otpErr) {
            console.error('[session] Google signup OTP error:', otpErr?.message || otpErr);
            return jsonWithCookies({
                success: false,
                error: mapOtpErrorMessage(
                    otpErr,
                    'Unable to send the verification code to your Gmail right now. Please try again shortly.'
                )
            }, 503, res);
        }
        const safeAvatarCheck = sanitizeImageUrl(googleInfo.avatar_url, { defaultValue: 'assets/images/agent.jpg' });
        return jsonWithCookies({
            success: true,
            requires_verification: true,
            otp_sent: true,
            email: cleanEmail,
            full_name: googleInfo.full_name,
            avatar_url: safeAvatarCheck.ok ? safeAvatarCheck.value : 'assets/images/agent.jpg',
            message: `We sent a 6-digit verification code to your Gmail (${cleanEmail}). Please verify to complete registration.`
        }, 200, res, { cookies: otpCtx.cookies });
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

        const googleCheck = await verifyGoogleCredentials(body);
        if (!googleCheck.ok) {
            if (googleCheck.reason === 'network_error') {
                return jsonWithCookies({ success: false, error: 'Unable to reach Google verification service. Please try again.' }, 502, res);
            }
            return jsonWithCookies({ success: false, error: 'Google authentication token could not be verified.' }, 401, res);
        }
        const googleInfo = googleCheck.data;
        if (googleInfo.email !== cleanEmail) {
            return jsonWithCookies({ success: false, error: 'Google authentication token could not be verified.' }, 401, res);
        }

        if (!otpEnvironmentReady()) {
            return jsonWithCookies({ success: false, error: 'Email verification is not configured on the server.' }, 503, res);
        }
        const otpCtx = { req, cookies: [] };
        let consumed = false;
        try {
            consumed = await consumeOtp(cleanEmail, 'register', code, otpCtx);
        } catch (otpErr) {
            console.error('[session] Google verify OTP consume error:', otpErr?.message || otpErr);
            return jsonWithCookies({
                success: false,
                error: mapOtpErrorMessage(otpErr, 'Unable to verify your code right now. Please try again.')
            }, 503, res);
        }
        if (!consumed) {
            return jsonWithCookies({ success: false, error: 'That verification code is invalid or expired.' }, 400, res, { cookies: otpCtx.cookies });
        }

        const safeAvatarCheck = sanitizeImageUrl(googleInfo.avatar_url || body.avatar_url, { defaultValue: 'assets/images/agent.jpg' });
        const existingLookup = await fetchUserByEmailResult(cleanEmail);
        if (existingLookup.dbError) {
            return jsonWithCookies({ success: false, error: 'Unable to complete registration right now.' }, 503, res, { cookies: otpCtx.cookies });
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
                    google_email: existing.google_email || cleanEmail,
                    updated_at: new Date().toISOString()
                },
                { Prefer: 'return=representation' },
                { optionalProtectedColumns: ['google_id'] }
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
                    google_email: cleanEmail,
                    has_password: false,
                    bio: '',
                    email_verified_at: new Date().toISOString()
                },
                { Prefer: 'return=representation' },
                { optionalProtectedColumns: ['google_id'] }
            );
            if (!insertRes.ok) {
                return jsonWithCookies({ success: false, error: 'Unable to complete registration right now.' }, 503, res, { cookies: otpCtx.cookies });
            }
            const inserted = insertRes.data;
            savedUser = Array.isArray(inserted) ? inserted[0] : inserted;
        }

        const { cookies, role, adminToken } = issueCookiesForUser(req, savedUser);
        return jsonWithCookies({
            success: true,
            ...(adminToken ? { token: adminToken } : {}),
            admin_session_ready: Boolean(adminToken),
            user: sanitizeUser(savedUser),
            redirect_url: redirectForRole(cleanEmail, role),
            message: 'Account verified and registered successfully! Welcome to UrbanScope.'
        }, 200, res, { cookies: [...cookies, ...otpCtx.cookies] });
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
            let cleanPhone = String(body.phone).trim();
            if (cleanPhone.length > 40) {
                return jsonWithCookies({ success: false, error: 'Phone number is too long.' }, 400, res);
            }
            if (!isStaff && cleanPhone) {
                const digitsOnly = cleanPhone.replace(/[\s\-()]/g, '');
                if (/^09\d{9}$/.test(digitsOnly)) {
                    cleanPhone = '+63' + digitsOnly.slice(1);
                } else if (/^639\d{9}$/.test(digitsOnly)) {
                    cleanPhone = '+' + digitsOnly;
                } else if (/^9\d{9}$/.test(digitsOnly)) {
                    cleanPhone = '+63' + digitsOnly;
                } else if (/^\+639\d{9}$/.test(digitsOnly)) {
                    cleanPhone = digitsOnly;
                } else {
                    return jsonWithCookies({
                        success: false,
                        error: 'Please enter a valid Philippine mobile number (e.g. 0917 123 4567 or +63 917 123 4567).'
                    }, 400, res);
                }
            }
            patch.phone = cleanPhone;
        }

        if (!isStaff) {
            if (body.email !== undefined && normalizeEmail(body.email) !== normalizeEmail(currentUser.email)) {
                return jsonWithCookies({
                    success: false,
                    error: 'Only your full name and contact number can be updated here.'
                }, 403, res);
            }
            if (body.avatar_url !== undefined && String(body.avatar_url).trim() !== String(currentUser.avatar_url || '').trim()) {
                return jsonWithCookies({
                    success: false,
                    error: 'Profile photo changes are not available for client accounts.'
                }, 403, res);
            }
        }

        if (isStaff && body.email !== undefined && String(body.email).trim()) {
            const nextEmail = normalizeEmail(body.email);
            if (!isValidEmail(nextEmail)) {
                return jsonWithCookies({ success: false, error: 'Enter a valid email address.' }, 400, res);
            }
            if (nextEmail !== normalizeEmail(currentUser.email)) {
                if (normalizeEmail(currentUser.email) === 'miriamalobren@gmail.com') {
                    return jsonWithCookies({ success: false, error: 'The main administrator email address cannot be changed.' }, 400, res);
                }
                if (nextEmail === 'miriamalobren@gmail.com') {
                    return jsonWithCookies({ success: false, error: 'That email address is reserved for the main administrator account.' }, 400, res);
                }
                const duplicate = await fetchUserByEmail(nextEmail);
                if (duplicate && String(duplicate.id) !== String(currentUser.id)) {
                    return jsonWithCookies({ success: false, error: 'Email is already in use by another account.' }, 409, res);
                }
                patch.email = nextEmail;
            }
        }

        if (isStaff && body.avatar_url !== undefined) {
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

    if (action === 'change-password') {
        if (!verifyCsrfIfAuthenticated(req)) {
            return jsonWithCookies({ success: false, error: 'CSRF validation failed.' }, 403, res);
        }
        const session = getActiveSession(req);
        if (!session) {
            return jsonWithCookies({ success: false, error: 'Authentication required.' }, 401, res);
        }

        const currentLookup = await fetchUserByEmailResult(session.email, session.id);
        if (currentLookup.dbError) {
            return jsonWithCookies({ success: false, error: 'Unable to update password right now.' }, 503, res);
        }
        const currentUser = currentLookup.row;
        if (!currentUser || isDeletedUserRow(currentUser)) {
            return jsonWithCookies({ success: false, error: 'Account not found.' }, 404, res);
        }

        if (!await checkRateLimit({ key: `pw_change:user:${currentUser.id}`, limit: 8, windowSeconds: 300, blockSeconds: 600 })) {
            return jsonWithCookies({ success: false, error: 'Too many password change attempts. Please wait a few minutes.' }, 429, res);
        }

        const currentPassword = String(body.current_password || '');
        const cleanNewPassword = String(body.new_password || '').trim();
        if (cleanNewPassword.length < 8 || cleanNewPassword.length > 128) {
            return jsonWithCookies({ success: false, error: 'New password must be between 8 and 128 characters.' }, 400, res);
        }

        const userHasPassword = currentUser.has_password === undefined || currentUser.has_password === null
            ? true
            : Boolean(currentUser.has_password);

        if (userHasPassword) {
            if (!currentPassword || !(await verifyPBKDF2Password(currentPassword, currentUser.password_hash))) {
                return jsonWithCookies({ success: false, error: 'The current password you entered is incorrect.' }, 400, res);
            }
        }

        const newHash = await createPasswordHash(cleanNewPassword);
        const nowIso = new Date().toISOString();
        const updateRes = await writeUserMutation(
            restUrl('users', { id: `eq.${currentUser.id}` }),
            'PATCH',
            {
                password_hash: newHash,
                has_password: true,
                email_verified_at: currentUser.email_verified_at || nowIso,
                updated_at: nowIso
            },
            { Prefer: 'return=representation' }
        );
        if (!updateRes.ok) {
            return jsonWithCookies({ success: false, error: 'Unable to update password right now.' }, 503, res);
        }
        const rows = updateRes.data;
        const updatedUser = Array.isArray(rows) && rows[0]
            ? { ...rows[0], has_password: true }
            : { ...currentUser, password_hash: newHash, has_password: true, updated_at: nowIso };
        const { cookies } = issueCookiesForUser(req, updatedUser);
        return jsonWithCookies({
            success: true,
            user: sanitizeUser(updatedUser),
            message: userHasPassword
                ? 'Password updated successfully.'
                : 'Password added successfully. You can now sign in with email and password or Google.'
        }, 200, res, { cookies });
    }

    if (action === 'link-google') {
        if (!verifyCsrfIfAuthenticated(req)) {
            return jsonWithCookies({ success: false, error: 'CSRF validation failed.' }, 403, res);
        }
        const session = getActiveSession(req);
        if (!session) {
            return jsonWithCookies({ success: false, error: 'Authentication required.' }, 401, res);
        }

        const currentLookup = await fetchUserByEmailResult(session.email, session.id);
        if (currentLookup.dbError) {
            return jsonWithCookies({ success: false, error: 'Unable to connect Google account right now.' }, 503, res);
        }
        const currentUser = currentLookup.row;
        if (!currentUser || isDeletedUserRow(currentUser)) {
            return jsonWithCookies({ success: false, error: 'Account not found.' }, 404, res);
        }

        if (!await checkRateLimit({ key: `google_link:user:${currentUser.id}`, limit: 10, windowSeconds: 300, blockSeconds: 600 })) {
            return jsonWithCookies({ success: false, error: 'Too many Google connection attempts. Please wait a few minutes.' }, 429, res);
        }

        const googleCheck = await verifyGoogleCredentials(body);
        if (!googleCheck.ok) {
            if (googleCheck.reason === 'missing') {
                return jsonWithCookies({ success: false, error: 'Missing Google sign-in token. Please try again.' }, 400, res);
            }
            if (googleCheck.reason === 'network_error') {
                return jsonWithCookies({ success: false, error: 'Unable to reach Google verification service. Please try again.' }, 502, res);
            }
            return jsonWithCookies({ success: false, error: 'Google token verification failed.' }, 401, res);
        }
        const googleInfo = googleCheck.data;
        const googleSub = String(googleInfo.google_id || '').trim();
        const googleEmail = normalizeEmail(googleInfo.email);
        const currentEmail = normalizeEmail(currentUser.email);

        if (currentUser.google_id) {
            if (String(currentUser.google_id) === googleSub) {
                const syncPatch = {};
                if (!String(currentUser.google_email || '').trim()) {
                    syncPatch.google_email = googleEmail;
                    syncPatch.updated_at = new Date().toISOString();
                    await writeUserMutation(
                        restUrl('users', { id: `eq.${currentUser.id}` }),
                        'PATCH',
                        syncPatch
                    );
                }
                const mergedSame = {
                    ...currentUser,
                    ...syncPatch,
                    google_email: syncPatch.google_email || currentUser.google_email || googleEmail
                };
                const { cookies } = issueCookiesForUser(req, mergedSame);
                return jsonWithCookies({
                    success: true,
                    user: sanitizeUser(mergedSame),
                    message: 'Google account is already connected.'
                }, 200, res, { cookies });
            }
            return jsonWithCookies({
                success: false,
                error: 'A different Google account is already connected to this profile.'
            }, 409, res);
        }

        const isCurrentAdmin = ALLOWED_ADMIN_EMAILS.has(currentEmail);
        if (isCurrentAdmin && !ALLOWED_ADMIN_EMAILS.has(googleEmail)) {
            return jsonWithCookies({
                success: false,
                error: 'The administrator account can only be linked to miriamalobren@gmail.com.'
            }, 403, res);
        }
        if (!isCurrentAdmin && ALLOWED_ADMIN_EMAILS.has(googleEmail)) {
            return jsonWithCookies({
                success: false,
                error: 'This Google account cannot be linked to a client profile.'
            }, 403, res);
        }

        const safeSub = escapePostgrestFilterValue(googleSub);
        const safeGoogleEmail = escapePostgrestFilterValue(googleEmail);
        const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(5000)
            : undefined;

        try {
            const subRes = await fetch(restUrl('users', {
                google_id: `eq.${safeSub}`,
                select: '*'
            }), { headers: serviceHeaders({}, true), ...(signal ? { signal } : {}) });
            if (!subRes.ok) {
                return jsonWithCookies({ success: false, error: 'Unable to verify Google account availability.' }, 503, res);
            }
            const subRows = await subRes.json().catch(() => []);
            const subConflict = Array.isArray(subRows) && subRows.some(
                (r) => !isDeletedUserRow(r) && String(r.id) !== String(currentUser.id)
            );
            if (subConflict) {
                return jsonWithCookies({
                    success: false,
                    error: 'This Google account is already connected to another UrbanScope account.'
                }, 409, res);
            }

            if (googleEmail !== currentEmail) {
                let emailRes = await fetch(restUrl('users', {
                    or: `(email.eq.${safeGoogleEmail},google_email.eq.${safeGoogleEmail})`,
                    select: '*'
                }), { headers: serviceHeaders({}, true), ...(signal ? { signal } : {}) });
                if (emailRes.status === 400) {
                    emailRes = await fetch(restUrl('users', {
                        email: `eq.${safeGoogleEmail}`,
                        select: '*'
                    }), { headers: serviceHeaders({}, true), ...(signal ? { signal } : {}) });
                }
                if (!emailRes.ok) {
                    return jsonWithCookies({ success: false, error: 'Unable to verify Google email availability.' }, 503, res);
                }
                const emailRows = await emailRes.json().catch(() => []);
                const emailConflict = Array.isArray(emailRows) && emailRows.some(
                    (r) => !isDeletedUserRow(r) && String(r.id) !== String(currentUser.id)
                );
                if (emailConflict) {
                    return jsonWithCookies({
                        success: false,
                        error: 'That Google email is already associated with another UrbanScope account.'
                    }, 409, res);
                }
            }
        } catch (_) {
            return jsonWithCookies({ success: false, error: 'Unable to connect Google account right now.' }, 503, res);
        }

        const nowIso = new Date().toISOString();
        const patch = {
            google_id: googleSub,
            google_email: googleEmail,
            email_verified_at: currentUser.email_verified_at || nowIso,
            updated_at: nowIso
        };
        const currentRole = normalizeAccountRole(currentUser.role, currentUser.email);
        const isStaff = isAuthorizedAdminRole(currentUser.email, currentRole);
        const curAvatar = String(currentUser.avatar_url || '').trim();
        if (!isStaff && googleInfo.avatar_url && (!curAvatar || curAvatar === 'assets/images/agent.jpg')) {
            const avatarCheck = sanitizeImageUrl(googleInfo.avatar_url, { defaultValue: '' });
            if (avatarCheck.ok && avatarCheck.value) patch.avatar_url = avatarCheck.value;
        }

        const updateRes = await writeUserMutation(
            restUrl('users', { id: `eq.${currentUser.id}` }),
            'PATCH',
            patch,
            { Prefer: 'return=representation' },
            { optionalProtectedColumns: [] }
        );
        if (!updateRes.ok) {
            return jsonWithCookies({ success: false, error: 'Unable to connect Google account right now.' }, 503, res);
        }

        const rows = updateRes.data;
        const updatedUser = Array.isArray(rows) && rows[0]
            ? {
                ...rows[0],
                google_id: rows[0].google_id || googleSub,
                google_email: rows[0].google_email || googleEmail
            }
            : { ...currentUser, ...patch };
        const { cookies } = issueCookiesForUser(req, updatedUser);
        return jsonWithCookies({
            success: true,
            user: sanitizeUser(updatedUser),
            message: 'Google account connected successfully!'
        }, 200, res, { cookies });
    }

    return jsonWithCookies({ success: false, error: 'Unsupported session action.' }, 400, res);
}

export default async function handler(req, res) {
    try {
        return await handleSessionRequest(req, res);
    } catch (err) {
        console.error('[session] Unhandled exception:', err?.message || err);
        if (res && (res.headersSent || res.writableEnded)) return;
        return jsonWithCookies({
            success: false,
            error: 'Authentication service encountered a temporary error. Please try again.'
        }, 500, res);
    }
}

export { handler as fetch };

