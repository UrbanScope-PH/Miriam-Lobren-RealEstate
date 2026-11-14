/**
 * UrbanScope - Legal Documentation Controller (Terms & Privacy)
 * Handles contextual back navigation, keyboard navigation shortcuts, and document switcher state.
 */

(function () {
    const params = new URLSearchParams(window.location.search);
    const fromParam = params.get('from');
    const isFromRegister = fromParam === 'register' || (document.referrer && document.referrer.includes('register.html'));

    // Global back handler
    window.handleLegalBack = function () {
        if (isFromRegister) {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = '../auth/register.html';
            }
        } else {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = '../../index.html';
            }
        }
    };

    // Update back buttons text and state
    document.addEventListener('DOMContentLoaded', function () {
        const backBtnTexts = document.querySelectorAll('.legal-back-text');
        backBtnTexts.forEach(function (el) {
            el.textContent = isFromRegister ? 'Back to Registration' : 'Go Back';
        });

        // Ensure doc switcher preserves ?from=register
        if (isFromRegister) {
            document.querySelectorAll('.doc-switcher .doc-tab').forEach(function (tab) {
                const href = tab.getAttribute('href');
                if (href && !href.includes('from=')) {
                    const sep = href.includes('?') ? '&' : '?';
                    tab.setAttribute('href', href + sep + 'from=register');
                }
            });
        }

        initLegalMobileNavigation();
    });

    function initLegalMobileNavigation() {
        const container = document.querySelector('.legal-main-container');
        const contentCard = document.querySelector('.legal-content-card');
        const sections = Array.from(document.querySelectorAll('.legal-section'));
        const tocLinks = Array.from(document.querySelectorAll('.toc-list a'));
        if (!container || !contentCard || sections.length === 0) return;

        // Build compact mobile section selector dropdown
        const jumpWrap = document.createElement('div');
        jumpWrap.className = 'legal-mobile-jump';

        const jumpLabel = document.createElement('label');
        jumpLabel.setAttribute('for', 'legalJumpSelect');
        jumpLabel.textContent = 'Jump to section';

        const jumpSelect = document.createElement('select');
        jumpSelect.id = 'legalJumpSelect';
        jumpSelect.className = 'legal-jump-select';

        if (tocLinks.length > 0) {
            tocLinks.forEach(function (link) {
                const opt = document.createElement('option');
                const href = link.getAttribute('href') || '';
                opt.value = href.replace(/^#/, '');
                opt.textContent = link.textContent.trim();
                jumpSelect.appendChild(opt);
            });
        } else {
            sections.forEach(function (sec, idx) {
                const heading = sec.querySelector('.section-head h2');
                const opt = document.createElement('option');
                opt.value = sec.id || ('section-' + (idx + 1));
                opt.textContent = (idx + 1) + '. ' + (heading ? heading.textContent.trim() : 'Section ' + (idx + 1));
                jumpSelect.appendChild(opt);
            });
        }

        jumpWrap.appendChild(jumpLabel);
        jumpWrap.appendChild(jumpSelect);
        container.insertBefore(jumpWrap, contentCard);

        function setSectionExpanded(sec, expanded) {
            sec.classList.toggle('is-expanded', expanded);
            const head = sec.querySelector('.section-head');
            if (head) head.setAttribute('aria-expanded', String(expanded));
        }

        function scrollToSection(sec) {
            const nav = document.querySelector('.navbar');
            const navHeight = nav ? nav.offsetHeight : 76;
            const top = sec.getBoundingClientRect().top + window.pageYOffset - navHeight - 12;
            window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }

        function focusSectionById(targetId, shouldScroll) {
            if (!targetId) return;
            const targetSec = document.getElementById(targetId);
            if (!targetSec) return;
            setSectionExpanded(targetSec, true);
            if (jumpSelect && targetSec.id) {
                jumpSelect.value = targetSec.id;
            }
            if (shouldScroll) {
                scrollToSection(targetSec);
            }
        }

        const initialHashId = (window.location.hash || '').replace(/^#/, '');
        let initialMatched = false;

        sections.forEach(function (sec, idx) {
            const head = sec.querySelector('.section-head');
            if (!head) return;

            head.setAttribute('role', 'button');
            head.setAttribute('tabindex', '0');

            if (!head.querySelector('.legal-section-chevron')) {
                const chev = document.createElement('span');
                chev.className = 'legal-section-chevron';
                chev.setAttribute('aria-hidden', 'true');
                chev.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
                head.appendChild(chev);
            }

            const shouldStartOpen = initialHashId ? sec.id === initialHashId : idx === 0;
            if (initialHashId && sec.id === initialHashId) initialMatched = true;
            setSectionExpanded(sec, shouldStartOpen);

            function toggleCurrent() {
                const isMobile = window.innerWidth <= 768;
                if (!isMobile) return;
                const next = !sec.classList.contains('is-expanded');
                setSectionExpanded(sec, next);
                if (next && sec.id && jumpSelect) {
                    jumpSelect.value = sec.id;
                }
            }

            head.addEventListener('click', toggleCurrent);
            head.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleCurrent();
                }
            });
        });

        if (initialHashId && !initialMatched && sections[0]) {
            setSectionExpanded(sections[0], true);
        } else if (initialMatched) {
            jumpSelect.value = initialHashId;
        }

        jumpSelect.addEventListener('change', function () {
            focusSectionById(jumpSelect.value, true);
        });

        tocLinks.forEach(function (link) {
            link.addEventListener('click', function () {
                const id = (link.getAttribute('href') || '').replace(/^#/, '');
                focusSectionById(id, false);
            });
        });

        window.addEventListener('hashchange', function () {
            const id = (window.location.hash || '').replace(/^#/, '');
            focusSectionById(id, true);
        });
    }

    // Keyboard back shortcut (Alt + LeftArrow or Backspace outside form inputs)
    window.addEventListener('keydown', function (e) {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        const isInput = activeTag === 'input' || activeTag === 'textarea' || (document.activeElement && document.activeElement.isContentEditable);
        
        if ((e.altKey && e.key === 'ArrowLeft') || (!isInput && e.key === 'Backspace')) {
            if (isFromRegister && window.history.length <= 1) {
                e.preventDefault();
                window.location.href = '../auth/register.html';
            }
        }
    });
})();
