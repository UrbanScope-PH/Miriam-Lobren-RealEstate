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

    let hasScrolledToBottom = false;
    let hasAcceptedTerms = false;
    let isTermsModalOpen = false;

    const DEFAULT_LOCKED_HINT = 'Scroll down to read the entire agreement to enable \u201cI Agree\u201d';
    const SUBMIT_LOCKED_HINT = 'Please scroll to the bottom and click \u201cI Agree\u201d before creating your account';
    const READY_HINT = 'You have read the agreement \u2014 click \u201cI Agree\u201d to continue';

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
            termsScrollHintText.textContent = unlocked
                ? READY_HINT
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

    function openTermsModal(sectionTarget, fromSubmitAttempt) {
        if (!termsModalOverlay || !termsModalBody) return;

        isTermsModalOpen = true;
        document.body.classList.add('terms-modal-open');
        termsModalOverlay.classList.add('open');
        termsModalOverlay.setAttribute('aria-hidden', 'false');

        if (!hasAcceptedTerms) {
            hasScrolledToBottom = false;
            setAcceptButtonUnlocked(false, fromSubmitAttempt ? SUBMIT_LOCKED_HINT : DEFAULT_LOCKED_HINT);
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
            hasAcceptedTerms = true;
            if (termsCheckbox) {
                termsCheckbox.checked = true;
            }
            updateTermsLabelUI();
            const submitBtn = registerForm ? registerForm.querySelector('.btn-submit') : termsCheckbox;
            closeTermsModal(submitBtn);
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
            hasAcceptedTerms = false;
            hasScrolledToBottom = false;
            if (termsCheckbox) {
                termsCheckbox.checked = false;
            }
            closeTermsModal(termsCheckbox);
        });
    }

    if (closeTermsModalBtn) {
        closeTermsModalBtn.addEventListener('click', function () {
            closeTermsModal(termsCheckbox);
        });
    }

    if (termsModalOverlay) {
        termsModalOverlay.addEventListener('click', function (e) {
            if (e.target === termsModalOverlay) {
                closeTermsModal(termsCheckbox);
            }
        });
    }

    window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isTermsModalOpen) {
            e.preventDefault();
            closeTermsModal(termsCheckbox);
        }
    });

    // ==========================================
    // 3. REGISTRATION SUBMISSION
    // ==========================================
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

            if (password !== confirmPassword) {
                alert('Passwords do not match. Please re-enter.');
                const confirmInput = document.getElementById('confirm_password');
                if (confirmInput) confirmInput.focus();
                return;
            }

            if (!hasAcceptedTerms || !termsCheckbox || !termsCheckbox.checked) {
                if (termsCheckbox) termsCheckbox.checked = false;
                openTermsModal('terms', true);
                return;
            }

            btn.disabled = true;
            btn.innerText = 'Creating Account...';

            if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
                const res = await apiSignUp(email, password, fullname, phone);
                if (res && res.success) {
                    try { sessionStorage.removeItem(DRAFT_STORAGE_KEY); } catch (err) {}
                    if (res.data && res.data.session) {
                        window.location.href = '../../' + safeNext;
                    } else {
                        alert('\u2713 Account created! Please check your email to confirm your registration, then log in.');
                        window.location.href = 'login.html' + window.location.search;
                    }
                } else {
                    alert('Registration failed: ' + ((res && res.error) || 'Please try again.'));
                    btn.disabled = false;
                    btn.innerText = originalText;
                }
            } else {
                // Demo session when Supabase is not configured
                try { sessionStorage.removeItem(DRAFT_STORAGE_KEY); } catch (err) {}
                localStorage.setItem('urbanscope_demo_user', JSON.stringify({ name: fullname, email: email, phone: phone }));
                window.location.href = '../../' + safeNext;
            }
        });
    }
})();
