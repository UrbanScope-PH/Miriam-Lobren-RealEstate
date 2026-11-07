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
            messageTextarea.placeholder = "I'm interested and would like to know more about this property. Are there any available units and what are the payment terms?";
            if (!messageTextarea.value.trim()) {
                messageTextarea.value = "I'm interested and would like to know more about this property. Are there any available units and what are the payment terms?";
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
            }
        ];
    }

    allLoadedProperties.forEach(property => {
        if (!property || !property.title) return;
        const title = property.title.toLowerCase();
        if (title.includes('suerte')) property.title = 'Casasuerte';
        else if (title.includes('kathleen')) property.title = 'Kathleen';
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
    if (prefDate) prefDate.value = '';
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
    }

    const inquiryData = {
        property_title: propertyTitle,
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone,
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
        startInquiryCooldown(ownerEmail);
        showSuccessModal(inquiryData, scheduleDetails);
    } else {
        refreshInquiryCooldownUi();
        const errMsg = result ? (result.error || 'Unable to submit inquiry. Please try again.') : 'Unable to submit inquiry. Please try again.';
        showToastNotice(errMsg, true);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.querySelector('.submit-btn');
    if (submitBtn) inquirySubmitOriginalHtml = submitBtn.innerHTML;

    document.addEventListener('urbanscope:user', (event) => {
        inquirySessionEmail = String(event.detail?.email || '').trim().toLowerCase();
        refreshInquiryCooldownUi();
    });

    window.addEventListener('storage', (event) => {
        if (event.key && (event.key.startsWith(INQUIRY_COOLDOWN_STORAGE_PREFIX) || event.key === 'urbanscope_user' || event.key === 'urbanscope_demo_user')) {
            refreshInquiryCooldownUi();
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

    // Set min date on datepicker to today
    const dateInput = document.getElementById('preferredDate');
    if (dateInput) {
        const today = new Date();
        const localToday = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, '0'),
            String(today.getDate()).padStart(2, '0')
        ].join('-');
        dateInput.min = localToday;
    }

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
