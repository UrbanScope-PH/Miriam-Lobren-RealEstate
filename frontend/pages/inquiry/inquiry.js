/**
 * UrbanScope - Client Inquiry Submission Handler
 * Supports two distinct consultation pathways:
 * 1. General Consultation & Inquiries (Site viewing, loans, advice)
 * 2. Specific Property Inquiry (Dynamic catalog selection)
 */

let currentInquiryMode = 'general';
let loadedProperties = [];
let allLoadedProperties = [];
let selectedProperty = null;
const INQUIRY_COOLDOWN_MS = 60 * 1000;
const INQUIRY_COOLDOWN_STORAGE_PREFIX = 'urbanscope_inquiry_cooldown_until:';
let inquirySessionEmail = '';
let inquirySubmitOriginalHtml = '';
let inquirySubmitInProgress = false;
let inquiryCooldownTicker = null;
let inMemoryInquiryCooldown = { ownerEmail: '', until: 0 };

function getInquiryCooldownOwnerEmail(fallbackEmail) {
    if (inquirySessionEmail) return inquirySessionEmail;

    try {
        const storedUser = localStorage.getItem('urbanscope_user') || localStorage.getItem('urbanscope_demo_user');
        if (storedUser) {
            const user = JSON.parse(storedUser);
            if (user && user.email) return String(user.email).trim().toLowerCase();
        }
    } catch (_) {}

    return String(fallbackEmail || '').trim().toLowerCase() || 'anonymous';
}

function getInquiryCooldownStorageKey(ownerEmail) {
    return INQUIRY_COOLDOWN_STORAGE_PREFIX + encodeURIComponent(ownerEmail || 'anonymous');
}

function getInquiryCooldownUntil(ownerEmail) {
    let until = inMemoryInquiryCooldown.ownerEmail === ownerEmail ? inMemoryInquiryCooldown.until : 0;
    const key = getInquiryCooldownStorageKey(ownerEmail);

    try {
        until = Math.max(until, Number(localStorage.getItem(key) || 0) || 0);
        if (until <= Date.now()) localStorage.removeItem(key);
    } catch (_) {}

    if (until <= Date.now()) {
        if (inMemoryInquiryCooldown.ownerEmail === ownerEmail) {
            inMemoryInquiryCooldown = { ownerEmail: '', until: 0 };
        }
        return 0;
    }
    return until;
}

