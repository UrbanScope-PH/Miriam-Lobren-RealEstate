// ================================
// MANAGE PROPERTIES
// ================================

const propertyTableBody =
    document.getElementById("propertyTableBody") || document.getElementById("propTableBody");
const propertiesMobileList = document.getElementById("propertiesMobileList");
let currentLoadedProperties = [];
const PROPLIST_DEFAULT_LIMIT = 5;
let isShowingAllProperties = new URLSearchParams(window.location.search).get("view") === "all";


function escapePropHtml(str) {
    return String(str == null ? "" : str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}


function sanitizeAdminPropImg(rawUrl, fallback = '../../assets/images/property1.jpg') {
    const raw = String(rawUrl || '').trim();
    if (!raw) return fallback;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(raw)) return raw;
    const cleaned = raw.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');
    if (cleaned.startsWith('assets/images/') && !cleaned.includes('..')) {
        return '../../' + cleaned;
    }
    return fallback;
}

function matchesPropertyAmountRange(priceVal, filterKey) {
    if (!filterKey) return true;
    const num = Number(priceVal) || 0;
    if (filterKey === 'under-3m') return num > 0 && num < 3000000;
    if (filterKey === '3m-6m') return num >= 3000000 && num <= 6000000;
    if (filterKey === '6m-9m') return num > 6000000 && num <= 9000000;
    if (filterKey === 'above-9m') return num > 9000000;
    return true;
}

function normalizePropertyRowMeta(property) {
    const title = property.title || property.name || property.propertyName || "Listing";
    const type = property.property_type || property.type || property.propertyType || "—";
    const loc = property.location || "—";
    const priceStr = property.price ? "₱" + Number(property.price).toLocaleString() : "—";
    const rawStatus = String(property.status || "Available").trim();
    const isSold = rawStatus.toLowerCase() === 'sold' || rawStatus.toLowerCase() === 'sold out';
    const displayStatus = isSold ? 'Sold' : (rawStatus || 'Available');

    let imgSrc = property.image_url ? sanitizeAdminPropImg(property.image_url, '') : '';

    const tLower = title.toLowerCase();
    if (!imgSrc || imgSrc.includes('property1.jpg') || imgSrc.includes('property2.jpg') || imgSrc.includes('property3.jpg')) {
        if (tLower.includes('suerte')) imgSrc = '../../assets/images/casasuerte.jpg';
        else if (tLower.includes('kathleen')) imgSrc = '../../assets/images/kathleen-facade.jpg';
        else if (tLower.includes('liora')) imgSrc = '../../assets/images/LioraHomes.jpg';
        else if (tLower.includes('airmen')) imgSrc = '../../assets/images/AirmenTriplex.WEBP';
        else if (tLower.includes('benecia')) imgSrc = '../../assets/images/benecia-facade.jpg';
        else if (tLower.includes('amore')) imgSrc = '../../assets/images/amore-facade.jpg';
        else if (tLower.includes('midori')) imgSrc = '../../assets/images/midori-main.webp';
    }
    if (!imgSrc) imgSrc = '../../assets/images/property1.jpg';

    return { title, type, loc, priceStr, rawStatus, isSold, displayStatus, imgSrc };
}


// ================================
// LOAD SAVED PROPERTIES
// ================================

