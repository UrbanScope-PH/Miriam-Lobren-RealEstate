/**
 * UrbanScope - Homepage Controller
 * Handles category tabs carousel scrolling, dynamic database loading,
 * in-page search filtering without page navigation, and smooth scrolling.
 */

function _escHtml(val) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(val);
    return String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _safeImgUrl(url, fallback = 'assets/images/casasuerte.jpg') {
    if (typeof window.sanitizeImageUrl === 'function') {
        return window.sanitizeImageUrl(url, fallback);
    }
    const raw = String(url || '').trim();
    if (!raw) return fallback;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(raw)) return raw;
    const cleaned = raw.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');
    if (cleaned.startsWith('assets/images/') && !cleaned.includes('..')) return cleaned;
    return fallback;
}

function scrollCategories(direction) {
    const tabs = document.getElementById('categoryTabs');
    if (tabs) {
        tabs.scrollBy({ left: direction * 150, behavior: 'smooth' });
    }
}

const CANONICAL_ACCREDITED_PROPERTIES = [
    {
        id: 1,
        title: "Casasuerte",
        propertyName: "Casasuerte Townhouse",
        location: "Barangay San Agustin, Trece Martires City, Cavite",
        property_type: "Townhouse",
        price: 2500000,
        bedrooms: 2,
        bathrooms: 1,
        lot_area: 50,
        floor_area: 50.8,
        status: "Available",
        image_url: "assets/images/casasuerte.jpg",
        description: "Casasuerte stands out as an attractive option for first-time homebuyers and modern families looking for a sustainable yet affordable home. Built-in solar power system included.",
        amenities: "Gated Entrance, Clubhouse, Basketball Court, Parks, Built-in Solar Power System, Paved Concrete Roads"
    },
    {
        id: 2,
        title: "Kathleen - Place 5",
        propertyName: "Kathleen - Place 5",
        location: "Molino 7, Bacoor, Cavite",
        property_type: "Townhouse",
        price: 6200000,
        bedrooms: 3,
        bathrooms: 2,
        lot_area: 112,
        floor_area: 112,
        status: "Available",
        image_url: "assets/images/kathleen-facade.jpg",
        description: "Kathleen - Place 5 is a secure, family-friendly residential community offering 275 premium townhouses in Molino VII, Bacoor, Cavite. Just 12 minutes from EVIA Lifestyle Center along Daang-Hari.",
        amenities: "Gated Entrance, Clubhouse, Park, Basketball Court, CCTV, Green-Oriented Community, Steel Gates Included, Modular Cabinets"
    },
    {
        id: 3,
        title: "Liora Homes",
        propertyName: "Liora Homes Naic",
        location: "Brgy. Malainen Bago, Naic, Cavite",
        property_type: "Townhouse",
        price: 2462400,
        bedrooms: 2,
        bathrooms: 1,
        lot_area: 50,
        floor_area: 44,
        status: "Available",
        image_url: "assets/images/LioraHomes.jpg",
        description: "Liora Homes Naic Amora EcoLove townhomes equipped with solar panel systems and rainwater storage tanks, awarded 3 Stars by PHILGBC under the BERDE program.",
        amenities: "Clubhouse, Covered Basketball Court, Swimming Pool, Playground & Park, Solar-Ready System, Rainwater Harvesting"
    },
    {
        id: 4,
        title: "Airmen's Village Triplex",
        propertyName: "Airmen's Village Triplex",
        location: "Pulang Lupa Dos, Las Piñas City",
        property_type: "Triplex",
        price: 8900000,
        bedrooms: 3,
        bathrooms: 3,
        lot_area: 83.25,
        floor_area: 143.78,
        status: "Available",
        image_url: "assets/images/AirmenTriplex.WEBP",
        description: "Modern, Ready-for-Occupancy (RFO) triplex townhouse offering the perfect blend of space, comfort, and accessibility. Located in a secure community in Las Piñas.",
        amenities: "Clubhouse, Basketball Court, Swimming Pool, Playground & Park, 24/7 Security, Balcony"
    },
    {
        id: 5,
        title: "Benecia Single-Attached",
        propertyName: "Benecia Single-Attached House and Lot",
        location: "Sihanouk Village, Barangay Talon IV, Las Piñas City",
        property_type: "Single-Attached House",
        price: 9695000,
        bedrooms: 3,
        bathrooms: 3,
        lot_area: 102,
        floor_area: 117,
        status: "Available",
        image_url: "assets/images/benecia-facade.jpg",
        description: "Benecia Single Attached offers a modern and spacious home in Sihanouk Village, Talon IV, Las Piñas City. Complete turnover with front fence and gate.",
        amenities: "Single-Attached House Design, Private Carport, Front Fence and Gate, Balcony, Lanai, Functional Multi-Level Living Spaces, Maid's Room, Powder Room"
    },
    {
        id: 6,
        title: "Amore Classico",
        propertyName: "Amore Classico – Benedetto Residences",
        location: "Benedetto Residences, Barangay Pulang Lupa Uno, Las Piñas City",
        property_type: "Townhouse",
        price: 7995000,
        bedrooms: 3,
        bathrooms: 3,
        lot_area: 52,
        floor_area: 102,
        status: "Available",
        image_url: "assets/images/amore-facade.jpg",
        description: "Amore Classico by Benedetto Residences is a thoughtfully designed three-storey townhouse in Barangay Pulang Lupa Uno, Las Piñas City.",
        amenities: "Three-Storey Townhouse Design, Spacious Family Hall, Dedicated Maid's Room, Functional Multi-Level Living Spaces, Private Patio, Powder Room"
    },
    {
        id: 7,
        title: "Midori Mid-Rise Condo – Zone 1",
        propertyName: "Midori Mid-Rise Condo – Zone 1",
        location: "Zone 1, Buildings 14–21, Dasmariñas, Cavite",
        property_type: "Mid-Rise Condominium",
        price: 3140000,
        bedrooms: 2,
        bathrooms: 1,
        lot_area: 0,
        floor_area: 50,
        status: "Available",
        image_url: "assets/images/midori-main.webp",
        description: "Midori Mid-Rise Condo – Zone 1 offers a convenient and comfortable living experience for young professionals, couples, and starting families looking for an affordable home in Dasmariñas, Cavite.",
        amenities: "2nd Floor Units, Inner & End Unit Types, Living Area, Dining Area, Kitchen Area, Patio, Convenient Access to Public Transportation, Near Dasmariñas Bayan, Close to Schools and Essential Establishments, Accessible to Daily Needs"
    }
];

let allCachedProperties = [...CANONICAL_ACCREDITED_PROPERTIES];
let activeCategory = 'all';
let activeLocation = 'all';
let activeKeyword = '';
let activeSort = 'featured';
let activeMaxPrice = null;

function normalizeStr(val) {
    if (!val) return '';
    return String(val)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[-_]/g, ' ')
        .toLowerCase()
        .trim();
}

