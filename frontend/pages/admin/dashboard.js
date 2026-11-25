/* PROFILE DROPDOWN & SIDEBAR ARE HANDLED BY ADMIN-SHELL.JS */

/* EXPANDABLE INQUIRIES MENU */

const inquiriesNavGroup = document.getElementById("inquiriesNavGroup");
const inquiriesToggle = document.getElementById("inquiriesToggle");

if (inquiriesToggle && inquiriesNavGroup) {
    inquiriesToggle.addEventListener("click", () => {
        const isOpen = inquiriesNavGroup.classList.toggle("open");

        inquiriesToggle.setAttribute("aria-expanded", String(isOpen));
    });
}

/* PLACEHOLDER NAVIGATION */

document.querySelectorAll("[data-placeholder]").forEach(link => {
    link.addEventListener("click", event => {
        event.preventDefault();

        if (typeof window.showFeedbackToast === 'function') {
            window.showFeedbackToast(`${link.dataset.placeholder} is not available yet.`, 'info');
        } else {
            alert(`${link.dataset.placeholder} is not available yet.`);
        }
    });
});

/* CALENDAR */

const calendarDays = document.getElementById("calendarDays");
const calendarMonthLabel = document.getElementById("calendarMonthLabel");
const selectedDateLabel = document.getElementById("selectedDateLabel");
const calendarAgenda = document.getElementById("calendarAgenda");

const previousMonthBtn = document.getElementById("previousMonth");
const nextMonthBtn = document.getElementById("nextMonth");

const initialCalendarToday = new Date();
let calendarDate = new Date(
    initialCalendarToday.getFullYear(),
    initialCalendarToday.getMonth(),
    1
);
let selectedDate = formatDateKey(
    initialCalendarToday.getFullYear(),
    initialCalendarToday.getMonth(),
    initialCalendarToday.getDate()
);
let lastCalendarTodayKey = selectedDate;
let calendarAppointments = Object.create(null);
let calendarAppointmentRecords = [];
let calendarInquiryRequests = [];
let calendarInquiryRequestSignature = "";
let calendarAppointmentsLoaded = false;
let calendarMidnightTimer = null;

function formatDateKey(year, month, day) {
    return [
        year,
        String(month + 1).padStart(2, "0"),
        String(day).padStart(2, "0")
    ].join("-");
}

function normalizeCalendarDateKey(value) {
    const rawDate = String(value || "").trim();
    const dateOnlyMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);

    if (dateOnlyMatch) {
        const year = Number(dateOnlyMatch[1]);
        const month = Number(dateOnlyMatch[2]) - 1;
        const day = Number(dateOnlyMatch[3]);
        const date = new Date(year, month, day);

        if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
            return formatDateKey(year, month, day);
        }

        return null;
    }

    const parsedDate = new Date(rawDate);
    if (Number.isNaN(parsedDate.getTime())) return null;

    return formatDateKey(
        parsedDate.getFullYear(),
        parsedDate.getMonth(),
        parsedDate.getDate()
    );
}

function rebuildCalendarSchedule() {
    const nextAppointments = Object.create(null);
    const addAppointment = (dateKey, appointment) => {
        if (!dateKey) return;
        if (!nextAppointments[dateKey]) nextAppointments[dateKey] = [];
        nextAppointments[dateKey].push(appointment);
    };

    calendarAppointmentRecords.forEach(appointment => {
        if (!appointment || typeof appointment !== "object") return;

        const dateKey = normalizeCalendarDateKey(appointment.appointment_date);
        const status = String(appointment.status || "scheduled").trim().toLowerCase();

        if (!dateKey || status === "cancelled" || status === "canceled") return;

        addAppointment(dateKey, {
            time: appointment.appointment_time || "Time to be confirmed",
            title: appointment.title || appointment.property_title || "Client property viewing",
            description: appointment.description
                || (appointment.client_name ? `Client: ${appointment.client_name}` : "Scheduled property viewing.")
        });
    });

    calendarInquiryRequests.forEach(request => {
        addAppointment(request.dateKey, {
            time: request.time,
            title: request.title,
            description: request.description
        });
    });

    calendarAppointments = nextAppointments;
    const calSummaryEl = document.getElementById("mobileCalendarSummary");
    if (calSummaryEl) {
        const totalEvents = Object.values(nextAppointments).reduce((sum, arr) => sum + arr.length, 0);
        calSummaryEl.textContent = totalEvents > 0
            ? `${totalEvents} scheduled viewing${totalEvents === 1 ? "" : "s"}`
            : "No scheduled viewings";
    }
    renderCalendar();
    renderAgenda();
}

function setCalendarAppointments(appointments) {
    calendarAppointmentRecords = Array.isArray(appointments) ? appointments : [];
    calendarAppointmentsLoaded = true;
    rebuildCalendarSchedule();
}

/**
 * Extracts the client's preferred schedule that inquiry.js embeds at the top of
 * the message ("[Preferred Schedule: YYYY-MM-DD | Time]" or "[Preferred Slot: Time]")
 * and returns a human-readable label plus the message without the tag.
 */
function parseInquirySchedule(rawMessage, explicitSchedule) {
    const message = String(rawMessage || "");
    let display = String(explicitSchedule || "").trim();
    if (display === "N/A") display = "";
    let cleanMessage = message;

    const fullMatch = message.match(/\[Preferred Schedule:\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^\]\r\n]*)\]/i);
    const slotMatch = !fullMatch && message.match(/\[Preferred Slot:\s*([^\]\r\n]*)\]/i);

    if (fullMatch) {
        const [y, m, d] = fullMatch[1].split("-").map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dateLabel = isNaN(dateObj.getTime())
            ? fullMatch[1]
            : dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
        const timeLabel = fullMatch[2].trim();
        if (!display) display = timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
        cleanMessage = message.replace(fullMatch[0], "");
    } else if (slotMatch) {
        if (!display) display = slotMatch[1].trim();
        cleanMessage = message.replace(slotMatch[0], "");
    }

    cleanMessage = cleanMessage.replace(/^\s+/, "").trim();
    return { display, cleanMessage };
}

function getInquiryCalendarRequest(inquiry) {
    if (!inquiry || typeof inquiry !== "object") return null;

    const status = String(inquiry.status || "Under Review").trim();
    if (["cancelled", "canceled"].includes(status.toLowerCase())) return null;

    const message = String(inquiry.message || "");
    const scheduleMatch = message.match(
        /\[Preferred Schedule:\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^\]\r\n]*)\]/i
    );
    if (!scheduleMatch) return null;

    const dateKey = normalizeCalendarDateKey(scheduleMatch[1]);
    if (!dateKey) return null;

    const clientName = String(inquiry.client_name || "").trim() || "Client";
    const inquiryTitle = String(inquiry.property_title || "").trim() || "Property viewing";
    const time = scheduleMatch[2].trim() || "Flexible / Any Time";
    const isViewingRequest = /view|tripping|site/i.test(inquiryTitle);
    const identity = [
        dateKey,
        time.toLowerCase(),
        String(inquiry.client_email || clientName).trim().toLowerCase(),
        inquiryTitle.toLowerCase()
    ].join("|");

    return {
        dateKey,
        time,
        title: `${isViewingRequest ? "Viewing" : "Consultation"} request · ${inquiryTitle}`,
        description: `Requested by ${clientName} · ${status}`,
        identity
    };
}

function setCalendarInquiryRequests(inquiries) {
    const uniqueRequests = new Map();
    (Array.isArray(inquiries) ? inquiries : []).forEach(inquiry => {
        const request = getInquiryCalendarRequest(inquiry);
        if (request) uniqueRequests.set(request.identity, request);
    });

    const requests = Array.from(uniqueRequests.values()).sort((a, b) =>
        a.dateKey.localeCompare(b.dateKey)
        || a.time.localeCompare(b.time)
        || a.identity.localeCompare(b.identity)
    );
    const signature = JSON.stringify(requests);

    if (signature === calendarInquiryRequestSignature) return;

    calendarInquiryRequestSignature = signature;
    calendarInquiryRequests = requests;
    calendarAppointmentsLoaded = true;
    rebuildCalendarSchedule();
}

async function loadCalendarAppointments() {
    if (typeof apiGetAppointments !== "function") {
        setCalendarAppointments([]);
        return;
    }

    try {
        const appointments = await apiGetAppointments();
        setCalendarAppointments(appointments);
    } catch (error) {
        console.warn("Unable to load property viewing appointments:", error);
        setCalendarAppointments([]);
    }
}