async function loadSavedProperties() {
    if (!propertyTableBody) return;
    propertyTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color:var(--text-muted);">Loading listings...</td></tr>`;
    if (propertiesMobileList) {
        propertiesMobileList.innerHTML = `<div class="mobile-empty-state">Loading listings...</div>`;
    }

    let properties = [];
    if (typeof apiGetProperties === "function") {
        try {
            const liveProps = await apiGetProperties();
            if (Array.isArray(liveProps) && liveProps.length > 0) {
                properties = liveProps;
            }
        } catch (e) {
            console.warn("Notice loading properties:", e);
        }
    }

    if (properties.length === 0) {
        properties = JSON.parse(localStorage.getItem("properties")) ||
                     JSON.parse(localStorage.getItem("cached_live_properties")) || [];
    }

    if (typeof window.filterAndSyncAccreditedProperties === "function") {
        properties = await window.filterAndSyncAccreditedProperties(
            properties,
            typeof apiGetProperties === "function" ? () => apiGetProperties({}, true) : null
        );
    } else {
        // Fallback filter/normalization if admin-shell helper is unavailable
        const legacyDemo = new Set(['velemont residences', 'green valley villa', 'horizon heights', 'sunset heights executive townhouse', 'maple ridge residence', 'oakwood manor', 'victoria park residences']);
        properties = properties.filter(p => {
            if (!p) return false;
            const t = (p.title || p.name || p.propertyName || '').toLowerCase().trim();
            return Boolean(t) && !legacyDemo.has(t);
        }).map(p => {
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

    currentLoadedProperties = properties;
    filterTable();
}


function renderPropertyRecords(list, totalFilteredCount) {
    if (window.UrbanPropertyActionMenu && typeof window.UrbanPropertyActionMenu.close === "function") {
        window.UrbanPropertyActionMenu.close(false);
    }
    if (!propertyTableBody) return;
    propertyTableBody.innerHTML = "";
    if (propertiesMobileList) propertiesMobileList.innerHTML = "";

    const countBadge = document.getElementById("propListCountBadge");
    const toggleBtn = document.getElementById("toggleViewAllPropsBtn");
    const footerEl = document.getElementById("propListFooter");
    const footerSummary = document.getElementById("propListFooterSummary");
    const footerBtn = document.getElementById("propListFooterBtn");

    const totalCount = typeof totalFilteredCount === "number" ? totalFilteredCount : (list ? list.length : 0);

    if (!list || list.length === 0) {
        if (countBadge) countBadge.textContent = "0 listings";
        if (toggleBtn) toggleBtn.hidden = true;
        if (footerEl) footerEl.hidden = true;
        propertyTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color:var(--text-muted);">No property records found matching your filter.</td></tr>`;
        if (propertiesMobileList) {
            propertiesMobileList.innerHTML = `<div class="mobile-empty-state">No property records found matching your filter.</div>`;
        }
        return;
    }

    if (countBadge) {
        countBadge.textContent = `Showing ${list.length} of ${totalCount}`;
    }

    const canToggleLimit = totalCount > PROPLIST_DEFAULT_LIMIT;
    if (toggleBtn) {
        toggleBtn.hidden = !canToggleLimit;
        toggleBtn.textContent = isShowingAllProperties ? "Show Limited (5)" : `View All (${totalCount}) →`;
    }
    if (footerEl) {
        footerEl.hidden = !canToggleLimit;
        if (footerSummary) {
            footerSummary.textContent = `Showing ${list.length} of ${totalCount} properties`;
        }
        if (footerBtn) {
            footerBtn.textContent = isShowingAllProperties ? "Show Fewer Listings" : `View All ${totalCount} Properties →`;
        }
    }

    list.forEach(function (property) {
        addPropertyRow(property);
        addPropertyMobileCard(property);
    });
}


window.toggleViewAllProperties = function () {
    isShowingAllProperties = !isShowingAllProperties;
    window.filterTable();
};

window.resetPropertyFilters = function () {
    const searchEl = document.getElementById("propSearch");
    const statusEl = document.getElementById("statusFilter");
    const typeEl = document.getElementById("typeFilter");
    const amountEl = document.getElementById("amountFilter");
    if (searchEl) searchEl.value = "";
    if (statusEl) statusEl.value = "";
    if (typeEl) typeEl.value = "";
    if (amountEl) amountEl.value = "";
    window.filterTable();
};

window.filterTable = function () {
    const searchEl = document.getElementById("propSearch");
    const statusEl = document.getElementById("statusFilter");
    const typeEl = document.getElementById("typeFilter");
    const amountEl = document.getElementById("amountFilter");
    const resetBtn = document.getElementById("resetPropFiltersBtn");

    const query = (searchEl ? searchEl.value : "").trim().toLowerCase();
    const statusFilterVal = (statusEl ? statusEl.value : "").trim().toLowerCase();
    const typeFilterVal = (typeEl ? typeEl.value : "").trim().toLowerCase();
    const amountFilterVal = (amountEl ? amountEl.value : "").trim();

    if (resetBtn) {
        resetBtn.hidden = !(query || statusFilterVal || typeFilterVal || amountFilterVal);
    }

    const filtered = currentLoadedProperties.filter((property) => {
        const meta = normalizePropertyRowMeta(property);
        const matchesQuery = !query ||
            meta.title.toLowerCase().includes(query) ||
            meta.loc.toLowerCase().includes(query) ||
            meta.type.toLowerCase().includes(query) ||
            String(property.id || "").toLowerCase().includes(query);

        const normStatus = meta.displayStatus.toLowerCase();
        const matchesStatus = !statusFilterVal ||
            normStatus === statusFilterVal ||
            (statusFilterVal === 'sold' && meta.isSold);

        const matchesType = !typeFilterVal ||
            meta.type.toLowerCase().includes(typeFilterVal);

        const matchesAmount = matchesPropertyAmountRange(property.price, amountFilterVal);

        return matchesQuery && matchesStatus && matchesType && matchesAmount;
    });

    const displayed = isShowingAllProperties ? filtered : filtered.slice(0, PROPLIST_DEFAULT_LIMIT);
    renderPropertyRecords(displayed, filtered.length);
};


function addPropertyMobileCard(property) {
    if (!propertiesMobileList) return;
    const meta = normalizePropertyRowMeta(property);
    const safeTitle = escapePropHtml(meta.title);
    const safeLoc = escapePropHtml(meta.loc);
    const safeType = escapePropHtml(meta.type);
    const safePrice = escapePropHtml(meta.priceStr);
    const safeId = escapePropHtml(String(property.id));
    const safeStatus = escapePropHtml(meta.displayStatus);

    const card = document.createElement("article");
    card.className = "mobile-data-card mobile-property-card" + (meta.isSold ? " is-sold" : "");
    card.innerHTML = `
        <div class="mobile-prop-top">
            <img class="mobile-prop-thumb" src="${escapePropHtml(meta.imgSrc)}" alt="${safeTitle}" onerror="this.src='../../assets/images/property1.jpg'">
            <div class="mobile-prop-meta">
                <div class="mobile-card-title-row">
                    <strong>${safeTitle}</strong>
                    <span class="mobile-status-chip ${meta.isSold ? 'is-sold' : 'is-available'}">${safeStatus}</span>
                </div>
                <p class="mobile-card-sub">ID #${safeId} &middot; ${safeLoc}</p>
                <div class="mobile-prop-price-row">
                    <span class="mobile-prop-price">${safePrice}</span>
                    <span class="mobile-type-tag">${safeType}</span>
                </div>
            </div>
        </div>
        <div class="mobile-prop-actions">
            <button type="button" class="view-btn" data-id="${safeId}">View</button>
            <button type="button" class="edit-btn" data-id="${safeId}">Edit</button>
            <button type="button" class="status-toggle-btn ${meta.isSold ? 'btn-make-available' : 'btn-make-sold'}"
                data-id="${safeId}"
                data-status="${safeStatus}">
                ${meta.isSold ? 'Mark Available' : 'Mark as Sold'}
            </button>
            <button type="button" class="delete-btn"
                data-id="${safeId}"
                data-title="${safeTitle}">
                Delete
            </button>
        </div>
    `;
    propertiesMobileList.appendChild(card);
}


// ================================
// ADD PROPERTY ROW
// ================================

function addPropertyRow(property) {
    const meta = normalizePropertyRowMeta(property);
    const safeTitle = escapePropHtml(meta.title);
    const safeLoc = escapePropHtml(meta.loc);
    const safeType = escapePropHtml(meta.type);
    const safePrice = escapePropHtml(meta.priceStr);
    const safeId = escapePropHtml(String(property.id));
    const safeStatus = escapePropHtml(meta.displayStatus);
    const { isSold, imgSrc } = meta;

    const row = document.createElement("tr");
    if (isSold) {
        row.classList.add("row-sold");
    }

    const actionsCellHtml = (window.UrbanPropertyActionMenu && typeof window.UrbanPropertyActionMenu.renderTrigger === "function")
        ? window.UrbanPropertyActionMenu.renderTrigger({
            id: property.id,
            status: safeStatus,
            title: meta.title
        })
        : `<div class="actions">
                <button type="button" class="view-btn" data-id="${safeId}">View</button>
                <button type="button" class="edit-btn" data-id="${safeId}">Edit</button>
                <button type="button" class="status-toggle-btn ${isSold ? 'btn-make-available' : 'btn-make-sold'}"
                    data-id="${safeId}"
                    data-status="${safeStatus}">
                    ${isSold ? 'Mark Available' : 'Mark as Sold'}
                </button>
                <button type="button" class="delete-btn"
                    data-id="${safeId}"
                    data-title="${safeTitle}">
                    Delete
                </button>
            </div>`;

    row.innerHTML = `
        <td>
            <div class="property-name" style="display:flex; align-items:center; gap:12px;">
                <div class="property-image" style="width:48px;height:48px;overflow:hidden;border-radius:8px;flex-shrink:0;">
                    <img src="${escapePropHtml(imgSrc)}" alt="${safeTitle}" style="width:100%;height:100%;object-fit:cover;${isSold ? 'filter:grayscale(1); opacity:0.8;' : ''}" onerror="this.src='../../assets/images/property1.jpg'">
                </div>
                <div>
                    <strong style="color:${isSold ? 'var(--text-muted)' : 'var(--text-dark)'}; font-size:0.92rem; display:block; line-height:1.3;">${safeTitle}</strong>
                    <small style="color:var(--text-muted); font-size:0.78rem;">ID #${safeId}</small>
                </div>
            </div>
        </td>
        <td style="color:var(--text-secondary); font-size:0.88rem; font-weight:500;">${safeLoc}</td>
        <td><span style="padding:4px 9px; border-radius:6px; background:var(--light-green); color:var(--dark-green); font-size:0.78rem; font-weight:600; display:inline-block;">${safeType}</span></td>
        <td style="font-weight:700; color:var(--text-dark); font-size:0.9rem;">${safePrice}</td>
        <td>
            <span class="status-badge-table ${isSold ? 'status-badge-sold' : 'status-badge-available'}">
                <span class="status-badge-dot"></span>
                ${safeStatus}
            </span>
        </td>
        <td>${actionsCellHtml}</td>
    `;

    propertyTableBody.appendChild(row);
}


// ================================
// DELETE MODAL STATE & HANDLERS
// ================================

let selectedPropertyId = null;

const cancelDelete = document.getElementById("cancelDelete");
const confirmDelete = document.getElementById("confirmDelete");
const deleteModal = document.getElementById("deleteModal");

if (cancelDelete) {
    cancelDelete.addEventListener("click", function () {
        if (deleteModal) deleteModal.classList.remove("show");
        selectedPropertyId = null;
    });
}

if (confirmDelete) {
    confirmDelete.addEventListener("click", async function () {
        if (!selectedPropertyId) return;

        confirmDelete.disabled = true;
        confirmDelete.innerText = "Deleting...";

        try {
            let success = false;
            if (typeof apiDeleteProperty === "function") {
                success = await apiDeleteProperty(selectedPropertyId);
            } else {
                ['properties', 'cached_live_properties', 'urbanScopeProperties'].forEach(key => {
                    const list = JSON.parse(localStorage.getItem(key) || '[]');
                    const filtered = list.filter(p => String(p.id) !== String(selectedPropertyId));
                    localStorage.setItem(key, JSON.stringify(filtered));
                });
                success = true;
            }

            if (deleteModal) deleteModal.classList.remove("show");
            selectedPropertyId = null;
            await loadSavedProperties();
            if (typeof window.showFeedbackToast === 'function') {
                window.showFeedbackToast("Property deleted successfully.", "success");
            }
        } catch (err) {
            console.error("Delete notice:", err);
            if (typeof window.showFeedbackToast === 'function') {
                window.showFeedbackToast("Could not delete property: " + (err.message || "Unknown error"), "error");
            } else {
                alert("Could not delete property: " + (err.message || "Unknown error"));
            }
        } finally {
            confirmDelete.disabled = false;
            confirmDelete.innerText = "Delete Property";
        }
    });
}

if (deleteModal) {
    deleteModal.addEventListener("click", function (event) {
        if (event.target === deleteModal) {
            deleteModal.classList.remove("show");
            selectedPropertyId = null;
        }
    });
}

document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && deleteModal && deleteModal.classList.contains("show")) {
        deleteModal.classList.remove("show");
        selectedPropertyId = null;
    }
});


