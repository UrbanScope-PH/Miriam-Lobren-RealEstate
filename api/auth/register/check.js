import {
    isSameOrigin,
    isValidEmail,
    jsonResponse,
    normalizeEmail,
    parseJsonBody
} from '../../../lib/email-auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!isSameOrigin(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);

    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').trim();

    if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
        return jsonResponse({ success: false, error: 'Please enter a valid 6-digit verification code.' }, 400, res);
    }

    return jsonResponse({ success: true, message: 'Verification code is valid.' }, 200, res);
}

export { handler as fetch };

