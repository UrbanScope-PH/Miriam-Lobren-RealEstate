/**
 * UrbanScope Admin Shell — Unified Sidebar, Topbar & Navigation Engine
 * Guarantees consistent sidebar behavior, notifications, and active item styling across all admin pages.
 */

(function () {
    "use strict";

    function initAdminSidebar() {
        const sidebar = document.getElementById("adminSidebar");
        const backdrop = document.getElementById("sidebarBackdrop");
        const toggleBtn = document.getElementById("sidebarToggle");
        const closeBtn = document.getElementById("closeSidebarBtn");

        if (!sidebar) return;

        function openSidebar() {
            sidebar.classList.add("open");
            if (backdrop) {
                backdrop.classList.add("active");
                backdrop.classList.add("show");
            }
            document.body.classList.add("sidebar-open");
        }

        function closeSidebar() {
            sidebar.classList.remove("open");
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

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && sidebar.classList.contains("open")) {
                closeSidebar();
            }
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
            return "clients.html?view=inquiries";
        } else if (p.includes("/pages/superadmin/")) {
            return "../admin/clients.html?view=inquiries";
        } else if (p.includes("/pages/")) {
            return "../admin/clients.html?view=inquiries";
        }
        return "pages/admin/clients.html?view=inquiries";
    }

        function buildNotificationItems(inquiries, adminEvents = []) {
            const items = [];
            const eventsList = Array.isArray(adminEvents) ? adminEvents : [];
            const existingInqIds = new Set();

            if (Array.isArray(inquiries)) {
                inquiries.forEach((inq, index) => {
                    const id = inq.id || (index + 1);
                    existingInqIds.add(String(id));

                    const code = inq.inquiry_code || `INQ-2026-${String(id).padStart(3, '0')}`;
                    const clientName = inq.client_name || inq.name || 'Client';
                    const propTitle = inq.property_title || inq.propertyTitle || 'General Inquiry';
                    const status = (inq.status || 'Under Review').trim();
                    const statusLower = status.toLowerCase();
                    const date = inq.updated_at || inq.created_at || new Date().toISOString();
                    const timeAgo = formatTimeAgo(date);

                    const isCancelled = statusLower === 'cancelled';
                    const isApproved = statusLower === 'approved';
                    const isCompleted = statusLower === 'completed';

                        const matchedCancelEv = eventsList.find(
                            ev => ev && String(ev.inquiryId) === String(id) && ev.type === 'cancelled'
                        );

                        if (isCancelled || matchedCancelEv) {
                            const evTime = (matchedCancelEv && matchedCancelEv.time)
                                ? matchedCancelEv.time
                                : new Date(date).getTime();
                            const evTimeAgo = formatTimeAgo(new Date(evTime).toISOString());
                            items.push({
                                type: 'cancelled',
                                notifKey: (matchedCancelEv && matchedCancelEv.notifKey)
                                    ? matchedCancelEv.notifKey
                                    : `cancelled_${id}`,
                                avatarClass: 'cancel',
                                avatarIcon: '✕',
                                title: `Inquiry ${code} cancelled by ${clientName}`,
                                subtitle: `${propTitle} &bull; ${evTimeAgo}`,
                                time: evTime,
                                inquiryId: id
                            });
                        } else if (isApproved) {
                            items.push({
                                type: 'approved',
                                notifKey: `approved_${id}`,
                                avatarClass: 'check',
                                avatarIcon: '✓',
                                title: `Inquiry ${code} approved`,
                                subtitle: `Client: ${clientName} &bull; ${timeAgo}`,
                                time: new Date(date).getTime(),
                                inquiryId: id
                            });
                        } else if (isCompleted) {
                            items.push({
                                type: 'completed',
                                notifKey: `completed_${id}`,
                                avatarClass: 'check',
                                avatarIcon: '✓',
                                title: `Inquiry ${code} completed`,
                                subtitle: `Client: ${clientName} &bull; ${timeAgo}`,
                                time: new Date(date).getTime(),
                                inquiryId: id
                            });
                        } else {
                            const createdDate = inq.created_at || date;
                            items.push({
                                type: 'new_inquiry',
                                notifKey: `new_inquiry_${id}`,
                                avatarClass: 'user',
                                avatarIcon: '👤',
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
                const evTime = ev.time || (ev.created_at ? new Date(ev.created_at).getTime() : Date.now());
                const timeAgo = formatTimeAgo(new Date(evTime).toISOString());
                const propTitle = ev.property_title || ev.subtitle || 'General Inquiry';
                const code = `INQ-2026-${String(ev.inquiryId || 0).padStart(3, '0')}`;
                items.push({
                    type: ev.type || 'cancelled',
                    notifKey: ev.notifKey || `deleted_${ev.inquiryId}`,
                    avatarClass: ev.avatarClass || 'cancel',
                    avatarIcon: ev.avatarIcon || '✕',
                    title: ev.title || `Inquiry ${code} cancelled by ${ev.client_name || 'Client'}`,
                    subtitle: `${propTitle} &bull; ${timeAgo}`,
                    time: evTime,
                    inquiryId: ev.inquiryId
                });
            });

            // Sort notifications by most recent first
            items.sort((a, b) => (b.time || 0) - (a.time || 0));
            return items;
        }

        function renderNotifHtml(items) {
            if (!items || !items.length) {
                return '<div class="notif-empty">No notifications yet.</div>';
            }
            const targetUrl = getInquiryPageUrl();
        return items.slice(0, 6).map(item => `
                < a href = "${targetUrl}" class= "notif-item" role = "menuitem" >
                <div class="notif-avatar ${item.avatarClass}">
                    ${item.avatarIcon}
                </div>
                <div class="notif-text">
                    <strong>${item.title}</strong>
                    <small>${item.subtitle}</small>
                </div>
            </a >
                `).join('');
    }

    function showAdminShellToast(message) {
        let toast = document.getElementById("adminShellToast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "adminShellToast";
            toast.className = "admin-shell-toast";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 4200);
    }

    let currentNotificationItems = [];

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

        if (typeof window.apiGetAdminNotifications === "function") {
            try {
                const evs = await window.apiGetAdminNotifications();
                if (Array.isArray(evs)) adminEvents = evs;
            } catch (_) {}
        } else {
            try {
                adminEvents = JSON.parse(localStorage.getItem("urbanscope_admin_event_notifs") || "[]");
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
                if (it.notifKey && readSet.has(String(it.notifKey))) return false;
                if (it.type === 'new_inquiry' && it.inquiryId && readSet.has(String(it.inquiryId))) return false;
                if (it.type !== 'cancelled' && it.time && lastViewed > 0 && it.time <= lastViewed) return false;
                return true;
            }).length;
        } else {
            unreadCount = items.length;
        }

        // Check for newly arrived cancellation notifications to toast for admin
        try {
            const toastedKey = "admin_notifs_toasted_keys";
            const toasted = JSON.parse(localStorage.getItem(toastedKey) || "[]");
            const toastedSet = new Set(Array.isArray(toasted) ? toasted : []);
            let newestCancel = null;
            items.forEach(it => {
                if (it.type === "cancelled" && it.notifKey && !readSet.has(String(it.notifKey)) && !toastedSet.has(String(it.notifKey))) {
                    toastedSet.add(String(it.notifKey));
                    if (!newestCancel) newestCancel = it;
                }
            });
            if (newestCancel) {
                localStorage.setItem(toastedKey, JSON.stringify(Array.from(toastedSet)));
                showAdminShellToast(`✕ ${ newestCancel.title }`);
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

        let notifDropdown = document.getElementById("notifDropdown");
        const targetUrl = getInquiryPageUrl();

        if (!notifDropdown) {
            notifDropdown = document.createElement("div");
            notifDropdown.className = "notif-dropdown";
            notifDropdown.id = "notifDropdown";
            notifDropdown.setAttribute("role", "menu");
            notifDropdown.hidden = true;
            notifDropdown.innerHTML = `
            < div class= "notif-dropdown-header" >
                    <div class="notif-header-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <h3>Recent Notifications</h3>
                    </div>
                    <a href="${targetUrl}" class="view-all-link">View All</a>
                </div >
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
        setInterval(loadNotifications, 15000);
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
            if (search.includes("view=inquiries") || search.includes("status=")) {
                activeSection = "inquiries";
            } else {
                activeSection = "clients";
            }
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
            } else if (activeSection === "clients" && label === "clients" && !href.includes("view=inquiries")) {
                match = true;
            } else if (activeSection === "inquiries" && (label === "inquiries" || href.includes("view=inquiries"))) {
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
            initAdminSidebar();
            initProfileDropdown();
            initNotificationDropdown();
            updateActiveSidebarItem();
            syncAdminProfileDisplay();
        });
    } else {
        initAdminSidebar();
        initProfileDropdown();
        initNotificationDropdown();
        updateActiveSidebarItem();
        syncAdminProfileDisplay();
    }
})();
