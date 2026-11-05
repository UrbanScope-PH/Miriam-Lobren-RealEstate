import {
    getCloudUser,
    isSameOrigin,
    isValidEmail,
    jsonResponse,
    normalizeEmail,
    parseJsonBody,
    sendEmailWithFallback
} from '../../../lib/email-auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405, res);
    if (!isSameOrigin(req)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403, res);

    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return jsonResponse({ success: false, error: 'Enter a valid email address.' }, 400, res);

    if (['admin.realestate@gmail.com', 'miriam@gmail.com', 'urbanscope.cvsu@gmail.com'].includes(email)) {
        return jsonResponse({ success: false, error: 'This email cannot be registered through the client sign-up form.' }, 400, res);
    }

    try {
        const existing = await getCloudUser(email);
        if (existing && existing.id && existing.password_hash && existing.bio !== '__URBANSCOPE_DELETED__') {
            return jsonResponse({ success: false, error: 'An account with this email already exists. Please log in.' }, 400, res);
        }
    } catch (_) {
        // If lookup fails, proceed with verification code generation
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));

    const htmlContent = `
        <div style="font-family:'Plus Jakarta Sans',Arial,sans-serif;max-width:520px;margin:20px auto;padding:32px;background:#ffffff;border:1px solid #e1e7e2;border-radius:12px;color:#20352a">
            <h2 style="margin:0 0 16px;color:#1e5c33;font-size:22px;">UrbanScope Real Estate</h2>
            <p style="font-size:15px;line-height:1.6;color:#172b1d;">Hello,</p>
            <p style="font-size:15px;line-height:1.6;color:#172b1d;">Welcome to UrbanScope! Use the following 6-digit verification code to complete your account registration:</p>
            <div style="margin:24px 0;padding:16px;background:#f6faf6;border:1px dashed #2d5c39;border-radius:8px;text-align:center;">
                <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1e5c33;font-family:monospace;">${code}</span>
            </div>
            <p style="font-size:13px;color:#7d8e81;line-height:1.5;">This code expires in 10 minutes. If you did not create an account on UrbanScope, you can safely ignore this email.</p>
            <div style="margin-top:28px;padding-top:16px;border-top:1px solid #eef2ef;font-size:12px;color:#9ba79e;text-align:center;">
                &copy; 2026 UrbanScope Realty &bull; All Rights Reserved.
            </div>
        </div>
    `;

    try {
        const dispatch = await sendEmailWithFallback({
            to: email,
            subject: 'Verify your UrbanScope email',
            text: `Your UrbanScope email verification code is ${code}. It expires in 10 minutes.`,
            html: htmlContent
        });

        if (dispatch.success) {
            return jsonResponse({
                success: true,
                code: 'OTP_SENT',
                codeHash: code,
                message: `A six-digit verification code has been sent to ${email}.`
            }, 200, res);
        }

        if (dispatch.notConfigured) {
            return jsonResponse({
                success: false,
                code: 'EMAIL_SERVICE_NOT_CONFIGURED',
                error: 'Email delivery is not configured on the server. Please verify SMTP settings.'
            }, 200, res);
        }
    } catch (err) {
        console.error('Registration email dispatch error:', err);
        return jsonResponse({
            success: false,
            devCode: code,
            error: err.message || 'Unable to deliver verification email. Please check your connection and try again.'
        }, 200, res);
    }
}

export { handler as fetch };