function formatInquiryCooldown(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function refreshInquiryCooldownUi() {
    if (inquirySubmitInProgress) return;

    const submitBtn = document.querySelector('.submit-btn');
    const submitAnotherBtn = document.getElementById('submitAnotherBtn');
    const notice = document.getElementById('inquiryCooldownNotice');
    if (!submitBtn) return;

    if (!inquirySubmitOriginalHtml) inquirySubmitOriginalHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = inquirySubmitOriginalHtml;

    const ownerEmail = getInquiryCooldownOwnerEmail(document.getElementById('clientEmail')?.value);
    const until = getInquiryCooldownUntil(ownerEmail);
    const remainingMs = until - Date.now();
    const label = submitBtn.querySelector('span');

    if (remainingMs > 0) {
        const timeLabel = formatInquiryCooldown(remainingMs);
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.72';
        submitBtn.setAttribute('aria-describedby', 'inquiryCooldownNotice');
        if (label) label.textContent = `Try again in ${timeLabel}`;
        if (notice) {
            notice.hidden = false;
            notice.textContent = `Please wait ${timeLabel} before submitting another inquiry.`;
        }
        if (submitAnotherBtn) {
            submitAnotherBtn.disabled = true;
            submitAnotherBtn.textContent = `Submit Another (${timeLabel})`;
        }
        if (!inquiryCooldownTicker) {
            inquiryCooldownTicker = window.setInterval(refreshInquiryCooldownUi, 1000);
        }
        return;
    }

    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
    submitBtn.removeAttribute('aria-describedby');
    if (label) label.textContent = 'Submit Inquiry';
    if (notice) notice.hidden = true;
    if (submitAnotherBtn) {
        submitAnotherBtn.disabled = false;
        submitAnotherBtn.textContent = 'Submit Another';
    }
    if (inquiryCooldownTicker) {
        window.clearInterval(inquiryCooldownTicker);
        inquiryCooldownTicker = null;
    }
}

function startInquiryCooldown(ownerEmail) {
    const normalizedEmail = String(ownerEmail || '').trim().toLowerCase() || 'anonymous';
    const until = Date.now() + INQUIRY_COOLDOWN_MS;
    const key = getInquiryCooldownStorageKey(normalizedEmail);
    inMemoryInquiryCooldown = { ownerEmail: normalizedEmail, until };

    try {
        localStorage.setItem(key, String(until));
    } catch (_) {}

    refreshInquiryCooldownUi();
}

function resolvePropImage(url) {
    if (!url) return '../../assets/images/property1.jpg';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    if (url.startsWith('../../')) return url;
    if (url.startsWith('../')) return '../' + url;
    return '../../' + url.replace(/^(\.\.\/)+/, '');
}

function isSoldOutProperty(property) {
    const status = String(property?.status || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
    return status === 'sold' || status === 'sold out';
}

function switchInquiryMode(mode) {
    currentInquiryMode = mode;
    const tabGeneral = document.getElementById('tabGeneral');
    const tabProperty = document.getElementById('tabProperty');
    const consultationSection = document.getElementById('consultationSection');
    const propertySection = document.getElementById('propertySection');
    const messageLabel = document.getElementById('inquiryMessageLabel');
    const messageTextarea = document.getElementById('inquiryMessage');

    if (mode === 'general') {
        if (tabGeneral) {
            tabGeneral.classList.add('active');
            tabGeneral.setAttribute('aria-selected', 'true');
        }
        if (tabProperty) {
            tabProperty.classList.remove('active');
            tabProperty.setAttribute('aria-selected', 'false');
        }
        if (consultationSection) consultationSection.style.display = 'block';
        if (propertySection) propertySection.style.display = 'none';

        if (messageLabel) {
            messageLabel.textContent = 'What would you like to discuss or ask Miriam Lobren?*';
        }
        if (messageTextarea) {
            messageTextarea.placeholder = "Tell us what you'd like to ask or discuss, any questions about financing or locations, or your preferred site viewing schedule...";
            // If the textarea currently has the property default text, clear it for user convenience
            if (messageTextarea.value.includes("I'm interested and would like to know more about this property")) {
                messageTextarea.value = "";
            }
        }
    } else {
        if (tabGeneral) {
            tabGeneral.classList.remove('active');
            tabGeneral.setAttribute('aria-selected', 'false');
        }
        if (tabProperty) {
            tabProperty.classList.add('active');
            tabProperty.setAttribute('aria-selected', 'true');
        }
        if (consultationSection) consultationSection.style.display = 'none';
        if (propertySection) propertySection.style.display = 'block';

        if (messageLabel) {
            messageLabel.textContent = 'Message*';
        }
        if (messageTextarea) {
            messageTextarea.placeholder = "Tell us what you'd like to ask or know about this property, unit availability, payment terms, or your preferred site viewing schedule...";
            if (messageTextarea.value.includes("I'm interested and would like to know more about this property")) {
                messageTextarea.value = "";
            }
        }

        // Render current selection
        if (selectedProperty) {
            renderSelectedProperty(selectedProperty);
        }
    }
}

function renderSelectedProperty(prop) {
    if (!prop) return;
    const thumbEl = document.getElementById('propSummaryThumb');
    const titleEl = document.getElementById('propSummaryTitle');
    const locEl = document.getElementById('propSummaryLocText');
    const lotVal = document.getElementById('propLotVal');
    const typeVal = document.getElementById('propTypeVal');
    const priceVal = document.getElementById('propPriceVal');

    if (thumbEl) {
        thumbEl.src = resolvePropImage(prop.image_url);
        thumbEl.alt = prop.title || prop.propertyName || 'Property';
    }
    if (titleEl) titleEl.textContent = prop.title || prop.propertyName || 'Property Listing';
    if (locEl) locEl.textContent = prop.location || 'Cavite / Las Piñas';
    if (lotVal) lotVal.textContent = (prop.lot_area || prop.floor_area || 120) + ' sqm';
    if (typeVal) typeVal.textContent = prop.property_type || 'Residential';
    if (priceVal) priceVal.textContent = '₱' + Number(prop.price || 0).toLocaleString();
}

function setPropertySelection(prop, noticeText = '') {
    selectedProperty = prop || null;
    const select = document.getElementById('propertySelect');
    const summary = document.getElementById('propertySummaryBox');
    const notice = document.getElementById('soldPropertyNotice');

    if (select) select.value = prop ? String(prop.id) : '';
    if (summary) summary.style.display = prop ? 'flex' : 'none';
    if (notice) {
        notice.hidden = !noticeText;
        notice.textContent = noticeText;
    }
    if (prop) renderSelectedProperty(prop);
}

function renderAvailablePropertyOptions(selectedId = '') {
    const select = document.getElementById('propertySelect');
    if (!select) return;

    const placeholder = loadedProperties.length
        ? '<option value="">Choose an available listing</option>'
        : '<option value="">No available properties to inquire about</option>';
    const options = loadedProperties.map(property => {
        const title = property.title || property.propertyName || 'Property';
        const location = property.location ? ` - ${property.location}` : '';
        const price = property.price ? ` (₱${Number(property.price).toLocaleString()})` : '';
        return `<option value="${property.id}">${title}${location}${price}</option>`;
    }).join('');

    select.innerHTML = placeholder + options;
    select.value = selectedId && loadedProperties.some(property => String(property.id) === String(selectedId))
        ? String(selectedId)
        : '';
}

function onPropertySelectionChange() {
    const select = document.getElementById('propertySelect');
    if (!select) return;
    if (!select.value) {
        const notice = document.getElementById('soldPropertyNotice');
        setPropertySelection(null, notice && !notice.hidden ? notice.textContent : '');
        return;
    }

    const propId = String(select.value);
    const found = loadedProperties.find(p => String(p.id) === propId);
    if (found) {
        setPropertySelection(found);
    } else {
        setPropertySelection(null);
    }
}

async function loadPropertiesCatalog() {
    try {
        if (typeof apiGetProperties === 'function') {
            const list = await apiGetProperties();
            if (Array.isArray(list) && list.length > 0) {
                allLoadedProperties = list;
            }
        }
    } catch (err) {
        console.warn('Error fetching live properties catalog:', err);
    }

    // Fallback if needed
    if (allLoadedProperties.length === 0) {
        try {
            const cached = JSON.parse(localStorage.getItem('cached_live_properties') || localStorage.getItem('urbanScopeProperties') || '[]');
            if (Array.isArray(cached) && cached.length > 0) {
                allLoadedProperties = cached;
            }
        } catch (e) {}
    }

    if (allLoadedProperties.length === 0) {
        allLoadedProperties = [
            {
                id: 1,
                title: "Casasuerte",
                location: "Barangay San Agustin, Trece Martires City, Cavite",
                property_type: "Townhouse",
                price: 2500000,
                lot_area: 50,
                image_url: "assets/images/casasuerte.jpg"
            },
            {
                id: 2,
                title: "Kathleen",
                location: "Molino 7, Bacoor, Cavite",
                property_type: "Townhouse",
                price: 6200000,
                lot_area: 112,
                image_url: "assets/images/kathleen-facade.jpg"
            },
            {
                id: 3,
                title: "Liora Homes",
                location: "Brgy. Malainen Bago, Naic, Cavite",
                property_type: "Townhouse",
                price: 2462400,
                lot_area: 50,
                image_url: "assets/images/LioraHomes.jpg"
            },
            {
                id: 4,
                title: "Airmen's Village Triplex",
                location: "Pulang Lupa Dos, Las Piñas City",
                property_type: "Triplex",
                price: 8900000,
                lot_area: 83.25,
                image_url: "assets/images/AirmenTriplex.WEBP"
            },
            {
                id: 5,
                title: "Benecia Single-Attached",
                location: "Sihanouk Village, Barangay Talon IV, Las Piñas City",
                property_type: "Single-Attached House",
                price: 9695000,
                lot_area: 102,
                image_url: "assets/images/benecia-facade.jpg"
            },
            {
                id: 6,
                title: "Amore Classico",
                location: "Benedetto Residences, Barangay Pulang Lupa Uno, Las Piñas City",
                property_type: "Townhouse",
                price: 7995000,
                lot_area: 52,
                image_url: "assets/images/amore-facade.jpg"
            }
        ];
    }

    allLoadedProperties.forEach(property => {
        if (!property || !property.title) return;
        const title = property.title.toLowerCase();
        if (title.includes('suerte')) property.title = 'Casasuerte';
        else if (title.includes('kathleen')) property.title = 'Kathleen';
        else if (title.includes('benecia')) property.title = 'Benecia Single-Attached';
        else if (title.includes('amore')) property.title = 'Amore Classico';
    });
    loadedProperties = allLoadedProperties.filter(property => !isSoldOutProperty(property));

    // Populate propertySelect dropdown
    renderAvailablePropertyOptions();

    // Read URL params to determine initial mode & property
    const urlParams = new URLSearchParams(window.location.search);
    const paramType = (urlParams.get('type') || '').toLowerCase();
    const paramId = urlParams.get('id') || urlParams.get('property_id');
    const paramTitle = (urlParams.get('title') || '').toLowerCase();

    let matched = null;
    if (paramId) {
        matched = allLoadedProperties.find(p => String(p.id) === String(paramId));
    }
    if (!matched && paramTitle) {
        matched = allLoadedProperties.find(p => {
            const propertyTitle = (p.title || p.propertyName || '').toLowerCase();
            return propertyTitle.includes(paramTitle) || paramTitle.includes(propertyTitle);
        });
    }

    if (matched) {
        if (isSoldOutProperty(matched)) {
            renderAvailablePropertyOptions();
            setPropertySelection(null, `${matched.title || 'This property'} is sold out and is no longer accepting inquiries. Choose an available listing or switch to a general consultation.`);
        } else {
            setPropertySelection(matched);
        }
        switchInquiryMode('property');
    } else if (paramType === 'property') {
        const hasSpecificTarget = Boolean(paramId || paramTitle);
        const firstAvailable = hasSpecificTarget ? null : (loadedProperties[0] || null);
        const noticeText = firstAvailable
            ? ''
            : hasSpecificTarget
                ? 'This listing could not be verified as available. Choose an available listing or switch to a general consultation.'
                : 'There are no available properties accepting inquiries right now. You can still submit a general consultation.';
        setPropertySelection(firstAvailable, noticeText);
        switchInquiryMode('property');
    } else {
        // Default to General Consultation (eliminates forced/unwanted property selection)
        setPropertySelection(loadedProperties[0] || null);
        switchInquiryMode('general');
    }

    // Check for calculation intent from Property Amortization Calculator
    checkCalculatorIntent(matched || selectedProperty);
}

function showCalculatorPrefBanner(intentData) {
    const wrap = document.getElementById('calcPrefBannerWrap');
    if (!wrap || !intentData) return;

    const fName = intentData.financingType === 'pagibig' ? 'Pag-IBIG Fund' : 'Bank Financing';
    const rate = intentData.financingRate ? `${intentData.financingRate}%` : '';
    const amort = intentData.monthlyAmortization ? '₱' + Number(intentData.monthlyAmortization).toLocaleString('en-PH') + '/mo' : '';
    const term = intentData.loanTermYears || 20;
    const dpPct = intentData.dpPercent || 20;
    const dpMonths = intentData.dpMonths || 12;

    wrap.innerHTML = `
        <div class="calc-pref-banner" role="status">
            <div class="calc-pref-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="2" width="16" height="20" rx="2"></rect>
                    <line x1="8" y1="6" x2="16" y2="6"></line>
                    <line x1="16" y1="14" x2="16" y2="18"></line>
                    <path d="M16 10h.01"></path>
                    <path d="M12 10h.01"></path>
                    <path d="M8 10h.01"></path>
                    <path d="M12 14h.01"></path>
                    <path d="M8 14h.01"></path>
                    <path d="M12 18h.01"></path>
                    <path d="M8 18h.01"></path>
                </svg>
            </div>
            <div class="calc-pref-content">
                <strong>Simulated Financing Preference Attached:</strong>
                <span>${fName} ${rate ? '(' + rate + ')' : ''} · ${dpPct}% DP (${dpMonths} mos) · ${term} Years${amort ? ' · Est. Amort: <strong>' + amort + '</strong>' : ''}</span>
            </div>
        </div>
    `;
}

function checkCalculatorIntent(selectedProp) {
    const urlParams = new URLSearchParams(window.location.search);
    const hasCalcParam = urlParams.get('calc') === '1' || urlParams.get('calc') === 'true';

    let intentData = null;
    try {
        const stored = sessionStorage.getItem('urbanscope_calc_intent');
        if (stored) intentData = JSON.parse(stored);
    } catch (e) { }

    if (!hasCalcParam && !intentData) return;

    const messageTextarea = document.getElementById('inquiryMessage');
    if (!messageTextarea) return;

    if (intentData) {
        const propName = intentData.propertyTitle || (selectedProp ? selectedProp.title : 'this property');
        const fName = intentData.financingType === 'pagibig' ? 'Pag-IBIG Fund (6.25% Indicative)' : 'Bank Financing (7.0% Indicative)';
        const amort = intentData.monthlyAmortization ? '₱' + Number(intentData.monthlyAmortization).toLocaleString('en-PH') + '/mo' : '';
        const dpMonths = intentData.dpMonths || 12;
        const monthlyDp = intentData.monthlyDp ? '₱' + Number(intentData.monthlyDp).toLocaleString('en-PH') + '/mo' : '';
        const term = intentData.loanTermYears || 20;
        const dpPct = intentData.dpPercent || 20;
        const requiredGmi = intentData.requiredGmi ? '₱' + Number(intentData.requiredGmi).toLocaleString('en-PH') + '/mo' : '';

        const note = [
            `Hi Miriam, I am interested in ${propName}. I simulated the financing with the following details:`,
            `• Financing: ${fName}`,
            `• Downpayment: ${dpPct}% Equity (${monthlyDp} for ${dpMonths} months)`,
            `• Loan Term: ${term} Years`,
            amort ? `• Est. Monthly Amortization: ${amort}` : '',
            requiredGmi ? `• Target Monthly Income: ${requiredGmi} (35% GMI ceiling)` : '',
            '',
            `I would like to request an official developer computation sheet, schedule a site viewing, and confirm current block & lot availability.`
        ].filter(Boolean).join('\n');

        if (!messageTextarea.value || messageTextarea.value.trim() === '') {
            messageTextarea.value = note;
        }

        showCalculatorPrefBanner(intentData);

        // Keep intent in case the user refreshes or switches modes, or clear after submission
    }
}

function updatePropertyAvailability(property) {
    if (!property) return;

    const index = allLoadedProperties.findIndex(item => String(item.id) === String(property.id));
    if (index >= 0) allLoadedProperties[index] = { ...allLoadedProperties[index], ...property };
    else allLoadedProperties.push(property);

    loadedProperties = allLoadedProperties.filter(item => !isSoldOutProperty(item));
    renderAvailablePropertyOptions(selectedProperty && !isSoldOutProperty(selectedProperty) ? selectedProperty.id : '');
}

function handleSoldOutSelection(property) {
    updatePropertyAvailability(property);
    const title = property?.title || selectedProperty?.title || 'This property';
    setPropertySelection(null, `${title} is sold out and is no longer accepting inquiries. Choose an available listing or switch to a general consultation.`);
}

async function refreshSelectedPropertyAvailability() {
    if (inquirySubmitInProgress || !selectedProperty?.id || typeof apiGetPropertyById !== 'function') return;

    try {
        const property = await apiGetPropertyById(selectedProperty.id);
        if (!property) return;
        if (isSoldOutProperty(property)) {
            handleSoldOutSelection(property);
            showToastNotice('This property is sold out and can no longer receive inquiries.', true);
            return;
        }

        selectedProperty = property;
        updatePropertyAvailability(property);
        setPropertySelection(property);
    } catch (_) {}
}

function isUserLoggedIn() {
    try {
        const storedUser = localStorage.getItem('urbanscope_user') || localStorage.getItem('urbanscope_demo_user');
        if (storedUser) {
            const u = JSON.parse(storedUser);
            if (u && (u.email || u.id)) return true;
        }
    } catch (_) {}
    return false;
}

function updateInquirySessionUi() {
    const loggedIn = isUserLoggedIn();
    const guestBanner = document.getElementById('guestInquiryBanner');
    const historyLink = document.getElementById('inquiryHistoryLink');
    const userTag = document.getElementById('userDetectedTag');
    const infoTitle = document.getElementById('userInfoTitleText');

    if (loggedIn) {
        if (guestBanner) guestBanner.style.display = 'none';
        if (historyLink) historyLink.style.display = 'inline-flex';
        if (userTag) userTag.style.display = 'inline';
        if (infoTitle) infoTitle.textContent = 'Your Information';
    } else {
        if (guestBanner) guestBanner.style.display = 'flex';
        if (historyLink) historyLink.style.display = 'none';
        if (userTag) userTag.style.display = 'none';
        if (infoTitle) infoTitle.textContent = 'Your Contact Details';
    }
}

function showSuccessModal(inquiryData, scheduleDetails) {
    const modal = document.getElementById('inquirySuccessModal');
    if (!modal) return;

    const propTitleEl = document.getElementById('successPropertyTitle');
    if (propTitleEl) propTitleEl.textContent = inquiryData.property_title || 'General Consultation';

    const nameEl = document.getElementById('successClientName');
    if (nameEl) nameEl.textContent = inquiryData.client_name || '--';

    const emailEl = document.getElementById('successClientEmail');
    if (emailEl) emailEl.textContent = inquiryData.client_email || '--';

    const phoneEl = document.getElementById('successClientPhone');
    if (phoneEl) phoneEl.textContent = inquiryData.client_phone || 'None provided';

    const dateStampEl = document.getElementById('successDateStamp');
    if (dateStampEl) {
        const now = new Date();
        dateStampEl.textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    const scheduleBox = document.getElementById('successScheduleBox');
    const scheduleText = document.getElementById('successScheduleText');
    if (scheduleDetails) {
        if (scheduleBox) scheduleBox.style.display = 'inline-flex';
        if (scheduleText) scheduleText.textContent = `Schedule: ${scheduleDetails}`;
    } else {
        if (scheduleBox) scheduleBox.style.display = 'none';
    }

    const loggedInActions = document.getElementById('modalLoggedInActions');
    const guestActions = document.getElementById('modalGuestActions');
    if (isUserLoggedIn()) {
        if (loggedInActions) loggedInActions.style.display = 'flex';
        if (guestActions) guestActions.style.display = 'none';
    } else {
        if (loggedInActions) loggedInActions.style.display = 'none';
        if (guestActions) guestActions.style.display = 'flex';
        try {
            sessionStorage.setItem('urbanscope_register_draft', JSON.stringify({
                fullname: inquiryData.client_name,
                email: inquiryData.client_email,
                phone: inquiryData.client_phone
            }));
        } catch (_) {}
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSuccessModal() {
    const modal = document.getElementById('inquirySuccessModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function resetFormAndCloseModal() {
    closeSuccessModal();
    const textarea = document.getElementById('inquiryMessage');
    if (textarea) textarea.value = '';
    const prefDate = document.getElementById('preferredDate');
    if (prefDate) {
        prefDate.value = '';
        prefDate.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const propPrefDate = document.getElementById('propertyPreferredDate');
    if (propPrefDate) {
        propPrefDate.value = '';
        propPrefDate.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const prefTime = document.getElementById('preferredTime');
    if (prefTime) {
        prefTime.value = 'Flexible / Any Time';
        prefTime.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const propPrefTime = document.getElementById('propertyPreferredTime');
    if (propPrefTime) {
        propPrefTime.value = 'Flexible / Any Time';
        propPrefTime.dispatchEvent(new Event('change', { bubbles: true }));
    }
    showToastNotice('You can submit another consultation inquiry below.', false);
}

function showToastNotice(message, isError = false) {
    const toast = document.getElementById('toastNotice');
    const msgEl = document.getElementById('toastMessage');
    const iconEl = document.getElementById('toastIcon');
    if (!toast) return;

    if (msgEl) msgEl.textContent = message;
    if (isError) {
        toast.classList.add('error');
        if (iconEl) {
            iconEl.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
        }
    } else {
        toast.classList.remove('error');
        if (iconEl) {
            iconEl.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
        }
    }

    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4500);
}

async function submitInquiry() {
    if (inquirySubmitInProgress) return;

    const submitBtn = document.querySelector('.submit-btn');
    const ownerEmail = getInquiryCooldownOwnerEmail(document.getElementById('clientEmail')?.value);
    const cooldownUntil = getInquiryCooldownUntil(ownerEmail);
    if (cooldownUntil > Date.now()) {
        refreshInquiryCooldownUi();
        return;
    }

    inquirySubmitInProgress = true;

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="btn-spinner"></span> <span>Sending Request...</span>';
        submitBtn.style.opacity = '0.85';
    }

    if (currentInquiryMode === 'property') {
        if (!selectedProperty) {
            inquirySubmitInProgress = false;
            refreshInquiryCooldownUi();
            showToastNotice('Choose an available property before submitting this inquiry.', true);
            return;
        }

        let currentProperty = selectedProperty;
        if (selectedProperty.id && typeof apiGetPropertyById === 'function') {
            try {
                currentProperty = await apiGetPropertyById(selectedProperty.id) || selectedProperty;
            } catch (_) {}
        }

        if (isSoldOutProperty(currentProperty)) {
            handleSoldOutSelection(currentProperty);
            inquirySubmitInProgress = false;
            refreshInquiryCooldownUi();
            showToastNotice('This property is sold out and can no longer receive inquiries.', true);
            return;
        }

        selectedProperty = currentProperty;
        updatePropertyAvailability(currentProperty);
        setPropertySelection(currentProperty);
    }

    const clientName = document.getElementById('clientName').value.trim();
    const clientEmail = document.getElementById('clientEmail').value.trim();
    const clientPhone = document.getElementById('clientPhone').value.trim();
    const rawMessage = document.getElementById('inquiryMessage').value.trim();

    let propertyTitle = "General Consultation";
    let formattedMessage = rawMessage;
    let scheduleDetails = null;

    if (currentInquiryMode === 'general') {
        const topic = document.getElementById('consultationTopic').value;
        const prefDate = document.getElementById('preferredDate').value;
        const prefTime = document.getElementById('preferredTime').value;

        propertyTitle = `General Consultation: ${topic}`;
        let scheduleNote = '';
        if (prefDate) {
            scheduleDetails = `${prefDate} (${prefTime})`;
            scheduleNote = `[Preferred Schedule: ${prefDate} | ${prefTime}]\n\n`;
        } else if (prefTime && prefTime !== 'Flexible / Any Time') {
            scheduleDetails = `${prefTime}`;
            scheduleNote = `[Preferred Slot: ${prefTime}]\n\n`;
        }
        formattedMessage = scheduleNote + rawMessage;
    } else {
        const rawPropTitle = selectedProperty ? String(selectedProperty.title || selectedProperty.propertyName || "").trim() : "";
        propertyTitle = rawPropTitle
            ? (/^specific\s+property\s+inquiry\s*:/i.test(rawPropTitle) ? rawPropTitle : `Specific Property Inquiry: ${rawPropTitle}`)
            : "Specific Property Inquiry";

        const propDateEl = document.getElementById('propertyPreferredDate') || document.getElementById('preferredDate');
        const propTimeEl = document.getElementById('propertyPreferredTime') || document.getElementById('preferredTime');
        const prefDate = propDateEl ? propDateEl.value : '';
        const prefTime = propTimeEl ? propTimeEl.value : 'Flexible / Any Time';

        let scheduleNote = '';
        if (prefDate) {
            scheduleDetails = `${prefDate} (${prefTime})`;
            scheduleNote = `[Preferred Schedule: ${prefDate} | ${prefTime}]\n\n`;
        } else if (prefTime && prefTime !== 'Flexible / Any Time') {
            scheduleDetails = `${prefTime}`;
            scheduleNote = `[Preferred Slot: ${prefTime}]\n\n`;
        }
        formattedMessage = scheduleNote + rawMessage;
    }

    // Anti-spam Honeypot Check
    const hpVal = document.getElementById('companyWebsite')?.value || '';
    if (hpVal.trim().length > 0) {
        inquirySubmitInProgress = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = inquirySubmitOriginalHtml;
            submitBtn.style.opacity = '1';
        }
        showSuccessModal({
            property_title: propertyTitle,
            client_name: clientName || 'Guest',
            client_email: clientEmail,
            client_phone: clientPhone
        }, scheduleDetails);
        return;
    }

    // Name Validation
    if (!clientName || clientName.length < 2) {
        inquirySubmitInProgress = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = inquirySubmitOriginalHtml;
            submitBtn.style.opacity = '1';
        }
        showToastNotice('Please enter your full name (at least 2 characters).', true);
        document.getElementById('clientName')?.focus();
        return;
    }

    // Email Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!clientEmail || !emailRegex.test(clientEmail)) {
        inquirySubmitInProgress = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = inquirySubmitOriginalHtml;
            submitBtn.style.opacity = '1';
        }
        showToastNotice('Please provide a valid email address so Miriam can contact you.', true);
        document.getElementById('clientEmail')?.focus();
        return;
    }

    // Philippine Mobile Number Validation and Normalization
    let normalizedPhone = clientPhone.replace(/[\s\-\(\)]/g, '');
    if (/^09\d{9}$/.test(normalizedPhone)) {
        normalizedPhone = '+63' + normalizedPhone.slice(1);
    } else if (/^639\d{9}$/.test(normalizedPhone)) {
        normalizedPhone = '+' + normalizedPhone;
    } else if (/^9\d{9}$/.test(normalizedPhone)) {
        normalizedPhone = '+63' + normalizedPhone;
    } else if (!/^\+639\d{9}$/.test(normalizedPhone)) {
        inquirySubmitInProgress = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = inquirySubmitOriginalHtml;
            submitBtn.style.opacity = '1';
        }
        showToastNotice('Please enter a valid Philippine mobile number (e.g. 0917 123 4567 or +63 917 123 4567).', true);
        document.getElementById('clientPhone')?.focus();
        return;
    }

    const inquiryData = {
        property_title: propertyTitle,
        client_name: clientName,
        client_email: clientEmail,
        client_phone: normalizedPhone,
        message: formattedMessage,
        status: 'Under Review'
    };

    let result = null;
    try {
        if (typeof apiSubmitInquiry === 'function') {
            result = await apiSubmitInquiry(inquiryData);
        } else {
            result = { success: true };
        }
    } catch (err) {
        console.error('Submission request failed:', err);
        result = { success: false, error: err.message };
    }

    inquirySubmitInProgress = false;

    if (result && result.success) {
        try { sessionStorage.removeItem('urbanscope_calc_intent'); } catch (e) { }
        startInquiryCooldown(ownerEmail);
        showSuccessModal(inquiryData, scheduleDetails);
    } else {
        refreshInquiryCooldownUi();
        const errMsg = result ? (result.error || 'Unable to submit inquiry. Please try again.') : 'Unable to submit inquiry. Please try again.';
        showToastNotice(errMsg, true);
    }
}

/**
 * Custom UrbanScope DatePicker Component
 * Replaces raw browser native date picker with a polished, on-brand calendar dropdown.
 */
function initUrbanDatePicker(inputEl) {
    if (!inputEl) return;
    const wrap = inputEl.closest('.custom-datepicker-wrap');
    if (!wrap) return;

    let viewDate = new Date();
    let popupEl = null;

    function toIso(d) {
        return [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, '0'),
            String(d.getDate()).padStart(2, '0')
        ].join('-');
    }

    const todayObj = new Date();
    const todayStr = toIso(todayObj);

    function getSelectedDate() {
        if (!inputEl.value) return null;
        const parts = inputEl.value.trim().split('-');
        if (parts.length === 3) {
            const y = Number(parts[0]), m = Number(parts[1]) - 1, d = Number(parts[2]);
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                return new Date(y, m, d);
            }
        }
        return null;
    }

    function openCalendar() {
        document.querySelectorAll('.urban-datepicker-popup').forEach(p => p.remove());

        const sel = getSelectedDate();
        viewDate = sel ? new Date(sel.getFullYear(), sel.getMonth(), 1) : new Date(todayObj.getFullYear(), todayObj.getMonth(), 1);

        popupEl = document.createElement('div');
        popupEl.className = 'urban-datepicker-popup';

        const rect = wrap.getBoundingClientRect();
        if (rect.left + 310 > window.innerWidth - 16) {
            popupEl.classList.add('align-right');
        }

        renderCalendar();
        wrap.appendChild(popupEl);

        setTimeout(() => {
            document.addEventListener('click', onDocClick);
            document.addEventListener('keydown', onDocKey);
        }, 20);
    }

    function closeCalendar() {
        if (popupEl) {
            popupEl.remove();
            popupEl = null;
        }
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onDocKey);
    }

    function onDocClick(e) {
        if (!wrap.contains(e.target)) {
            closeCalendar();
        }
    }

    function onDocKey(e) {
        if (e.key === 'Escape') {
            closeCalendar();
        }
    }

    function renderCalendar() {
        if (!popupEl) return;

        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthTitle = `${monthNames[month]} ${year}`;

        const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevDaysInMonth = new Date(year, month, 0).getDate();

        const canGoPrev = (year > todayObj.getFullYear()) || (year === todayObj.getFullYear() && month > todayObj.getMonth());

        let html = `
            <div class="datepicker-header">
                <button type="button" class="datepicker-nav-btn prev-month-btn" aria-label="Previous month" ${!canGoPrev ? 'disabled' : ''}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
                <div class="datepicker-title">${monthTitle}</div>
                <button type="button" class="datepicker-nav-btn next-month-btn" aria-label="Next month">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
            </div>

            <div class="datepicker-weekdays">
                <span class="datepicker-weekday">S</span>
                <span class="datepicker-weekday">M</span>
                <span class="datepicker-weekday">T</span>
                <span class="datepicker-weekday">W</span>
                <span class="datepicker-weekday">T</span>
                <span class="datepicker-weekday">F</span>
                <span class="datepicker-weekday">S</span>
            </div>

            <div class="datepicker-days">
        `;

        // Leading days from prev month
        for (let i = firstDayIndex - 1; i >= 0; i--) {
            const d = prevDaysInMonth - i;
            html += `<span class="datepicker-day-cell is-other-month is-disabled">${d}</span>`;
        }

        // Days of current month
        const selectedStr = inputEl.value.trim();
        for (let day = 1; day <= daysInMonth; day++) {
            const thisDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isPast = thisDateStr < todayStr;
            const isToday = thisDateStr === todayStr;
            const isSelected = thisDateStr === selectedStr;

            let classes = ['datepicker-day-cell'];
            if (isPast) classes.push('is-disabled');
            if (isToday) classes.push('is-today');
            if (isSelected) classes.push('is-selected');

            html += `<button type="button" class="${classes.join(' ')}" data-date="${thisDateStr}" ${isPast ? 'disabled' : ''}>${day}</button>`;
        }

        // Trailing days from next month
        const totalCellsSoFar = firstDayIndex + daysInMonth;
        const remainingCells = (7 - (totalCellsSoFar % 7)) % 7;
        for (let j = 1; j <= remainingCells; j++) {
            html += `<span class="datepicker-day-cell is-other-month is-disabled">${j}</span>`;
        }

        html += `
            </div>

            <div class="datepicker-footer">
                <button type="button" class="datepicker-action-btn datepicker-action-clear">Clear</button>
                <button type="button" class="datepicker-action-btn datepicker-action-today">Today</button>
            </div>
        `;

        popupEl.innerHTML = html;

        const prevBtn = popupEl.querySelector('.prev-month-btn');
        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (canGoPrev) {
                    viewDate.setMonth(viewDate.getMonth() - 1);
                    renderCalendar();
                }
            });
        }

        const nextBtn = popupEl.querySelector('.next-month-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                viewDate.setMonth(viewDate.getMonth() + 1);
                renderCalendar();
            });
        }

        popupEl.querySelectorAll('.datepicker-day-cell[data-date]').forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                const chosen = cell.getAttribute('data-date');
                selectDate(chosen);
            });
        });

        const clearBtn = popupEl.querySelector('.datepicker-action-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectDate('');
            });
        }

        const todayBtn = popupEl.querySelector('.datepicker-action-today');
        if (todayBtn) {
            todayBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectDate(todayStr);
            });
        }
    }

    function selectDate(val) {
        inputEl.value = val;
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        closeCalendar();
    }

    wrap.addEventListener('click', (e) => {
        if (popupEl && popupEl.contains(e.target)) return;
        if (popupEl) {
            closeCalendar();
        } else {
            openCalendar();
        }
    });
}

