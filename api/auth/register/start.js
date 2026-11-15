import {
    getCloudUser,
    issueOtp,
    isValidEmail,
    jsonResponse,
    normalizeEmail,
    otpEnvironmentReady,
    parseJsonBody
} from '../../../lib/email-auth.js';
import {
    ALLOWED_ADMIN_EMAILS,
    checkRateLimit,
    getClientIp,
    isStrictSameOrigin,
    verifyBotDefense
} from '../../../lib/server-security.js';

const GENERIC_REGISTER_MSG = 'If registration can proceed, a verification code has been sent to that email address.';

export default async function handler(req, res) {
    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!isStrictSameOrigin(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);
    if (!otpEnvironmentReady()) {
        return jsonResponse({
            success: false,
            code: 'EMAIL_SERVICE_NOT_CONFIGURED',
            error: 'Email verification is not configured on the server.'
        }, 503, res);
    }

    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const ip = getClientIp(req);

    if (!await checkRateLimit({ key: `reg_start:ip:${ip}`, limit: 8, windowSeconds: 300, blockSeconds: 600 })) {
        return jsonResponse({ success: false, error: 'Too many requests. Please wait a few minutes before retrying.' }, 429, res);
    }
    if (email && !await checkRateLimit({ key: `reg_start:acct:${email}`, limit: 5, windowSeconds: 300, blockSeconds: 600 })) {
        return jsonResponse({ success: false, error: 'Too many verification attempts for this email. Please wait and try again.' }, 429, res);
    }

    const botCheck = await verifyBotDefense(req, body);
    if (!botCheck.ok) {
        return jsonResponse({ success: false, error: botCheck.error || 'Verification blocked.' }, 400, res);
    }

    if (!isValidEmail(email)) {
        return jsonResponse({ success: false, error: 'Enter a valid email address.' }, 400, res);
    }

    if (ALLOWED_ADMIN_EMAILS.has(email)) {
        return jsonResponse({ success: true, code: 'OTP_SENT', message: GENERIC_REGISTER_MSG }, 200, res);
    }

    try {
        const existing = await getCloudUser(email);
        if (existing && existing.id && existing.password_hash && existing.bio !== '__URBANSCOPE_DELETED__') {
            return jsonResponse({ success: true, code: 'OTP_SENT', message: GENERIC_REGISTER_MSG }, 200, res);
        }

        await issueOtp(email, 'register', ip);
        return jsonResponse({
            success: true,
            code: 'OTP_SENT',
            message: GENERIC_REGISTER_MSG
        }, 200, res);
    } catch (error) {
        console.error('Registration email dispatch error:', error?.message || 'unknown error');
        return jsonResponse({
            success: false,
            error: 'Unable to send verification code right now. Please try again shortly.'
        }, 503, res);
    }
}

export { handler as fetch };