// ================================
// BUTTON ACTIONS (VIEW, EDIT, STATUS TOGGLE, DELETE)
// ================================

async function toggleManagedPropertyStatus(propertyId, rawStatus, controlBtn) {
    const currentStatus = String(rawStatus || 'Available').trim().toLowerCase();
    const isCurrentlySold = currentStatus === 'sold' || currentStatus === 'sold out';
    const newStatus = isCurrentlySold ? 'Available' : 'Sold';
    const isTrigger = Boolean(controlBtn && controlBtn.classList.contains("prop-actions-trigger"));
    const prevLabel = controlBtn ? controlBtn.innerText : '';

    if (controlBtn) {
        controlBtn.disabled = true;
        if (!isTrigger) controlBtn.innerText = 'Updating...';
    }

    try {
        if (typeof apiUpdateProperty === 'function') {
            await apiUpdateProperty(propertyId, { status: newStatus });
        } else {
            ['properties', 'cached_live_properties', 'urbanScopeProperties'].forEach(key => {
                const list = JSON.parse(localStorage.getItem(key) || '[]');
                const idx = list.findIndex(p => String(p.id) === String(propertyId));
                if (idx !== -1) {
                    list[idx].status = newStatus;
                    localStorage.setItem(key, JSON.stringify(list));
                }
            });
        }

        await loadSavedProperties();
        if (typeof window.showFeedbackToast === 'function') {
            window.showFeedbackToast("Property status updated successfully.", "success");
        }
    } catch (err) {
        console.error("Status toggle notice:", err);
        if (typeof window.showFeedbackToast === 'function') {
            window.showFeedbackToast("Could not update property status. Please check your connection.", "error");
        } else {
            alert("Could not update property status. Please check your connection.");
        }
        if (controlBtn) {
            controlBtn.disabled = false;
            if (!isTrigger) {
                controlBtn.innerText = prevLabel || (isCurrentlySold ? 'Mark Available' : 'Mark as Sold');
            }
        }
    }
}

