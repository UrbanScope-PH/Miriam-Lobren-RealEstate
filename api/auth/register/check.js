import {
    checkOtp,
    isValidEmail,
    jsonResponse,
    mapOtpErrorMessage,
    normalizeEmail,
    otpEnvironmentReady,
    parseJsonBody
} from '../../../lib/email-auth.js';
import {
    checkRateLimit,
    getClientIp,
    isStrictSameOrigin
} from '../../../lib/server-security.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!isStrictSameOrigin(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);
    if (!otpEnvironmentReady()) {
        return jsonResponse({ success: false, error: 'Email verification is not configured on the server.' }, 503, res);
    }

    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').trim();
    const purpose = body.purpose === 'password_reset' ? 'password_reset' : 'register';
    const ip = getClientIp(req);

    if (!await checkRateLimit({ key: `otp_check:ip:${ip}`, limit: 15, windowSeconds: 300, blockSeconds: 600 })) {
        return jsonResponse({ success: false, error: 'Too many verification attempts. Please try again later.' }, 429, res);
    }
    if (email && !await checkRateLimit({ key: `otp_check:acct:${email}`, limit: 10, windowSeconds: 300, blockSeconds: 600 })) {
        return jsonResponse({ success: false, error: 'Too many verification attempts for this email.' }, 429, res);
    }

    if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
        return jsonResponse({ success: false, error: 'Please enter a valid 6-digit verification code.' }, 400, res);
    }

    try {
        const valid = await checkOtp(email, purpose, code);
        if (!valid) {
            return jsonResponse({
                success: false,
                error: 'The verification code is incorrect or has expired. Please check your email or request a new code.'
            }, 400, res);
        }
        return jsonResponse({ success: true, message: 'Verification code is valid.' }, 200, res);
    } catch (error) {
        console.error('OTP check error:', error?.message || 'unknown error');
        return jsonResponse({
            success: false,
            error: mapOtpErrorMessage(error, 'Verification check is temporarily unavailable.')
        }, 503, res);
    }
}

export { handler as fetch };
