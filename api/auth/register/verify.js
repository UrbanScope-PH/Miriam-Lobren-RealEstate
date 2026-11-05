import {
    consumeOtp,
    createPasswordHash,
    getCloudUser,
    insertCloudUser,
    isSameOrigin,
    isValidEmail,
    jsonResponse,
    normalizeEmail,
    parseJsonBody,
    otpEnvironmentReady
} from '../../../lib/email-auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!isSameOrigin(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);
    if (!otpEnvironmentReady()) return jsonResponse({ success: false, error: 'Email verification is not configured on the server.' }, 503, res);

    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const fullName = String(body.full_name || '').trim();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    const code = String(body.code || '').trim();
    if (!isValidEmail(email) || fullName.length < 2 || fullName.length > 120 || phone.length > 40 || password.length < 8 || password.length > 128 || !/^\d{6}$/.test(code)) {
        return jsonResponse({ success: false, error: 'Check the information and verification code, then try again.' }, 400, res);
    }
    if (['admin.realestate@gmail.com', 'miriam@gmail.com', 'urbanscope.cvsu@gmail.com'].includes(email)) {
        return jsonResponse({ success: false, error: 'This email cannot be registered through the client sign-up form.' }, 400, res);
    }

    try {
        if (await getCloudUser(email)) return jsonResponse({ success: false, error: 'That code is invalid or expired. Request a new code and try again.' }, 400, res);
        const consumed = await consumeOtp(email, 'register', code);
        if (!consumed) return jsonResponse({ success: false, error: 'That code is invalid or expired. Request a new code and try again.' }, 400, res);

        const user = await insertCloudUser({
            email,
            password_hash: await createPasswordHash(password),
            full_name: fullName,
            phone,
            role: 'client',
            avatar_url: 'assets/images/agent.jpg',
            bio: '',
            email_verified_at: new Date().toISOString()
        });
        return jsonResponse({
            success: true,
            user: user ? {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                phone: user.phone || '',
                role: user.role || 'client',
                avatar_url: user.avatar_url || 'assets/images/agent.jpg'
            } : null
        }, 200, res);
    } catch (error) {
        console.error('Verified registration could not be completed:', error?.message || 'unknown error');
        return jsonResponse({ success: false, error: 'Unable to finish registration right now. Please request a new code and try again.' }, 503, res);
    }
}

export { handler as fetch };
