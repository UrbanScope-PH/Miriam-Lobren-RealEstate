/**
 * UrbanScope - Property Detail & Gallery Controller
 * Powers the interactive photo carousel, thumbnail selector, and dynamic database loader.
 */

let currentSlide = 0;
let galleryImages = [];

/* Lightbox State Variables */
let lightboxOpen = false;
let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let documentModalPreviousOverflow = null;

function _escDetailHtml(val) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(val);
    return String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _safeDetailImg(url, fallback = '../../assets/images/property1.jpg') {
    const raw = String(url || '').trim();
    if (!raw) return fallback;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(raw)) return raw;
    const cleaned = raw.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');
    if (cleaned.startsWith('assets/images/') && !cleaned.includes('..')) {
        return '../../' + cleaned;
    }
    return fallback;
}

function initGallery() {
    const mainImg = document.getElementById('mainGalleryImg');
    const thumbs = document.querySelectorAll('.thumb');

    // Use window.galleryImages if specified on the page, or collect from thumbnail elements
    if (Array.isArray(window.galleryImages) && window.galleryImages.length > 0) {
        galleryImages = window.galleryImages;
    } else if (thumbs.length > 0) {
        galleryImages = Array.from(thumbs).map(t => {
            const img = t.querySelector('img');
            return img ? img.getAttribute('src') : '';
        }).filter(Boolean);
    } else if (mainImg) {
        galleryImages = [mainImg.src];
    }

    document.querySelectorAll('.carousel-arrow').forEach(btn => {
        btn.style.display = galleryImages.length <= 1 ? 'none' : '';
    });

    if (mainImg) {
        mainImg.style.cursor = 'zoom-in';
        mainImg.setAttribute('title', 'Click to zoom image');
        mainImg.onclick = (e) => {
            e && e.preventDefault && e.preventDefault();
            openLightbox(currentSlide);
        };
    }

    // Attach click listeners to thumbs for resilience
    thumbs.forEach((thumb, idx) => {
        thumb.style.cursor = 'pointer';
        thumb.addEventListener('click', (e) => {
            e.preventDefault();
            const img = thumb.querySelector('img');
            selectThumb(idx, img ? img.getAttribute('src') : null);
        });
    });

    const carousel = document.querySelector('.main-carousel');
    if (carousel && !carousel.querySelector('.carousel-zoom-btn')) {
        const zoomBtn = document.createElement('button');
        zoomBtn.className = 'carousel-zoom-btn';
        zoomBtn.type = 'button';
        zoomBtn.setAttribute('aria-label', 'Zoom image');
        zoomBtn.setAttribute('title', 'Click to zoom image');
        zoomBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
            <span>Zoom</span>
        `;
        zoomBtn.onclick = (e) => {
            e.stopPropagation();
            openLightbox(currentSlide);
        };
        carousel.appendChild(zoomBtn);
    }
}

function updateGallery() {
    const mainImg = document.getElementById('mainGalleryImg');
    const thumbs = document.querySelectorAll('.thumb');
    if (!mainImg || galleryImages.length === 0) return;

    mainImg.src = galleryImages[currentSlide];
    document.querySelectorAll('.carousel-arrow').forEach(btn => {
        btn.style.display = galleryImages.length <= 1 ? 'none' : '';
    });
    thumbs.forEach((t, i) => {
        if (i === currentSlide) t.classList.add('active');
        else t.classList.remove('active');
    });

    if (lightboxOpen) {
        syncLightboxImage();
    }
}

function changeSlide(direction) {
    if (galleryImages.length === 0) initGallery();
    if (galleryImages.length === 0) return;
    currentSlide = (currentSlide + direction + galleryImages.length) % galleryImages.length;
    updateGallery();
}

function selectThumb(index, src) {
    if (galleryImages.length === 0) initGallery();
    currentSlide = index;
    if (src && (!galleryImages[index] || galleryImages[index] !== src)) {
        galleryImages[index] = src;
    }
    updateGallery();
}

function isSoldOutProperty(property) {
    const status = String(property?.status || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
    return status === 'sold' || status === 'sold out';
}

function updatePropertyInquiryButton(property) {
    const inquiryBtn = document.querySelector('.submit-inquiry-btn');
    if (!inquiryBtn || !property) return;
    const soldOut = isSoldOutProperty(property);
    const statusBadge = document.querySelector('.status-badge');
    if (statusBadge) {
        statusBadge.textContent = soldOut ? 'Sold Out' : (property.status || 'Available');
        statusBadge.className = `status-badge ${String(property.status || 'Available').trim().toLowerCase() === 'available' ? 'available' : 'sold'}`;
    }

    if (!inquiryBtn.dataset.soldOutGuard) {
        inquiryBtn.addEventListener('click', (event) => {
            if (inquiryBtn.getAttribute('aria-disabled') === 'true') event.preventDefault();
        });
        inquiryBtn.dataset.soldOutGuard = 'true';
    }

    const label = inquiryBtn.querySelector('span');
    const inquiryDescription = document.querySelector('.inquiry-card-header p');
    if (inquiryDescription && !inquiryDescription.dataset.availableText) {
        inquiryDescription.dataset.availableText = inquiryDescription.textContent;
    }

    if (soldOut) {
        inquiryBtn.href = '#';
        inquiryBtn.setAttribute('aria-disabled', 'true');
        inquiryBtn.setAttribute('tabindex', '-1');
        inquiryBtn.classList.add('inquiry-closed');
        if (label) label.textContent = 'Sold Out — Inquiries Closed';
        if (inquiryDescription) inquiryDescription.textContent = 'This property is sold out and is no longer accepting inquiries.';
        return;
    }

    inquiryBtn.href = property.id
        ? `../inquiry/inquiry.html?type=property&id=${encodeURIComponent(property.id)}`
        : `../inquiry/inquiry.html?type=property&title=${encodeURIComponent(property.title || '')}`;
    inquiryBtn.removeAttribute('aria-disabled');
    inquiryBtn.removeAttribute('tabindex');
    inquiryBtn.classList.remove('inquiry-closed');
    if (label) label.textContent = 'Submit Inquiry';
    if (inquiryDescription && inquiryDescription.dataset.availableText) {
        inquiryDescription.textContent = inquiryDescription.dataset.availableText;
    }
}

async function loadStaticPropertyAvailability() {
    if (typeof apiGetProperties !== 'function') return;

    try {
        const properties = await apiGetProperties();
        const pageTitle = document.querySelector('.property-title')?.textContent || '';
        const normalizeTitle = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const normalizedPageTitle = normalizeTitle(pageTitle);
        const property = Array.isArray(properties) && properties.find(item => {
            const normalizedTitle = normalizeTitle(item.title || item.propertyName || item.name);
            return normalizedTitle && (normalizedTitle === normalizedPageTitle || normalizedTitle.includes(normalizedPageTitle) || normalizedPageTitle.includes(normalizedTitle));
        });

        if (property) updatePropertyInquiryButton(property);
    } catch (err) {
        console.warn('Unable to check property availability:', err);
    }
}

async function refreshPropertyInquiryAvailability() {
    const propertyId = new URLSearchParams(window.location.search).get('id');
    if (propertyId && typeof apiGetPropertyById === 'function') {
        try {
            const property = await apiGetPropertyById(propertyId);
            if (property) updatePropertyInquiryButton(property);
        } catch (err) {
            console.warn('Unable to refresh property availability:', err);
        }
        return;
    }

    await loadStaticPropertyAvailability();
}

function findCachedPropertyById(propId) {
    const targetId = String(propId || '').trim();
    if (!targetId) return null;
    try {
        const all = JSON.parse(localStorage.getItem('cached_live_properties') || '[]')
            .concat(JSON.parse(localStorage.getItem('urbanScopeProperties') || '[]'))
            .concat(JSON.parse(localStorage.getItem('properties') || '[]'));
        const cached = all.find(p => p && String(p.id) === targetId);
        if (cached) return cached;
    } catch (_) {}
    if (typeof getStaticFallbackProperties === 'function') {
        const staticMatch = getStaticFallbackProperties().find(p => p && String(p.id) === targetId);
        if (staticMatch) return staticMatch;
    }
    return null;
}

function resolveUploadedGalleryImages(property) {
    const urls = [];
    const seen = new Set();
    const pushUrl = (raw) => {
        const s = String(raw || '').trim();
        if (!s || seen.has(s)) return;
        seen.add(s);
        urls.push(s);
    };
    const extra = Array.isArray(property?.gallery_images)
        ? property.gallery_images
        : (Array.isArray(property?.images) ? property.images : []);
    if (property?.image_url) pushUrl(property.image_url);
    extra.forEach(pushUrl);
    if (urls.length === 0) pushUrl('../../assets/images/property1.jpg');
    return urls.map(src => _safeDetailImg(src, '../../assets/images/property1.jpg'));
}

function renderPropertyDetails(property) {
    document.documentElement.classList.remove('detail-hydrating');
    if (!property) return;

    const titleEl = document.querySelector('.property-title');
    const locEl = document.querySelector('.property-loc');
    const priceEl = document.querySelector('.detail-price');
    const statusBadge = document.querySelector('.status-badge');
    const mainImgEl = document.getElementById('mainGalleryImg');

    let cleanTitle = property.title || '';
    const tCheck = cleanTitle.toLowerCase();
    if (tCheck.includes('suerte')) cleanTitle = 'Casasuerte';
    else if (tCheck.includes('kathleen')) cleanTitle = 'Kathleen - Place 5';
    else if (tCheck.includes('benecia')) cleanTitle = 'Benecia Single-Attached';
    else if (tCheck.includes('amore')) cleanTitle = 'Amore Classico';
    else if (tCheck.includes('midori')) cleanTitle = 'Midori Mid-Rise Condo – Zone 1';
    if (cleanTitle) {
        document.title = `${cleanTitle} | Miriam Lobren · CD Miranda Realty`;
    }
    if (titleEl) titleEl.innerText = cleanTitle || 'Property Details';
    if (locEl) {
        locEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${_escDetailHtml(property.location || 'Cavite & Las Piñas, Philippines')}`;
    }
    if (priceEl) priceEl.innerText = `₱${Number(property.price || 0).toLocaleString()}`;

    if (statusBadge) {
        statusBadge.hidden = false;
        const soldOut = isSoldOutProperty(property);
        statusBadge.innerText = soldOut ? 'Sold Out' : (property.status || 'Available');
        const isAvail = String(property.status || 'Available').trim().toLowerCase() === 'available';
        statusBadge.className = 'status-badge ' + (isAvail ? 'available' : 'sold');
    }

    // Setup dynamic gallery images based on property
    const tLower = (property.title || '').toLowerCase();
    const thumbsContainer = document.querySelector('.thumbnails-row');
    let propImages = [];

    if (tLower.includes('suerte')) {
        propImages = [
            '../../assets/images/casasuerte.jpg',
            '../../assets/images/casasuerte-living.jpg',
            '../../assets/images/casasuerte-dining.jpg',
            '../../assets/images/casasuerte-bedroom1.jpg',
            '../../assets/images/casasuerte-bedroom2.jpg',
            '../../assets/images/casasuerte-bathroom.jpg',
            '../../assets/images/casasuerte-hallway.jpg',
            '../../assets/images/casasuerte-service.jpg'
        ];
    } else if (tLower.includes('kathleen')) {
        propImages = [
            '../../assets/images/kathleen-facade.jpg',
            '../../assets/images/kathleen-1.jpg',
            '../../assets/images/kathleen-2.jpg',
            '../../assets/images/kathleen-3.jpg',
            '../../assets/images/kathleen-4.jpg',
            '../../assets/images/kathleen-5.jpg',
            '../../assets/images/kathleen-6.jpg',
            '../../assets/images/kathleen-7.jpg',
            '../../assets/images/kathleen-8.jpg',
            '../../assets/images/kathleen-9.jpg'
        ];
    } else if (tLower.includes('liora')) {
        propImages = [
            '../../assets/images/LioraHomes.jpg',
            '../../assets/images/liora-2.jpg',
            '../../assets/images/liora-3.jpg',
            '../../assets/images/liora-4.jpg',
            '../../assets/images/liora-5.jpg',
            '../../assets/images/liora-6.jpg',
            '../../assets/images/liora-7.jpg',
            '../../assets/images/liora-8.jpg',
            '../../assets/images/liora-9.jpg',
            '../../assets/images/liora-10.jpg',
            '../../assets/images/liora-11.jpg',
            '../../assets/images/liora-12.jpg'
        ];
    } else if (tLower.includes('airmen')) {
        propImages = [
            '../../assets/images/AirmenTriplex.WEBP'
        ];
    } else if (tLower.includes('benecia')) {
        propImages = [
            '../../assets/images/benecia-facade.jpg',
            '../../assets/images/benecia-1.jpg',
            '../../assets/images/benecia-2.jpg',
            '../../assets/images/benecia-3.jpg',
            '../../assets/images/benecia-4.jpg',
            '../../assets/images/benecia-5.jpg',
            '../../assets/images/benecia-6.jpg',
            '../../assets/images/benecia-7.jpg',
            '../../assets/images/benecia-8.jpg',
            '../../assets/images/benecia-9.jpg',
            '../../assets/images/benecia-10.jpg',
            '../../assets/images/benecia-11.jpg',
            '../../assets/images/benecia-12.jpg',
            '../../assets/images/benecia-13.jpg'
        ];
    } else if (tLower.includes('amore')) {
        propImages = [
            '../../assets/images/amore-facade.jpg',
            '../../assets/images/amore-livingarea.jpg',
            '../../assets/images/amore-dining.jpg',
            '../../assets/images/amore-kitchen.jpg',
            '../../assets/images/amore-carport.jpg',
            '../../assets/images/amore-servicearea.jpg',
            '../../assets/images/amore-famcorner.jpg',
            '../../assets/images/amore-masterbedroom.jpg',
            '../../assets/images/amore-mrbath.jpg',
            '../../assets/images/amore-bedroom1.jpg',
            '../../assets/images/amore-bedroom2.jpg',
            '../../assets/images/amore-3rdfloortoilet.jpg',
            '../../assets/images/amore-laundrydeck.jpg'
        ];
    } else if (tLower.includes('midori')) {
        propImages = [
            '../../assets/images/midori-main.webp',
            '../../assets/images/midori-living.jpg',
            '../../assets/images/midori-living-2.jpg',
            '../../assets/images/midori-kitchen.jpg',
            '../../assets/images/midori-kitchen-2.jpg',
            '../../assets/images/midori-bedroom1.jpg',
            '../../assets/images/midori-bedroom1-2.jpg',
            '../../assets/images/midori-bedroom1-3.jpg',
            '../../assets/images/midori-bedroom2.jpg',
            '../../assets/images/midori-bedroom2-2.jpg',
            '../../assets/images/midori-bedroom2-3.jpg',
            '../../assets/images/midori-toilet.jpg',
            '../../assets/images/midori-patio.jpg'
        ];
    }

    if (!Array.isArray(window.galleryImages) || window.galleryImages.length <= 1) {
        galleryImages = propImages.length > 0
            ? propImages.map(src => _safeDetailImg(src, '../../assets/images/property1.jpg'))
            : resolveUploadedGalleryImages(property);
        currentSlide = 0;
        if (thumbsContainer) {
            thumbsContainer.innerHTML = galleryImages.map((src, idx) => {
                const safeSrc = _escDetailHtml(src);
                return `
                <div class="thumb ${idx === 0 ? 'active' : ''}" onclick="selectThumb(${idx})">
                    <img src="${safeSrc}" alt="Photo ${idx + 1}" loading="lazy" decoding="async">
                </div>
            `;
            }).join('');
        }
        if (mainImgEl) {
            mainImgEl.hidden = false;
            mainImgEl.src = galleryImages[0];
            mainImgEl.style.cursor = 'zoom-in';
            mainImgEl.onclick = (e) => {
                e && e.preventDefault && e.preventDefault();
                openLightbox(currentSlide);
            };
        }
        updateGallery();
    }

    // Dynamic Specs Bar for complete House & Lot Information
    const specsBar = document.querySelector('.specs-bar');
    if (specsBar) {
        specsBar.innerHTML = `
            <div class="spec-item">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/></svg>
                <div class="spec-info">
                    <strong>${_escDetailHtml(property.bedrooms || 0)}</strong>
                    <span>Bed Rooms</span>
                </div>
            </div>
            <div class="spec-item">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M2 12h20M7 12V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v7"/></svg>
                <div class="spec-info">
                    <strong>${_escDetailHtml(property.bathrooms || 0)}</strong>
                    <span>Bath Rooms</span>
                </div>
            </div>
            <div class="spec-item">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
                <div class="spec-info">
                    ${tLower.includes('midori')
                        ? '<strong>2nd Floor</strong><span>Buildings 14–21</span>'
                        : `<strong>${_escDetailHtml(property.lot_area || 0)} sqm</strong><span>Lot Area</span>`}
                </div>
            </div>
            <div class="spec-item">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h6M9 13h6M9 17h6"/></svg>
                <div class="spec-info">
                    <strong>${_escDetailHtml(property.floor_area || 0)} sqm</strong>
                    <span>Floor Area</span>
                </div>
            </div>
            <div class="spec-item">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3H8L4 7h16l-4-4z"/><circle cx="7.5" cy="15.5" r="1.5"/><circle cx="16.5" cy="15.5" r="1.5"/></svg>
                <div class="spec-info">
                    ${tLower.includes('midori')
                        ? '<strong>Inner &amp; End</strong><span>Unit Types</span>'
                        : `<strong>${_escDetailHtml(property.carports !== undefined && property.carports !== null ? property.carports : 1)} Car</strong><span>Garage / Carport</span>`}
                </div>
            </div>
            <div class="spec-item">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 22"/></svg>
                <div class="spec-info">
                    <strong>${_escDetailHtml(property.property_type || 'Residential')}</strong>
                    <span>Property Type</span>
                </div>
            </div>
        `;
    }

    // Dynamic Description & Amenities
    const descBlock = document.querySelector('.detail-block p');
    if (descBlock) {
        const cleanDesc = String(property.description || '').trim();
        descBlock.innerText = cleanDesc || `${cleanTitle || 'This property'} in ${property.location || 'Cavite & Las Piñas'} is available for inquiry and scheduled site viewing.`;
    }

    const amenitiesGrid = document.querySelector('.amenities-grid');
    if (amenitiesGrid) {
        const list = property.amenities ? String(property.amenities).split(',').map(a => a.trim()).filter(Boolean) : [];
        if (list.length > 0) {
            const half = Math.ceil(list.length / 2);
            const col1 = list.slice(0, half);
            const col2 = list.slice(half);
            amenitiesGrid.innerHTML = `
                <ul>${col1.map(item => `<li><span class="bullet">&bull;</span> ${_escDetailHtml(item)}</li>`).join('')}</ul>
                <ul>${col2.map(item => `<li><span class="bullet">&bull;</span> ${_escDetailHtml(item)}</li>`).join('')}</ul>
            `;
        } else {
            amenitiesGrid.innerHTML = `<ul><li><span class="bullet">&bull;</span> Contact agent for complete amenities and floor plan details.</li></ul>`;
        }
    }

    updatePropertyInquiryButton(property);

    // Accurate Property Map Resolution
    const locBoxP = document.querySelector('.location-box .location-header p');
    const mapIframe = document.querySelector('.map-container iframe');
    const mapLink = document.querySelector('.view-map-link');

    if (locBoxP && property.location) {
        locBoxP.textContent = property.location;
    }

    let mapQuery = encodeURIComponent(property.location || 'Cavite, Philippines');
    const titleLower = (property.title || '').toLowerCase();
    const lLower = (property.location || '').toLowerCase();

    if (titleLower.includes('suerte') || lLower.includes('san agustin') || lLower.includes('trece')) {
        mapQuery = '14.28315,120.86832+(Casasuerte+Trece+Martires)';
    } else if (titleLower.includes('kathleen') || lLower.includes('molino') || lLower.includes('bacoor')) {
        mapQuery = '14.416,120.975+(Kathleen+Place+5+Bacoor)';
    } else if (titleLower.includes('liora') || lLower.includes('naic')) {
        mapQuery = '14.31028,120.76329+(Liora+Homes+Naic)';
    } else if (titleLower.includes('airmen')) {
        mapQuery = '14.4661,120.9911+(Airmen\'s+Village+Triplex)';
    } else if (titleLower.includes('benecia') || lLower.includes('talon')) {
        mapQuery = '14.4375,120.9995+(Benecia+Single+Attached+Talon+IV+Las+Pinas)';
    } else if (titleLower.includes('amore') || lLower.includes('benedetto')) {
        mapQuery = '14.4788,120.9856+(Amore+Classico+Benedetto+Residences+Las+Pinas)';
    } else if (titleLower.includes('midori') || lLower.includes('dasmarinas') || lLower.includes('dasmariñas')) {
        mapQuery = '14.3294,120.9367+(Midori+Mid-Rise+Condo+Zone+1+Dasmarinas+Cavite)';
    }

    if (mapIframe) {
        mapIframe.src = `https://maps.google.com/maps?q=${mapQuery}&t=&z=17&ie=UTF8&iwloc=B&output=embed`;
    }
    if (mapLink) {
        mapLink.href = `https://www.google.com/maps/search/?api=1&query=${mapQuery.split('+(')[0]}`;
        mapLink.setAttribute('target', '_blank');
        mapLink.setAttribute('rel', 'noopener noreferrer');
    }
}

