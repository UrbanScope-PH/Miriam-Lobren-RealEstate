(function () {
    const requestForm = document.getElementById('resetRequestForm');
    const confirmForm = document.getElementById('resetConfirmForm');
    const statusBox = document.getElementById('resetStatus');
    const emailInput = document.getElementById('resetEmail');
    const phoneInput = document.getElementById('resetPhone');
    const codeInput = document.getElementById('resetCode');
    const codeGroup = document.getElementById('resetCodeGroup');
    const resendRow = document.getElementById('resetResendRow');
    const resendButton = document.getElementById('resendResetCodeBtn');
    const resendStatus = document.getElementById('resetResendStatus');
    const subtitle = document.getElementById('resetSubtitle');

    let resendTimer = null;
    let verifiedViaPhone = false;

    function showStatus(message, type) {
        if (!statusBox) return;
        statusBox.textContent = message || '';
        statusBox.hidden = !message;
        statusBox.classList.remove('auth-notice-success', 'auth-notice-error', 'is-error', 'is-success');
        if (type === 'error') {
            statusBox.classList.add('is-error');
            statusBox.style.background = '#fce8e6';
            statusBox.style.borderColor = '#ea4335';
            statusBox.style.color = '#c5221f';
        } else if (type === 'success') {
            statusBox.classList.add('is-success', 'auth-notice-success');
            statusBox.style.background = '#e6f4ea';
            statusBox.style.borderColor = '#34a853';
            statusBox.style.color = '#137333';
        } else {
            statusBox.style.background = '';
            statusBox.style.borderColor = '';
            statusBox.style.color = '';
        }
    }

    function startResendCountdown() {
        if (resendTimer) window.clearInterval(resendTimer);
        let remaining = 60;
        if (resendButton) resendButton.disabled = true;
        if (resendStatus) resendStatus.textContent = `You can request another code in ${remaining} seconds.`;
        resendTimer = window.setInterval(function () {
            remaining -= 1;
            if (remaining <= 0) {
                window.clearInterval(resendTimer);
                resendTimer = null;
                if (resendButton) resendButton.disabled = false;
                if (resendStatus) resendStatus.textContent = "Didn't receive the code?";
                return;
            }
            if (resendStatus) resendStatus.textContent = `You can request another code in ${remaining} seconds.`;
        }, 1000);
    }

    if (requestForm) {
        requestForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            const email = String(emailInput?.value || '').trim().toLowerCase();
            const phone = String(phoneInput?.value || '').trim();
            const button = document.getElementById('requestResetCodeBtn');
            const originalLabel = button?.textContent || '';

            if (!email || !email.includes('@')) {
                showStatus('Enter a valid email address.', 'error');
                emailInput?.focus();
                return;
            }

            if (button) { button.disabled = true; button.textContent = 'Verifying…'; }

            // Priority 1: Phone verification against Supabase / backend user account
            if (phone && typeof apiVerifyAccountForPasswordReset === 'function') {
                const verifyResult = await apiVerifyAccountForPasswordReset(email, phone);
                if (verifyResult && verifyResult.success) {
                    verifiedViaPhone = true;
                    if (requestForm) requestForm.hidden = true;
                    if (confirmForm) confirmForm.hidden = false;
                    if (codeGroup) codeGroup.hidden = true;
                    if (codeInput) codeInput.required = false;
                    if (resendRow) resendRow.hidden = true;
                    if (subtitle) subtitle.textContent = 'Account verified! Enter your new password below.';
                    showStatus('Account verified. Please set your new password.', 'success');
                    document.getElementById('newPassword')?.focus();
                    if (button) { button.disabled = false; button.textContent = originalLabel; }
                    return;
                } else if (verifyResult && !verifyResult.success) {
                    showStatus(verifyResult.error || 'The account details provided do not match our records.', 'error');
                    if (button) { button.disabled = false; button.textContent = originalLabel; }
                    return;
                }
            }

            // Priority 2: Email OTP code request (if available)
            if (typeof apiRequestPasswordReset === 'function') {
                const result = await apiRequestPasswordReset(email);
                if (result && result.success) {
                    verifiedViaPhone = false;
                    if (requestForm) requestForm.hidden = true;
                    if (confirmForm) confirmForm.hidden = false;
                    if (codeGroup) codeGroup.hidden = false;
                    if (codeInput) { codeInput.required = true; codeInput.focus(); }
                    if (resendRow) resendRow.hidden = false;
                    showStatus(result.message || 'If an account can be recovered with that email, a code has been sent.', 'success');
                    startResendCountdown();
                    if (button) { button.disabled = false; button.textContent = originalLabel; }
                    return;
                } else if (result && result.code === 'OTP_NOT_CONFIGURED') {
                    showStatus('Please enter your registered phone number to verify your account and reset your password.', 'error');
                    phoneInput?.focus();
                    if (button) { button.disabled = false; button.textContent = originalLabel; }
                    return;
                } else {
                    showStatus((result && result.error) || 'Unable to request a recovery code. Please check your details and try again.', 'error');
                    if (button) { button.disabled = false; button.textContent = originalLabel; }
                    return;
                }
            }

            showStatus('Password recovery service is currently unavailable. Please try again later.', 'error');
            if (button) { button.disabled = false; button.textContent = originalLabel; }
        });
    }

    if (resendButton) {
        resendButton.addEventListener('click', async function () {
            const email = String(emailInput?.value || '').trim().toLowerCase();
            resendButton.disabled = true;
            if (resendStatus) resendStatus.textContent = 'Requesting a new code…';
            if (typeof apiRequestPasswordReset === 'function') {
                const result = await apiRequestPasswordReset(email);
                if (result && result.success) {
                    showStatus(result.message || 'A new verification code has been sent.', 'success');
                    startResendCountdown();
                    return;
                }
            }
            resendButton.disabled = false;
            if (resendStatus) resendStatus.textContent = 'You can try requesting another code.';
        });
    }

    if (confirmForm) {
        confirmForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            const email = String(emailInput?.value || '').trim().toLowerCase();
            const phone = String(phoneInput?.value || '').trim();
            const password = document.getElementById('newPassword')?.value || '';
            const confirmation = document.getElementById('confirmNewPassword')?.value || '';
            const code = String(codeInput?.value || '').trim();

            if (password.length < 8) {
                showStatus('Use a password with at least 8 characters.', 'error');
                document.getElementById('newPassword')?.focus();
                return;
            }
            if (password !== confirmation) {
                showStatus('The passwords do not match.', 'error');
                document.getElementById('confirmNewPassword')?.focus();
                return;
            }

            const button = document.getElementById('confirmResetBtn');
            const originalLabel = button?.textContent || '';
            if (button) { button.disabled = true; button.textContent = 'Updating…'; }

            // Mode A: Phone-verified direct password reset
            if (verifiedViaPhone && typeof apiResetPasswordByPhone === 'function') {
                const resetResult = await apiResetPasswordByPhone(email, phone, password);
                if (resetResult && resetResult.success) {
                    showStatus('Password updated successfully! Redirecting to login…', 'success');
                    setTimeout(function () {
                        window.location.href = 'login.html?reset=success&email=' + encodeURIComponent(email);
                    }, 1200);
                    return;
                } else {
                    showStatus((resetResult && resetResult.error) || 'Failed to update password. Please try again.', 'error');
                    if (button) { button.disabled = false; button.textContent = originalLabel; }
                    return;
                }
            }

            // Mode B: Email OTP verification
            if (!/^[0-9]{6}$/.test(code)) {
                showStatus('Enter the six-digit code from your email.', 'error');
                codeInput?.focus();
                if (button) { button.disabled = false; button.textContent = originalLabel; }
                return;
            }

            const result = typeof apiCompletePasswordReset === 'function'
                ? await apiCompletePasswordReset(email, code, password)
                : { success: false, error: 'Password recovery is unavailable. Please try again.' };

            if (result && result.success) {
                showStatus('Password updated successfully! Redirecting to login…', 'success');
                setTimeout(function () {
                    window.location.href = 'login.html?reset=success&email=' + encodeURIComponent(email);
                }, 1200);
                return;
            }

            showStatus((result && result.error) || 'Unable to update the password. Please try again.', 'error');
            if (button) { button.disabled = false; button.textContent = originalLabel; }
        });
    }
})();
