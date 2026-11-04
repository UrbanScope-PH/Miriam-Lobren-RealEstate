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
    // Restrict administrators and superadmin:
    // They are restricted strictly to the admin portal and must not access the public home page or catalog.
    try {
        var rawUser = localStorage.getItem('adminUser') || localStorage.getItem('urbanscope_user');
        if (rawUser) {
            var parsed = JSON.parse(rawUser);
            var role = (parsed.role || '').toLowerCase();
            var email = (parsed.email || '').toLowerCase().trim();
            var isSuperadmin = (role === 'superadmin' || email === 'urbanscope.cvsu@gmail.com');
            var isAdmin = (role === 'admin' || email === 'admin.realestate@gmail.com');

            var path = location.pathname.toLowerCase().replace(/\\/g, '/');
            var inAdmin = path.includes('/pages/admin/') || path.includes('/pages/superadmin/');
            var inAuth = path.includes('/pages/auth/');

            if (!inAdmin && !inAuth && (isSuperadmin || isAdmin)) {
                var p = location.pathname.replace(/\\/g, '/');
                var basePath = p.indexOf('/pages/') !== -1 ? '../../' : './';
                var target = isSuperadmin ? (basePath + 'pages/superadmin/dashboard.html') : (basePath + 'pages/admin/dashboard.html');
                location.replace(target);
                return;
            }
        }
    } catch (e) { }

    var DEMO_USER_KEY = 'urbanscope_demo_user';
    var root = document.documentElement;
    var requiresAuth = root.hasAttribute('data-require-auth');
    var currentUser = null;
    var resolved = false;
    var cachedClientNotifs = [];

    root.classList.add('auth-pending');
    if (requiresAuth) root.classList.add('auth-checking');

    // Early synchronous check from localStorage to immediately hide guest reminders
    try {
        var quickUser = localStorage.getItem('urbanscope_user') || localStorage.getItem(DEMO_USER_KEY) || localStorage.getItem('adminUser');
        var quickToken = localStorage.getItem('urbanscope_jwt_token');
        if (quickUser || quickToken) {
            root.classList.add('logged-in');
            root.setAttribute('data-auth-state', 'logged-in');
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
            return JSON.parse(localStorage.getItem(DEMO_USER_KEY));
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
        if (inAdmin) return;

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
            acts.appendChild(notifWrap);

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
            acts.appendChild(wrap);

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

        var navbar = document.querySelector('.navbar');
        var nav = document.getElementById('mainNav');
        if (!navbar || !nav) return;

        var acts = navbar.querySelector('.nav-acts');
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

        // Render mobile auth/user drawer section
        var existingAuth = nav.querySelector('.mobile-drawer-auth, .mobile-drawer-user');
        if (existingAuth) existingAuth.remove();

        var base = getBasePath();
        if (user) {
            var userSection = document.createElement('div');
            userSection.className = 'mobile-drawer-user';
            userSection.innerHTML =
                '<div class="mobile-user-info">' +
                '<span class="profile-avatar" style="width:30px;height:30px;font-size:0.75rem;flex-shrink:0;">' + avatarInnerHtml(user) + '</span>' +
                '<span>' + esc(user.name) + '</span>' +
                '</div>' +
                '<a href="' + base + 'pages/inquiry/inquiry.html" class="m-inquiry-link">Submit an Inquiry</a>' +
                '<a href="' + base + 'pages/inquiry/history.html" class="m-inquiry-link">Inquiry History</a>' +
                '<button type="button" class="m-signout-btn" data-action="signout">Sign Out</button>';
            wireAvatarFallbacks(userSection);
            nav.appendChild(userSection);
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
        }

        toggle.onclick = function (e) {
            e.stopPropagation();
            setMenuOpen(!nav.classList.contains('mobile-open'));
        };

        backdrop.onclick = function () {
            setMenuOpen(false);
        };

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
    // Init
    // ------------------------------------------------------------------
    async function init() {
        currentUser = await getUser();
        resolved = true;

        if (currentUser) {
            var role = (currentUser.role || '').toLowerCase();
            var email = (currentUser.email || '').toLowerCase().trim();
            var isSuperadmin = (role === 'superadmin' || email === 'urbanscope.cvsu@gmail.com');
            var isAdmin = (role === 'admin' || email === 'admin.realestate@gmail.com');
            var path = location.pathname.toLowerCase().replace(/\\/g, '/');
            var inAdmin = path.includes('/pages/admin/') || path.includes('/pages/superadmin/');
            var inAuth = path.includes('/pages/auth/');

            if (!inAdmin && !inAuth && (isSuperadmin || isAdmin)) {
                var target = isSuperadmin ? (getBasePath() + 'pages/superadmin/dashboard.html') : (getBasePath() + 'pages/admin/dashboard.html');
                location.replace(target);
                return;
            }
        }

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
                if (adminUser && (adminUser.role === 'admin' || adminUser.email === 'admin.realestate@gmail.com' || adminUser.email === 'miriam@gmail.com' || adminUser.email === 'miriamlobren@gmail.com')) {
                    p = adminUser;
                }
            }
        } catch (e) { }

        function applyContact(phone, email) {
            if (!phone && !email) return;
            var cleanPhone = phone || '09123456789';
            var cleanEmail = email || 'miriam@gmail.com';
            var cleanDigits = cleanPhone.replace(/[^\d+]/g, '');

            document.querySelectorAll('.footer-contact a[href^="tel:"], footer a[href^="tel:"], #footerAgentPhone').forEach(function (el) {
                el.textContent = cleanPhone;
                el.setAttribute('href', 'tel:' + cleanDigits);
            });

            document.querySelectorAll('.footer-contact a[href^="mailto:"], footer a[href^="mailto:"], #footerAgentEmail').forEach(function (el) {
                el.textContent = cleanEmail;
                el.setAttribute('href', 'mailto:' + cleanEmail);
            });
        }

        function applyAgentBranding(profile) {
            if (!profile) return;
            var rawName = profile.name || profile.full_name || 'Miriam Lobren';
            var cleanName = String(rawName).replace(/\s*\((?:Admin|Administrator)\)\s*$/i, '').trim() || rawName;
            var rawTitle = (profile.title && profile.title.trim()) || 'Real Estate Agent';
            if (/^licensed real estate broker\s*\/\s*agent$/i.test(rawTitle)) {
                rawTitle = 'Real Estate Agent';
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

        // Inquiry gate: contacting / inquiring needs an account
        var link = e.target.closest('a[href]');
        if (!link) return;
        if (e.defaultPrevented) return;

        // If on homepage with consultation intent modal, let modal triggers open the modal first
        if (document.getElementById('consultationIntentModal') && !link.closest('#consultationIntentModal')) {
            var rawHref = link.getAttribute('href') || '';
            if (link.matches('#ctaConsultBtn, .cta-consult-btn, .faqs-contact-link') ||
                rawHref === 'pages/inquiry/inquiry.html') {
                return;
            }
        }

        var href = link.getAttribute('href');
        if (!href || !/(^|\/)inquiry(\.html|\/)?(\?|#|$)/.test(href)) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;

        e.preventDefault();
        var user = resolved ? currentUser : await getUser();
        if (user) location.href = href;
        else location.href = loginUrl(rootRelative(href), 'inquiry');
    });

    document.addEventListener('DOMContentLoaded', function () {
        if (root.classList.contains('logged-in') || root.getAttribute('data-auth-state') === 'logged-in') {
            document.querySelectorAll('.inquiry-note').forEach(function (el) {
                el.style.display = 'none';
            });
        }
    });

    window.UrbanSession = { getUser: getUser, logout: logout, loginUrl: loginUrl, updateInquiryNoteVisibility: updateInquiryNoteVisibility };
})();
