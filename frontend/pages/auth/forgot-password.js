(function () {
    const requestForm = document.getElementById('resetRequestForm');
    const verifyForm = document.getElementById('resetVerifyForm');
    const newPasswordForm = document.getElementById('resetNewPasswordForm');
    const statusBox = document.getElementById('resetStatus');
    const emailInput = document.getElementById('resetEmail');
    const codeInput = document.getElementById('resetCode');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmNewPassword');
    const resendButton = document.getElementById('resendResetCodeBtn');
    const resendStatus = document.getElementById('resetResendStatus');
    const title = document.getElementById('resetTitle');
    const subtitle = document.getElementById('resetSubtitle');
    const backHomeLink = document.querySelector('.back-home-link');
    const registerPrompt = document.querySelector('.register-prompt');

    const urlParams = new URLSearchParams(window.location.search);
    const originParam = String(urlParams.get('from') || '').trim().toLowerCase();
    const prefilledEmail = String(urlParams.get('email') || '').trim().toLowerCase();
    const cameFromProfile = originParam === 'profile';

    if (prefilledEmail && emailInput && !emailInput.value) {
        emailInput.value = prefilledEmail;
    }

    if (cameFromProfile) {
        if (backHomeLink) {
            backHomeLink.href = '../account/profile.html';
            const backLabel = backHomeLink.querySelector('span');
            if (backLabel) {
                backLabel.textContent = 'Back to Profile & Security';
            } else {
                backHomeLink.textContent = 'Back to Profile & Security';
            }
        }
        if (registerPrompt) {
            registerPrompt.innerHTML = '<span>Want to manage your account instead?</span><a href="../account/profile.html">Back to Profile &amp; Security</a>';
        }
    }

    let currentEmail = '';
    let verifiedCode = '';
    let resendTimer = null;

    function showStatus(message, type, actionLink = null) {
        if (!statusBox) return;
        statusBox.textContent = '';
        statusBox.hidden = !message;
        statusBox.classList.remove('auth-notice-success', 'auth-notice-error', 'is-error', 'is-success');
        if (type === 'error') {
            statusBox.classList.add('is-error');
        } else if (type === 'success') {
            statusBox.classList.add('is-success', 'auth-notice-success');
        }
        if (message) {
            statusBox.appendChild(document.createTextNode(message));
            if (actionLink && actionLink.href && actionLink.label) {
                const linkEl = document.createElement('a');
                linkEl.className = 'reset-notice-link';
                linkEl.href = actionLink.href;
                linkEl.textContent = actionLink.label;
                statusBox.appendChild(document.createTextNode(' '));
                statusBox.appendChild(linkEl);
            }
        }
    }

    function startResendCountdown() {
        if (resendTimer) window.clearInterval(resendTimer);
        let remaining = 60;
        if (resendButton) resendButton.disabled = true;
        if (resendStatus) resendStatus.textContent = `You can request another code in ${remaining}s.`;
        resendTimer = window.setInterval(function () {
            remaining -= 1;
            if (remaining <= 0) {
                window.clearInterval(resendTimer);
                resendTimer = null;
                if (resendButton) resendButton.disabled = false;
                if (resendStatus) resendStatus.textContent = "Didn't receive the email?";
                return;
            }
            if (resendStatus) resendStatus.textContent = `You can request another code in ${remaining}s.`;
        }, 1000);
    }

    // ==========================================
    // STEP 1: Request Verification Code (Email Only)
    // ==========================================
    if (requestForm) {
        if (window.UrbanBotGuard) window.UrbanBotGuard.init('resetRequestForm', 'resetTurnstile');
        requestForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            const email = String(emailInput?.value || '').trim().toLowerCase();
            const button = document.getElementById('requestResetCodeBtn');
            const originalLabel = button?.textContent || '';

            if (!email || !email.includes('@')) {
                showStatus('Please enter a valid email address.', 'error');
                emailInput?.focus();
                return;
            }

            if (button) { button.disabled = true; button.textContent = 'Sending Code…'; }

            const botData = window.UrbanBotGuard ? window.UrbanBotGuard.collect('resetRequestForm', 'resetTurnstile') : {};
            const result = typeof apiSendPasswordResetEmail === 'function'
                ? await apiSendPasswordResetEmail(email, botData)
                : { success: false, error: 'Password recovery is currently unavailable. Please try again.' };

            if (result && result.success) {
                currentEmail = email;
                verifiedCode = '';
                if (requestForm) requestForm.hidden = true;
                if (verifyForm) verifyForm.hidden = false;
                if (newPasswordForm) newPasswordForm.hidden = true;
                if (title) title.textContent = 'Verify your email';
                if (subtitle) subtitle.textContent = `We sent a 6-digit verification code to ${email}. Enter the code below to continue.`;

                if (codeInput) codeInput.value = '';
                showStatus(`A six-digit verification code has been sent to ${email}. Please check your inbox, Spam, or Junk folder.`, 'success');
                startResendCountdown();
                if (codeInput) {
                    codeInput.focus();
                }
            } else {
                if (window.UrbanBotGuard) window.UrbanBotGuard.reset('resetTurnstile');
                const errMsg = (result && result.error) || 'Unable to find an account with that email. Please check and try again.';
                const errCode = String(result?.code || '');
                let actionLink = null;
                if (errCode === 'EMAIL_NOT_REGISTERED' || /not registered/i.test(errMsg)) {
                    actionLink = { label: 'Create an account', href: 'register.html' };
                } else if (errCode === 'GOOGLE_ACCOUNT_NO_PASSWORD') {
                    actionLink = { label: 'Go to Log In', href: 'login.html' };
                }
                showStatus(errMsg, 'error', actionLink);
                emailInput?.focus();
            }

            if (button) { button.disabled = false; button.textContent = originalLabel; }
        });
    }

    // ==========================================
    // STEP 2: Verify 6-Digit Email Code
    // ==========================================
    if (verifyForm) {
        verifyForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            const code = String(codeInput?.value || '').trim();
            const button = document.getElementById('verifyResetCodeBtn');
            const originalLabel = button?.textContent || '';

            if (!/^[0-9]{6}$/.test(code)) {
                showStatus('Enter the complete six-digit verification code.', 'error');
                codeInput?.focus();
                return;
            }

            if (button) { button.disabled = true; button.textContent = 'Verifying Code…'; }

            const verifyResult = typeof apiVerifyPasswordResetCode === 'function'
                ? await apiVerifyPasswordResetCode(currentEmail, code)
                : { success: false, error: 'Verification service unavailable. Please refresh and try again.' };

            if (verifyResult && verifyResult.success) {
                verifiedCode = code;
                if (verifyForm) verifyForm.hidden = true;
                if (newPasswordForm) newPasswordForm.hidden = false;
                if (title) title.textContent = 'Create new password';
                if (subtitle) subtitle.textContent = 'Your new password must be at least 8 characters long.';
                showStatus('Email verified successfully! Please enter your new password below.', 'success');
                if (newPasswordInput) newPasswordInput.focus();
            } else {
                showStatus((verifyResult && verifyResult.error) || 'The verification code is incorrect or expired. Please check your email.', 'error');
                if (codeInput) codeInput.focus();
            }

            if (button) { button.disabled = false; button.textContent = originalLabel; }
        });
    }

    // Resend Code Trigger
    if (resendButton) {
        resendButton.addEventListener('click', async function () {
            if (!currentEmail) return;
            resendButton.disabled = true;
            if (resendStatus) resendStatus.textContent = 'Sending new code…';
            verifiedCode = '';
            const botData = window.UrbanBotGuard ? window.UrbanBotGuard.collect('resetRequestForm', 'resetTurnstile') : {};
            const result = typeof apiSendPasswordResetEmail === 'function'
                ? await apiSendPasswordResetEmail(currentEmail, botData)
                : { success: false };

            if (result && result.success) {
                if (codeInput) codeInput.value = '';
                showStatus(`A new six-digit verification code has been sent to ${currentEmail}. Please check your inbox, Spam, or Junk folder.`, 'success');
                startResendCountdown();
                if (codeInput) { codeInput.focus(); }
            } else {
                resendButton.disabled = false;
                if (resendStatus) resendStatus.textContent = 'Failed to resend. Please try again.';
                if (result && result.error) showStatus(result.error, 'error');
            }
        });
    }

    // ==========================================
    // STEP 3: Submit New Password
    // ==========================================
    if (newPasswordForm) {
        newPasswordForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            const password = String(newPasswordInput?.value || '');
            const confirmation = String(confirmPasswordInput?.value || '');
            const button = document.getElementById('confirmResetBtn');
            const originalLabel = button?.textContent || '';

            if (password.length < 8) {
                showStatus('Password must be at least 8 characters long.', 'error');
                newPasswordInput?.focus();
                return;
            }
            if (password !== confirmation) {
                showStatus('The passwords do not match. Please re-enter.', 'error');
                confirmPasswordInput?.focus();
                return;
            }

            if (!/^[0-9]{6}$/.test(verifiedCode)) {
                showStatus('Please verify your 6-digit email code before setting a new password.', 'error');
                if (verifyForm) verifyForm.hidden = false;
                if (newPasswordForm) newPasswordForm.hidden = true;
                codeInput?.focus();
                return;
            }

            if (button) { button.disabled = true; button.textContent = 'Updating Password…'; }

            const updateResult = typeof apiResetPasswordWithVerifiedCode === 'function'
                ? await apiResetPasswordWithVerifiedCode(currentEmail, verifiedCode, password)
                : { success: false, error: 'Password update service is unavailable.' };

            if (updateResult && updateResult.success) {
                try {
                    ['urbanscope_user', 'urbanscope_demo_user'].forEach(function (storageKey) {
                        const raw = localStorage.getItem(storageKey);
                        if (!raw) return;
                        const parsed = JSON.parse(raw);
                        if (parsed && String(parsed.email || '').trim().toLowerCase() === currentEmail) {
                            parsed.has_password = true;
                            localStorage.setItem(storageKey, JSON.stringify(parsed));
                        }
                    });
                } catch (_) {}

                if (cameFromProfile) {
                    showStatus('Password updated successfully! Returning to Profile & Security…', 'success');
                    setTimeout(function () {
                        window.location.href = '../account/profile.html?password_reset=success';
                    }, 1200);
                } else {
                    showStatus('Password updated successfully! Redirecting to login…', 'success');
                    setTimeout(function () {
                        window.location.href = 'login.html?reset=success&email=' + encodeURIComponent(currentEmail);
                    }, 1200);
                }
            } else {
                showStatus((updateResult && updateResult.error) || 'Unable to update password. Please try again.', 'error');
                if (button) { button.disabled = false; button.textContent = originalLabel; }
            }
        });
    }
})();