function syncCalendarToToday() {
    const today = new Date();
    const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

    if (todayKey !== lastCalendarTodayKey) {
        const previousTodayParts = lastCalendarTodayKey.split("-").map(Number);
        const wasViewingCurrentMonth = calendarDate.getFullYear() === previousTodayParts[0]
            && calendarDate.getMonth() === previousTodayParts[1] - 1;

        if (wasViewingCurrentMonth) {
            calendarDate = new Date(today.getFullYear(), today.getMonth(), 1);
            selectedDate = todayKey;
        }

        lastCalendarTodayKey = todayKey;
        renderCalendar();
        renderAgenda();
    }

    scheduleCalendarMidnightSync();
}

function scheduleCalendarMidnightSync() {
    if (calendarMidnightTimer) window.clearTimeout(calendarMidnightTimer);

    const now = new Date();
    const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1
    );

    calendarMidnightTimer = window.setTimeout(
        syncCalendarToToday,
        Math.max(1000, nextMidnight.getTime() - now.getTime())
    );
}

function changeCalendarMonth(offset) {
    const selectedDay = Number(selectedDate.split("-")[2]);
    const targetMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + offset, 1);
    const lastDayOfTargetMonth = new Date(
        targetMonth.getFullYear(),
        targetMonth.getMonth() + 1,
        0
    ).getDate();
    const dayToKeep = selectedDay || 1;

    calendarDate = targetMonth;
    selectedDate = formatDateKey(
        targetMonth.getFullYear(),
        targetMonth.getMonth(),
        Math.min(dayToKeep, lastDayOfTargetMonth)
    );

    renderCalendar();
    renderAgenda();
}

function renderCalendar() {
    if (!calendarDays || !calendarMonthLabel) return;

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    calendarMonthLabel.textContent = calendarDate.toLocaleDateString(
        "en-US",
        {
            month: "long",
            year: "numeric"
        }
    );

    calendarDays.innerHTML = "";

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = new Date();

    const todayKey = formatDateKey(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
    );

    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement("span");

        emptyDay.className = "calendar-empty-day";
        emptyDay.setAttribute("aria-hidden", "true");

        calendarDays.appendChild(emptyDay);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = formatDateKey(year, month, day);

        const dayButton = document.createElement("button");

        dayButton.type = "button";
        dayButton.className = "calendar-day";
        dayButton.textContent = day;

        dayButton.setAttribute(
            "aria-label",
            new Date(year, month, day).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric"
            })
        );

        if (dateKey === todayKey) {
            dayButton.classList.add("is-today");
            dayButton.setAttribute("aria-current", "date");
        }

        if (dateKey === selectedDate) {
            dayButton.classList.add("is-selected");
            dayButton.setAttribute("aria-pressed", "true");
        } else {
            dayButton.setAttribute("aria-pressed", "false");
        }

        if (calendarAppointments[dateKey]?.length) {
            dayButton.classList.add("has-event");
            dayButton.title = "Viewing request or scheduled appointment";
        }

        dayButton.addEventListener("click", () => {
            selectedDate = dateKey;

            renderCalendar();
            renderAgenda();
        });

        calendarDays.appendChild(dayButton);
    }
}

function renderAgenda() {
    if (!calendarAgenda || !selectedDateLabel) return;

    const [year, month, day] = selectedDate.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12);

    selectedDateLabel.textContent = date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric"
    });

    if (!calendarAppointmentsLoaded) {
        calendarAgenda.innerHTML = `
            <div class="agenda-empty">
                <strong>Loading scheduled viewings</strong>
                <p>Checking appointment records for this date.</p>
            </div>
        `;

        return;
    }

    const appointments = calendarAppointments[selectedDate] || [];

    if (appointments.length === 0) {
        calendarAgenda.innerHTML = `
            <div class="agenda-empty">
                <span class="agenda-empty-icon">✓</span>
                <strong>No scheduled viewings</strong>
                <p>There are no appointments scheduled for this date.</p>
            </div>
        `;

        return;
    }

    calendarAgenda.innerHTML = appointments.map(appointment => `
        <article class="agenda-event">
            <span class="agenda-event-time">
                ${escapeHTML(appointment.time)}
            </span>

            <strong>${escapeHTML(appointment.title)}</strong>

            <p>${escapeHTML(appointment.description)}</p>
        </article>
    `).join("");
}

if (previousMonthBtn) {
    previousMonthBtn.addEventListener("click", () => {
        changeCalendarMonth(-1);
    });
}

if (nextMonthBtn) {
    nextMonthBtn.addEventListener("click", () => {
        changeCalendarMonth(1);
    });
}

/* HTML ESCAPING */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

/* INQUIRY STATUS COLORS */

function getStatusClass(status) {
    const value = String(status || "").toLowerCase();

    if (value.includes("complete")) {
        return "dark-green";
    }

    if (value.includes("approved")) {
        return "green";
    }

    if (value.includes("resubmission")) {
        return "gray";
    }

    if (value.includes("requirement")) {
        return "purple";
    }

    if (value.includes("pending") || value.includes("review")) {
        return "orange";
    }

    return "gray";
}

/* INQUIRY STATUS DONUT & NOTIFICATIONS */

function updateInquiryDonut(inquiries) {
    if (!Array.isArray(inquiries)) return;

    let underReview = 0;
    let approved = 0;
    let completed = 0;
    let cancelled = 0;

    inquiries.forEach(i => {
        const s = (i.status || '').toLowerCase();
        if (s.includes('approv')) approved++;
        else if (s.includes('complete')) completed++;
        else if (s.includes('cancel') || s.includes('reject')) cancelled++;
        else underReview++;
    });

    const total = inquiries.length;
    const totalEl = document.getElementById('donutTotalInquiries');
    if (totalEl) totalEl.textContent = total;

    const lRev = document.getElementById('legendReviewCount');
    if (lRev) lRev.textContent = underReview;
    const lApp = document.getElementById('legendApprovedCount');
    if (lApp) lApp.textContent = approved;
    const lComp = document.getElementById('legendCompletedCount');
    if (lComp) lComp.textContent = completed;
    const lCanc = document.getElementById('legendCancelledCount');
    if (lCanc) lCanc.textContent = cancelled;

    const C = 377; // 2 * PI * 60
    const safeTotal = total > 0 ? total : 1;

    let offset = 0;
    const setSlice = (id, count) => {
        const el = document.getElementById(id);
        if (!el) return;
        const len = (count / safeTotal) * C;
        el.setAttribute('stroke-dasharray', `${len} ${C}`);
        el.setAttribute('stroke-dashoffset', `-${offset}`);
        offset += len;
    };

    setSlice('donutUnderReview', underReview);
    setSlice('donutApproved', approved);
    setSlice('donutCompleted', completed);
    setSlice('donutCancelled', cancelled);
}

/* INQUIRY TABLE */

function formatInquiryLabel(rawTitle) {
    if (typeof window.formatInquiryPropertyLabel === "function") {
        return window.formatInquiryPropertyLabel(rawTitle);
    }
    const clean = String(rawTitle || "").trim();
    if (!clean) return "General Inquiry";
    if (/^(general\s+(consultation|inquiry|question)|consultation\s*:)/i.test(clean)) {
        return clean;
    }
    if (/^(specific\s+)?property\s+inquiry$/i.test(clean)) {
        return "Specific Property Inquiry";
    }
    const prefixedMatch = clean.match(/^specific\s+property\s+inquiry\s*:\s*(.*)$/i);
    if (prefixedMatch) {
        const rest = prefixedMatch[1].trim();
        return rest ? `Specific Property Inquiry: ${rest}` : "Specific Property Inquiry";
    }
    return `Specific Property Inquiry: ${clean}`;
}

const DASHBOARD_INQUIRY_LIMIT = 4;
let allDashboardInquiries = [];

function getInquiryIsoDate(inquiry) {
    const raw = inquiry && inquiry.created_at ? inquiry.created_at : "";
    if (!raw) return "";
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        const yyyy = parsed.getFullYear();
        const mm = String(parsed.getMonth() + 1).padStart(2, "0");
        const dd = String(parsed.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }
    const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
}

