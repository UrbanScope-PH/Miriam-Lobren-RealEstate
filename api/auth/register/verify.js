import {
    consumeOtp,
    createPasswordHash,
    getCloudUser,
    insertCloudUser,
    isValidEmail,
    jsonResponse,
    mapOtpErrorMessage,
    normalizeEmail,
    otpEnvironmentReady,
    parseJsonBody
} from '../../../lib/email-auth.js';
import {
    ALLOWED_ADMIN_EMAILS,
    buildSessionCookieHeaders,
    checkRateLimit,
    createUserSessionToken,
    generateCsrfToken,
    getClientIp,
    isStrictSameOrigin,
    jsonWithCookies,
    sanitizeUser,
    verifyBotDefense
} from '../../../lib/server-security.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!isStrictSameOrigin(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);
    if (!otpEnvironmentReady()) return jsonResponse({ success: false, error: 'Email verification is not configured on the server.' }, 503, res);

    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const ip = getClientIp(req);

    if (!await checkRateLimit({ key: `reg_verify:ip:${ip}`, limit: 10, windowSeconds: 300, blockSeconds: 600 })) {
        return jsonResponse({ success: false, error: 'Too many verification attempts. Please wait a few minutes.' }, 429, res);
    }
    if (email && !await checkRateLimit({ key: `reg_verify:acct:${email}`, limit: 8, windowSeconds: 300, blockSeconds: 600 })) {
        return jsonResponse({ success: false, error: 'Too many verification attempts for this email.' }, 429, res);
    }

    const botCheck = await verifyBotDefense(req, body);
    if (!botCheck.ok) {
        return jsonResponse({ success: false, error: botCheck.error || 'Verification blocked.' }, 400, res);
    }

    if (body.terms_accepted === false) {
        return jsonResponse({ success: false, error: 'You must accept the Terms of Service and Privacy Policy.' }, 400, res);
    }

    const fullName = String(body.full_name || '').trim();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    const code = String(body.code || '').trim();
    if (!isValidEmail(email) || fullName.length < 2 || fullName.length > 120 || phone.length > 40 || password.length < 8 || password.length > 128 || !/^\d{6}$/.test(code)) {
        return jsonResponse({ success: false, error: 'Check the information and verification code, then try again.' }, 400, res);
    }
    if (ALLOWED_ADMIN_EMAILS.has(email)) {
        return jsonResponse({ success: false, error: 'This email cannot be registered through the client sign-up form.' }, 400, res);
    }

    try {
        const existing = await getCloudUser(email);
        if (existing && existing.bio !== '__URBANSCOPE_DELETED__' && existing.password_hash !== '__DELETED_ACCOUNT__') {
            return jsonResponse({ success: false, error: 'That code is invalid or expired. Request a new code and try again.' }, 400, res);
        }
        const otpCtx = { req, cookies: [] };
        const consumed = await consumeOtp(email, 'register', code, otpCtx);
        if (!consumed) {
            return jsonWithCookies({ success: false, error: 'That code is invalid or expired. Request a new code and try again.' }, 400, res, { cookies: otpCtx.cookies });
        }

        const user = await insertCloudUser({
            email,
            password_hash: await createPasswordHash(password),
            full_name: fullName,
            phone,
            role: 'client',
            avatar_url: 'assets/images/agent.jpg',
            bio: '',
            has_password: true,
            email_verified_at: new Date().toISOString()
        });

        const cleanUser = sanitizeUser(user || { email, full_name: fullName, phone, role: 'user', avatar_url: 'assets/images/agent.jpg', has_password: true, email_verified_at: true });
        const userToken = createUserSessionToken(cleanUser);
        const csrfToken = generateCsrfToken();
        const cookies = buildSessionCookieHeaders({ req, userToken, csrfToken });

        return jsonWithCookies({
            success: true,
            user: cleanUser
        }, 200, res, { cookies: [...cookies, ...otpCtx.cookies] });
    } catch (error) {
        console.error('Verified registration could not be completed:', error?.message || 'unknown error');
        return jsonResponse({
            success: false,
            error: mapOtpErrorMessage(error, 'Unable to finish registration right now. Please request a new code and try again.')
        }, 503, res);
    }
}

export { handler as fetch };
