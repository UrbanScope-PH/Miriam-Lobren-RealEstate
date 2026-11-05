/**
 * UrbanScope - Client Registration Controller
 * Handles account creation, validation, draft preservation,
 * and mandatory scroll-to-accept Terms of Service & Privacy Policy modal.
 */

(function () {
    const params = new URLSearchParams(window.location.search);
    const rawNext = params.get('redirect') || '';
    const safeNext = /^[A-Za-z0-9_\-\/]+\.html([?#][A-Za-z0-9_\-=&%.]*)?$/.test(rawNext) ? rawNext : 'index.html';

    if (params.get('reason') === 'inquiry') {
        const notice = document.getElementById('authNotice');
        if (notice) notice.hidden = false;
    }

    const loginLink = document.querySelector('.register-prompt a');
    if (loginLink && window.location.search) {
        loginLink.href = 'login.html' + window.location.search;
    }

    // ==========================================
    // 1. FORM DRAFT PRESERVATION
    // Preserves typed text inputs in sessionStorage across navigations.
    // Terms acceptance always requires explicit scroll & confirmation.
    // ==========================================
    const DRAFT_STORAGE_KEY = 'urbanscope_register_draft';

    function saveRegisterDraft() {
        try {
            const draft = {
                fullname: document.getElementById('fullname')?.value || '',
                phone: document.getElementById('phone')?.value || '',
                email: document.getElementById('email')?.value || ''
            };
            sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
        } catch (e) {}
    }

    function restoreRegisterDraft() {
        try {
            const saved = sessionStorage.getItem(DRAFT_STORAGE_KEY);
            if (!saved) return;
            const draft = JSON.parse(saved);
            if (draft.fullname) {
                const el = document.getElementById('fullname');
                if (el && !el.value) el.value = draft.fullname;
            }
            if (draft.phone) {
                const el = document.getElementById('phone');
                if (el && !el.value) el.value = draft.phone;
            }
            if (draft.email) {
                const el = document.getElementById('email');
                if (el && !el.value) el.value = draft.email;
            }
        } catch (e) {}
    }

    restoreRegisterDraft();

    // Sync dynamic lead agent contact details inside the modal if configured
    if (typeof apiGetLeadAgentProfile === 'function') {
        apiGetLeadAgentProfile()
            .then(function (profile) {
                if (!profile) return;
                const emailEl = document.getElementById('termsAgentEmail');
                const phoneEl = document.getElementById('termsAgentPhone');
                if (emailEl && profile.email) emailEl.textContent = profile.email;
                if (phoneEl && profile.phone) phoneEl.textContent = profile.phone;
            })
            .catch(function () {});
    }

    // ==========================================
    // 2. TERMS OF SERVICE SCROLL-TO-ACCEPT MODAL
    // ==========================================
    const termsLabel = document.getElementById('termsLabel');
    const termsCheckbox = document.getElementById('terms');
    const termsModalOverlay = document.getElementById('termsModalOverlay');
    const termsModalBody = document.getElementById('termsModalBody');
    const termsScrollBar = document.getElementById('termsScrollBar');
    const termsScrollHint = document.getElementById('termsScrollHint');
    const termsScrollHintText = document.getElementById('termsScrollHintText');
    const acceptTermsBtn = document.getElementById('acceptTermsBtn');
    const declineTermsBtn = document.getElementById('declineTermsBtn');
    const closeTermsModalBtn = document.getElementById('closeTermsModalBtn');
    const registerForm = document.getElementById('registerForm');
    const googleSignupBtn = document.getElementById('googleSignup');
    const emailOtpModal = document.getElementById('emailOtpModal');
    const emailOtpForm = document.getElementById('emailOtpForm');
    const emailOtpCode = document.getElementById('emailOtpCode');
    const emailOtpMessage = document.getElementById('emailOtpMessage');
    const otpTargetEmail = document.getElementById('otpTargetEmail');
    const otpResendStatus = document.getElementById('otpResendStatus');
    const resendEmailOtpBtn = document.getElementById('resendEmailOtpBtn');
    const closeEmailOtpModal = document.getElementById('closeEmailOtpModal');
    let pendingOtpEmail = '';
    let resendTimer = null;

    let hasScrolledToBottom = false;
    let hasAcceptedTerms = false;
    let isTermsModalOpen = false;
    let pendingGoogleSignup = false;

    const DEFAULT_LOCKED_HINT = 'Scroll down to read the entire agreement to enable \u201cI Agree\u201d';
    const SUBMIT_LOCKED_HINT = 'Please scroll to the bottom and click \u201cI Agree\u201d before creating your account';
    const GOOGLE_LOCKED_HINT = 'Please scroll to the bottom and click \u201cI Agree\u201d before signing up with Google';
    const READY_HINT = 'You have read the agreement \u2014 click \u201cI Agree\u201d to continue';
    const GOOGLE_READY_HINT = 'You have read the agreement \u2014 click \u201cI Agree\u201d to continue with Google';

    if (termsCheckbox) {
        termsCheckbox.checked = false;
    }

    function updateTermsLabelUI() {
        if (!termsLabel) return;
        termsLabel.classList.toggle('is-accepted', Boolean(hasAcceptedTerms && termsCheckbox && termsCheckbox.checked));
    }

    function pulseScrollHint() {
        if (!termsScrollHint) return;
        termsScrollHint.classList.remove('pulse-attention');
        void termsScrollHint.offsetWidth;
        termsScrollHint.classList.add('pulse-attention');
    }

    function setAcceptButtonUnlocked(unlocked, customLockedMessage) {
        if (acceptTermsBtn) {
            acceptTermsBtn.disabled = !unlocked;
        }
        if (termsScrollHint) {
            termsScrollHint.classList.toggle('is-ready', Boolean(unlocked));
        }
        if (termsScrollHintText) {
            const readyText = pendingGoogleSignup ? GOOGLE_READY_HINT : READY_HINT;
            termsScrollHintText.textContent = unlocked
                ? readyText
                : (customLockedMessage || DEFAULT_LOCKED_HINT);
        }
    }

    function evaluateTermsScroll() {
        if (!isTermsModalOpen || !termsModalBody) return;
        const clientH = termsModalBody.clientHeight;
        const scrollH = termsModalBody.scrollHeight;
        if (clientH <= 0 || scrollH <= 0) return;

        const maxScroll = Math.max(scrollH - clientH, 0);
        const currentScroll = Math.max(termsModalBody.scrollTop, 0);
        const remaining = maxScroll - currentScroll;
        const threshold = 16;

        const progressPct = maxScroll <= 8
            ? 100
            : Math.min(100, Math.max(0, Math.round((currentScroll / maxScroll) * 100)));

        if (termsScrollBar) {
            termsScrollBar.style.width = (remaining <= threshold ? 100 : progressPct) + '%';
        }

        if (remaining <= threshold && !hasScrolledToBottom) {
            hasScrolledToBottom = true;
            setAcceptButtonUnlocked(true);
        }
    }

    function openTermsModal(sectionTarget, fromSubmitAttempt, triggerSource) {
        if (!termsModalOverlay || !termsModalBody) return;

        isTermsModalOpen = true;
        document.body.classList.add('terms-modal-open');
        termsModalOverlay.classList.add('open');
        termsModalOverlay.setAttribute('aria-hidden', 'false');

        if (!hasAcceptedTerms) {
            hasScrolledToBottom = false;
            const lockedMsg = triggerSource === 'google'
                ? GOOGLE_LOCKED_HINT
                : (fromSubmitAttempt ? SUBMIT_LOCKED_HINT : DEFAULT_LOCKED_HINT);
            setAcceptButtonUnlocked(false, lockedMsg);
            if (termsScrollBar) termsScrollBar.style.width = '0%';
        } else {
            hasScrolledToBottom = true;
            setAcceptButtonUnlocked(true);
            if (termsScrollBar) termsScrollBar.style.width = '100%';
        }

        // Reset or jump to requested section inside scrollable container
        requestAnimationFrame(function () {
            if (!termsModalBody) return;
            if (sectionTarget === 'privacy') {
                const privacyBanner = document.getElementById('modalPrivacyPart');
                termsModalBody.scrollTop = privacyBanner ? Math.max(privacyBanner.offsetTop - 12, 0) : 0;
            } else {
                termsModalBody.scrollTop = 0;
            }

            evaluateTermsScroll();
            termsModalBody.focus({ preventScroll: true });

            if (fromSubmitAttempt && !hasAcceptedTerms) {
                pulseScrollHint();
            }
        });
    }

    function closeTermsModal(focusTarget) {
        if (!termsModalOverlay) return;
        isTermsModalOpen = false;
        termsModalOverlay.classList.remove('open');
        termsModalOverlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('terms-modal-open');

        if (!hasAcceptedTerms && termsCheckbox) {
            termsCheckbox.checked = false;
        }
        updateTermsLabelUI();

        if (focusTarget && typeof focusTarget.focus === 'function') {
            focusTarget.focus();
        }
    }

    if (termsModalBody) {
        termsModalBody.addEventListener('scroll', evaluateTermsScroll, { passive: true });
    }
    window.addEventListener('resize', evaluateTermsScroll);

    // Intercept clicks on the Terms checkbox, label text, and inline Terms/Privacy links
    if (termsLabel) {
        termsLabel.addEventListener('click', function (e) {
            const clickedLink = e.target.closest('a');
            if (clickedLink) {
                e.preventDefault();
                e.stopPropagation();
                saveRegisterDraft();
                const targetPart = clickedLink.id === 'openPrivacyLink' ? 'privacy' : 'terms';
                openTermsModal(targetPart, false);
                return;
            }

            if (!hasAcceptedTerms) {
                e.preventDefault();
                setTimeout(function () {
                    if (!hasAcceptedTerms && termsCheckbox) {
                        termsCheckbox.checked = false;
                    }
                }, 0);
                openTermsModal('terms', false);
            }
        });
    }

    if (termsCheckbox) {
        termsCheckbox.addEventListener('change', function () {
            if (this.checked && !hasAcceptedTerms) {
                this.checked = false;
                openTermsModal('terms', false);
                return;
            }
            if (!this.checked) {
                hasAcceptedTerms = false;
                hasScrolledToBottom = false;
                updateTermsLabelUI();
            }
        });
    }

    if (acceptTermsBtn) {
        acceptTermsBtn.addEventListener('click', function () {
            if (!hasScrolledToBottom) {
                pulseScrollHint();
                return;
            }
            const shouldContinueWithGoogle = pendingGoogleSignup;
            pendingGoogleSignup = false;
            hasAcceptedTerms = true;
            if (termsCheckbox) {
                termsCheckbox.checked = true;
            }
            updateTermsLabelUI();
            const submitBtn = registerForm ? registerForm.querySelector('.btn-submit') : termsCheckbox;
            closeTermsModal(shouldContinueWithGoogle && googleSignupBtn ? googleSignupBtn : submitBtn);

            if (shouldContinueWithGoogle && googleSignupBtn) {
                googleSignupBtn.click();
            }
        });
    }

    // Pulse scroll hint if user clicks near locked button area before scrolling
    const modalActionsWrap = document.querySelector('.terms-modal-actions');
    if (modalActionsWrap) {
        modalActionsWrap.addEventListener('click', function (e) {
            if (!hasScrolledToBottom && e.target !== declineTermsBtn) {
                pulseScrollHint();
            }
        });
    }

    if (declineTermsBtn) {
        declineTermsBtn.addEventListener('click', function () {
            const returnFocusEl = pendingGoogleSignup && googleSignupBtn ? googleSignupBtn : termsCheckbox;
            pendingGoogleSignup = false;
            hasAcceptedTerms = false;
            hasScrolledToBottom = false;
            if (termsCheckbox) {
                termsCheckbox.checked = false;
            }
            closeTermsModal(returnFocusEl);
        });
    }

    if (closeTermsModalBtn) {
        closeTermsModalBtn.addEventListener('click', function () {
            const returnFocusEl = pendingGoogleSignup && googleSignupBtn ? googleSignupBtn : termsCheckbox;
            pendingGoogleSignup = false;
            closeTermsModal(returnFocusEl);
        });
    }

    if (termsModalOverlay) {
        termsModalOverlay.addEventListener('click', function (e) {
            if (e.target === termsModalOverlay) {
                const returnFocusEl = pendingGoogleSignup && googleSignupBtn ? googleSignupBtn : termsCheckbox;
                pendingGoogleSignup = false;
                closeTermsModal(returnFocusEl);
            }
        });
    }

    window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isTermsModalOpen) {
            e.preventDefault();
            const returnFocusEl = pendingGoogleSignup && googleSignupBtn ? googleSignupBtn : termsCheckbox;
            pendingGoogleSignup = false;
            closeTermsModal(returnFocusEl);
        }
    });

    // Enforce Terms of Service & Privacy Policy approval before Google OAuth sign-up
    function ensureTermsAcceptedForGoogleSignup() {
        if (hasAcceptedTerms && termsCheckbox && termsCheckbox.checked) {
            return true;
        }
        pendingGoogleSignup = true;
        saveRegisterDraft();
        if (termsCheckbox) {
            termsCheckbox.checked = false;
        }
        openTermsModal('terms', true, 'google');
        return false;
    }

    window.urbanscopeCheckRegisterTermsForGoogle = ensureTermsAcceptedForGoogleSignup;

    if (googleSignupBtn) {
        googleSignupBtn.addEventListener('click', function (e) {
            if (!ensureTermsAcceptedForGoogleSignup()) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);
    }

    // ==========================================
    // 3. REGISTRATION SUBMISSION
    // ==========================================
    function setOtpMessage(message, success) {
        if (!emailOtpMessage) return;
        emailOtpMessage.textContent = message || '';
        emailOtpMessage.classList.toggle('is-success', Boolean(success));
    }

    function startOtpResendCountdown() {
        if (resendTimer) window.clearInterval(resendTimer);
        let remaining = 60;
        if (resendEmailOtpBtn) resendEmailOtpBtn.disabled = true;
        if (otpResendStatus) otpResendStatus.textContent = 'You can request another code in ' + remaining + ' seconds.';
        resendTimer = window.setInterval(function () {
            remaining -= 1;
            if (remaining <= 0) {
                window.clearInterval(resendTimer);
                resendTimer = null;
                if (resendEmailOtpBtn) resendEmailOtpBtn.disabled = false;
                if (otpResendStatus) otpResendStatus.textContent = 'Didn\'t receive the code?';
                return;
            }
            if (otpResendStatus) otpResendStatus.textContent = 'You can request another code in ' + remaining + ' seconds.';
        }, 1000);
    }

    function openEmailOtpDialog(email) {
        if (!emailOtpModal) return;
        pendingOtpEmail = email;
        if (otpTargetEmail) otpTargetEmail.textContent = email;
        if (emailOtpCode) emailOtpCode.value = '';
        setOtpMessage('', false);
        emailOtpModal.classList.add('open');
        emailOtpModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('otp-modal-open');
        startOtpResendCountdown();
        window.setTimeout(function () { if (emailOtpCode) emailOtpCode.focus(); }, 80);
    }

    function closeEmailOtpDialog() {
        if (!emailOtpModal) return;
        emailOtpModal.classList.remove('open');
        emailOtpModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('otp-modal-open');
    }

    if (closeEmailOtpModal) closeEmailOtpModal.addEventListener('click', closeEmailOtpDialog);
    if (emailOtpModal) {
        emailOtpModal.addEventListener('click', function (event) {
            if (event.target === emailOtpModal) closeEmailOtpDialog();
        });
    }
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && emailOtpModal && emailOtpModal.classList.contains('open')) closeEmailOtpDialog();
    });

    if (resendEmailOtpBtn) {
        resendEmailOtpBtn.addEventListener('click', async function () {
            if (!pendingOtpEmail || typeof apiStartRegistrationOtp !== 'function') return;
            resendEmailOtpBtn.disabled = true;
            if (otpResendStatus) otpResendStatus.textContent = 'Requesting a new code…';
            const result = await apiStartRegistrationOtp(pendingOtpEmail);
            if (!result || !result.success) {
                if (otpResendStatus) otpResendStatus.textContent = (result && result.error) || 'Could not request a new code.';
                resendEmailOtpBtn.disabled = false;
                return;
            }
            setOtpMessage('A new 6-digit verification code has been sent to your email.', true);
            startOtpResendCountdown();
        });
    }

    if (registerForm) {
        registerForm.addEventListener('input', saveRegisterDraft);
        registerForm.addEventListener('change', saveRegisterDraft);

        document.querySelectorAll('.form-footer-links a').forEach(function (link) {
            link.addEventListener('click', saveRegisterDraft);
        });

        registerForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const btn = this.querySelector('.btn-submit');
            const originalText = btn.innerText;

            const fullname = document.getElementById('fullname').value.trim();
            const email = document.getElementById('email').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm_password').value;

            const notice = document.getElementById('authNotice');
            if (notice) { notice.hidden = true; notice.className = 'auth-notice'; }

            if (password !== confirmPassword) {
                if (notice) { notice.hidden = false; notice.textContent = 'Passwords do not match. Please re-enter.'; }
                const confirmInput = document.getElementById('confirm_password');
                if (confirmInput) confirmInput.focus();
                return;
            }

            if (password.length < 8) {
                if (notice) { notice.hidden = false; notice.textContent = 'Use a password with at least 8 characters.'; }
                document.getElementById('password')?.focus();
                return;
            }

            if (!hasAcceptedTerms || !termsCheckbox || !termsCheckbox.checked) {
                if (termsCheckbox) termsCheckbox.checked = false;
                openTermsModal('terms', true);
                return;
            }

            btn.disabled = true;
            btn.innerText = 'Sending Verification Code…';

            try {
                const otpRes = typeof apiStartRegistrationOtp === 'function'
                    ? await apiStartRegistrationOtp(email)
                    : { success: false, error: 'Registration service is unavailable. Please try again later.' };

                if (otpRes && otpRes.success) {
                    openEmailOtpDialog(email);
                    btn.disabled = false;
                    btn.innerText = originalText;
                    return;
                }

                if (notice) {
                    notice.hidden = false;
                    notice.className = 'auth-notice';
                    notice.textContent = (otpRes && otpRes.error) || 'Unable to send verification code. Please check your email address and try again.';
                }
            } catch (err) {
                if (notice) {
                    notice.hidden = false;
                    notice.className = 'auth-notice';
                    notice.textContent = err?.message || 'Unable to start registration. Please try again.';
                }
            }

            btn.disabled = false;
            btn.innerText = originalText;
        });
    }

    if (emailOtpForm) {
        emailOtpForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            const button = document.getElementById('verifyEmailOtpBtn');
            const originalText = button ? button.textContent : '';
            const code = (emailOtpCode?.value || '').trim();
            const fullname = document.getElementById('fullname')?.value.trim() || '';
            const phone = document.getElementById('phone')?.value.trim() || '';
            const password = document.getElementById('password')?.value || '';
            if (!/^[0-9]{6}$/.test(code)) {
                setOtpMessage('Enter the 6-digit code from your email.', false);
                return;
            }

            if (button) { button.disabled = true; button.textContent = 'Verifying…'; }
            const result = typeof apiCompleteRegistrationOtp === 'function'
                ? await apiCompleteRegistrationOtp(pendingOtpEmail, code, password, fullname, phone)
                : { success: false, error: 'Email verification is unavailable. Please try again.' };
            if (result && result.success) {
                try { sessionStorage.removeItem(DRAFT_STORAGE_KEY); } catch (error) {}
                setOtpMessage('Account verified and created successfully! Redirecting…', true);
                const redirectTarget = result.data?.redirect_url || ('../../' + safeNext);
                window.setTimeout(() => {
                    window.location.href = redirectTarget.startsWith('http') || redirectTarget.startsWith('/')
                        ? redirectTarget
                        : ('../../' + safeNext);
                }, 600);
                return;
            }
            setOtpMessage((result && result.error) || 'The verification code you entered is incorrect. Please check your email.', false);
            if (button) { button.disabled = false; button.textContent = originalText; }
        });
    }
})();