function normalizeInquiryStatusFilterMatch(rawStatus, filterVal) {
    if (!filterVal) return true;
    const s = String(rawStatus || "Pending").toLowerCase().trim();
    if (filterVal === "submitted") {
        return s === "submitted" || s === "new";
    }
    if (filterVal === "requirements submitted") {
        return s.includes("requirement");
    }
    if (filterVal === "under review") {
        return s === "pending" || s.includes("review");
    }
    if (filterVal === "approved") {
        return s.includes("approved");
    }
    if (filterVal === "completed") {
        return s.includes("completed");
    }
    if (filterVal === "cancelled") {
        return s.includes("cancel") || s.includes("reject");
    }
    return s === filterVal;
}

function syncInquiryPropertyFilterOptions(inquiries) {
    const propSelect = document.getElementById("dashInqPropertyFilter");
    if (!propSelect || !Array.isArray(inquiries)) return;
    const prevValue = propSelect.value;

    const distinctProps = new Set();
    inquiries.forEach(inq => {
        const label = formatInquiryLabel(inq.property_title);
        const match = label.match(/^Specific Property Inquiry:\s*(.+)$/i);
        if (match && match[1]) {
            distinctProps.add(match[1].trim());
        }
    });

    const baseOptions = [
        `<option value="">All Properties &amp; Types</option>`,
        `<option value="specific property inquiry">Specific Property Inquiry</option>`,
        `<option value="general">General Consultation</option>`
    ];
    Array.from(distinctProps).sort((a, b) => a.localeCompare(b)).forEach(name => {
        const safeVal = escapeHTML(name.toLowerCase());
        const safeLabel = escapeHTML(name);
        baseOptions.push(`<option value="${safeVal}">${safeLabel}</option>`);
    });

    propSelect.innerHTML = baseOptions.join("");
    if (prevValue && Array.from(propSelect.options).some(o => o.value === prevValue)) {
        propSelect.value = prevValue;
    }
}

function renderInquiryRows(inquiries) {
    if (Array.isArray(inquiries)) {
        allDashboardInquiries = inquiries;
        syncInquiryPropertyFilterOptions(inquiries);
    }
    applyDashboardInquiryFilters();
}

