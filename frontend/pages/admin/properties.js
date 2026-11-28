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

function matchesPropertyTypeFilter(rawType, filterTypeVal) {
    if (!filterTypeVal) return true;
    const normProp = String(rawType || "").toLowerCase().replace(/[-_]+/g, " ").trim();
    const normFilter = String(filterTypeVal || "").toLowerCase().replace(/[-_]+/g, " ").trim();
    if (!normFilter) return true;
    if (normFilter.includes("condo")) return normProp.includes("condo");
    if (normFilter.includes("single attached")) return normProp.includes("single attached");
    if (normFilter.includes("house") && normFilter.includes("lot")) {
        return normProp.includes("house") && normProp.includes("lot");
    }
    return normProp.includes(normFilter);
}

const finishedProjectLabel = 'Finished Project';

function normalizePropertyRowMeta(property) {
    const title = property.title || property.name || property.propertyName || "Listing";
    const type = property.property_type || property.type || property.propertyType || "—";
    const loc = property.location || "—";
    const priceStr = property.price ? "₱" + Number(property.price).toLocaleString() : "—";
    const rawStatus = String(property.status || "Available").trim();
    const isSold = rawStatus.toLowerCase() === 'sold' || rawStatus.toLowerCase() === 'sold out';
    const displayStatus = isSold ? finishedProjectLabel : (rawStatus || 'Available');

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
    propertyTableBody.innerHTML = (window.UrbanSkeleton && typeof window.UrbanSkeleton.tableRows === "function")
        ? window.UrbanSkeleton.tableRows(5, "properties")
        : `<tr><td colspan="6" style="text-align:center; padding: 24px; color:var(--text-muted);">Loading listings...</td></tr>`;
    if (propertiesMobileList) {
        propertiesMobileList.innerHTML = (window.UrbanSkeleton && typeof window.UrbanSkeleton.mobileCards === "function")
            ? window.UrbanSkeleton.mobileCards(3, "properties")
            : `<div class="mobile-empty-state">Loading listings...</div>`;
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
    syncCustomFilterDropdowns();
    filterTable();
}


// ================================
// CUSTOM DROPDOWN UI FOR FILTERS
// ================================

const propCustomSelectControllers = [];

function getPropertyOptionCount(kind, optionVal) {
    if (!Array.isArray(currentLoadedProperties) || currentLoadedProperties.length === 0) return 0;
    if (!optionVal) return currentLoadedProperties.length;
    return currentLoadedProperties.filter((property) => {
        const meta = normalizePropertyRowMeta(property);
        if (kind === "status") {
            const normStatus = meta.displayStatus.toLowerCase();
            const target = optionVal.toLowerCase();
            return normStatus === target || (target === "sold" && meta.isSold);
        }
        return matchesPropertyTypeFilter(meta.type, optionVal);
    }).length;
}

function closeAllPropCustomSelects(exceptWrap = null) {
    propCustomSelectControllers.forEach((ctrl) => {
        if (ctrl.wrap !== exceptWrap) {
            ctrl.close();
        }
    });
}

function initPropListCustomSelect(selectId, kind, headerText) {
    const selectEl = document.getElementById(selectId);
    if (!selectEl || selectEl.dataset.customSelectReady === "1") return;
    const cardWrap = selectEl.closest(".status-select-card");
    if (!cardWrap) return;

    selectEl.dataset.customSelectReady = "1";
    cardWrap.classList.add("has-custom-select");

    const triggerBtn = document.createElement("button");
    triggerBtn.type = "button";
    triggerBtn.className = "proplist-custom-trigger";
    triggerBtn.setAttribute("aria-haspopup", "listbox");
    triggerBtn.setAttribute("aria-expanded", "false");

    const menuEl = document.createElement("div");
    menuEl.className = "proplist-custom-menu";
    menuEl.setAttribute("role", "listbox");
    menuEl.setAttribute("aria-label", headerText);
    menuEl.hidden = true;

    cardWrap.appendChild(triggerBtn);
    cardWrap.appendChild(menuEl);

    function renderTriggerAndOptions() {
        const selectedOption = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
        const selectedVal = selectEl.value || "";
        const selectedLabel = selectedOption ? selectedOption.textContent.trim() : "";

        const leadIconHtml = kind === "status"
            ? ""
            : `<span class="proplist-type-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
               </span>`;

        triggerBtn.innerHTML = `
            <span class="proplist-trigger-left">
                ${leadIconHtml}
                <span class="proplist-trigger-label">${escapePropHtml(selectedLabel)}</span>
            </span>
            <svg class="proplist-trigger-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        `;
        triggerBtn.classList.toggle("is-filtered", Boolean(selectedVal));

        const optionsHtml = Array.from(selectEl.options).map((opt) => {
            const val = opt.value;
            const label = opt.textContent.trim();
            const isSelected = val === selectedVal;
            const count = getPropertyOptionCount(kind, val);

            return `
                <button type="button"
                        class="proplist-custom-option${isSelected ? " is-selected" : ""}"
                        role="option"
                        aria-selected="${isSelected ? "true" : "false"}"
                        data-value="${escapePropHtml(val)}">
                    <span class="proplist-option-left">
                        <span class="proplist-option-label">${escapePropHtml(label)}</span>
                    </span>
                    <span class="proplist-option-right">
                        <span class="proplist-option-count">${count}</span>
                        <svg class="proplist-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </span>
                </button>
            `;
        }).join("");

        menuEl.innerHTML = `
            <div class="proplist-custom-menu-list">${optionsHtml}</div>
        `;
    }

    function openMenu() {
        closeAllPropCustomSelects(cardWrap);
        renderTriggerAndOptions();
        menuEl.hidden = false;
        cardWrap.classList.add("is-open");
        triggerBtn.setAttribute("aria-expanded", "true");
    }

    function closeMenu() {
        menuEl.hidden = true;
        cardWrap.classList.remove("is-open");
        triggerBtn.setAttribute("aria-expanded", "false");
    }

    triggerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (menuEl.hidden) {
            openMenu();
        } else {
            closeMenu();
        }
    });

    menuEl.addEventListener("click", (e) => {
        e.stopPropagation();
        const optBtn = e.target.closest(".proplist-custom-option");
        if (!optBtn) return;
        const nextVal = optBtn.getAttribute("data-value") ?? "";
        selectEl.value = nextVal;
        renderTriggerAndOptions();
        closeMenu();
        window.filterTable();
    });

    propCustomSelectControllers.push({
        wrap: cardWrap,
        selectEl,
        refresh: renderTriggerAndOptions,
        close: closeMenu
    });

    renderTriggerAndOptions();
}