async function loadPropertyFromDb() {
    const urlParams = new URLSearchParams(window.location.search);
    const propId = urlParams.get('id');
    if (!propId || typeof apiGetPropertyById !== 'function') {
        document.documentElement.classList.remove('detail-hydrating');
        return;
    }

    const inquiryBtn = document.querySelector('.submit-inquiry-btn');
    if (inquiryBtn) inquiryBtn.href = `../inquiry/inquiry.html?type=property&id=${encodeURIComponent(propId)}`;

    // Hydrate synchronously from client cache first so cached cards open directly without flashing another property
    const cachedProperty = findCachedPropertyById(propId);
    if (cachedProperty) {
        renderPropertyDetails(cachedProperty);
    }

    const property = await apiGetPropertyById(propId);
    if (!property) {
        document.documentElement.classList.remove('detail-hydrating');
        if (!cachedProperty) {
            const titleEl = document.querySelector('.property-title');
            if (titleEl) titleEl.innerText = 'Property Listing Not Found';
            const descEl = document.querySelector('.detail-block p');
            if (descEl) descEl.innerText = 'This listing may have been removed or is unavailable.';
        }
        return;
    }

    renderPropertyDetails(property);
}

function checkInquiryAuthNote(user) {
    let isLoggedIn = Boolean(user);
    if (!isLoggedIn) {
        try {
            const u = localStorage.getItem('urbanscope_user') || localStorage.getItem('urbanscope_demo_user');
            const token = localStorage.getItem('urbanscope_jwt_token');
            if (u || token) isLoggedIn = true;
        } catch (e) {}
    }

    const isClassAuth = document.documentElement.classList.contains('logged-in') || 
                        document.documentElement.getAttribute('data-auth-state') === 'logged-in';

    document.querySelectorAll('.inquiry-note').forEach(el => {
        if (isLoggedIn || isClassAuth) {
            el.style.display = 'none';
        } else {
            el.style.display = '';
        }
    });
}

