(function () {
    'use strict';

    const profileForm = document.getElementById('clientProfileForm');
    const passwordForm = document.getElementById('clientPasswordForm');
    const reminderBanner = document.getElementById('passwordReminderBanner');
    const focusAddPasswordBtn = document.getElementById('focusAddPasswordBtn');

    const emailInput = document.getElementById('profileEmail');
    const fullNameInput = document.getElementById('profileFullName');
    const phoneInput = document.getElementById('profilePhone');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const profileFormError = document.getElementById('profileFormError');

    const passwordStatusBadge = document.getElementById('passwordStatusBadge');
    const passwordStatusText = document.getElementById('passwordStatusText');
    const passwordCardTitle = document.getElementById('passwordCardTitle');
    const passwordCardSubtitle = document.getElementById('passwordCardSubtitle');
    const currentPasswordGroup = document.getElementById('currentPasswordGroup');
    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const savePasswordBtn = document.getElementById('savePasswordBtn');
    const passwordFormError = document.getElementById('passwordFormError');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');

    const toastNotice = document.getElementById('toastNotice');
    const toastMessage = document.getElementById('toastMessage');

    const googleStatusBadge = document.getElementById('googleStatusBadge');
    const googleStatusText = document.getElementById('googleStatusText');
    const googleConnectionDetail = document.getElementById('googleConnectionDetail');
    const googleFormError = document.getElementById('googleFormError');
    const connectGoogleBtn = document.getElementById('connectGoogleBtn');

    if (window.location.hostname === '127.0.0.1') {
        window.location.replace(window.location.href.replace('//127.0.0.1', '//localhost'));
        return;
    }

    let activeUser = null;
    let toastTimer = null;
    let preloadedGoogleConfig = null;

    function isMainAdminUser(user) {
        if (!user) return false;
        const cleanEmail = String(user.email || '').trim().toLowerCase();
        const role = String(user.role || '').trim().toLowerCase();
        return cleanEmail === 'miriamalobren@gmail.com' || role === 'admin' || role === 'superadmin';
    }

    function normalizePhMobile(rawPhone) {
        const clean = String(rawPhone || '').trim();
        if (!clean) return { ok: true, value: '' };

        const digitsOnly = clean.replace(/[\s\-()]/g, '');
        if (/^09\d{9}$/.test(digitsOnly)) {
            return { ok: true, value: '+63' + digitsOnly.slice(1) };
        }
        if (/^639\d{9}$/.test(digitsOnly)) {
            return { ok: true, value: '+' + digitsOnly };
        }
        if (/^9\d{9}$/.test(digitsOnly)) {
            return { ok: true, value: '+63' + digitsOnly };
        }
        if (/^\+639\d{9}$/.test(digitsOnly)) {
            return { ok: true, value: digitsOnly };
        }
        return {
            ok: false,
            error: 'Please enter a valid Philippine mobile number (e.g. 0917 123 4567 or +63 917 123 4567).'
        };
    }

    function showAlert(el, message) {
        if (!el) return;
        if (!message) {
            el.textContent = '';
            el.hidden = true;
            return;
        }
        el.textContent = message;
        el.hidden = false;
    }

    function showToast(message, isError = false) {
        if (!toastNotice || !toastMessage) return;
        toastMessage.textContent = message;
        toastNotice.classList.toggle('error', Boolean(isError));
        toastNotice.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toastNotice.classList.remove('show');
        }, 3600);
    }

    function renderAccountState(user) {
        if (!user) return;
        activeUser = user;

        const cleanEmail = String(user.email || '').trim();
        const cleanName = String(user.full_name || user.name || '').trim();
        const cleanPhone = String(user.phone || '').trim();
        const userHasPassword = user.has_password !== false;

        if (emailInput) emailInput.value = cleanEmail;
        if (fullNameInput) fullNameInput.value = cleanName;
        if (phoneInput) phoneInput.value = cleanPhone;

        if (forgotPasswordLink) {
            forgotPasswordLink.href = '../auth/forgot-password.html?from=profile'
                + (cleanEmail ? '&email=' + encodeURIComponent(cleanEmail) : '');
        }

        if (reminderBanner) {
            reminderBanner.hidden = userHasPassword;
        }

        if (passwordStatusBadge && passwordStatusText) {
            passwordStatusBadge.classList.toggle('is-active', userHasPassword);
            passwordStatusBadge.classList.toggle('is-missing', !userHasPassword);
            passwordStatusText.textContent = userHasPassword ? 'Password active' : 'Password not set';
        }

        if (passwordCardTitle) {
            passwordCardTitle.textContent = userHasPassword ? 'Change Password' : 'Add a Password';
        }
        if (passwordCardSubtitle) {
            passwordCardSubtitle.textContent = userHasPassword
                ? 'Keep your UrbanScope account protected with a strong password.'
                : 'Your account uses Google Sign-In. Add a password so you can also sign in with email anytime.';
        }

        if (currentPasswordGroup && currentPasswordInput) {
            currentPasswordGroup.hidden = !userHasPassword;
            currentPasswordInput.required = userHasPassword;
            if (!userHasPassword) {
                currentPasswordInput.value = '';
            }
        }

        if (savePasswordBtn) {
            savePasswordBtn.textContent = userHasPassword ? 'Update Password' : 'Add Password';
        }

        const googleConnected = Boolean(user.google_connected);
        const linkedGmail = String(user.google_email || cleanEmail || '').trim().toLowerCase();

        if (googleStatusBadge && googleStatusText) {
            googleStatusBadge.classList.toggle('is-connected', googleConnected);
            googleStatusBadge.classList.toggle('is-disconnected', !googleConnected);
            googleStatusText.textContent = googleConnected ? 'Connected' : 'Not connected';
        }

        if (googleConnectionDetail) {
            googleConnectionDetail.textContent = googleConnected
                ? `Connected with Google (${linkedGmail}). You can sign in using Google or your email & password.`
                : 'Your profile is not linked to a Google account yet. Connect a Gmail account to enable one-click Google Sign-In.';
        }

        if (connectGoogleBtn) {
            connectGoogleBtn.hidden = googleConnected;
        }
    }

    function initPasswordToggles() {
        document.querySelectorAll('.password-toggle-btn[data-toggle-target]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const targetId = btn.getAttribute('data-toggle-target');
                const input = targetId ? document.getElementById(targetId) : null;
                if (!input) return;

                const showing = input.type === 'text';
                input.type = showing ? 'password' : 'text';
                btn.setAttribute('aria-pressed', String(!showing));
                btn.setAttribute('aria-label', (showing ? 'Show ' : 'Hide ') + targetId.replace(/([A-Z])/g, ' $1').toLowerCase());
            });
        });
    }

    async function loadUserState() {
        let user = null;
        if (typeof window.apiGetCurrentUser === 'function') {
            user = await window.apiGetCurrentUser(true).catch(function () { return null; });
        }
        if (!user && window.UrbanSession && typeof window.UrbanSession.getUser === 'function') {
            user = await window.UrbanSession.getUser().catch(function () { return null; });
        }
        if (!user) return;

        if (isMainAdminUser(user)) {
            window.location.replace('../admin/profile.html');
            return;
        }

        renderAccountState(user);
    }

    document.addEventListener('DOMContentLoaded', async function () {
        initPasswordToggles();

        const params = new URLSearchParams(window.location.search);
        if (params.get('password_reset') === 'success') {
            params.delete('password_reset');
            const cleanSearch = params.toString();
            const cleanUrl = window.location.pathname + (cleanSearch ? '?' + cleanSearch : '') + window.location.hash;
            try { window.history.replaceState({}, document.title, cleanUrl); } catch (_) {}
            showToast('Password updated successfully!');
        }

        await loadUserState();

        if (focusAddPasswordBtn) {
            focusAddPasswordBtn.addEventListener('click', function () {
                const card = document.getElementById('passwordSecurityCard');
                if (card && typeof card.scrollIntoView === 'function') {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                if (newPasswordInput) {
                    setTimeout(function () { newPasswordInput.focus(); }, 220);
                }
            });
        }

        if (profileForm) {
            profileForm.addEventListener('submit', async function (event) {
                event.preventDefault();
                showAlert(profileFormError, '');

                const cleanName = String(fullNameInput?.value || '').trim();
                const rawPhone = String(phoneInput?.value || '').trim();

                if (!cleanName || cleanName.length < 2 || cleanName.length > 120) {
                    const msg = 'Full name must be between 2 and 120 characters.';
                    showAlert(profileFormError, msg);
                    fullNameInput?.focus();
                    return;
                }

                const phoneCheck = normalizePhMobile(rawPhone);
                if (!phoneCheck.ok) {
                    showAlert(profileFormError, phoneCheck.error);
                    phoneInput?.focus();
                    return;
                }

                const originalText = saveProfileBtn ? saveProfileBtn.textContent : 'Save Changes';
                if (saveProfileBtn) {
                    saveProfileBtn.disabled = true;
                    saveProfileBtn.textContent = 'Saving…';
                }

                const result = typeof window.apiUpdateClientProfile === 'function'
                    ? await window.apiUpdateClientProfile({
                        full_name: cleanName,
                        phone: phoneCheck.value
                    })
                    : { success: false, error: 'Profile service is currently unavailable.' };

                if (saveProfileBtn) {
                    saveProfileBtn.disabled = false;
                    saveProfileBtn.textContent = originalText;
                }

                if (!result || !result.success) {
                    const errMsg = (result && result.error) || 'Unable to save profile changes.';
                    showAlert(profileFormError, errMsg);
                    showToast(errMsg, true);
                    return;
                }

                if (result.user) {
                    renderAccountState(result.user);
                } else if (activeUser) {
                    renderAccountState({ ...activeUser, full_name: cleanName, name: cleanName, phone: phoneCheck.value });
                }

                showToast('Contact details updated and synced for inquiry autofill.');
            });
        }

        if (passwordForm) {
            passwordForm.addEventListener('submit', async function (event) {
                event.preventDefault();
                showAlert(passwordFormError, '');

                const requiresCurrent = !activeUser || activeUser.has_password !== false;
                const currentPwd = String(currentPasswordInput?.value || '');
                const nextPwd = String(newPasswordInput?.value || '').trim();
                const confirmPwd = String(confirmPasswordInput?.value || '').trim();

                if (requiresCurrent && !currentPwd) {
                    showAlert(passwordFormError, 'Please enter your current password.');
                    currentPasswordInput?.focus();
                    return;
                }

                if (nextPwd.length < 8 || nextPwd.length > 128) {
                    showAlert(passwordFormError, 'New password must be between 8 and 128 characters long.');
                    newPasswordInput?.focus();
                    return;
                }

                if (nextPwd !== confirmPwd) {
                    showAlert(passwordFormError, 'New password and confirmation do not match.');
                    confirmPasswordInput?.focus();
                    return;
                }

                const originalLabel = savePasswordBtn ? savePasswordBtn.textContent : 'Save Password';
                if (savePasswordBtn) {
                    savePasswordBtn.disabled = true;
                    savePasswordBtn.textContent = requiresCurrent ? 'Updating…' : 'Adding…';
                }

                const result = typeof window.apiUpdateClientPassword === 'function'
                    ? await window.apiUpdateClientPassword({
                        current_password: requiresCurrent ? currentPwd : '',
                        new_password: nextPwd
                    })
                    : { success: false, error: 'Password service is currently unavailable.' };

                if (savePasswordBtn) {
                    savePasswordBtn.disabled = false;
                    savePasswordBtn.textContent = originalLabel;
                }

                if (!result || !result.success) {
                    const errMsg = (result && result.error) || 'Unable to update password.';
                    showAlert(passwordFormError, errMsg);
                    showToast(errMsg, true);
                    return;
                }

                if (currentPasswordInput) currentPasswordInput.value = '';
                if (newPasswordInput) newPasswordInput.value = '';
                if (confirmPasswordInput) confirmPasswordInput.value = '';

                if (result.user) {
                    renderAccountState(result.user);
                } else if (activeUser) {
                    renderAccountState({ ...activeUser, has_password: true });
                }

                showToast(result.message || (requiresCurrent ? 'Password updated successfully.' : 'Password added successfully.'));
            });
        }

        if (typeof window.apiGetGoogleConfig === 'function') {
            window.apiGetGoogleConfig().then(function (cfg) {
                if (cfg && cfg.enabled && cfg.client_id) {
                    preloadedGoogleConfig = cfg;
                }
            }).catch(function () {});
        }

        function ensureGoogleSdk(timeoutMs) {
            return new Promise(function (resolve) {
                if (window.google && window.google.accounts && window.google.accounts.oauth2) {
                    resolve(true);
                    return;
                }
                let script = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
                if (!script) {
                    script = document.createElement('script');
                    script.src = 'https://accounts.google.com/gsi/client';
                    script.async = true;
                    script.defer = true;
                    document.head.appendChild(script);
                }
                const started = Date.now();
                const timer = setInterval(function () {
                    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
                        clearInterval(timer);
                        resolve(true);
                    } else if (Date.now() - started >= (timeoutMs || 6000)) {
                        clearInterval(timer);
                        resolve(false);
                    }
                }, 120);
            });
        }

        if (connectGoogleBtn) {
            const labelSpan = connectGoogleBtn.querySelector('span');
            const defaultLabel = labelSpan ? labelSpan.textContent : 'Connect Google Account';

            function setGoogleBtnBusy(busy, label) {
                connectGoogleBtn.disabled = busy;
                if (labelSpan) labelSpan.textContent = label || defaultLabel;
            }

            function launchLinkPopup(clientId) {
                const tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: 'openid email profile',
                    callback: async function (tokenResponse) {
                        if (!tokenResponse || tokenResponse.error) {
                            setGoogleBtnBusy(false);
                            if (tokenResponse && tokenResponse.error &&
                                tokenResponse.error !== 'popup_closed_by_user' &&
                                tokenResponse.error !== 'access_denied') {
                                showAlert(googleFormError, 'Google sign-in error: ' + (tokenResponse.error_description || tokenResponse.error));
                            }
                            return;
                        }
                        if (!tokenResponse.access_token) {
                            setGoogleBtnBusy(false);
                            return;
                        }

                        setGoogleBtnBusy(true, 'Connecting…');
                        const result = typeof window.apiLinkGoogleAccount === 'function'
                            ? await window.apiLinkGoogleAccount({ access_token: tokenResponse.access_token })
                            : { success: false, error: 'Google linking service is unavailable.' };
                        setGoogleBtnBusy(false);

                        if (!result || !result.success) {
                            const errMsg = (result && result.error) || 'Unable to connect your Google account.';
                            showAlert(googleFormError, errMsg);
                            showToast(errMsg, true);
                            return;
                        }

                        showAlert(googleFormError, '');
                        if (result.user) {
                            renderAccountState(result.user);
                        } else if (activeUser) {
                            renderAccountState({ ...activeUser, google_connected: true });
                        }
                        showToast(result.message || 'Google account connected successfully!');
                    },
                    error_callback: function (err) {
                        setGoogleBtnBusy(false);
                        if (err && err.type === 'popup_failed_to_open') {
                            showAlert(googleFormError, 'Google sign-in popup was blocked. Please allow popups for this site and try again.');
                        }
                    }
                });
                tokenClient.requestAccessToken({ prompt: 'select_account' });
            }

            connectGoogleBtn.addEventListener('click', async function () {
                showAlert(googleFormError, '');
                setGoogleBtnBusy(true, 'Opening Google…');

                if (
                    preloadedGoogleConfig &&
                    preloadedGoogleConfig.enabled &&
                    preloadedGoogleConfig.client_id &&
                    window.google &&
                    window.google.accounts &&
                    window.google.accounts.oauth2
                ) {
                    launchLinkPopup(preloadedGoogleConfig.client_id);
                    return;
                }

                const cfg = typeof window.apiGetGoogleConfig === 'function'
                    ? await window.apiGetGoogleConfig()
                    : { enabled: false, client_id: '' };

                if (!cfg || !cfg.enabled || !cfg.client_id) {
                    setGoogleBtnBusy(false);
                    showAlert(googleFormError, 'Google Sign-In is not configured on this server.');
                    return;
                }
                preloadedGoogleConfig = cfg;

                const sdkReady = await ensureGoogleSdk(6000);
                if (!sdkReady || !window.google || !window.google.accounts || !window.google.accounts.oauth2) {
                    setGoogleBtnBusy(false);
                    showAlert(googleFormError, 'Could not load Google Identity Services. Please check your connection and try again.');
                    return;
                }

                launchLinkPopup(cfg.client_id);
            });
        }
    });
})();