function formatPropertyTitle(title) {
    if (!title) return '';
    const t = String(title).toLowerCase();
    if (t.includes('suerte')) return 'Casasuerte';
    if (t.includes('kathleen')) return 'Kathleen - Place 5';
    if (t.includes('liora')) return 'Liora Homes';
    if (t.includes('airmen')) return "Airmen's Village Triplex";
    if (t.includes('benecia')) return "Benecia Single-Attached";
    if (t.includes('amore')) return "Amore Classico";
    if (t.includes('midori')) return "Midori Mid-Rise Condo – Zone 1";
    return title;
}

function resolveCardImage(url, item) {
    if (item) {
        const t = (item.title || item.propertyName || item.name || '').toLowerCase();
        if (t.includes('suerte')) return 'assets/images/casasuerte.jpg';
        if (t.includes('kathleen')) return 'assets/images/kathleen-facade.jpg';
        if (t.includes('liora')) return 'assets/images/LioraHomes.jpg';
        if (t.includes('airmen')) return 'assets/images/AirmenTriplex.WEBP';
        if (t.includes('benecia')) return 'assets/images/benecia-facade.jpg';
        if (t.includes('amore')) return 'assets/images/amore-facade.jpg';
        if (t.includes('midori')) return 'assets/images/midori-main.webp';
    }
    return _safeImgUrl(url, 'assets/images/casasuerte.jpg');
}

function getPropertyDetailUrl(item) {
    const title = (item.title || item.propertyName || '').toLowerCase();
    if (title.includes('liora')) return 'pages/properties/Liora.html';
    if (title.includes('airmen')) return 'pages/properties/Airmen.html';
    if (title.includes('suerte')) return 'pages/properties/casasuerte.html';
    if (title.includes('kathleen')) return 'pages/properties/kathleen.html';
    if (title.includes('benecia')) return 'pages/properties/benecia.html';
    if (title.includes('amore')) return 'pages/properties/amore-classico.html';
    if (title.includes('midori')) return 'pages/properties/midori.html';
    return `pages/properties/property-detail.html?id=${encodeURIComponent(String(item.id ?? ''))}`;
}

function getPropertyPricingMeta(item) {
    const t = (item.title || item.propertyName || '').toLowerCase();
    if (t.includes('suerte')) {
        return { priceDisplay: '₱2.50M - ₱3.00M' };
    } else if (t.includes('kathleen')) {
        return { priceDisplay: '₱6.20M - ₱9.00M' };
    } else if (t.includes('liora')) {
        return { priceDisplay: '₱2.46M - ₱2.89M' };
    } else if (t.includes('airmen')) {
        return { priceDisplay: '₱8.90M - ₱9.03M' };
    } else if (t.includes('benecia')) {
        return { priceDisplay: '₱9.695M' };
    } else if (t.includes('amore')) {
        return { priceDisplay: '₱7.995M' };
    } else if (t.includes('midori')) {
        return { priceDisplay: '₱3.14M - ₱3.22M' };
    }
    return {
        priceDisplay: '₱' + Number(item.price || 0).toLocaleString()
    };
}

function showFeedbackToast(msg, icon = '✓') {
    let toast = document.getElementById('urbanFeedbackToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'urbanFeedbackToast';
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: rgba(15, 23, 42, 0.94);
            color: #ffffff;
            font-size: 13.5px;
            font-weight: 600;
            padding: 10px 20px;
            border-radius: 999px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 99999;
            opacity: 0;
            pointer-events: none;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        `;
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<span style="color: #4ade80; font-weight: 800;">${_escHtml(icon)}</span> <span>${_escHtml(msg)}</span>`;
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 2400);
}

function copyPropertyLink(id) {
    let rawId = String(id ?? '');
    try { rawId = decodeURIComponent(rawId); } catch (e) {}
    const url = window.location.origin + '/pages/properties/property-detail.html?id=' + encodeURIComponent(rawId);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            showFeedbackToast('Property link copied to clipboard!');
        }).catch(() => {
            showFeedbackToast('Property link copied!');
        });
    } else {
        showFeedbackToast('Property link copied!');
    }
}

function resetHomeCategory() {
    activeCategory = 'all';
    activeLocation = 'all';
    activeKeyword = '';

    const typeSelect = document.getElementById('typeFilter');
    const locSelect = document.getElementById('locationFilter');
    const keywordInput = document.getElementById('keyword');
    if (typeSelect) {
        typeSelect.value = 'all';
        typeSelect.dispatchEvent(new Event('change'));
    }
    if (locSelect) {
        locSelect.value = 'all';
        locSelect.dispatchEvent(new Event('change'));
    }
    if (keywordInput) keywordInput.value = '';

    syncCategoryTabs('all');
    applyCurrentFiltersAndRender();
}

let showAllPropertiesOnMobile = false;

function hasActivePropertyFilters() {
    return (
        (activeCategory && activeCategory !== 'all') ||
        (activeLocation && activeLocation !== 'all') ||
        Boolean(activeKeyword && activeKeyword.trim()) ||
        (activeMaxPrice !== null && activeMaxPrice !== undefined && activeMaxPrice !== '') ||
        (activeSort && activeSort !== 'featured')
    );
}

function updateMobilePropertiesExpandUi(totalCount, hasFilter) {
    const grid = document.getElementById('propertyGrid');
    const wrap = document.getElementById('mobilePropsExpandWrap');
    const btn = document.getElementById('mobileShowAllPropsBtn');
    const expanded = Boolean(showAllPropertiesOnMobile || hasFilter);

    if (grid) {
        grid.classList.toggle('mobile-props-expanded', expanded);
    }
    if (!wrap || !btn) return;

    if (totalCount <= 3 || hasFilter) {
        wrap.hidden = true;
        return;
    }

    wrap.hidden = false;
    btn.setAttribute('aria-expanded', String(showAllPropertiesOnMobile));
    btn.textContent = showAllPropertiesOnMobile
        ? 'Show Fewer Properties'
        : `Show All Properties (${totalCount})`;
}