function applyDashboardInquiryFilters() {
    const tbody = document.getElementById("recentInquiriesBody") || document.getElementById("recentInquiryRows");
    const mobileList = document.getElementById("recentInquiriesMobileList");
    const countBadge = document.getElementById("dashInqCountBadge");
    const footerEl = document.getElementById("dashInqFooter");
    const footerSummary = document.getElementById("dashInqFooterSummary");

    const searchInput = document.getElementById("dashInqSearch");
    const statusSelect = document.getElementById("dashInqStatusFilter");
    const propSelect = document.getElementById("dashInqPropertyFilter");
    const sortSelect = document.getElementById("dashInqSortFilter");
    const dateInput = document.getElementById("dashInqDateFilter");
    const resetBtn = document.getElementById("dashInqResetBtn");

    if (!tbody) return;

    const q = (searchInput ? searchInput.value : "").trim().toLowerCase();
    const statusVal = (statusSelect ? statusSelect.value : "").trim().toLowerCase();
    const propVal = (propSelect ? propSelect.value : "").trim().toLowerCase();
    const sortVal = (sortSelect ? sortSelect.value : "newest").trim();
    const dateVal = (dateInput ? dateInput.value : "").trim();

    const hasActiveFilter = Boolean(q || statusVal || propVal || dateVal || (sortVal && sortVal !== "newest"));
    if (resetBtn) {
        resetBtn.hidden = !hasActiveFilter;
    }

    const totalCount = Array.isArray(allDashboardInquiries) ? allDashboardInquiries.length : 0;

    if (totalCount === 0) {
        if (countBadge) countBadge.textContent = "0 inquiries";
        if (footerEl) footerEl.hidden = true;
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-table-message">
                    No inquiries available.
                </td>
            </tr>
        `;
        if (mobileList) {
            mobileList.innerHTML = `<div class="mobile-empty-state">No recent inquiries yet.</div>`;
        }

        updateInquiryEmptyState();

        return;
    }

    const filtered = allDashboardInquiries.filter(inquiry => {
        const inquiryId = String(inquiry.inquiry_id || `INQ-${inquiry.id ?? "N/A"}`).toLowerCase();
        const clientName = String(inquiry.client_name || "Client").toLowerCase();
        const propLabel = String(formatInquiryLabel(inquiry.property_title)).toLowerCase();
        const statusStr = String(inquiry.status || "Pending").toLowerCase();
        const isoDate = getInquiryIsoDate(inquiry);

        const matchesQuery = !q ||
            inquiryId.includes(q) ||
            clientName.includes(q) ||
            propLabel.includes(q) ||
            statusStr.includes(q);

        const matchesStatus = normalizeInquiryStatusFilterMatch(inquiry.status, statusVal);

        let matchesProp = true;
        if (propVal === "general") {
            matchesProp = propLabel.includes("general") || propLabel.includes("consultation");
        } else if (propVal === "specific property inquiry") {
            matchesProp = propLabel.includes("specific property inquiry");
        } else if (propVal) {
            matchesProp = propLabel.includes(propVal);
        }

        const matchesDate = !dateVal || isoDate === dateVal;

        return matchesQuery && matchesStatus && matchesProp && matchesDate;
    });

    filtered.sort((a, b) => {
        if (sortVal === "oldest") {
            return (new Date(a.created_at || 0).getTime() || 0) - (new Date(b.created_at || 0).getTime() || 0);
        }
        if (sortVal === "id-desc") {
            return (Number(b.id) || 0) - (Number(a.id) || 0);
        }
        if (sortVal === "client-asc") {
            return String(a.client_name || "").localeCompare(String(b.client_name || ""));
        }
        if (sortVal === "property-asc") {
            return formatInquiryLabel(a.property_title).localeCompare(formatInquiryLabel(b.property_title));
        }
        if (sortVal === "status-asc") {
            return String(a.status || "").localeCompare(String(b.status || ""));
        }
        // default: newest
        return (new Date(b.created_at || 0).getTime() || 0) - (new Date(a.created_at || 0).getTime() || 0);
    });

    const limitedInquiries = filtered.slice(0, DASHBOARD_INQUIRY_LIMIT);
    if (countBadge) {
        countBadge.textContent = hasActiveFilter
            ? `Showing ${limitedInquiries.length} of ${filtered.length} matching (${totalCount} total)`
            : `Showing ${limitedInquiries.length} of ${totalCount}`;
    }

    if (footerEl) {
        if (filtered.length > DASHBOARD_INQUIRY_LIMIT) {
            footerEl.hidden = false;
            if (footerSummary) {
                footerSummary.textContent = `Showing ${limitedInquiries.length} of ${filtered.length} inquiries`;
            }
        } else {
            footerEl.hidden = true;
        }
    }

    if (limitedInquiries.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-table-message">
                    No inquiries match the selected search or sorting filters.
                </td>
            </tr>
        `;
        if (mobileList) {
            mobileList.innerHTML = `<div class="mobile-empty-state">No inquiries match the selected filters.</div>`;
        }
        updateInquiryEmptyState();
        return;
    }

    const mobileCardsHtml = [];

    tbody.innerHTML = limitedInquiries.map(inquiry => {
        const inquiryId = escapeHTML(
            inquiry.inquiry_id || `INQ-${inquiry.id ?? "N/A"}`
        );

        const clientName = escapeHTML(
            inquiry.client_name || "Client"
        );

        const propertyTitle = escapeHTML(
            formatInquiryLabel(inquiry.property_title)
        );

        const createdAt = inquiry.created_at
            ? new Date(inquiry.created_at).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit"
            })
            : "Date unavailable";

        const status = escapeHTML(inquiry.status || "Pending");
        const safeRawId = escapeHTML(inquiry.id);
        const safeCancelledBy = escapeHTML(String(inquiry.cancelled_by || "").toLowerCase().trim());

        const statusClass = getStatusClass(inquiry.status);

        const parsedSchedule = parseInquirySchedule(
            inquiry.message || inquiry.notes,
            inquiry.schedule_date || inquiry.preferred_date
        );

        const message = escapeHTML(
            parsedSchedule.cleanMessage || "No inquiry message provided."
        );

        const phone = escapeHTML(
            inquiry.client_phone || inquiry.phone || inquiry.contact_number || "N/A"
        );

        const email = escapeHTML(
            inquiry.client_email || inquiry.email || "N/A"
        );

        const scheduleDate = escapeHTML(
            parsedSchedule.display || ""
        );

        mobileCardsHtml.push(`
            <article class="mobile-data-card mobile-dash-inquiry-card">
                <div class="mobile-card-top">
                    <div class="mobile-card-title-block">
                        <strong>${clientName}</strong>
                        <small>${inquiryId} &middot; ${escapeHTML(createdAt)}</small>
                    </div>
                    <span class="status-pill ${statusClass}">${status}</span>
                </div>
                <p class="mobile-dash-prop">${propertyTitle}</p>
                <div class="mobile-card-actions-bar">
                    <button
                        class="action-view-btn"
                        type="button"
                        data-raw-id="${safeRawId}"
                        data-inquiry-id="${inquiryId}"
                        data-client-name="${clientName}"
                        data-property-title="${propertyTitle}"
                        data-created-at="${escapeHTML(createdAt)}"
                        data-status="${status}"
                        data-status-class="${statusClass}"
                        data-cancelled-by="${safeCancelledBy}"
                        data-inquiry-phone="${phone}"
                        data-inquiry-email="${email}"
                        data-inquiry-message="${message}"
                        data-schedule-date="${scheduleDate}"
                        aria-label="View inquiry from ${clientName}"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        <span>View</span>
                    </button>
                </div>
            </article>
        `);

        return `
            <tr>
                <td class="id-col">${inquiryId}</td>

                <td>${clientName}</td>

                <td>${propertyTitle}</td>

                <td>${escapeHTML(createdAt)}</td>

                <td>
                    <span class="status-pill ${statusClass}">
                        ${status}
                    </span>
                </td>

                <td>
                    <button
                        class="action-view-btn"
                        type="button"
                        data-raw-id="${safeRawId}"
                        data-inquiry-id="${inquiryId}"
                        data-client-name="${clientName}"
                        data-property-title="${propertyTitle}"
                        data-created-at="${escapeHTML(createdAt)}"
                        data-status="${status}"
                        data-status-class="${statusClass}"
                        data-cancelled-by="${safeCancelledBy}"
                        data-inquiry-phone="${phone}"
                        data-inquiry-email="${email}"
                        data-inquiry-message="${message}"
                        data-schedule-date="${scheduleDate}"
                        aria-label="View inquiry from ${clientName}"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        <span>View</span>
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    if (mobileList) {
        mobileList.innerHTML = mobileCardsHtml.join("");
    }

    updateInquiryEmptyState();
}

async function updateDashboardInquiryStatus(rawId, nextStatus) {
    if (!rawId || !nextStatus) return false;
    try {
        const existingRead = JSON.parse(localStorage.getItem("admin_notifs_read_ids") || "[]");
        const readSet = new Set(Array.isArray(existingRead) ? existingRead.map(String) : []);
        readSet.add(String(rawId));
        readSet.add(`new_inquiry_${rawId}`);
        readSet.add(`${String(nextStatus).toLowerCase()}_${rawId}`);
        localStorage.setItem("admin_notifs_read_ids", JSON.stringify(Array.from(readSet)));
    } catch (_) {}

    if (typeof apiUpdateInquiryStatus === "function") {
        await apiUpdateInquiryStatus(rawId, nextStatus);
    }

    if (typeof window.showFeedbackToast === "function") {
        const msg = nextStatus === "Approved"
            ? "Inquiry approved successfully."
            : nextStatus === "Cancelled"
                ? "Inquiry cancelled."
                : `Inquiry updated to ${nextStatus}.`;
        window.showFeedbackToast(msg, nextStatus === "Cancelled" ? "warn" : "success");
    }

    if (typeof loadDashboardData === "function") {
        await loadDashboardData({ forceInquiries: true });
    }
    return true;
}

/* INQUIRY DETAILS MODAL UI */

function openInquiryModal(data) {
    const modal = document.getElementById("inquiryModal");
    const modalContent = document.getElementById("modalContent");
    if (!modal || !modalContent) return;

    const clientName = data.clientName || "Client";
    const inquiryId = data.inquiryId || "INQ-N/A";
    const propertyTitle = formatInquiryLabel(data.propertyTitle);
    const createdAt = data.createdAt || "Recent";
    const status = data.status || "Pending";
    const statusClass = data.statusClass || "gray";
    const phone = (data.inquiryPhone && data.inquiryPhone !== "N/A") ? data.inquiryPhone : "";
    const email = (data.inquiryEmail && data.inquiryEmail !== "N/A") ? data.inquiryEmail : "";
    const parsedSchedule = parseInquirySchedule(data.inquiryMessage, data.scheduleDate);
    const message = parsedSchedule.cleanMessage || "No inquiry message provided.";
    const scheduleDate = parsedSchedule.display;

    const initials = clientName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0].toUpperCase())
        .join("") || "CL";
    const rawId = data.rawId || data.inquiryId?.replace('INQ-', '') || '';
    const normStatus = String(status || '').toLowerCase().trim();
    const isApproved = normStatus === 'approved';
    const isCancelled = normStatus === 'cancelled' || normStatus === 'rejected';
    const isCompleted = normStatus === 'completed';
    const cancelledBy = String(data.cancelledBy || '').toLowerCase().trim();
    const cancelledDecisionLabel = cancelledBy === 'admin'
        ? 'Cancelled by Admin'
        : cancelledBy === 'client'
            ? 'Cancelled by Client'
            : 'Cancelled';
    const displayStatusLabel = isCancelled ? cancelledDecisionLabel : status;

    modalContent.innerHTML = `
        <div class="inquiry-modal-detail">
            <!-- Client Banner -->
            <div class="inquiry-client-banner">
                <div class="inquiry-client-info">
                    <div class="inquiry-avatar-pill" aria-hidden="true">${escapeHTML(initials)}</div>
                    <div>
                        <h4 class="inquiry-client-name">${escapeHTML(clientName)}</h4>
                        <span class="inquiry-submitted-date">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            Submitted: ${escapeHTML(createdAt)}
                        </span>
                    </div>
                </div>
                <div class="inquiry-banner-meta">
                    <span class="status-pill ${escapeHTML(statusClass)}">${escapeHTML(displayStatusLabel)}</span>
                    <span class="inquiry-id-tag">${escapeHTML(inquiryId)}</span>
                </div>
            </div>

            <!-- Details Grid -->
            <div class="inquiry-info-grid">
                <div class="info-grid-card">
                    <span class="info-label">Email Address</span>
                    ${email ? `
                        <a href="mailto:${escapeHTML(email)}" class="info-value info-link">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                <polyline points="22,6 12,13 2,6"></polyline>
                            </svg>
                            <span>${escapeHTML(email)}</span>
                        </a>
                    ` : `<span class="info-value muted">Not provided</span>`}
                </div>

                <div class="info-grid-card">
                    <span class="info-label">Phone Number</span>
                    ${phone ? `
                        <a href="tel:${escapeHTML(phone)}" class="info-value info-link">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                            <span>${escapeHTML(phone)}</span>
                        </a>
                    ` : `<span class="info-value muted">Not provided</span>`}
                </div>

                <div class="info-grid-card">
                    <span class="info-label">Property Interested</span>
                    <div class="info-value">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                        <span>${escapeHTML(propertyTitle)}</span>
                    </div>
                </div>

                <div class="info-grid-card">
                    <span class="info-label">Preferred Schedule</span>
                    <div class="info-value">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        <span>${escapeHTML(scheduleDate || "No schedule requested")}</span>
                    </div>
                </div>
            </div>

            <!-- Message Box -->
            <div class="inquiry-message-section">
                <span class="info-label">Message / Client Request</span>
                <div class="inquiry-message-box">${escapeHTML(message)}</div>
            </div>

            <!-- Footer Actions -->
            <div class="modal-actions-footer">
                <button type="button" class="btn-modal-secondary btn-close-modal" id="modalCloseActionBtn">
                    Close
                </button>
                ${!isCompleted ? `
                    <div class="modal-status-dropdown" id="modalStatusDropdown">
                        <div class="modal-status-split ${isApproved ? 'is-approved' : isCancelled ? 'is-cancelled' : 'is-approve-ready'}" id="modalStatusSplit">
                            <button type="button"
                                    class="modal-status-main-btn"
                                    id="modalQuickApproveBtn"
                                    data-current-state="${isApproved ? 'approved' : isCancelled ? 'cancelled' : 'pending'}">
                                <span class="modal-status-main-icon" aria-hidden="true">
                                    ${isCancelled ? `
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <line x1="15" y1="9" x2="9" y2="15"></line>
                                            <line x1="9" y1="9" x2="15" y2="15"></line>
                                        </svg>
                                    ` : `
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                    `}
                                </span>
                                <span class="modal-status-trigger-label">${isApproved ? 'Approved' : isCancelled ? escapeHTML(cancelledDecisionLabel) : 'Approve'}</span>
                            </button>
                            <button type="button"
                                    class="modal-status-chevron-btn"
                                    id="modalStatusTriggerBtn"
                                    aria-label="More decision options"
                                    aria-haspopup="menu"
                                    aria-expanded="false">
                                <svg class="modal-status-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </button>
                        </div>
                        <div class="modal-status-menu" id="modalStatusMenu" role="menu" aria-label="Inquiry decision actions" hidden>
                            <button type="button"
                                    class="modal-status-option approve${isApproved ? ' is-selected' : ''}"
                                    role="menuitemradio"
                                    aria-checked="${isApproved ? 'true' : 'false'}"
                                    data-next-status="Approved">
                                <span class="modal-option-left">
                                    <span class="modal-option-dot green" aria-hidden="true"></span>
                                    <span>${isApproved ? 'Approved' : 'Approve Inquiry'}</span>
                                </span>
                                <svg class="modal-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            </button>
                            <button type="button"
                                    class="modal-status-option cancel${isCancelled ? ' is-selected' : ''}"
                                    role="menuitemradio"
                                    aria-checked="${isCancelled ? 'true' : 'false'}"
                                    data-next-status="Cancelled">
                                <span class="modal-option-left">
                                    <span class="modal-option-dot red" aria-hidden="true"></span>
                                    <span>${isCancelled ? 'Cancelled' : 'Cancel Inquiry'}</span>
                                </span>
                                <svg class="modal-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                ` : ''}
                ${email ? `
                    <a href="mailto:${encodeURIComponent(email)}?subject=Re:%20Inquiry%20regarding%20${encodeURIComponent(propertyTitle)}" class="btn-modal-primary" target="_blank" rel="noopener">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                        <span>Reply via Email</span>
                    </a>
                ` : `
                    <a href="clients.html" class="btn-modal-primary">
                        <span>Open in Client Inquiries &rarr;</span>
                    </a>
                `}
            </div>
        </div>
    `;

    // Hook up Split Approve / Cancel dropdown inside modal
    const statusDropdown = modalContent.querySelector("#modalStatusDropdown");
    const statusSplit = modalContent.querySelector("#modalStatusSplit");
    const quickApproveBtn = modalContent.querySelector("#modalQuickApproveBtn");
    const statusTriggerBtn = modalContent.querySelector("#modalStatusTriggerBtn");
    const statusMenu = modalContent.querySelector("#modalStatusMenu");

    function closeModalStatusMenu() {
        if (!statusDropdown || !statusTriggerBtn || !statusMenu) return;
        statusMenu.hidden = true;
        statusDropdown.classList.remove("is-open");
        statusTriggerBtn.setAttribute("aria-expanded", "false");
    }

    function toggleModalStatusMenu() {
        if (!statusDropdown || !statusTriggerBtn || !statusMenu) return;
        const willOpen = statusMenu.hidden;
        statusMenu.hidden = !willOpen;
        statusDropdown.classList.toggle("is-open", willOpen);
        statusTriggerBtn.setAttribute("aria-expanded", String(willOpen));
    }

    async function applyModalDecision(targetStatus) {
        if (!targetStatus || !quickApproveBtn || !statusTriggerBtn || !statusSplit) return;
        closeModalStatusMenu();

        const labelEl = quickApproveBtn.querySelector(".modal-status-trigger-label");
        const iconEl = quickApproveBtn.querySelector(".modal-status-main-icon");
        const prevLabel = labelEl ? labelEl.textContent : "";

        quickApproveBtn.disabled = true;
        statusTriggerBtn.disabled = true;
        if (labelEl) labelEl.textContent = targetStatus === "Approved" ? "Approving..." : "Cancelling...";

        try {
            await updateDashboardInquiryStatus(rawId, targetStatus);

            const nowApproved = targetStatus === "Approved";
            const nowCancelled = targetStatus === "Cancelled";
            const updatedLabel = nowCancelled ? "Cancelled by Admin" : targetStatus;

            const statusPill = modalContent.querySelector(".inquiry-banner-meta .status-pill");
            if (statusPill) {
                statusPill.textContent = updatedLabel;
                statusPill.className = `status-pill ${getStatusClass(targetStatus)}`;
            }

            statusSplit.className = `modal-status-split ${nowApproved ? "is-approved" : nowCancelled ? "is-cancelled" : "is-approve-ready"}`;
            quickApproveBtn.setAttribute("data-current-state", nowApproved ? "approved" : nowCancelled ? "cancelled" : "pending");
            if (labelEl) labelEl.textContent = updatedLabel;
            if (iconEl) {
                iconEl.innerHTML = nowCancelled
                    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
                    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            }

            statusMenu.querySelectorAll(".modal-status-option").forEach((btn) => {
                const btnStatus = btn.getAttribute("data-next-status");
                const isMatch = btnStatus === targetStatus;
                btn.classList.toggle("is-selected", isMatch);
                btn.setAttribute("aria-checked", String(isMatch));
                const optText = btn.querySelector(".modal-option-left span:last-child");
                if (optText) {
                    if (btnStatus === "Approved") optText.textContent = nowApproved ? "Approved" : "Approve Inquiry";
                    if (btnStatus === "Cancelled") optText.textContent = nowCancelled ? "Cancelled" : "Cancel Inquiry";
                }
            });
        } catch (err) {
            console.error(`Failed to set inquiry status (${targetStatus}) from dashboard modal:`, err);
            if (labelEl) labelEl.textContent = prevLabel || "Retry";
        } finally {
            quickApproveBtn.disabled = false;
            statusTriggerBtn.disabled = false;
        }
    }

    if (quickApproveBtn && statusTriggerBtn && statusMenu && statusDropdown) {
        quickApproveBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const currentState = quickApproveBtn.getAttribute("data-current-state");
            if (currentState === "pending") {
                applyModalDecision("Approved");
            } else {
                toggleModalStatusMenu();
            }
        });

        statusTriggerBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleModalStatusMenu();
        });

        statusMenu.addEventListener("click", (e) => {
            e.stopPropagation();
            const optBtn = e.target.closest(".modal-status-option[data-next-status]");
            if (!optBtn) return;
            const targetStatus = optBtn.getAttribute("data-next-status");
            const currentState = quickApproveBtn.getAttribute("data-current-state");
            if ((targetStatus === "Approved" && currentState === "approved") ||
                (targetStatus === "Cancelled" && currentState === "cancelled")) {
                closeModalStatusMenu();
                return;
            }
            applyModalDecision(targetStatus);
        });

        modalContent.addEventListener("click", (e) => {
            if (!e.target.closest("#modalStatusDropdown")) {
                closeModalStatusMenu();
            }
        });
    }

    modal.hidden = false;
    // Force layout recalculation for smooth CSS animation
    void modal.offsetWidth;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeInquiryModal() {
    const modal = document.getElementById("inquiryModal");
    if (!modal) return;
    modal.classList.remove("open");
    setTimeout(() => {
        if (!modal.classList.contains("open")) {
            modal.hidden = true;
        }
    }, 220);
    document.body.style.overflow = "";
}

document.addEventListener("click", async event => {
    const quickActionBtn = event.target.closest("button[data-dash-inq-action]");
    if (quickActionBtn) {
        event.preventDefault();
        if (quickActionBtn.disabled) return;
        const action = quickActionBtn.getAttribute("data-dash-inq-action");
        const rawId = quickActionBtn.getAttribute("data-raw-id");
        const nextStatus = action === "approve" ? "Approved" : action === "cancel" ? "Cancelled" : "";
        if (!rawId || !nextStatus) return;

        const prevHtml = quickActionBtn.innerHTML;
        quickActionBtn.disabled = true;
        quickActionBtn.innerHTML = `<span>${nextStatus === "Approved" ? "Approving..." : "Cancelling..."}</span>`;
        try {
            await updateDashboardInquiryStatus(rawId, nextStatus);
        } catch (err) {
            console.error(`Failed to ${action} inquiry from dashboard row:`, err);
            quickActionBtn.disabled = false;
            quickActionBtn.innerHTML = prevHtml;
        }
        return;
    }

    const viewButton = event.target.closest(".action-view-btn");
    if (viewButton) {
        event.preventDefault();
        openInquiryModal(viewButton.dataset);
        return;
    }

    const closeBtn = event.target.closest("#closeModalBtn, #modalCloseActionBtn, .btn-close-modal");
    if (closeBtn) {
        event.preventDefault();
        closeInquiryModal();
        return;
    }

    const modal = document.getElementById("inquiryModal");
    if (modal && event.target === modal) {
        closeInquiryModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        const modal = document.getElementById("inquiryModal");
        if (modal && modal.classList.contains("open")) {
            closeInquiryModal();
        }
    }
});

/* SEARCH */

const dashboardSearch = document.getElementById("dashboardSearch");

function updateInquiryEmptyState() {
    const tbody = document.getElementById("recentInquiriesBody");
    const emptyState = document.getElementById("inquiriesEmptyState");

    if (!tbody || !emptyState) return;

    const rows = [...tbody.querySelectorAll("tr")];

    const hasVisibleRows = rows.some(row => {
        return row.style.display !== "none" &&
            !row.querySelector(".empty-table-message");
    });

    emptyState.hidden = hasVisibleRows;
}

if (dashboardSearch) {
    dashboardSearch.addEventListener("input", () => {
        const query = dashboardSearch.value.trim().toLowerCase();

        const rows = document.querySelectorAll(
            "#recentInquiriesBody tr"
        );

        rows.forEach(row => {
            const matches = row.textContent.toLowerCase().includes(query);

            row.style.display = matches ? "" : "none";
        });

        updateInquiryEmptyState();
    });
}

/* SUPABASE DASHBOARD DATA */

function hydrateDashboardKPIs() {
    try {
        const cached = JSON.parse(localStorage.getItem("urbanscope_dashboard_kpis") || "null");
        if (cached) {
            if (cached.totalProperties != null) {
                const el = document.getElementById("kpiTotalProperties");
                if (el) el.textContent = cached.totalProperties;
                const ov = document.getElementById("overviewPropertyCount");
                if (ov) ov.textContent = cached.totalProperties;
            }
            if (cached.totalClients != null) {
                const el = document.getElementById("kpiTotalClients");
                if (el) el.textContent = cached.totalClients;
            }
            if (cached.totalInquiries != null) {
                const el = document.getElementById("kpiTotalInquiries");
                if (el) el.textContent = cached.totalInquiries;
            }
            if (cached.pendingInquiries != null) {
                const el = document.getElementById("kpiPendingInquiries");
                if (el) el.textContent = cached.pendingInquiries;
            }
            if (cached.completedInquiries != null) {
                const el = document.getElementById("kpiCompletedInquiries");
                if (el) el.textContent = cached.completedInquiries;
            }
        }
    } catch (_) {}
}

let dashboardLoadPromise = null;
let cachedDashboardProperties = null;
let lastDashboardPropertiesAt = 0;
let cachedDashboardUsers = null;
let lastDashboardUsersAt = 0;
let cachedDashboardKpis = null;
let lastDashboardKpisAt = 0;

async function loadDashboardData(options = {}) {
    if (dashboardLoadPromise) return dashboardLoadPromise;
    const run = _loadDashboardDataInner(options).finally(() => {
        if (dashboardLoadPromise === run) dashboardLoadPromise = null;
    });
    dashboardLoadPromise = run;
    return run;
}

async function _loadDashboardDataInner(options = {}) {
    const opts = (typeof options === "boolean") ? { isPoll: options } : (options || {});
    const isPoll = Boolean(opts.isPoll);
    const forceProperties = Boolean(opts.forceProperties);
    const forceInquiries = Boolean(opts.forceInquiries || isPoll);
    const forceUsers = Boolean(opts.forceUsers);
    try {
        hydrateDashboardKPIs();

        const now = Date.now();
        const shouldFetchProps = forceProperties || !cachedDashboardProperties || (now - lastDashboardPropertiesAt) > 120000;
        const shouldFetchKpis = (forceUsers || !cachedDashboardKpis || (now - lastDashboardKpisAt) > 60000) && typeof apiGetDashboardKPIs === "function";

        const [inquiriesRes, propertiesRes, kpisRes] = await Promise.allSettled([
            (typeof apiGetInquiries === "function") ? apiGetInquiries(forceInquiries) : Promise.resolve(null),
            shouldFetchProps
                ? ((typeof apiGetProperties === "function") ? apiGetProperties() : Promise.resolve(null))
                : Promise.resolve(cachedDashboardProperties),
            shouldFetchKpis ? apiGetDashboardKPIs() : Promise.resolve(cachedDashboardKpis)
        ]);

        let inquiries = [];
        if (inquiriesRes.status === "fulfilled" && Array.isArray(inquiriesRes.value)) {
            inquiries = inquiriesRes.value;
        } else {
            inquiries = JSON.parse(localStorage.getItem("inquiries") || "[]");
        }
        setCalendarInquiryRequests(inquiries);

        let properties = [];
        if (propertiesRes.status === "fulfilled" && Array.isArray(propertiesRes.value)) {
            properties = propertiesRes.value;
            if (shouldFetchProps) {
                cachedDashboardProperties = propertiesRes.value;
                lastDashboardPropertiesAt = Date.now();
            }
        } else {
            properties = JSON.parse(localStorage.getItem("properties") || localStorage.getItem("cached_live_properties") || "[]");
        }

        if (typeof window.filterAndSyncAccreditedProperties === "function") {
            properties = await window.filterAndSyncAccreditedProperties(
                properties,
                typeof apiGetProperties === "function" ? () => apiGetProperties({}, true) : null
            );
            cachedDashboardProperties = properties;
            lastDashboardPropertiesAt = Date.now();
        } else {
            properties = properties.filter(p => {
                if (!p) return false;
                if (typeof window.isDeprecatedDemoProperty === "function") return !window.isDeprecatedDemoProperty(p);
                const t = (p.title || p.name || p.propertyName || '').toLowerCase().trim();
                return Boolean(t);
            });
        }

        let kpis = null;
        if (kpisRes.status === "fulfilled" && kpisRes.value) {
            kpis = kpisRes.value;
            if (kpis.total_clients != null) {
                cachedDashboardKpis = kpis;
                lastDashboardKpisAt = Date.now();
            }
        } else if (cachedDashboardKpis) {
            kpis = cachedDashboardKpis;
        }

        let users = cachedDashboardUsers || [];
        const hasClientsKpi = Boolean(kpis && kpis.total_clients != null);
        const shouldFetchUsers = !hasClientsKpi && (forceUsers || !cachedDashboardUsers || (Date.now() - lastDashboardUsersAt) > 120000);
        if (shouldFetchUsers && typeof apiGetUsers === "function") {
            try {
                const fetchedUsers = await apiGetUsers();
                if (Array.isArray(fetchedUsers)) {
                    users = fetchedUsers;
                    cachedDashboardUsers = fetchedUsers;
                    lastDashboardUsersAt = Date.now();
                }
            } catch (_) {}
        }

        // Metrics computation
        const totalInquiriesCount = inquiries.length;
        const pendingCount = inquiries.filter(inquiry => {
            const status = String(inquiry.status || "").toLowerCase();
            return status.includes("pending") || status.includes("review");
        }).length;

        const completedCount = inquiries.filter(inquiry => {
            return String(inquiry.status || "").toLowerCase().includes("completed");
        }).length;

        const totalPropertiesCount = properties.length;

        let totalClientsCount = 0;
        if (kpis && kpis.total_clients != null) {
            totalClientsCount = Math.max(0, Number(kpis.total_clients) || 0);
        } else if (users && users.length > 0) {
            totalClientsCount = users.filter(u => {
                const r = String(u.role || "client").toLowerCase();
                return r === "client" || r === "user";
            }).length;
        }

        // Update DOM elements
        const totalInquiriesEl = document.getElementById("kpiTotalInquiries");
        const pendingEl = document.getElementById("kpiPendingInquiries");
        const completedEl = document.getElementById("kpiCompletedInquiries");
        const propertyCountEl = document.getElementById("kpiTotalProperties");
        const overviewCountEl = document.getElementById("overviewPropertyCount");
        const totalClientsEl = document.getElementById("kpiTotalClients");

        if (totalInquiriesEl) totalInquiriesEl.textContent = totalInquiriesCount;
        if (pendingEl) pendingEl.textContent = pendingCount;
        if (completedEl) completedEl.textContent = completedCount;
        if (propertyCountEl) propertyCountEl.textContent = totalPropertiesCount;
        if (overviewCountEl) overviewCountEl.textContent = totalPropertiesCount;
        if (totalClientsEl) totalClientsEl.textContent = totalClientsCount;

        // Persist fresh numbers to cache to guarantee 0-flick on all subsequent visits
        try {
            localStorage.setItem("urbanscope_dashboard_kpis", JSON.stringify({
                totalProperties: totalPropertiesCount,
                totalClients: totalClientsCount,
                totalInquiries: totalInquiriesCount,
                pendingInquiries: pendingCount,
                completedInquiries: completedCount
            }));
        } catch (_) {}

        renderInquiryRows(inquiries);
        updateInquiryDonut(inquiries);
        renderDashboardProperties(properties);

        if (typeof window.loadAdminNotifications === "function") {
            window.loadAdminNotifications(inquiries);
        }

    } catch (error) {
        console.error("Unable to load dashboard data:", error);
    }
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

const DASHBOARD_PROPERTY_LIMIT = 4;
let allDashboardProperties = [];

function matchesDashboardAmountFilter(priceVal, filterKey) {
    if (!filterKey) return true;
    const num = Number(priceVal) || 0;
    if (filterKey === 'under-3m') return num > 0 && num < 3000000;
    if (filterKey === '3m-6m') return num >= 3000000 && num <= 6000000;
    if (filterKey === '6m-9m') return num > 6000000 && num <= 9000000;
    if (filterKey === 'above-9m') return num > 9000000;
    return true;
}

function renderDashboardProperties(list) {
    if (Array.isArray(list)) {
        allDashboardProperties = list;
    }
    applyDashboardPropertyFilters();
}

function applyDashboardPropertyFilters() {
    if (window.UrbanPropertyActionMenu && typeof window.UrbanPropertyActionMenu.close === 'function') {
        window.UrbanPropertyActionMenu.close(false);
    }
    const tbody = document.getElementById("dashboardPropertyTableBody");
    if (!tbody) return;

    const searchInput = document.getElementById("dashPropSearch");
    const statusSelect = document.getElementById("dashPropStatusFilter");
    const typeSelect = document.getElementById("dashPropTypeFilter");
    const amountSelect = document.getElementById("dashPropAmountFilter");
    const resetBtn = document.getElementById("dashPropResetBtn");
    const countBadge = document.getElementById("dashPropCountBadge");
    const footerEl = document.getElementById("dashPropFooter");
    const footerSummary = document.getElementById("dashPropFooterSummary");

    const q = (searchInput ? searchInput.value : "").trim().toLowerCase();
    const statusFilter = (statusSelect ? statusSelect.value : "").trim().toLowerCase();
    const typeFilter = (typeSelect ? typeSelect.value : "").trim().toLowerCase();
    const amountFilter = (amountSelect ? amountSelect.value : "").trim();

    const hasActiveFilter = Boolean(q || statusFilter || typeFilter || amountFilter);
    if (resetBtn) {
        resetBtn.hidden = !hasActiveFilter;
    }

    const totalCount = Array.isArray(allDashboardProperties) ? allDashboardProperties.length : 0;

    if (totalCount === 0) {
        if (countBadge) countBadge.textContent = "0 listings";
        if (footerEl) footerEl.hidden = true;
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 28px; color:var(--text-muted);">No property records found. Click "+ Add Property" to create one.</td></tr>`;
        return;
    }

    const filtered = allDashboardProperties.filter(p => {
        const title = String(p.title || p.propertyName || "Listing");
        const type = String(p.property_type || "—");
        const loc = String(p.location || "—");
        const idStr = String(p.id ?? "");
        const rawStatus = String(p.status || "Available").trim();
        const isSold = rawStatus.toLowerCase() === 'sold' || rawStatus.toLowerCase() === 'sold out';
        const displayStatus = isSold ? 'Sold' : (rawStatus || 'Available');

        const matchesQuery = !q ||
            title.toLowerCase().includes(q) ||
            loc.toLowerCase().includes(q) ||
            type.toLowerCase().includes(q) ||
            idStr.toLowerCase().includes(q);

        const matchesStatus = !statusFilter ||
            displayStatus.toLowerCase() === statusFilter ||
            (statusFilter === 'sold' && isSold);

        const matchesType = !typeFilter ||
            type.toLowerCase().includes(typeFilter);

        const matchesAmount = matchesDashboardAmountFilter(p.price, amountFilter);

        return matchesQuery && matchesStatus && matchesType && matchesAmount;
    });

    const displayed = filtered.slice(0, DASHBOARD_PROPERTY_LIMIT);

    if (countBadge) {
        countBadge.textContent = hasActiveFilter
            ? `Showing ${displayed.length} of ${filtered.length} matching (${totalCount} total)`
            : `Showing ${displayed.length} of ${totalCount}`;
    }

    if (footerEl) {
        if (filtered.length > DASHBOARD_PROPERTY_LIMIT) {
            footerEl.hidden = false;
            if (footerSummary) {
                footerSummary.textContent = `Showing ${displayed.length} of ${filtered.length} property listings`;
            }
        } else {
            footerEl.hidden = true;
        }
    }

    if (displayed.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 28px; color:var(--text-muted);">No properties match the selected filters.</td></tr>`;
        return;
    }

    tbody.innerHTML = displayed.map(p => {
        const title = p.title || p.propertyName || "Listing";
        const type = p.property_type || "—";
        const loc = p.location || "—";
        const price = p.price ? "₱" + Number(p.price).toLocaleString() : "—";
        const rawStatus = (p.status || "Available").trim();
        const isSold = rawStatus.toLowerCase() === 'sold' || rawStatus.toLowerCase() === 'sold out';
        const displayStatus = isSold ? 'Sold' : (rawStatus || 'Available');

        const safeTitle = escapeHTML(title);
        const safeLoc = escapeHTML(loc);
        const safeType = escapeHTML(type);
        const safePrice = escapeHTML(price);
        const safeStatus = escapeHTML(displayStatus);
        const safeId = escapeHTML(String(p.id ?? ''));
        const safeEncodedId = escapeHTML(encodeURIComponent(String(p.id ?? '')));
        const imgSrc = sanitizeAdminPropImg(p.image_url, '../../assets/images/property1.jpg');

        const actionsCellHtml = (window.UrbanPropertyActionMenu && typeof window.UrbanPropertyActionMenu.renderTrigger === 'function')
            ? window.UrbanPropertyActionMenu.renderTrigger({
                id: p.id,
                status: displayStatus,
                title
            })
            : `<div class="dash-prop-actions"><a href="edit-property.html?id=${safeEncodedId}" class="prop-action-btn prop-action-edit">Edit</a></div>`;

        return `
        <tr class="${isSold ? 'row-sold' : ''}">
            <td>
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${escapeHTML(imgSrc)}" alt="${safeTitle}" style="width:40px; height:40px; border-radius:6px; object-fit:cover; ${isSold ? 'filter:grayscale(1); opacity:0.8;' : ''}" onerror="this.src='../../assets/images/property1.jpg'">
                    <div>
                        <strong style="color:${isSold ? 'var(--text-muted)' : 'var(--text-dark)'}; font-size:0.88rem;">${safeTitle}</strong><br>
                        <small style="color:var(--text-muted); font-size:0.75rem;">ID #${safeId}</small>
                    </div>
                </div>
            </td>
            <td style="color:var(--text-secondary); font-size:0.85rem;">${safeLoc}</td>
            <td><span style="padding:3px 8px; border-radius:4px; background:var(--light-green); color:var(--dark-green); font-size:0.76rem; font-weight:600;">${safeType}</span></td>
            <td style="font-weight:700; color:var(--text-dark); font-size:0.88rem;">${safePrice}</td>
            <td>
                <span class="status-badge-table ${isSold ? 'status-badge-sold' : 'status-badge-available'}">
                    <span class="status-badge-dot"></span>
                    ${safeStatus}
                </span>
            </td>
            <td>${actionsCellHtml}</td>
        </tr>
        `;
    }).join('');

    if (!tbody.dataset.dashPropBound) {
        tbody.dataset.dashPropBound = '1';
        tbody.addEventListener('click', (event) => {
            const trigger = event.target.closest('button.prop-actions-trigger[data-prop-action-toggle]');
            if (trigger && window.UrbanPropertyActionMenu && typeof window.UrbanPropertyActionMenu.toggle === 'function') {
                window.UrbanPropertyActionMenu.toggle(event, {
                    trigger,
                    id: trigger.getAttribute('data-prop-id'),
                    status: trigger.getAttribute('data-prop-status') || '',
                    title: trigger.getAttribute('data-prop-title') || '',
                    onToggleStatus: (ctx) => {
                        if (typeof window.togglePropertyStatus === 'function') {
                            window.togglePropertyStatus(ctx.id, ctx.status);
                        }
                    },
                    onDelete: (ctx) => {
                        if (typeof window.deletePropertyListing === 'function') {
                            window.deletePropertyListing(ctx.id, ctx.title);
                        }
                    }
                });
                return;
            }
            const btn = event.target.closest('button[data-dash-prop-action]');
            if (!btn) return;
            const action = btn.getAttribute('data-dash-prop-action');
            const id = btn.getAttribute('data-prop-id');
            if (action === 'toggle' && typeof window.togglePropertyStatus === 'function') {
                window.togglePropertyStatus(id, btn.getAttribute('data-prop-status') || '');
            } else if (action === 'delete' && typeof window.deletePropertyListing === 'function') {
                window.deletePropertyListing(id, btn.getAttribute('data-prop-title') || '');
            }
        });
    }
}

