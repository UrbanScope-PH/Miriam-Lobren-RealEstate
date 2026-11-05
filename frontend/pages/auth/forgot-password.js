(function () {
    const requestForm = document.getElementById('resetRequestForm');
    const confirmForm = document.getElementById('resetConfirmForm');
    const statusBox = document.getElementById('resetStatus');
    const emailInput = document.getElementById('resetEmail');
    const codeInput = document.getElementById('resetCode');
    const resendButton = document.getElementById('resendResetCodeBtn');
    const resendStatus = document.getElementById('resetResendStatus');
    let resendTimer = null;

    function showStatus(message, type) {
        if (!statusBox) return;
        statusBox.textContent = message || '';
        statusBox.hidden = !message;
        statusBox.classList.toggle('is-error', type === 'error');
        statusBox.classList.toggle('is-success', type === 'success');
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

    async function requestCode() {
        const email = String(emailInput?.value || '').trim().toLowerCase();
        if (!email || typeof apiRequestPasswordReset !== 'function') {
            showStatus('Enter your email address and try again.', 'error');
            return false;
        }
        const result = await apiRequestPasswordReset(email);
        if (!result || !result.success) {
            showStatus((result && result.error) || 'Unable to request a recovery code. Please try again.', 'error');
            return false;
        }
        if (requestForm) requestForm.hidden = true;
        if (confirmForm) confirmForm.hidden = false;
        if (codeInput) codeInput.focus();
        showStatus(result.message || 'If an account can be recovered with that email, a code has been sent.', 'success');
        startResendCountdown();
        return true;
    }

    if (requestForm) {
        requestForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            const button = document.getElementById('requestResetCodeBtn');
            const label = button?.textContent || '';
            if (button) { button.disabled = true; button.textContent = 'Sending…'; }
            await requestCode();
            if (button) { button.disabled = false; button.textContent = label; }
        });
    }

    if (resendButton) {
        resendButton.addEventListener('click', async function () {
            resendButton.disabled = true;
            if (resendStatus) resendStatus.textContent = 'Requesting a new code…';
            const sent = await requestCode();
            if (!sent) {
                resendButton.disabled = false;
                if (resendStatus) resendStatus.textContent = 'You can try requesting another code.';
            }
        });
    }

    if (confirmForm) {
        confirmForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            const password = document.getElementById('newPassword')?.value || '';
            const confirmation = document.getElementById('confirmNewPassword')?.value || '';
            const code = String(codeInput?.value || '').trim();
            if (password.length < 8) {
                showStatus('Use a password with at least 8 characters.', 'error');
                return;
            }
            if (password !== confirmation) {
                showStatus('The passwords do not match.', 'error');
                document.getElementById('confirmNewPassword')?.focus();
                return;
            }
            if (!/^[0-9]{6}$/.test(code)) {
                showStatus('Enter the six-digit code from your email.', 'error');
                codeInput?.focus();
                return;
            }

            const button = document.getElementById('confirmResetBtn');
            const label = button?.textContent || '';
            if (button) { button.disabled = true; button.textContent = 'Updating…'; }
            const result = typeof apiCompletePasswordReset === 'function'
                ? await apiCompletePasswordReset(String(emailInput?.value || '').trim().toLowerCase(), code, password)
                : { success: false, error: 'Password recovery is unavailable. Please try again.' };
            if (result && result.success) {
                window.location.href = 'login.html?reset=success&email=' + encodeURIComponent(String(emailInput?.value || '').trim().toLowerCase());
                return;
            }
            showStatus((result && result.error) || 'Unable to update the password. Please try again.', 'error');
            if (button) { button.disabled = false; button.textContent = label; }
        });
    }
})();