function renderFeaturedGrid(list) {
    const grid = document.getElementById('propertyGrid');
    if (!grid) return;

    if (!list || list.length === 0) {
        grid.innerHTML = `
            <div class="home-empty-state" style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: #fdfdfd; border-radius: 12px; border: 1px dashed #cbd5e1; margin: 10px 0;">
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="margin-bottom: 10px; color: #94a3b8;">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <h4 style="font-size: 1.15rem; color: var(--text-dark, #1e293b); margin-bottom: 6px;">No properties found matching your criteria</h4>
                <p style="font-size: 0.9rem; color: var(--text-muted, #64748b); margin-bottom: 14px;">Try selecting a different property type, location, or clearing search keywords.</p>
                <button onclick="resetHomeCategory()" style="background: var(--green, #1f4928); color: #fff; border: none; padding: 9px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.88rem; transition: background 0.2s;">Reset Filters</button>
            </div>
        `;
        updateMobilePropertiesExpandUi(0, false);
        return;
    }

    const hasFilter = hasActivePropertyFilters();

    grid.innerHTML = list.map((item, idx) => {
        const imgSrc = resolveCardImage(item.image_url, item);
        const detailUrl = getPropertyDetailUrl(item);
        const specsLot = item.lot_area ? `${item.lot_area} sqm` : (item.floor_area ? `${item.floor_area} sqm` : 'N/A');
        const rawStatus = String(item.status || 'Available').trim().toLowerCase();
        const isSold = rawStatus === 'sold' || rawStatus === 'sold out';
        const pricing = getPropertyPricingMeta(item);

        const displayTitle = formatPropertyTitle(item.title);

        const bedCount = Number(item.bedrooms || 0);
        const bathCount = Number(item.bathrooms || 0);
        const bedLabel = bedCount === 1 ? '1 Bed' : `${bedCount} Beds`;
        const bathLabel = bathCount === 1 ? '1 Bath' : `${bathCount} Baths`;

        const badgeHtml = isSold
            ? `<span class="property-status-badge badge-sold">Sold Out</span>`
            : '';
        const mobileExtraClass = idx >= 3 ? 'mobile-collapsed-card' : '';

        const safeDetailUrl = _escHtml(detailUrl);
        const safeImgSrc = _escHtml(imgSrc);
        const safeTitle = _escHtml(displayTitle);
        const safeLocation = _escHtml(item.location || '');
        const safeId = _escHtml(encodeURIComponent(String(item.id ?? '')));

        return `
        <article class="property-card ${isSold ? 'card-sold' : ''} ${mobileExtraClass} reveal-on-scroll" onclick="location.href='${safeDetailUrl}'">
            <div class="property-image">
                ${badgeHtml}
                <img src="${safeImgSrc}" alt="${safeTitle}" decoding="async" onerror="this.src='assets/images/property1.jpg'">
                <div class="card-actions">
                    <button class="card-icon-btn share-btn" type="button" aria-label="Share property"
                        onclick="event.stopPropagation(); copyPropertyLink('${safeId}')">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="18" cy="5" r="3"></circle>
                            <circle cx="6" cy="12" r="3"></circle>
                            <circle cx="18" cy="19" r="3"></circle>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="property-info">
                <h3 class="property-title">${safeTitle}</h3>
                <p class="property-location">${safeLocation}</p>
                <div class="property-details">
                    <span class="spec-pill"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" />
                        </svg> ${_escHtml(bedLabel)}</span>
                    <span class="spec-pill"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <path d="M9 6h6a2 2 0 0 1 2 2v10H7V8a2 2 0 0 1 2-2z" />
                        </svg> ${_escHtml(bathLabel)}</span>
                    <span class="spec-pill"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                        </svg> ${_escHtml(specsLot)}</span>
                </div>
                <div class="property-tcp-container">
                    <div class="property-price-row">
                        <strong class="property-price tabular-nums">${_escHtml(pricing.priceDisplay)}</strong>
                    </div>
                </div>
            </div>
        </article>
        `;
    }).join('');

    if (window.UrbanSession && typeof UrbanSession.initScrollReveals === 'function') {
        UrbanSession.initScrollReveals();
    }
    const viewH = window.innerHeight || document.documentElement.clientHeight || 900;
    grid.querySelectorAll('.reveal-on-scroll:not(.is-visible)').forEach(card => {
        const rect = card.getBoundingClientRect();
        if (rect.top < viewH) {
            card.classList.add('is-visible');
        }
    });
    updateMobilePropertiesExpandUi(list.length, hasFilter);
}

function filterPropertyList(list, category, location, keyword, maxPrice = null) {
    if (!list || !Array.isArray(list)) return [];

    const cat = (category || 'all').toLowerCase().trim();
    const loc = (location || 'all').toLowerCase().trim();
    const kw = (keyword || '').trim();

    return list.filter(item => {
        // 1. Category / Type filter
        if (cat !== 'all') {
            const type = (item.property_type || item.propertyType || '').toLowerCase();
            const title = (item.title || item.propertyName || '').toLowerCase();
            const desc = (item.description || '').toLowerCase();
            const price = Number(item.price) || 0;

            let matchesCat = false;
            if (cat === 'villas' || cat === 'villa') {
                matchesCat = type.includes('villa') || title.includes('villa');
            } else if (cat === 'apartments' || cat === 'apartment' || cat === 'condominium' || cat === 'condo') {
                matchesCat = type.includes('apartment') || type.includes('condo') || title.includes('apartment') || title.includes('condo') || title.includes('midori');
            } else if (cat === 'townhouses' || cat === 'townhouse') {
                matchesCat = type.includes('townhouse') || title.includes('townhouse') || title.includes('suerte') || title.includes('kathleen') || title.includes('liora') || title.includes('amore');
            } else if (cat === 'triplex' || cat === 'triplexes') {
                matchesCat = type.includes('triplex') || title.includes('triplex') || title.includes('airmen');
            } else if (cat === 'luxury' || cat === 'luxury villas') {
                matchesCat = type.includes('villa') || price >= 5000000 || title.includes('luxury') || desc.includes('luxury');
            } else if (cat === 'house-lot' || cat === 'house & lot') {
                matchesCat = type.includes('single') || type.includes('attached') || title.includes('benecia') || (type.includes('house') && !type.includes('townhouse'));
            } else if (cat === 'subdivision') {
                matchesCat = type.includes('subdivision') || title.includes('subdivision') || (item.subdivision_name && item.subdivision_name.trim().length > 0);
            } else {
                matchesCat = type.includes(cat) || title.includes(cat);
            }

            if (!matchesCat) return false;
        }

        // 2. Location filter
        if (loc !== 'all') {
            const cleanLoc = normalizeStr(loc);
            const itemLoc = normalizeStr(item.location || '');
            if (!itemLoc.includes(cleanLoc)) return false;
        }

        // 3. Keyword filter
        if (kw) {
            const cleanKw = normalizeStr(kw);
            const fields = [
                item.title,
                item.propertyName,
                item.location,
                item.property_type,
                item.propertyType,
                item.description,
                item.amenities
            ];
            const hasMatch = fields.some(f => normalizeStr(f).includes(cleanKw));
            if (!hasMatch) return false;
        }

        // 4. Max price / budget filter
        if (maxPrice !== null && maxPrice > 0) {
            const price = Number(item.price) || 0;
            if (price > maxPrice) return false;
        }

        return true;
    });
}

