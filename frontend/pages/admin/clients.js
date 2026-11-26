// clients.js - Admin Client Inquiries Management
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth check
    const token = localStorage.getItem('adminToken') || localStorage.getItem('supabase_token');
    const role = localStorage.getItem('user_role') || (localStorage.getItem('adminUser') ? 'admin' : '');
    if (!token && !localStorage.getItem('adminUser')) {
        window.location.href = '../auth/login.html';
        return;
    }

    // 2. Set Admin profile display
    try {
        const storedAdmin = JSON.parse(localStorage.getItem('adminUser') || '{}');
        const adminNameDisplay = document.getElementById('adminNameDisplay');
        if (adminNameDisplay && storedAdmin.name) {
            adminNameDisplay.textContent = storedAdmin.name;
        }
    } catch (_) { }

    // UI Toggles (sidebar & profile dropdown) handled by admin-shell.js

    // Sign out handler
    document.querySelectorAll('.profile-signout, .logout-link').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminUser');
            localStorage.removeItem('supabase_token');
            if (typeof apiSignOut === 'function') apiSignOut();
            window.location.href = '../auth/login.html?logout=1';
        });
    });

    // 4. State & Elements
    let inquiries = [];
    let propertiesMap = {};
    let clientsLoadPromise = null;
    let propertiesLoaded = false;
    let lastClientsVisibilityAt = 0;
    let activeFilter = 'All';
    let searchQuery = '';

    const tableBody = document.getElementById('clientsTableBody');
    const searchInput = document.getElementById('clientSearchInput');
    const statusTabs = document.getElementById('statusTabs');
    const statTotal = document.getElementById('statTotalInquiries');
    const statPending = document.getElementById('statPendingInquiries');
    const statApproved = document.getElementById('statApprovedInquiries');
    const statCompleted = document.getElementById('statCompletedInquiries');
    const statCancelled = document.getElementById('statCancelledInquiries');
    const notifCount = document.getElementById('topbarInquiryCount');

    // Parse URL parameter for status filter
    const urlParams = new URLSearchParams(window.location.search);
    const initialStatus = urlParams.get('status');
    if (initialStatus) {
        activeFilter = initialStatus;
        document.querySelectorAll('.status-tab-btn').forEach(btn => {
            if (btn.getAttribute('data-status') === initialStatus) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // Modal elements
    const modal = document.getElementById('inquiryModal');
    const modalContent = document.getElementById('modalContent');
    const closeModalBtn = document.getElementById('closeModalBtn');

    function closeInquiryDetailsModal() {
        if (!modal) return;
        modal.classList.remove('open');
        window.setTimeout(() => {
            if (!modal.classList.contains('open')) modal.hidden = true;
        }, 220);
        document.body.style.overflow = '';
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeInquiryDetailsModal);
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeInquiryDetailsModal();
        });
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal && modal.classList.contains('open')) {
            closeInquiryDetailsModal();
        }
    });

    // 5. Fetch Properties & Inquiries
    function loadData(options = {}) {
        if (clientsLoadPromise) return clientsLoadPromise;
        const run = _loadDataInner(options).finally(() => {
            if (clientsLoadPromise === run) clientsLoadPromise = null;
        });
        clientsLoadPromise = run;
        return run;
    }

    async function _loadDataInner(options = {}) {
        try {
            if (inquiries.length === 0 && window.UrbanSkeleton) {
                if (tableBody) tableBody.innerHTML = window.UrbanSkeleton.tableRows(5, 'clients');
                const mobileList = document.getElementById('clientsMobileList');
                if (mobileList) mobileList.innerHTML = window.UrbanSkeleton.mobileCards(3, 'clients');
            }
            // Load lightweight property id/title lookup once (or on propertiesUpdated)
            if ((!propertiesLoaded || (options && options.forceProperties)) && typeof apiGetProperties === 'function') {
                const props = await apiGetProperties({ columns: 'id,title' });
                if (Array.isArray(props)) {
                    props.forEach(p => {
                        propertiesMap[p.id] = p.title || p.property_name || `Property #${p.id}`;
                    });
                    propertiesLoaded = true;
                }
            }

            // Load inquiries
            const forceInquiries = Boolean(options && options.forceInquiries);
            let data = (typeof apiGetInquiries === 'function') ? await apiGetInquiries(forceInquiries) : null;
            if (!data || !Array.isArray(data)) {
                data = JSON.parse(localStorage.getItem('inquiries') || '[]');
            }
            inquiries = data;

            updateKPIs();
            renderTable();
        } catch (err) {
            console.error('Error loading inquiries:', err);
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger-text); padding: 30px;">Failed to load inquiries. Please check network connection.</td></tr>`;
        }
    }

    function updateKPIs() {
        const total = inquiries.length;
        const pending = inquiries.filter(i => {
            const s = (i.status || '').toLowerCase().trim();
            return s === 'under review' || s === 'pending' || !s;
        }).length;
        const approved = inquiries.filter(i => (i.status || '').toLowerCase().trim() === 'approved').length;
        const completed = inquiries.filter(i => (i.status || '').toLowerCase().trim() === 'completed').length;
        const cancelled = inquiries.filter(i => {
            const s = (i.status || '').toLowerCase().trim();
            return s === 'cancelled' || s === 'canceled' || s === 'rejected';
        }).length;

        if (statTotal) statTotal.textContent = total;
        if (statPending) statPending.textContent = pending;
        if (statApproved) statApproved.textContent = approved;
        if (statCompleted) statCompleted.textContent = completed;
        if (statCancelled) statCancelled.textContent = cancelled;
        if (typeof window.loadAdminNotifications === 'function') {
            window.loadAdminNotifications(inquiries);
        }
    }

    function getNormalizedStatus(status) {
        const s = (status || '').toLowerCase().trim();
        if (s === 'approved') return 'Approved';
        if (s === 'completed') return 'Completed';
        if (s === 'cancelled') return 'Cancelled';
        return 'Under Review';
    }

    function getBadgeClass(normStatus) {
        if (normStatus === 'Approved') return 'approved';
        if (normStatus === 'Completed') return 'completed';
        if (normStatus === 'Cancelled') return 'cancelled';
        return 'review';
    }

    function formatInquiryLabel(rawTitle) {
        if (typeof window.formatInquiryPropertyLabel === 'function') {
            return window.formatInquiryPropertyLabel(rawTitle);
        }
        const clean = String(rawTitle || '').trim();
        if (!clean) return 'General Inquiry';
        if (/^(general\s+(consultation|inquiry|question)|consultation\s*:)/i.test(clean)) {
            return clean;
        }
        if (/^(specific\s+)?property\s+inquiry$/i.test(clean)) {
            return 'Specific Property Inquiry';
        }
        const prefixedMatch = clean.match(/^specific\s+property\s+inquiry\s*:\s*(.*)$/i);
        if (prefixedMatch) {
            const rest = prefixedMatch[1].trim();
            return rest ? `Specific Property Inquiry: ${rest}` : 'Specific Property Inquiry';
        }
        return `Specific Property Inquiry: ${clean}`;
    }

    function formatInquiryDisplayParts(rawTitle) {
        const formatted = formatInquiryLabel(rawTitle);
        const colonIdx = formatted.indexOf(':');
        if (colonIdx === -1) {
            return { primary: formatted, secondary: '' };
        }
        const primary = formatted.slice(0, colonIdx).trim();
        const secondary = formatted
            .slice(colonIdx + 1)
            .trim()
            .replace(/^Schedule\s+a\s+Free\s+/i, '')
            .replace(/\s+Assistance$/i, '');
        return {
            primary: primary || formatted,
            secondary: secondary || ''
        };
    }

    function renderTable() {
        const mobileList = document.getElementById('clientsMobileList');
        if (!tableBody) return;

        let filtered = inquiries.filter(inq => {
            const normStatus = getNormalizedStatus(inq.status);
            if (activeFilter !== 'All' && normStatus !== activeFilter) {
                return false;
            }

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const name = (inq.client_name || inq.name || '').toLowerCase();
                const email = (inq.email || inq.client_email || '').toLowerCase();
                const phone = (inq.phone || inq.client_phone || inq.contact_number || '').toLowerCase();
                const rawProp = inq.property_title || propertiesMap[inq.property_id] || (inq.property_id ? `Property #${inq.property_id}` : '');
                const prop = formatInquiryLabel(rawProp).toLowerCase();
                const msg = (inq.message || '').toLowerCase();
                return name.includes(q) || email.includes(q) || phone.includes(q) || prop.includes(q) || msg.includes(q);
            }
            return true;
        });

        if (filtered.length === 0) {
            closeStatusMenu(false);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 48px; color: var(--text-muted);">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 12px; display: block; opacity: 0.5;">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        No client inquiries found matching your criteria.
                    </td>
                </tr>
            `;
            if (mobileList) {
                mobileList.innerHTML = `<div class="mobile-empty-state">No client inquiries found matching your criteria.</div>`;
            }
            return;
        }

        tableBody.querySelectorAll && closeStatusMenu(false);
        const mobileCards = [];

        tableBody.innerHTML = filtered.map(inq => {
            const safeId = escapeHtml(String(inq.id ?? ''));
            const name = inq.client_name || inq.name || 'Anonymous Client';
            const email = inq.email || inq.client_email || 'No email provided';
            const phone = inq.phone || inq.client_phone || inq.contact_number || 'N/A';
            const cleanTel = phone && phone !== 'N/A' ? String(phone).replace(/[^\d+]/g, '') : '';
            const rawPropTitle = inq.property_title || propertiesMap[inq.property_id] || (inq.property_id ? `Property #${inq.property_id}` : '');
            const propParts = formatInquiryDisplayParts(rawPropTitle);
            const normStatus = getNormalizedStatus(inq.status);
            const safeStatus = escapeHtml(normStatus);
            const safeBadgeClass = escapeHtml(getBadgeClass(normStatus));
            const dateStr = escapeHtml(inq.created_at ? new Date(inq.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent');

            mobileCards.push(`
                <article class="mobile-data-card mobile-client-card" data-id="${safeId}">
                    <div class="mobile-card-top">
                        <div class="mobile-card-title-block">
                            <strong>${escapeHtml(name)}</strong>
                            <small>${escapeHtml(email)}</small>
                        </div>
                        <span class="mobile-card-date">${dateStr}</span>
                    </div>
                    <div class="mobile-card-detail">
                        <strong>${escapeHtml(propParts.primary)}</strong>
                        ${propParts.secondary ? `<small>${escapeHtml(propParts.secondary)}</small>` : ''}
                    </div>
                    <div class="mobile-card-phone-row">
                        ${cleanTel
                            ? `<a href="tel:${escapeHtml(cleanTel)}" class="mobile-card-phone-link">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                <span>${escapeHtml(phone)}</span>
                               </a>`
                            : `<span class="mobile-card-phone-muted">No phone provided</span>`}
                    </div>
                    <div class="mobile-card-actions-bar">
                        <button type="button"
                                class="status-select-pill ${safeBadgeClass}"
                                id="mobile-badge-${safeId}"
                                data-id="${safeId}"
                                data-status="${safeStatus}"
                                data-client-action="toggle-menu"
                                aria-haspopup="listbox"
                                aria-expanded="false"
                                aria-label="Change inquiry status for ${escapeHtml(name)} (currently ${safeStatus})">
                            <span class="status-pill-dot" aria-hidden="true"></span>
                            <span class="status-pill-label">${safeStatus}</span>
                            <svg class="status-select-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <button type="button" class="action-btn view" data-id="${safeId}" data-client-action="view">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            <span>View</span>
                        </button>
                    </div>
                </article>
            `);

            return `
                <tr data-id="${safeId}">
                    <td class="client-name-cell">
                        <strong>${escapeHtml(name)}</strong>
                        <small>${escapeHtml(email)}</small>
                    </td>
                    <td>
                        <span class="client-phone-text">${escapeHtml(phone)}</span>
                    </td>
                    <td class="property-interest-cell">
                        <strong>${escapeHtml(propParts.primary)}</strong>
                        ${propParts.secondary ? `<small>${escapeHtml(propParts.secondary)}</small>` : ''}
                    </td>
                    <td>
                        <span style="color: var(--text-muted); font-size: 0.85rem;">${dateStr}</span>
                    </td>
                    <td>
                        <div class="status-cell-wrapper">
                            <button type="button"
                                    class="status-select-pill ${safeBadgeClass}"
                                    id="badge-${safeId}"
                                    data-id="${safeId}"
                                    data-status="${safeStatus}"
                                    data-client-action="toggle-menu"
                                    aria-haspopup="listbox"
                                    aria-expanded="false"
                                    aria-label="Change inquiry status for ${escapeHtml(name)} (currently ${safeStatus})">
                                <span class="status-pill-dot" aria-hidden="true"></span>
                                <span class="status-pill-label">${safeStatus}</span>
                                <svg class="status-select-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </button>
                        </div>
                    </td>
                    <td>
                        <button class="action-btn view" type="button" data-id="${safeId}" data-client-action="view">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            View
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        if (mobileList) {
            mobileList.innerHTML = mobileCards.join('');
        }
        [tableBody, mobileList].forEach(container => {
            if (container && !container.dataset.clientActionsBound) {
                container.dataset.clientActionsBound = '1';
                container.addEventListener('click', (event) => {
                    const btn = event.target.closest('button[data-client-action]');
                    if (!btn) return;
                    const action = btn.getAttribute('data-client-action');
                    const rawId = btn.getAttribute('data-id');
                    if (action === 'toggle-menu' && typeof window.toggleStatusMenu === 'function') {
                        window.toggleStatusMenu(event, rawId);
                    } else if (action === 'view' && typeof window.viewInquiryDetails === 'function') {
                        window.viewInquiryDetails(rawId);
                    }
                });
            }
        });
    }

    const STATUS_OPTIONS = [
        { value: 'Under Review', badgeClass: 'review' },
        { value: 'Approved', badgeClass: 'approved' },
        { value: 'Completed', badgeClass: 'completed' },
        { value: 'Cancelled', badgeClass: 'cancelled' }
    ];

    let activeMenuId = null;
    let statusMenuEl = null;

    function ensureStatusMenu() {
        if (statusMenuEl) return statusMenuEl;
        statusMenuEl = document.createElement('div');
        statusMenuEl.id = 'statusFloatingMenu';
        statusMenuEl.className = 'status-dropdown-menu';
        statusMenuEl.setAttribute('role', 'listbox');
        statusMenuEl.setAttribute('aria-label', 'Select inquiry status');
        statusMenuEl.hidden = true;
        document.body.appendChild(statusMenuEl);

        statusMenuEl.addEventListener('click', async (e) => {
            const optionBtn = e.target.closest('.status-dropdown-option');
            if (!optionBtn || activeMenuId == null) return;
            const targetId = activeMenuId;
            const nextStatus = optionBtn.getAttribute('data-value');
            closeStatusMenu(true);
            if (nextStatus) {
                await window.handleStatusChange({ target: { value: nextStatus } }, targetId);
            }
        });

        return statusMenuEl;
    }

    function closeStatusMenu(restoreFocus = false) {
        const prevOpenTrigger = document.querySelector('.status-select-pill.is-open');
        if (prevOpenTrigger) {
            prevOpenTrigger.classList.remove('is-open');
            prevOpenTrigger.setAttribute('aria-expanded', 'false');
            if (restoreFocus) {
                try { prevOpenTrigger.focus(); } catch (_) {}
            }
        }
        if (statusMenuEl) {
            statusMenuEl.hidden = true;
            statusMenuEl.classList.remove('open-upward');
            statusMenuEl.style.visibility = '';
        }
        activeMenuId = null;
    }

    window.toggleStatusMenu = (event, inquiryId) => {
        if (event) event.stopPropagation();
        const menu = ensureStatusMenu();
        const targetId = String(inquiryId);
        const trigger =
            (event && event.target && typeof event.target.closest === 'function' && event.target.closest('.status-select-pill')) ||
            (event && event.currentTarget && event.currentTarget.classList && event.currentTarget.classList.contains('status-select-pill') ? event.currentTarget : null) ||
            document.getElementById(`badge-${targetId}`) ||
            document.getElementById(`mobile-badge-${targetId}`);
        if (!trigger) return;

        if (!menu.hidden && activeMenuId === targetId) {
            closeStatusMenu(false);
            return;
        }

        closeStatusMenu(false);
        activeMenuId = targetId;

        const found = inquiries.find(i => String(i.id) === targetId);
        const currentStatus = getNormalizedStatus(
            (found && found.status) || trigger.getAttribute('data-status') || ''
        );

        trigger.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');

        menu.innerHTML = `
            <div class="status-dropdown-header">Update Status</div>
            ${STATUS_OPTIONS.map(opt => {
                const selected = opt.value === currentStatus;
                return `
                    <button type="button"
                            class="status-dropdown-option ${opt.badgeClass}${selected ? ' is-selected' : ''}"
                            role="option"
                            aria-selected="${selected ? 'true' : 'false'}"
                            data-value="${opt.value}">
                        <span class="status-option-left">
                            <span class="status-menu-dot" aria-hidden="true"></span>
                            <span class="status-option-text">${opt.value}</span>
                        </span>
                        <svg class="status-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                `;
            }).join('')}
        `;

        menu.style.visibility = 'hidden';
        menu.hidden = false;

        const rect = trigger.getBoundingClientRect();
        const cssZoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
        const layoutRatio = trigger.offsetWidth > 0 ? (rect.width / trigger.offsetWidth) : 1;
        const zoomScale = (cssZoom !== 1 && Math.abs(layoutRatio - cssZoom) < 0.1) ? cssZoom : 1;

        const tLeft = rect.left / zoomScale;
        const tTop = rect.top / zoomScale;
        const tBottom = rect.bottom / zoomScale;
        const tWidth = rect.width / zoomScale;
        const vpWidth = (document.documentElement.clientWidth || (window.innerWidth / zoomScale));
        const vpHeight = (window.innerHeight / zoomScale);

        const menuWidth = Math.min(200, Math.max(Math.round(tWidth), 184));
        menu.style.width = `${menuWidth}px`;

        const menuHeight = menu.offsetHeight || 200;
        const openUpward = (tBottom + 6 + menuHeight > vpHeight - 10) && (tTop > menuHeight + 16);
        const left = Math.min(Math.max(10, tLeft), vpWidth - menuWidth - 10);
        const rawTop = openUpward ? (tTop - menuHeight - 6) : (tBottom + 6);
        const top = Math.max(10, Math.min(rawTop, vpHeight - menuHeight - 10));

        menu.classList.toggle('open-upward', openUpward);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.visibility = '';
    };

    document.addEventListener('click', (e) => {
        if (!statusMenuEl || statusMenuEl.hidden) return;
        if (e.target.closest('#statusFloatingMenu') || e.target.closest('.status-select-pill')) return;
        closeStatusMenu(false);
    });

    document.addEventListener('keydown', (e) => {
        if (!statusMenuEl || statusMenuEl.hidden) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeStatusMenu(true);
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const opts = Array.from(statusMenuEl.querySelectorAll('.status-dropdown-option'));
            if (!opts.length) return;
            const currentIdx = opts.indexOf(document.activeElement);
            let nextIdx;
            if (currentIdx === -1) {
                nextIdx = e.key === 'ArrowDown' ? 0 : opts.length - 1;
            } else {
                nextIdx = e.key === 'ArrowDown'
                    ? (currentIdx + 1) % opts.length
                    : (currentIdx - 1 + opts.length) % opts.length;
            }
            opts[nextIdx].focus();
        }
    });

    window.addEventListener('scroll', (e) => {
        if (!statusMenuEl || statusMenuEl.hidden) return;
        if (e.target && e.target.id === 'statusFloatingMenu') return;
        closeStatusMenu(false);
    }, true);

    window.addEventListener('resize', () => {
        if (statusMenuEl && !statusMenuEl.hidden) closeStatusMenu(false);
    });

    // Status change handler
    window.handleStatusChange = async (event, inquiryId) => {
        const newStatus = typeof event === 'string' ? event : (event && event.target ? event.target.value : '');
        if (!newStatus) return;
        const targets = [
            document.getElementById(`badge-${inquiryId}`),
            document.getElementById(`mobile-badge-${inquiryId}`)
        ].filter(Boolean);
        targets.forEach(targetBadge => {
            if (targetBadge.classList.contains('status-select-pill')) {
                const isOpen = targetBadge.classList.contains('is-open');
                targetBadge.className = `status-select-pill ${getBadgeClass(newStatus)}${isOpen ? ' is-open' : ''}`;
                targetBadge.setAttribute('data-status', newStatus);
                const labelEl = targetBadge.querySelector('.status-pill-label');
                if (labelEl) labelEl.textContent = newStatus;
                const currentAria = targetBadge.getAttribute('aria-label') || '';
                if (currentAria.includes('(currently ')) {
                    targetBadge.setAttribute('aria-label', currentAria.replace(/\(currently [^)]*\)$/, `(currently ${newStatus})`));
                }
            } else {
                targetBadge.textContent = newStatus;
                targetBadge.className = `status-badge ${getBadgeClass(newStatus)}`;
            }
        });

        // Update local array
        const found = inquiries.find(i => String(i.id) === String(inquiryId));
        if (found) {
            found.status = newStatus;
            found.cancelled_by = String(newStatus || '').toLowerCase().trim() === 'cancelled' ? 'admin' : null;
        }
        updateKPIs();

        if (String(newStatus || '').toLowerCase().trim() === 'approved') {
            try {
                const existingRead = JSON.parse(localStorage.getItem("admin_notifs_read_ids") || "[]");
                const readSet = new Set(Array.isArray(existingRead) ? existingRead.map(String) : []);
                readSet.add(String(inquiryId));
                readSet.add(`new_inquiry_${inquiryId}`);
                readSet.add(`approved_${inquiryId}`);
                localStorage.setItem("admin_notifs_read_ids", JSON.stringify(Array.from(readSet)));
            } catch (_) {}
        }

        // Update DB
        try {
            if (typeof apiUpdateInquiryStatus === 'function') {
                await apiUpdateInquiryStatus(inquiryId, newStatus);
            }
        } catch (err) {
            console.error('Failed to update status in database:', err);
        }
    };

    // View inquiry details modal handler
    window.viewInquiryDetails = (inquiryId) => {
        const inq = inquiries.find(i => String(i.id) === String(inquiryId));
        if (!inq || !modal || !modalContent) return;

        const clientName = inq.client_name || inq.name || 'Anonymous Client';
        const email = inq.email || inq.client_email || '';
        const phone = inq.phone || inq.client_phone || inq.contact_number || '';
        const rawPropTitle = inq.property_title || propertiesMap[inq.property_id] || (inq.property_id ? `Property #${inq.property_id}` : '');
        const propertyTitle = formatInquiryLabel(rawPropTitle);
        const parsedSchedule = parseInquirySchedule(inq.message || inq.notes, inq.schedule_date || inq.preferred_date);
        const schedule = parsedSchedule.display || 'No schedule requested';
        const message = parsedSchedule.cleanMessage || 'No message content provided.';
        const createdAt = inq.created_at
            ? new Date(inq.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            })
            : 'N/A';
        const status = getNormalizedStatus(inq.status);
        const isApproved = status === 'Approved';
        const isCancelled = status === 'Cancelled';
        const isCompleted = status === 'Completed';
        const cancelledBy = String(inq.cancelled_by || '').toLowerCase().trim();
        const cancelledLabel = cancelledBy === 'client' ? 'Cancelled by Client' : cancelledBy === 'admin' ? 'Cancelled by Admin' : 'Cancelled';
        const displayStatus = isCancelled ? cancelledLabel : status;
        const initials = clientName.split(' ').filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || 'CL';
        const inquiryTag = `INQ-${String(inquiryId).replace(/^INQ-/i, '')}`;

        modalContent.innerHTML = `
            <div class="inquiry-modal-detail">
                <div class="inquiry-client-banner">
                    <div class="inquiry-client-info">
                        <div class="inquiry-avatar-pill" aria-hidden="true">${escapeHtml(initials)}</div>
                        <div>
                            <h4 class="inquiry-client-name">${escapeHtml(clientName)}</h4>
                            <span class="inquiry-submitted-date">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                    <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                Submitted: ${escapeHtml(createdAt)}
                            </span>
                        </div>
                    </div>
                    <div class="inquiry-banner-meta">
                        <span class="status-badge ${escapeHtml(getBadgeClass(status))}">${escapeHtml(displayStatus)}</span>
                        <span class="inquiry-id-tag">${escapeHtml(inquiryTag)}</span>
                    </div>
                </div>

                <div class="inquiry-info-grid">
                    <div class="info-grid-card">
                        <span class="info-label">Email Address</span>
                        ${email ? `<a href="mailto:${escapeHtml(email)}" class="info-value info-link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg><span>${escapeHtml(email)}</span></a>` : '<span class="info-value muted">Not provided</span>'}
                    </div>
                    <div class="info-grid-card">
                        <span class="info-label">Phone Number</span>
                        ${phone ? `<a href="tel:${escapeHtml(phone)}" class="info-value info-link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg><span>${escapeHtml(phone)}</span></a>` : '<span class="info-value muted">Not provided</span>'}
                    </div>
                    <div class="info-grid-card">
                        <span class="info-label">Property Interested</span>
                        <div class="info-value"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg><span>${escapeHtml(propertyTitle)}</span></div>
                    </div>
                    <div class="info-grid-card">
                        <span class="info-label">Preferred Schedule</span>
                        <div class="info-value"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg><span>${escapeHtml(schedule)}</span></div>
                    </div>
                </div>

                <div class="inquiry-message-section">
                    <span class="info-label">Message / Client Request</span>
                    <div class="inquiry-message-box">${escapeHtml(message)}</div>
                </div>

                <div class="modal-actions-footer">
                    <button type="button" class="btn-modal-secondary btn-close-modal" id="modalCloseActionBtn">Close</button>
                    ${!isCompleted ? `
                        <div class="modal-status-dropdown" id="modalStatusDropdown">
                            <div class="modal-status-split ${isApproved ? 'is-approved' : isCancelled ? 'is-cancelled' : 'is-approve-ready'}" id="modalStatusSplit">
                                <button type="button" class="modal-status-main-btn" id="modalQuickApproveBtn" data-current-state="${isApproved ? 'approved' : isCancelled ? 'cancelled' : 'pending'}">
                                    <span class="modal-status-main-icon" aria-hidden="true">${isCancelled ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"></polyline></svg>'}</span>
                                    <span class="modal-status-trigger-label">${isApproved ? 'Approved' : isCancelled ? escapeHtml(cancelledLabel) : 'Approve'}</span>
                                </button>
                                <button type="button" class="modal-status-chevron-btn" id="modalStatusTriggerBtn" aria-label="More decision options" aria-haspopup="menu" aria-expanded="false">
                                    <svg class="modal-status-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </button>
                            </div>
                            <div class="modal-status-menu" id="modalStatusMenu" role="menu" aria-label="Inquiry decision actions" hidden>
                                <button type="button" class="modal-status-option approve${isApproved ? ' is-selected' : ''}" role="menuitemradio" aria-checked="${isApproved}" data-next-status="Approved">
                                    <span class="modal-option-left"><span class="modal-option-dot green" aria-hidden="true"></span><span>${isApproved ? 'Approved' : 'Approve Inquiry'}</span></span>
                                    <svg class="modal-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </button>
                                <button type="button" class="modal-status-option cancel${isCancelled ? ' is-selected' : ''}" role="menuitemradio" aria-checked="${isCancelled}" data-next-status="Cancelled">
                                    <span class="modal-option-left"><span class="modal-option-dot red" aria-hidden="true"></span><span>${isCancelled ? 'Cancelled' : 'Cancel Inquiry'}</span></span>
                                    <svg class="modal-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </button>
                            </div>
                        </div>
                    ` : ''}
                    ${email ? `<a href="mailto:${encodeURIComponent(email)}?subject=Re:%20Inquiry%20regarding%20${encodeURIComponent(propertyTitle)}" class="btn-modal-primary" target="_blank" rel="noopener"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg><span>Reply via Email</span></a>` : ''}
                </div>
            </div>
        `;

        const closeActionButton = modalContent.querySelector('#modalCloseActionBtn');
        if (closeActionButton) closeActionButton.addEventListener('click', closeInquiryDetailsModal);

        const dropdown = modalContent.querySelector('#modalStatusDropdown');
        const split = modalContent.querySelector('#modalStatusSplit');
        const mainButton = modalContent.querySelector('#modalQuickApproveBtn');
        const triggerButton = modalContent.querySelector('#modalStatusTriggerBtn');
        const menu = modalContent.querySelector('#modalStatusMenu');

        const closeDecisionMenu = () => {
            if (!dropdown || !triggerButton || !menu) return;
            menu.hidden = true;
            dropdown.classList.remove('is-open');
            triggerButton.setAttribute('aria-expanded', 'false');
        };
        const toggleDecisionMenu = () => {
            if (!dropdown || !triggerButton || !menu) return;
            const open = menu.hidden;
            menu.hidden = !open;
            dropdown.classList.toggle('is-open', open);
            triggerButton.setAttribute('aria-expanded', String(open));
        };
        const applyDecision = async (nextStatus) => {
            if (!mainButton || !triggerButton || !split || !menu) return;
            closeDecisionMenu();
            const label = mainButton.querySelector('.modal-status-trigger-label');
            const icon = mainButton.querySelector('.modal-status-main-icon');
            const previousLabel = label ? label.textContent : '';
            mainButton.disabled = true;
            triggerButton.disabled = true;
            if (label) label.textContent = nextStatus === 'Approved' ? 'Approving...' : 'Cancelling...';

            try {
                await window.handleStatusChange(nextStatus, inquiryId);
                const nowApproved = nextStatus === 'Approved';
                const nowCancelled = nextStatus === 'Cancelled';
                const updatedLabel = nowCancelled ? 'Cancelled by Admin' : nextStatus;
                const badge = modalContent.querySelector('.inquiry-banner-meta .status-badge');
                if (badge) {
                    badge.textContent = updatedLabel;
                    badge.className = `status-badge ${getBadgeClass(nextStatus)}`;
                }
                split.className = `modal-status-split ${nowApproved ? 'is-approved' : nowCancelled ? 'is-cancelled' : 'is-approve-ready'}`;
                mainButton.setAttribute('data-current-state', nowApproved ? 'approved' : nowCancelled ? 'cancelled' : 'pending');
                if (label) label.textContent = updatedLabel;
                if (icon) {
                    icon.innerHTML = nowCancelled
                        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
                        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                }
                menu.querySelectorAll('.modal-status-option').forEach(option => {
                    const selected = option.getAttribute('data-next-status') === nextStatus;
                    option.classList.toggle('is-selected', selected);
                    option.setAttribute('aria-checked', String(selected));
                    const optionText = option.querySelector('.modal-option-left span:last-child');
                    if (optionText) {
                        const optionStatus = option.getAttribute('data-next-status');
                        optionText.textContent = optionStatus === nextStatus ? (nowCancelled ? 'Cancelled' : 'Approved') : `${optionStatus === 'Approved' ? 'Approve' : 'Cancel'} Inquiry`;
                    }
                });
            } catch (error) {
                console.error(`Failed to set inquiry status (${nextStatus}) from clients modal:`, error);
                if (label) label.textContent = previousLabel || 'Retry';
            } finally {
                mainButton.disabled = false;
                triggerButton.disabled = false;
            }
        };

        if (mainButton && triggerButton && menu && dropdown) {
            mainButton.addEventListener('click', event => {
                event.stopPropagation();
                if (mainButton.getAttribute('data-current-state') === 'pending') applyDecision('Approved');
                else toggleDecisionMenu();
            });
            triggerButton.addEventListener('click', event => {
                event.stopPropagation();
                toggleDecisionMenu();
            });
            menu.addEventListener('click', event => {
                event.stopPropagation();
                const option = event.target.closest('.modal-status-option[data-next-status]');
                if (!option) return;
                const nextStatus = option.getAttribute('data-next-status');
                if ((nextStatus === 'Approved' && mainButton.getAttribute('data-current-state') === 'approved') ||
                    (nextStatus === 'Cancelled' && mainButton.getAttribute('data-current-state') === 'cancelled')) {
                    closeDecisionMenu();
                    return;
                }
                applyDecision(nextStatus);
            });
            modalContent.addEventListener('click', event => {
                if (!event.target.closest('#modalStatusDropdown')) closeDecisionMenu();
            });
        }

        modal.hidden = false;
        void modal.offsetWidth;
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    };

    // Filter tab listeners
    if (statusTabs) {
        statusTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.status-tab-btn');
            if (!btn) return;
            document.querySelectorAll('.status-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.getAttribute('data-status');
            renderTable();
        });
    }

    // Search input listener
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            renderTable();
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Extracts the preferred schedule that inquiry.js embeds in the message
    // ("[Preferred Schedule: YYYY-MM-DD | Time]" or "[Preferred Slot: Time]").
    function parseInquirySchedule(rawMessage, explicitSchedule) {
        const msg = String(rawMessage || '');
        let display = String(explicitSchedule || '').trim();
        if (display === 'N/A') display = '';
        let cleanMessage = msg;

        const fullMatch = msg.match(/\[Preferred Schedule:\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^\]\r\n]*)\]/i);
        const slotMatch = !fullMatch && msg.match(/\[Preferred Slot:\s*([^\]\r\n]*)\]/i);

        if (fullMatch) {
            const [y, m, d] = fullMatch[1].split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            const dateLabel = isNaN(dateObj.getTime())
                ? fullMatch[1]
                : dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            const timeLabel = fullMatch[2].trim();
            if (!display) display = timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
            cleanMessage = msg.replace(fullMatch[0], '');
        } else if (slotMatch) {
            if (!display) display = slotMatch[1].trim();
            cleanMessage = msg.replace(slotMatch[0], '');
        }

        return { display, cleanMessage: cleanMessage.trim() };
    }

    // Live sync listeners when client cancels/deletes/modifies an inquiry
    window.addEventListener('storage', (e) => {
        if (e.key === 'inquiries' ||
            e.key === 'urbanscope_admin_event_notifs' ||
            e.key === 'urbanscope_inquiry_overrides' ||
            e.key === 'urbanscope_deleted_inquiry_ids') {
            loadData();
        }
    });
    const handleExternalInquiryEvent = (ev) => {
        if (ev && ev.detail && ev.detail.source === 'admin-shell') return;
        loadData();
    };
    window.addEventListener('inquiryCancelled', handleExternalInquiryEvent);
    window.addEventListener('inquiryStatusChanged', handleExternalInquiryEvent);
    window.addEventListener('inquiriesUpdated', handleExternalInquiryEvent);
    window.addEventListener('inquirySubmitted', handleExternalInquiryEvent);
    window.addEventListener('newInquiryReceived', handleExternalInquiryEvent);
    window.addEventListener('propertiesUpdated', () => loadData({ forceProperties: true }));
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && (Date.now() - lastClientsVisibilityAt) > 6000) {
            lastClientsVisibilityAt = Date.now();
            loadData({ forceInquiries: true });
        }
    });

    // Periodic live polling so inquiries table reflects new submissions quickly while visible
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            loadData({ forceInquiries: true });
        }
    }, 20000);

    // Initial load
    await loadData();
});
