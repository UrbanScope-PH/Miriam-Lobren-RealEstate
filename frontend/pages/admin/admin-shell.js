/**
 * UrbanScope Admin Shell — Unified Sidebar, Topbar & Navigation Engine
 * Guarantees consistent sidebar behavior, notifications, and active item styling across all admin pages.
 */

(function () {
    "use strict";

    const THEME_STORAGE_KEY = "urbanscope_theme";
    const root = document.documentElement;
    let themeTransitionTimer = null;

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

        if (animate && typeof document.startViewTransition === "function") {
            root.classList.remove("theme-transitioning");
            try {
                document.startViewTransition(commitThemeDom);
                return;
            } catch (_) {}
        }

        if (animate) {
            root.classList.add("theme-transitioning");
            if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
            themeTransitionTimer = setTimeout(() => {
                root.classList.remove("theme-transitioning");
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
        if (!dateInput) return "Recently";
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return "Recently";
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
                            subtitle: `${propTitle} &bull; ${evTimeAgo}`,
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
                            subtitle: `${code} &bull; ${formatTimeAgo(createdDate)}`,
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
                    subtitle: `${propTitle} &bull; ${timeAgo}`,
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
            const targetUrl = getInquiryPageUrl();
            return items.slice(0, 6).map(item => `
                <a href="${targetUrl}" class="notif-item" role="menuitem">
                    <div class="notif-avatar ${item.avatarClass}">
                        ${item.avatarIcon}
                    </div>
                    <div class="notif-text">
                        <strong>${item.title}</strong>
                        <small>${item.subtitle}</small>
                    </div>
                </a>
            `).join('');
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

        const borderCol = (type === 'cancelled') ? '#ef4444' : '#10b981';
        const iconSvg = (type === 'cancelled')
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';

        toast.style.borderLeftColor = borderCol;
        toast.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:12px;">
                <div style="margin-top:2px;flex-shrink:0;">${iconSvg}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:800;font-size:13.5px;color:#ffffff;line-height:1.3;">${title}</div>
                    ${subtitle ? `<div style="font-size:12px;color:rgba(255,255,255,0.85);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${subtitle}</div>` : ''}
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
        toast._hideTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 6000);
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

    async function loadNotifications() {
        let inquiries = [];
        let adminEvents = [];

        if (typeof window.apiGetInquiries === "function") {
            try {
                const res = await window.apiGetInquiries();
                if (Array.isArray(res)) inquiries = res;
            } catch (_) {}
        }
        if (!inquiries.length) {
            try {
                inquiries = JSON.parse(localStorage.getItem("inquiries") || "[]");
            } catch (_) {}
        }

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

        if (typeof window.apiGetAdminNotifications === "function") {
            try {
                const evs = await window.apiGetAdminNotifications();
                if (Array.isArray(evs)) adminEvents = evs.filter(ev => ev && ev.type !== 'approved' && ev.type !== 'completed');
            } catch (_) {}
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
                    window.dispatchEvent(new CustomEvent('inquirySubmitted', { detail: { inquiries } }));
                    window.dispatchEvent(new CustomEvent('newInquiryReceived', { detail: { inquiries } }));
                    window.dispatchEvent(new CustomEvent('inquiriesUpdated', { detail: { inquiries } }));
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
                    <div class="notif-empty">Loading notifications...</div>
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

        loadNotifications();
        setInterval(() => {
            if (document.visibilityState === "visible") {
                loadNotifications();
            }
        }, 4000);
        window.addEventListener("inquirySubmitted", () => loadNotifications());
        window.addEventListener("inquiryCancelled", () => loadNotifications());
        window.addEventListener("inquiryStatusChanged", () => loadNotifications());
        window.addEventListener("inquiriesUpdated", () => loadNotifications());
        window.addEventListener("adminNotificationAdded", () => loadNotifications());
        window.addEventListener("storage", e => {
            if (
                e.key === "inquiries" ||
                e.key === "urbanscope_admin_event_notifs" ||
                e.key === "urbanscope_inquiry_overrides" ||
                e.key === "urbanscope_deleted_inquiry_ids"
            ) {
                loadNotifications();
            }
        });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                loadNotifications();
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
            } else if (activeSection === "settings" && (label === "settings" || href.includes("profile.html"))) {
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

    // Initialize on DOM Ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            initAdminThemeToggle();
            initAdminSidebar();
            initProfileDropdown();
            initNotificationDropdown();
            updateActiveSidebarItem();
            syncAdminProfileDisplay();
        });
    } else {
        initAdminThemeToggle();
        initAdminSidebar();
        initProfileDropdown();
        initNotificationDropdown();
        updateActiveSidebarItem();
        syncAdminProfileDisplay();
    }
})();