function sortPropertyList(list, sortKey) {
    const sorted = [...list];
    if (sortKey === 'price-low') {
        sorted.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (sortKey === 'price-high') {
        sorted.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else if (sortKey === 'newest') {
        sorted.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    } else if (sortKey === 'type') {
        sorted.sort((a, b) => {
            const typeA = (a.property_type || a.propertyType || '').toLowerCase();
            const typeB = (b.property_type || b.propertyType || '').toLowerCase();
            return typeA.localeCompare(typeB);
        });
    } else if (sortKey === 'featured') {
        const order = ['suerte', 'kathleen', 'liora', 'airmen', 'benecia', 'amore', 'midori'];
        sorted.sort((a, b) => {
            const titleA = (a.title || a.propertyName || '').toLowerCase();
            const titleB = (b.title || b.propertyName || '').toLowerCase();
            const idxA = order.findIndex(o => titleA.includes(o));
            const idxB = order.findIndex(o => titleB.includes(o));
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return (Number(a.id) || 0) - (Number(b.id) || 0);
        });
    }
    return sorted;
}

function applyCurrentFiltersAndRender() {
    let filtered = filterPropertyList(allCachedProperties, activeCategory, activeLocation, activeKeyword, activeMaxPrice);
    filtered = sortPropertyList(filtered, activeSort);
    renderFeaturedGrid(filtered);
}

function syncCategoryTabs(cat) {
    const tabs = document.querySelectorAll('.cat-tab');
    if (!tabs || tabs.length === 0) return;

    let target = (cat || 'all').toLowerCase().trim();
    if (target === 'villa') target = 'villas';
    else if (target === 'apartment') target = 'apartments';
    else if (target === 'townhouse') target = 'townhouses';

    let matched = false;
    tabs.forEach(tab => {
        const tabCat = tab.getAttribute('data-category');
        if (tabCat === target) {
            tab.classList.add('active');
            matched = true;
            try {
                tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } catch (e) { }
        } else {
            tab.classList.remove('active');
        }
    });

    if (!matched) {
        const allTab = document.querySelector('.cat-tab[data-category="all"]');
        if (allTab) allTab.classList.add('active');
    }
}

function scrollToFeatured() {
    const target = document.getElementById('properties');
    if (!target) return;

    const nav = document.querySelector('.navbar');
    const navHeight = nav ? nav.offsetHeight : 90;
    const targetY = target.getBoundingClientRect().top + window.pageYOffset - navHeight + 10;

    window.scrollTo({
        top: Math.max(0, targetY),
        behavior: 'smooth'
    });
}

function handleSearchSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const typeSelect = document.getElementById('typeFilter');
    const locSelect = document.getElementById('locationFilter');
    const sortSelect = document.getElementById('homeSortSelect');
    const keywordInput = document.getElementById('keyword');

    activeCategory = typeSelect ? typeSelect.value : 'all';
    activeLocation = locSelect ? locSelect.value : 'all';
    if (sortSelect) activeSort = sortSelect.value || 'featured';
    activeKeyword = keywordInput ? keywordInput.value.trim() : '';

    syncCategoryTabs(activeCategory);
    applyCurrentFiltersAndRender();
    scrollToFeatured();
}

const DEPRECATED_HOME_DEMO_TITLES = new Set([
    'velemont residences',
    'green valley villa',
    'horizon heights',
    'sunset heights executive townhouse',
    'maple ridge residence',
    'oakwood manor',
    'victoria park residences'
]);

function isDeprecatedHomeDemoItem(item) {
    if (!item || typeof item !== 'object') return true;
    const t = (item.title || item.propertyName || item.name || '').toLowerCase().trim();
    return !t || DEPRECATED_HOME_DEMO_TITLES.has(t);
}

function getAccreditedPropertyKey(item) {
    const t = (item && (item.title || item.propertyName || item.name) || '').toLowerCase();
    for (const key of ['suerte', 'kathleen', 'liora', 'airmen', 'benecia', 'amore', 'midori']) {
        if (t.includes(key)) return key;
    }
    return '';
}

let lastRenderedHomeSignature = '';
let lastSeenPropertySyncTs = '';

function getHomePropertyListSignature(list) {
    if (!Array.isArray(list)) return '';
    return list.map(item => {
        if (!item) return '';
        const img = String(item.image_url || item.image || '');
        return [
            item.id ?? '',
            String(item.title || item.propertyName || item.name || '').trim(),
            String(item.location || '').trim(),
            Number(item.price) || 0,
            String(item.status || '').trim(),
            String(item.property_type || item.propertyType || '').trim(),
            img.slice(0, 64),
            img.length
        ].join(':');
    }).join('|');
}

function mergeWithCanonicalHomeProperties(rawList) {
    if (!Array.isArray(rawList) || rawList.length === 0) {
        return [...CANONICAL_ACCREDITED_PROPERTIES];
    }
    const activeList = rawList.filter(item => !isDeprecatedHomeDemoItem(item));
    if (activeList.length === 0) {
        return [...CANONICAL_ACCREDITED_PROPERTIES];
    }
    const presentKeys = new Set(activeList.map(getAccreditedPropertyKey).filter(Boolean));
    const missingCanonical = CANONICAL_ACCREDITED_PROPERTIES.filter(item => {
        const key = getAccreditedPropertyKey(item);
        return key && !presentKeys.has(key);
    });
    return [...activeList, ...missingCanonical];
}

function getInitialCachedHomeProperties() {
    if (typeof apiGetCachedProperties === 'function') {
        const cached = apiGetCachedProperties();
        if (Array.isArray(cached) && cached.length > 0) {
            return mergeWithCanonicalHomeProperties(cached);
        }
    }
    try {
        for (const key of ['cached_live_properties', 'urbanScopeProperties', 'properties']) {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(parsed) && parsed.length > 0) {
                return mergeWithCanonicalHomeProperties(parsed);
            }
        }
    } catch (_) {}
    return [...CANONICAL_ACCREDITED_PROPERTIES];
}

function applyHomePropertiesState(nextList) {
    const merged = mergeWithCanonicalHomeProperties(nextList);
    const sig = getHomePropertyListSignature(merged);
    if (sig === lastRenderedHomeSignature && allCachedProperties && allCachedProperties.length > 0) {
        return false;
    }
    lastRenderedHomeSignature = sig;
    allCachedProperties = merged;
    if (window.UrbanCalculator && typeof UrbanCalculator.updateBudgetMatcherProjects === 'function') {
        UrbanCalculator.updateBudgetMatcherProjects(allCachedProperties);
    }
    applyCurrentFiltersAndRender();
    return true;
}

async function loadHomeProperties(category = 'all', options = {}) {
    activeCategory = category;

    // 1. Instant 0ms synchronous hydration from local browser cache (+ canonical defaults)
    if (!allCachedProperties || allCachedProperties.length === 0 || options.fromSyncEvent) {
        applyHomePropertiesState(getInitialCachedHomeProperties());
    } else {
        applyCurrentFiltersAndRender();
    }

    // 2. Concurrent fast local backend fetch (~3ms on localhost) + full live API reconciliation
    const localFastPromise = (typeof apiGetLocalPropertiesFast === 'function')
        ? apiGetLocalPropertiesFast().catch(() => null)
        : Promise.resolve(null);

    const fullLivePromise = (typeof apiGetProperties === 'function')
        ? apiGetProperties({}, Boolean(options.forceRefresh)).catch(e => {
            console.warn('Live property fetch notice:', e);
            return null;
        })
        : Promise.resolve(null);

    let fullResolved = false;

    localFastPromise.then(localData => {
        if (fullResolved || !Array.isArray(localData) || localData.length === 0) return;
        const activeLocal = localData.filter(item => !isDeprecatedHomeDemoItem(item));
        if (activeLocal.length === 0) return;
        // Preserve any non-local remote items already in cache while surfacing local creations immediately
        const localIds = new Set(activeLocal.map(p => String(p.id)));
        const localTitles = new Set(activeLocal.map(p => String(p.title || p.propertyName || '').toLowerCase().trim()).filter(Boolean));
        const extraCached = (allCachedProperties || []).filter(item => {
            const key = getAccreditedPropertyKey(item);
            if (key) return false;
            const t = String(item.title || item.propertyName || '').toLowerCase().trim();
            return !localIds.has(String(item.id)) && (!t || !localTitles.has(t));
        });
        applyHomePropertiesState([...activeLocal, ...extraCached]);
    });

    const data = await fullLivePromise;
    fullResolved = true;
    if (data && Array.isArray(data) && data.length > 0) {
        applyHomePropertiesState(data);
    }
}

