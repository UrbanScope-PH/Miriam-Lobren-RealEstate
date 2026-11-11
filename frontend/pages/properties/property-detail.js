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

async function loadPropertyFromDb() {
    const urlParams = new URLSearchParams(window.location.search);
    const propId = urlParams.get('id');
    if (!propId || typeof apiGetPropertyById !== 'function') return;

    const inquiryBtn = document.querySelector('.submit-inquiry-btn');
    if (inquiryBtn) inquiryBtn.href = `../inquiry/inquiry.html?type=property&id=${encodeURIComponent(propId)}`;

    const property = await apiGetPropertyById(propId);
    if (!property) return;

    const titleEl = document.querySelector('.property-title');
    const locEl = document.querySelector('.property-loc');
    const priceEl = document.querySelector('.detail-price');
    const statusBadge = document.querySelector('.status-badge');
    const mainImgEl = document.getElementById('mainGalleryImg');

    let cleanTitle = property.title || '';
    const tCheck = cleanTitle.toLowerCase();
    if (tCheck.includes('suerte')) cleanTitle = 'Casasuerte';
    else if (tCheck.includes('kathleen')) cleanTitle = 'Kathleen';
    else if (tCheck.includes('benecia')) cleanTitle = 'Benecia Single-Attached';
    else if (tCheck.includes('amore')) cleanTitle = 'Amore Classico';
    if (titleEl) titleEl.innerText = cleanTitle;
    if (locEl) {
        locEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${property.location}`;
    }
    if (priceEl) priceEl.innerText = `₱${Number(property.price).toLocaleString()}`;
    
    if (statusBadge && property.status) {
        const soldOut = isSoldOutProperty(property);
        statusBadge.innerText = soldOut ? 'Sold Out' : property.status;
        const isAvail = String(property.status).trim().toLowerCase() === 'available';
        statusBadge.className = 'status-badge ' + (isAvail ? 'available' : 'sold');
    }

    if (mainImgEl && property.image_url) {
        const fullImg = (property.image_url.startsWith('http') || property.image_url.startsWith('data:')) ? property.image_url : '../../' + property.image_url.replace(/^(\.\.\/)+/, '');
        mainImgEl.src = fullImg;
        galleryImages[0] = fullImg;
        updateGallery();
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
            '../../assets/images/casasuerte-service.jpg',
            '../../assets/images/casasuerte-subdivision-plan.jpg'
        ];
    } else if (tLower.includes('kathleen')) {
        propImages = [
            '../../assets/images/kathleen-facade.jpg',
            '../../assets/images/kathleen-living.jpg',
            '../../assets/images/kathleen-dining.jpg',
            '../../assets/images/kathleen-interior.jpg',
            '../../assets/images/kathleen-gate.jpg',
            '../../assets/images/kathleen-carport.jpg',
            '../../assets/images/kathleen-hallway.jpg',
            '../../assets/images/kathleen-map.jpg'
        ];
    } else if (tLower.includes('liora')) {
        propImages = [
            '../../assets/images/LioraHomes.jpg',
            '../../assets/images/liora-aerial.jpg',
            '../../assets/images/liora-pool.jpg',
            '../../assets/images/liora-living.jpg',
            '../../assets/images/liora-dining.jpg',
            '../../assets/images/liora-interior.jpg',
            '../../assets/images/liora-bedroom.jpg',
            '../../assets/images/liora-stairs.jpg',
            '../../assets/images/liora-solar.jpg',
            '../../assets/images/liora-rainwater.jpg',
            '../../assets/images/liora-community.jpg'
        ];
    } else if (tLower.includes('airmen')) {
        propImages = [
            '../../assets/images/AirmenTriplex.WEBP',
            '../../assets/images/airmen-flyer.jpg'
        ];
    } else if (tLower.includes('benecia')) {
        propImages = [
            '../../assets/images/benecia-facade.jpg',
            '../../assets/images/benecia-1.jpg',
            '../../assets/images/benecia-2.jpg',
            '../../assets/images/benecia-3.jpg',
            '../../assets/images/benecia-5.jpg',
            '../../assets/images/benecia-6.jpg',
            '../../assets/images/benecia-7.jpg',
            '../../assets/images/benecia-8.jpg',
            '../../assets/images/benecia-10.jpg',
            '../../assets/images/benecia-11.jpg',
            '../../assets/images/benecia-13.jpg',
            '../../assets/images/benecia-14.jpg',
            '../../assets/images/benecia-15.jpg',
            '../../assets/images/benecia-16.jpg',
            '../../assets/images/benecia-17.jpg',
            '../../assets/images/benecia-flyer.jpg'
        ];
    } else if (tLower.includes('amore')) {
        propImages = [
            '../../assets/images/amore-facade.jpg',
            '../../assets/images/amore-1.jpg',
            '../../assets/images/amore-2.jpg',
            '../../assets/images/amore-3.jpg',
            '../../assets/images/amore-4.jpg',
            '../../assets/images/amore-5.jpg',
            '../../assets/images/amore-6.jpg',
            '../../assets/images/amore-7.jpg',
            '../../assets/images/amore-8.jpg',
            '../../assets/images/amore-9.jpg',
            '../../assets/images/amore-10.jpg',
            '../../assets/images/amore-11.jpg',
            '../../assets/images/amore-13.jpg',
            '../../assets/images/amore-14.jpg',
            '../../assets/images/amore-15.jpg',
            '../../assets/images/amore-flyer.jpg'
        ];
    }

    if (propImages.length > 0 && (!window.galleryImages || window.galleryImages.length <= 1)) {
        galleryImages = propImages;
        if (thumbsContainer) {
            thumbsContainer.innerHTML = propImages.map((src, idx) => `
                <div class="thumb ${idx === 0 ? 'active' : ''}" onclick="selectThumb(${idx}, '${src}')">
                    <img src="${src}" alt="Photo ${idx + 1}" loading="lazy" decoding="async">
                </div>
            `).join('');
        }
        if (mainImgEl) {
            mainImgEl.src = galleryImages[0];
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
                    <strong>${property.bedrooms || 0}</strong>
                    <span>Bed Rooms</span>
                </div>
            </div>
            <div class="spec-item">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M2 12h20M7 12V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v7"/></svg>
                <div class="spec-info">
                    <strong>${property.bathrooms || 0}</strong>
                    <span>Bath Rooms</span>
                </div>
            </div>
            <div class="spec-item">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
                <div class="spec-info">
                    <strong>${property.lot_area || 0} sqm</strong>
                    <span>Lot Area</span>
                </div>
            </div>
            <div class="spec-item">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h6M9 13h6M9 17h6"/></svg>
                <div class="spec-info">
                    <strong>${property.floor_area || 0} sqm</strong>
                    <span>Floor Area</span>
                </div>
            </div>
            <div class="spec-item">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3H8L4 7h16l-4-4z"/><circle cx="7.5" cy="15.5" r="1.5"/><circle cx="16.5" cy="15.5" r="1.5"/></svg>
                <div class="spec-info">
                    <strong>${property.carports || 1} Car</strong>
                    <span>Garage / Carport</span>
                </div>
            </div>
            <div class="spec-item">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 22"/></svg>
                <div class="spec-info">
                    <strong>${property.property_type || 'Residential'}</strong>
                    <span>Property Type</span>
                </div>
            </div>
        `;
    }

    // Dynamic Description & Amenities
    const descBlock = document.querySelector('.detail-block p');
    if (descBlock && property.description) {
        descBlock.innerText = property.description;
    }

    if (property.amenities) {
        const amenitiesGrid = document.querySelector('.amenities-grid');
        if (amenitiesGrid) {
            const list = property.amenities.split(',').map(a => a.trim()).filter(Boolean);
            if (list.length > 0) {
                const half = Math.ceil(list.length / 2);
                const col1 = list.slice(0, half);
                const col2 = list.slice(half);
                amenitiesGrid.innerHTML = `
                    <ul>${col1.map(item => `<li><span class="bullet">&bull;</span> ${item}</li>`).join('')}</ul>
                    <ul>${col2.map(item => `<li><span class="bullet">&bull;</span> ${item}</li>`).join('')}</ul>
                `;
            }
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
        mapQuery = '14.416,120.975+(Kathleen+Bacoor)';
    } else if (titleLower.includes('liora') || lLower.includes('naic')) {
        mapQuery = '14.31028,120.76329+(Liora+Homes+Naic)';
    } else if (titleLower.includes('airmen')) {
        mapQuery = '14.4661,120.9911+(Airmen\'s+Village+Triplex)';
    } else if (titleLower.includes('benecia') || lLower.includes('talon')) {
        mapQuery = '14.4375,120.9995+(Benecia+Single+Attached+Talon+IV+Las+Pinas)';
    } else if (titleLower.includes('amore') || lLower.includes('benedetto')) {
        mapQuery = '14.4788,120.9856+(Amore+Classico+Benedetto+Residences+Las+Pinas)';
    }

    if (mapIframe) {
        mapIframe.src = `https://maps.google.com/maps?q=${mapQuery}&t=&z=17&ie=UTF8&iwloc=B&output=embed`;
    }
    if (mapLink) {
        mapLink.href = `https://www.google.com/maps/search/?api=1&query=${mapQuery.split('+(')[0]}`;
        mapLink.setAttribute('target', '_blank');
        mapLink.setAttribute('rel', 'noopener noreferrer');
    }

    // Dynamic TCP Section Rendering
    renderDynamicTcp(property);

    // Dynamic Amortization Calculator Rendering
    renderPropertyCalculator(property);
}

function renderDynamicTcp(property) {
    const container = document.getElementById('tcpContainer');
    if (!container || !property) return;

    const tLower = (property.title || '').toLowerCase();
    let tcpHtml = '';

    if (tLower.includes('suerte')) {
        tcpHtml = `
        <section class="tcp-section">
            <div class="tcp-doc-card">
                <div class="tcp-doc-info">
                    <div class="tcp-doc-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </div>
                    <div class="tcp-doc-text">
                        <h4>Official Pag-IBIG Sample Computation &amp; Pricelist Sheet</h4>
                        <p>Developer: RubySapphire Land Corp · DHSUD LTS No. 0001645 · As of September 1, 2026</p>
                    </div>
                </div>
                <button type="button" class="tcp-doc-btn" onclick="openDocumentPreview('../../assets/images/casasuerte-tcp.jpg', 'Casasuerte official computation')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                    <span>View Official Pricelist</span>
                </button>
            </div>
            <p class="tcp-disclaimer">*Estimated amortization figures are based on Pag-IBIG prevailing indicative rates (6.25% fixed for 3 years). Final loan approval and terms are subject to Pag-IBIG credit assessment.</p>
        </section>`;
    } else if (tLower.includes('kathleen')) {
        tcpHtml = `
        <section class="tcp-section">
            <div class="tcp-doc-card">
                <div class="tcp-doc-info">
                    <div class="tcp-doc-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </div>
                    <div class="tcp-doc-text">
                        <h4>Official Bank Financing Promo Sample Computation</h4>
                        <p>Developer: JKY Group / Jeika Properties Corp · DHSUD LTS No. 0000523 · Inclusive of Title Transfer &amp; Move-in Fees</p>
                    </div>
                </div>
                <button type="button" class="tcp-doc-btn" onclick="openDocumentPreview('../../assets/images/kathleen-tcp.jpg', 'Kathleen official computation')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                    <span>View Official Computation</span>
                </button>
            </div>
            <p class="tcp-disclaimer">*Inclusive of Title Transfer and Move-In Fees. Interest rates quoted are prevailing bank indicative rates; final loan approval is based on buyer's credit assessment.</p>
        </section>`;
    } else if (tLower.includes('liora')) {
        tcpHtml = `
        <section class="tcp-section">
            <div class="tcp-doc-card">
                <div class="tcp-doc-info">
                    <div class="tcp-doc-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </div>
                    <div class="tcp-doc-text">
                        <h4>Official Pag-IBIG &amp; Bank Financing Sample Computation Sheet</h4>
                        <p>Developer: Citihomes Builder &amp; Development, Inc. (CBDI) · Effective September 1, 2026</p>
                    </div>
                </div>
                <button type="button" class="tcp-doc-btn" onclick="openDocumentPreview('../../assets/images/liora-tcp.jpg', 'Liora Homes official pricelist')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                    <span>View Official Pricelist</span>
                </button>
            </div>
            <p class="tcp-disclaimer">*Estimated amortization figures are indicative at 6.25% fixed for 3 years. Applicable rates will be based on prevailing Pag-IBIG / Bank rates upon loan take-out.</p>
        </section>`;
    } else if (tLower.includes('airmen')) {
        tcpHtml = `
        <section class="tcp-section">
            <div class="tcp-doc-card">
                <div class="tcp-doc-info">
                    <div class="tcp-doc-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </div>
                    <div class="tcp-doc-text">
                        <h4>Official Developer Sample Computation Sheet</h4>
                        <p>Simplicio R. Yutero Construction Services · Jumbo St., Airmen's Village, Pulang Lupa Dos, Las Piñas City</p>
                    </div>
                </div>
                <button type="button" class="tcp-doc-btn" onclick="openDocumentPreview('../../assets/images/airmen-tcp.jpg', 'Airmen’s Village official computation')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                    <span>View Official Computation</span>
                </button>
            </div>
            <p class="tcp-disclaimer">*Inclusive of Title Transfer and Move-In Fees. Final loan interest rate and approval is determined by the financing bank upon loan take-out.</p>
        </section>`;
    } else if (tLower.includes('benecia')) {
        tcpHtml = `
        <section class="tcp-section">
            <div class="tcp-doc-card">
                <div class="tcp-doc-info">
                    <div class="tcp-doc-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </div>
                    <div class="tcp-doc-text">
                        <h4>Official Property Specification &amp; Turnover Flyer</h4>
                        <p>Sihanouk Village, Talon IV, Las Piñas City · Single-Attached House &amp; Lot · RFO</p>
                    </div>
                </div>
                <button type="button" class="tcp-doc-btn" onclick="openDocumentPreview('../../assets/images/benecia-flyer.jpg', 'Benecia Single-Attached specifications flyer')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                    <span>View Specification Flyer</span>
                </button>
            </div>
            <p class="tcp-disclaimer">*Price: Approximately ₱9.695M. Complete turnover with front fence and gate. Bank financing indicative computation available.</p>
        </section>`;
    } else if (tLower.includes('amore')) {
        tcpHtml = `
        <section class="tcp-section">
            <div class="tcp-doc-card">
                <div class="tcp-doc-info">
                    <div class="tcp-doc-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </div>
                    <div class="tcp-doc-text">
                        <h4>Official Benedetto Residences Information Sheet</h4>
                        <p>Benedetto Residences, Pulang Lupa Uno, Las Piñas City · 3-Storey Townhouse · RFO</p>
                    </div>
                </div>
                <button type="button" class="tcp-doc-btn" onclick="openDocumentPreview('../../assets/images/amore-flyer.jpg', 'Amore Classico information sheet')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                    <span>View Information Sheet</span>
                </button>
            </div>
            <p class="tcp-disclaimer">*Price: ₱7,995,000. Ready for Occupancy units in Block 1B / 2B. Bank financing indicative terms upon credit check.</p>
        </section>`;
    } else {
        tcpHtml = '';
    }

    container.innerHTML = tcpHtml;
}

function parsePropertyPrice(priceVal) {
    if (typeof priceVal === 'number') return priceVal;
    if (!priceVal) return 2500000;
    const cleaned = String(priceVal).replace(/,/g, '');
    const match = cleaned.match(/\d+(\.\d+)?/);
    return match ? Number(match[0]) : 2500000;
}

function renderPropertyCalculator(property) {
    const calcContainer = document.getElementById('propertyCalculator');
    if (!calcContainer || !window.UrbanCalculator) return;

    const tcp = parsePropertyPrice(property ? property.price : 2500000);
    const title = property ? (property.title || 'Property') : 'Casasuerte';
    const id = property ? (property.id || '') : '';
    const tLower = title.toLowerCase();

    let resv = 20000;
    let dp = 10;
    let financing = 'pagibig';
    let supported = ['pagibig', 'bank'];

    if (tLower.includes('kathleen')) {
        resv = 50000;
        dp = 20;
        financing = 'bank';
        supported = ['bank'];
    } else if (tLower.includes('airmen')) {
        resv = 50000;
        dp = 20;
        financing = 'bank';
        supported = ['bank'];
    } else if (tLower.includes('liora')) {
        resv = 15000;
        dp = 10;
        financing = 'pagibig';
        supported = ['pagibig', 'bank'];
    } else if (tLower.includes('suerte')) {
        resv = 10000;
        dp = 10;
        financing = 'pagibig';
        supported = ['pagibig', 'bank'];
    } else if (tLower.includes('benecia')) {
        resv = 50000;
        dp = 20;
        financing = 'bank';
        supported = ['bank'];
    } else if (tLower.includes('amore')) {
        resv = 30000;
        dp = 20;
        financing = 'bank';
        supported = ['bank'];
    }

    if (calcContainer._setTcp) {
        calcContainer._setTcp(tcp, title, id, resv);
    } else {
        UrbanCalculator.initPropertyCalculator('propertyCalculator', {
            tcp: tcp,
            propertyTitle: title,
            propertyId: id,
            reservationFee: resv,
            defaultDpPercent: dp,
            defaultTermYears: 20,
            defaultFinancing: financing,
            supportedFinancing: supported
        });
    }
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
    initGallery();
    if (new URLSearchParams(window.location.search).get('id')) {
        loadPropertyFromDb();
    } else {
        loadStaticPropertyAvailability();
        renderPropertyCalculator(null);
    }
    checkInquiryAuthNote();
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
    if (image) image.src = src;
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
    if (galleryImages.length === 0) return;

    const currentSrc = galleryImages[currentSlide] || '';
    if (img) img.src = currentSrc;
    if (counter) counter.textContent = `${currentSlide + 1} / ${galleryImages.length}`;

    if (thumbsContainer) {
        thumbsContainer.innerHTML = galleryImages.map((src, i) => `
            <div class="lightbox-thumb ${i === currentSlide ? 'active' : ''}" onclick="selectLightboxSlide(${i})">
                <img src="${src}" alt="Slide ${i + 1}" loading="lazy" decoding="async">
            </div>
        `).join('');
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

