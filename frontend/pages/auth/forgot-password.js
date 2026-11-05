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

    let currentEmail = '';
    let resendTimer = null;

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

            const result = typeof apiSendPasswordResetEmail === 'function'
                ? await apiSendPasswordResetEmail(email)
                : { success: false, error: 'Password recovery is currently unavailable. Please try again.' };

            if (result && result.success) {
                currentEmail = email;
                if (requestForm) requestForm.hidden = true;
                if (verifyForm) verifyForm.hidden = false;
                if (newPasswordForm) newPasswordForm.hidden = true;
                if (title) title.textContent = 'Verify your email';
                if (subtitle) subtitle.textContent = `We sent a 6-digit verification code to ${email}. Check your email and enter the code below.`;

                showStatus(`A six-digit verification code has been sent to ${email}. Please check your inbox and spam folder.`, 'success');
                startResendCountdown();
                if (codeInput) {
                    codeInput.value = '';
                    codeInput.focus();
                }
            } else {
                showStatus((result && result.error) || 'Unable to find an account with that email. Please check and try again.', 'error');
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
            const result = typeof apiSendPasswordResetEmail === 'function'
                ? await apiSendPasswordResetEmail(currentEmail)
                : { success: false };

            if (result && result.success) {
                showStatus(`A new six-digit verification code has been sent to ${currentEmail}. Please check your inbox.`, 'success');
                startResendCountdown();
                if (codeInput) { codeInput.value = ''; codeInput.focus(); }
            } else {
                resendButton.disabled = false;
                if (resendStatus) resendStatus.textContent = 'Failed to resend. Please try again.';
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

            if (button) { button.disabled = true; button.textContent = 'Updating Password…'; }

            const updateResult = typeof apiResetPasswordWithVerifiedCode === 'function'
                ? await apiResetPasswordWithVerifiedCode(currentEmail, password)
                : { success: false, error: 'Password update service is unavailable.' };

            if (updateResult && updateResult.success) {
                showStatus('Password updated successfully! Redirecting to login…', 'success');
                setTimeout(function () {
                    window.location.href = 'login.html?reset=success&email=' + encodeURIComponent(currentEmail);
                }, 1200);
            } else {
                showStatus((updateResult && updateResult.error) || 'Unable to update password. Please try again.', 'error');
                if (button) { button.disabled = false; button.textContent = originalLabel; }
            }
        });
    }
})();