// Category tabs click listeners and initialization
/**
 * Custom Search Select Dropdown for the Floating Hero Search Bar
 * Replaces unstyled native OS select dropdowns with an on-brand, animated custom menu.
 */
function initSearchSelect(selectEl) {
    if (!selectEl) return;
    if (selectEl.dataset.searchSelectInitialized === 'true') return;
    selectEl.dataset.searchSelectInitialized = 'true';

    selectEl.classList.add('search-select-source');

    const wrap = document.createElement('div');
    wrap.className = 'search-select-wrap';
    selectEl.parentNode.insertBefore(wrap, selectEl);
    wrap.appendChild(selectEl);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'search-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const valueSpan = document.createElement('span');
    valueSpan.className = 'search-select-value';

    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'search-select-arrow';
    arrowSpan.setAttribute('aria-hidden', 'true');
    arrowSpan.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    `;

    trigger.appendChild(valueSpan);
    trigger.appendChild(arrowSpan);
    wrap.appendChild(trigger);

    let dropdownEl = null;

    function getOptionIcon(val, text) {
        const v = String(val || '').toLowerCase();
        const t = String(text || '').toLowerCase();

        // Property types
        if (v === 'all' && (t.includes('property') || t.includes('all properties') || t.includes('types'))) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`;
        }
        if (v === 'townhouse' || t.includes('townhouse')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 10l5-4 5 4v11H3V10zm10 0l4-3.2 4 3.2V21h-8"/></svg>`;
        }
        if (v === 'triplex' || t.includes('triplex')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="17" x2="15" y2="17"/></svg>`;
        }
        if (v === 'condominium' || v === 'condo' || t.includes('condo')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="9" y1="8" x2="9" y2="8.01"/><line x1="15" y1="8" x2="15" y2="8.01"/><line x1="9" y1="12" x2="9" y2="12.01"/><line x1="15" y1="12" x2="15" y2="12.01"/><path d="M9 21v-4h6v4"/></svg>`;
        }
        if (v === 'house-lot' || t.includes('house')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
        }

        // Locations
        if (v === 'all' && (t.includes('location') || t.includes('all locations'))) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`;
        }
        if (t.includes('piñas') || t.includes('pinas') || t.includes('bacoor') || t.includes('naic') || t.includes('trece') || t.includes('dasmari') || t.includes('cavite')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
        }

        // Sort options
        if (v === 'featured' || t.includes('featured')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
        }
        if (v === 'type' || t === 'property type') {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 10l5-4 5 4v11H3V10zm10 0l4-3.2 4 3.2V21h-8"/></svg>`;
        }
        if (v === 'newest' || t.includes('newest')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>`;
        }
        if (v === 'price-low' || t.includes('low to high')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`;
        }
        if (v === 'price-high' || t.includes('high to low')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
        }

        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>`;
    }

    function updateDisplay() {
        const selectedOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
        if (!selectedOpt) return;
        const icon = getOptionIcon(selectedOpt.value, selectedOpt.text);
        valueSpan.innerHTML = `<span class="search-select-icon">${icon}</span><span class="search-select-text">${_escHtml(selectedOpt.text)}</span>`;
    }

    function closeDropdown() {
        wrap.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        const searchBar = wrap.closest('.search-bar');
        if (searchBar) searchBar.classList.remove('has-open-dropdown');
        const heroSection = wrap.closest('.hero');
        if (heroSection) heroSection.classList.remove('has-open-dropdown');
        if (dropdownEl) {
            dropdownEl.remove();
            dropdownEl = null;
        }
    }

    function openDropdown() {
        // Close any other open dropdowns across the page
        document.querySelectorAll('.search-select-wrap.is-open, .sort-select-wrap.is-open').forEach(w => w.classList.remove('is-open'));
        document.querySelectorAll('.search-select-dropdown, .sort-select-dropdown').forEach(d => d.remove());
        document.querySelectorAll('.search-bar.has-open-dropdown, .hero.has-open-dropdown, .featured-header-row.has-open-dropdown, .home-sort-control.has-open-dropdown').forEach(el => el.classList.remove('has-open-dropdown'));

        wrap.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        const searchBar = wrap.closest('.search-bar');
        if (searchBar) searchBar.classList.add('has-open-dropdown');
        const heroSection = wrap.closest('.hero');
        if (heroSection) heroSection.classList.add('has-open-dropdown');

        dropdownEl = document.createElement('div');
        dropdownEl.className = 'search-select-dropdown';
        dropdownEl.setAttribute('role', 'listbox');

        Array.from(selectEl.options).forEach((opt, idx) => {
            const isSelected = idx === selectEl.selectedIndex;
            const optDiv = document.createElement('div');
            optDiv.className = 'search-select-option' + (isSelected ? ' is-selected' : '');
            optDiv.setAttribute('role', 'option');
            optDiv.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            optDiv.setAttribute('data-value', opt.value);

            const iconSvg = getOptionIcon(opt.value, opt.text);
            let optionTextHtml = '';
            if (opt.text.includes('Trece Martires') || (opt.text.includes(',') && opt.text.length > 20)) {
                const commaIdx = opt.text.indexOf(',');
                const main = opt.text.slice(0, commaIdx).trim() + ',';
                const sub = opt.text.slice(commaIdx + 1).trim();
                optionTextHtml = `
                    <div class="search-select-option-text search-select-option-stacked">
                        <span class="search-select-option-main">${_escHtml(main)}</span>
                        <span class="search-select-option-sub">${_escHtml(sub)}</span>
                    </div>
                `;
            } else {
                optionTextHtml = `<span class="search-select-option-text">${_escHtml(opt.text)}</span>`;
            }

            optDiv.innerHTML = `
                <div class="search-select-option-content">
                    <span class="search-select-option-icon">${iconSvg}</span>
                    ${optionTextHtml}
                </div>
                <span class="search-select-check" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </span>
            `;

            optDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                selectEl.value = opt.value;
                updateDisplay();
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                selectEl.dispatchEvent(new Event('input', { bubbles: true }));
                closeDropdown();
            });

            dropdownEl.appendChild(optDiv);
        });

        wrap.appendChild(dropdownEl);
    }

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (wrap.classList.contains('is-open')) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    selectEl.addEventListener('change', updateDisplay);

    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) {
            closeDropdown();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && wrap.classList.contains('is-open')) {
            closeDropdown();
            trigger.focus();
        }
    });

    // Initial display
    updateDisplay();
}

/**
 * Custom Sort Dropdown Component for Featured Properties Grid
 * Replaces unstyled native OS sort select with an on-brand, animated custom menu.
 */
function initSortSelect(selectEl) {
    if (!selectEl) return;
    if (selectEl.dataset.sortSelectInitialized === 'true') return;
    selectEl.dataset.sortSelectInitialized = 'true';

    selectEl.classList.add('sort-select-source');

    const wrap = document.createElement('div');
    wrap.className = 'sort-select-wrap';
    selectEl.parentNode.insertBefore(wrap, selectEl);
    wrap.appendChild(selectEl);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sort-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const valueSpan = document.createElement('span');
    valueSpan.className = 'sort-select-value';

    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'sort-select-arrow';
    arrowSpan.setAttribute('aria-hidden', 'true');
    arrowSpan.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    `;

    trigger.appendChild(valueSpan);
    trigger.appendChild(arrowSpan);
    wrap.appendChild(trigger);

    let dropdownEl = null;

    function getSortOptionIcon(val, text) {
        const v = String(val || '').toLowerCase();
        const t = String(text || '').toLowerCase();

        if (v === 'featured' || t.includes('featured')) {
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
        }
        if (v === 'type' || t.includes('type')) {
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 10l5-4 5 4v11H3V10zm10 0l4-3.2 4 3.2V21h-8"/></svg>`;
        }
        if (v === 'newest' || t.includes('newest')) {
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>`;
        }
        if (v === 'price-low' || t.includes('low to high')) {
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`;
        }
        if (v === 'price-high' || t.includes('high to low')) {
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
        }

        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>`;
    }

    function updateDisplay() {
        const selectedOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
        if (!selectedOpt) return;
        const icon = getSortOptionIcon(selectedOpt.value, selectedOpt.text);
        valueSpan.innerHTML = `<span class="sort-select-icon">${icon}</span><span class="sort-select-text">${_escHtml(selectedOpt.text)}</span>`;
    }

    function closeDropdown() {
        wrap.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        const headerRow = wrap.closest('.featured-header-row');
        if (headerRow) headerRow.classList.remove('has-open-dropdown');
        const sortControl = wrap.closest('.home-sort-control');
        if (sortControl) sortControl.classList.remove('has-open-dropdown');
        if (dropdownEl) {
            dropdownEl.remove();
            dropdownEl = null;
        }
    }

    function openDropdown() {
        // Close any other open dropdowns across the page
        document.querySelectorAll('.search-select-wrap.is-open, .sort-select-wrap.is-open').forEach(w => w.classList.remove('is-open'));
        document.querySelectorAll('.featured-header-row.has-open-dropdown, .home-sort-control.has-open-dropdown, .search-bar.has-open-dropdown').forEach(el => el.classList.remove('has-open-dropdown'));
        document.querySelectorAll('.search-select-dropdown, .sort-select-dropdown').forEach(d => d.remove());

        wrap.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        const headerRow = wrap.closest('.featured-header-row');
        if (headerRow) headerRow.classList.add('has-open-dropdown');
        const sortControl = wrap.closest('.home-sort-control');
        if (sortControl) sortControl.classList.add('has-open-dropdown');

        dropdownEl = document.createElement('div');
        dropdownEl.className = 'sort-select-dropdown';
        dropdownEl.setAttribute('role', 'listbox');

        Array.from(selectEl.options).forEach((opt, idx) => {
            const isSelected = idx === selectEl.selectedIndex;
            const optDiv = document.createElement('div');
            optDiv.className = 'sort-select-option' + (isSelected ? ' is-selected' : '');
            optDiv.setAttribute('role', 'option');
            optDiv.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            optDiv.setAttribute('data-value', opt.value);

            const iconSvg = getSortOptionIcon(opt.value, opt.text);
            optDiv.innerHTML = `
                <div class="sort-select-option-content">
                    <span class="sort-select-option-icon">${iconSvg}</span>
                    <span class="sort-select-option-text">${_escHtml(opt.text)}</span>
                </div>
                <span class="sort-select-check" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </span>
            `;

            optDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                selectEl.value = opt.value;
                updateDisplay();
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                closeDropdown();
            });

            dropdownEl.appendChild(optDiv);
        });

        wrap.appendChild(dropdownEl);
    }

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (wrap.classList.contains('is-open')) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    selectEl.addEventListener('change', updateDisplay);

    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) {
            closeDropdown();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && wrap.classList.contains('is-open')) {
            closeDropdown();
            trigger.focus();
        }
    });

    // Initial display
    updateDisplay();
}

function setupHomepagePropertySyncListeners() {
    try {
        lastSeenPropertySyncTs = localStorage.getItem('urbanscope_properties_sync_ts') || '';
    } catch (_) {}

    const syncNow = () => {
        try {
            lastSeenPropertySyncTs = localStorage.getItem('urbanscope_properties_sync_ts') || '';
        } catch (_) {}
        loadHomeProperties(activeCategory, { forceRefresh: true, fromSyncEvent: true });
    };

    try {
        if (typeof BroadcastChannel === 'function') {
            const ch = new BroadcastChannel('urbanscope_properties');
            ch.addEventListener('message', (ev) => {
                if (ev && ev.data && ev.data.type === 'properties_updated') {
                    syncNow();
                }
            });
        }
    } catch (_) {}

    window.addEventListener('storage', (e) => {
        if (!e || !e.key) return;
        if (e.key === 'urbanscope_properties_sync_ts' ||
            e.key === 'cached_live_properties' ||
            e.key === 'urbanScopeProperties' ||
            e.key === 'properties') {
            syncNow();
        }
    });

    window.addEventListener('pageshow', (e) => {
        if (e && e.persisted) {
            syncNow();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        try {
            const currentTs = localStorage.getItem('urbanscope_properties_sync_ts') || '';
            if (currentTs && currentTs !== lastSeenPropertySyncTs) {
                syncNow();
            }
        } catch (_) {}
    });
}

function initHomepage() {
    // 0. Initialize Quick Home Affordability & Budget Matcher with cached live snapshot on first paint
    const initialSnapshot = getInitialCachedHomeProperties();
    if (window.UrbanCalculator && typeof UrbanCalculator.initHomepageBudgetMatcher === 'function') {
        UrbanCalculator.initHomepageBudgetMatcher('homepageBudgetMatcher', { projects: initialSnapshot });
    }

    // 1. Hydrate grid cleanly at 0ms + reconcile with live backend
    loadHomeProperties('all');
    setupHomepagePropertySyncListeners();

    // 2. Intercept search bar form submission & button click (prevents page reload / navigation)
    const searchForm = document.getElementById('propertySearch');
    if (searchForm) {
        searchForm.addEventListener('submit', handleSearchSubmit);
    }
    const searchBtn = document.querySelector('.search-submit');
    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleSearchSubmit(e);
        });
    }

    // Real-time live search on keyword typing
    const keywordInput = document.getElementById('keyword');
    if (keywordInput) {
        let kwDebounce = null;
        keywordInput.addEventListener('input', (e) => {
            clearTimeout(kwDebounce);
            kwDebounce = setTimeout(() => {
                activeKeyword = e.target.value.trim();
                applyCurrentFiltersAndRender();
            }, 180);
        });
        keywordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSearchSubmit(e);
            }
        });
    }

    // 3. Category tabs interaction
    document.querySelectorAll('.cat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const category = tab.getAttribute('data-category') || 'all';
            activeCategory = category;

            // Also keep search form type filter in sync
            const typeSelect = document.getElementById('typeFilter');
            if (typeSelect) {
                if (category === 'all') typeSelect.value = 'all';
                else if (category === 'villas') typeSelect.value = 'villa';
                else if (category === 'apartments') typeSelect.value = 'apartment';
                else if (category === 'townhouses') typeSelect.value = 'townhouse';
                else typeSelect.value = category;
                typeSelect.dispatchEvent(new Event('change'));
            }

            applyCurrentFiltersAndRender();
        });
    });

    // 4. Sort dropdown
    const sortSelect = document.getElementById('homeSortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            activeSort = e.target.value;
            applyCurrentFiltersAndRender();
        });
        initSearchSelect(sortSelect);
    }

    // Real-time search bar dropdown filters
    const locFilter = document.getElementById('locationFilter');
    if (locFilter) {
        locFilter.addEventListener('change', (e) => {
            activeLocation = e.target.value;
            applyCurrentFiltersAndRender();
        });
    }

    const typeFilter = document.getElementById('typeFilter');
    if (typeFilter) {
        typeFilter.addEventListener('change', (e) => {
            activeCategory = e.target.value;
            syncCategoryTabs(activeCategory);
            applyCurrentFiltersAndRender();
        });
    }

    // Initialize custom UrbanScope search bar dropdowns (Property Type & Location)
    if (typeFilter) initSearchSelect(typeFilter);
    if (locFilter) initSearchSelect(locFilter);

    // 5. Check if query params were passed on page load
    const urlParams = new URLSearchParams(window.location.search);
    const urlType = urlParams.get('type');
    const urlLoc = urlParams.get('location');
    const urlKw = urlParams.get('keyword') || urlParams.get('search');

    if (urlType || urlLoc || urlKw) {
        if (urlType && urlType !== 'all') {
            activeCategory = urlType;
            const typeSelect = document.getElementById('typeFilter');
            if (typeSelect) typeSelect.value = urlType;
            syncCategoryTabs(urlType);
        }
        if (urlLoc && urlLoc !== 'all') {
            activeLocation = urlLoc;
            const locSelect = document.getElementById('locationFilter');
            if (locSelect) locSelect.value = urlLoc;
        }
        if (urlKw) {
            activeKeyword = urlKw;
            const kwInput = document.getElementById('keyword');
            if (kwInput) kwInput.value = urlKw;
        }
        applyCurrentFiltersAndRender();
    }

    // 6. Smooth scroll to Discover Our Featured Properties on "Properties" click
    document.querySelectorAll('a[href="#properties"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = document.getElementById('properties');
            if (section) {
                section.scrollIntoView({ behavior: 'smooth' });
                history.pushState(null, null, '#properties');
            }
        });
    });

    // 8. FAQs Accordion Interactive Toggle
    const faqItems = document.querySelectorAll('.faq-item');
    const faqsAccordion = document.getElementById('faqsAccordion');
    const faqExpandBtn = document.getElementById('mobileShowAllFaqsBtn');
    const faqExpandWrap = document.getElementById('mobileFaqsExpandWrap');

    faqItems.forEach((item, idx) => {
        if (idx >= 4) {
            item.classList.add('mobile-faq-extra');
        }
        const questionBtn = item.querySelector('.faq-question');
        if (questionBtn) {
            questionBtn.addEventListener('click', () => {
                const isActive = item.classList.contains('active');

                // Close other items for a clean, focused accordion experience
                faqItems.forEach(other => {
                    other.classList.remove('active');
                    const otherBtn = other.querySelector('.faq-question');
                    if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
                });

                if (!isActive) {
                    item.classList.add('active');
                    questionBtn.setAttribute('aria-expanded', 'true');
                }
            });
        }
    });

    if (faqExpandWrap && faqExpandBtn) {
        if (faqItems.length <= 4) {
            faqExpandWrap.hidden = true;
        } else {
            faqExpandBtn.textContent = `Show All ${faqItems.length} Questions`;
            faqExpandBtn.addEventListener('click', () => {
                const isExpanded = faqsAccordion ? faqsAccordion.classList.toggle('mobile-faqs-expanded') : false;
                faqExpandBtn.setAttribute('aria-expanded', String(isExpanded));
                faqExpandBtn.textContent = isExpanded
                    ? 'Show Fewer Questions'
                    : `Show All ${faqItems.length} Questions`;
            });
        }
    }

    const propsExpandBtn = document.getElementById('mobileShowAllPropsBtn');
    if (propsExpandBtn) {
        propsExpandBtn.addEventListener('click', () => {
            showAllPropertiesOnMobile = !showAllPropertiesOnMobile;
            const visibleCount = document.querySelectorAll('#propertyGrid .property-card').length;
            updateMobilePropertiesExpandUi(visibleCount, hasActivePropertyFilters());
        });
    }

    const aboutReadMoreBtn = document.getElementById('aboutReadMoreBtn');
    const aboutBioExtra = document.getElementById('aboutBioExtra');
    if (aboutReadMoreBtn && aboutBioExtra) {
        aboutReadMoreBtn.addEventListener('click', () => {
            const isExpanded = aboutBioExtra.classList.toggle('is-expanded');
            aboutReadMoreBtn.setAttribute('aria-expanded', String(isExpanded));
            aboutReadMoreBtn.textContent = isExpanded ? 'Show less' : 'Read full bio';
        });
    }

    // 9. Smooth scroll for FAQs anchor
    document.querySelectorAll('a[href="#faqs"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = document.getElementById('faqs');
            if (section) {
                section.scrollIntoView({ behavior: 'smooth' });
                history.pushState(null, null, '#faqs');
            }
        });
    });

    // 10. Consultation Intent Modal Controller
    initConsultationIntentModal();

    // 11. Dynamic Agent Profile & Contact Information (synced with admin settings)
    initDynamicAgentDetails();
}

function initConsultationIntentModal() {
    const modal = document.getElementById('consultationIntentModal');
    const closeBtn = document.getElementById('closeIntentModalBtn');
    if (!modal) return;

    function openModal(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        }
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }

    // Capture clicks on CTA consultation triggers (CTA button, footer consultation)
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('#ctaConsultBtn, .cta-consult-btn, a[href="pages/inquiry/inquiry.html"]');
        if (trigger && !trigger.closest('#consultationIntentModal')) {
            openModal(e);
        }
    }, true);

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
            closeModal();
        }
    });
}

function renderHomepageAgentDetails(profile) {
    if (!profile) return;

    const rawName = profile.name || profile.full_name || 'Miriam Lobren';
    const cleanName = String(rawName).replace(/\s*\((?:Admin|Administrator)\)\s*$/i, '').trim() || rawName;
    let title = (profile.title && profile.title.trim()) || 'Real Estate Salesperson';
    if (/^(?:licensed real estate broker\s*\/\s*agent|real estate agent|real estate sales person)$/i.test(title)) {
        title = 'Real Estate Salesperson';
    }
    const rawBrok = String(profile.brokerage || '').trim();
    let brokerage = rawBrok;
    if (!brokerage || /^(?:urbanscope(?:\s+realty)?|cdmiranda\s*realty|cd\s*miranda\s*realty)$/i.test(brokerage)) {
        brokerage = 'CD Miranda Realty';
    }
    const phone = profile.phone || '+63 918 964 5434';
    const email = profile.email || 'miriamalobren@gmail.com';
    const bio = profile.bio || 'Serving Las Piñas, Cavite, and surrounding prime locations with high-integrity real estate solutions.';
    const avatarUrl = profile.avatar_url || 'assets/images/agent.jpg';
    const cleanDigits = phone.replace(/[^\d+]/g, '');

    // 1. Navigation Brand
    const navName = document.getElementById('navAgentName');
    if (navName) navName.textContent = cleanName;
    const navTitle = document.getElementById('navAgentTitle');
    if (navTitle) navTitle.textContent = title.toUpperCase();

    // Browser tab document title
    if (cleanName && title) {
        document.title = `${cleanName} | ${title} – Las Piñas & Cavite Properties`;
    }

    // 2. About Me Section
    const aboutName = document.getElementById('aboutAgentName');
    if (aboutName) aboutName.textContent = cleanName;
    const aboutRole = document.getElementById('aboutAgentRoleText');
    if (aboutRole) aboutRole.textContent = title.toLowerCase();
    const aboutBrokerage = document.getElementById('aboutAgentBrokerage');
    if (aboutBrokerage) aboutBrokerage.textContent = brokerage;
    const aboutBio = document.getElementById('aboutAgentBioText');
    if (aboutBio && bio) {
        aboutBio.textContent = String(bio)
            .replace(/cdmiranda\s*realty/gi, 'CD Miranda Realty')
            .replace(/real estate sales person/gi, 'real estate salesperson');
    }
    const aboutPhoto = document.getElementById('aboutAgentPhoto');
    if (aboutPhoto && avatarUrl) {
        aboutPhoto.src = avatarUrl;
        aboutPhoto.alt = `${cleanName} - ${title}`;
    }
    const aboutMobileAvatar = document.getElementById('aboutMobileAvatar');
    if (aboutMobileAvatar && avatarUrl) {
        aboutMobileAvatar.src = avatarUrl;
    }

    // 3. FAQs Section
    const faqName = document.getElementById('faqAgentName');
    if (faqName) faqName.textContent = cleanName;
    const faqPhone = document.getElementById('faqAgentPhone');
    if (faqPhone) faqPhone.textContent = phone;

    // 4. CTA Banner
    const ctaName = document.getElementById('ctaAgentName');
    if (ctaName) ctaName.textContent = cleanName;
    const ctaBrokerage = document.getElementById('ctaAgentBrokerage');
    if (ctaBrokerage) ctaBrokerage.textContent = brokerage;

    // 5. Footer Details
    const footerName = document.getElementById('footerAgentName');
    if (footerName) footerName.textContent = cleanName;
    const footerBio = document.getElementById('footerAgentBio');
    if (footerBio) {
        const defaultFooterBio = 'Licensed real estate assistance for Cavite & Las Piñas premier subdivisions and townhouses. Connecting families to sustainable, high-value dream homes.';
        footerBio.textContent = (profile.footer_bio && String(profile.footer_bio).trim()) || defaultFooterBio;
    }
    const licenseNote = document.getElementById('footerAgentLicense');
    const rawLic = (profile.license_number || profile.license || '').trim();
    const isDummyLic = /^prc\s*(?:reb|res)?\s*#?\s*(?:402|0031892)$/i.test(rawLic);
    const licNum = isDummyLic ? '' : rawLic;
    if (licenseNote) {
        if (licNum) {
            licenseNote.textContent = `PRC Accreditation No. ${licNum} · ${brokerage}`;
            licenseNote.style.display = 'block';
        } else {
            licenseNote.style.display = 'none';
        }
    }
    const footerPhone = document.getElementById('footerAgentPhone');
    if (footerPhone) {
        footerPhone.textContent = phone;
        footerPhone.href = `tel:${cleanDigits}`;
    }
    const footerEmail = document.getElementById('footerAgentEmail');
    if (footerEmail) {
        footerEmail.textContent = email;
        footerEmail.href = `mailto:${email}`;
    }
}

async function initDynamicAgentDetails() {
    // Immediate render from localStorage (0ms latency, eliminates any flash of old details)
    let localProfile = null;
    try {
        localProfile = JSON.parse(localStorage.getItem('urbanscope_admin_profile') || 'null');
        if (!localProfile) {
            const adminUser = JSON.parse(localStorage.getItem('adminUser') || 'null');
            if (adminUser && (adminUser.role === 'admin' || adminUser.email === 'admin.realestate@gmail.com' || adminUser.email === 'miriamalobren@gmail.com' || adminUser.email === 'miriam@gmail.com' || adminUser.email === 'miriamlobren@gmail.com')) {
                localProfile = adminUser;
            }
        }
    } catch (e) { }

    if (localProfile) {
        let changed = false;
        if (localProfile.title && /^(?:licensed real estate broker\s*\/\s*agent|real estate agent|real estate sales person)$/i.test(localProfile.title.trim())) {
            localProfile.title = 'Real Estate Salesperson';
            changed = true;
        }
        if (!localProfile.brokerage || /^(?:urbanscope(?:\s+realty)?|cdmiranda\s*realty)$/i.test(String(localProfile.brokerage).trim())) {
            localProfile.brokerage = 'CD Miranda Realty';
            changed = true;
        }
        if (localProfile.license && /^prc\s*(?:reb|res)?\s*#?\s*(?:402|0031892)$/i.test(String(localProfile.license).trim())) {
            localProfile.license = '';
            changed = true;
        }
        if (localProfile.license_number && /^prc\s*(?:reb|res)?\s*#?\s*(?:402|0031892)$/i.test(String(localProfile.license_number).trim())) {
            localProfile.license_number = '';
            changed = true;
        }
        if (changed) {
            try {
                localStorage.setItem('urbanscope_admin_profile', JSON.stringify(localProfile));
            } catch (e) {}
        }
        renderHomepageAgentDetails(localProfile);
    }

    // Background fetch from API Gateway (FastAPI local backend + Supabase Cloud)
    if (typeof window.apiGetLeadAgentProfile === 'function') {
        try {
            const remoteProfile = await window.apiGetLeadAgentProfile();
            if (remoteProfile) {
                renderHomepageAgentDetails(remoteProfile);
            }
        } catch (err) {
            console.warn('Background agent profile fetch note:', err);
        }
    }

    // Real-time synchronization across browser tabs (when admin updates profile in admin settings)
    window.addEventListener('storage', (e) => {
        if (e.key === 'urbanscope_admin_profile' || e.key === 'adminUser') {
            try {
                const updated = JSON.parse(e.newValue || '{}');
                if (updated && (updated.name || updated.title || updated.email || updated.phone || updated.avatar_url)) {
                    renderHomepageAgentDetails(updated);
                }
            } catch (err) { }
        }
    });

    // Custom event listener within the same window / tab
    window.addEventListener('urbanscope:profileUpdated', (e) => {
        if (e.detail) {
            renderHomepageAgentDetails(e.detail);
        }
    });

    // Re-sync when user switches back to this tab (focus & tab visibility)
    const handleReSync = () => {
        try {
            const p = JSON.parse(localStorage.getItem('urbanscope_admin_profile') || 'null');
            if (p) renderHomepageAgentDetails(p);
        } catch (err) { }
    };
    window.addEventListener('focus', handleReSync);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) handleReSync();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomepage);
} else {
    initHomepage();
}