window.togglePropertyStatus = async function(id, currentStatus) {
    const isCurrentlySold = (currentStatus || '').toLowerCase() === 'sold' || (currentStatus || '').toLowerCase() === 'sold out';
    const newStatus = isCurrentlySold ? 'Available' : 'Sold';

    try {
        if (typeof apiUpdateProperty === 'function') {
            await apiUpdateProperty(id, { status: newStatus });
        } else {
            ['properties', 'cached_live_properties', 'urbanScopeProperties'].forEach(key => {
                const list = JSON.parse(localStorage.getItem(key) || '[]');
                const idx = list.findIndex(p => String(p.id) === String(id));
                if (idx !== -1) {
                    list[idx].status = newStatus;
                    localStorage.setItem(key, JSON.stringify(list));
                }
            });
        }
        cachedDashboardProperties = null;
        await loadDashboardData({ forceProperties: true });
        if (typeof window.showFeedbackToast === 'function') {
            window.showFeedbackToast('Property status updated successfully.', 'success');
        }
    } catch (err) {
        console.error("Dashboard toggle status error:", err);
        if (typeof window.showFeedbackToast === 'function') {
            window.showFeedbackToast("Failed to update property status. Please check your connection.", "error");
        } else {
            alert("Failed to update property status. Please check your connection.");
        }
    }
};

