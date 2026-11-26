/**
 * UrbanScope Admin Shell — Unified Sidebar, Topbar & Navigation Engine
 * Guarantees consistent sidebar behavior, notifications, and active item styling across all admin pages.
 */

(function () {
    "use strict";

    const THEME_STORAGE_KEY = "urbanscope_theme";
    const MAIN_ADMIN_EMAIL = "miriamalobren@gmail.com";
    const root = document.documentElement;
    let themeTransitionTimer = null;

    function isMainAdminEmail(email) {
        return String(email || "").trim().toLowerCase() === MAIN_ADMIN_EMAIL;
    }

    function applyRbacNavAccess(allowed, removeDisallowedLinks = false) {
        if (allowed) {
            root.setAttribute("data-rbac-access", "true");
            return;
        }
        root.removeAttribute("data-rbac-access");
        if (removeDisallowedLinks) {
            document.querySelectorAll('.admin-sidebar a.nav-item[href$="users.html"]').forEach(link => {
                link.remove();
            });
        }
    }

    // Early synchronous check so Accounts & Roles renders without flicker for miriamalobren@gmail.com
    // and never flashes for promoted admins.
    try {
        const earlyRaw = localStorage.getItem("adminUser") || localStorage.getItem("urbanscope_user");
        const earlyUser = earlyRaw ? JSON.parse(earlyRaw) : null;
        applyRbacNavAccess(isMainAdminEmail(earlyUser && earlyUser.email), false);
    } catch (_) {
        applyRbacNavAccess(false, false);
    }

    try {
        const savedTheme = (window.UrbanTheme && typeof window.UrbanTheme.get === "function")
            ? window.UrbanTheme.get()
            : localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === "dark") {
            root.classList.add("dark-mode");
            root.setAttribute("data-theme", "dark");
        } else {
            root.classList.remove("dark-mode");
            root.setAttribute("data-theme", "light");
        }
    } catch (_) {}

    function setAdminTheme(mode, animate) {
        const isDark = mode === "dark";
        const cleanMode = isDark ? "dark" : "light";
        if (window.UrbanTheme && typeof window.UrbanTheme.set === "function") {
            window.UrbanTheme.set(cleanMode, animate);
            return;
        }
        const prefersReduced = typeof window.matchMedia === "function"
            && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const shouldAnimate = Boolean(animate) && !prefersReduced;

        const commitThemeDom = () => {
            root.classList.toggle("dark-mode", isDark);
            root.setAttribute("data-theme", cleanMode);
            try { localStorage.setItem(THEME_STORAGE_KEY, cleanMode); } catch (_) {}
            try { document.cookie = "urbanscope_theme=" + cleanMode + "; path=/; max-age=31536000; SameSite=Lax"; } catch (_) {}
            try {
                const baseName = String(window.name || "").replace(/\s*__urbanscope_theme=(?:dark|light)/g, "").trim();
                window.name = (baseName ? baseName + " " : "") + "__urbanscope_theme=" + cleanMode;
            } catch (_) {}

            document.querySelectorAll(".theme-toggle-btn").forEach(btn => {
                btn.setAttribute("aria-pressed", String(isDark));
                btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
                btn.setAttribute("title", isDark ? "Switch to Light Mode" : "Switch to Dark Mode");
            });
        };

        const clearVtSnap = (seq) => {
            if (seq === undefined || root._urbanVtSeq === seq) {
                root.classList.remove("theme-vt-snap");
            }
            if (root._urbanVtSnapTimer) {
                clearTimeout(root._urbanVtSnapTimer);
                root._urbanVtSnapTimer = null;
            }
        };

        if (shouldAnimate && typeof document.startViewTransition === "function") {
            root.classList.remove("theme-transitioning");
            if (themeTransitionTimer) {
                clearTimeout(themeTransitionTimer);
                themeTransitionTimer = null;
            }
            const vtSeq = (root._urbanVtSeq = (root._urbanVtSeq || 0) + 1);
            if (root._urbanVtSnapTimer) {
                clearTimeout(root._urbanVtSnapTimer);
                root._urbanVtSnapTimer = null;
            }
            try {
                const transition = document.startViewTransition(() => {
                    root.classList.add("theme-vt-snap");
                    commitThemeDom();
                    void root.offsetHeight;
                });
                if (transition && transition.finished && typeof transition.finished.finally === "function") {
                    transition.finished.finally(() => clearVtSnap(vtSeq));
                }
                root._urbanVtSnapTimer = setTimeout(() => clearVtSnap(vtSeq), 560);
                return;
            } catch (_) {
                clearVtSnap(vtSeq);
            }
        }

        root.classList.remove("theme-vt-snap");
        if (shouldAnimate) {
            root.classList.add("theme-transitioning");
            if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
            themeTransitionTimer = setTimeout(() => {
                root.classList.remove("theme-transitioning");
                themeTransitionTimer = null;
            }, 520);
        }

        commitThemeDom();
    }

    function initAdminThemeToggle() {
        const topbarRight = document.querySelector(".topbar-right");
        if (!topbarRight || topbarRight.querySelector(".theme-toggle-btn")) return;

        const isDark = root.classList.contains("dark-mode") || root.getAttribute("data-theme") === "dark";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "theme-toggle-btn";
        btn.id = "adminThemeToggleBtn";
        btn.setAttribute("aria-pressed", String(isDark));
        btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
        btn.setAttribute("title", isDark ? "Switch to Light Mode" : "Switch to Dark Mode");
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

        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            const currentlyDark = root.classList.contains("dark-mode") || root.getAttribute("data-theme") === "dark";
            setAdminTheme(currentlyDark ? "light" : "dark", true);
        });

        topbarRight.insertBefore(btn, topbarRight.firstChild);
    }

    window.addEventListener("storage", function (e) {
        if (e.key === THEME_STORAGE_KEY) {
            setAdminTheme(e.newValue === "dark" ? "dark" : "light", true);
        }
    });

    function initAdminSidebar() {
        const sidebar = document.getElementById("adminSidebar");
        const backdrop = document.getElementById("sidebarBackdrop");
        const toggleBtn = document.getElementById("sidebarToggle");
        const closeBtn = document.getElementById("closeSidebarBtn");

        if (!sidebar) return;

        function openSidebar() {
            sidebar.classList.add("open");
            if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
            if (backdrop) {
                backdrop.classList.add("active");
                backdrop.classList.add("show");
            }
            document.body.classList.add("sidebar-open");
        }

        function closeSidebar() {
            sidebar.classList.remove("open");
            if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
            if (backdrop) {
                backdrop.classList.remove("active");
                backdrop.classList.remove("show");
            }
            document.body.classList.remove("sidebar-open");
        }

        if (toggleBtn) {
            toggleBtn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (sidebar.classList.contains("open")) {
                    closeSidebar();
                } else {
                    openSidebar();
                }
            };
        }

        if (closeBtn) {
            closeBtn.onclick = function (e) {
                e.preventDefault();
                closeSidebar();
            };
        }

        if (backdrop) {
            backdrop.onclick = function () {
                closeSidebar();
            };
        }

        sidebar.addEventListener("click", function (e) {
            if (e.target.closest("a")) closeSidebar();
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && sidebar.classList.contains("open")) {
                closeSidebar();
            }
        });

        window.addEventListener("resize", function () {
            if (window.innerWidth > 768 && sidebar.classList.contains("open")) closeSidebar();
        });
    }

    function initProfileDropdown() {
        const profileButton = document.getElementById("profileButton");
        const profileDropdown = document.getElementById("profileDropdown");

        if (!profileButton || !profileDropdown) return;

        function closeDropdown() {
            profileDropdown.hidden = true;
            profileDropdown.classList.remove("show", "active");
            profileButton.setAttribute("aria-expanded", "false");
        }

        closeDropdown();

        function toggleDropdown(e) {
            e.stopPropagation();
            const isHidden = profileDropdown.hidden || !profileDropdown.classList.contains("show");
            if (isHidden) {
                profileDropdown.hidden = false;
                profileDropdown.classList.add("show");
                profileButton.setAttribute("aria-expanded", "true");
            } else {
                closeDropdown();
            }
        }

        profileButton.onclick = toggleDropdown;

        document.addEventListener("click", function (e) {
            if (!profileDropdown.contains(e.target) && !profileButton.contains(e.target)) {
                closeDropdown();
            }
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") closeDropdown();
        });
    }

    function formatTimeAgo(dateInput) {
        if (!dateInput) return "";
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return "";
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (seconds < 45) return "Just now";
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    function getInquiryPageUrl() {
        const p = window.location.pathname || "";
        if (p.includes("/pages/admin/")) {
            return "clients.html";
        } else if (p.includes("/pages/superadmin/")) {
            return "../admin/clients.html";
        } else if (p.includes("/pages/")) {
            return "../admin/clients.html";
        }
        return "pages/admin/clients.html";
    }

    function formatInquiryPropertyLabel(rawTitle) {
        const clean = String(rawTitle || "").trim();
        if (!clean) return "General Inquiry";
        if (/^(general\s+(consultation|inquiry|question)|consultation\s*:)/i.test(clean)) {
            return clean;
        }
        if (/^(specific\s+)?property\s+inquiry$/i.test(clean)) {
            return "Specific Property Inquiry";
        }
        const prefixedMatch = clean.match(/^specific\s+property\s+inquiry\s*:\s*(.*)$/i);
        if (prefixedMatch) {
            const rest = prefixedMatch[1].trim();
            return rest ? `Specific Property Inquiry: ${rest}` : "Specific Property Inquiry";
        }
        return `Specific Property Inquiry: ${clean}`;
    }

    window.formatInquiryPropertyLabel = formatInquiryPropertyLabel;

        function buildNotificationItems(inquiries, adminEvents = []) {
            const items = [];
            const eventsList = Array.isArray(adminEvents)
                ? adminEvents.filter(ev => ev && ev.type !== 'approved' && ev.type !== 'completed')
                : [];
            const existingInqIds = new Set();

            if (Array.isArray(inquiries)) {
                inquiries.forEach((inq, index) => {
                    const id = inq.id || (index + 1);
                    existingInqIds.add(String(id));

                    const code = inq.inquiry_code || `INQ-2026-${String(id).padStart(3, '0')}`;
                    const clientName = inq.client_name || inq.name || 'Client';
                    const propTitle = formatInquiryPropertyLabel(inq.property_title || inq.propertyTitle);
                    const status = (inq.status || 'Under Review').trim();
                    const statusLower = status.toLowerCase();

                    const isCancelled = statusLower === 'cancelled';

                    const matchedCancelEv = eventsList.find(
                        ev => ev && String(ev.inquiryId) === String(id) && ev.type === 'cancelled'
                    );

                    if (isCancelled || matchedCancelEv) {
                        const evTime = (matchedCancelEv && matchedCancelEv.time)
                            ? matchedCancelEv.time
                            : (inq.updated_at ? new Date(inq.updated_at).getTime() : (inq.created_at ? new Date(inq.created_at).getTime() : Date.now()));
                        const evTimeAgo = formatTimeAgo(new Date(evTime).toISOString());
                        items.push({
                            type: 'cancelled',
                            notifKey: (matchedCancelEv && matchedCancelEv.notifKey)
                                ? matchedCancelEv.notifKey
                                : `cancelled_${id}`,
                            avatarClass: 'cancel',
                            avatarIcon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
                            title: `Inquiry ${code} cancelled by ${clientName}`,
                            subtitle: `${propTitle} • ${evTimeAgo}`,
                            time: evTime,
                            inquiryId: id
                        });
                    } else {
                        // All non-cancelled inquiries are new inquiry submission notifications for admin.
                        // Admin should ONLY be notified when a new inquiry has been submitted, NEVER when an inquiry is approved!
                        const createdDate = inq.created_at || inq.date || inq.created || new Date().toISOString();
                        items.push({
                            type: 'new_inquiry',
                            notifKey: `new_inquiry_${id}`,
                            avatarClass: 'user',
                            avatarIcon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
                            title: `New inquiry submitted by ${clientName}`,
                            subtitle: `${code} • ${formatTimeAgo(createdDate)}`,
                            time: new Date(createdDate).getTime(),
                            inquiryId: id
                        });
                    }
                });
            }

            // Also include admin notification events for inquiries that were deleted by the client
            eventsList.forEach(ev => {
                if (!ev || existingInqIds.has(String(ev.inquiryId))) return;
                if (ev.type === 'approved' || ev.type === 'completed') return;
                const evTime = ev.time || (ev.created_at ? new Date(ev.created_at).getTime() : Date.now());
                const timeAgo = formatTimeAgo(new Date(evTime).toISOString());
                const propTitle = formatInquiryPropertyLabel(ev.property_title || ev.subtitle);
                const code = `INQ-2026-${String(ev.inquiryId || 0).padStart(3, '0')}`;
                items.push({
                    type: ev.type || 'cancelled',
                    notifKey: ev.notifKey || `deleted_${ev.inquiryId}`,
                    avatarClass: ev.avatarClass || 'cancel',
                    avatarIcon: ev.avatarIcon || '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
                    title: ev.title || `Inquiry ${code} cancelled by ${ev.client_name || 'Client'}`,
                    subtitle: `${propTitle} • ${timeAgo}`,
                    time: evTime,
                    inquiryId: ev.inquiryId
                });
            });

            // Filter out any approved or completed items strictly
            const filteredItems = items.filter(it => it && it.type !== 'approved' && it.type !== 'completed');

            // Sort notifications by most recent first
            filteredItems.sort((a, b) => (b.time || 0) - (a.time || 0));
            return filteredItems;
        }

        function renderNotifHtml(items) {
            if (!items || !items.length) {
                return `
                    <div class="notif-empty">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin:0 auto 8px;display:block;opacity:0.4;">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <span>No notifications yet.</span>
                    </div>
                `;
            }
            const targetUrl = escShellHtml(getInquiryPageUrl());
            return items.slice(0, 6).map(item => `
                <a href="${targetUrl}" class="notif-item" role="menuitem">
                    <div class="notif-avatar ${escShellHtml(item.avatarClass)}">
                        ${item.avatarIcon}
                    </div>
                    <div class="notif-text">
                        <strong>${escShellHtml(item.title)}</strong>
                        <small>${escShellHtml(item.subtitle)}</small>
                    </div>
                </a>
            `).join('');
        }

    function escShellHtml(val) {
        if (typeof window.escapeHtml === "function") return window.escapeHtml(val);
        return String(val == null ? "" : val)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function playAdminNotificationChime() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.35);
        } catch (_) {}
    }

    function showAdminShellToast(title, subtitle = '', type = 'info', inqId = null) {
        let toast = document.getElementById("adminShellToast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "adminShellToast";
            toast.className = "admin-shell-toast";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");
            document.body.appendChild(toast);
        }

        const borderCol = (type === 'cancelled') ? '#f87171' : 'var(--emerald-bright, #4ade80)';
        const iconSvg = (type === 'cancelled')
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--emerald-bright, #4ade80)" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';

        toast.style.borderLeftColor = borderCol;
        toast.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:12px;">
                <div style="margin-top:2px;flex-shrink:0;">${iconSvg}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:800;font-size:13.5px;color:#ffffff;line-height:1.3;">${escShellHtml(title)}</div>
                    ${subtitle ? `<div style="font-size:12px;color:rgba(255,255,255,0.85);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escShellHtml(subtitle)}</div>` : ''}
                </div>
                <button type="button" class="admin-toast-close" style="background:none;border:none;color:rgba(255,255,255,0.6);font-size:18px;cursor:pointer;padding:0 0 0 8px;line-height:1;">&times;</button>
            </div>
        `;

        const closeBtn = toast.querySelector('.admin-toast-close');
        if (closeBtn) {
            closeBtn.onclick = function (e) {
                e.stopPropagation();
                toast.classList.remove("show");
            };
        }

        toast.onclick = function () {
            const targetUrl = getInquiryPageUrl();
            window.location.href = targetUrl;
        };

        toast.classList.add("show");
        clearTimeout(toast._hideTimer);
        const toastDuration = window.innerWidth <= 768 ? 4000 : 6000;
        toast._hideTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, toastDuration);
    }

    let currentNotificationItems = [];
    let knownAdminInquiryIds = null;

    function markNotificationsAsViewed() {
        const now = Date.now();
        localStorage.setItem("admin_notifs_last_viewed", String(now));

        if (Array.isArray(currentNotificationItems)) {
            let existingRead = [];
            try {
                existingRead = JSON.parse(localStorage.getItem("admin_notifs_read_ids") || "[]");
            } catch (_) {}
            const mergedSet = new Set(Array.isArray(existingRead) ? existingRead.map(String) : []);
            currentNotificationItems.forEach(it => {
                if (it.notifKey) mergedSet.add(String(it.notifKey));
                if (it.inquiryId) mergedSet.add(String(it.inquiryId));
            });
            localStorage.setItem("admin_notifs_read_ids", JSON.stringify(Array.from(mergedSet)));
        }

        const badges = document.querySelectorAll(".notif-badge");
        badges.forEach(b => {
            b.textContent = "0";
            b.setAttribute("data-count", "0");
            b.style.display = "none";
        });
    }

    let adminNotifPromise = null;
    let lastAdminNotifAt = 0;

    async function loadNotifications(prefetchedOrOpts = null) {
        const isPrefetched = Array.isArray(prefetchedOrOpts);
        const forceRefresh = Boolean(prefetchedOrOpts && !isPrefetched && prefetchedOrOpts.force);
        const now = Date.now();

        if (!isPrefetched && !forceRefresh && (now - lastAdminNotifAt) < 5000) {
            return adminNotifPromise || Promise.resolve();
        }
        if (!isPrefetched && !forceRefresh && adminNotifPromise) {
            return adminNotifPromise;
        }

        lastAdminNotifAt = now;
        const p = _loadNotificationsInner(isPrefetched ? prefetchedOrOpts : null, forceRefresh).finally(() => {
            if (adminNotifPromise === p) adminNotifPromise = null;
        });
        if (!isPrefetched) {
            adminNotifPromise = p;
        }
        return p;
    }

    async function _loadNotificationsInner(prefetchedInquiries = null, forceRefresh = false) {
        let inquiries = [];
        let adminEvents = [];

        // Purge any legacy approved/completed events from local storage cache
        try {
            const rawEvs = localStorage.getItem("urbanscope_admin_event_notifs");
            if (rawEvs) {
                const parsed = JSON.parse(rawEvs);
                if (Array.isArray(parsed)) {
                    const cleaned = parsed.filter(ev => ev && ev.type !== 'approved' && ev.type !== 'completed');
                    if (cleaned.length !== parsed.length) {
                        localStorage.setItem("urbanscope_admin_event_notifs", JSON.stringify(cleaned));
                    }
                }
            }
        } catch (_) {}

        const inquiriesPromise = Array.isArray(prefetchedInquiries)
            ? Promise.resolve(prefetchedInquiries)
            : (typeof window.apiGetInquiries === "function"
                ? window.apiGetInquiries(forceRefresh).catch(() => [])
                : Promise.resolve([]));

        const eventsPromise = (typeof window.apiGetAdminNotifications === "function")
            ? window.apiGetAdminNotifications(forceRefresh).catch(() => null)
            : Promise.resolve(null);

        const [resolvedInquiries, resolvedEvents] = await Promise.all([inquiriesPromise, eventsPromise]);

        if (Array.isArray(resolvedInquiries)) {
            inquiries = resolvedInquiries;
        }
        if (!inquiries.length) {
            try {
                inquiries = JSON.parse(localStorage.getItem("inquiries") || "[]");
            } catch (_) {}
        }

        if (Array.isArray(resolvedEvents)) {
            adminEvents = resolvedEvents.filter(ev => ev && ev.type !== 'approved' && ev.type !== 'completed');
        } else {
            try {
                adminEvents = JSON.parse(localStorage.getItem("urbanscope_admin_event_notifs") || "[]");
                if (Array.isArray(adminEvents)) adminEvents = adminEvents.filter(ev => ev && ev.type !== 'approved' && ev.type !== 'completed');
            } catch (_) {}
        }

        const items = buildNotificationItems(inquiries, adminEvents);
        currentNotificationItems = items;
        const html = renderNotifHtml(items);

        const topbarList = document.getElementById("topbarNotifList");
        if (topbarList) topbarList.innerHTML = html;

        const dashList = document.getElementById("dashboardNotifList");
        if (dashList) dashList.innerHTML = html;

        // Calculate unread count based on last viewed timestamp and read notifKeys
        const lastViewed = parseInt(localStorage.getItem("admin_notifs_last_viewed") || "0", 10);
        let readIds = [];
        try {
            readIds = JSON.parse(localStorage.getItem("admin_notifs_read_ids") || "[]");
        } catch (_) {}
        const readSet = new Set(Array.isArray(readIds) ? readIds.map(String) : []);

        let unreadCount = 0;
        if (lastViewed > 0 || readSet.size > 0) {
            unreadCount = items.filter(it => {
                if (it.type === 'approved' || it.type === 'completed') return false;
                if (it.notifKey && readSet.has(String(it.notifKey))) return false;
                if (it.type === 'new_inquiry' && it.inquiryId && readSet.has(String(it.inquiryId))) return false;
                if (it.type !== 'cancelled' && it.time && lastViewed > 0 && it.time <= lastViewed) return false;
                return true;
            }).length;
        } else {
            unreadCount = items.filter(it => it.type !== 'approved' && it.type !== 'completed').length;
        }

        // Check for newly arrived notifications (inquiries or cancellations) to alert admin in real-time
        try {
            const toastedKey = "admin_notifs_toasted_keys";
            const toasted = JSON.parse(localStorage.getItem(toastedKey) || "[]");
            const toastedSet = new Set(Array.isArray(toasted) ? toasted.map(String) : []);

            if (!knownAdminInquiryIds) {
                // Initial load: seed historical inquiry IDs and existing items so we don't spam old notifications
                knownAdminInquiryIds = new Set(inquiries.map(i => String(i.id)));
                items.forEach(it => {
                    if (it.notifKey) toastedSet.add(String(it.notifKey));
                });
                localStorage.setItem(toastedKey, JSON.stringify(Array.from(toastedSet)));
            } else {
                let newestItemToToast = null;
                let foundNewInquiry = false;

                items.forEach(it => {
                    const k = String(it.notifKey || '');
                    const inqIdStr = String(it.inquiryId || '');

                    const isNewInquiry = (it.type === 'new_inquiry') && (!knownAdminInquiryIds.has(inqIdStr) || (!toastedSet.has(k) && !readSet.has(k)));
                    const isNewCancel = (it.type === 'cancelled') && !toastedSet.has(k) && !readSet.has(k);

                    if (isNewInquiry || isNewCancel) {
                        toastedSet.add(k);
                        if (inqIdStr) knownAdminInquiryIds.add(inqIdStr);
                        if (!newestItemToToast) newestItemToToast = it;
                        if (isNewInquiry) foundNewInquiry = true;
                    }
                });

                if (newestItemToToast) {
                    localStorage.setItem(toastedKey, JSON.stringify(Array.from(toastedSet)));
                    if (newestItemToToast.type === 'cancelled') {
                        showAdminShellToast(newestItemToToast.title, newestItemToToast.subtitle, 'cancelled', newestItemToToast.inquiryId);
                    } else {
                        showAdminShellToast('New Inquiry Received!', newestItemToToast.title, 'inquiry', newestItemToToast.inquiryId);
                        playAdminNotificationChime();
                    }
                }

                if (foundNewInquiry) {
                    window.dispatchEvent(new CustomEvent('inquirySubmitted', { detail: { inquiries, source: 'admin-shell' } }));
                    window.dispatchEvent(new CustomEvent('newInquiryReceived', { detail: { inquiries, source: 'admin-shell' } }));
                    window.dispatchEvent(new CustomEvent('inquiriesUpdated', { detail: { inquiries, source: 'admin-shell' } }));
                }
            }
        } catch (_) {}

        // Update badges to display unread count (completely hidden if 0)
        const badges = document.querySelectorAll(".notif-badge");
        badges.forEach(b => {
            b.textContent = String(unreadCount);
            b.setAttribute("data-count", String(unreadCount));
            b.style.display = unreadCount > 0 ? "flex" : "none";
        });
    }

    // Expose globally so other scripts can call it
    window.loadAdminNotifications = loadNotifications;
    window.buildNotificationItems = buildNotificationItems;
    window.markNotificationsAsViewed = markNotificationsAsViewed;

    function initNotificationDropdown() {
        const notifBtn = document.querySelector(".notif-btn");
        const topbarRight = document.querySelector(".topbar-right");
        if (!notifBtn || !topbarRight) return;

        notifBtn.id = notifBtn.id || "notifButton";
        notifBtn.setAttribute("aria-haspopup", "true");
        notifBtn.setAttribute("aria-expanded", "false");
        notifBtn.setAttribute("aria-controls", "notifDropdown");

        // Ensure notif-badge element exists inside notifBtn
        let badgeEl = notifBtn.querySelector(".notif-badge");
        if (!badgeEl) {
            badgeEl = document.createElement("span");
            badgeEl.className = "notif-badge";
            badgeEl.style.display = "none";
            badgeEl.textContent = "0";
            notifBtn.appendChild(badgeEl);
        }

        let notifDropdown = document.getElementById("notifDropdown");
        const targetUrl = getInquiryPageUrl();

        if (!notifDropdown) {
            notifDropdown = document.createElement("div");
            notifDropdown.className = "notif-dropdown";
            notifDropdown.id = "notifDropdown";
            notifDropdown.setAttribute("role", "menu");
            notifDropdown.hidden = true;
            notifDropdown.innerHTML = `
                <div class="notif-dropdown-header">
                    <div class="notif-header-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <h3>Recent Notifications</h3>
                    </div>
                    <a href="${targetUrl}" class="view-all-link">View All</a>
                </div>
                <div class="notif-list" id="topbarNotifList">
                    ${(window.UrbanSkeleton && typeof window.UrbanSkeleton.notifItems === "function")
                        ? window.UrbanSkeleton.notifItems(3)
                        : '<div class="sk-notif-item"><span class="sk sk-notif-icon"></span><div class="sk-notif-body"><span class="sk sk-line sk-sm" style="width:76%"></span><span class="sk sk-line sk-xs" style="width:48%"></span></div></div>'}
                </div>
            `;
            topbarRight.appendChild(notifDropdown);
        }

        function closeNotif() {
            notifDropdown.hidden = true;
            notifDropdown.classList.remove("show", "active");
            notifBtn.setAttribute("aria-expanded", "false");
        }

        closeNotif();

        function toggleNotif(e) {
            e.preventDefault();
            e.stopPropagation();

            // When icon is clicked / viewed, notification badge becomes 0
            markNotificationsAsViewed();

            // Close profile dropdown if open
            const profileDropdown = document.getElementById("profileDropdown");
            if (profileDropdown) {
                profileDropdown.hidden = true;
                profileDropdown.classList.remove("show", "active");
                const profileBtn = document.getElementById("profileButton");
                if (profileBtn) profileBtn.setAttribute("aria-expanded", "false");
            }

            const isHidden = notifDropdown.hidden || !notifDropdown.classList.contains("show");
            if (isHidden) {
                notifDropdown.hidden = false;
                notifDropdown.classList.add("show");
                notifBtn.setAttribute("aria-expanded", "true");
            } else {
                closeNotif();
            }
        }

        notifBtn.onclick = toggleNotif;

        notifDropdown.addEventListener("click", function () {
            markNotificationsAsViewed();
        });

        const dashList = document.getElementById("dashboardNotifList");
        if (dashList) {
            dashList.addEventListener("click", function () {
                markNotificationsAsViewed();
            });
        }

        // When profile button is clicked, close notifDropdown
        const profileBtn = document.getElementById("profileButton");
        if (profileBtn) {
            const originalProfileClick = profileBtn.onclick;
            profileBtn.onclick = function (e) {
                closeNotif();
                if (typeof originalProfileClick === "function") {
                    originalProfileClick.call(this, e);
                }
            };
        }

        document.addEventListener("click", function (e) {
            if (!notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
                closeNotif();
            }
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") closeNotif();
        });

        const handleExternalInquiryEvent = (ev) => {
            if (ev && ev.detail && ev.detail.source === 'admin-shell') return;
            loadNotifications({ force: true });
        };
        loadNotifications();
        setInterval(() => {
            if (document.visibilityState === "visible" && (Date.now() - lastAdminNotifAt) >= 18000) {
                loadNotifications({ force: true });
            }
        }, 20000);
        window.addEventListener("inquirySubmitted", handleExternalInquiryEvent);
        window.addEventListener("inquiryCancelled", handleExternalInquiryEvent);
        window.addEventListener("inquiryStatusChanged", handleExternalInquiryEvent);
        window.addEventListener("inquiriesUpdated", handleExternalInquiryEvent);
        window.addEventListener("adminNotificationAdded", () => loadNotifications({ force: true }));
        window.addEventListener("storage", e => {
            if (
                e.key === "inquiries" ||
                e.key === "urbanscope_admin_event_notifs" ||
                e.key === "urbanscope_inquiry_overrides" ||
                e.key === "urbanscope_deleted_inquiry_ids"
            ) {
                loadNotifications({ force: true });
            }
        });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && (Date.now() - lastAdminNotifAt) >= 5000) {
                loadNotifications({ force: true });
            }
        });
    }

    function updateActiveSidebarItem() {
        const path = (window.location.pathname || "").toLowerCase();
        const search = (window.location.search || "").toLowerCase();
        const navItems = document.querySelectorAll(".admin-sidebar .nav-item");

        if (!navItems.length) return;

        let activeSection = "home";
        if (path.includes("dashboard.html") || path.endsWith("/admin/")) {
            activeSection = "home";
        } else if (
            path.includes("propertylist.html") ||
            path.includes("properties.html") ||
            path.includes("add-property.html") ||
            path.includes("addproperty.html") ||
            path.includes("edit-property.html")
        ) {
            activeSection = "properties";
        } else if (path.includes("clients.html")) {
            activeSection = "clients";
        } else if (path.includes("users.html")) {
            activeSection = "users";
        } else if (path.includes("profile.html")) {
            activeSection = "settings";
        }

        navItems.forEach(item => {
            const label = (item.querySelector("span")?.textContent || item.textContent || "").trim().toLowerCase();
            const href = (item.getAttribute("href") || "").toLowerCase();

            let match = false;
            if ((activeSection === "home" || activeSection === "dashboard") && (label === "home" || label === "dashboard" || href.includes("dashboard.html"))) {
                match = true;
            } else if (activeSection === "properties" && (label === "properties" || href.includes("propertylist.html"))) {
                match = true;
            } else if (activeSection === "clients" && (label === "client inquiries" || label === "clients" || label === "inquiries" || href.includes("clients.html"))) {
                match = true;
            } else if (activeSection === "users" && (label.includes("accounts") || label === "users" || href.includes("users.html"))) {
                match = true;
            } else if (activeSection === "settings" && (label === "settings" || label.includes("profile") || href.includes("profile.html"))) {
                match = true;
            }

            if (match) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });
    }

    function resolveAdminAvatar(avatarUrl) {
        const defaultAvatar = "../../assets/images/agent.jpg";
        if (!avatarUrl || typeof avatarUrl !== "string") return defaultAvatar;
        const trimmed = avatarUrl.trim();
        if (!trimmed) return defaultAvatar;
        if (trimmed.startsWith("data:") || /^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }
        if (trimmed.startsWith("/") || trimmed.startsWith("../")) {
            return trimmed;
        }
        const clean = trimmed.replace(/^\/+/, "");
        return "../../" + clean;
    }

    function syncAdminProfileDisplay() {
        try {
            let customAvatar = localStorage.getItem("urbanscope_profile_avatar");
            if (customAvatar && (customAvatar.includes("agent.jpg") || (!customAvatar.startsWith("data:") && !/^https?:\/\//i.test(customAvatar)))) {
                localStorage.removeItem("urbanscope_profile_avatar");
                customAvatar = null;
            }

            const raw = localStorage.getItem("adminUser") || localStorage.getItem("urbanscope_user");
            if (!raw && !customAvatar) return;

            const user = raw ? JSON.parse(raw) : {};
            const avatar = customAvatar || user.avatar_url || user.avatar || user.profile_image || "../../assets/images/agent.jpg";
            const name = user.name || user.full_name;

            const resolvedAvatar = resolveAdminAvatar(avatar);
            document.querySelectorAll(".admin-profile-badge .avatar-circle, .profile-dropdown-info .avatar-circle, #adminTopAvatar").forEach(el => {
                el.onerror = function () {
                    this.onerror = null;
                    this.src = "../../assets/images/agent.jpg";
                };
                el.src = resolvedAvatar;
            });

            if (name) {
                document.querySelectorAll("#adminNameDisplay, .admin-profile-name, .profile-display-name").forEach(el => {
                    el.textContent = name;
                });
            }
        } catch (_) {}
    }
    window.syncAdminProfileDisplay = syncAdminProfileDisplay;
    window.resolveAdminAvatar = resolveAdminAvatar;

    function initMobileFormAccordions() {
        const formCards = Array.from(document.querySelectorAll(".form-card"));
        if (formCards.length <= 1) return;

        formCards.forEach((card, idx) => {
            const header = card.querySelector(".form-card-header");
            if (!header) return;

            card.classList.add("is-accordion-card");
            if (idx === 0) {
                card.classList.add("is-expanded");
            }
            header.setAttribute("role", "button");
            header.setAttribute("tabindex", "0");
            header.setAttribute("aria-expanded", idx === 0 ? "true" : "false");

            if (!header.querySelector(".form-card-chevron")) {
                const chev = document.createElement("span");
                chev.className = "form-card-chevron";
                chev.setAttribute("aria-hidden", "true");
                chev.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
                header.appendChild(chev);
            }

            function toggleCard() {
                if (window.innerWidth > 768) return;
                const expanded = card.classList.toggle("is-expanded");
                header.setAttribute("aria-expanded", String(expanded));
            }

            header.addEventListener("click", toggleCard);
            header.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleCard();
                }
            });
        });

        // Auto-expand any collapsed card containing an invalid field on form submit
        document.addEventListener("invalid", (e) => {
            const target = e.target;
            if (!target || typeof target.closest !== "function") return;
            const parentCard = target.closest(".form-card");
            if (parentCard && !parentCard.classList.contains("is-expanded")) {
                parentCard.classList.add("is-expanded");
                const header = parentCard.querySelector(".form-card-header");
                if (header) header.setAttribute("aria-expanded", "true");
            }
        }, true);
    }

    // Shared Property Row Actions Dropdown (used across Admin Dashboard & Manage Properties)
    let activePropActionCtx = null;
    let activePropTrigger = null;
    let propActionMenuEl = null;

    function closePropActionMenu(restoreFocus) {
        if (activePropTrigger) {
            activePropTrigger.classList.remove("is-open");
            activePropTrigger.setAttribute("aria-expanded", "false");
            if (restoreFocus) {
                try { activePropTrigger.focus(); } catch (_) {}
            }
        }
        document.querySelectorAll(".prop-actions-trigger.is-open").forEach(btn => {
            btn.classList.remove("is-open");
            btn.setAttribute("aria-expanded", "false");
        });
        if (propActionMenuEl) {
            propActionMenuEl.hidden = true;
            propActionMenuEl.classList.remove("open-upward");
            propActionMenuEl.style.visibility = "";
        }
        activePropActionCtx = null;
        activePropTrigger = null;
    }

    function ensurePropActionMenu() {
        if (propActionMenuEl) return propActionMenuEl;
        propActionMenuEl = document.createElement("div");
        propActionMenuEl.id = "propertyActionsFloatingMenu";
        propActionMenuEl.className = "prop-actions-menu";
        propActionMenuEl.setAttribute("role", "menu");
        propActionMenuEl.setAttribute("aria-label", "Property actions");
        propActionMenuEl.hidden = true;
        document.body.appendChild(propActionMenuEl);

        propActionMenuEl.addEventListener("click", (e) => {
            const linkItem = e.target.closest("a.prop-actions-item");
            if (linkItem) {
                closePropActionMenu(false);
                return;
            }
            const btnItem = e.target.closest("button.prop-actions-item[data-menu-action]");
            if (!btnItem || !activePropActionCtx) return;
            const action = btnItem.getAttribute("data-menu-action");
            const ctx = activePropActionCtx;
            closePropActionMenu(false);
            if (action === "toggle" && typeof ctx.onToggleStatus === "function") {
                ctx.onToggleStatus(ctx);
            } else if (action === "delete" && typeof ctx.onDelete === "function") {
                ctx.onDelete(ctx);
            }
        });

        document.addEventListener("click", (e) => {
            if (!propActionMenuEl || propActionMenuEl.hidden) return;
            if (e.target.closest("#propertyActionsFloatingMenu") || e.target.closest(".prop-actions-trigger")) return;
            closePropActionMenu(false);
        });

        document.addEventListener("keydown", (e) => {
            if (!propActionMenuEl || propActionMenuEl.hidden) return;
            if (e.key === "Escape") {
                e.preventDefault();
                closePropActionMenu(true);
                return;
            }
            if (e.key === "Tab") {
                closePropActionMenu(false);
                return;
            }
            const items = Array.from(propActionMenuEl.querySelectorAll('[role="menuitem"]'));
            if (!items.length) return;
            const currentIdx = items.indexOf(document.activeElement);
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const nextIdx = currentIdx === -1
                    ? (e.key === "ArrowDown" ? 0 : items.length - 1)
                    : (e.key === "ArrowDown" ? (currentIdx + 1) % items.length : (currentIdx - 1 + items.length) % items.length);
                items[nextIdx].focus();
            } else if (e.key === "Home") {
                e.preventDefault();
                items[0].focus();
            } else if (e.key === "End") {
                e.preventDefault();
                items[items.length - 1].focus();
            }
        });

        window.addEventListener("scroll", (e) => {
            if (!propActionMenuEl || propActionMenuEl.hidden) return;
            if (e.target && e.target.id === "propertyActionsFloatingMenu") return;
            closePropActionMenu(false);
        }, true);

        window.addEventListener("resize", () => {
            if (propActionMenuEl && !propActionMenuEl.hidden) {
                closePropActionMenu(false);
            }
        });

        return propActionMenuEl;
    }

    window.UrbanPropertyActionMenu = {
        close: closePropActionMenu,
        renderTrigger(opts) {
            const safeId = escShellHtml(opts && opts.id != null ? String(opts.id) : "");
            const safeEncodedId = escShellHtml(encodeURIComponent(opts && opts.id != null ? String(opts.id) : ""));
            const safeStatus = escShellHtml((opts && opts.status) || "Available");
            const safeTitle = escShellHtml((opts && opts.title) || "Listing");
            return `
                <div class="prop-actions-dropdown">
                    <button type="button"
                            class="prop-actions-trigger"
                            data-prop-action-toggle="1"
                            data-prop-id="${safeId}"
                            data-prop-encoded-id="${safeEncodedId}"
                            data-prop-status="${safeStatus}"
                            data-prop-title="${safeTitle}"
                            aria-haspopup="menu"
                            aria-expanded="false"
                            aria-label="Actions for ${safeTitle}">
                        <span>Actions</span>
                        <svg class="prop-actions-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                </div>
            `;
        },
        toggle(event, options) {
            if (event) event.stopPropagation();
            const menu = ensurePropActionMenu();
            const trigger = (options && options.trigger)
                || (event && event.currentTarget)
                || (event && event.target && event.target.closest(".prop-actions-trigger"));
            if (!trigger) return;

            if (!menu.hidden && activePropTrigger === trigger) {
                closePropActionMenu(false);
                return;
            }

            closePropActionMenu(false);

            const id = String((options && options.id != null ? options.id : trigger.getAttribute("data-prop-id")) || "");
            const status = String((options && options.status != null ? options.status : trigger.getAttribute("data-prop-status")) || "Available");
            const title = String((options && options.title != null ? options.title : trigger.getAttribute("data-prop-title")) || "Listing");
            const encodedId = encodeURIComponent(id);
            const sLower = status.toLowerCase().trim();
            const isSold = sLower === "sold" || sLower === "sold out";
            const editHref = (options && options.editHref) || `edit-property.html?id=${encodedId}`;

            activePropTrigger = trigger;
            activePropActionCtx = {
                id,
                status,
                title,
                trigger,
                onToggleStatus: options && options.onToggleStatus,
                onDelete: options && options.onDelete
            };

            trigger.classList.add("is-open");
            trigger.setAttribute("aria-expanded", "true");

            const toggleLabel = isSold ? "Mark Available" : "Mark Sold";
            const toggleClass = isSold ? "prop-menu-available" : "prop-menu-sold";
            const toggleIcon = isSold
                ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>';

            menu.innerHTML = `
                <div class="prop-actions-menu-header">Property Actions</div>
                <a href="${escShellHtml(editHref)}" class="prop-actions-item prop-menu-edit" role="menuitem">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    <span>Edit Property</span>
                </a>
                <button type="button" class="prop-actions-item ${toggleClass}" data-menu-action="toggle" role="menuitem">
                    ${toggleIcon}
                    <span>${toggleLabel}</span>
                </button>
                <div class="prop-actions-menu-divider" role="separator"></div>
                <button type="button" class="prop-actions-item prop-menu-delete" data-menu-action="delete" role="menuitem">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    <span>Delete</span>
                </button>
            `;

            menu.style.visibility = "hidden";
            menu.hidden = false;

            const rect = trigger.getBoundingClientRect();
            const cssZoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
            const layoutRatio = trigger.offsetWidth > 0 ? (rect.width / trigger.offsetWidth) : 1;
            const zoomScale = (cssZoom !== 1 && Math.abs(layoutRatio - cssZoom) < 0.1) ? cssZoom : 1;

            const tRight = rect.right / zoomScale;
            const tLeft = rect.left / zoomScale;
            const tTop = rect.top / zoomScale;
            const tBottom = rect.bottom / zoomScale;
            const vpWidth = (document.documentElement.clientWidth || (window.innerWidth / zoomScale));
            const vpHeight = (window.innerHeight / zoomScale);

            const menuWidth = Math.max(menu.offsetWidth || 0, 184);
            menu.style.width = `${menuWidth}px`;

            const menuHeight = menu.offsetHeight || 162;
            const openUpward = (tBottom + 6 + menuHeight > vpHeight - 10) && (tTop > menuHeight + 16);
            const preferredLeft = tRight - menuWidth;
            const left = Math.min(Math.max(10, preferredLeft >= 10 ? preferredLeft : tLeft), vpWidth - menuWidth - 10);
            const rawTop = openUpward ? (tTop - menuHeight - 6) : (tBottom + 6);
            const top = Math.max(10, Math.min(rawTop, vpHeight - menuHeight - 10));

            menu.classList.toggle("open-upward", openUpward);
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
            menu.style.visibility = "";

            if (event && event.detail === 0) {
                const firstItem = menu.querySelector('[role="menuitem"]');
                if (firstItem) firstItem.focus();
            }
        }
    };

    const DEPRECATED_DEMO_TITLES = new Set([
        'velemont residences',
        'green valley villa',
        'horizon heights',
        'sunset heights executive townhouse',
        'maple ridge residence',
        'oakwood manor',
        'victoria park residences'
    ]);

    window.isDeprecatedDemoProperty = function (p) {
        if (!p || typeof p !== 'object') return true;
        const t = (p.title || p.name || p.propertyName || '').toLowerCase().trim();
        if (!t) return true;
        return DEPRECATED_DEMO_TITLES.has(t);
    };

    function normalizeAdminAccreditedList(rawList) {
        return (Array.isArray(rawList) ? rawList : []).filter(p => !window.isDeprecatedDemoProperty(p)).map(p => {
            if (!p) return p;
            const t = (p.title || p.name || p.propertyName || '').toLowerCase().trim();
            if (t.includes('suerte')) p.title = 'Casasuerte';
            else if (t.includes('kathleen')) p.title = 'Kathleen - Place 5';
            else if (t.includes('benecia')) p.title = 'Benecia Single-Attached';
            else if (t.includes('amore')) p.title = 'Amore Classico';
            else if (t.includes('midori')) p.title = 'Midori Mid-Rise Condo – Zone 1';
            return p;
        });
    }

    /**
     * Ensures newly added accredited listings (such as Midori Mid-Rise Condo – Zone 1)
     * are synchronized into live Supabase / local backend when missing on admin pages.
     */
    window.filterAndSyncAccreditedProperties = async function (rawProperties, refreshFn) {
        let filtered = normalizeAdminAccreditedList(rawProperties);
        let suppressMidori = false;
        try {
            suppressMidori = localStorage.getItem('urbanscope_suppress_midori_sync') === '1';
        } catch (_) {}

        const hasMidori = (list) => list.some(p => String(p?.title || p?.name || p?.propertyName || '').toLowerCase().includes('midori'));
        if (!suppressMidori && !hasMidori(filtered)) {
            if (typeof window.apiEnsureAccreditedProperties === 'function') {
                try {
                    const syncRes = await window.apiEnsureAccreditedProperties();
                    if (syncRes && !syncRes.skipped) {
                        if (typeof refreshFn === 'function') {
                            const refreshed = await refreshFn();
                            if (Array.isArray(refreshed) && refreshed.length > 0) {
                                filtered = normalizeAdminAccreditedList(refreshed);
                            }
                        }
                        if (!hasMidori(filtered) && syncRes.data && typeof syncRes.data === 'object') {
                            filtered = normalizeAdminAccreditedList([syncRes.data, ...filtered]);
                        }
                    }
                } catch (_) {}
            }
            if (!hasMidori(filtered) && typeof window.getStaticFallbackProperties === 'function') {
                const fallbackMidori = window.getStaticFallbackProperties().find(p => String(p?.title || '').toLowerCase().includes('midori'));
                if (fallbackMidori) {
                    filtered = normalizeAdminAccreditedList([fallbackMidori, ...filtered]);
                }
            }
        }
        return filtered;
    };

    async function syncRbacNavVisibility() {
        let verifiedEmail = "";
        try {
            if (typeof window.apiGetCurrentUser === "function") {
                const liveUser = await window.apiGetCurrentUser();
                if (liveUser && liveUser.email) {
                    verifiedEmail = String(liveUser.email).trim().toLowerCase();
                }
            }
        } catch (_) {}

        if (!verifiedEmail) {
            try {
                const raw = localStorage.getItem("adminUser") || localStorage.getItem("urbanscope_user");
                const parsed = raw ? JSON.parse(raw) : null;
                if (parsed && parsed.email) {
                    verifiedEmail = String(parsed.email).trim().toLowerCase();
                }
            } catch (_) {}
        }

        const canAccessRbac = isMainAdminEmail(verifiedEmail);
        applyRbacNavAccess(canAccessRbac, true);

        const currentPath = (window.location.pathname || "").toLowerCase();
        if (!canAccessRbac && verifiedEmail && currentPath.includes("users.html")) {
            window.location.replace("dashboard.html");
        }
    }
    window.isMainAdminEmail = isMainAdminEmail;

    // Initialize on DOM Ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            initAdminThemeToggle();
            initAdminSidebar();
            initProfileDropdown();
            initNotificationDropdown();
            updateActiveSidebarItem();
            syncAdminProfileDisplay();
            syncRbacNavVisibility();
            initMobileFormAccordions();
        });
    } else {
        initAdminThemeToggle();
        initAdminSidebar();
        initProfileDropdown();
        initNotificationDropdown();
        updateActiveSidebarItem();
        syncAdminProfileDisplay();
        syncRbacNavVisibility();
        initMobileFormAccordions();
    }
})();
