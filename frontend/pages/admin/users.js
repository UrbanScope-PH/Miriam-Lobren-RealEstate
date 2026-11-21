/**
 * UrbanScope - Admin Accounts & Role Access (RBAC) Controller
 * Full user account governance (create, edit, promote/demote role, delete) inside the Admin Portal.
 */
(function () {
    'use strict';

    let allUsers = [];
    let pendingRoleChange = null;
    let pendingDeleteUser = null;
    let isDeletingUser = false;

    const elements = {
        usersTableBody: document.getElementById('usersTableBody'),
        userFilterInput: document.getElementById('userFilterInput'),
        userRoleFilter: document.getElementById('userRoleFilter'),

        createUserModal: document.getElementById('createUserModal'),
        createUserForm: document.getElementById('createUserForm'),
        btnCreateUserFromTable: document.getElementById('btnCreateUserFromTable'),
        btnCloseCreateUserModal: document.getElementById('btnCloseCreateUserModal'),
        btnCancelCreateUser: document.getElementById('btnCancelCreateUser'),

        roleChangeModal: document.getElementById('roleChangeModal'),
        roleChangeMessage: document.getElementById('roleChangeMessage'),
        btnCloseRoleModal: document.getElementById('btnCloseRoleModal'),
        btnCancelRoleChange: document.getElementById('btnCancelRoleChange'),
        btnConfirmRoleChange: document.getElementById('btnConfirmRoleChange'),

        deleteUserModal: document.getElementById('deleteUserModal'),
        deleteUserMessage: document.getElementById('deleteUserMessage'),
        btnCloseDeleteModal: document.getElementById('btnCloseDeleteModal'),
        btnCancelDeleteUser: document.getElementById('btnCancelDeleteUser'),
        btnConfirmDeleteUser: document.getElementById('btnConfirmDeleteUser'),

        toastContainer: document.getElementById('saToastContainer')
    };

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

    function getApiBase() {
        if (window.location.port === '8000') return '/api';
        const host = window.location.hostname || '127.0.0.1';
        return `http://${host}:8000/api`;
    }

    function getAuthHeaders() {
        const token = localStorage.getItem('urbanscope_jwt_token') || localStorage.getItem('adminToken');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = 'Bearer ' + token;
        }
        return headers;
    }

    function normalizeRole(role, email) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const r = String(role || '').trim().toLowerCase();
        if (r === 'admin' || r === 'superadmin' || r === 'agent') return 'admin';
        if (
            cleanEmail === 'urbanscope.cvsu@gmail.com' ||
            cleanEmail === 'admin.realestate@gmail.com' ||
            cleanEmail === 'miriamalobren@gmail.com' ||
            cleanEmail === 'miriam@gmail.com'
        ) {
            return 'admin';
        }
        return 'user';
    }

    function showToast(message, isError = false) {
        if (!elements.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = isError ? 'sa-toast error' : 'sa-toast';
        const iconSvg = isError
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        toast.innerHTML = iconSvg + ' ' + escapeHtml(message);
        elements.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            setTimeout(() => toast.remove(), 260);
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

    async function verifyAdminAccess() {
        try {
            let user = null;
            if (typeof apiGetCurrentUser === 'function') {
                user = await apiGetCurrentUser();
            }
            if (!user) {
                const storedUser = localStorage.getItem('adminUser') || localStorage.getItem('urbanscope_user');
                if (storedUser) {
                    user = JSON.parse(storedUser);
                }
            }
            if (!user) {
                window.location.href = '../auth/login.html?redirect=pages/admin/users.html';
                return false;
            }
            const cleanEmail = (user.email || '').trim().toLowerCase();
            const role = normalizeRole(user.role, cleanEmail);
            if (role !== 'admin') {
                window.location.href = '../auth/login.html?redirect=pages/admin/users.html';
                return false;
            }
            return true;
        } catch (_) {
            window.location.href = '../auth/login.html';
            return false;
        }
    }

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
                refreshRoleFilterDropdown();
                applyUserFilters();
            } else if (elements.usersTableBody) {
                elements.usersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4" style="color:var(--danger-text)">Unable to load user accounts.</td></tr>`;
            }
        } catch (err) {
            if (elements.usersTableBody) {
                elements.usersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4" style="color:var(--danger-text)">Error loading users: ${escapeHtml(err.message)}</td></tr>`;
            }
        }
    }

    function renderUsersTable(users) {
        const mobileList = document.getElementById('usersMobileList');
        if (!elements.usersTableBody) return;

        if (users.length === 0) {
            elements.usersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No accounts match the current filter.</td></tr>`;
            if (mobileList) {
                mobileList.innerHTML = `<div class="mobile-empty-state">No accounts match the current filter.</div>`;
            }
            return;
        }

        const mobileCardsHtml = [];

        elements.usersTableBody.innerHTML = users.map(u => {
            const cleanEmail = (u.email || '').toLowerCase().trim();
            const role = normalizeRole(u.role, cleanEmail);
            const isProtectedPrimaryAdmin = (
                cleanEmail === 'urbanscope.cvsu@gmail.com' ||
                cleanEmail === 'admin.realestate@gmail.com' ||
                cleanEmail === 'miriamalobren@gmail.com' ||
                cleanEmail === 'miriam@gmail.com'
            );
            const safeIdAttr = escapeHtml(String(u.id));

            const roleBadge = role === 'admin'
                ? `<span class="sa-badge-emerald">ADMIN</span>`
                : `<span class="sa-badge-gray">CLIENT USER</span>`;

            const initials = (u.full_name || u.email || 'U')
                .split(' ')
                .filter(Boolean)
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();

            let actionsHtml = '';
            if (isProtectedPrimaryAdmin) {
                actionsHtml = `
                    <div class="action-btns-group">
                        <button type="button" class="btn-table-action" onclick="window.saEditUserPrompt('${safeIdAttr}')">Edit</button>
                        <span class="sa-badge-emerald" title="Primary Realty Admin">Realty Admin</span>
                    </div>`;
            } else {
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

            mobileCardsHtml.push(`
                <article class="mobile-data-card mobile-sa-user-card" id="user-card-${safeIdAttr}">
                    <div class="mobile-card-top">
                        <div class="mobile-sa-user-head">
                            <div class="table-avatar">${escapeHtml(initials)}</div>
                            <div class="mobile-sa-user-id">
                                <strong>${escapeHtml(u.full_name || 'No Name Provided')}</strong>
                                <small>${escapeHtml(u.email)}</small>
                            </div>
                        </div>
                        ${roleBadge}
                    </div>
                    <div class="mobile-card-meta-row">
                        <span>ID #${safeIdAttr}</span>
                        <span>${escapeHtml(u.phone || 'No phone')}</span>
                        <span>Joined ${formatDate(u.created_at)}</span>
                    </div>
                    <div class="mobile-sa-user-actions">
                        ${actionsHtml}
                    </div>
                </article>
            `);

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

        if (mobileList) {
            mobileList.innerHTML = mobileCardsHtml.join('');
        }
    }

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

    function closeDeleteUserModal(force = false) {
        if (isDeletingUser && !force) return;
        if (elements.deleteUserModal) elements.deleteUserModal.hidden = true;
        pendingDeleteUser = null;
    }

    window.saDeleteUserPrompt = function (userId, maybeEmail) {
        if (isDeletingUser) return;
        const matched = allUsers.find(u => String(u.id) === String(userId));
        const email = (matched && matched.email) || maybeEmail || `#${userId}`;

        pendingDeleteUser = { userId, email };
        if (elements.deleteUserMessage) {
            elements.deleteUserMessage.innerHTML = `Are you sure you want to permanently delete the account for <strong>${escapeHtml(email)}</strong>? All associated inquiries and client history will also be removed. This action cannot be undone.`;
        }
        if (elements.btnConfirmDeleteUser) {
            elements.btnConfirmDeleteUser.disabled = false;
            elements.btnConfirmDeleteUser.textContent = 'Delete Account';
        }
        if (elements.btnCancelDeleteUser) {
            elements.btnCancelDeleteUser.disabled = false;
        }
        if (elements.deleteUserModal) {
            elements.deleteUserModal.hidden = false;
        }
    };

    if (elements.btnCloseDeleteModal) {
        elements.btnCloseDeleteModal.addEventListener('click', () => closeDeleteUserModal());
    }
    if (elements.btnCancelDeleteUser) {
        elements.btnCancelDeleteUser.addEventListener('click', () => closeDeleteUserModal());
    }

    if (elements.btnConfirmDeleteUser) {
        elements.btnConfirmDeleteUser.addEventListener('click', async () => {
            if (!pendingDeleteUser || isDeletingUser) return;
            const { userId, email } = pendingDeleteUser;
            const btn = elements.btnConfirmDeleteUser;
            isDeletingUser = true;
            btn.disabled = true;
            btn.textContent = 'Deleting...';
            if (elements.btnCancelDeleteUser) elements.btnCancelDeleteUser.disabled = true;

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
                    closeDeleteUserModal(true);
                    allUsers = allUsers.filter(u => {
                        const sameId = String(u.id) === String(userId);
                        const sameEmail = email && u.email && String(u.email).toLowerCase() === String(email).toLowerCase();
                        return !sameId && !sameEmail;
                    });
                    applyUserFilters();
                    showToast(`Account ${email} and associated inquiry history deleted successfully.`);
                    await loadUsers();
                } else {
                    showToast((result && result.error) || 'Failed to delete account.', true);
                }
            } catch (err) {
                showToast('Delete error: ' + err.message, true);
            } finally {
                isDeletingUser = false;
                btn.disabled = false;
                btn.textContent = 'Delete Account';
                if (elements.btnCancelDeleteUser) elements.btnCancelDeleteUser.disabled = false;
            }
        });
    }

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

    function openCreateUserModal() {
        if (elements.createUserModal) elements.createUserModal.hidden = false;
    }

    function closeCreateUserModal() {
        if (elements.createUserModal) elements.createUserModal.hidden = true;
    }

    if (elements.btnCreateUserFromTable) elements.btnCreateUserFromTable.addEventListener('click', openCreateUserModal);
    if (elements.btnCloseCreateUserModal) elements.btnCloseCreateUserModal.addEventListener('click', closeCreateUserModal);
    if (elements.btnCancelCreateUser) elements.btnCancelCreateUser.addEventListener('click', closeCreateUserModal);

    if (elements.btnCloseRoleModal) elements.btnCloseRoleModal.addEventListener('click', () => { elements.roleChangeModal.hidden = true; });
    if (elements.btnCancelRoleChange) elements.btnCancelRoleChange.addEventListener('click', () => { elements.roleChangeModal.hidden = true; });

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
            if (newPass && newPass.trim().length > 0 && newPass.trim().length < 8) {
                showToast('New password must be at least 8 characters long.', true);
                btn.disabled = false;
                btn.textContent = 'Save Changes';
                return;
            }
            if (newPass && newPass.trim().length >= 8) {
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
                    showToast(`User ${payload.email} updated successfully!`);
                    if (editModalEl) editModalEl.hidden = true;
                    await loadUsers();
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

    [elements.createUserModal, editModalEl, elements.roleChangeModal, elements.deleteUserModal].forEach(modal => {
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target !== modal) return;
            if (modal === elements.deleteUserModal) {
                closeDeleteUserModal();
            } else {
                modal.hidden = true;
            }
        });
    });

    // Custom Role Filter Dropdown UI
    let roleFilterMenuEl = null;
    let roleFilterTriggerBtn = null;
    const roleFilterWrap = document.getElementById('userRoleFilterWrap');

    function getRoleDotClass(val) {
        if (val === 'admin') return 'dot-admin';
        if (val === 'user') return 'dot-user';
        return 'dot-all';
    }

    function getRoleCount(val) {
        if (!Array.isArray(allUsers)) return 0;
        if (val === 'all') return allUsers.length;
        return allUsers.filter(u => normalizeRole(u.role, u.email) === val).length;
    }

    function closeRoleFilterMenu() {
        if (!roleFilterMenuEl || !roleFilterTriggerBtn || !roleFilterWrap) return;
        roleFilterMenuEl.hidden = true;
        roleFilterWrap.classList.remove('is-open');
        roleFilterTriggerBtn.setAttribute('aria-expanded', 'false');
    }

    function refreshRoleFilterDropdown() {
        if (!elements.userRoleFilter || !roleFilterWrap) return;
        if (!roleFilterTriggerBtn) {
            roleFilterWrap.classList.add('has-custom-select');
            roleFilterTriggerBtn = document.createElement('button');
            roleFilterTriggerBtn.type = 'button';
            roleFilterTriggerBtn.className = 'role-filter-trigger';
            roleFilterTriggerBtn.setAttribute('aria-haspopup', 'listbox');
            roleFilterTriggerBtn.setAttribute('aria-expanded', 'false');

            roleFilterMenuEl = document.createElement('div');
            roleFilterMenuEl.className = 'role-filter-menu';
            roleFilterMenuEl.setAttribute('role', 'listbox');
            roleFilterMenuEl.setAttribute('aria-label', 'Filter accounts by role');
            roleFilterMenuEl.hidden = true;

            roleFilterWrap.appendChild(roleFilterTriggerBtn);
            roleFilterWrap.appendChild(roleFilterMenuEl);

            roleFilterTriggerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const willOpen = roleFilterMenuEl.hidden;
                if (willOpen) {
                    refreshRoleFilterDropdown();
                    roleFilterMenuEl.hidden = false;
                    roleFilterWrap.classList.add('is-open');
                    roleFilterTriggerBtn.setAttribute('aria-expanded', 'true');
                } else {
                    closeRoleFilterMenu();
                }
            });

            roleFilterMenuEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const optBtn = e.target.closest('.role-filter-option[data-value]');
                if (!optBtn) return;
                const nextVal = optBtn.getAttribute('data-value') || 'all';
                elements.userRoleFilter.value = nextVal;
                refreshRoleFilterDropdown();
                closeRoleFilterMenu();
                applyUserFilters();
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('#userRoleFilterWrap')) {
                    closeRoleFilterMenu();
                }
            });
        }

        const selectEl = elements.userRoleFilter;
        const selectedOption = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
        const selectedVal = selectEl.value || 'all';
        const selectedLabel = selectedOption ? selectedOption.textContent.trim() : 'All Roles';

        roleFilterTriggerBtn.innerHTML = `
            <span class="role-trigger-left">
                <span class="role-filter-dot ${getRoleDotClass(selectedVal)}" aria-hidden="true"></span>
                <span class="role-trigger-label">${escapeHtml(selectedLabel)}</span>
            </span>
            <svg class="role-trigger-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        `;
        roleFilterTriggerBtn.classList.toggle('is-filtered', selectedVal !== 'all');

        roleFilterMenuEl.innerHTML = Array.from(selectEl.options).map((opt) => {
            const val = opt.value;
            const label = opt.textContent.trim();
            const isSelected = val === selectedVal;
            const count = getRoleCount(val);
            return `
                <button type="button"
                        class="role-filter-option${isSelected ? ' is-selected' : ''}"
                        role="option"
                        aria-selected="${isSelected ? 'true' : 'false'}"
                        data-value="${escapeHtml(val)}">
                    <span class="role-option-left">
                        <span class="role-filter-dot ${getRoleDotClass(val)}" aria-hidden="true"></span>
                        <span class="role-option-label">${escapeHtml(label)}</span>
                    </span>
                    <span class="role-option-right">
                        <span class="role-option-count">${count}</span>
                        <svg class="role-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </span>
                </button>
            `;
        }).join('');
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeRoleFilterMenu();
            if (elements.createUserModal && !elements.createUserModal.hidden) elements.createUserModal.hidden = true;
            if (editModalEl && !editModalEl.hidden) editModalEl.hidden = true;
            if (elements.roleChangeModal && !elements.roleChangeModal.hidden) elements.roleChangeModal.hidden = true;
            if (elements.deleteUserModal && !elements.deleteUserModal.hidden) closeDeleteUserModal();
        }
    });

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
    if (elements.userRoleFilter) elements.userRoleFilter.addEventListener('change', () => {
        refreshRoleFilterDropdown();
        applyUserFilters();
    });

    refreshRoleFilterDropdown();

    async function init() {
        const isAuthorized = await verifyAdminAccess();
        if (!isAuthorized) return;

        await loadUsers();

        try {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('modal') === 'create') {
                openCreateUserModal();
            }
        } catch (_) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
