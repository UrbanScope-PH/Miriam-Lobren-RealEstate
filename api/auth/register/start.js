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
} from '../../../lib/email-auth.js';

const GENERIC_MESSAGE = 'If registration can proceed, a verification code has been sent to that email address.';

export default async function handler(req, res) {
    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!isSameOrigin(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);
    if (!otpEnvironmentReady()) {
        return jsonResponse({
            success: false,
            code: 'OTP_NOT_CONFIGURED',
            error: 'Email verification service is not configured.'
        }, 200, res);
    }

    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return jsonResponse({ success: false, error: 'Enter a valid email address.' }, 400, res);

    try {
        const existing = await getCloudUser(email);
        if (!existing && email !== 'admin.realestate@gmail.com' && email !== 'miriam@gmail.com' && email !== 'urbanscope.cvsu@gmail.com') {
            const forwarded = getHeader(req, 'x-forwarded-for') || '';
            await issueOtp(email, 'register', forwarded.split(',')[0].trim() || 'unknown');
        }
    } catch (error) {
        console.error('Registration code delivery could not be completed:', error?.message || 'unknown error');
    }

    return jsonResponse({ success: true, message: GENERIC_MESSAGE }, 200, res);
}

export { handler as fetch };