window.deletePropertyListing = async function(id, title) {
    const propTitle = title || 'this property';
    if (!confirm(`Are you sure you want to permanently delete "${propTitle}"?\n\nThis will remove it from the catalog and database.`)) {
        return;
    }

    try {
        let success = false;
        if (typeof apiDeleteProperty === 'function') {
            success = await apiDeleteProperty(id);
        } else {
            ['properties', 'cached_live_properties', 'urbanScopeProperties'].forEach(key => {
                const list = JSON.parse(localStorage.getItem(key) || '[]');
                const filtered = list.filter(p => String(p.id) !== String(id));
                localStorage.setItem(key, JSON.stringify(filtered));
            });
            success = true;
        }

        if (success) {
            cachedDashboardProperties = null;
        await loadDashboardData({ forceProperties: true });
            if (typeof window.showFeedbackToast === 'function') {
                window.showFeedbackToast("Property deleted successfully.", "success");
            }
        } else {
            if (typeof window.showFeedbackToast === 'function') {
                window.showFeedbackToast("Could not delete property. Please verify your admin session.", "error");
            } else {
                alert("Could not delete property. Please verify your admin session.");
            }
        }
    } catch (err) {
        console.error("Dashboard delete property error:", err);
        const errMsg = "Failed to delete property: " + (err.message || "Unknown error");
        if (typeof window.showFeedbackToast === 'function') {
            window.showFeedbackToast(errMsg, "error");
        } else {
            alert(errMsg);
        }
    }
};

