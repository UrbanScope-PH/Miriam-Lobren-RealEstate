/**
 * UrbanScope - Shared Login Controller
 * Single sign-in page for clients, admins, and the superadmin. Handles credentials
 * submission, sign-out (?logout=1), and role-based post-login redirection.
 */

const params = new URLSearchParams(window.location.search);

function isLocalLoginHost() {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' ||
        /^192\.168\./.test(host) || /^10\./.test(host) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) || window.location.port === '8000';
}

function redirectAdminUser(user) {
    const role = String(user?.role || '').toLowerCase();
    const email = String(user?.email || '').toLowerCase().trim();
    if (role === 'admin' || role === 'superadmin' || email === 'urbanscope.cvsu@gmail.com') {
        window.location.replace('../admin/dashboard.html');
        return true;
    }
    return false;
}

async function redirectCurrentAdminSession() {
    if (isLocalLoginHost()) {
        try {
            const rawUser = localStorage.getItem('adminUser') || localStorage.getItem('urbanscope_user');
            if (rawUser) redirectAdminUser(JSON.parse(rawUser));
        } catch (_) {}
        return;
    }

    if (typeof apiGetHostedAdminSession === 'function') {
        const hostedUser = await apiGetHostedAdminSession();
        if (hostedUser) redirectAdminUser(hostedUser);
    }
}

// Admin / superadmin "Sign Out" links land here with ?logout=1 — clear the session
// (localStorage + server cookie) and drop the flag from the URL.
if (params.get('logout') === '1') {
    if (typeof apiSignOut === 'function') {
        apiSignOut();
    } else {
        localStorage.removeItem('urbanscope_jwt_token');
        localStorage.removeItem('urbanscope_user');
        localStorage.removeItem('adminUser');
    }
    params.delete('logout');
    const rest = params.toString();
    history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : ''));
} else {
    // On Vercel, redirect only when the signed HttpOnly cookie is valid.
    // localStorage role values are used only for the local FastAPI development flow.
    redirectCurrentAdminSession();
}
const rawNext = params.get('redirect') || '';
// Allow valid redirect paths relative to the frontend root (e.g. index.html, pages/properties/properties.html, pages/inquiry/inquiry.html)
const safeNext = /^[A-Za-z0-9_\-\/]+\.html([?#][A-Za-z0-9_\-=&%.]*)?$/.test(rawNext) ? rawNext : 'index.html';

if (params.get('email')) {
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = params.get('email');
}
if (params.get('reset') === 'success') {
    const notice = document.getElementById('authNotice');
    if (notice) {
        notice.hidden = false;
        notice.textContent = 'Your password was updated. Log in with your new password.';
    }
}

if (params.get('reason') === 'inquiry') {
    const notice = document.getElementById('authNotice');
    if (notice) notice.hidden = false;
}

// Keep the redirect target when switching to the register page
const registerLink = document.querySelector('.register-prompt a');
if (registerLink && window.location.search) {
    registerLink.href = 'register.html' + window.location.search;
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    if (window.UrbanBotGuard) window.UrbanBotGuard.init('loginForm', 'loginTurnstile');
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = this.querySelector('.btn-submit');
        const originalText = btn.innerText;

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const botData = window.UrbanBotGuard ? window.UrbanBotGuard.collect('loginForm', 'loginTurnstile') : {};

        btn.disabled = true;
        btn.innerText = 'Signing In...';

        try {
            const res = await apiSignIn(email, password, botData);
            if (res && res.success) {
                const user = res.data?.user || {};
                const cleanEmail = (user.email || email).toLowerCase();
                const role = user.role || 'user';
                const isAdminUser = (
                    role === 'admin' ||
                    role === 'superadmin'
                );

                if (isAdminUser && !res.data?.admin_session_ready) {
                    if (typeof apiCreateHostedAdminSession === 'function') {
                        const hostedSession = await apiCreateHostedAdminSession({ email: cleanEmail, password });
                        if (!hostedSession.success) {
                            throw new Error(hostedSession.error || 'Unable to secure this admin session.');
                        }
                    } else if (!isLocalLoginHost()) {
                        throw new Error('Admin session service is unavailable. Please try again later.');
                    }
                }

                // Relative paths so this works from both the FastAPI server and Live Server
                if (role === 'admin' || role === 'superadmin') {
                    window.location.href = '../admin/dashboard.html';
                } else {
                    // Normal user dashboard / destination
                    const isAdminDestination = /^pages\/(admin|superadmin)\//i.test(safeNext);
                    if (safeNext && safeNext !== 'index.html' && !isAdminDestination) {
                        window.location.href = '../../' + safeNext;
                    } else {
                        window.location.href = res.data?.redirect_url || '../../index.html';
                    }
                }
            } else {
                if (window.UrbanBotGuard) window.UrbanBotGuard.reset('loginTurnstile');
                const failMsg = res?.error || 'Invalid email or password.';
                if (typeof window.showFeedbackToast === 'function') {
                    window.showFeedbackToast(failMsg, 'error');
                } else {
                    alert('Login failed: ' + failMsg);
                }
                btn.disabled = false;
                btn.innerText = originalText;
            }
        } catch (err) {
            if (window.UrbanBotGuard) window.UrbanBotGuard.reset('loginTurnstile');
            const errMsg = err.message || 'An unexpected error occurred.';
            if (typeof window.showFeedbackToast === 'function') {
                window.showFeedbackToast(errMsg, 'error');
            } else {
                alert('Login failed: ' + errMsg);
            }
            btn.disabled = false;
            btn.innerText = originalText;
        }
    });
}
