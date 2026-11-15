import {
    getCloudUser,
    getOtpBindFingerprint,
    issueOtp,
    isValidEmail,
    jsonResponse,
    mapOtpErrorMessage,
    normalizeEmail,
    otpEnvironmentReady,
    parseJsonBody
} from '../../../../lib/email-auth.js';
import {
    checkRateLimit,
    getClientIp,
    isStrictSameOrigin,
    jsonWithCookies,
    verifyBotDefense
} from '../../../../lib/server-security.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!isStrictSameOrigin(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);
    if (!otpEnvironmentReady()) {
        return jsonResponse({
            success: false,
            code: 'EMAIL_SERVICE_NOT_CONFIGURED',
            error: 'Email delivery is not configured on the server.'
        }, 503, res);
    }

    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const ip = getClientIp(req);

    if (!await checkRateLimit({ key: `pw_reset_req:ip:${ip}`, limit: 8, windowSeconds: 300, blockSeconds: 600 })) {
        return jsonResponse({ success: false, error: 'Too many password reset requests. Please try again later.' }, 429, res);
    }
    if (email && !await checkRateLimit({ key: `pw_reset_req:acct:${email}`, limit: 5, windowSeconds: 300, blockSeconds: 600 })) {
        return jsonResponse({ success: false, error: 'Too many reset requests for this email. Please wait and try again.' }, 429, res);
    }

    const botCheck = await verifyBotDefense(req, body);
    if (!botCheck.ok) {
        return jsonResponse({ success: false, error: botCheck.error || 'Verification blocked.' }, 400, res);
    }

    if (!isValidEmail(email)) {
        return jsonResponse({ success: false, error: 'Enter a valid email address.' }, 400, res);
    }

    try {
        const user = await getCloudUser(email);
        const isDeleted = Boolean(
            user &&
            (user.bio === '__URBANSCOPE_DELETED__' || user.password_hash === '__DELETED_ACCOUNT__')
        );
        if (!user || isDeleted) {
            return jsonResponse({
                success: false,
                code: 'EMAIL_NOT_REGISTERED',
                error: 'This email is not registered yet. Please register first.'
            }, 404, res);
        }
        if (!user.password_hash) {
            return jsonResponse({
                success: false,
                code: 'GOOGLE_ACCOUNT_NO_PASSWORD',
                error: 'This account uses Google Sign-In and does not have a password. Please log in with Google instead.'
            }, 400, res);
        }

        const otpCtx = { req, cookies: [], bindValue: getOtpBindFingerprint(user.password_hash) };
        await issueOtp(email, 'password_reset', ip, otpCtx);
        return jsonWithCookies({
            success: true,
            code: 'OTP_SENT',
            message: `A six-digit verification code has been sent to ${email}.`
        }, 200, res, { cookies: otpCtx.cookies });
    } catch (error) {
        console.error('Password reset email dispatch error:', error?.message || 'unknown error');
        return jsonResponse({
            success: false,
            error: mapOtpErrorMessage(error, 'Unable to deliver recovery email right now. Please try again shortly.')
        }, 503, res);
    }
}

export { handler as fetch };