window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const propId = urlParams.get('id');
    if (propId) {
        window.setTimeout(() => document.documentElement.classList.remove('detail-hydrating'), 4500);
        loadPropertyFromDb();
    } else {
        document.documentElement.classList.remove('detail-hydrating');
        const staticFallback = (typeof getStaticFallbackProperties === 'function' && getStaticFallbackProperties()[0]) || {
            id: 1,
            title: 'Casasuerte',
            location: 'Barangay San Agustin, Trece Martires City, Cavite',
            property_type: 'Townhouse',
            price: 2500000,
            bedrooms: 2,
            bathrooms: 1,
            lot_area: 50,
            floor_area: 50.8,
            carports: 1,
            status: 'Available',
            image_url: 'assets/images/casasuerte.jpg'
        };
        if (document.querySelectorAll('.thumbnails-row .thumb').length > 0) {
            initGallery();
        } else {
            renderPropertyDetails(staticFallback);
        }
        loadStaticPropertyAvailability();
    }
    checkInquiryAuthNote();
    const detailBackBtn = document.getElementById('detailBackBtn');
    if (detailBackBtn) {
        detailBackBtn.addEventListener('click', (e) => {
            try {
                const ref = document.referrer ? new URL(document.referrer) : null;
                const sameOrigin = Boolean(ref && ref.origin === window.location.origin);
                const samePage = Boolean(ref && ref.pathname === window.location.pathname && ref.search === window.location.search);
                if (sameOrigin && !samePage && window.history.length > 1) {
                    e.preventDefault();
                    window.history.back();
                }
            } catch (_) {}
        });
    }

    const searchToggle = document.getElementById('searchToggle');
    if (searchToggle) {
        searchToggle.addEventListener('click', () => {
            location.href = '../../index.html#properties';
        });
    }
});