async function requestDeleteManagedProperty(propertyId, propertyTitle, controlBtn) {
    const labelTitle = propertyTitle || "this property";
    if (!propertyId) {
        if (typeof window.showFeedbackToast === 'function') {
            window.showFeedbackToast("This property cannot be deleted yet.", "warn");
        } else {
            alert("This property cannot be deleted yet.");
        }
        return;
    }

    if (deleteModal) {
        selectedPropertyId = propertyId;
        const propToDeleteEl = document.getElementById("propertyToDelete");
        if (propToDeleteEl) {
            propToDeleteEl.textContent = `"${labelTitle}"`;
        }
        deleteModal.classList.add("show");
        return;
    }

    if (!confirm(`Are you sure you want to permanently delete "${labelTitle}"?\n\nThis will remove it from the catalog and database.`)) {
        return;
    }

    const isTrigger = Boolean(controlBtn && controlBtn.classList.contains("prop-actions-trigger"));
    if (controlBtn) {
        controlBtn.disabled = true;
        if (!isTrigger) controlBtn.innerText = 'Deleting...';
    }
    try {
        let success = false;
        if (typeof apiDeleteProperty === "function") {
            success = await apiDeleteProperty(propertyId);
        } else {
            ['properties', 'cached_live_properties', 'urbanScopeProperties'].forEach(key => {
                const list = JSON.parse(localStorage.getItem(key) || '[]');
                const filtered = list.filter(p => String(p.id) !== String(propertyId));
                localStorage.setItem(key, JSON.stringify(filtered));
            });
            success = true;
        }

        if (success) {
            await loadSavedProperties();
            if (typeof window.showFeedbackToast === 'function') {
                window.showFeedbackToast("Property deleted successfully.", "success");
            }
        } else {
            if (typeof window.showFeedbackToast === 'function') {
                window.showFeedbackToast("Could not delete property. Please check your admin permissions.", "error");
            } else {
                alert("Could not delete property. Please check your admin permissions.");
            }
            if (controlBtn) {
                controlBtn.disabled = false;
                if (!isTrigger) controlBtn.innerText = 'Delete';
            }
        }
    } catch (err) {
        console.error("Delete notice:", err);
        if (typeof window.showFeedbackToast === 'function') {
            window.showFeedbackToast("Could not delete property: " + (err.message || "Unknown error"), "error");
        } else {
            alert("Could not delete property: " + (err.message || "Unknown error"));
        }
        if (controlBtn) {
            controlBtn.disabled = false;
            if (!isTrigger) controlBtn.innerText = 'Delete';
        }
    }
}