function syncCustomFilterDropdowns() {
    initPropListCustomSelect("statusFilter", "status", "Filter by Status");
    initPropListCustomSelect("typeFilter", "type", "Filter by Property Type");
    propCustomSelectControllers.forEach((ctrl) => ctrl.refresh());
}

document.addEventListener("click", (e) => {
    if (!e.target.closest(".status-select-card.has-custom-select")) {
        closeAllPropCustomSelects(null);
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeAllPropCustomSelects(null);
    }
});


function renderPropertyRecords(list) {
    if (window.UrbanPropertyActionMenu && typeof window.UrbanPropertyActionMenu.close === "function") {
        window.UrbanPropertyActionMenu.close(false);
    }
    if (!propertyTableBody) return;
    propertyTableBody.innerHTML = "";
    if (propertiesMobileList) propertiesMobileList.innerHTML = "";

    const countBadge = document.getElementById("propListCountBadge");
    const totalCount = Array.isArray(currentLoadedProperties) ? currentLoadedProperties.length : (list ? list.length : 0);

    if (!list || list.length === 0) {
        if (countBadge) countBadge.textContent = "0 listings";
        propertyTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color:var(--text-muted);">No property records found matching your filter.</td></tr>`;
        if (propertiesMobileList) {
            propertiesMobileList.innerHTML = `<div class="mobile-empty-state">No property records found matching your filter.</div>`;
        }
        return;
    }

    if (countBadge) {
        countBadge.textContent = list.length === totalCount
            ? `${totalCount} ${totalCount === 1 ? 'listing' : 'listings'}`
            : `Showing ${list.length} of ${totalCount}`;
    }

    list.forEach(function (property) {
        addPropertyRow(property);
        addPropertyMobileCard(property);
    });
}


window.resetPropertyFilters = function () {
    const searchEl = document.getElementById("propSearch");
    const statusEl = document.getElementById("statusFilter");
    const typeEl = document.getElementById("typeFilter");
    if (searchEl) searchEl.value = "";
    if (statusEl) statusEl.value = "";
    if (typeEl) typeEl.value = "";
    syncCustomFilterDropdowns();
    window.filterTable();
};

window.filterTable = function () {
    const searchEl = document.getElementById("propSearch");
    const statusEl = document.getElementById("statusFilter");
    const typeEl = document.getElementById("typeFilter");
    const resetBtn = document.getElementById("resetPropFiltersBtn");

    const query = (searchEl ? searchEl.value : "").trim().toLowerCase();
    const statusFilterVal = (statusEl ? statusEl.value : "").trim().toLowerCase();
    const typeFilterVal = (typeEl ? typeEl.value : "").trim();

    if (resetBtn) {
        resetBtn.hidden = !(query || statusFilterVal || typeFilterVal);
    }

    propCustomSelectControllers.forEach((ctrl) => ctrl.refresh());

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

        const matchesType = matchesPropertyTypeFilter(meta.type, typeFilterVal);

        return matchesQuery && matchesStatus && matchesType;
    });

    renderPropertyRecords(filtered);
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
                data-status="${escapePropHtml(meta.rawStatus)}">
                ${meta.isSold ? 'Mark Available' : finishedProjectLabel}
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
            status: meta.rawStatus,
            title: meta.title
        })
        : `<div class="actions">
                <button type="button" class="view-btn" data-id="${safeId}">View</button>
                <button type="button" class="edit-btn" data-id="${safeId}">Edit</button>
                <button type="button" class="status-toggle-btn ${isSold ? 'btn-make-available' : 'btn-make-sold'}"
                    data-id="${safeId}"
                    data-status="${escapePropHtml(meta.rawStatus)}">
                    ${isSold ? 'Mark Available' : finishedProjectLabel}
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
                controlBtn.innerText = prevLabel || (isCurrentlySold ? 'Mark Available' : finishedProjectLabel);
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
                markSoldLabel: finishedProjectLabel,
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