document.addEventListener('urbanscope:user', (e) => {
    checkInquiryAuthNote(e.detail);
});

window.addEventListener('storage', (e) => {
    if (e.key === 'urbanscope_user' || e.key === 'urbanscope_jwt_token' || e.key === 'urbanscope_demo_user') {
        checkInquiryAuthNote();
    }
    if (e.key === 'cached_live_properties') {
        refreshPropertyInquiryAvailability();
    }
});

window.addEventListener('focus', refreshPropertyInquiryAvailability);

/* ========================================================
   FULLSCREEN IMAGE LIGHTBOX & INTERACTIVE ZOOM CONTROLLER
   ======================================================== */

function ensureLightboxDom() {
    if (document.getElementById('imageLightbox')) return;

    const lightbox = document.createElement('div');
    lightbox.id = 'imageLightbox';
    lightbox.className = 'image-lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-label', 'Photo Zoom Viewer');
    lightbox.innerHTML = `
        <div class="lightbox-header">
            <span class="lightbox-counter" id="lightboxCounter">1 / 1</span>
            <div class="lightbox-controls">
                <button type="button" class="lightbox-btn" id="lightboxZoomOutBtn" title="Zoom out (-)" aria-label="Zoom out">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button type="button" class="lightbox-btn" id="lightboxResetBtn" title="Reset zoom (0)" aria-label="Reset zoom" style="width: auto; padding: 0 12px; border-radius: 999px;">
                    100%
                </button>
                <button type="button" class="lightbox-btn" id="lightboxZoomInBtn" title="Zoom in (+)" aria-label="Zoom in">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button type="button" class="lightbox-btn close-btn" id="lightboxCloseBtn" title="Close (Esc)" aria-label="Close">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
        <div class="lightbox-viewport zoom-1" id="lightboxViewport">
            <button type="button" class="lightbox-nav prev" id="lightboxPrevBtn" aria-label="Previous image">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="lightbox-img-stage" id="lightboxImgStage">
                <img id="lightboxImg" src="" alt="Property Zoomed View">
            </div>
            <button type="button" class="lightbox-nav next" id="lightboxNextBtn" aria-label="Next image">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="lightbox-footer">
            <div class="lightbox-thumbs" id="lightboxThumbs"></div>
            <div class="lightbox-hint">Scroll or double-click to zoom • Drag to pan when zoomed • Esc to close</div>
        </div>
    `;

    document.body.appendChild(lightbox);

    // Button actions
    document.getElementById('lightboxCloseBtn').addEventListener('click', closeLightbox);
    document.getElementById('lightboxZoomInBtn').addEventListener('click', () => zoomLightbox(0.5));
    document.getElementById('lightboxZoomOutBtn').addEventListener('click', () => zoomLightbox(-0.5));
    document.getElementById('lightboxResetBtn').addEventListener('click', resetLightboxZoom);
    document.getElementById('lightboxPrevBtn').addEventListener('click', () => changeLightboxSlide(-1));
    document.getElementById('lightboxNextBtn').addEventListener('click', () => changeLightboxSlide(1));

    const viewport = document.getElementById('lightboxViewport');

    // Close on backdrop click (outside navigation buttons and stage)
    viewport.addEventListener('click', (e) => {
        if (e.target === viewport) {
            closeLightbox();
        }
    });

    // Mouse wheel zoom
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.deltaY < 0) {
            zoomLightbox(0.25);
        } else {
            zoomLightbox(-0.25);
        }
    }, { passive: false });

    // Double-click toggle (1x <-> 2.5x)
    const stage = document.getElementById('lightboxImgStage');
    stage.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (zoomLevel > 1) {
            resetLightboxZoom();
        } else {
            zoomLevel = 2.5;
            panX = 0;
            panY = 0;
            applyLightboxTransform();
        }
    });

    // Mouse drag to pan
    viewport.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (zoomLevel <= 1) return;
        isPanning = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        viewport.classList.add('is-panning');
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        panX = e.clientX - panStartX;
        panY = e.clientY - panStartY;
        applyLightboxTransform();
    });

    window.addEventListener('mouseup', () => {
        if (!isPanning) return;
        isPanning = false;
        viewport.classList.remove('is-panning');
    });

    // Touch drag support
    let touchStartX = 0;
    let touchStartY = 0;
    viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1 && zoomLevel > 1) {
            isPanning = true;
            touchStartX = e.touches[0].clientX - panX;
            touchStartY = e.touches[0].clientY - panY;
            viewport.classList.add('is-panning');
        }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
        if (isPanning && e.touches.length === 1) {
            panX = e.touches[0].clientX - touchStartX;
            panY = e.touches[0].clientY - touchStartY;
            applyLightboxTransform();
        }
    }, { passive: true });

    viewport.addEventListener('touchend', () => {
        isPanning = false;
        viewport.classList.remove('is-panning');
    });
}