document.addEventListener(
    "click",
    async function (event) {

        const actionTrigger = event.target.closest("button.prop-actions-trigger[data-prop-action-toggle]");
        if (actionTrigger && window.UrbanPropertyActionMenu && typeof window.UrbanPropertyActionMenu.toggle === "function") {
            window.UrbanPropertyActionMenu.toggle(event, {
                trigger: actionTrigger,
                id: actionTrigger.getAttribute("data-prop-id"),
                status: actionTrigger.getAttribute("data-prop-status") || "Available",
                title: actionTrigger.getAttribute("data-prop-title") || "Listing",
                onToggleStatus: async (ctx) => {
                    await toggleManagedPropertyStatus(ctx.id, ctx.status, ctx.trigger);
                },
                onDelete: async (ctx) => {
                    await requestDeleteManagedProperty(ctx.id, ctx.title, ctx.trigger);
                }
            });
            return;
        }

        // ============================
        // VIEW
        // ============================

        const viewBtn = event.target.closest(".view-btn");
        if (viewBtn) {
            const propertyId = viewBtn.dataset.id;
            window.open(
                "../properties/property-detail.html?id=" + encodeURIComponent(propertyId),
                "_blank",
                "noopener,noreferrer"
            );
            return;
        }


        // ============================
        // EDIT
        // ============================

        const editBtn = event.target.closest(".edit-btn");
        if (editBtn) {
            const propertyId = editBtn.dataset.id;
            window.location.href =
                "edit-property.html?id=" +
                encodeURIComponent(propertyId);
            return;
        }


        // ============================
        // STATUS TOGGLE (SOLD <-> AVAILABLE)
        // ============================

        const statusBtn = event.target.closest(".status-toggle-btn");
        if (statusBtn) {
            await toggleManagedPropertyStatus(statusBtn.dataset.id, statusBtn.dataset.status, statusBtn);
            return;
        }


        // ============================
        // DELETE
        // ============================

        const deleteBtn = event.target.closest(".delete-btn");
        if (deleteBtn) {
            const propertyId = deleteBtn.dataset.id;
            const propertyTitle = deleteBtn.dataset.title || deleteBtn.closest("tr")?.querySelector("strong")?.textContent || "this property";
            await requestDeleteManagedProperty(propertyId, propertyTitle, deleteBtn);
            return;
        }

    }
);


// ================================
// LOAD PROPERTIES
// ================================

loadSavedProperties();


// Sidebar and profile dropdown handled by admin-shell.js

document.querySelectorAll('.profile-signout, .logout-link').forEach(el => {
    el.addEventListener('click', () => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        localStorage.removeItem('supabase_token');
        localStorage.removeItem('urbanscope_jwt_token');
        localStorage.removeItem('urbanscope_user');
        if (typeof apiSignOut === 'function') apiSignOut();
    });
});
