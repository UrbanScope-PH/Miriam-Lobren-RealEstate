/**
 * UrbanScope - Session & Access Control
 * ==========================================================
 * - The public site (home, properties, details) is open to everyone.
 * - Any link to inquiry sends visitors who are not logged in to
 *   pages/auth/login.html (they return to their target page afterwards).
 * - Logged-in users see their profile (avatar + name + menu) and notification
 *   bell in the navbar.
 *
 * Load AFTER shared/js/supabase.js. Works with Supabase auth, and falls
 * back to a local demo session if Supabase is not configured.
 */
(function () {
    var DEMO_USER_KEY = 'urbanscope_demo_user';
    var THEME_STORAGE_KEY = 'urbanscope_theme';
    var root = document.documentElement;
    var requiresAuth = root.hasAttribute('data-require-auth');
    var currentUser = null;
    var resolved = false;
    var cachedClientNotifs = [];
    var themeTransitionTimer = null;

    // Early synchronous theme restoration to prevent flash of unstyled theme
    try {
        var savedTheme = (window.UrbanTheme && typeof window.UrbanTheme.get === 'function')
            ? window.UrbanTheme.get()
            : localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme !== 'dark' && savedTheme !== 'light') {
            var cookieMatch = document.cookie.match(/(?:^|;\s*)urbanscope_theme=(dark|light)(?:;|$)/);
            if (cookieMatch) savedTheme = cookieMatch[1];
            else if (window.name && /__urbanscope_theme=(dark|light)/.test(window.name)) {
                savedTheme = window.name.match(/__urbanscope_theme=(dark|light)/)[1];
            }
        }
        if (savedTheme === 'dark') {
            root.classList.add('dark-mode');
            root.setAttribute('data-theme', 'dark');
        } else {
            root.classList.remove('dark-mode');
            root.setAttribute('data-theme', 'light');
        }
    } catch (e) { }

    root.classList.add('auth-pending');
    if (requiresAuth) root.classList.add('auth-checking');

    // Early synchronous check from localStorage to immediately hide guest reminders
    try {
        var quickUser = localStorage.getItem('urbanscope_user') || localStorage.getItem(DEMO_USER_KEY) || localStorage.getItem('adminUser');
        if (quickUser) {
            var qParsed = JSON.parse(quickUser);
            var qRole = String(qParsed.role || '').toLowerCase();
            var qEmail = String(qParsed.email || '').toLowerCase().trim();
            var qIsStaff = (qRole === 'admin' || qRole === 'superadmin' || qEmail === 'urbanscope.cvsu@gmail.com' || qEmail === 'miriamalobren@gmail.com' || qEmail === 'admin.realestate@gmail.com' || qEmail === 'miriam@gmail.com');
            if (!qIsStaff) {
                root.classList.add('logged-in');
                root.setAttribute('data-auth-state', 'logged-in');
            }
        }
    } catch (e) { }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function initials(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'U';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function usingSupabase() {
        return typeof isSupabaseConfigured === 'function' && isSupabaseConfigured();
    }

    // Every section page lives at frontend/pages/<section>/<file>.html,
    // so it is two folders below the frontend root (index.html).
    function getBasePath() {
        var p = location.pathname.replace(/\\/g, '/');
        return p.indexOf('/pages/') !== -1 ? '../../' : './';
    }

    // Turns any link (relative or absolute) into a path relative to the
    // frontend root, e.g. 'pages/properties/property-detail.html?id=3'.
    function rootRelative(href) {
        try {
            var rootPath = new URL(getBasePath(), location.href).pathname;
            var u = new URL(href || location.href, location.href);
            var path = u.pathname;
            if (path.indexOf(rootPath) === 0) path = path.slice(rootPath.length);
            return (path || 'index.html') + u.search;
        } catch (e) {
            return 'index.html';
        }
    }

    function currentPage() {
        return rootRelative(location.href);
    }

    function loginUrl(next, reason) {
        var base = getBasePath();
        var url = base + 'pages/auth/login.html?redirect=' + encodeURIComponent(next || 'index.html');
        if (reason) url += '&reason=' + encodeURIComponent(reason);
        return url;
    }

    function formatRelativeTime(dateStr) {
        if (!dateStr) return 'Recently';
        try {
            var d = new Date(dateStr);
            if (isNaN(d.getTime())) return 'Recently';
            var diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
            if (diffSec < 60) return 'Just now';
            if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
            if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) {
            return 'Recently';
        }
    }

    // ------------------------------------------------------------------
    // Session lookup
    // ------------------------------------------------------------------
    async function getUser() {
        try {
            if (usingSupabase() && typeof apiGetCurrentUser === 'function') {
                var u = await apiGetCurrentUser();
                if (!u) return null;
                var role = String(u.role || '').toLowerCase();
                var email = String(u.email || '').toLowerCase().trim();
                var isStaff = (role === 'admin' || role === 'superadmin' || email === 'urbanscope.cvsu@gmail.com' || email === 'miriamalobren@gmail.com' || email === 'admin.realestate@gmail.com');

                // Administrators and superadmin must NEVER be signed in as clients on the public website!
                if (isStaff) {
                    var inAdmin = location.pathname.includes('/pages/admin/') || location.pathname.includes('/pages/superadmin/');
                    if (!inAdmin) {
                        var activeAdminSession = null;
                        if (typeof apiGetHostedAdminSession === 'function') {
                            activeAdminSession = await apiGetHostedAdminSession();
                        }
                        if (activeAdminSession || (typeof isLocalDevHost === 'function' && isLocalDevHost())) {
                            var isSuper = (role === 'superadmin' || email === 'urbanscope.cvsu@gmail.com');
                            var target = isSuper ? (getBasePath() + 'pages/superadmin/dashboard.html') : (getBasePath() + 'pages/admin/dashboard.html');
                            location.replace(target);
                            return null;
                        } else {
                            // Cookie is expired or missing: purge stale admin cache so device acts as clean guest
                            localStorage.removeItem('adminUser');
                            localStorage.removeItem('urbanscope_user');
                            localStorage.removeItem('adminSessionToken');
                            localStorage.removeItem('urbanscope_admin_profile');
                            return null;
                        }
                    }
                    return null;
                }

                var meta = u.user_metadata || {};
                return {
                    name: meta.full_name || u.full_name || u.name || (u.email || 'User').split('@')[0],
                    email: u.email || '',
                    phone: meta.phone || u.phone || '',
                    role: u.role || 'user',
                    avatar_url: u.avatar_url || meta.avatar_url || ''
                };
            }
        } catch (err) {
            console.error('Session lookup failed:', err);
        }
        try {
            var demo = JSON.parse(localStorage.getItem(DEMO_USER_KEY));
            if (demo && (demo.role === 'admin' || demo.role === 'superadmin')) return null;
            return demo;
        } catch (e) {
            return null;
        }
    }

    function hasCustomClientAvatar(user) {
        var url = String((user && user.avatar_url) || '').trim();
        return /^https?:\/\//i.test(url) || /^data:image\//i.test(url);
    }

    function avatarInnerHtml(user) {
        var init = esc(initials(user.name));
        if (hasCustomClientAvatar(user)) {
            return '<img src="' + esc(user.avatar_url) + '" alt="' + init + '" referrerpolicy="no-referrer" data-fallback-initials="' + init + '">';
        }
        return init;
    }

    function wireAvatarFallbacks(container) {
        if (!container) return;
        container.querySelectorAll('.profile-avatar img[data-fallback-initials]').forEach(function (img) {
            img.addEventListener('error', function () {
                var parent = img.parentElement;
                if (parent) parent.textContent = img.getAttribute('data-fallback-initials') || 'U';
            }, { once: true });
        });
    }

    function updateInquiryNoteVisibility(isLoggedIn) {
        if (isLoggedIn) {
            root.classList.add('logged-in');
            if (document.body) document.body.classList.add('logged-in');
            root.setAttribute('data-auth-state', 'logged-in');
            document.querySelectorAll('.inquiry-note').forEach(function (el) {
                el.style.display = 'none';
            });
        } else {
            root.classList.remove('logged-in');
            if (document.body) document.body.classList.remove('logged-in');
            root.setAttribute('data-auth-state', 'logged-out');
            document.querySelectorAll('.inquiry-note').forEach(function (el) {
                el.style.display = '';
            });
        }
    }

    async function logout() {
        try {
            if (usingSupabase() && typeof apiSignOut === 'function') await apiSignOut();
        } catch (err) { console.error(err); }
        try { localStorage.removeItem(DEMO_USER_KEY); } catch (e) { }
        updateInquiryNoteVisibility(false);
        location.href = getBasePath() + 'index.html';
    }

    // ------------------------------------------------------------------
    // Client Notifications (Approval Alerts & Bell Dropdown)
    // ------------------------------------------------------------------
    function getNotifKey(n) {
        if (!n) return '';
        var inqId = n.inquiryId != null ? n.inquiryId : n.inquiry_id;
        if (inqId != null && String(n.type || '').toLowerCase() === 'approved') {
            return 'approved_' + inqId;
        }
        return String(n.id || ('approved_' + (inqId || '')));
    }

    function markAllClientNotifsRead(cleanEmail) {
        if (!cleanEmail) return;
        try {
            var readKey = 'client_notifs_read_ids_' + cleanEmail;
            var readIds = JSON.parse(localStorage.getItem(readKey) || '[]');
            cachedClientNotifs.forEach(function (n) {
                var k = getNotifKey(n);
                if (k && readIds.indexOf(k) === -1) readIds.push(k);
                n.is_read = true;
                n.is_seen = true;
            });
            localStorage.setItem(readKey, JSON.stringify(readIds));
        } catch (e) { }

        // Persist across devices to SQLite backend and Supabase Cloud
        if (typeof window.apiMarkNotificationsRead === 'function') {
            window.apiMarkNotificationsRead({ email: cleanEmail });
        }

        var badge = document.getElementById('clientNotifBadge');
        if (badge) {
            badge.style.display = 'none';
            badge.textContent = '0';
        }
        document.querySelectorAll('.client-notif-item.unread').forEach(function (el) {
            el.classList.remove('unread');
        });
    }

    function showClientApprovalToast(notif, cleanEmail) {
        if (!notif) return;
        // Avoid duplicating toast if history.js already displayed #toastNotice
        var historyToast = document.getElementById('toastNotice');
        if (historyToast && historyToast.classList.contains('show')) return;

        var existing = document.getElementById('clientApprovalToast');
        if (existing) existing.remove();

        var email = cleanEmail || (currentUser && currentUser.email ? String(currentUser.email).toLowerCase().trim() : '');
        var inqId = notif.inquiryId != null ? notif.inquiryId : notif.inquiry_id;

        // Immediately mark as seen on backend and local cache so other devices won't notify again!
        if (email && typeof window.apiMarkNotificationsSeen === 'function') {
            window.apiMarkNotificationsSeen({
                email: email,
                inquiryId: inqId,
                notifId: notif.db_id || notif.id
            });
        }
        notif.is_seen = true;

        var base = getBasePath();
        var toast = document.createElement('div');
        toast.id = 'clientApprovalToast';
        toast.className = 'client-approval-toast';
        toast.innerHTML =
            '<div class="client-approval-toast-icon">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>' +
            '</div>' +
            '<a href="' + base + 'pages/inquiry/history.html" class="client-approval-toast-content" style="color: inherit; text-decoration: none;">' +
            '<strong>' + esc(notif.title || 'Inquiry Approved!') + '</strong>' +
            '<span>' + esc(notif.message || 'Miriam Lobren approved your inquiry.') + '</span>' +
            '</a>' +
            '<button type="button" class="client-approval-toast-close" aria-label="Dismiss notification" title="Dismiss">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
            '</button>';

        var contentLink = toast.querySelector('.client-approval-toast-content');
        if (contentLink) {
            contentLink.addEventListener('click', function () {
                if (email && typeof window.apiMarkNotificationsRead === 'function') {
                    window.apiMarkNotificationsRead({
                        email: email,
                        inquiryId: inqId,
                        notifId: notif.db_id || notif.id
                    });
                }
                notif.is_read = true;
                notif.is_seen = true;
            });
        }

        var closeBtn = toast.querySelector('.client-approval-toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (email && typeof window.apiMarkNotificationsRead === 'function') {
                    window.apiMarkNotificationsRead({
                        email: email,
                        inquiryId: inqId,
                        notifId: notif.db_id || notif.id
                    });
                }
                notif.is_read = true;
                notif.is_seen = true;
                toast.classList.remove('show');
                setTimeout(function () {
                    if (toast.parentNode) toast.remove();
                }, 250);
            });
        }

        document.body.appendChild(toast);

        setTimeout(function () {
            toast.classList.add('show');
        }, 40);

        setTimeout(function () {
            toast.classList.remove('show');
            setTimeout(function () {
                if (toast.parentNode) toast.remove();
            }, 300);
        }, 7000);
    }

    async function loadClientNotifications() {
        if (!currentUser || !currentUser.email) return;
        var cleanEmail = String(currentUser.email).toLowerCase().trim();
        if (!cleanEmail) return;

        try {
            var list = [];
            if (typeof window.apiGetClientNotifications === 'function') {
                list = await window.apiGetClientNotifications(cleanEmail);
            }
            if (!Array.isArray(list)) list = [];
            cachedClientNotifs = list;

            var readKey = 'client_notifs_read_ids_' + cleanEmail;
            var toastedKey = 'client_notifs_toasted_' + cleanEmail;
            var readIds = [];
            var toastedIds = [];
            try {
                readIds = JSON.parse(localStorage.getItem(readKey) || '[]');
                toastedIds = JSON.parse(localStorage.getItem(toastedKey) || '[]');
            } catch (e) { }

            var unreadCount = 0;
            var newestUntoasted = null;

            list.forEach(function (n) {
                var k = getNotifKey(n);
                var isRead = (n.is_read === true) || (k && readIds.indexOf(k) !== -1);
                var isSeen = (n.is_seen === true) || isRead || (k && toastedIds.indexOf(k) !== -1);

                if (!isRead) {
                    unreadCount++;
                }

                if (!isSeen && !isRead) {
                    if (!newestUntoasted) newestUntoasted = n;
                }
            });

            if (newestUntoasted) {
                var k = getNotifKey(newestUntoasted);
                if (k && toastedIds.indexOf(k) === -1) {
                    toastedIds.push(k);
                    try {
                        localStorage.setItem(toastedKey, JSON.stringify(toastedIds));
                    } catch (e) { }
                }
                showClientApprovalToast(newestUntoasted, cleanEmail);
            }

            var badge = document.getElementById('clientNotifBadge');
            if (badge) {
                if (unreadCount > 0) {
                    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
                    badge.style.display = 'inline-flex';
                } else {
                    badge.textContent = '0';
                    badge.style.display = 'none';
                }
            }

            var listEl = document.getElementById('clientNotifList');
            if (listEl) {
                if (list.length === 0) {
                    listEl.innerHTML = '<div class="client-notif-empty">No notifications yet. We\'ll alert you here when Miriam Lobren approves your inquiry.</div>';
                } else {
                    var base = getBasePath();
                    listEl.innerHTML = list.slice(0, 12).map(function (n) {
                        var k = getNotifKey(n);
                        var isUnread = (n.is_read !== true) && (!k || readIds.indexOf(k) === -1);
                        var inqId = n.inquiryId != null ? n.inquiryId : n.inquiry_id;
                        return '' +
                            '<a href="' + base + 'pages/inquiry/history.html" class="client-notif-item' + (isUnread ? ' unread' : '') + '" data-key="' + esc(k) + '" data-inq="' + esc(String(inqId || '')) + '">' +
                            '<span class="client-notif-icon">✓</span>' +
                            '<div class="client-notif-body">' +
                            '<strong>' + esc(n.title || 'Inquiry Approved!') + '</strong>' +
                            '<p>' + esc(n.message || 'Your inquiry has been approved by Miriam Lobren.') + '</p>' +
                            '<span class="client-notif-time">' + esc(formatRelativeTime(n.created_at)) + '</span>' +
                            '</div>' +
                            '</a>';
                    }).join('');

                    listEl.querySelectorAll('.client-notif-item').forEach(function (link) {
                        link.addEventListener('click', function () {
                            var inqId = this.getAttribute('data-inq');
                            if (cleanEmail && typeof window.apiMarkNotificationsRead === 'function') {
                                window.apiMarkNotificationsRead({ email: cleanEmail, inquiryId: inqId });
                            }
                        });
                    });
                }
            }
        } catch (err) {
            console.warn('Failed to load client notifications:', err);
        }
    }

    window.loadClientNotifications = loadClientNotifications;

    // ------------------------------------------------------------------
    // UI: dropdown + profile chip + notification bell
    // ------------------------------------------------------------------
    function dropdownHtml(user) {
        var base = getBasePath();
        return '' +
            '<div class="profile-dropdown" role="menu">' +
            '<div class="profile-dropdown-head">' +
            '<span class="profile-avatar">' + avatarInnerHtml(user) + '</span>' +
            '<div><strong>' + esc(user.name) + '</strong><small>' + esc(user.email) + '</small></div>' +
            '</div>' +
            '<a href="' + base + 'index.html" role="menuitem">Home</a>' +
            '<a href="' + base + 'pages/inquiry/inquiry.html" role="menuitem">Submit an Inquiry</a>' +
            '<a href="' + base + 'pages/inquiry/history.html" role="menuitem">Inquiry History</a>' +
            '<button type="button" class="signout-item" role="menuitem" data-action="signout">Sign Out</button>' +
            '</div>';
    }

    function renderNavProfile(user) {
        var path = location.pathname.toLowerCase().replace(/\\/g, '/');
        var inAdmin = path.includes('/pages/admin/') || path.includes('/pages/superadmin/');
        var role = (user && user.role ? String(user.role) : '').toLowerCase();
        var email = (user && user.email ? String(user.email) : '').toLowerCase().trim();
        var isStaff = (role === 'admin' || role === 'superadmin' || email === 'urbanscope.cvsu@gmail.com' || email === 'miriamalobren@gmail.com' || email === 'admin.realestate@gmail.com' || email === 'miriam@gmail.com');
        if (inAdmin || isStaff) return;

        var acts = document.querySelector('.navbar .nav-acts, .inquiry-topbar .nav-acts, .history-topbar .nav-acts, .nav-acts');
        if (acts) {
            ['loginBtn', 'signupBtn'].forEach(function (id) {
                var b = document.getElementById(id);
                if (b) b.remove();
            });
            var oldMenu = acts.querySelector('#profileMenu');
            if (oldMenu) oldMenu.remove();

            var oldClientNotif = acts.querySelector('#clientNotifWrap');
            if (oldClientNotif) oldClientNotif.remove();

            var oldNotif = acts.querySelector('.notif-btn');
            if (oldNotif) oldNotif.remove();

            var oldBadge = acts.querySelector('.user-profile-badge');
            if (oldBadge) oldBadge.remove();

            var base = getBasePath();

            // 1. Client Notification Bell
            var notifWrap = document.createElement('div');
            notifWrap.className = 'client-notif-wrap';
            notifWrap.id = 'clientNotifWrap';
            notifWrap.innerHTML =
                '<button type="button" class="client-notif-btn" id="clientNotifBtn" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">' +
                '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>' +
                '<path d="M13.73 21a2 2 0 0 1-3.46 0"></path>' +
                '</svg>' +
                '<span class="client-notif-badge" id="clientNotifBadge" style="display: none;">0</span>' +
                '</button>' +
                '<div class="client-notif-dropdown" id="clientNotifDropdown" role="menu">' +
                '<div class="client-notif-head">' +
                '<strong>Notifications</strong>' +
                '<a href="' + base + 'pages/inquiry/history.html" class="client-notif-view-all">Inquiry History</a>' +
                '</div>' +
                '<div class="client-notif-list" id="clientNotifList">' +
                '<div class="client-notif-empty">Checking notifications...</div>' +
                '</div>' +
                '</div>';
            var mobileToggleEl = acts.querySelector('#mobileNavToggle');
            if (mobileToggleEl) acts.insertBefore(notifWrap, mobileToggleEl);
            else acts.appendChild(notifWrap);

            // 2. Profile Menu Chip
            var wrap = document.createElement('div');
            wrap.className = 'profile-menu';
            wrap.id = 'profileMenu';
            wrap.innerHTML =
                '<button type="button" class="profile-chip" id="profileChip" aria-haspopup="true" aria-expanded="false">' +
                '<span class="profile-avatar">' + avatarInnerHtml(user) + '</span>' +
                '<span class="profile-name">' + esc(user.name.split(' ')[0]) + '</span>' +
                '<svg class="profile-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
                '</button>' + dropdownHtml(user);
            wireAvatarFallbacks(wrap);
            if (mobileToggleEl) acts.insertBefore(wrap, mobileToggleEl);
            else acts.appendChild(wrap);

            notifWrap.querySelector('#clientNotifBtn').addEventListener('click', function (e) {
                e.stopPropagation();
                wrap.classList.remove('open');
                var open = notifWrap.classList.toggle('open');
                this.setAttribute('aria-expanded', String(open));
                if (open && user && user.email) {
                    markAllClientNotifsRead(String(user.email).toLowerCase().trim());
                }
            });

            wrap.querySelector('#profileChip').addEventListener('click', function (e) {
                e.stopPropagation();
                notifWrap.classList.remove('open');
                var open = wrap.classList.toggle('open');
                this.setAttribute('aria-expanded', open);
            });

            loadClientNotifications();
        }
    }

    function prefillInquiryForm(user) {
        var map = { clientName: user.name, clientEmail: user.email, clientPhone: user.phone };
        Object.keys(map).forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = map[id] || '';
        });
    }

    // ------------------------------------------------------------------
    // UI: Mobile Navigation Drawer
    // ------------------------------------------------------------------
    function initMobileNav(user) {
        var path = location.pathname.toLowerCase().replace(/\\/g, '/');
        var inAdmin = path.includes('/pages/admin/') || path.includes('/pages/superadmin/');
        if (inAdmin) return;

        var navbar = document.querySelector('.navbar, .app-topbar');
        var nav = document.getElementById('mainNav');
        if (!navbar || !nav) return;

        var acts = navbar.querySelector('.nav-acts, .topbar-right');
        var toggle = document.getElementById('mobileNavToggle');
        if (!toggle) {
            toggle = document.createElement('button');
            toggle.className = 'mobile-nav-toggle';
            toggle.id = 'mobileNavToggle';
            toggle.type = 'button';
            toggle.setAttribute('aria-label', 'Toggle navigation menu');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.innerHTML =
                '<span class="hamburger-line"></span>' +
                '<span class="hamburger-line"></span>' +
                '<span class="hamburger-line"></span>';
            if (acts) acts.appendChild(toggle);
            else navbar.appendChild(toggle);
        }

        var backdrop = document.querySelector('.mobile-nav-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'mobile-nav-backdrop';
            document.body.appendChild(backdrop);
        }

        // Remove any previous drawer auth/user sections so the mobile drawer contains only primary nav links
        var existingAuth = nav.querySelector('.mobile-drawer-auth, .mobile-drawer-user');
        if (existingAuth) existingAuth.remove();

        var base = getBasePath();
        if (user) {
            // For logged-in users, the topbar profile chip (#profileChip) already handles
            // user identity, Submit an Inquiry, Inquiry History, and Sign Out.
            // Mobile navigation menu displays exclusively primary navigation links (Home, Properties, About, FAQs, Contact).
        } else {
            var authSection = document.createElement('div');
            authSection.className = 'mobile-drawer-auth';
            authSection.innerHTML =
                '<a href="' + base + 'pages/auth/login.html" class="m-login-btn">Log In</a>' +
                '<a href="' + base + 'pages/auth/register.html" class="m-signup-btn">Sign Up</a>';
            nav.appendChild(authSection);
        }

        function setMenuOpen(open) {
            nav.classList.toggle('mobile-open', open);
            toggle.classList.toggle('active', open);
            toggle.setAttribute('aria-expanded', String(open));
            backdrop.classList.toggle('active', open);
            document.body.classList.toggle('nav-locked', open);

            if (open) {
                navbar.querySelectorAll('.profile-menu.open, .client-notif-wrap.open').forEach(function (menu) {
                    menu.classList.remove('open');
                    var button = menu.querySelector('[aria-expanded="true"]');
                    if (button) button.setAttribute('aria-expanded', 'false');
                });
            }
        }

        toggle.onclick = function (e) {
            e.stopPropagation();
            setMenuOpen(!nav.classList.contains('mobile-open'));
        };

        backdrop.onclick = function () {
            setMenuOpen(false);
        };

        if (acts) {
            acts.addEventListener('click', function (e) {
                if (nav.classList.contains('mobile-open') && e.target.closest('#profileChip, #clientNotifBtn')) {
                    setMenuOpen(false);
                }
            });
        }

        nav.onclick = function (e) {
            if (e.target.tagName === 'A' || e.target.closest('a')) {
                setMenuOpen(false);
            }
        };

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && nav.classList.contains('mobile-open')) {
                setMenuOpen(false);
            }
        });

        window.addEventListener('resize', function () {
            if (window.innerWidth > 768 && nav.classList.contains('mobile-open')) {
                setMenuOpen(false);
            }
        });
    }

    // ------------------------------------------------------------------
    // UI: Dark Mode Toggle with Soft Fade-In / Fade-Out Animation
    // ------------------------------------------------------------------
    function updateThemeToggleButtons(isDark) {
        document.querySelectorAll('.theme-toggle-btn').forEach(function (btn) {
            btn.setAttribute('aria-pressed', String(isDark));
            btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
            btn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
        });
    }

    function setTheme(mode, animate) {
        var isDark = mode === 'dark';
        var cleanMode = isDark ? 'dark' : 'light';
        if (window.UrbanTheme && typeof window.UrbanTheme.set === 'function') {
            window.UrbanTheme.set(cleanMode, animate);
            return;
        }

        var commitThemeDom = function () {
            root.classList.toggle('dark-mode', isDark);
            root.setAttribute('data-theme', cleanMode);
            try { localStorage.setItem(THEME_STORAGE_KEY, cleanMode); } catch (e) { }
            try { document.cookie = 'urbanscope_theme=' + cleanMode + '; path=/; max-age=31536000; SameSite=Lax'; } catch (e) { }
            try {
                var baseName = String(window.name || '').replace(/\s*__urbanscope_theme=(?:dark|light)/g, '').trim();
                window.name = (baseName ? baseName + ' ' : '') + '__urbanscope_theme=' + cleanMode;
            } catch (e) { }
            updateThemeToggleButtons(isDark);
        };

        if (animate && typeof document.startViewTransition === 'function') {
            root.classList.remove('theme-transitioning');
            try {
                document.startViewTransition(commitThemeDom);
                return;
            } catch (e) { }
        }

        if (animate) {
            root.classList.add('theme-transitioning');
            if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
            themeTransitionTimer = setTimeout(function () {
                root.classList.remove('theme-transitioning');
            }, 520);
        }

        commitThemeDom();
    }

    function initThemeToggle() {
        var path = location.pathname.toLowerCase().replace(/\\/g, '/');
        var inAdmin = path.includes('/pages/admin/') || path.includes('/pages/superadmin/');
        if (inAdmin) return;

        var containers = document.querySelectorAll('.navbar .nav-acts, .inquiry-topbar .nav-acts, .history-topbar .nav-acts, .nav-acts');
        var isDark = root.classList.contains('dark-mode') || root.getAttribute('data-theme') === 'dark';

        containers.forEach(function (acts) {
            if (acts.querySelector('.theme-toggle-btn')) return;

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theme-toggle-btn';
            btn.id = 'themeToggleBtn';
            btn.setAttribute('aria-pressed', String(isDark));
            btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
            btn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
            btn.innerHTML =
                '<span class="theme-icon-wrap" aria-hidden="true">' +
                '<svg class="theme-icon theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>' +
                '</svg>' +
                '<svg class="theme-icon theme-icon-sun" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<circle cx="12" cy="12" r="5"></circle>' +
                '<line x1="12" y1="1" x2="12" y2="3"></line>' +
                '<line x1="12" y1="21" x2="12" y2="23"></line>' +
                '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>' +
                '<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>' +
                '<line x1="1" y1="12" x2="3" y2="12"></line>' +
                '<line x1="21" y1="12" x2="23" y2="12"></line>' +
                '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>' +
                '<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>' +
                '</svg>' +
                '</span>';

            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var currentlyDark = root.classList.contains('dark-mode') || root.getAttribute('data-theme') === 'dark';
                setTheme(currentlyDark ? 'light' : 'dark', true);
            });

            acts.insertBefore(btn, acts.firstChild);
        });
    }

    // ------------------------------------------------------------------
    // Init
    // ------------------------------------------------------------------
    async function init() {
        initThemeToggle();
        currentUser = await getUser();
        resolved = true;

        if (requiresAuth && !currentUser) {
            location.replace(loginUrl(currentPage(), 'inquiry'));
            return;
        }

        if (currentUser) {
            updateInquiryNoteVisibility(true);
            renderNavProfile(currentUser);
            prefillInquiryForm(currentUser);
        } else {
            updateInquiryNoteVisibility(false);
        }

        initThemeToggle();
        initMobileNav(currentUser);
        syncGlobalFooterContact();

        root.classList.remove('auth-pending', 'auth-checking');
        document.dispatchEvent(new CustomEvent('urbanscope:user', { detail: currentUser }));
    }

    function syncGlobalFooterContact() {
        var p = null;
        try {
            p = JSON.parse(localStorage.getItem('urbanscope_admin_profile') || 'null');
            if (!p) {
                var adminUser = JSON.parse(localStorage.getItem('adminUser') || 'null');
                if (adminUser && (adminUser.role === 'admin' || adminUser.email === 'admin.realestate@gmail.com' || adminUser.email === 'miriamalobren@gmail.com' || adminUser.email === 'miriam@gmail.com' || adminUser.email === 'miriamlobren@gmail.com')) {
                    p = adminUser;
                }
            }
        } catch (e) { }

        function applyContact(phone, email) {
            if (!phone && !email) return;
            var cleanPhone = phone || '+63 918 964 5434';
            var cleanEmail = email || 'miriamalobren@gmail.com';
            var cleanDigits = cleanPhone.replace(/[^\d+]/g, '');

            document.querySelectorAll('.footer-contact a[href^="tel:"], #footerAgentPhone, .footer-contact-item a[href^="tel:"]').forEach(function (el) {
                if (!el.classList.contains('social-icon')) {
                    el.textContent = cleanPhone;
                }
                el.setAttribute('href', 'tel:' + cleanDigits);
            });

            document.querySelectorAll('.social-icon[href^="tel:"], .social-icon.call-link').forEach(function (el) {
                el.setAttribute('href', 'tel:' + cleanDigits);
                el.setAttribute('aria-label', 'Call Miriam Lobren (' + cleanPhone + ')');
            });

            document.querySelectorAll('.footer-contact a[href^="mailto:"], #footerAgentEmail, .footer-contact-item a[href^="mailto:"]').forEach(function (el) {
                if (!el.classList.contains('social-icon')) {
                    el.textContent = cleanEmail;
                }
                el.setAttribute('href', 'mailto:' + cleanEmail);
            });

            var fabCall = document.getElementById('fabCallBtn');
            if (fabCall) fabCall.setAttribute('href', 'tel:' + cleanDigits);
            var fabSms = document.getElementById('fabSmsBtn');
            if (fabSms) {
                var curHref = fabSms.getAttribute('href') || '';
                var bodyPart = curHref.includes('?') ? curHref.slice(curHref.indexOf('?')) : '';
                fabSms.setAttribute('href', 'sms:' + cleanDigits + bodyPart);
            }
        }

        function applyAgentBranding(profile) {
            if (!profile) return;
            var rawName = profile.name || profile.full_name || 'Miriam Lobren';
            var cleanName = String(rawName).replace(/\s*\((?:Admin|Administrator)\)\s*$/i, '').trim() || rawName;
            var rawTitle = (profile.title && profile.title.trim()) || 'Real Estate Salesperson';
            if (/^(?:licensed real estate broker\s*\/\s*agent|real estate agent|real estate sales person)$/i.test(rawTitle)) {
                rawTitle = 'Real Estate Salesperson';
            }

            document.querySelectorAll('.app-brand strong, .Cname strong, #navAgentName').forEach(function (el) {
                el.textContent = cleanName;
            });

            document.querySelectorAll('.app-brand small, .Cname small, #navAgentTitle').forEach(function (el) {
                el.textContent = rawTitle.toUpperCase();
            });
        }

        if (p) {
            applyContact(p.phone, p.email);
            applyAgentBranding(p);
        }

        if (typeof window.apiGetLeadAgentProfile === 'function') {
            window.apiGetLeadAgentProfile().then(function (lead) {
                if (lead) {
                    if (lead.phone || lead.email) {
                        applyContact(lead.phone, lead.email);
                    }
                    applyAgentBranding(lead);
                }
            }).catch(function () { });
        }
    }

    window.addEventListener('storage', function (e) {
        if (e.key === THEME_STORAGE_KEY) {
            setTheme(e.newValue === 'dark' ? 'dark' : 'light', true);
        }
        if (e.key === 'urbanscope_admin_profile' || e.key === 'adminUser') {
            syncGlobalFooterContact();
        }
        if (e.key === 'inquiries' ||
            e.key === 'urbanscope_client_notifs' ||
            e.key === 'urbanscope_inquiry_overrides' ||
            (e.key && e.key.indexOf('client_notifs_read_ids_') === 0)) {
            loadClientNotifications();
        }
    });

    window.addEventListener('urbanscope:profileUpdated', function () {
        syncGlobalFooterContact();
    });

    window.addEventListener('inquiryStatusChanged', function () {
        loadClientNotifications();
    });

    window.addEventListener('inquiriesUpdated', function () {
        loadClientNotifications();
    });

    window.addEventListener('clientNotificationAdded', function () {
        loadClientNotifications();
    });

    window.addEventListener('focus', function () {
        syncGlobalFooterContact();
        loadClientNotifications();
    });

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            loadClientNotifications();
        }
    });

    setInterval(function () {
        if (!document.hidden && currentUser) {
            loadClientNotifications();
        }
    }, 5000);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // Failsafe so a slow network can never leave the page hidden
    setTimeout(function () {
        if (!requiresAuth) root.classList.remove('auth-pending');
        else if (!resolved) location.replace(loginUrl(currentPage(), 'inquiry'));
    }, 5000);

    // Floating Contact Action Button (Messenger, Call, SMS)
    var CONTACT_CONFIG = {
        messengerPage: 'miriamalobren',
        fallbackPhone: '+63 918 964 5434'
    };

    function initContactFab() {
        var path = location.pathname.toLowerCase().replace(/\\/g, '/');
        if (path.includes('/pages/admin/') || path.includes('/pages/superadmin/') || path.includes('/pages/auth/')) return;
        if (document.querySelector('.contact-fab')) return;

        var currentPhone = CONTACT_CONFIG.fallbackPhone;
        try {
            var p = JSON.parse(localStorage.getItem('urbanscope_admin_profile') || 'null');
            if (p && p.phone) currentPhone = p.phone;
        } catch (_) {}
        var cleanDigits = currentPhone.replace(/[^\d+]/g, '');

        var propTitle = '';
        var h1 = document.querySelector('.property-title, h1');
        if (h1 && (path.includes('/properties/') || path.includes('property'))) {
            propTitle = h1.textContent.trim();
        }
        var smsBody = propTitle
            ? encodeURIComponent("Hello Miriam, I'm interested in " + propTitle + ". Is it still available?")
            : encodeURIComponent("Hello Miriam, I'd like to ask about available properties in Cavite / Las Piñas.");

        var fabWrap = document.createElement('div');
        fabWrap.className = 'contact-fab';
        fabWrap.id = 'contactFab';

        var messengerHtml = '';
        if (CONTACT_CONFIG.messengerPage) {
            messengerHtml =
                '<a href="https://m.me/' + encodeURIComponent(CONTACT_CONFIG.messengerPage) + '" class="fab-action-btn fab-msgr" target="_blank" rel="noopener noreferrer" aria-label="Chat on Facebook Messenger">' +
                    '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.453 5.517 3.734 7.202V22l3.39-1.86c.92.255 1.895.394 2.876.394 5.523 0 10-4.145 10-9.258C22 6.145 17.523 2 12 2zm1.066 12.445l-2.723-2.905-5.312 2.905 5.845-6.208 2.788 2.905 5.247-2.905-5.845 6.208z"/></svg>' +
                    '<span class="fab-label">Messenger</span>' +
                '</a>';
        }

        fabWrap.innerHTML =
            '<div class="fab-menu" id="fabMenu" aria-hidden="true">' +
                messengerHtml +
                '<a href="sms:' + cleanDigits + '?&body=' + smsBody + '" class="fab-action-btn fab-sms" id="fabSmsBtn" aria-label="Send SMS text message">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
                    '<span class="fab-label">Text SMS</span>' +
                '</a>' +
                '<a href="tel:' + cleanDigits + '" class="fab-action-btn fab-call" id="fabCallBtn" aria-label="Call Miriam Lobren">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' +
                    '<span class="fab-label">Call Now</span>' +
                '</a>' +
            '</div>' +
            '<button type="button" class="fab-main-btn" id="fabMainBtn" aria-label="Contact Miriam Lobren" aria-expanded="false">' +
                '<span class="fab-icon-chat">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
                '</span>' +
                '<span class="fab-icon-close">' +
                    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
                '</span>' +
            '</button>';

        document.body.appendChild(fabWrap);
        document.body.classList.add('has-contact-fab');

        var mainBtn = fabWrap.querySelector('#fabMainBtn');
        var menu = fabWrap.querySelector('#fabMenu');

        function toggleFab() {
            var open = fabWrap.classList.toggle('open');
            mainBtn.setAttribute('aria-expanded', String(open));
            menu.setAttribute('aria-hidden', String(!open));
        }

        mainBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleFab();
        });

        document.addEventListener('click', function (e) {
            if (!fabWrap.contains(e.target) && fabWrap.classList.contains('open')) {
                fabWrap.classList.remove('open');
                mainBtn.setAttribute('aria-expanded', 'false');
                menu.setAttribute('aria-hidden', 'true');
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && fabWrap.classList.contains('open')) {
                fabWrap.classList.remove('open');
                mainBtn.setAttribute('aria-expanded', 'false');
                menu.setAttribute('aria-hidden', 'true');
                mainBtn.focus();
            }
        });
    }

    // ------------------------------------------------------------------
    // Global handlers
    // ------------------------------------------------------------------
    document.addEventListener('click', async function (e) {
        // Sign out
        if (e.target.closest('[data-action="signout"]')) {
            e.preventDefault();
            logout();
            return;
        }

        // Close open dropdowns when clicking elsewhere
        if (!e.target.closest('.profile-menu') && !e.target.closest('.user-profile-badge')) {
            document.querySelectorAll('.profile-menu.open, .user-profile-badge.open').forEach(function (m) {
                m.classList.remove('open');
            });
        }
        if (!e.target.closest('.client-notif-wrap')) {
            document.querySelectorAll('.client-notif-wrap.open').forEach(function (m) {
                m.classList.remove('open');
            });
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        initThemeToggle();
        initContactFab();
        if (root.classList.contains('logged-in') || root.getAttribute('data-auth-state') === 'logged-in') {
            document.querySelectorAll('.inquiry-note').forEach(function (el) {
                el.style.display = 'none';
            });
        }
    });

    window.UrbanSession = { getUser: getUser, logout: logout, loginUrl: loginUrl, updateInquiryNoteVisibility: updateInquiryNoteVisibility, setTheme: setTheme };
})();
