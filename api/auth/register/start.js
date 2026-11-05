import {
    getCloudUser,
    isSameOrigin,
    isValidEmail,
    jsonResponse,
    normalizeEmail,
    issueOtp,
    otpEnvironmentReady
} from '../../../lib/email-auth.js';

const GENERIC_MESSAGE = 'If registration can proceed, a verification code has been sent to that email address.';

export default async function handler(request) {
    if (request.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405);
    if (!isSameOrigin(request)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403);
    if (!otpEnvironmentReady()) return jsonResponse({ success: false, error: 'Email verification is not configured on the server.' }, 503);

    let body;
    try { body = await request.json(); } catch (_) { return jsonResponse({ success: false, error: 'Invalid request.' }, 400); }
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return jsonResponse({ success: false, error: 'Enter a valid email address.' }, 400);

    try {
        const existing = await getCloudUser(email);
        if (!existing && email !== 'admin.realestate@gmail.com' && email !== 'miriam@gmail.com' && email !== 'urbanscope.cvsu@gmail.com') {
            const forwarded = request.headers.get('x-forwarded-for') || '';
            await issueOtp(email, 'register', forwarded.split(',')[0].trim() || 'unknown');
        }
    } catch (error) {
        console.error('Registration code delivery could not be completed:', error?.message || 'unknown error');
    }

    return jsonResponse({ success: true, message: GENERIC_MESSAGE });
}
