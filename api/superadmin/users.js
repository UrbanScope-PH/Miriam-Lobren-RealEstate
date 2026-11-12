import {
    createPasswordHash,
    deleteCloudUserAndAssociatedData,
    getCloudUser,
    getCloudUserById,
    insertCloudUser,
    isSameOrigin,
    isValidEmail,
    jsonResponse,
    normalizeEmail,
    updateCloudUserById
} from '../../lib/email-auth.js';
import { readAdminSession, SUPERADMIN_EMAIL } from '../../lib/admin-session.js';

function publicUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone || '',
        role: user.role || 'client',
        avatar_url: user.avatar_url || 'assets/images/agent.jpg',
        created_at: user.created_at
    };
}

export default async function handler(request) {
    if (request.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405);
    if (!isSameOrigin(request)) return jsonResponse({ success: false, error: 'This request is not allowed.' }, 403);
    const session = readAdminSession(request);
    if (!session || session.email !== SUPERADMIN_EMAIL || session.role !== 'superadmin') {
        return jsonResponse({ success: false, error: 'Only the Superadmin can manage accounts.' }, 403);
    }
    if (!String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
        return jsonResponse({ success: false, error: 'Cloud account management is not configured.' }, 503);
    }

    let body;
    try { body = await request.json(); } catch (_) { return jsonResponse({ success: false, error: 'Invalid request.' }, 400); }
    const action = String(body.action || '').trim().toLowerCase();
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const email = normalizeEmail(payload.email);
    const fullName = payload.full_name === undefined ? '' : String(payload.full_name).trim();
    const phone = payload.phone === undefined ? '' : String(payload.phone).trim();
    const role = String(payload.role || 'user').trim().toLowerCase();
    const password = String(payload.password || '');

    try {
        if (action === 'create') {
            if (!['user', 'admin', 'superadmin'].includes(role)) {
                return jsonResponse({ success: false, error: 'Invalid role.' }, 400);
            }
            if (!isValidEmail(email) || fullName.length < 2 || fullName.length > 120 || password.length < 6 || password.length > 128) {
                return jsonResponse({ success: false, error: 'Enter a valid email, name, and password of at least 6 characters.' }, 400);
            }
            const existing = await getCloudUser(email);
            const now = new Date().toISOString();
            const fields = {
                email,
                password_hash: await createPasswordHash(password),
                full_name: fullName,
                phone,
                role: email === SUPERADMIN_EMAIL ? 'superadmin' : role,
                avatar_url: 'assets/images/agent.jpg',
                bio: '',
                email_verified_at: now,
                updated_at: now
            };
            const user = existing
                ? (existing.bio === '__URBANSCOPE_DELETED__' || existing.password_hash === '__DELETED_ACCOUNT__' || String(existing.email || '').startsWith('deleted_')
                    ? await updateCloudUserById(existing.id, fields)
                    : null)
                : await insertCloudUser(fields);
            if (!user) return jsonResponse({ success: false, error: 'An account with this email already exists.' }, 409);
            return jsonResponse({ success: true, message: 'Account created successfully.', user: publicUser(user) });
        }

        if (action === 'update') {
            if (payload.role !== undefined && !['user', 'admin', 'superadmin'].includes(role)) {
                return jsonResponse({ success: false, error: 'Invalid role.' }, 400);
            }
            const id = String(body.user_id || '').trim();
            if (!/^\d+$/.test(id)) return jsonResponse({ success: false, error: 'Invalid account ID.' }, 400);
            const target = await getCloudUserById(id);
            if (!target) return jsonResponse({ success: false, error: 'User account not found.' }, 404);
            const targetEmail = normalizeEmail(target.email);
            const nextEmail = email || targetEmail;
            if (!isValidEmail(nextEmail) || fullName.length > 120 || phone.length > 40) {
                return jsonResponse({ success: false, error: 'Check the account details and try again.' }, 400);
            }
            const nextRole = payload.role === undefined ? target.role : role;
            if (targetEmail === SUPERADMIN_EMAIL && (nextEmail !== SUPERADMIN_EMAIL || nextRole !== 'superadmin')) {
                return jsonResponse({ success: false, error: 'The root Superadmin account cannot be renamed or demoted.' }, 400);
            }
            if (nextEmail !== targetEmail) {
                const duplicate = await getCloudUser(nextEmail);
                if (duplicate && String(duplicate.id) !== id) return jsonResponse({ success: false, error: 'Email is already in use by another account.' }, 409);
            }
            const patch = { updated_at: new Date().toISOString() };
            if (fullName) patch.full_name = fullName;
            if (payload.email !== undefined) patch.email = nextEmail;
            if (payload.phone !== undefined) patch.phone = phone;
            if (payload.role !== undefined) patch.role = role;
            if (password) {
                if (password.length < 6 || password.length > 128) return jsonResponse({ success: false, error: 'Password must contain at least 6 characters.' }, 400);
                patch.password_hash = await createPasswordHash(password);
                patch.email_verified_at = new Date().toISOString();
            }
            const updated = await updateCloudUserById(id, patch);
            return updated
                ? jsonResponse({ success: true, message: 'User account updated successfully.', user: publicUser(updated) })
                : jsonResponse({ success: false, error: 'Unable to update the account.' }, 503);
        }

        if (action === 'delete') {
            const id = String(body.user_id || '').trim();
            let target = null;
            if (/^\d+$/.test(id)) {
                target = await getCloudUserById(id).catch(() => null);
            }
            if (!target && email) {
                target = await getCloudUser(email).catch(() => null);
            }
            const targetEmail = target ? normalizeEmail(target.email) : email;
            const targetId = target ? target.id : id;

            if (targetEmail === SUPERADMIN_EMAIL || targetEmail === 'urbanscope.cvsu@gmail.com') {
                return jsonResponse({ success: false, error: 'Cannot delete root Superadmin account.' }, 400);
            }
            if (['admin.realestate@gmail.com', 'miriamalobren@gmail.com', 'miriam@gmail.com'].includes(targetEmail)) {
                return jsonResponse({ success: false, error: 'Cannot delete primary Realty Admin account.' }, 400);
            }

            await deleteCloudUserAndAssociatedData(targetId, targetEmail);
            return jsonResponse({
                success: true,
                message: `Account ${targetEmail || '#' + targetId} and associated inquiry history deleted successfully.`
            });
        }

        return jsonResponse({ success: false, error: 'Unsupported account action.' }, 400);
    } catch (error) {
        console.error('Superadmin account operation failed:', error?.message || 'unknown error');
        return jsonResponse({ success: false, error: 'Unable to complete the account operation right now.' }, 503);
    }
}