/* INITIALIZE */

document.addEventListener("DOMContentLoaded", () => {
    const calCard = document.getElementById("dashboardCalendarCard") || document.querySelector(".calendar-card");
    const calToggleBtn = document.getElementById("mobileCalendarToggleBtn");
    if (calCard && calToggleBtn) {
        calToggleBtn.addEventListener("click", () => {
            const isCollapsed = calCard.classList.toggle("mobile-calendar-collapsed");
            const expanded = !isCollapsed;
            calToggleBtn.setAttribute("aria-expanded", String(expanded));
            const labelEl = calToggleBtn.querySelector(".calendar-mobile-toggle-label");
            if (labelEl) {
                labelEl.textContent = expanded ? "Hide Calendar" : "Show Calendar";
            }
        });
    }

    renderCalendar();
    renderAgenda();
    syncCalendarToToday();
    loadCalendarAppointments();
    loadDashboardData();

    const dashInqSearch = document.getElementById("dashInqSearch");
    const dashInqStatus = document.getElementById("dashInqStatusFilter");
    const dashInqProperty = document.getElementById("dashInqPropertyFilter");
    const dashInqSort = document.getElementById("dashInqSortFilter");
    const dashInqDate = document.getElementById("dashInqDateFilter");
    const dashInqReset = document.getElementById("dashInqResetBtn");

    if (dashInqSearch) dashInqSearch.addEventListener("input", applyDashboardInquiryFilters);
    if (dashInqStatus) dashInqStatus.addEventListener("change", applyDashboardInquiryFilters);
    if (dashInqProperty) dashInqProperty.addEventListener("change", applyDashboardInquiryFilters);
    if (dashInqSort) dashInqSort.addEventListener("change", applyDashboardInquiryFilters);
    if (dashInqDate) dashInqDate.addEventListener("change", applyDashboardInquiryFilters);
    if (dashInqReset) {
        dashInqReset.addEventListener("click", () => {
            if (dashInqSearch) dashInqSearch.value = "";
            if (dashInqStatus) dashInqStatus.value = "";
            if (dashInqProperty) dashInqProperty.value = "";
            if (dashInqSort) dashInqSort.value = "newest";
            if (dashInqDate) dashInqDate.value = "";
            applyDashboardInquiryFilters();
        });
    }

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
});


