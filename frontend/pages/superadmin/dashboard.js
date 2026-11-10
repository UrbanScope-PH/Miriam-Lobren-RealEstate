/**
 * UrbanScope - Superadmin Executive Console Controller
 * High-performance vanilla ES6 controller connecting to FastAPI & Supabase Client.
 */

(function () {
    'use strict';

    const THEME_STORAGE_KEY = 'urbanscope_theme';
    const root = document.documentElement;
    let themeTransitionTimer = null;

    try {
        const savedTheme = (window.UrbanTheme && typeof window.UrbanTheme.get === 'function')
            ? window.UrbanTheme.get()
            : localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'dark') {
            root.classList.add('dark-mode');
            root.setAttribute('data-theme', 'dark');
        } else {
            root.classList.remove('dark-mode');
            root.setAttribute('data-theme', 'light');
        }
    } catch (_) {}

    function setSuperadminTheme(mode, animate) {
        const isDark = mode === 'dark';
        const cleanMode = isDark ? 'dark' : 'light';
        if (window.UrbanTheme && typeof window.UrbanTheme.set === 'function') {
            window.UrbanTheme.set(cleanMode, animate);
            return;
        }
        if (animate) {
            root.classList.add('theme-transitioning');
            let veil = document.getElementById('themeFadeVeil');
            if (!veil && document.body) {
                veil = document.createElement('div');
                veil.id = 'themeFadeVeil';
                veil.className = 'theme-fade-veil';
                veil.setAttribute('aria-hidden', 'true');
                document.body.appendChild(veil);
            }
            if (veil) {
                veil.classList.remove('active');
                void veil.offsetWidth;
                veil.classList.add('active');
            }
            if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
            themeTransitionTimer = setTimeout(() => {
                root.classList.remove('theme-transitioning');
                if (veil) veil.classList.remove('active');
            }, 560);
        }

        root.classList.toggle('dark-mode', isDark);
        root.setAttribute('data-theme', cleanMode);
        try { localStorage.setItem(THEME_STORAGE_KEY, cleanMode); } catch (_) {}
        try { document.cookie = 'urbanscope_theme=' + cleanMode + '; path=/; max-age=31536000; SameSite=Lax'; } catch (_) {}
        try {
            const baseName = String(window.name || '').replace(/\s*__urbanscope_theme=(?:dark|light)/g, '').trim();
            window.name = (baseName ? baseName + ' ' : '') + '__urbanscope_theme=' + cleanMode;
        } catch (_) {}

        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            btn.setAttribute('aria-pressed', String(isDark));
            btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
            btn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
        });
    }

    function initSuperadminThemeToggle() {
        const topbarRight = document.querySelector('.sa-topbar-right');
        if (!topbarRight || topbarRight.querySelector('.theme-toggle-btn')) return;

        const isDark = root.classList.contains('dark-mode') || root.getAttribute('data-theme') === 'dark';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-toggle-btn';
        btn.id = 'saThemeToggleBtn';
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

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentlyDark = root.classList.contains('dark-mode') || root.getAttribute('data-theme') === 'dark';
            setSuperadminTheme(currentlyDark ? 'light' : 'dark', true);
        });

        const profileDropdown = topbarRight.querySelector('.sa-profile-dropdown');
        if (profileDropdown) {
            topbarRight.insertBefore(btn, profileDropdown);
        } else {
            topbarRight.appendChild(btn);
        }
    }

    window.addEventListener('storage', (e) => {
        if (e.key === THEME_STORAGE_KEY) {
            setSuperadminTheme(e.newValue === 'dark' ? 'dark' : 'light', true);
        }
    });

    // State
    let currentSuperadmin = null;
    let allUsers = [];
    let pendingRoleChange = null;

    // DOM Elements
    const elements = {
        sidebar: document.getElementById('saSidebar'),
        sidebarToggle: document.getElementById('saSidebarToggle'),
        closeSidebar: document.getElementById('saCloseSidebar'),
        backdrop: document.getElementById('saBackdrop'),
        profileBtn: document.getElementById('saProfileDropdownBtn'),
        profileMenu: document.getElementById('saDropdownMenu'),
        adminName: document.getElementById('saAdminName'),
        adminEmail: document.getElementById('saAdminEmail'),
        signOutBtn: document.getElementById('saSignOutBtn'),
        liveTime: document.getElementById('saLiveTime'),
        
        // Nav tabs
        navItems: document.querySelectorAll('.sa-nav-item'),
        tabPanes: document.querySelectorAll('.sa-tab-pane'),

        // Badges
        usersCountBadge: document.getElementById('saUsersCountBadge'),

        // KPIs
        kpiTotalUsers: document.getElementById('kpiTotalUsers'),
        kpiUsersBreakdown: document.getElementById('kpiUsersBreakdown'),
        kpiPrivilegedAccounts: document.getElementById('kpiPrivilegedAccounts'),
        kpiPrivilegedBreakdown: document.getElementById('kpiPrivilegedBreakdown'),
        kpiDbSize: document.getElementById('kpiDbSize'),
        kpiDbSub: document.getElementById('kpiDbSub'),
        diagDbSize: document.getElementById('diagDbSize'),
        diagDbLocation: document.getElementById('diagDbLocation'),
        diagEngineEyebrow: document.getElementById('diagEngineEyebrow'),
        saDbEngineTitle: document.getElementById('saDbEngineTitle'),
        saDbFileStatus: document.getElementById('saDbFileStatus'),

        // Tables & Filters
        usersTableBody: document.getElementById('usersTableBody'),
        userFilterInput: document.getElementById('userFilterInput'),
        userRoleFilter: document.getElementById('userRoleFilter'),
        
        // Modals & Forms
        createUserModal: document.getElementById('createUserModal'),
        createUserForm: document.getElementById('createUserForm'),
        btnOpenCreateUserModal: document.getElementById('btnOpenCreateUserModal'),
        btnCreateUserFromTable: document.getElementById('btnCreateUserFromTable'),
        btnCloseCreateUserModal: document.getElementById('btnCloseCreateUserModal'),
        btnCancelCreateUser: document.getElementById('btnCancelCreateUser'),

        roleChangeModal: document.getElementById('roleChangeModal'),
        roleChangeMessage: document.getElementById('roleChangeMessage'),
        btnCloseRoleModal: document.getElementById('btnCloseRoleModal'),
        btnCancelRoleChange: document.getElementById('btnCancelRoleChange'),
        btnConfirmRoleChange: document.getElementById('btnConfirmRoleChange'),

        // Actions
        btnRefreshStats: document.getElementById('btnRefreshStats'),
        btnQuickManageRoles: document.getElementById('btnQuickManageRoles'),
        btnQuickRunIntegrity: document.getElementById('btnQuickRunIntegrity'),
        btnRunIntegrity: document.getElementById('btnRunIntegrity'),

        // Diagnostics
        diagIntegrity: document.getElementById('diagIntegrity'),
        diagFkViolations: document.getElementById('diagFkViolations'),
        diagTriggerStatus: document.getElementById('diagTriggerStatus'),
        saTriggerOnlineBadge: document.getElementById('saTriggerOnlineBadge'),
        saTriggerStatusBadge: document.getElementById('saTriggerStatusBadge'),

        // Toast
        toastContainer: document.getElementById('saToastContainer')
    };

    // Helper: Detect local HTTP development server (never trigger loopback requests on HTTPS/Vercel)
    function isLocalDevBackend() {
        const h = window.location.hostname;
        const isLocal = h === 'localhost' ||
                        h === '127.0.0.1' ||
                        h === '[::1]' ||
                        /^192\.168\./.test(h) ||
                        /^10\./.test(h) ||
                        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) ||
                        window.location.port === '8000';
        return isLocal && window.location.protocol !== 'https:';
    }

    // Helper: Base API URL (local dev only)
    function getApiBase() {
        if (window.location.port === '8000') return '/api';
        const host = window.location.hostname || '127.0.0.1';
        return `http://${host}:8000/api`;
    }

    // Helper: Request headers with Bearer token
    function getAuthHeaders() {
        const token = localStorage.getItem('urbanscope_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = 'Bearer ' + token;
        }
        return headers;
    }

    // Helper: Normalize account role ('client' & 'user' -> 'user')
    function normalizeRole(role, email) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (cleanEmail === 'urbanscope.cvsu@gmail.com') return 'superadmin';
        const r = String(role || '').trim().toLowerCase();
        if (r === 'superadmin') return 'superadmin';
        if (r === 'admin' || r === 'agent') return 'admin';
        if (cleanEmail === 'admin.realestate@gmail.com' || cleanEmail === 'miriamalobren@gmail.com' || cleanEmail === 'miriam@gmail.com') return 'admin';
        return 'user';
    }

    // Toast Notification
    function showToast(message, isError = false) {
        if (!elements.toastContainer) return;
        const toast = document.createElement('div');
        const iconSvg = isError
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        toast.innerHTML = iconSvg + ' ' + escapeHtml(message);
        elements.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3600);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            return dateStr;
        }
    }

    // Clock
    function startClock() {
        function tick() {
            if (!elements.liveTime) return;
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-US', { hour12: false }) + ' GMT+8';
            elements.liveTime.querySelector('.time-text').textContent = timeStr;
        }
        tick();
        setInterval(tick, 1000);
    }

    // ==============================================================
    // AUTH & ROLE VERIFICATION
    // ==============================================================
    async function verifySuperadminAccess() {
        try {
            // First check local session
            let user = null;
            if (typeof apiGetCurrentUser === 'function') {
                user = await apiGetCurrentUser();
            }

            if (!user) {
                const storedUser = localStorage.getItem('urbanscope_user') || localStorage.getItem('adminUser');
                if (storedUser) {
                    user = JSON.parse(storedUser);
                }
            }

            // Verify with FastAPI backend /api/auth/me only when running on local HTTP dev host
            if (isLocalDevBackend()) {
                try {
                    const res = await fetch(`${getApiBase()}/auth/me`, {
                        headers: getAuthHeaders(),
                        credentials: 'include'
                    });
                    if (res.ok) {
                        user = await res.json();
                    }
                } catch (e) {}
            }

            if (!user) {
                window.location.href = '../auth/login.html?redirect=pages/superadmin/dashboard.html';
                return false;
            }

            const cleanEmail = (user.email || '').trim().toLowerCase();
            const role = normalizeRole(user.role, cleanEmail);

            // Strict check: only urbanscope.cvsu@gmail.com with superadmin role
            if (cleanEmail !== 'urbanscope.cvsu@gmail.com' || role !== 'superadmin') {
                alert('Access Restricted: Exclusive Superadministrator access required.');
                window.location.href = '../admin/dashboard.html';
                return false;
            }

            currentSuperadmin = user;

            if (elements.adminName) elements.adminName.textContent = user.full_name || 'Superadmin CVSU';
            if (elements.adminEmail) elements.adminEmail.textContent = user.email;

            return true;
        } catch (err) {
            console.error('Superadmin verification error:', err);
            window.location.href = '../auth/login.html';
            return false;
        }
    }

    // ==============================================================
    // DATA LOADERS
    // ==============================================================

    // 1. Overview KPIs
    async function loadOverview() {
        try {
            let data = null;
            if (typeof apiGetSuperadminOverview === 'function') {
                data = await apiGetSuperadminOverview();
            } else if (isLocalDevBackend()) {
                const res = await fetch(`${getApiBase()}/superadmin/overview`, {
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                if (res.ok) data = await res.json();
            }

            if (data && data.metrics) {
                const m = data.metrics;
                const superadminCount = Number(m.superadmins ?? 1);
                const adminCount = Number(m.admins ?? 1);
                const clientCount = Number(m.regular_users ?? 0);
                const privilegedCount = superadminCount + adminCount;

                if (elements.kpiTotalUsers) elements.kpiTotalUsers.textContent = m.total_users ?? '--';
                if (elements.kpiUsersBreakdown) {
                    elements.kpiUsersBreakdown.textContent = `${superadminCount} Superadmin · ${adminCount} ${adminCount === 1 ? 'Admin' : 'Admins'} · ${clientCount} ${clientCount === 1 ? 'Client' : 'Clients'}`;
                }
                if (elements.kpiPrivilegedAccounts) elements.kpiPrivilegedAccounts.textContent = privilegedCount;
                if (elements.kpiPrivilegedBreakdown) {
                    elements.kpiPrivilegedBreakdown.textContent = `${superadminCount} Superadmin · ${adminCount} ${adminCount === 1 ? 'Admin' : 'Admins'}`;
                }

                const isCloudEngine = data.engine === 'supabase';
                if (elements.kpiDbSize) elements.kpiDbSize.textContent = `${m.db_size_kb || 0} KB`;
                if (elements.kpiDbSub) {
                    elements.kpiDbSub.textContent = isCloudEngine ? 'Supabase PostgreSQL Cloud' : 'SQLite 3 Persistent File';
                }
                if (elements.diagDbSize) elements.diagDbSize.textContent = `${m.db_size_kb || 0} KB`;
                if (elements.diagDbLocation) {
                    elements.diagDbLocation.textContent = isCloudEngine ? 'supabase.co/rest/v1 (PostgreSQL)' : 'backend/urbanscope.db';
                }
                if (elements.diagEngineEyebrow) {
                    elements.diagEngineEyebrow.textContent = isCloudEngine ? 'SUPABASE CLOUD ENGINE' : 'SQLITE ENGINE';
                }
                if (elements.saDbEngineTitle) {
                    elements.saDbEngineTitle.textContent = isCloudEngine ? 'Supabase Cloud Status' : 'SQLite Engine Status';
                }
                if (elements.saDbFileStatus) {
                    elements.saDbFileStatus.textContent = isCloudEngine
                        ? `Database: Supabase Cloud (${m.db_size_kb || 0} KB)`
                        : `Database: urbanscope.db (${m.db_size_kb || 0} KB)`;
                }

                if (elements.usersCountBadge) elements.usersCountBadge.textContent = m.total_users ?? '--';

                if (elements.saTriggerOnlineBadge) {
                    elements.saTriggerOnlineBadge.textContent = m.trigger_active ? 'Trigger Online' : 'Trigger Inactive';
                    elements.saTriggerOnlineBadge.className = m.trigger_active ? 'sa-badge-green' : 'sa-badge-gray';
                }
                if (elements.saTriggerStatusBadge) {
                    elements.saTriggerStatusBadge.textContent = m.trigger_active ? 'Trigger: Active' : 'Trigger: Inactive';
                }
            }
        } catch (err) {
            console.warn('Overview fetch notice:', err);
        }
    }

    // 1b. Real Database Integrity Check
    async function executeIntegrityCheck(silent = false) {
        try {
            if (!silent) showToast('Running database integrity checks...');
            let data = null;

            if (typeof apiRunSuperadminIntegrityCheck === 'function') {
                data = await apiRunSuperadminIntegrityCheck();
            } else if (isLocalDevBackend()) {
                const res = await fetch(`${getApiBase()}/superadmin/integrity`, {
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                if (res.ok) data = await res.json();
            }

            if (data) {
                if (elements.diagIntegrity) {
                    if (data.success) {
                        elements.diagIntegrity.className = 'sa-badge-green';
                        elements.diagIntegrity.textContent = 'OK (0 Errors)';
                    } else {
                        elements.diagIntegrity.className = 'sa-badge-red';
                        elements.diagIntegrity.textContent = data.integrity || 'Issues Found';
                    }
                }
                if (elements.diagFkViolations) {
                    elements.diagFkViolations.textContent = `${data.foreign_key_violations || 0} Violations`;
                    elements.diagFkViolations.style.color = (data.foreign_key_violations === 0) ? '#15803d' : '#b91c1c';
                }
                if (elements.diagTriggerStatus) {
                    elements.diagTriggerStatus.textContent = data.trigger_active ? 'Active & Enforcing' : 'Inactive';
                    elements.diagTriggerStatus.className = data.trigger_active ? 'sa-badge-gold' : 'sa-badge-gray';
                }
                if (elements.saTriggerOnlineBadge) {
                    elements.saTriggerOnlineBadge.textContent = data.trigger_active ? 'Trigger Online' : 'Trigger Inactive';
                    elements.saTriggerOnlineBadge.className = data.trigger_active ? 'sa-badge-green' : 'sa-badge-gray';
                }
                if (elements.saTriggerStatusBadge) {
                    elements.saTriggerStatusBadge.textContent = data.trigger_active ? 'Trigger: Active' : 'Trigger: Inactive';
                }
                if (!silent) {
                    showToast(`Database integrity check: ${data.success ? 'PASSED (0 violations)' : 'Issues detected'}.`);
                }
            } else {
                if (!silent) showToast('Unable to reach database diagnostics endpoint.', true);
            }
        } catch (err) {
            console.error('Integrity check error:', err);
            if (!silent) showToast('Failed to run integrity check.', true);
        }
    }

    // 2. Users Table
    async function loadUsers() {
        try {
            let users = null;
            if (typeof apiGetSuperadminUsers === 'function') {
                users = await apiGetSuperadminUsers();
            } else if (typeof apiGetUsers === 'function') {
                users = await apiGetUsers();
            } else if (isLocalDevBackend()) {
                const res = await fetch(`${getApiBase()}/superadmin/users`, {
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                if (res.ok) users = await res.json();
            }

            if (Array.isArray(users)) {
                allUsers = users.map(u => ({
                    ...u,
                    role: normalizeRole(u.role, u.email)
                }));
                if (elements.usersCountBadge) {
                    elements.usersCountBadge.textContent = allUsers.length;
                }
                applyUserFilters();
            } else {
                elements.usersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4" style="color:var(--sa-danger)">Unable to load user accounts.</td></tr>`;
            }
        } catch (err) {
            elements.usersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4" style="color:var(--sa-danger)">Error loading users: ${escapeHtml(err.message)}</td></tr>`;
        }
    }

    function renderUsersTable(users) {
        if (!elements.usersTableBody) return;

        if (users.length === 0) {
            elements.usersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No accounts match the current filter.</td></tr>`;
            return;
        }

        elements.usersTableBody.innerHTML = users.map(u => {
            const cleanEmail = (u.email || '').toLowerCase().trim();
            const role = normalizeRole(u.role, cleanEmail);
            const isRootSuperadmin = cleanEmail === 'urbanscope.cvsu@gmail.com';
            const isPrimaryAdmin = cleanEmail === 'admin.realestate@gmail.com' || cleanEmail === 'miriamalobren@gmail.com';
            const safeIdAttr = escapeHtml(String(u.id));

            let roleBadge = '';
            if (role === 'superadmin') {
                roleBadge = `<span class="sa-badge-gold">SUPERADMIN</span>`;
            } else if (role === 'admin') {
                roleBadge = `<span class="sa-badge-emerald">ADMIN</span>`;
            } else {
                roleBadge = `<span class="sa-badge-gray">CLIENT USER</span>`;
            }

            const initials = (u.full_name || u.email || 'U').split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase();

            // Action buttons
            let actionsHtml = '';
            if (isRootSuperadmin) {
                actionsHtml = `
                    <div class="action-btns-group">
                        <button type="button" class="btn-table-action" onclick="window.saEditUserPrompt('${safeIdAttr}')">Edit</button>
                        <span class="sa-badge-gold" title="Root account cannot be demoted">Root</span>
                    </div>`;
            } else if (isPrimaryAdmin) {
                actionsHtml = `
                    <div class="action-btns-group">
                        <button type="button" class="btn-table-action" onclick="window.saEditUserPrompt('${safeIdAttr}')">Edit</button>
                        <span class="sa-badge-emerald" title="Primary Agent Admin">Realty Admin</span>
                    </div>`;
            } else {
                // Can edit, toggle between user and admin, or delete
                const nextRole = (role === 'admin') ? 'user' : 'admin';
                const nextRoleLabel = (role === 'admin') ? 'Demote' : 'Promote';

                actionsHtml = `
                    <div class="action-btns-group">
                        <button type="button" class="btn-table-action" onclick="window.saEditUserPrompt('${safeIdAttr}')">
                            Edit
                        </button>
                        <button type="button" class="btn-table-action" onclick="window.saRoleChangePrompt('${safeIdAttr}', '${nextRole}')">
                            ${nextRoleLabel}
                        </button>
                        <button type="button" class="btn-table-action danger" onclick="window.saDeleteUserPrompt('${safeIdAttr}')">
                            Delete
                        </button>
                    </div>
                `;
            }

            return `
                <tr id="user-row-${safeIdAttr}">
                    <td><strong>#${escapeHtml(String(u.id))}</strong></td>
                    <td>
                        <div class="user-cell">
                            <div class="table-avatar">${escapeHtml(initials)}</div>
                            <div>
                                <strong>${escapeHtml(u.full_name || 'No Name Provided')}</strong>
                                <small>${escapeHtml(u.email)}</small>
                            </div>
                        </div>
                    </td>
                    <td>${escapeHtml(u.phone || '—')}</td>
                    <td>${roleBadge}</td>
                    <td>${formatDate(u.created_at)}</td>
                    <td style="text-align: right;">${actionsHtml}</td>
                </tr>
            `;
        }).join('');
    }

    // ACTIONS & MODALS
    // ==============================================================

    // Prompts
    window.saRoleChangePrompt = function (userId, arg2, arg3) {
        const matched = allUsers.find(u => String(u.id) === String(userId));
        const newRole = arg3 !== undefined ? arg3 : arg2;
        const email = arg3 !== undefined ? arg2 : (matched ? matched.email : `#${userId}`);

        pendingRoleChange = { userId, email, newRole };
        if (elements.roleChangeMessage) {
            elements.roleChangeMessage.innerHTML = `Are you sure you want to change the role of <strong>${escapeHtml(email)}</strong> to <strong>${escapeHtml(String(newRole || '').toUpperCase())}</strong>?`;
        }
        if (elements.roleChangeModal) {
            elements.roleChangeModal.hidden = false;
        }
    };

    window.saDeleteUserPrompt = async function (userId, maybeEmail) {
        const matched = allUsers.find(u => String(u.id) === String(userId));
        const email = maybeEmail || (matched ? matched.email : `#${userId}`);

        if (!confirm(`Are you sure you want to permanently delete the account for ${email}? This action cannot be undone.`)) {
            return;
        }

        try {
            let result = null;
            if (typeof apiSuperadminDeleteUser === 'function') {
                result = await apiSuperadminDeleteUser(userId, email);
            } else if (isLocalDevBackend()) {
                const res = await fetch(`${getApiBase()}/superadmin/users/${encodeURIComponent(userId)}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders(),
                    credentials: 'include'
                });
                const data = await res.json().catch(() => ({}));
                result = { success: res.ok && data.success, error: data.detail };
            }

            if (result && result.success) {
                showToast(`Account ${email} deleted successfully.`);
                await loadUsers();
                await loadOverview();
            } else {
                showToast((result && result.error) || 'Failed to delete account.', true);
            }
        } catch (err) {
            showToast('Delete error: ' + err.message, true);
        }
    };

    // Role change execution
    if (elements.btnConfirmRoleChange) {
        elements.btnConfirmRoleChange.addEventListener('click', async () => {
            if (!pendingRoleChange) return;
            const { userId, email, newRole } = pendingRoleChange;
            const btn = elements.btnConfirmRoleChange;
            btn.disabled = true;
            btn.textContent = 'Updating...';

            try {
                let result = null;
                if (typeof apiSuperadminUpdateUserRole === 'function') {
                    result = await apiSuperadminUpdateUserRole(userId, newRole, email);
                } else if (isLocalDevBackend()) {
                    const res = await fetch(`${getApiBase()}/superadmin/users/${encodeURIComponent(userId)}/role`, {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        credentials: 'include',
                        body: JSON.stringify({ role: newRole })
                    });
                    const data = await res.json().catch(() => ({}));
                    result = { success: res.ok && data.success, error: data.detail };
                }

                if (result && result.success) {
                    showToast(`Role for ${email} updated to ${newRole.toUpperCase()}.`);
                    elements.roleChangeModal.hidden = true;
                    pendingRoleChange = null;
                    await loadUsers();
                    await loadOverview();
                } else {
                    showToast((result && result.error) || 'Failed to update role.', true);
                }
            } catch (err) {
                showToast('Role update error: ' + err.message, true);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Confirm Change';
            }
        });
    }

    // Create user submission
    if (elements.createUserForm) {
        elements.createUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnSubmitCreateUser');
            btn.disabled = true;
            btn.textContent = 'Creating...';

            const payload = {
                full_name: document.getElementById('newFullName').value.trim(),
                email: document.getElementById('newEmail').value.trim(),
                phone: document.getElementById('newPhone').value.trim(),
                password: document.getElementById('newPassword').value,
                role: document.getElementById('newRole').value
            };

            try {
                let result = null;
                if (typeof apiSuperadminCreateUser === 'function') {
                    result = await apiSuperadminCreateUser(payload);
                } else if (isLocalDevBackend()) {
                    const res = await fetch(`${getApiBase()}/superadmin/users`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        credentials: 'include',
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json().catch(() => ({}));
                    result = { success: res.ok && data.success, error: data.detail };
                }

                if (result && result.success) {
                    showToast(`Account for ${payload.email} created as ${payload.role.toUpperCase()}!`);
                    elements.createUserModal.hidden = true;
                    elements.createUserForm.reset();
                    await loadUsers();
                    await loadOverview();
                } else {
                    showToast((result && result.error) || 'Failed to create account.', true);
                }
            } catch (err) {
                showToast('Create user error: ' + err.message, true);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Create Account';
            }
        });
    }

    // Modal open / close handlers
    function openCreateUserModal() {
        if (elements.createUserModal) elements.createUserModal.hidden = false;
    }

    function closeCreateUserModal() {
        if (elements.createUserModal) elements.createUserModal.hidden = true;
    }

    if (elements.btnOpenCreateUserModal) elements.btnOpenCreateUserModal.addEventListener('click', openCreateUserModal);
    if (elements.btnCreateUserFromTable) elements.btnCreateUserFromTable.addEventListener('click', openCreateUserModal);
    if (elements.btnCloseCreateUserModal) elements.btnCloseCreateUserModal.addEventListener('click', closeCreateUserModal);
    if (elements.btnCancelCreateUser) elements.btnCancelCreateUser.addEventListener('click', closeCreateUserModal);

    if (elements.btnCloseRoleModal) elements.btnCloseRoleModal.addEventListener('click', () => elements.roleChangeModal.hidden = true);
    if (elements.btnCancelRoleChange) elements.btnCancelRoleChange.addEventListener('click', () => elements.roleChangeModal.hidden = true);

    // Edit User modal logic
    const editUserForm = document.getElementById('editUserForm');
    const editModalEl = document.getElementById('editUserModal');

    window.saEditUserPrompt = function (userId) {
        const u = allUsers.find(user => String(user.id) === String(userId));
        if (!u) return;

        const cleanEmail = (u.email || '').toLowerCase().trim();
        const isRoot = cleanEmail === 'urbanscope.cvsu@gmail.com';
        const normalizedRole = normalizeRole(u.role, cleanEmail);

        document.getElementById('editUserId').value = u.id;
        document.getElementById('editFullName').value = u.full_name || '';
        document.getElementById('editEmail').value = u.email || '';
        document.getElementById('editPhone').value = u.phone || '';
        document.getElementById('editRole').value = normalizedRole;
        document.getElementById('editPassword').value = '';

        if (editUserForm) {
            editUserForm.dataset.originalEmail = u.email || '';
        }

        const emailInput = document.getElementById('editEmail');
        const roleSelect = document.getElementById('editRole');
        if (emailInput) emailInput.disabled = isRoot;
        if (roleSelect) roleSelect.disabled = isRoot;

        if (editModalEl) editModalEl.hidden = false;
    };

    if (editUserForm) {
        editUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnSubmitEditUser');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            const userId = document.getElementById('editUserId').value;
            const originalEmail = editUserForm.dataset.originalEmail || '';
            const payload = {
                full_name: document.getElementById('editFullName').value.trim(),
                email: document.getElementById('editEmail').value.trim(),
                original_email: originalEmail,
                phone: document.getElementById('editPhone').value.trim(),
                role: document.getElementById('editRole').value
            };

            const newPass = document.getElementById('editPassword').value;
            if (newPass && newPass.trim().length > 0 && newPass.trim().length < 6) {
                showToast('New password must be at least 6 characters long.', true);
                btn.disabled = false;
                btn.textContent = 'Save Changes';
                return;
            }
            if (newPass && newPass.trim().length >= 6) {
                payload.password = newPass.trim();
            }

            try {
                let result = null;
                if (typeof apiSuperadminUpdateUser === 'function') {
                    result = await apiSuperadminUpdateUser(userId, payload);
                } else if (isLocalDevBackend()) {
                    const res = await fetch(`${getApiBase()}/superadmin/users/${encodeURIComponent(userId)}`, {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        credentials: 'include',
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json().catch(() => ({}));
                    result = { success: res.ok && data.success, error: data.detail };
                }

                if (result && result.success) {
                    if (payload.email.toLowerCase() === 'urbanscope.cvsu@gmail.com' && payload.full_name) {
                        if (elements.adminName) elements.adminName.textContent = payload.full_name;
                        try {
                            const sessionRaw = localStorage.getItem('urbanscope_user');
                            if (sessionRaw) {
                                const sessionObj = JSON.parse(sessionRaw);
                                sessionObj.full_name = payload.full_name;
                                localStorage.setItem('urbanscope_user', JSON.stringify(sessionObj));
                            }
                        } catch (e) {}
                    }
                    showToast(`User ${payload.email} updated successfully!`);
                    if (editModalEl) editModalEl.hidden = true;
                    await loadUsers();
                    await loadOverview();
                } else {
                    showToast((result && result.error) || 'Failed to update user account.', true);
                }
            } catch (err) {
                showToast('Update user error: ' + err.message, true);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Save Changes';
            }
        });
    }

    const btnCloseEditUser = document.getElementById('btnCloseEditUserModal');
    const btnCancelEditUser = document.getElementById('btnCancelEditUser');
    if (btnCloseEditUser) btnCloseEditUser.addEventListener('click', () => {
        if (editModalEl) editModalEl.hidden = true;
    });
    if (btnCancelEditUser) btnCancelEditUser.addEventListener('click', () => {
        if (editModalEl) editModalEl.hidden = true;
    });

    // Backdrop click & Escape key close support for all Superadmin modals
    [elements.createUserModal, editModalEl, elements.roleChangeModal].forEach(modal => {
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.hidden = true;
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (elements.createUserModal && !elements.createUserModal.hidden) elements.createUserModal.hidden = true;
            if (editModalEl && !editModalEl.hidden) editModalEl.hidden = true;
            if (elements.roleChangeModal && !elements.roleChangeModal.hidden) elements.roleChangeModal.hidden = true;
        }
    });

    // Filter Listeners
    function applyUserFilters() {
        const query = (elements.userFilterInput ? elements.userFilterInput.value : '').toLowerCase().trim();
        const role = (elements.userRoleFilter ? elements.userRoleFilter.value : 'all').toLowerCase();

        const filtered = allUsers.filter(u => {
            const matchesQuery = !query ||
                (u.email && u.email.toLowerCase().includes(query)) ||
                (u.full_name && u.full_name.toLowerCase().includes(query)) ||
                (u.phone && u.phone.includes(query));

            const normalizedUserRole = normalizeRole(u.role, u.email);
            const matchesRole = (role === 'all') || (normalizedUserRole === role);

            return matchesQuery && matchesRole;
        });

        renderUsersTable(filtered);
    }

    if (elements.userFilterInput) elements.userFilterInput.addEventListener('input', applyUserFilters);
    if (elements.userRoleFilter) elements.userRoleFilter.addEventListener('change', applyUserFilters);

    // Tab Switching
    function switchTab(tabId) {
        elements.navItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
        });

        elements.tabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === `pane-${tabId}`);
        });

        // Close sidebar on mobile after navigating
        closeMobileSidebar();
    }

    elements.navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            if (tabId) switchTab(tabId);
        });
    });

    if (elements.btnQuickManageRoles) {
        elements.btnQuickManageRoles.addEventListener('click', () => switchTab('users'));
    }

    if (elements.btnQuickRunIntegrity) {
        elements.btnQuickRunIntegrity.addEventListener('click', () => {
            switchTab('system');
            executeIntegrityCheck(false);
        });
    }

    if (elements.btnRunIntegrity) {
        elements.btnRunIntegrity.addEventListener('click', () => {
            executeIntegrityCheck(false);
        });
    }

    if (elements.btnRefreshStats) {
        elements.btnRefreshStats.addEventListener('click', async () => {
            showToast('Refreshing live statistics from database...');
            await loadOverview();
            await loadUsers();
            await executeIntegrityCheck(true);
            showToast('Live metrics refreshed.');
        });
    }

    // Profile Dropdown
    if (elements.profileBtn && elements.profileMenu) {
        elements.profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = elements.profileBtn.getAttribute('aria-expanded') === 'true';
            elements.profileBtn.setAttribute('aria-expanded', !isExpanded);
            elements.profileMenu.hidden = isExpanded;
        });

        document.addEventListener('click', (e) => {
            if (!elements.profileBtn.contains(e.target) && !elements.profileMenu.contains(e.target)) {
                elements.profileBtn.setAttribute('aria-expanded', 'false');
                elements.profileMenu.hidden = true;
            }
        });
    }

    // Sign Out -> Proceed to shared login page with ?logout=1
    if (elements.signOutBtn) {
        elements.signOutBtn.addEventListener('click', async () => {
            if (typeof apiSignOut === 'function') {
                await apiSignOut();
            } else {
                localStorage.removeItem('urbanscope_jwt_token');
                localStorage.removeItem('urbanscope_user');
                localStorage.removeItem('adminUser');
            }
            window.location.href = '../auth/login.html?logout=1';
        });
    }

    // Responsive Mobile Drawer
    function openMobileSidebar() {
        if (elements.sidebar) elements.sidebar.classList.add('open');
        if (elements.backdrop) elements.backdrop.classList.add('active');
        if (elements.sidebarToggle) elements.sidebarToggle.setAttribute('aria-expanded', 'true');
        document.body.classList.add('sidebar-open');
    }

    function closeMobileSidebar() {
        if (elements.sidebar) elements.sidebar.classList.remove('open');
        if (elements.backdrop) elements.backdrop.classList.remove('active');
        if (elements.sidebarToggle) elements.sidebarToggle.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('sidebar-open');
    }

    if (elements.sidebarToggle) {
        elements.sidebarToggle.addEventListener('click', () => {
            if (elements.sidebar && elements.sidebar.classList.contains('open')) closeMobileSidebar();
            else openMobileSidebar();
        });
    }
    if (elements.closeSidebar) elements.closeSidebar.addEventListener('click', closeMobileSidebar);
    if (elements.backdrop) elements.backdrop.addEventListener('click', closeMobileSidebar);
    if (elements.sidebar) {
        elements.sidebar.addEventListener('click', (event) => {
            if (event.target.closest('a, .sa-nav-item')) closeMobileSidebar();
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && elements.sidebar && elements.sidebar.classList.contains('open')) {
            closeMobileSidebar();
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 960 && elements.sidebar && elements.sidebar.classList.contains('open')) {
            closeMobileSidebar();
        }
    });

    // ==============================================================
    // INITIALIZATION
    // ==============================================================
    async function init() {
        initSuperadminThemeToggle();
        startClock();

        const isAuthorized = await verifySuperadminAccess();
        if (!isAuthorized) return;

        // Load all data parallelly
        await Promise.all([
            loadOverview(),
            loadUsers(),
            executeIntegrityCheck(true)
        ]);

        // Deep linking / direct tab support via ?tab=... or #...
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const initialTab = urlParams.get('tab') || window.location.hash.replace('#', '');
            if (initialTab && ['overview', 'users', 'system'].includes(initialTab)) {
                switchTab(initialTab);
            }
            if (urlParams.get('modal') === 'create') {
                openCreateUserModal();
            }
        } catch (e) {
            console.warn('Tab deep-link parse note:', e);
        }

        // Periodic live refresh for account governance and system metrics
        const refreshActiveData = () => {
            if (document.visibilityState === 'visible') {
                const anyModalOpen = (elements.createUserModal && !elements.createUserModal.hidden) ||
                                     (editModalEl && !editModalEl.hidden) ||
                                     (elements.roleChangeModal && !elements.roleChangeModal.hidden);
                loadOverview();
                if (!anyModalOpen) {
                    loadUsers();
                }
            }
        };

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                refreshActiveData();
            }
        });

        setInterval(refreshActiveData, 15000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
