import {
    checkOtp,
    consumeOtp,
    createPasswordHash,
    getCloudUser,
    getOtpBindFingerprint,
    isValidEmail,
    jsonResponse,
    mapOtpErrorMessage,
    normalizeEmail,
    otpEnvironmentReady,
    parseJsonBody,
    updateCloudUser
} from '../../../../lib/email-auth.js';
import {
    checkRateLimit,
    getClientIp,
    isStrictSameOrigin,
    jsonWithCookies
} from '../../../../lib/server-security.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!isStrictSameOrigin(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);
    if (!otpEnvironmentReady()) return jsonResponse({ success: false, error: 'Email recovery is not configured on the server.' }, 503, res);

    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').trim();
    const password = String(body.password || '');
    const verifyOnly = Boolean(body.verifyOnly);
    const ip = getClientIp(req);

    if (!await checkRateLimit({ key: `pw_reset_confirm:ip:${ip}`, limit: 12, windowSeconds: 300, blockSeconds: 600 })) {
        return jsonResponse({ success: false, error: 'Too many attempts. Please try again later.' }, 429, res);
    }
    if (email && !await checkRateLimit({ key: `pw_reset_confirm:acct:${email}`, limit: 8, windowSeconds: 300, blockSeconds: 600 })) {
        return jsonResponse({ success: false, error: 'Too many attempts for this email. Please request a new code later.' }, 429, res);
    }

    if (verifyOnly) {
        if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
            return jsonResponse({ success: false, error: 'Enter a valid email address and six-digit code.' }, 400, res);
        }
        try {
            const user = await getCloudUser(email);
            if (!user || !user.password_hash || user.bio === '__URBANSCOPE_DELETED__' || user.password_hash === '__DELETED_ACCOUNT__') {
                return jsonResponse({ success: false, error: 'That code is invalid or expired. Request a new code and try again.' }, 400, res);
            }
            const otpCtx = { req, cookies: [], bindValue: getOtpBindFingerprint(user.password_hash) };
            const valid = await checkOtp(email, 'password_reset', code, otpCtx);
            if (!valid) {
                return jsonWithCookies({ success: false, error: 'That code is invalid or expired. Request a new code and try again.' }, 400, res, { cookies: otpCtx.cookies });
            }
            return jsonWithCookies({ success: true, message: 'Verification code is valid.' }, 200, res, { cookies: otpCtx.cookies });
        } catch (error) {
            console.error('Password reset code check failed:', error?.message || 'unknown error');
            return jsonResponse({
                success: false,
                error: mapOtpErrorMessage(error, 'Unable to verify recovery code right now.')
            }, 503, res);
        }
    }

    if (!isValidEmail(email) || !/^\d{6}$/.test(code) || password.length < 8 || password.length > 128) {
        return jsonResponse({ success: false, error: 'Enter the six-digit code and a password with at least 8 characters.' }, 400, res);
    }

    try {
        const user = await getCloudUser(email);
        if (!user || !user.password_hash || user.bio === '__URBANSCOPE_DELETED__' || user.password_hash === '__DELETED_ACCOUNT__') {
            return jsonResponse({ success: false, error: 'That code is invalid or expired. Request a new code and try again.' }, 400, res);
        }
        const otpCtx = { req, cookies: [], bindValue: getOtpBindFingerprint(user.password_hash) };
        if (!await consumeOtp(email, 'password_reset', code, otpCtx)) {
            return jsonWithCookies({ success: false, error: 'That code is invalid or expired. Request a new code and try again.' }, 400, res, { cookies: otpCtx.cookies });
        }
        const updated = await updateCloudUser(email, {
            password_hash: await createPasswordHash(password),
            email_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        if (!updated) return jsonWithCookies({ success: false, error: 'Unable to update that account. Request a new code and try again.' }, 400, res, { cookies: otpCtx.cookies });
        return jsonWithCookies({ success: true, message: 'Password updated. You can now log in with your new password.' }, 200, res, { cookies: otpCtx.cookies });
    } catch (error) {
        console.error('Password recovery could not be completed:', error?.message || 'unknown error');
        return jsonResponse({
            success: false,
            error: mapOtpErrorMessage(error, 'Unable to update the password right now. Please try again.')
        }, 503, res);
    }
}

export { handler as fetch };