// Live sync when client cancels, deletes, or modifies an inquiry
window.addEventListener('storage', (e) => {
    if (e.key === 'inquiries' || e.key === 'urbanscope_admin_event_notifs' || e.key === 'urbanscope_inquiry_overrides' || e.key === 'urbanscope_deleted_inquiry_ids') {
        loadDashboardData();
    }
});
window.addEventListener('inquiryCancelled', () => loadDashboardData());
window.addEventListener('inquiryStatusChanged', () => loadDashboardData());
const onExternalInquiryUpdate = (ev) => {
    if (ev && ev.detail && ev.detail.source === 'admin-shell') return;
    loadDashboardData();
};
window.addEventListener('inquiriesUpdated', onExternalInquiryUpdate);
window.addEventListener('inquirySubmitted', onExternalInquiryUpdate);
window.addEventListener('newInquiryReceived', onExternalInquiryUpdate);
window.addEventListener('propertiesUpdated', () => {
    cachedDashboardProperties = null;
    loadDashboardData({ forceProperties: true });
});
window.addEventListener('usersUpdated', () => {
    cachedDashboardUsers = null;
    loadDashboardData({ forceUsers: true });
});
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        syncCalendarToToday();
        loadCalendarAppointments();
        loadDashboardData({ forceInquiries: true });
    }
});

window.addEventListener("focus", () => {
    syncCalendarToToday();
});

// Periodic live polling so admin dashboard automatically reflects new inquiries quickly on visible tabs
setInterval(() => {
    if (document.visibilityState === 'visible') {
        loadDashboardData({ isPoll: true, forceInquiries: true });
    }
}, 20000);