function ensureDocumentPreviewDom() {
    let dialog = document.getElementById('tcpDocumentModal');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'tcpDocumentModal';
    dialog.className = 'tcp-document-modal';
    dialog.setAttribute('aria-labelledby', 'tcpDocumentTitle');
    dialog.innerHTML = `
        <div class="tcp-document-modal-content">
            <header class="tcp-document-modal-header">
                <h2 id="tcpDocumentTitle">Official Computation Document</h2>
                <button type="button" class="tcp-document-modal-close" aria-label="Close computation preview">&times;</button>
            </header>
            <div class="tcp-document-modal-image-wrap">
                <img id="tcpDocumentImage" alt="Official property computation document">
            </div>
        </div>
    `;

    document.body.appendChild(dialog);
    dialog.querySelector('.tcp-document-modal-close').addEventListener('click', closeDocumentPreview);
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeDocumentPreview();
    });
    dialog.addEventListener('close', () => {
        const image = dialog.querySelector('#tcpDocumentImage');
        if (image) image.removeAttribute('src');
        if (documentModalPreviousOverflow !== null) {
            document.body.style.overflow = documentModalPreviousOverflow;
            documentModalPreviousOverflow = null;
        }
    });
    return dialog;
}

function openDocumentPreview(src, title) {
    if (!src) return;
    const dialog = ensureDocumentPreviewDom();
    const heading = dialog.querySelector('#tcpDocumentTitle');
    const image = dialog.querySelector('#tcpDocumentImage');
    if (heading) heading.textContent = title || 'Official Computation Document';
    if (image) image.src = _safeDetailImg(src, '../../assets/images/property1.jpg');
    documentModalPreviousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
}