/**
 * Custom UrbanScope Select Dropdown Component
 * Replaces unstyled native OS select dropdowns with an on-brand, animated custom menu.
 */
function initUrbanSelect(selectEl) {
    if (!selectEl) return;
    if (selectEl.dataset.urbanSelectInitialized === 'true') return;
    selectEl.dataset.urbanSelectInitialized = 'true';

    selectEl.classList.add('custom-select-source');

    const wrap = document.createElement('div');
    wrap.className = 'custom-select-wrap';
    selectEl.parentNode.insertBefore(wrap, selectEl);
    wrap.appendChild(selectEl);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const valueSpan = document.createElement('span');
    valueSpan.className = 'custom-select-value';

    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'custom-select-arrow';
    arrowSpan.setAttribute('aria-hidden', 'true');
    arrowSpan.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    `;

    trigger.appendChild(valueSpan);
    trigger.appendChild(arrowSpan);
    wrap.appendChild(trigger);

    let dropdownEl = null;

    function getOptionIcon(val, text) {
        const lower = (String(val || '') + ' ' + String(text || '')).toLowerCase();
        if (lower.includes('morning') || lower.includes('9:00 am')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
        }
        if (lower.includes('afternoon') || lower.includes('1:00 pm')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/><line x1="23" y1="22" x2="1" y2="22"/></svg>`;
        }
        if (lower.includes('weekend') || lower.includes('tripping')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="15" r="2"/></svg>`;
        }
        if (lower.includes('flexible') || lower.includes('any time')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
        }
        if (lower.includes('tripping / viewing')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
        }
        if (lower.includes('loan') || lower.includes('pre-approval')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`;
        }
        if (lower.includes('investment') || lower.includes('buying')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
        }
        if (lower.includes('selling') || lower.includes('appraisal')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
        }
        if (lower.includes('general') || lower.includes('question')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
        }
        return '';
    }

    function updateDisplay() {
        const selectedOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
        if (!selectedOpt) return;
        const icon = getOptionIcon(selectedOpt.value, selectedOpt.text);
        valueSpan.innerHTML = (icon ? icon + ' ' : '') + `<span>${selectedOpt.text}</span>`;
    }

    function openDropdown() {
        document.querySelectorAll('.custom-select-wrap.is-open').forEach(w => w.classList.remove('is-open'));
        document.querySelectorAll('.custom-select-dropdown').forEach(d => d.remove());
        document.querySelectorAll('.urban-datepicker-popup').forEach(p => p.remove());

        wrap.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');

        dropdownEl = document.createElement('div');
        dropdownEl.className = 'custom-select-dropdown';

        const rect = wrap.getBoundingClientRect();
        if (rect.left + 260 > window.innerWidth - 16) {
            dropdownEl.classList.add('align-right');
        }

        const currentVal = selectEl.value;
        Array.from(selectEl.options).forEach(opt => {
            const isSel = opt.value === currentVal;
            const optRow = document.createElement('div');
            optRow.className = 'custom-select-option' + (isSel ? ' is-selected' : '');
            optRow.setAttribute('role', 'option');
            optRow.setAttribute('aria-selected', String(isSel));
            optRow.setAttribute('data-value', opt.value);

            const iconSvg = getOptionIcon(opt.value, opt.text);
            optRow.innerHTML = `
                <div class="custom-select-option-content">
                    ${iconSvg ? `<span class="custom-select-option-icon">${iconSvg}</span>` : ''}
                    <span class="custom-select-option-text">${opt.text}</span>
                </div>
                <svg class="custom-select-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;

            optRow.addEventListener('click', (e) => {
                e.stopPropagation();
                selectEl.value = opt.value;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                selectEl.dispatchEvent(new Event('input', { bubbles: true }));
                updateDisplay();
                closeDropdown();
            });

            dropdownEl.appendChild(optRow);
        });

        wrap.appendChild(dropdownEl);

        setTimeout(() => {
            document.addEventListener('click', onDocClick);
            document.addEventListener('keydown', onDocKey);
        }, 15);
    }

    function closeDropdown() {
        wrap.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (dropdownEl) {
            dropdownEl.remove();
            dropdownEl = null;
        }
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onDocKey);
    }

    function onDocClick(e) {
        if (!wrap.contains(e.target)) {
            closeDropdown();
        }
    }

    function onDocKey(e) {
        if (e.key === 'Escape') {
            closeDropdown();
        }
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (wrap.classList.contains('is-open')) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    selectEl.addEventListener('change', updateDisplay);
    updateDisplay();
}

window.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.querySelector('.submit-btn');
    if (submitBtn) inquirySubmitOriginalHtml = submitBtn.innerHTML;

    updateInquirySessionUi();

    document.addEventListener('urbanscope:user', (event) => {
        inquirySessionEmail = String(event.detail?.email || '').trim().toLowerCase();
        refreshInquiryCooldownUi();
        updateInquirySessionUi();
    });

    window.addEventListener('storage', (event) => {
        if (event.key && (event.key.startsWith(INQUIRY_COOLDOWN_STORAGE_PREFIX) || event.key === 'urbanscope_user' || event.key === 'urbanscope_demo_user')) {
            refreshInquiryCooldownUi();
            updateInquirySessionUi();
        }
        if (event.key === 'cached_live_properties') {
            refreshSelectedPropertyAvailability();
        }
    });

    window.addEventListener('focus', refreshSelectedPropertyAvailability);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshSelectedPropertyAvailability();
    });

    const clientEmailInput = document.getElementById('clientEmail');
    if (clientEmailInput) clientEmailInput.addEventListener('input', refreshInquiryCooldownUi);

    refreshInquiryCooldownUi();

    // Set min date on datepicker to today and keep schedule inputs synced across tabs
    const dateInput = document.getElementById('preferredDate');
    const propDateInput = document.getElementById('propertyPreferredDate');
    const timeSelect = document.getElementById('preferredTime');
    const propTimeSelect = document.getElementById('propertyPreferredTime');
    const today = new Date();
    const localToday = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0')
    ].join('-');
    if (dateInput) dateInput.min = localToday;
    if (propDateInput) propDateInput.min = localToday;

    if (dateInput && propDateInput) {
        dateInput.addEventListener('change', () => { propDateInput.value = dateInput.value; });
        propDateInput.addEventListener('change', () => { dateInput.value = propDateInput.value; });
    }
    if (timeSelect && propTimeSelect) {
        timeSelect.addEventListener('change', () => { propTimeSelect.value = timeSelect.value; });
        propTimeSelect.addEventListener('change', () => { timeSelect.value = propTimeSelect.value; });
    }

    // Initialize custom UrbanScope UI datepickers
    if (dateInput) initUrbanDatePicker(dateInput);
    if (propDateInput) initUrbanDatePicker(propDateInput);

    // Initialize custom UrbanScope UI dropdown selects
    const topicSelect = document.getElementById('consultationTopic');
    if (topicSelect) initUrbanSelect(topicSelect);
    if (timeSelect) initUrbanSelect(timeSelect);
    if (propTimeSelect) initUrbanSelect(propTimeSelect);

    // Modal close handlers
    const closeBtn = document.getElementById('closeSuccessModalBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeSuccessModal);

    const submitAnotherBtn = document.getElementById('submitAnotherBtn');
    if (submitAnotherBtn) submitAnotherBtn.addEventListener('click', resetFormAndCloseModal);

    const modal = document.getElementById('inquirySuccessModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeSuccessModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSuccessModal();
    });

    loadPropertiesCatalog();
});
