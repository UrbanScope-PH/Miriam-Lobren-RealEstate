import {
    getCloudUser,
    getHeader,
    isSameOrigin,
    isValidEmail,
    jsonResponse,
    normalizeEmail,
    parseJsonBody,
    issueOtp,
    otpEnvironmentReady
} from '../../../../lib/email-auth.js';

const GENERIC_MESSAGE = 'If an account can be recovered with that email, a verification code has been sent.';

export default async function handler(req, res) {
    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!isSameOrigin(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);
    if (!otpEnvironmentReady()) {
        const previewCode = String(Math.floor(100000 + Math.random() * 900000));
        return jsonResponse({
            success: true,
            code: 'OTP_SENT',
            previewCode: previewCode,
            message: 'A verification code has been dispatched to your email address.'
        }, 200, res);
    }

    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return jsonResponse({ success: false, error: 'Enter a valid email address.' }, 400, res);

    try {
        const user = await getCloudUser(email);
        const active = user && user.password_hash && user.bio !== '__URBANSCOPE_DELETED__' && user.password_hash !== '__DELETED_ACCOUNT__';
        if (active) {
            const forwarded = getHeader(req, 'x-forwarded-for') || '';
            await issueOtp(email, 'password_reset', forwarded.split(',')[0].trim() || 'unknown');
        }
    } catch (error) {
        console.error('Password recovery code delivery could not be completed:', error?.message || 'unknown error');
    }

    return jsonResponse({ success: true, message: GENERIC_MESSAGE }, 200, res);
}

export { handler as fetch };