function closeDocumentPreview() {
    const dialog = document.getElementById('tcpDocumentModal');
    if (dialog && dialog.open) dialog.close();
}

function openLightbox(index) {
    if (galleryImages.length === 0) initGallery();
    if (typeof index === 'number' && index >= 0 && index < galleryImages.length) {
        currentSlide = index;
    }
    updateGallery();
    ensureLightboxDom();
    syncLightboxImage();
    const lightbox = document.getElementById('imageLightbox');
    if (lightbox) {
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
        lightboxOpen = true;
    }
}

function closeLightbox() {
    const lightbox = document.getElementById('imageLightbox');
    if (lightbox) {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
        lightboxOpen = false;
        resetLightboxZoom();
    }
}

function resetLightboxZoom() {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
    applyLightboxTransform();
}

function applyLightboxTransform() {
    const stage = document.getElementById('lightboxImgStage');
    const viewport = document.getElementById('lightboxViewport');
    const resetBtn = document.getElementById('lightboxResetBtn');
    if (!stage) return;

    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;

    if (viewport) {
        if (zoomLevel === 1) {
            viewport.classList.add('zoom-1');
            viewport.classList.remove('is-zoomed');
        } else {
            viewport.classList.remove('zoom-1');
            viewport.classList.add('is-zoomed');
        }
    }

    if (resetBtn) {
        resetBtn.textContent = `${Math.round(zoomLevel * 100)}%`;
    }
}

function zoomLightbox(delta) {
    const newZoom = Math.max(1, Math.min(4, Math.round((zoomLevel + delta) * 100) / 100));
    if (newZoom === zoomLevel) return;
    zoomLevel = newZoom;
    if (zoomLevel === 1) {
        panX = 0;
        panY = 0;
    }
    applyLightboxTransform();
}

function syncLightboxImage() {
    const img = document.getElementById('lightboxImg');
    const counter = document.getElementById('lightboxCounter');
    const thumbsContainer = document.getElementById('lightboxThumbs');
    const prevBtn = document.getElementById('lightboxPrevBtn');
    const nextBtn = document.getElementById('lightboxNextBtn');
    if (prevBtn) prevBtn.style.display = galleryImages.length <= 1 ? 'none' : '';
    if (nextBtn) nextBtn.style.display = galleryImages.length <= 1 ? 'none' : '';
    if (galleryImages.length === 0) return;

    const currentSrc = _safeDetailImg(galleryImages[currentSlide] || '', '../../assets/images/property1.jpg');
    if (img) img.src = currentSrc;
    if (counter) counter.textContent = `${currentSlide + 1} / ${galleryImages.length}`;

    if (thumbsContainer) {
        thumbsContainer.innerHTML = galleryImages.map((src, i) => {
            const safeSrc = _escDetailHtml(_safeDetailImg(src, '../../assets/images/property1.jpg'));
            return `
            <div class="lightbox-thumb ${i === currentSlide ? 'active' : ''}" onclick="selectLightboxSlide(${i})">
                <img src="${safeSrc}" alt="Slide ${i + 1}" loading="lazy" decoding="async">
            </div>
        `;
        }).join('');
    }
    resetLightboxZoom();
}

function selectLightboxSlide(index) {
    currentSlide = index;
    updateGallery();
    syncLightboxImage();
}

function changeLightboxSlide(direction) {
    changeSlide(direction);
    syncLightboxImage();
}

window.addEventListener('keydown', (e) => {
    if (!lightboxOpen) return;
    if (e.key === 'Escape') {
        closeLightbox();
    } else if (e.key === 'ArrowLeft') {
        changeLightboxSlide(-1);
    } else if (e.key === 'ArrowRight') {
        changeLightboxSlide(1);
    } else if (e.key === '+' || e.key === '=') {
        zoomLightbox(0.5);
    } else if (e.key === '-' || e.key === '_') {
        zoomLightbox(-0.5);
    } else if (e.key === '0') {
        resetLightboxZoom();
    }
});

// Expose globals for onclick bindings
window.initGallery = initGallery;
window.updateGallery = updateGallery;
window.changeSlide = changeSlide;
window.selectThumb = selectThumb;
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.openDocumentPreview = openDocumentPreview;
window.changeLightboxSlide = changeLightboxSlide;
window.selectLightboxSlide = selectLightboxSlide;
window.zoomLightbox = zoomLightbox;
window.resetLightboxZoom = resetLightboxZoom;

