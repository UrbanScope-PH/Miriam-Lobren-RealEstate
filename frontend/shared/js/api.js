/**
 * UrbanScope - API Gateway (Supabase Cloud Client Mirror)
 * ========================================================
 * Mirror of frontend/shared/js/supabase.js connecting directly
 * to the Supabase Cloud backend.
 */

(function (window) {
    'use strict';

    // ----------------------------------------------------------
    // 0. UNIVERSAL DARK MODE PREFERENCE PERSISTENCE ENGINE
    // ----------------------------------------------------------
    const THEME_STORAGE_KEY = 'urbanscope_theme';
    let globalThemeTimer = null;

    function getSavedUserTheme() {
        try {
            const urlTheme = new URLSearchParams(window.location.search).get('theme');
            if (urlTheme === 'dark' || urlTheme === 'light') return urlTheme;
        } catch (_) {}

        try {
            const fromLocal = localStorage.getItem(THEME_STORAGE_KEY);
            if (fromLocal === 'dark' || fromLocal === 'light') return fromLocal;
        } catch (_) {}

        try {
            const cookieMatch = document.cookie.match(/(?:^|;\s*)urbanscope_theme=(dark|light)(?:;|$)/);
            if (cookieMatch && (cookieMatch[1] === 'dark' || cookieMatch[1] === 'light')) {
                try { localStorage.setItem(THEME_STORAGE_KEY, cookieMatch[1]); } catch (_) {}
                return cookieMatch[1];
            }
        } catch (_) {}

        try {
            if (window.name && /__urbanscope_theme=(dark|light)/.test(window.name)) {
                const nameMatch = window.name.match(/__urbanscope_theme=(dark|light)/)[1];
                try { localStorage.setItem(THEME_STORAGE_KEY, nameMatch); } catch (_) {}
                return nameMatch;
            }
        } catch (_) {}

        return 'light';
    }

    function persistUserTheme(mode) {
        const clean = mode === 'dark' ? 'dark' : 'light';
        try {
            localStorage.setItem(THEME_STORAGE_KEY, clean);
        } catch (_) {}
        try {
            document.cookie = 'urbanscope_theme=' + clean + '; path=/; max-age=31536000; SameSite=Lax';
        } catch (_) {}
        try {
            const baseName = String(window.name || '').replace(/\s*__urbanscope_theme=(?:dark|light)/g, '').trim();
            window.name = (baseName ? baseName + ' ' : '') + '__urbanscope_theme=' + clean;
        } catch (_) {}
    }

    function syncThemeColorMeta(isDark) {
        try {
            const p = String(location.pathname || '').toLowerCase().replace(/\\/g, '/');
            const darkColor = (p.includes('/pages/admin/') || p.includes('/pages/superadmin/')) ? '#131f17' : '#0e1611';
            const lightColor = p.includes('/pages/auth/') ? '#f4f8f5' : '#ffffff';
            const targetColor = isDark ? darkColor : lightColor;
            if (document.documentElement && document.documentElement.style) {
                document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
            }
            document.querySelectorAll('meta[name="color-scheme"]').forEach(function (meta) {
                meta.setAttribute('content', isDark ? 'dark' : 'light');
            });
            document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
                meta.setAttribute('content', targetColor);
            });
        } catch (_) {}
    }

    function applyUserTheme(mode, animate) {
        const root = document.documentElement;
        const isDark = mode === 'dark';
        const prefersReduced = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const shouldAnimate = Boolean(animate) && !prefersReduced;

        const commitThemeDom = () => {
            root.classList.toggle('dark-mode', isDark);
            root.setAttribute('data-theme', isDark ? 'dark' : 'light');
            persistUserTheme(isDark ? 'dark' : 'light');
            syncThemeColorMeta(isDark);

            document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
                btn.setAttribute('aria-pressed', String(isDark));
                btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
                btn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
            });
        };

        const clearVtSnap = (seq) => {
            if (seq === undefined || root._urbanVtSeq === seq) {
                root.classList.remove('theme-vt-snap');
            }
            if (root._urbanVtSnapTimer) {
                clearTimeout(root._urbanVtSnapTimer);
                root._urbanVtSnapTimer = null;
            }
        };

        if (shouldAnimate && typeof document.startViewTransition === 'function') {
            root.classList.remove('theme-transitioning');
            if (globalThemeTimer) {
                clearTimeout(globalThemeTimer);
                globalThemeTimer = null;
            }
            const vtSeq = (root._urbanVtSeq = (root._urbanVtSeq || 0) + 1);
            if (root._urbanVtSnapTimer) {
                clearTimeout(root._urbanVtSnapTimer);
                root._urbanVtSnapTimer = null;
            }
            try {
                const transition = document.startViewTransition(() => {
                    root.classList.add('theme-vt-snap');
                    commitThemeDom();
                    void root.offsetHeight;
                });
                if (transition && transition.finished && typeof transition.finished.finally === 'function') {
                    transition.finished.finally(() => clearVtSnap(vtSeq));
                }
                root._urbanVtSnapTimer = setTimeout(() => clearVtSnap(vtSeq), 560);
                return;
            } catch (_) {
                clearVtSnap(vtSeq);
            }
        }

        root.classList.remove('theme-vt-snap');
        if (shouldAnimate) {
            root.classList.add('theme-transitioning');
            if (globalThemeTimer) clearTimeout(globalThemeTimer);
            globalThemeTimer = setTimeout(() => {
                root.classList.remove('theme-transitioning');
                globalThemeTimer = null;
            }, 520);
        }

        commitThemeDom();
    }

    // Apply saved theme immediately on script evaluation in <head>
    applyUserTheme(getSavedUserTheme(), false);

    window.addEventListener('pageshow', () => {
        applyUserTheme(getSavedUserTheme(), false);
    });

    document.addEventListener('DOMContentLoaded', () => {
        syncThemeColorMeta(getSavedUserTheme() === 'dark');
    });

    window.addEventListener('storage', (e) => {
        if (e.key === THEME_STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
            applyUserTheme(e.newValue, true);
        }
    });

    window.UrbanTheme = {
        get: getSavedUserTheme,
        set: applyUserTheme,
        toggle: function () {
            const currentlyDark = document.documentElement.classList.contains('dark-mode') || getSavedUserTheme() === 'dark';
            applyUserTheme(currentlyDark ? 'light' : 'dark', true);
        }
    };

    // ----------------------------------------------------------
    // 1. SUPABASE CONFIGURATION
    // ----------------------------------------------------------
    const SUPABASE_URL = 'https://vfspjuqymfbagesjxjmc.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_96sfQ4F18ypajf6bitBRqg_JtWTL4__';
    const REST_BASE = SUPABASE_URL + '/rest/v1';

    // Optional client-side Google OAuth Client ID fallback (primarily loaded via /api/auth/google/config from .env)
    const GOOGLE_CLIENT_ID = window.URBANSCOPE_GOOGLE_CLIENT_ID || '981770655747-t222jr0ias09rl7aga3302p9am64so43.apps.googleusercontent.com';

    const TOKEN_KEY = 'urbanscope_jwt_token';
    const USER_KEY = 'urbanscope_user';
    const DEMO_KEY = 'urbanscope_demo_user';

    // Initialize Supabase SDK client if loaded on the page
    let supabaseClient = null;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } catch (e) {
            console.warn('Supabase SDK initialization notice:', e);
        }
    }

    function getHeaders(custom = {}) {
        return {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'Accept': 'application/json',
            'Prefer': 'return=representation',
            ...custom
        };
    }

    async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
        if (typeof AbortController !== 'function') {
            return fetch(url, options);
        }
        const controller = new AbortController();
        const timerId = setTimeout(() => {
            try { controller.abort(); } catch (_) {}
        }, timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } catch (err) {
            if (err && err.name === 'AbortError') {
                throw new Error('Request timed out while contacting the server.');
            }
            throw err;
        } finally {
            clearTimeout(timerId);
        }
    }

    const READ_CACHE = {
        leadProfile: { promise: null, data: null, ts: 0 },
        properties: new Map(),
        inquiries: { promise: null, data: null, ts: 0 },
        myInquiries: new Map(),
        adminNotifications: { promise: null, data: null, ts: 0 },
        clientNotifications: new Map(),
        currentUser: { promise: null, data: null, ts: 0, hasValue: false },
        superadminUsers: { promise: null, data: null, ts: 0 }
    };

    function invalidateReadCache(scope = 'all') {
        if (scope === 'all' || scope === 'properties') {
            READ_CACHE.properties.clear();
        }
        if (scope === 'all' || scope === 'inquiries') {
            READ_CACHE.inquiries = { promise: null, data: null, ts: 0 };
            READ_CACHE.myInquiries.clear();
            READ_CACHE.adminNotifications = { promise: null, data: null, ts: 0 };
            READ_CACHE.clientNotifications.clear();
        }
        if (scope === 'all' || scope === 'notifications') {
            READ_CACHE.adminNotifications = { promise: null, data: null, ts: 0 };
            READ_CACHE.clientNotifications.clear();
        }
        if (scope === 'all' || scope === 'users') {
            READ_CACHE.superadminUsers = { promise: null, data: null, ts: 0 };
            READ_CACHE.leadProfile = { promise: null, data: null, ts: 0 };
            READ_CACHE.currentUser = { promise: null, data: null, ts: 0, hasValue: false };
        }
        if (scope === 'all' || scope === 'profile') {
            READ_CACHE.leadProfile = { promise: null, data: null, ts: 0 };
            READ_CACHE.currentUser = { promise: null, data: null, ts: 0, hasValue: false };
            try { localStorage.removeItem('urbanscope_admin_profile_ts'); } catch (_) {}
        }
    }

    function isBackendConfigured() {
        return true;
    }

    function isLocalDevHost() {
        const h = location.hostname;
        return h === 'localhost' ||
               h === '127.0.0.1' ||
               h === '[::1]' ||
               /^192\.168\./.test(h) ||
               /^10\./.test(h) ||
               /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) ||
               location.port === '8000';
    }

    function isLocalBackendReachableHost() {
        const isHttps = typeof location !== 'undefined' && location.protocol === 'https:';
        return isLocalDevHost() && !isHttps;
    }

    function getLocalApiBase() {
        if (typeof location !== 'undefined') {
            if (location.port === '8000') return '/api';
            const host = location.hostname || '127.0.0.1';
            return `http://${host}:8000/api`;
        }
        return 'http://127.0.0.1:8000/api';
    }

    let cachedCsrfToken = '';

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function sanitizeImageUrl(rawUrl, fallback = 'assets/images/agent.jpg') {
        const val = String(rawUrl || '').trim();
        if (!val) return fallback;
        if (/^https?:\/\/[^\s<>"'`]+$/i.test(val)) return val;
        if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(val)) return val;
        const cleanRel = val.replace(/^\.?\//, '');
        if (/^(?:\.\.\/){0,3}assets\/images\/[a-zA-Z0-9._\-\/]+$/i.test(val) && !val.includes('..') && !cleanRel.startsWith('/')) {
            return val;
        }
        if (/^assets\/images\/[a-zA-Z0-9._\-\/]+$/i.test(cleanRel) && !cleanRel.includes('..')) {
            return cleanRel;
        }
        return fallback;
    }

    function escapePostgrestFilter(val) {
        return String(val || '').replace(/[(),*\\]/g, ' ').trim();
    }

    function getCookieValue(name) {
        try {
            const parts = String(document.cookie || '').split(';');
            for (let i = 0; i < parts.length; i++) {
                const item = parts[i].trim();
                if (item.startsWith(name + '=')) {
                    return decodeURIComponent(item.slice(name.length + 1));
                }
            }
        } catch (_) {}
        return '';
    }

    function buildBotFields(botData = {}, forLocal = false) {
        const hp = String(botData.company_website || botData._hp || botData.hp || '');
        const ft = botData._ft !== undefined ? botData._ft : botData.ft;
        const turnstile = String(botData.turnstileToken || botData.turnstile_token || '').trim();
        const out = {};
        if (forLocal) {
            if (hp) out.company_website = hp;
            if (ft !== undefined && ft !== null) out.ft = Number(ft) || 0;
            if (turnstile) out.turnstile_token = turnstile;
        } else {
            if (hp) out._hp = hp;
            if (ft !== undefined && ft !== null) out._ft = Number(ft) || 0;
            if (turnstile) out.turnstileToken = turnstile;
        }
        return out;
    }

    async function ensureCsrfToken(forceRefresh = false) {
        const cookieToken = getCookieValue('urbanscope_csrf');
        if (!forceRefresh && cookieToken) {
            cachedCsrfToken = cookieToken;
            return cookieToken;
        }
        if (!forceRefresh && cachedCsrfToken) {
            return cachedCsrfToken;
        }
        try {
            const url = isLocalBackendReachableHost()
                ? `${getLocalApiBase()}/auth/csrf`
                : '/api/session?action=csrf';
            const res = await fetch(url, {
                method: 'GET',
                credentials: isLocalBackendReachableHost() ? 'include' : 'same-origin',
                cache: 'no-store'
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                const tok = getCookieValue('urbanscope_csrf') || String(data.csrfToken || data.csrf_token || '').trim();
                if (tok) cachedCsrfToken = tok;
                return cachedCsrfToken;
            }
        } catch (_) {}
        return getCookieValue('urbanscope_csrf') || cachedCsrfToken || '';
    }

    function clearClientAuthStorage() {
        READ_CACHE.currentUser = { promise: null, data: null, ts: 0, hasValue: false };
        READ_CACHE.clientNotifications.clear();
        READ_CACHE.myInquiries.clear();
        READ_CACHE.inquiries = { promise: null, data: null, ts: 0 };
        READ_CACHE.adminNotifications = { promise: null, data: null, ts: 0 };
        try {
            [
                TOKEN_KEY,
                'urbanscope_jwt_token',
                'access_token',
                'adminToken',
                'supabase_token',
                'adminSessionToken',
                USER_KEY,
                DEMO_KEY,
                'adminUser',
                'adminPassword',
                'urbanscope_admin_password_updated'
            ].forEach(k => localStorage.removeItem(k));
        } catch (_) {}
    }

    function getStoredBearerToken() {
        const token = localStorage.getItem(TOKEN_KEY) ||
                      localStorage.getItem('urbanscope_jwt_token') ||
                      localStorage.getItem('access_token') ||
                      localStorage.getItem('adminToken') ||
                      localStorage.getItem('supabase_token') || '';
        if (!token || token.startsWith('sb_session_') || token.startsWith('sb_google_')) {
            return '';
        }
        return token;
    }

    function getLocalAuthHeaders(extra = {}) {
        const token = getStoredBearerToken();
        const headers = { 'Content-Type': 'application/json', ...extra };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    async function localApiFetch(path, options = {}, timeoutMs = 10000) {
        const method = String(options.method || 'GET').toUpperCase();
        const url = path.startsWith('http') ? path : `${getLocalApiBase()}${path}`;
        const sendOnce = async (forceCsrf = false) => {
            const headers = getLocalAuthHeaders(options.headers || {});
            if (options.body === undefined || options.body === null) {
                delete headers['Content-Type'];
            }
            if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
                const csrf = await ensureCsrfToken(forceCsrf);
                if (csrf) headers['X-CSRF-Token'] = csrf;
            }
            return fetchWithTimeout(url, {
                ...options,
                method,
                headers,
                credentials: 'include'
            }, timeoutMs);
        };
        let res = await sendOnce(false);
        if (res.status === 403 && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            res = await sendOnce(true);
        }
        return res;
    }

    async function hostedApiFetch(url, options = {}, timeoutMs = 10000) {
        const method = String(options.method || 'GET').toUpperCase();
        const sendOnce = async (forceCsrf = false) => {
            const headers = { ...(options.headers || {}) };
            if (options.body !== undefined && options.body !== null && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
            }
            if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
                const csrf = await ensureCsrfToken(forceCsrf);
                if (csrf) headers['X-CSRF-Token'] = csrf;
            }
            return fetchWithTimeout(url, {
                ...options,
                method,
                headers,
                credentials: 'same-origin'
            }, timeoutMs);
        };
        let res = await sendOnce(false);
        if (res.status === 403 && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            res = await sendOnce(true);
        }
        return res;
    }

    function normalizeAccountRole(_role, email) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        return cleanEmail === 'miriamalobren@gmail.com' ? 'admin' : 'user';
    }

    // ----------------------------------------------------------
    // 2. PROPERTY SERVICES
    // ----------------------------------------------------------
    function getStaticFallbackProperties() {
        return [
            {
                id: 1,
                title: "Casasuerte",
                location: "Barangay San Agustin, Trece Martires City, Cavite",
                property_type: "Townhouse",
                price: 2500000.0,
                bedrooms: 2,
                bathrooms: 1,
                lot_area: 50.0,
                floor_area: 50.8,
                carports: 1,
                storeys: 2,
                status: "Available",
                image_url: "assets/images/casasuerte.jpg",
                description: "Casasuerte stands out as an attractive option for first-time homebuyers and modern families looking for a sustainable yet affordable home. Equipped with built-in solar power system.",
                amenities: "Gated Entrance, Clubhouse, Basketball Court, Parks & Playgrounds, Built-in Solar Power System"
            },
            {
                id: 2,
                title: "Kathleen - Place 5",
                location: "Molino 7, Bacoor, Cavite",
                property_type: "Townhouse",
                price: 6200000.0,
                bedrooms: 3,
                bathrooms: 2,
                lot_area: 112.0,
                floor_area: 112.0,
                carports: 1,
                storeys: 2,
                status: "Available",
                image_url: "assets/images/kathleen-facade.jpg",
                description: "Kathleen - Place 5 is a secure, family-friendly residential community offering 275 premium zen-inspired townhouses in Molino VII, Bacoor.",
                amenities: "Gated Entrance, Clubhouse, Park, Basketball Court, CCTV, Green-Oriented Community"
            },
            {
                id: 3,
                title: "Liora Homes",
                location: "Brgy. Malainen Bago, Naic, Cavite",
                property_type: "Townhouse",
                price: 2462400.0,
                bedrooms: 2,
                bathrooms: 1,
                lot_area: 50.0,
                floor_area: 44.0,
                carports: 1,
                storeys: 2,
                status: "Available",
                image_url: "assets/images/LioraHomes.jpg",
                description: "Award-winning Amora EcoLove townhomes equipped with solar panel systems and rainwater harvesting in Naic, Cavite.",
                amenities: "Clubhouse, Covered Basketball Court, Swimming Pool, Playground & Park, Solar-Ready System"
            },
            {
                id: 4,
                title: "Airmen's Village Triplex",
                location: "Pulang Lupa Dos, Las Piñas City",
                property_type: "Triplex",
                price: 8900000.0,
                bedrooms: 3,
                bathrooms: 3,
                lot_area: 83.25,
                floor_area: 143.78,
                carports: 2,
                storeys: 2,
                status: "Available",
                image_url: "assets/images/AirmenTriplex.WEBP",
                description: "Modern, Ready-for-Occupancy (RFO) triplex residential townhouse located in a secure and peaceful community in Las Piñas.",
                amenities: "Clubhouse, Basketball Court, Swimming Pool, Playground & Park, 24/7 Security, Balcony"
            },
            {
                id: 5,
                title: "Benecia Single-Attached",
                location: "Sihanouk Village, Barangay Talon IV, Las Piñas City",
                property_type: "Single-Attached House",
                price: 9695000.0,
                bedrooms: 3,
                bathrooms: 3,
                lot_area: 102.0,
                floor_area: 117.0,
                carports: 1,
                storeys: 2,
                status: "Available",
                image_url: "assets/images/benecia-facade.jpg",
                description: "Benecia Single Attached offers a modern and spacious home designed for families looking for comfort, privacy, and functionality in Sihanouk Village, Talon IV, Las Piñas City.",
                amenities: "Single-Attached House Design, Private Carport, Front Fence and Gate, Balcony, Lanai, Functional Multi-Level Living Spaces, Spacious Indoor Living Areas, Maid's Room, Powder Room"
            },
            {
                id: 6,
                title: "Amore Classico",
                location: "Benedetto Residences, Barangay Pulang Lupa Uno, Las Piñas City",
                property_type: "Townhouse",
                price: 7995000.0,
                bedrooms: 3,
                bathrooms: 3,
                lot_area: 52.0,
                floor_area: 102.0,
                carports: 1,
                storeys: 3,
                status: "Available",
                image_url: "assets/images/amore-facade.jpg",
                description: "Amore Classico by Benedetto Residences is a thoughtfully designed three-storey townhouse ideal for growing families who need more space, comfort, and functionality in Pulang Lupa Uno, Las Piñas City.",
                amenities: "Three-Storey Townhouse Design, Spacious Family Hall, Dedicated Maid's Room, Functional Multi-Level Living Spaces, Private Patio, Powder Room"
            },
            {
                id: 7,
                title: "Midori Mid-Rise Condo – Zone 1",
                location: "Zone 1, Buildings 14–21, Dasmariñas, Cavite",
                property_type: "Mid-Rise Condominium",
                price: 3140000.0,
                bedrooms: 2,
                bathrooms: 1,
                lot_area: 0.0,
                floor_area: 50.0,
                carports: 0,
                storeys: 2,
                status: "Available",
                image_url: "assets/images/midori-main.webp",
                description: "Midori Mid-Rise Condo – Zone 1 offers a convenient and comfortable living experience for young professionals, couples, and starting families looking for an affordable home in Dasmariñas, Cavite.",
                amenities: "2nd Floor Units, Inner & End Unit Types, Living Area, Dining Area, Kitchen Area, Patio, Convenient Access to Public Transportation, Near Dasmariñas Bayan, Close to Schools and Essential Establishments, Accessible to Daily Needs"
            }
        ];
    }

    let ensureAccreditedPromise = null;

    async function apiEnsureAccreditedProperties() {
        try {
            if (localStorage.getItem('urbanscope_suppress_midori_sync') === '1') {
                return { ok: true, skipped: true, created: false, data: null };
            }
        } catch (_) {}

        if (ensureAccreditedPromise) return ensureAccreditedPromise;

        ensureAccreditedPromise = (async () => {
            if (isLocalBackendReachableHost()) {
                try {
                    const localRes = await fetch(`${getLocalApiBase()}/properties`, { method: 'GET' });
                    if (localRes.ok) {
                        const localData = await localRes.json().catch(() => []);
                        const midori = Array.isArray(localData)
                            ? localData.find(p => String(p?.title || '').toLowerCase().includes('midori'))
                            : null;
                        if (midori) invalidateReadCache('properties');
                        return { ok: true, created: false, data: midori || null };
                    }
                } catch (_) {}
                return { ok: false, created: false, data: null };
            }

            try {
                const res = await hostedApiFetch('/api/properties', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'sync_accredited' })
                });
                const body = await res.json().catch(() => ({}));
                if (res.ok && body && body.success !== false) {
                    if (body.created || body.data) invalidateReadCache('properties');
                    return {
                        ok: true,
                        created: Boolean(body.created),
                        data: body.data || null
                    };
                }
            } catch (err) {
                console.warn('Accredited property sync notice:', err?.message || err);
            }
            return { ok: false, created: false, data: null };
        })().finally(() => {
            ensureAccreditedPromise = null;
        });

        return ensureAccreditedPromise;
    }

    const DEPRECATED_PROPERTY_TITLES = new Set([
        'velemont residences',
        'green valley villa',
        'horizon heights',
        'sunset heights executive townhouse',
        'maple ridge residence',
        'oakwood manor',
        'victoria park residences'
    ]);

    function retainActivePropertyListing(p) {
        if (!p || typeof p !== 'object') return false;
        const t = String(p.title || p.propertyName || p.name || '').toLowerCase().trim();
        return Boolean(t) && !DEPRECATED_PROPERTY_TITLES.has(t);
    }

    function normalizePropertyListItem(p) {
        if (!p || typeof p !== 'object') return p;
        const out = { ...p };
        const t = String(out.title || out.propertyName || out.name || '').toLowerCase().trim();
        if (t.includes('suerte')) out.title = 'Casasuerte';
        else if (t.includes('kathleen')) out.title = 'Kathleen - Place 5';
        else if (t.includes('benecia')) out.title = 'Benecia Single-Attached';
        else if (t.includes('amore')) out.title = 'Amore Classico';
        else if (t.includes('midori')) out.title = 'Midori Mid-Rise Condo – Zone 1';
        return out;
    }

    function persistPropertyListToCache(storageKey, list) {
        if (!Array.isArray(list)) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(list));
            return;
        } catch (err) {
            try {
                // Retry with compact card metadata (dropping bulky multi-photo arrays if localStorage quota is tight)
                const compactList = list.map((item) => {
                    if (!item || typeof item !== 'object') return item;
                    const clone = { ...item };
                    if (Array.isArray(clone.gallery_images) && clone.gallery_images.length > 1) {
                        clone.gallery_images = clone.image_url ? [clone.image_url] : clone.gallery_images.slice(0, 1);
                    }
                    return clone;
                });
                localStorage.setItem(storageKey, JSON.stringify(compactList));
                return;
            } catch (_) {
                try {
                    const minimalList = list.map((item) => {
                        if (!item || typeof item !== 'object') return item;
                        const { gallery_images, ...rest } = item;
                        return rest;
                    });
                    localStorage.setItem(storageKey, JSON.stringify(minimalList));
                } catch (_2) {}
            }
        }
    }

    function emitPropertiesSyncSignal() {
        try {
            localStorage.setItem('urbanscope_properties_sync_ts', String(Date.now()));
        } catch (_) {}
        try {
            if (typeof BroadcastChannel === 'function') {
                const ch = new BroadcastChannel('urbanscope_properties');
                ch.postMessage({ type: 'properties_updated', ts: Date.now() });
                ch.close();
            }
        } catch (_) {}
    }

    function apiGetCachedProperties() {
        try {
            const keys = ['cached_live_properties', 'urbanScopeProperties', 'properties'];
            const combined = [];
            const seenIds = new Set();
            const seenTitles = new Set();
            keys.forEach((key) => {
                let parsed = [];
                try {
                    parsed = JSON.parse(localStorage.getItem(key) || '[]');
                } catch (_) {
                    parsed = [];
                }
                if (!Array.isArray(parsed)) return;
                parsed.forEach((raw) => {
                    if (!retainActivePropertyListing(raw)) return;
                    const item = normalizePropertyListItem(raw);
                    const idKey = item.id !== undefined && item.id !== null && String(item.id).trim() !== '' ? String(item.id).trim() : '';
                    const titleKey = String(item.title || item.propertyName || item.name || '').toLowerCase().trim();
                    if (idKey && seenIds.has(idKey)) return;
                    if (!idKey && titleKey && seenTitles.has(titleKey)) return;
                    if (idKey) seenIds.add(idKey);
                    if (titleKey) seenTitles.add(titleKey);
                    combined.push(item);
                });
            });
            return combined.length > 0 ? combined : null;
        } catch (_) {
            return null;
        }
    }

    async function apiGetLocalPropertiesFast() {
        if (!isLocalBackendReachableHost()) return null;
        try {
            const localBase = getLocalApiBase();
            const localRes = await fetch(`${localBase}/properties`, {
                method: 'GET',
                cache: 'no-store',
                signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
                    ? AbortSignal.timeout(1800)
                    : undefined
            });
            if (!localRes.ok) return null;
            const localData = await localRes.json();
            if (!Array.isArray(localData) || localData.length === 0) return null;
            return localData.filter(retainActivePropertyListing).map(normalizePropertyListItem);
        } catch (_) {
            return null;
        }
    }

    async function apiGetProperties(filter = {}, forceRefresh = false) {
        const isForce = Boolean(forceRefresh || (filter && filter.forceRefresh));
        const cacheKey = JSON.stringify({
            type: String((filter && filter.type) || 'all').toLowerCase().trim(),
            location: String((filter && filter.location) || 'all').toLowerCase().trim(),
            search: String((filter && filter.search) || '').trim(),
            columns: String((filter && filter.columns) || '').trim()
        });
        const cachedEntry = READ_CACHE.properties.get(cacheKey);
        const now = Date.now();
        if (!isForce && cachedEntry && cachedEntry.data && (now - cachedEntry.ts) < 15000) {
            return cachedEntry.data;
        }
        if (!isForce && cachedEntry && cachedEntry.promise) {
            return cachedEntry.promise;
        }

        const runner = (async () => {
            let liveProperties = [];
            const isUnfilteredQuery = (!filter || ((!filter.type || filter.type === 'all') && (!filter.location || filter.location === 'all') && !filter.search));
            const localReachable = isLocalBackendReachableHost();

            const remotePromise = (async () => {
                try {
                    const queryParts = [];

                    // 1. Property Type Filter
                    if (filter.type && filter.type !== 'all') {
                        const t = filter.type.toLowerCase().trim();
                        if (t === 'villa' || t === 'villas') {
                            queryParts.push('property_type=ilike.*villa*');
                        } else if (t === 'townhouse' || t === 'townhouses') {
                            queryParts.push('property_type=ilike.*townhouse*');
                        } else if (t === 'apartment' || t === 'apartments' || t === 'condo' || t === 'condominium') {
                            queryParts.push('or=(property_type.ilike.*condominium*,property_type.ilike.*apartment*)');
                        } else if (t === 'subdivision' || t === 'subdivisions') {
                            queryParts.push('property_type=ilike.*subdivision*');
                        } else if (t === 'triplex' || t === 'triplexes') {
                            queryParts.push('property_type=ilike.*triplex*');
                        } else if (t === 'luxury' || t === 'luxury villas') {
                            queryParts.push('or=(property_type.ilike.*villa*,price.gte.5000000)');
                        } else if (t === 'house-lot' || t === 'house & lot') {
                            queryParts.push('or=(property_type.ilike.*townhouse*,property_type.ilike.*subdivision*,property_type.ilike.*single attached*,property_type.ilike.*triplex*,property_type.ilike.*villa*)');
                        } else {
                            const safeType = escapePostgrestFilter(filter.type);
                            if (safeType) queryParts.push(`property_type=ilike.*${encodeURIComponent(safeType)}*`);
                        }
                    }

                    // 2. Location Filter
                    if (filter.location && filter.location !== 'all') {
                        const cleanLoc = escapePostgrestFilter(filter.location.replace(/-/g, ' '));
                        if (cleanLoc) queryParts.push(`location=ilike.*${encodeURIComponent(cleanLoc)}*`);
                    }

                    // 3. Search Keyword across title, location, description, amenities
                    if (filter.search && filter.search.trim()) {
                        const cleanedSearch = escapePostgrestFilter(filter.search);
                        if (cleanedSearch) {
                            const s = encodeURIComponent(cleanedSearch);
                            queryParts.push(`or=(title.ilike.*${s}*,location.ilike.*${s}*,property_type.ilike.*${s}*,description.ilike.*${s}*,amenities.ilike.*${s}*)`);
                        }
                    }

                    if (filter.columns && /^[a-zA-Z0-9_,]+$/.test(String(filter.columns).trim())) {
                        queryParts.push(`select=${String(filter.columns).trim()}`);
                    }

                    queryParts.push('order=id.desc');

                    const url = `${REST_BASE}/properties?${queryParts.join('&')}`;
                    const res = await fetch(url, { method: 'GET', headers: getHeaders(), cache: 'no-store' });

                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data) && data.length > 0) {
                            return data;
                        }
                    }
                } catch (err) {
                    console.warn('Supabase properties fetch notice, attempting fallback:', err.message);
                }
                return [];
            })();

            // Launch local FastAPI /properties fetch concurrently with remote Supabase on localhost/:5500
            const localUnfilteredPromise = (localReachable && isUnfilteredQuery)
                ? (async () => {
                    try {
                        const localBase = getLocalApiBase();
                        const localRes = await fetch(`${localBase}/properties`, {
                            method: 'GET',
                            cache: 'no-store',
                            signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
                                ? AbortSignal.timeout(1800)
                                : undefined
                        });
                        if (localRes.ok) {
                            const localData = await localRes.json();
                            if (Array.isArray(localData) && localData.length > 0) return localData;
                        }
                    } catch (e) {}
                    return [];
                })()
                : Promise.resolve([]);

            const [remoteSettled, localSettled] = await Promise.allSettled([remotePromise, localUnfilteredPromise]);
            if (remoteSettled.status === 'fulfilled' && Array.isArray(remoteSettled.value)) {
                liveProperties = remoteSettled.value.slice();
            }
            let localData = (localSettled.status === 'fulfilled' && Array.isArray(localSettled.value)) ? localSettled.value : [];

            if (localReachable && !isUnfilteredQuery && liveProperties.length === 0) {
                try {
                    const localBase = getLocalApiBase();
                    const localRes = await fetch(`${localBase}/properties`, {
                        method: 'GET',
                        cache: 'no-store',
                        signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
                            ? AbortSignal.timeout(1800)
                            : undefined
                    });
                    if (localRes.ok) {
                        const data = await localRes.json();
                        if (Array.isArray(data)) localData = data;
                    }
                } catch (e) {}
            }

            if (localData.length > 0) {
                if (liveProperties.length === 0) {
                    liveProperties = localData;
                } else {
                    const existingTitles = new Set(liveProperties.map(p => String(p?.title || p?.propertyName || p?.name || '').toLowerCase().trim()));
                    localData.forEach(lp => {
                        const lt = String(lp?.title || '').toLowerCase().trim();
                        if (lt && !existingTitles.has(lt)) {
                            liveProperties.unshift(lp);
                            existingTitles.add(lt);
                        }
                    });
                }
            }

            // Fallback 2: Cached properties in localStorage
            if (liveProperties.length === 0) {
                try {
                    const cached = JSON.parse(localStorage.getItem('cached_live_properties') || '[]');
                    if (Array.isArray(cached) && cached.length > 0) {
                        liveProperties = cached;
                    }
                } catch (e) {}
            }

            // Always merge any locally created properties that are not yet in liveProperties
            try {
                const localProps = JSON.parse(localStorage.getItem('urbanScopeProperties') || localStorage.getItem('properties') || '[]');
                if (Array.isArray(localProps) && localProps.length > 0) {
                    const existingIds = new Set(liveProperties.map(p => String(p.id)));
                    const existingTitles = new Set(liveProperties.map(p => (p.title || p.propertyName || '').toLowerCase().trim()));

                    localProps.forEach(lp => {
                        const lpTitle = (lp.title || lp.propertyName || '').toLowerCase().trim();
                        if (!existingIds.has(String(lp.id)) && (!lpTitle || !existingTitles.has(lpTitle))) {
                            liveProperties.unshift(lp);
                            existingIds.add(String(lp.id));
                        }
                    });
                }
            } catch (e) {}

            // Drop deprecated pre-migration mock seed titles while preserving accredited + admin-added listings
            liveProperties = liveProperties.filter(retainActivePropertyListing).map(normalizePropertyListItem);

            // Fallback to static accredited properties if list is empty
            if (liveProperties.length === 0) {
                liveProperties = getStaticFallbackProperties();
            }

            if (liveProperties.length > 0) {
                if (!filter.columns) {
                    persistPropertyListToCache('cached_live_properties', liveProperties);
                    ['urbanScopeProperties', 'properties'].forEach(k => {
                        try {
                            const raw = localStorage.getItem(k);
                            if (raw) {
                                const parsed = JSON.parse(raw);
                                if (Array.isArray(parsed)) {
                                    const clean = parsed.filter(retainActivePropertyListing);
                                    persistPropertyListToCache(k, clean);
                                }
                            }
                        } catch (_) {}
                    });
                }
                READ_CACHE.properties.set(cacheKey, { promise: null, data: liveProperties, ts: Date.now() });
                return liveProperties;
            }

            return null;
        })().finally(() => {
            const cur = READ_CACHE.properties.get(cacheKey);
            if (cur && cur.promise === runner) cur.promise = null;
        });

        READ_CACHE.properties.set(cacheKey, {
            promise: runner,
            data: cachedEntry ? cachedEntry.data : null,
            ts: cachedEntry ? cachedEntry.ts : 0
        });
        return runner;
    }

    async function apiGetPropertyById(id) {
        try {
            const url = `${REST_BASE}/properties?id=eq.${encodeURIComponent(id)}&select=*`;
            const imgUrl = `${REST_BASE}/property_images?property_id=eq.${encodeURIComponent(id)}&select=image_url,display_order&order=display_order.asc`;
            const [res, imgRes] = await Promise.all([
                fetch(url, { method: 'GET', headers: getHeaders(), cache: 'no-store' }),
                fetch(imgUrl, { method: 'GET', headers: getHeaders(), cache: 'no-store' }).catch(() => null)
            ]);
            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) {
                    const prop = data[0];
                    if (imgRes && imgRes.ok) {
                        const imgRows = await imgRes.json().catch(() => []);
                        if (Array.isArray(imgRows) && imgRows.length > 0) {
                            prop.gallery_images = imgRows.map(r => r && r.image_url).filter(Boolean);
                        }
                    }
                    return prop;
                }
            }
        } catch (err) {
            console.warn(`Supabase notice fetching property #${id}:`, err.message);
        }

        // Fallback 1: Local backend
        if (isLocalBackendReachableHost()) {
            try {
                const localBase = getLocalApiBase();
                const localRes = await fetch(`${localBase}/properties/${encodeURIComponent(id)}`, {
                    cache: 'no-store',
                    signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
                        ? AbortSignal.timeout(1800)
                        : undefined
                });
                if (localRes.ok) return await localRes.json();
            } catch (e) {}
        }

        // Fallback 2: Cache / local storage
        try {
            const all = JSON.parse(localStorage.getItem('cached_live_properties') || '[]')
                .concat(JSON.parse(localStorage.getItem('urbanScopeProperties') || '[]'))
                .concat(JSON.parse(localStorage.getItem('properties') || '[]'));
            const found = all.find(p => String(p.id) === String(id));
            if (found) return found;
        } catch (e) {}

        // Fallback 3: Canonical static fallback list
        const staticMatch = getStaticFallbackProperties().find(p => String(p.id) === String(id));
        if (staticMatch) return staticMatch;

        return null;
    }

    async function apiAddProperty(property) {
        const loc = (property.location || 'Cavite, Philippines').trim();
        let city = property.city;
        let province = property.province || 'Cavite';
        if (!city) {
            if (loc.includes(',')) {
                city = loc.split(',')[0].trim();
                province = loc.split(',')[1].trim() || 'Cavite';
            } else {
                city = loc || 'Cavite';
            }
        }
        if (!city) city = 'Cavite';
        if (!province) province = 'Cavite';

        let validStatus = property.status || 'Available';
        if (!['Available', 'Reserved', 'Sold', 'Under Review'].includes(validStatus)) {
            if (validStatus === 'Pending') validStatus = 'Under Review';
            else if (validStatus === 'Unavailable') validStatus = 'Sold';
            else validStatus = 'Available';
        }

        const numOr = (val, fb) => (val !== undefined && val !== null && val !== '' && Number.isFinite(Number(val))) ? Number(val) : fb;
        const intOr = (val, fb) => (val !== undefined && val !== null && val !== '' && Number.isFinite(Number(val))) ? Math.trunc(Number(val)) : fb;

        const payload = {
            title: property.title || property.propertyName || 'New Listing',
            location: loc,
            city: city,
            province: province,
            property_type: property.property_type || property.propertyType || 'Villa',
            price: numOr(property.price, 0),
            bedrooms: intOr(property.bedrooms, 3),
            bathrooms: intOr(property.bathrooms, 2),
            lot_area: numOr(property.lot_area !== undefined ? property.lot_area : property.lotArea, 120),
            floor_area: numOr(property.floor_area !== undefined ? property.floor_area : property.floorArea, 80),
            carports: intOr(property.carports, 1),
            storeys: intOr(property.storeys, 2),
            status: validStatus,
            image_url: sanitizeImageUrl(
                property.image_url || (property.imageNames && property.imageNames[0] ? 'assets/images/' + property.imageNames[0] : 'assets/images/property1.jpg'),
                'assets/images/property1.jpg'
            ),
            gallery_images: Array.isArray(property.gallery_images)
                ? property.gallery_images.slice(0, 10).map(u => sanitizeImageUrl(u, '')).filter(Boolean)
                : undefined,
            description: property.description || '',
            amenities: property.amenities || ''
        };
        if (!payload.gallery_images || payload.gallery_images.length === 0) {
            delete payload.gallery_images;
        }
        if (String(payload.title || '').toLowerCase().includes('midori')) {
            try { localStorage.removeItem('urbanscope_suppress_midori_sync'); } catch (_) {}
        }

        window.__urbanLastPropertyError = '';
        let created = null;

        if (isLocalBackendReachableHost()) {
            try {
                const localRes = await localApiFetch('/properties', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                if (localRes.ok) {
                    created = await localRes.json();
                } else {
                    const errBody = await localRes.json().catch(() => ({}));
                    const errMsg = errBody.detail || errBody.error || `HTTP ${localRes.status}`;
                    window.__urbanLastPropertyError = String(errMsg);
                    console.warn('Local property insert rejected:', errMsg);
                    return null;
                }
            } catch (e) {
                window.__urbanLastPropertyError = String(e.message || 'Network error');
                console.warn('Local backend property insert notice:', e);
                return null;
            }
        } else {
            try {
                const res = await hostedApiFetch('/api/properties', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'create', payload })
                });
                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    created = extractApiObjectPayload(data, 'property');
                } else {
                    const errBody = await res.json().catch(() => ({}));
                    const errMsg = errBody.error || errBody.message || `HTTP ${res.status}`;
                    window.__urbanLastPropertyError = String(errMsg);
                    console.warn('Hosted property insert rejected:', errMsg);
                    return null;
                }
            } catch (err) {
                window.__urbanLastPropertyError = String(err.message || 'Network error');
                console.warn('Hosted property insert notice:', err.message);
                return null;
            }
        }

        if (!created) return null;

        // Immediately update local browser caches for snappy admin & homepage UI
        try {
            const cached = JSON.parse(localStorage.getItem('cached_live_properties') || '[]');
            const filtered = Array.isArray(cached) ? cached.filter(p => String(p && p.id) !== String(created.id)) : [];
            filtered.unshift(created);
            persistPropertyListToCache('cached_live_properties', filtered);
        } catch (e) {}

        try {
            const urbanProps = JSON.parse(localStorage.getItem('urbanScopeProperties') || '[]');
            const filtered = Array.isArray(urbanProps) ? urbanProps.filter(p => String(p && p.id) !== String(created.id)) : [];
            filtered.unshift(created);
            persistPropertyListToCache('urbanScopeProperties', filtered);
        } catch (e) {}

        try {
            const adminProps = JSON.parse(localStorage.getItem('properties') || '[]');
            const filtered = Array.isArray(adminProps) ? adminProps.filter(p => String(p && p.id) !== String(created.id)) : [];
            filtered.unshift({
                id: created.id,
                name: created.title,
                title: created.title,
                location: created.location,
                type: created.property_type,
                property_type: created.property_type,
                price: created.price,
                status: created.status,
                bedrooms: created.bedrooms,
                bathrooms: created.bathrooms,
                lot_area: created.lot_area,
                floor_area: created.floor_area,
                carports: created.carports,
                image_url: created.image_url
            });
            persistPropertyListToCache('properties', filtered);
        } catch (e) {}

        invalidateReadCache('properties');
        emitPropertiesSyncSignal();
        return created;
    }

    async function apiUpdateProperty(id, property) {
        let updated = null;
        const safePayload = { ...(property || {}) };
        if (safePayload.image_url !== undefined) {
            safePayload.image_url = sanitizeImageUrl(safePayload.image_url, 'assets/images/property1.jpg');
        }

        if (isLocalBackendReachableHost()) {
            try {
                const localRes = await localApiFetch(`/properties/${encodeURIComponent(id)}`, {
                    method: 'PUT',
                    body: JSON.stringify(safePayload)
                });
                if (localRes.ok) {
                    updated = await localRes.json();
                } else {
                    return null;
                }
            } catch (e) {
                console.warn('Local backend property update notice:', e);
                return null;
            }
        } else {
            try {
                const res = await hostedApiFetch('/api/properties', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'update', id, payload: safePayload })
                });
                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    updated = extractApiObjectPayload(data, 'property');
                } else {
                    return null;
                }
            } catch (err) {
                console.warn(`Hosted update notice for property #${id}:`, err.message);
                return null;
            }
        }

        if (!updated) return null;

        // Immediately sync local storage property caches
        try {
            ['cached_live_properties', 'urbanScopeProperties', 'properties'].forEach(key => {
                const list = JSON.parse(localStorage.getItem(key) || '[]');
                if (Array.isArray(list) && list.length > 0) {
                    const idx = list.findIndex(p => String(p.id) === String(id));
                    if (idx !== -1) {
                        list[idx] = { ...list[idx], ...safePayload };
                        persistPropertyListToCache(key, list);
                    }
                }
            });
        } catch (e) {}

        invalidateReadCache('properties');
        emitPropertiesSyncSignal();
        return updated;
    }

    async function apiDeleteProperty(id) {
        let deleted = false;

        if (isLocalBackendReachableHost()) {
            try {
                const localRes = await localApiFetch(`/properties/${encodeURIComponent(id)}`, {
                    method: 'DELETE'
                });
                if (localRes.ok) deleted = true;
            } catch (e) {
                console.warn('Local backend property delete notice:', e);
            }
        } else {
            try {
                const res = await hostedApiFetch('/api/properties', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'delete', id })
                });
                if (res.ok) deleted = true;
            } catch (err) {
                console.warn(`Hosted delete notice for property #${id}:`, err.message);
            }
        }

        if (!deleted) return false;

        // Clean up local storage property caches
        try {
            ['cached_live_properties', 'urbanScopeProperties', 'properties'].forEach(key => {
                const list = JSON.parse(localStorage.getItem(key) || '[]');
                if (Array.isArray(list) && list.length > 0) {
                    const targetProp = list.find(p => String(p.id) === String(id));
                    if (targetProp && String(targetProp.title || targetProp.name || '').toLowerCase().includes('midori')) {
                        localStorage.setItem('urbanscope_suppress_midori_sync', '1');
                    }
                    const filtered = list.filter(p => String(p.id) !== String(id));
                    persistPropertyListToCache(key, filtered);
                }
            });
        } catch (e) {}

        invalidateReadCache('properties');
        emitPropertiesSyncSignal();
        return deleted;
    }

    // ----------------------------------------------------------
    // 3. INQUIRY & NOTIFICATION SERVICES
    // ----------------------------------------------------------
    const ADMIN_EVENT_NOTIFS_KEY = 'urbanscope_admin_event_notifs';
    const CLIENT_NOTIFS_KEY = 'urbanscope_client_notifications';
    const INQUIRY_OVERRIDES_KEY = 'urbanscope_inquiry_overrides';
    const DELETED_INQUIRIES_KEY = 'urbanscope_deleted_inquiry_ids';

    function getDeletedInquiryIds() {
        try {
            const arr = JSON.parse(localStorage.getItem(DELETED_INQUIRIES_KEY) || '[]');
            return Array.isArray(arr) ? arr.map(String) : [];
        } catch (_) {
            return [];
        }
    }

    function markInquiryDeletedLocal(id) {
        try {
            const set = new Set(getDeletedInquiryIds());
            set.add(String(id));
            localStorage.setItem(DELETED_INQUIRIES_KEY, JSON.stringify(Array.from(set)));
        } catch (_) {}
    }

    function getInquiryOverrides() {
        try {
            const obj = JSON.parse(localStorage.getItem(INQUIRY_OVERRIDES_KEY) || '{}');
            return (obj && typeof obj === 'object') ? obj : {};
        } catch (_) {
            return {};
        }
    }

    const INQUIRY_CANCELLED_BY_KEY = 'urbanscope_inquiry_cancelled_by';

    function getInquiryCancelledByMap() {
        try {
            const parsed = JSON.parse(localStorage.getItem(INQUIRY_CANCELLED_BY_KEY) || '{}');
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function setInquiryCancelledBy(id, actor) {
        try {
            const map = getInquiryCancelledByMap();
            const key = String(id);
            if (actor === 'admin' || actor === 'client') {
                map[key] = actor;
            } else {
                delete map[key];
            }
            localStorage.setItem(INQUIRY_CANCELLED_BY_KEY, JSON.stringify(map));
        } catch (_) {}
    }

    function saveInquiryOverride(id, patch) {
        try {
            const overrides = getInquiryOverrides();
            const key = String(id);
            overrides[key] = { ...(overrides[key] || {}), ...patch, updated_at: new Date().toISOString() };
            localStorage.setItem(INQUIRY_OVERRIDES_KEY, JSON.stringify(overrides));
        } catch (_) {}
    }

    function applyLocalInquiryState(list) {
        if (!Array.isArray(list)) return [];
        const deletedIds = new Set(getDeletedInquiryIds());
        const deletedUserEmails = new Set(getDeletedUserEmails());
        const deletedUserIds = new Set(getDeletedUserIds());
        const overrides = getInquiryOverrides();
        const cancelledByMap = getInquiryCancelledByMap();
        let cached = [];
        try {
            cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
        } catch (_) {}

        const updatedList = list
            .filter(item => {
                if (!item) return false;
                if (deletedIds.has(String(item.id))) return false;
                const itemEmail = String(item.client_email || '').trim().toLowerCase();
                const itemClientId = String(item.client_id || '').trim();
                if (itemEmail && deletedUserEmails.has(itemEmail)) return false;
                if (itemEmail.startsWith('deleted_')) return false;
                if (itemClientId && deletedUserIds.has(itemClientId)) return false;
                return true;
            })
            .map(item => {
                const key = String(item.id);
                let merged = { ...item };

                // The server/database is the authoritative source of truth for status.
                // Never allow a stale local cached status to downgrade a newer remote status.
                const s = String(merged.status || '').toLowerCase().trim();
                if (s === 'approved' || s === 'scheduled') {
                    // Clean up any stale local overrides since server is confirmed approved
                    if (overrides[key]) {
                        delete overrides[key];
                        try {
                            localStorage.setItem(INQUIRY_OVERRIDES_KEY, JSON.stringify(overrides));
                        } catch (_) {}
                    }
                    if (cancelledByMap[key]) {
                        setInquiryCancelledBy(key, null);
                    }
                } else if (overrides[key]) {
                    const ov = overrides[key];
                    if (merged.updated_at && ov.updated_at && new Date(merged.updated_at) >= new Date(ov.updated_at)) {
                        delete overrides[key];
                        try {
                            localStorage.setItem(INQUIRY_OVERRIDES_KEY, JSON.stringify(overrides));
                        } catch (_) {}
                    } else {
                        merged = { ...merged, ...ov };
                    }
                }

                const finalStatus = String(merged.status || '').toLowerCase().trim();
                if (finalStatus === 'cancelled') {
                    if (!merged.cancelled_by && cancelledByMap[key]) {
                        merged.cancelled_by = cancelledByMap[key];
                    }
                } else {
                    merged.cancelled_by = null;
                }
                return merged;
            });

        // Synchronize local cache with latest server truth
        try {
            const cacheMap = new Map();
            if (Array.isArray(cached)) {
                cached.forEach(c => { if (c && c.id) cacheMap.set(String(c.id), c); });
            }
            updatedList.forEach(item => {
                const k = String(item.id);
                const prev = cacheMap.get(k) || {};
                cacheMap.set(k, { ...prev, ...item });
            });
            const nextInqJson = JSON.stringify(Array.from(cacheMap.values()));
            if (localStorage.getItem('inquiries') !== nextInqJson) {
                localStorage.setItem('inquiries', nextInqJson);
            }
        } catch (_) {}

        return updatedList;
    }

    function pushAdminEventNotification(eventObj) {
        invalidateReadCache('notifications');
        try {
            const list = JSON.parse(localStorage.getItem(ADMIN_EVENT_NOTIFS_KEY) || '[]');
            const cleanList = Array.isArray(list)
                ? list.filter(it => it && it.notifKey !== eventObj.notifKey)
                : [];
            cleanList.unshift(eventObj);
            localStorage.setItem(ADMIN_EVENT_NOTIFS_KEY, JSON.stringify(cleanList.slice(0, 50)));
            window.dispatchEvent(new CustomEvent('adminNotificationAdded', { detail: eventObj }));
        } catch (_) {}
    }

    function pushClientNotification(notifObj) {
        invalidateReadCache('notifications');
        try {
            const list = JSON.parse(localStorage.getItem(CLIENT_NOTIFS_KEY) || '[]');
            const cleanList = Array.isArray(list)
                ? list.filter(it => it && it.notifKey !== notifObj.notifKey)
                : [];
            cleanList.unshift(notifObj);
            localStorage.setItem(CLIENT_NOTIFS_KEY, JSON.stringify(cleanList.slice(0, 50)));

            const cleanEmail = String(notifObj.client_email || '').trim().toLowerCase();
            if (cleanEmail && notifObj.notifKey) {
                try {
                    const readKey = 'client_notifs_read_ids_' + cleanEmail;
                    const readIds = JSON.parse(localStorage.getItem(readKey) || '[]');
                    if (Array.isArray(readIds)) {
                        localStorage.setItem(readKey, JSON.stringify(readIds.filter(k => k !== notifObj.notifKey)));
                    }
                } catch (_) {}
                try {
                    const toastKey = 'client_notifs_toasted_' + cleanEmail;
                    const toastedIds = JSON.parse(localStorage.getItem(toastKey) || '[]');
                    if (Array.isArray(toastedIds)) {
                        localStorage.setItem(toastKey, JSON.stringify(toastedIds.filter(k => k !== notifObj.notifKey)));
                    }
                } catch (_) {}
            }

            window.dispatchEvent(new CustomEvent('clientNotificationAdded', { detail: notifObj }));
        } catch (_) {}
    }

    function extractApiArrayPayload(body, fallbackKey, fallbackValue = []) {
        if (Array.isArray(body)) return body;
        if (body && Array.isArray(body.data)) return body.data;
        if (body && fallbackKey && Array.isArray(body[fallbackKey])) return body[fallbackKey];
        return fallbackValue;
    }

    function extractApiObjectPayload(body, fallbackKey) {
        if (Array.isArray(body)) return body[0] || null;
        if (!body || typeof body !== 'object') return body || null;
        if (fallbackKey && body[fallbackKey] && typeof body[fallbackKey] === 'object') return body[fallbackKey];
        if (body.data !== undefined && body.data !== null) {
            return Array.isArray(body.data) ? (body.data[0] || null) : body.data;
        }
        return body;
    }

    async function apiGetAdminNotifications(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && READ_CACHE.adminNotifications.data && (now - READ_CACHE.adminNotifications.ts) < 5000) {
            return READ_CACHE.adminNotifications.data;
        }
        if (!forceRefresh && READ_CACHE.adminNotifications.promise) {
            return READ_CACHE.adminNotifications.promise;
        }

        const runner = (async () => {
            let items = [];
            try {
                const localEvents = JSON.parse(localStorage.getItem(ADMIN_EVENT_NOTIFS_KEY) || '[]');
                if (Array.isArray(localEvents)) {
                    items = localEvents.filter(ev => ev && ev.type !== 'approved' && ev.type !== 'completed');
                }
            } catch (_) {}

            try {
                const res = isLocalBackendReachableHost()
                    ? await localApiFetch('/notifications?role=admin', { method: 'GET' })
                    : await hostedApiFetch('/api/inquiries?action=notifications&role=admin', { method: 'GET' });
                if (res.ok) {
                    const body = await res.json().catch(() => []);
                    const rows = extractApiArrayPayload(body, 'notifications');
                    rows.forEach(r => {
                        const inqId = r.inquiry_id || r.reference_id || r.id;
                        const nType = String(r.type || 'info').toLowerCase();
                        if (nType === 'approved' || nType === 'completed') return;
                        const createdMs = r.created_at ? new Date(r.created_at).getTime() : Date.now();
                        const notifKey = `${nType}_${inqId}`;
                        if (!items.some(existing => String(existing.inquiryId) === String(inqId) && existing.type === nType)) {
                            items.push({
                                id: `srv_${r.id}`,
                                notifKey: notifKey,
                                type: nType,
                                avatarClass: nType === 'cancelled' ? 'cancel' : 'user',
                                avatarIcon: nType === 'cancelled' ? '✕' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
                                inquiryId: inqId,
                                client_name: r.client_name || 'Client',
                                property_title: r.property_title || 'General Inquiry',
                                title: r.title,
                                subtitle: `${r.property_title || 'General Inquiry'}`,
                                created_at: r.created_at,
                                time: isNaN(createdMs) ? Date.now() : createdMs
                            });
                        }
                    });
                }
            } catch (_) {}

            items = items.filter(it => it && it.type !== 'approved' && it.type !== 'completed');
            items.sort((a, b) => (b.time || 0) - (a.time || 0));
            READ_CACHE.adminNotifications = { promise: null, data: items, ts: Date.now() };
            return items;
        })().finally(() => {
            if (READ_CACHE.adminNotifications.promise === runner) {
                READ_CACHE.adminNotifications.promise = null;
            }
        });

        READ_CACHE.adminNotifications.promise = runner;
        return runner;
    }

    async function apiGetClientNotifications(email, forceRefreshOrOpts = false) {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!cleanEmail || getDeletedUserEmails().includes(cleanEmail)) return [];

        const forceRefresh = (typeof forceRefreshOrOpts === 'object' && forceRefreshOrOpts !== null)
            ? Boolean(forceRefreshOrOpts.forceRefresh)
            : Boolean(forceRefreshOrOpts);
        const prefetchedInquiries = (typeof forceRefreshOrOpts === 'object' && forceRefreshOrOpts !== null && Array.isArray(forceRefreshOrOpts.prefetchedInquiries))
            ? forceRefreshOrOpts.prefetchedInquiries
            : null;

        const cacheEntry = READ_CACHE.clientNotifications.get(cleanEmail);
        const now = Date.now();
        if (!forceRefresh && cacheEntry && cacheEntry.data && (now - cacheEntry.ts) < 1500) {
            return cacheEntry.data;
        }
        if (!forceRefresh && cacheEntry && cacheEntry.promise) {
            return cacheEntry.promise;
        }

        const runner = (async () => {
            const mapByKey = new Map();
            let inlineInquiries = null;

            // 1. Fetch authenticated notification feed and client's live inquiries in parallel
            const notifFetchPromise = (async () => {
                try {
                    const res = isLocalBackendReachableHost()
                        ? await localApiFetch(`/notifications?email=${encodeURIComponent(cleanEmail)}`, { method: 'GET' })
                        : await hostedApiFetch('/api/inquiries?action=notifications', { method: 'GET' });
                    if (res.ok) {
                        const body = await res.json().catch(() => []);
                        if (body && !Array.isArray(body) && Array.isArray(body.inquiries)) {
                            inlineInquiries = applyLocalInquiryState(body.inquiries);
                            READ_CACHE.myInquiries.set(cleanEmail, {
                                promise: null,
                                data: inlineInquiries,
                                ts: Date.now()
                            });
                        }
                        return extractApiArrayPayload(body, 'notifications');
                    }
                } catch (_) {}
                return [];
            })();

            const [serverRows, fetchedMyInquiries] = await Promise.all([
                notifFetchPromise,
                prefetchedInquiries
                    ? Promise.resolve(prefetchedInquiries)
                    : apiGetMyInquiries(cleanEmail, forceRefresh).catch(() => [])
            ]);
            const myInquiries = (inlineInquiries && inlineInquiries.length >= fetchedMyInquiries.length)
                ? inlineInquiries
                : fetchedMyInquiries;

            if (Array.isArray(serverRows)) {
                serverRows.forEach(r => {
                    const inqId = r.inquiry_id || r.reference_id || r.id;
                    const nType = (r.reference_type === 'inquiry' ? 'approved' : (r.type || 'approved')).toLowerCase();
                    const key = `${nType}_${inqId}`;
                    const createdMs = r.created_at ? new Date(r.created_at).getTime() : Date.now();
                    mapByKey.set(key, {
                        id: `srv_${r.id}`,
                        db_id: r.id,
                        notifKey: key,
                        type: nType,
                        inquiryId: inqId,
                        client_email: cleanEmail,
                        property_title: r.property_title || 'General Inquiry',
                        title: r.title || `Inquiry #${inqId} Approved!`,
                        message: r.message || `Your inquiry for "${r.property_title || 'General Inquiry'}" has been approved by Miriam Lobren!`,
                        is_read: Boolean(r.is_read),
                        is_seen: Boolean(r.is_seen),
                        created_at: r.created_at,
                        time: isNaN(createdMs) ? Date.now() : createdMs
                    });
                });
            }

            // 2. Local stored client notifications (offline fallback)
            try {
                const localNotifs = JSON.parse(localStorage.getItem(CLIENT_NOTIFS_KEY) || '[]');
                if (Array.isArray(localNotifs)) {
                    localNotifs.forEach(n => {
                        if (n && String(n.client_email || '').trim().toLowerCase() === cleanEmail) {
                            const key = n.notifKey || `approved_${n.inquiryId || n.id}`;
                            if (!mapByKey.has(key)) {
                                mapByKey.set(key, { ...n, notifKey: key });
                            }
                        }
                    });
                }
            } catch (_) {}

            // 3. Derive from client's live inquiries with 'Approved' status
            try {
                if (Array.isArray(myInquiries)) {
                    let localRead = [];
                    let localToasted = [];
                    try {
                        localRead = JSON.parse(localStorage.getItem('client_notifs_read_ids_' + cleanEmail) || '[]');
                        localToasted = JSON.parse(localStorage.getItem('client_notifs_toasted_' + cleanEmail) || '[]');
                    } catch (_) {}

                    myInquiries.forEach(inq => {
                        const s = String(inq.status || '').toLowerCase().trim();
                        if (s === 'approved' || s === 'scheduled') {
                            const key = `approved_${inq.id}`;
                            const propTitle = inq.property_title || inq.propertyTitle || 'General Consultation';
                            const code = inq.inquiry_code || `INQ-2026-${String(inq.id).padStart(3, '0')}`;
                            const ts = inq.updated_at || inq.created_at || new Date().toISOString();
                            const timeMs = new Date(ts).getTime();
                            const alreadyRead = localRead.includes(key);
                            const alreadySeen = alreadyRead || localToasted.includes(key);

                            if (!mapByKey.has(key)) {
                                mapByKey.set(key, {
                                    id: key,
                                    notifKey: key,
                                    type: 'approved',
                                    inquiryId: inq.id,
                                    client_email: cleanEmail,
                                    property_title: propTitle,
                                    title: `Inquiry ${code} Approved!`,
                                    message: `Your inquiry for "${propTitle}" has been approved by Miriam Lobren!`,
                                    is_read: alreadyRead,
                                    is_seen: alreadySeen,
                                    created_at: ts,
                                    time: isNaN(timeMs) ? Date.now() : timeMs
                                });
                            } else {
                                const existing = mapByKey.get(key);
                                if (existing && !existing.property_title && propTitle) {
                                    existing.property_title = propTitle;
                                }
                            }
                        }
                    });
                }
            } catch (_) {}

            // 4. Enforce referential integrity: any inquiry notification MUST belong to a live active inquiry
            const validInquiryIds = new Set();
            if (Array.isArray(myInquiries)) {
                myInquiries.forEach(inq => {
                    if (inq && inq.id != null) validInquiryIds.add(String(inq.id));
                    if (inq && inq.inquiry_id != null) validInquiryIds.add(String(inq.inquiry_id));
                });
            }

            const ghostKeys = [];
            mapByKey.forEach((notif, k) => {
                const isInquiryNotif = notif.inquiryId != null || notif.type === 'approved' || k.startsWith('approved_');
                if (isInquiryNotif) {
                    const rawId = String(notif.inquiryId != null ? notif.inquiryId : k.replace(/^approved_/, ''));
                    if (!validInquiryIds.has(rawId)) {
                        ghostKeys.push(k);
                    }
                }
            });

            if (ghostKeys.length > 0) {
                ghostKeys.forEach(k => mapByKey.delete(k));
                try {
                    const rawLocal = localStorage.getItem(CLIENT_NOTIFS_KEY);
                    if (rawLocal) {
                        const parsed = JSON.parse(rawLocal);
                        if (Array.isArray(parsed)) {
                            const cleaned = parsed.filter(n => {
                                if (!n) return false;
                                const nEmail = String(n.client_email || '').trim().toLowerCase();
                                if (nEmail === cleanEmail) {
                                    const rawId = String(n.inquiryId != null ? n.inquiryId : n.id || '').replace(/^approved_/, '');
                                    if (!validInquiryIds.has(rawId)) return false;
                                }
                                return true;
                            });
                            localStorage.setItem(CLIENT_NOTIFS_KEY, JSON.stringify(cleaned));
                        }
                    }
                } catch (_) {}
            }

            const result = Array.from(mapByKey.values());
            result.sort((a, b) => (b.time || 0) - (a.time || 0));
            READ_CACHE.clientNotifications.set(cleanEmail, { promise: null, data: result, ts: Date.now() });
            return result;
        })().finally(() => {
            const cur = READ_CACHE.clientNotifications.get(cleanEmail);
            if (cur && cur.promise === runner) cur.promise = null;
        });

        READ_CACHE.clientNotifications.set(cleanEmail, {
            promise: runner,
            data: cacheEntry ? cacheEntry.data : null,
            ts: cacheEntry ? cacheEntry.ts : 0
        });
        return runner;
    }

    async function apiMarkNotificationsRead(payload) {
        const data = payload || {};
        const email = (data.email || '').trim().toLowerCase();
        const inquiryId = data.inquiryId || data.inquiry_id;
        const rawInquiryIds = data.inquiryIds || data.inquiry_ids;
        const inquiryIds = Array.isArray(rawInquiryIds)
            ? rawInquiryIds.map(v => String(v || '').trim()).filter(v => /^\d+$/.test(v))
            : null;
        const notifId = data.notifId || data.id;

        if (Array.isArray(rawInquiryIds) && inquiryIds.length === 0) {
            return true;
        }

        try {
            if (isLocalBackendReachableHost()) {
                await localApiFetch('/notifications/read', {
                    method: 'POST',
                    body: JSON.stringify({ email, inquiry_id: inquiryId, inquiry_ids: inquiryIds || undefined, id: notifId, role: data.role })
                });
            } else {
                await hostedApiFetch('/api/inquiries', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'mark-notifications', mode: 'read', inquiry_id: inquiryId, inquiry_ids: inquiryIds || undefined, id: notifId, role: data.role })
                });
            }
        } catch (_) {}

        // Local sync
        if (email) {
            try {
                const readKey = 'client_notifs_read_ids_' + email;
                const readIds = JSON.parse(localStorage.getItem(readKey) || '[]');
                if (inquiryIds && inquiryIds.length > 0) {
                    inquiryIds.forEach(rawId => {
                        const k = 'approved_' + rawId;
                        if (!readIds.includes(k)) readIds.push(k);
                    });
                } else if (inquiryId) {
                    const k = 'approved_' + inquiryId;
                    if (!readIds.includes(k)) readIds.push(k);
                }
                localStorage.setItem(readKey, JSON.stringify(readIds));
            } catch (_) {}
        }

        invalidateReadCache('notifications');
        window.dispatchEvent(new CustomEvent('clientNotificationRead', { detail: payload }));
        return true;
    }

    async function apiMarkNotificationsSeen(payload) {
        const data = payload || {};
        const email = (data.email || '').trim().toLowerCase();
        const inquiryId = data.inquiryId || data.inquiry_id;
        const notifId = data.notifId || data.id;

        try {
            if (isLocalBackendReachableHost()) {
                await localApiFetch('/notifications/seen', {
                    method: 'POST',
                    body: JSON.stringify({ email, inquiry_id: inquiryId, id: notifId, role: data.role })
                });
            } else {
                await hostedApiFetch('/api/inquiries', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'mark-notifications', mode: 'seen', inquiry_id: inquiryId, id: notifId, role: data.role })
                });
            }
        } catch (_) {}

        // Local sync
        if (email) {
            try {
                const toastKey = 'client_notifs_toasted_' + email;
                const toastedIds = JSON.parse(localStorage.getItem(toastKey) || '[]');
                if (inquiryId) {
                    const k = 'approved_' + inquiryId;
                    if (!toastedIds.includes(k)) toastedIds.push(k);
                }
                localStorage.setItem(toastKey, JSON.stringify(toastedIds));
            } catch (_) {}
        }

        invalidateReadCache('notifications');
        return true;
    }

    async function apiSubmitInquiry(inquiry) {
        const isLocal = isLocalBackendReachableHost();
        const payload = {
            property_title: inquiry.property_title || inquiry.propertyTitle || 'General Inquiry',
            client_name: (inquiry.client_name || inquiry.clientName || 'Client').trim(),
            client_email: (inquiry.client_email || inquiry.clientEmail || '').trim(),
            client_phone: (inquiry.client_phone || inquiry.clientPhone || '').trim(),
            message: (inquiry.message || '').trim(),
            status: 'Under Review',
            ...buildBotFields(inquiry, isLocal)
        };

        const rawLookupTitle = String(payload.property_title || '').replace(/^specific\s+property\s+inquiry\s*:\s*/i, '');
        const inquiryTitleKey = rawLookupTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (inquiryTitleKey && !inquiryTitleKey.startsWith('general consultation') && !inquiryTitleKey.startsWith('general inquiry')) {
            try {
                const properties = await apiGetProperties();
                const matchedProperty = Array.isArray(properties) && properties.find(property => {
                    const titleKey = String(property.title || property.propertyName || property.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
                    return titleKey && (titleKey === inquiryTitleKey || titleKey.includes(inquiryTitleKey) || inquiryTitleKey.includes(titleKey));
                });
                const statusKey = String(matchedProperty?.status || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
                if (matchedProperty && (statusKey === 'sold' || statusKey === 'sold out')) {
                    return { success: false, error: 'This property is sold out and is no longer accepting inquiries.' };
                }
            } catch (err) {
                console.warn('Unable to verify property availability before inquiry:', err.message);
            }
        }

        let result = null;
        try {
            const res = isLocal
                ? await localApiFetch('/inquiries', { method: 'POST', body: JSON.stringify(payload) })
                : await hostedApiFetch('/api/inquiries', { method: 'POST', body: JSON.stringify({ action: 'create', ...payload }) });
            const body = await res.json().catch(() => ({}));
            if (res.ok && body.success !== false) {
                result = { success: true, data: body.data || body.inquiry || body };
            } else {
                return { success: false, error: body.detail || body.error || body.message || 'Unable to submit inquiry.' };
            }
        } catch (err) {
            return { success: false, error: err.message || 'Network error while submitting inquiry.' };
        }

        // Cache in localStorage & broadcast event for active admin listeners
        try {
            const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
            const record = result.data || {
                id: Date.now(),
                ...payload,
                created_at: new Date().toISOString()
            };
            cached.unshift(record);
            localStorage.setItem('inquiries', JSON.stringify(cached));
            invalidateReadCache('inquiries');
            window.dispatchEvent(new CustomEvent('inquirySubmitted', { detail: record }));
        } catch (_) {}

        return result;
    }

    async function apiGetInquiries(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && READ_CACHE.inquiries.data && (now - READ_CACHE.inquiries.ts) < 8000) {
            return READ_CACHE.inquiries.data;
        }
        if (!forceRefresh && READ_CACHE.inquiries.promise) {
            return READ_CACHE.inquiries.promise;
        }

        const runner = (async () => {
            let list = [];
            let unauthorized = false;

            try {
                const res = isLocalBackendReachableHost()
                    ? await localApiFetch('/inquiries', { method: 'GET' })
                    : await hostedApiFetch('/api/inquiries?action=all', { method: 'GET' });
                if (res.ok) {
                    const body = await res.json().catch(() => []);
                    const rows = extractApiArrayPayload(body, 'inquiries');
                    list = rows;
                } else if (res.status === 401 || res.status === 403) {
                    unauthorized = true;
                }
            } catch (err) {
                console.warn('Inquiries fetch notice:', err.message || err);
            }

            if (unauthorized) {
                return [];
            }

            if (!list.length && typeof location !== 'undefined' && location.protocol === 'file:') {
                try {
                    const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
                    if (Array.isArray(cached) && cached.length > 0) {
                        list = cached;
                    }
                } catch (_) {}
            }

            list = applyLocalInquiryState(list);

            try {
                const nextListJson = JSON.stringify(list);
                if (localStorage.getItem('inquiries') !== nextListJson) {
                    localStorage.setItem('inquiries', nextListJson);
                }
            } catch (_) {}
            READ_CACHE.inquiries.data = list;
            READ_CACHE.inquiries.ts = Date.now();
            return list;
        })().finally(() => {
            if (READ_CACHE.inquiries.promise === runner) {
                READ_CACHE.inquiries.promise = null;
            }
        });

        READ_CACHE.inquiries.promise = runner;
        return runner;
    }

    async function apiUpdateInquiryStatus(id, newStatus) {
        let updated = false;
        const nowIso = new Date().toISOString();
        const isCancelling = String(newStatus || '').toLowerCase().trim() === 'cancelled';
        const cancelledBy = isCancelling ? 'admin' : null;

        try {
            if (isLocalBackendReachableHost()) {
                const res = await localApiFetch(`/inquiries/${encodeURIComponent(id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: newStatus, cancelled_by: cancelledBy })
                });
                if (res.ok) updated = true;
            } else {
                const res = await hostedApiFetch('/api/inquiries', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'update-status', id, status: newStatus, cancelled_by: cancelledBy })
                });
                if (res.ok) updated = true;
            }
        } catch (e) {
            console.warn('Inquiry status update notice:', e);
        }

        if (!updated) return false;

        setInquiryCancelledBy(id, cancelledBy);

        // Update localStorage cache & overrides after confirmed server mutation
        let targetInquiry = null;
        try {
            const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
            const idx = cached.findIndex(i => String(i.id) === String(id));
            if (idx !== -1) {
                cached[idx].status = newStatus;
                cached[idx].cancelled_by = cancelledBy;
                cached[idx].updated_at = nowIso;
                targetInquiry = cached[idx];
                localStorage.setItem('inquiries', JSON.stringify(cached));
            }
        } catch (_) {}

        saveInquiryOverride(id, { status: newStatus, cancelled_by: cancelledBy, updated_at: nowIso });

        if (String(newStatus || '').toLowerCase().trim() === 'approved') {
            try {
                const existingRead = JSON.parse(localStorage.getItem("admin_notifs_read_ids") || "[]");
                const readSet = new Set(Array.isArray(existingRead) ? existingRead.map(String) : []);
                readSet.add(String(id));
                readSet.add(`new_inquiry_${id}`);
                readSet.add(`approved_${id}`);
                localStorage.setItem("admin_notifs_read_ids", JSON.stringify(Array.from(readSet)));
            } catch (_) {}

            if (!targetInquiry) {
                try {
                    const all = await apiGetInquiries();
                    if (Array.isArray(all)) {
                        targetInquiry = all.find(i => String(i.id) === String(id));
                    }
                } catch (_) {}
            }
            if (targetInquiry) {
                const clientEmail = (targetInquiry.client_email || targetInquiry.email || '').trim().toLowerCase();
                const propTitle = targetInquiry.property_title || targetInquiry.propertyTitle || 'General Consultation';
                const code = targetInquiry.inquiry_code || `INQ-2026-${String(id).padStart(3, '0')}`;
                const notifTitle = `Inquiry ${code} Approved!`;
                const notifMsg = `Your inquiry for "${propTitle}" has been approved by Miriam Lobren!`;
                pushClientNotification({
                    id: `approved_${id}_${Date.now()}`,
                    notifKey: `approved_${id}`,
                    type: 'approved',
                    inquiryId: id,
                    client_email: clientEmail,
                    property_title: propTitle,
                    title: notifTitle,
                    message: notifMsg,
                    is_read: false,
                    is_seen: false,
                    created_at: nowIso,
                    time: Date.now()
                });
            }
        }

        invalidateReadCache('inquiries');
        window.dispatchEvent(new CustomEvent('inquiryStatusChanged', { detail: { id, status: newStatus } }));
        window.dispatchEvent(new CustomEvent('inquiriesUpdated', { detail: { id, status: newStatus } }));
        try {
            if (typeof BroadcastChannel === 'function') {
                const bc = new BroadcastChannel('urbanscope_notifications');
                bc.postMessage({
                    type: 'inquiry-status-changed',
                    id,
                    status: newStatus,
                    clientEmail: targetInquiry ? (targetInquiry.client_email || targetInquiry.email || '').trim().toLowerCase() : ''
                });
                bc.close();
            }
        } catch (_) {}

        return updated;
    }

    async function apiGetMyInquiries(email, forceRefresh = false) {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!cleanEmail || getDeletedUserEmails().includes(cleanEmail)) return [];

        const entry = READ_CACHE.myInquiries.get(cleanEmail);
        const now = Date.now();
        if (!forceRefresh && entry && entry.data && (now - entry.ts) < 2000) {
            return entry.data;
        }
        if (!forceRefresh && entry && entry.promise) {
            return entry.promise;
        }

        const runner = (async () => {
            let list = [];
            let unauthorized = false;

            try {
                const res = isLocalBackendReachableHost()
                    ? await localApiFetch(cleanEmail ? `/inquiries/my?email=${encodeURIComponent(cleanEmail)}` : '/inquiries/my', { method: 'GET' })
                    : await hostedApiFetch('/api/inquiries?action=my', { method: 'GET' });
                if (res.ok) {
                    const body = await res.json().catch(() => []);
                    const rows = extractApiArrayPayload(body, 'inquiries');
                    list = rows;
                } else if (res.status === 401 || res.status === 403) {
                    unauthorized = true;
                }
            } catch (e) {}

            if (unauthorized) {
                return [];
            }

            if (!list.length && cleanEmail && typeof location !== 'undefined' && location.protocol === 'file:') {
                try {
                    const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
                    if (Array.isArray(cached) && cached.length > 0) {
                        list = cached.filter(i => {
                            if (!i) return false;
                            const itemEmail = (i.client_email || i.clientEmail || '').trim().toLowerCase();
                            if (itemEmail.startsWith('deleted_')) return false;
                            return itemEmail === cleanEmail;
                        });
                    }
                } catch (_) {}
            }

            list = applyLocalInquiryState(list);
            READ_CACHE.myInquiries.set(cleanEmail, { promise: null, data: list, ts: Date.now() });
            return list;
        })().catch((err) => {
            const cur = READ_CACHE.myInquiries.get(cleanEmail);
            if (cur && cur.promise === runner) cur.promise = null;
            throw err;
        });

        READ_CACHE.myInquiries.set(cleanEmail, {
            promise: runner,
            data: entry ? entry.data : null,
            ts: entry ? entry.ts : 0
        });
        return runner;
    }

    async function apiUpdateMyInquiry(id, updates, email) {
        let updated = false;
        let updatedRecord = null;
        const cleanEmail = (email || '').trim().toLowerCase();
        const nowIso = new Date().toISOString();
        const payload = { ...updates };

        // Guard: prevent modifying details if already approved (unless cancelling)
        const isCancelling = String(updates.status || '').toLowerCase().trim() === 'cancelled';
        if (!isCancelling) {
            try {
                const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
                const overrides = getInquiryOverrides();
                const match = cached.find(i => String(i.id) === String(id));
                const currentStatus = String(
                    (overrides[String(id)] && overrides[String(id)].status) ||
                    (match && match.status) ||
                    'Under Review'
                ).toLowerCase().trim();
                if (currentStatus && currentStatus !== 'under review' && currentStatus !== 'pending') {
                    return { success: false, error: 'Approved or processed inquiries can no longer be modified.' };
                }
            } catch (_) {}
        }

        try {
            const res = isLocalBackendReachableHost()
                ? await localApiFetch(`/inquiries/${encodeURIComponent(id)}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                })
                : await hostedApiFetch('/api/inquiries', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'update-my', id, ...payload })
                });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success !== false) {
                updated = true;
                updatedRecord = data.data || data.inquiry || data;
            } else {
                return { success: false, error: data.detail || data.error || 'Unable to update inquiry.' };
            }
        } catch (e) {
            return { success: false, error: e.message || 'Unable to reach inquiry service.' };
        }

        // Update localStorage cache & overrides
        try {
            const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
            const idx = cached.findIndex(i => String(i.id) === String(id));
            if (idx !== -1) {
                cached[idx] = { ...cached[idx], ...updates, updated_at: nowIso };
                localStorage.setItem('inquiries', JSON.stringify(cached));
                if (!updatedRecord) updatedRecord = cached[idx];
            }
        } catch (_) {}

        saveInquiryOverride(id, { ...updates, updated_at: nowIso });
        invalidateReadCache('inquiries');

        return { success: updated, data: updatedRecord };
    }

    async function apiDeleteMyInquiry(id, email, itemHint = null) {
        let deleted = false;
        const cleanEmail = (email || '').trim().toLowerCase();

        // Capture inquiry info before deleting so we can notify admin
        let targetInq = itemHint;
        try {
            const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
            if (!targetInq && Array.isArray(cached)) {
                targetInq = cached.find(i => String(i.id) === String(id)) || null;
            }
        } catch (_) {}

        try {
            const res = isLocalBackendReachableHost()
                ? await localApiFetch(`/inquiries/${encodeURIComponent(id)}`, { method: 'DELETE' })
                : await hostedApiFetch('/api/inquiries', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'delete-my', id })
                });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success !== false) {
                deleted = true;
            } else {
                return { success: false, error: data.detail || data.error || 'Unable to delete inquiry.' };
            }
        } catch (e) {
            return { success: false, error: e.message || 'Unable to delete inquiry.' };
        }

        // Remove from localStorage cache & mark deleted
        markInquiryDeletedLocal(id);
        try {
            const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
            const filtered = cached.filter(i => String(i.id) !== String(id));
            localStorage.setItem('inquiries', JSON.stringify(filtered));
        } catch (_) {}

        // Notify admin that the client cancelled/removed the inquiry
        const code = (targetInq && targetInq.inquiry_code) || `INQ-2026-${String(id).padStart(3, '0')}`;
        const clientName = (targetInq && (targetInq.client_name || targetInq.name)) || cleanEmail.split('@')[0] || 'Client';
        const propTitle = (targetInq && (targetInq.property_title || targetInq.propertyTitle)) || 'General Inquiry';

        pushAdminEventNotification({
            id: `delete_${id}_${Date.now()}`,
            notifKey: `deleted_${id}`,
            type: 'cancelled',
            avatarClass: 'cancel',
            avatarIcon: '✕',
            inquiryId: id,
            client_name: clientName,
            property_title: propTitle,
            title: `Inquiry ${code} cancelled by ${clientName}`,
            subtitle: propTitle,
            created_at: new Date().toISOString(),
            time: Date.now()
        });

        invalidateReadCache('inquiries');
        window.dispatchEvent(new CustomEvent('inquiryCancelled', { detail: { id, clientName, propTitle } }));
        window.dispatchEvent(new CustomEvent('inquiryStatusChanged', { detail: { id, status: 'Cancelled' } }));
        window.dispatchEvent(new CustomEvent('inquiriesUpdated', { detail: { id, status: 'Deleted' } }));

        return { success: deleted };
    }

    async function apiCancelMyInquiry(id, email, itemHint = null) {
        const cleanEmail = (email || '').trim().toLowerCase();
        let targetInq = itemHint;
        try {
            const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
            if (!targetInq && Array.isArray(cached)) {
                targetInq = cached.find(i => String(i.id) === String(id)) || null;
            }
        } catch (_) {}

        let res;
        if (isLocalBackendReachableHost()) {
            res = await apiUpdateMyInquiry(id, { status: 'Cancelled', cancelled_by: 'client' }, email);
        } else {
            try {
                const hostedRes = await hostedApiFetch('/api/inquiries', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'cancel-my', id })
                });
                const body = await hostedRes.json().catch(() => ({}));
                res = hostedRes.ok && body.success !== false
                    ? { success: true, data: body.data || body }
                    : { success: false, error: body.error || 'Unable to cancel inquiry.' };
                if (res.success) {
                    saveInquiryOverride(id, { status: 'Cancelled', cancelled_by: 'client', updated_at: new Date().toISOString() });
                }
            } catch (e) {
                res = { success: false, error: e.message || 'Unable to cancel inquiry.' };
            }
        }

        if (res && res.success) {
            setInquiryCancelledBy(id, 'client');
            const code = (targetInq && targetInq.inquiry_code) || `INQ-2026-${String(id).padStart(3, '0')}`;
            const clientName = (targetInq && (targetInq.client_name || targetInq.name)) || cleanEmail.split('@')[0] || 'Client';
            const propTitle = (targetInq && (targetInq.property_title || targetInq.propertyTitle)) || 'General Inquiry';

            pushAdminEventNotification({
                id: `cancel_${id}_${Date.now()}`,
                notifKey: `cancelled_${id}`,
                type: 'cancelled',
                avatarClass: 'cancel',
                avatarIcon: '✕',
                inquiryId: id,
                client_name: clientName,
                property_title: propTitle,
                title: `Inquiry ${code} cancelled by ${clientName}`,
                subtitle: propTitle,
                created_at: new Date().toISOString(),
                time: Date.now()
            });

            invalidateReadCache('inquiries');
            window.dispatchEvent(new CustomEvent('inquiryCancelled', { detail: { id, clientName, propTitle } }));
            window.dispatchEvent(new CustomEvent('inquiryStatusChanged', { detail: { id, status: 'Cancelled' } }));
            window.dispatchEvent(new CustomEvent('inquiriesUpdated', { detail: { id, status: 'Cancelled' } }));
        }
        return res;
    }


    // ----------------------------------------------------------
    // 4. AUTHENTICATION, SUPERADMIN RBAC & USER SERVICES
    // ----------------------------------------------------------
    const DELETED_USERS_KEY = 'urbanscope_deleted_user_ids';
    const DELETED_USER_EMAILS_KEY = 'urbanscope_deleted_user_emails';
    const SOFT_DELETE_BIO_MARKER = '__URBANSCOPE_DELETED__';
    const SOFT_DELETE_HASH_MARKER = '__DELETED_ACCOUNT__';

    function getDeletedUserIds() {
        try {
            const arr = JSON.parse(localStorage.getItem(DELETED_USERS_KEY) || '[]');
            return Array.isArray(arr) ? arr.map(String) : [];
        } catch (_) {
            return [];
        }
    }

    function getDeletedUserEmails() {
        try {
            const arr = JSON.parse(localStorage.getItem(DELETED_USER_EMAILS_KEY) || '[]');
            return Array.isArray(arr) ? arr.map(e => String(e || '').trim().toLowerCase()) : [];
        } catch (_) {
            return [];
        }
    }

    function markUserDeletedLocal(id, email) {
        try {
            if (id !== undefined && id !== null && id !== '') {
                const ids = new Set(getDeletedUserIds());
                ids.add(String(id));
                localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(Array.from(ids)));
            }
            const cleanEmail = String(email || '').trim().toLowerCase();
            if (cleanEmail) {
                const emails = new Set(getDeletedUserEmails());
                emails.add(cleanEmail);
                localStorage.setItem(DELETED_USER_EMAILS_KEY, JSON.stringify(Array.from(emails)));
            }
        } catch (_) {}
    }

    function clearUserDeletedLocal(id, email) {
        try {
            if (id !== undefined && id !== null && id !== '') {
                const filteredIds = getDeletedUserIds().filter(x => x !== String(id));
                localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(filteredIds));
            }
            const cleanEmail = String(email || '').trim().toLowerCase();
            if (cleanEmail) {
                const filteredEmails = getDeletedUserEmails().filter(e => e !== cleanEmail);
                localStorage.setItem(DELETED_USER_EMAILS_KEY, JSON.stringify(filteredEmails));
            }
        } catch (_) {}
    }

    function isUserRecordDeleted(u) {
        if (!u) return true;
        if (String(u.bio || '').trim() === SOFT_DELETE_BIO_MARKER) return true;
        if (String(u.password_hash || '').trim() === SOFT_DELETE_HASH_MARKER) return true;
        const cleanEmail = String(u.email || '').trim().toLowerCase();
        if (cleanEmail.startsWith('deleted_')) return true;
        const deletedIds = new Set(getDeletedUserIds());
        const deletedEmails = new Set(getDeletedUserEmails());
        if (u.id !== undefined && deletedIds.has(String(u.id))) return true;
        if (cleanEmail && deletedEmails.has(cleanEmail)) return true;
        return false;
    }

    function purgeInquiriesByEmailLocal(email, userId) {
        const clean = String(email || '').trim().toLowerCase();
        const strId = String(userId || '').trim();
        const inqKeys = ['inquiries', 'cached_live_inquiries', 'urbanScopeInquiries'];
        inqKeys.forEach(k => {
            try {
                const raw = localStorage.getItem(k);
                if (raw) {
                    const list = JSON.parse(raw);
                    if (Array.isArray(list)) {
                        const filtered = list.filter(item => {
                            if (!item) return false;
                            const itemEmail = String(item.client_email || item.clientEmail || '').trim().toLowerCase();
                            const itemClientId = String(item.client_id || item.clientId || '').trim();
                            if (clean && itemEmail === clean) return false;
                            if (strId && itemClientId === strId) return false;
                            if (itemEmail.startsWith('deleted_')) return false;
                            return true;
                        });
                        localStorage.setItem(k, JSON.stringify(filtered));
                    }
                }
            } catch (_) {}
        });

        // Purge client notifications from localStorage
        try {
            const rawNotifs = localStorage.getItem(CLIENT_NOTIFS_KEY);
            if (rawNotifs) {
                const nList = JSON.parse(rawNotifs);
                if (Array.isArray(nList)) {
                    const filteredNotifs = nList.filter(n => {
                        if (!n) return false;
                        const nEmail = String(n.client_email || '').trim().toLowerCase();
                        if (clean && nEmail === clean) return false;
                        if (nEmail.startsWith('deleted_')) return false;
                        return true;
                    });
                    localStorage.setItem(CLIENT_NOTIFS_KEY, JSON.stringify(filteredNotifs));
                }
            }
        } catch (_) {}

        // Remove per-user read/toasted tracking keys
        if (clean) {
            try {
                localStorage.removeItem('client_notifs_read_ids_' + clean);
                localStorage.removeItem('client_notifs_toasted_' + clean);
                localStorage.removeItem('client_notifs_unread_' + clean);
                localStorage.removeItem('client_notifications_' + clean);
                localStorage.removeItem('urbanscope_client_notifications_' + clean);
                localStorage.removeItem('urbanscope_inquiry_overrides_' + clean);
            } catch (_) {}
        }

        try {
            window.dispatchEvent(new CustomEvent('clientNotificationsUpdated', { detail: { email: clean } }));
            window.dispatchEvent(new CustomEvent('inquiriesUpdated', { detail: { email: clean, purged: true } }));
            window.dispatchEvent(new CustomEvent('inquiryListChanged', { detail: { email: clean } }));
        } catch (_) {}
    }

    function normalizeHasPassword(u) {
        return (u && u.has_password !== undefined && u.has_password !== null)
            ? Boolean(u.has_password)
            : true;
    }

    function formatUserRecord(u) {
        if (!u) return null;
        const googleConnected = Boolean(u.google_connected);
        return {
            ...u,
            role: normalizeAccountRole(u.role, u.email),
            has_password: normalizeHasPassword(u),
            google_connected: googleConnected,
            google_email: googleConnected ? String(u.google_email || u.email || '').trim().toLowerCase() : ''
        };
    }

    function buildSessionUserFromApi(u, fallbacks = {}) {
        const email = (u && u.email) || fallbacks.email || '';
        const fullName = (u && (u.full_name || u.name)) || fallbacks.full_name || fallbacks.name || email.split('@')[0];
        const phone = (u && u.phone !== undefined) ? (u.phone || '') : (fallbacks.phone || '');
        const role = normalizeAccountRole(u && u.role, email);
        const avatar = sanitizeImageUrl((u && u.avatar_url) || fallbacks.avatar_url || '', '');
        const hasPassword = (u && u.has_password !== undefined && u.has_password !== null)
            ? Boolean(u.has_password)
            : (fallbacks.has_password !== undefined && fallbacks.has_password !== null ? Boolean(fallbacks.has_password) : true);
        const googleConnected = (u && u.google_connected !== undefined)
            ? Boolean(u.google_connected)
            : Boolean(fallbacks.google_connected);
        const rawGoogleEmail = (u && u.google_email) || fallbacks.google_email || '';
        const googleEmail = googleConnected ? String(rawGoogleEmail || email).trim().toLowerCase() : '';
        return {
            id: (u && u.id !== undefined) ? u.id : fallbacks.id,
            email,
            name: fullName,
            full_name: fullName,
            phone,
            role,
            avatar_url: avatar,
            has_password: hasPassword,
            google_connected: googleConnected,
            google_email: googleEmail,
            user_metadata: {
                full_name: fullName,
                phone,
                avatar_url: avatar
            }
        };
    }

    function syncCachedClientUserState(userObj) {
        if (!userObj) return;
        try {
            localStorage.setItem(USER_KEY, JSON.stringify(userObj));
            localStorage.setItem(DEMO_KEY, JSON.stringify(userObj));
        } catch (_) {}
        READ_CACHE.currentUser = { promise: null, data: userObj, ts: Date.now(), hasValue: true };
        try {
            window.dispatchEvent(new CustomEvent('urbanscope:clientProfileUpdated', { detail: userObj }));
        } catch (_) {}
    }

    async function apiGetUsers() {
        try {
            if (isLocalBackendReachableHost()) {
                let localRes = await localApiFetch('/superadmin/users', { method: 'GET' });
                if (!localRes.ok) {
                    localRes = await localApiFetch('/users', { method: 'GET' });
                }
                if (localRes.ok) {
                    const body = await localRes.json().catch(() => []);
                    const list = Array.isArray(body) ? body : (Array.isArray(body?.users) ? body.users : []);
                    return list.filter(u => !isUserRecordDeleted(u)).map(formatUserRecord);
                }
            } else {
                const res = await hostedApiFetch('/api/superadmin/users', { method: 'GET' });
                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    const list = extractApiArrayPayload(data, 'users');
                    return list.filter(u => !isUserRecordDeleted(u)).map(formatUserRecord);
                }
            }
        } catch (err) {
            console.warn('Users directory fetch notice:', err.message || err);
        }

        return [];
    }

    async function apiGetSuperadminUsers(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && READ_CACHE.superadminUsers.data && (now - READ_CACHE.superadminUsers.ts) < 5000) {
            return READ_CACHE.superadminUsers.data;
        }
        if (!forceRefresh && READ_CACHE.superadminUsers.promise) {
            return READ_CACHE.superadminUsers.promise;
        }

        const runner = (async () => {
            let users = null;

            try {
                const res = isLocalBackendReachableHost()
                    ? await localApiFetch('/superadmin/users', { method: 'GET' }, 4500)
                    : await hostedApiFetch('/api/superadmin/users', { method: 'GET' }, 8000);
                if (res.ok) {
                    const body = await res.json().catch(() => []);
                    const list = extractApiArrayPayload(body, 'users', null);
                    if (Array.isArray(list)) users = list;
                } else if (res.status === 401 || res.status === 403) {
                    return [];
                }
            } catch (err) {
                console.warn('Superadmin users fetch notice:', err.message || err);
            }

            if (Array.isArray(users)) {
                const cleaned = users
                    .filter(u => !isUserRecordDeleted(u))
                    .map(formatUserRecord)
                    .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));

                READ_CACHE.superadminUsers.data = cleaned;
                READ_CACHE.superadminUsers.ts = Date.now();
                return cleaned;
            }

            return [];
        })().finally(() => {
            if (READ_CACHE.superadminUsers.promise === runner) {
                READ_CACHE.superadminUsers.promise = null;
            }
        });

        READ_CACHE.superadminUsers.promise = runner;
        return runner;
    }

    async function apiGetSuperadminOverview() {
        // 1. Try local FastAPI backend when running on local dev host (non-HTTPS)
        if (isLocalBackendReachableHost()) {
            try {
                const localRes = await localApiFetch('/superadmin/overview', { method: 'GET' }, 4500);
                if (localRes.ok) {
                    const data = await localRes.json();
                    if (data && data.metrics) {
                        return { ...data, engine: 'sqlite' };
                    }
                }
            } catch (_) {}
        }

        // 2. Compute live executive metrics from authenticated API endpoints
        const [usersList, propsList, inqList] = await Promise.all([
            apiGetSuperadminUsers().catch(() => []),
            apiGetProperties({ type: 'all' }).catch(() => []),
            apiGetInquiries().catch(() => [])
        ]);

        const users = Array.isArray(usersList) ? usersList : [];
        const props = Array.isArray(propsList) ? propsList : [];
        const inquiries = Array.isArray(inqList) ? inqList : [];

        let superadminCount = 0;
        let adminCount = 0;
        let regularCount = 0;

        users.forEach(u => {
            const r = normalizeAccountRole(u.role, u.email);
            if (r === 'superadmin') superadminCount++;
            else if (r === 'admin') adminCount++;
            else regularCount++;
        });

        const availableProps = props.filter(p => String(p.status || 'Available').trim().toLowerCase() === 'available').length;
        const soldProps = props.filter(p => String(p.status || '').trim().toLowerCase() === 'sold').length;

        const pendingInq = inquiries.filter(i => {
            const s = String(i.status || 'Under Review').toLowerCase();
            return s.includes('review') || s.includes('pending') || s === 'submitted';
        }).length;

        const approvedInq = inquiries.filter(i => String(i.status || '').toLowerCase().includes('approved')).length;

        let estimatedSizeKb = 64.0;
        try {
            const rawBytes = JSON.stringify({ users, props, inquiries }).length;
            estimatedSizeKb = Math.max(48.0, Math.round(((rawBytes + 32768) / 1024) * 10) / 10);
        } catch (_) {}

        return {
            status: 'operational',
            engine: 'supabase',
            superadmin_email: 'miriamalobren@gmail.com',
            metrics: {
                total_users: users.length,
                superadmins: superadminCount,
                admins: adminCount,
                regular_users: regularCount,
                total_properties: props.length,
                available_properties: availableProps,
                sold_properties: soldProps,
                total_inquiries: inquiries.length,
                pending_inquiries: pendingInq,
                approved_inquiries: approvedInq,
                db_size_kb: estimatedSizeKb,
                trigger_active: true
            }
        };
    }

    async function apiSuperadminCreateUser(payload = {}) {
        const cleanName = String(payload.full_name || '').trim();
        const cleanEmail = String(payload.email || '').trim().toLowerCase();
        const cleanPhone = String(payload.phone || '').trim();
        const plainPassword = String(payload.password || '');
        const rawRole = String(payload.role || 'user').trim().toLowerCase();
        if (rawRole !== 'user' && rawRole !== 'client') {
            return { success: false, error: 'Role promotion is disabled. New accounts are always created as Client Users.' };
        }
        const assignedRole = cleanEmail === 'miriamalobren@gmail.com' ? 'admin' : 'user';

        if (!cleanName || !cleanEmail) {
            return { success: false, error: 'Full name and email address are required.' };
        }
        if (plainPassword.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters long.' };
        }

        if (!isLocalBackendReachableHost()) {
            try {
                const response = await hostedApiFetch('/api/superadmin/users', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'create', payload: { full_name: cleanName, email: cleanEmail, phone: cleanPhone, password: plainPassword, role: assignedRole } })
                }, 10000);
                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result.success) return { success: false, error: result.error || 'Failed to create account.' };
                clearUserDeletedLocal(result.user && result.user.id, cleanEmail);
                invalidateReadCache('users');
                return { ...result, user: formatUserRecord(result.user) };
            } catch (error) {
                return { success: false, error: error.message || 'Unable to reach account management.' };
            }
        }

        try {
            const localRes = await localApiFetch('/superadmin/users', {
                method: 'POST',
                body: JSON.stringify({
                    full_name: cleanName,
                    email: cleanEmail,
                    phone: cleanPhone,
                    password: plainPassword,
                    role: assignedRole
                })
            });
            const localData = await localRes.json().catch(() => ({}));
            if (!localRes.ok || !localData.success) {
                return { success: false, error: localData.detail || localData.error || 'Failed to create account.' };
            }
            const createdUser = localData.user || null;
            clearUserDeletedLocal(createdUser && createdUser.id, cleanEmail);
            invalidateReadCache('users');
            return {
                success: true,
                message: 'Account created successfully.',
                user: formatUserRecord(createdUser)
            };
        } catch (localErr) {
            return { success: false, error: localErr.message || 'Unable to create account on backend server.' };
        }
    }

    async function apiSuperadminUpdateUser(userId, payload = {}) {
        const cleanName = payload.full_name !== undefined ? String(payload.full_name).trim() : undefined;
        const cleanEmail = payload.email !== undefined ? String(payload.email).trim().toLowerCase() : undefined;
        const originalEmail = String(payload.original_email || cleanEmail || '').trim().toLowerCase();
        const cleanPhone = payload.phone !== undefined ? String(payload.phone).trim() : undefined;
        const rawRole = payload.role !== undefined ? String(payload.role).trim().toLowerCase() : undefined;
        const rawPassword = payload.password ? String(payload.password).trim() : '';

        if (originalEmail === 'miriamalobren@gmail.com') {
            if (cleanEmail && cleanEmail !== 'miriamalobren@gmail.com') {
                return { success: false, error: 'The main administrator email address cannot be changed.' };
            }
            if (rawRole && rawRole !== 'admin') {
                return { success: false, error: 'The main administrator account cannot be demoted.' };
            }
        } else if (cleanEmail === 'miriamalobren@gmail.com') {
            return { success: false, error: 'That email address is reserved for the main administrator account.' };
        }

        const targetEmailForRole = cleanEmail || originalEmail;
        const expectedRole = targetEmailForRole === 'miriamalobren@gmail.com' ? 'admin' : 'user';
        if (rawRole !== undefined) {
            if (!['user', 'client', 'admin', 'superadmin'].includes(rawRole)) {
                return { success: false, error: "Invalid role. Must be 'user' or 'admin'." };
            }
            const normalizedReq = rawRole === 'client' ? 'user' : rawRole;
            if (normalizedReq !== expectedRole) {
                return { success: false, error: 'Role promotion and demotion are disabled. Only miriamalobren@gmail.com holds the Realty Admin role.' };
            }
        }
        if (rawPassword && rawPassword.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters long.' };
        }

        if (!isLocalBackendReachableHost()) {
            try {
                const { role: _ignoredRole, ...safePayload } = payload || {};
                const response = await hostedApiFetch('/api/superadmin/users', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'update', user_id: userId, payload: safePayload })
                }, 10000);
                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result.success) return { success: false, error: result.error || 'Failed to update user account.' };
                clearUserDeletedLocal(result.user && result.user.id, result.user && result.user.email);
                invalidateReadCache('users');
                return { ...result, user: formatUserRecord(result.user) };
            } catch (error) {
                return { success: false, error: error.message || 'Unable to reach account management.' };
            }
        }

        try {
            const localBody = {};
            if (cleanName) localBody.full_name = cleanName;
            if (cleanEmail) localBody.email = cleanEmail;
            if (cleanPhone !== undefined) localBody.phone = cleanPhone;
            if (rawPassword) localBody.password = rawPassword;

            const localRes = await localApiFetch(`/superadmin/users/${encodeURIComponent(userId)}`, {
                method: 'PUT',
                body: JSON.stringify(localBody)
            });
            const localData = await localRes.json().catch(() => ({}));
            if (!localRes.ok || !localData.success) {
                return { success: false, error: localData.detail || localData.error || 'Failed to update user account.' };
            }
            invalidateReadCache('users');
            return {
                success: true,
                message: 'User account updated successfully.',
                user: formatUserRecord(localData.user)
            };
        } catch (localErr) {
            return { success: false, error: localErr.message || 'Network error while updating user account.' };
        }
    }

    async function apiSuperadminUpdateUserRole(_userId, _newRole, _email = '') {
        return {
            success: false,
            error: 'Role promotion and demotion are disabled. Only miriamalobren@gmail.com holds the Realty Admin role.'
        };
    }

    async function apiSuperadminDeleteUser(userId, email = '') {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const rawUserId = userId !== undefined && userId !== null ? String(userId).trim() : '';

        if (!rawUserId && !cleanEmail) {
            return { success: false, error: 'User ID or email is required.' };
        }
        if (cleanEmail === 'miriamalobren@gmail.com') {
            return { success: false, error: 'Cannot delete the main Realty Admin account.' };
        }

        let deleted = false;
        let errMsg = '';
        const isLocalBackend = isLocalBackendReachableHost();

        if (isLocalBackend) {
            try {
                const localRes = await localApiFetch(`/superadmin/users/${encodeURIComponent(rawUserId || cleanEmail)}`, {
                    method: 'DELETE'
                }, 8000);
                const localData = await localRes.json().catch(() => ({}));
                if (localRes.ok && localData.success) {
                    deleted = true;
                } else {
                    errMsg = localData.detail || localData.error || 'Failed to delete account.';
                }
            } catch (localErr) {
                errMsg = localErr.message || 'Unable to reach local backend.';
            }
        } else {
            try {
                const hostedRes = await hostedApiFetch('/api/superadmin/users', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'delete',
                        user_id: userId,
                        payload: { email: cleanEmail }
                    })
                }, 10000);
                const hostedData = await hostedRes.json().catch(() => ({}));
                if (hostedRes.ok && hostedData.success) {
                    deleted = true;
                } else {
                    errMsg = hostedData.error || `Server returned status ${hostedRes.status}.`;
                }
            } catch (hostedErr) {
                errMsg = (hostedErr && hostedErr.message) || 'Unable to reach hosted account management.';
            }
        }

        if (!deleted) {
            return {
                success: false,
                error: errMsg || 'Unable to delete account. Please verify your permissions and try again.'
            };
        }

        // Update local tracking of deleted accounts
        markUserDeletedLocal(userId, cleanEmail);
        invalidateReadCache('users');
        invalidateReadCache('inquiries');

        // Purge deleted inquiries from local caches
        purgeInquiriesByEmailLocal(cleanEmail, userId);

        // Dispatch events so all open admin and inquiry tabs re-render immediately
        try {
            window.dispatchEvent(new CustomEvent('inquiriesUpdated', { detail: { email: cleanEmail, status: 'Deleted' } }));
            window.dispatchEvent(new CustomEvent('inquiryListChanged', { detail: { email: cleanEmail } }));
            window.dispatchEvent(new CustomEvent('usersUpdated', { detail: { id: userId, email: cleanEmail, deleted: true } }));
        } catch (_) {}

        return {
            success: true,
            message: `User account ${cleanEmail || '#' + userId} and associated inquiry history deleted successfully.`
        };
    }

    async function apiRunSuperadminIntegrityCheck() {
        // 1. Try local SQLite PRAGMA integrity check on local dev host
        if (isLocalBackendReachableHost()) {
            try {
                const localRes = await localApiFetch('/superadmin/integrity', { method: 'GET' }, 4500);
                if (localRes.ok) {
                    const data = await localRes.json();
                    return { ...data, engine: 'sqlite' };
                }
            } catch (_) {}
        }

        // 2. Hosted relational & RBAC governance verification via authenticated endpoints
        try {
            const [users, props, inquiries] = await Promise.all([
                apiGetSuperadminUsers(),
                apiGetProperties({ type: 'all' }),
                apiGetInquiries()
            ]);

            if (!Array.isArray(users) || !Array.isArray(props) || !Array.isArray(inquiries)) {
                return {
                    success: false,
                    engine: 'supabase',
                    integrity: 'Unable to fetch governance data',
                    foreign_key_violations: 0,
                    trigger_active: false,
                    table_count: 12
                };
            }

            const userIds = new Set(users.map(u => Number(u.id)));
            const propIds = new Set(props.map(p => Number(p.id)));

            let fkViolations = 0;
            props.forEach(p => {
                if (p.agent_id !== null && p.agent_id !== undefined && !userIds.has(Number(p.agent_id))) {
                    fkViolations++;
                }
            });
            inquiries.forEach(inq => {
                if (inq.client_id !== null && inq.client_id !== undefined && !userIds.has(Number(inq.client_id))) {
                    fkViolations++;
                }
                if (inq.property_id !== null && inq.property_id !== undefined && !propIds.has(Number(inq.property_id))) {
                    fkViolations++;
                }
            });

            const hasMainAdmin = users.some(u =>
                String(u.email || '').trim().toLowerCase() === 'miriamalobren@gmail.com' &&
                String(u.role || '').trim().toLowerCase() === 'admin'
            );

            return {
                success: fkViolations === 0 && hasMainAdmin,
                engine: 'supabase',
                integrity: (fkViolations === 0 && hasMainAdmin) ? 'ok' : (hasMainAdmin ? 'FK mismatch' : 'Main admin role check warning'),
                foreign_key_violations: fkViolations,
                trigger_active: hasMainAdmin,
                table_count: 12
            };
        } catch (err) {
            return {
                success: false,
                engine: 'supabase',
                integrity: err.message || 'Unreachable',
                foreign_key_violations: 0,
                trigger_active: false,
                table_count: 0
            };
        }
    }

    async function apiUpdateAdminProfile(arg1, arg2) {
        try {
            let profileData = {};
            if (arg2 !== undefined) {
                profileData = arg2 || {};
            } else {
                profileData = arg1 || {};
            }

            const storedAdmin = JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem(USER_KEY) || '{}');
            const savedProfile = JSON.parse(localStorage.getItem('urbanscope_admin_profile') || '{}');
            const targetEmail = (profileData.email || storedAdmin.email || savedProfile.email || 'miriamalobren@gmail.com').trim().toLowerCase();
            const fullName = (profileData.full_name || profileData.name || profileData.fullName || storedAdmin.name || 'Miriam Lobren').trim();
            const phone = (profileData.phone !== undefined ? profileData.phone : (storedAdmin.phone || '')).trim();
            const license = (profileData.license_number || profileData.license || profileData.licenseNumber || storedAdmin.license || storedAdmin.license_number || '').trim();
            const title = (profileData.title !== undefined ? profileData.title : (storedAdmin.title || '')).trim();
            const brokerage = (profileData.brokerage !== undefined ? profileData.brokerage : (storedAdmin.brokerage || '')).trim();
            const bio = (profileData.bio !== undefined ? profileData.bio : (storedAdmin.bio || '')).trim();
            const avatarUrl = sanitizeImageUrl(
                profileData.avatar_url || storedAdmin.avatar_url || localStorage.getItem('urbanscope_profile_avatar') || 'assets/images/agent.jpg',
                'assets/images/agent.jpg'
            );

            let updatedUser = null;
            if (isLocalBackendReachableHost()) {
                const localRes = await localApiFetch('/admin/profile', {
                    method: 'PUT',
                    body: JSON.stringify({
                        full_name: fullName,
                        email: targetEmail,
                        phone: phone,
                        license_number: license,
                        title: title,
                        brokerage: brokerage,
                        bio: bio,
                        avatar_url: avatarUrl
                    })
                });
                const localData = await localRes.json().catch(() => ({}));
                if (!localRes.ok) {
                    return { success: false, error: localData.detail || localData.error || 'Unable to update profile.' };
                }
                updatedUser = localData.user || localData;
            } else {
                const res = await hostedApiFetch('/api/session', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'update-profile',
                        full_name: fullName,
                        email: targetEmail,
                        phone: phone,
                        license_number: license,
                        title: title,
                        brokerage: brokerage,
                        bio: bio,
                        avatar_url: avatarUrl
                    })
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok || body.success === false) {
                    return { success: false, error: body.error || 'Unable to update profile.' };
                }
                updatedUser = body.user || body;
            }

            // Synchronize local storage session caches after server confirmation
            const current = JSON.parse(localStorage.getItem(USER_KEY) || '{}');
            const merged = {
                ...current,
                ...storedAdmin,
                ...(updatedUser || {}),
                id: (updatedUser && updatedUser.id) || storedAdmin.id || current.id || 1,
                name: (updatedUser && updatedUser.full_name) || fullName,
                full_name: (updatedUser && updatedUser.full_name) || fullName,
                email: (updatedUser && updatedUser.email) || targetEmail,
                phone: (updatedUser && updatedUser.phone !== undefined) ? updatedUser.phone : phone,
                license: (updatedUser && updatedUser.license_number !== undefined) ? updatedUser.license_number : license,
                license_number: (updatedUser && updatedUser.license_number !== undefined) ? updatedUser.license_number : license,
                title: (updatedUser && updatedUser.title !== undefined) ? updatedUser.title : title,
                brokerage: (updatedUser && updatedUser.brokerage !== undefined) ? updatedUser.brokerage : brokerage,
                bio: (updatedUser && updatedUser.bio !== undefined) ? updatedUser.bio : bio,
                avatar_url: sanitizeImageUrl((updatedUser && updatedUser.avatar_url) || avatarUrl, 'assets/images/agent.jpg'),
                avatar: sanitizeImageUrl((updatedUser && updatedUser.avatar_url) || avatarUrl, 'assets/images/agent.jpg'),
                role: normalizeAccountRole((updatedUser && updatedUser.role) || storedAdmin.role || 'admin', targetEmail)
            };
            merged.user_metadata = {
                name: merged.full_name,
                full_name: merged.full_name,
                email: merged.email,
                phone: merged.phone,
                license: merged.license_number,
                license_number: merged.license_number,
                title: merged.title,
                brokerage: merged.brokerage,
                bio: merged.bio,
                avatar_url: merged.avatar_url
            };

            invalidateReadCache('profile');
            const cachedProfile = {
                name: merged.full_name,
                full_name: merged.full_name,
                email: merged.email,
                phone: merged.phone,
                license: merged.license_number,
                license_number: merged.license_number,
                title: merged.title,
                brokerage: merged.brokerage,
                bio: merged.bio,
                avatar_url: merged.avatar_url
            };
            const profileTs = Date.now();
            localStorage.setItem(USER_KEY, JSON.stringify(merged));
            localStorage.setItem(DEMO_KEY, JSON.stringify(merged));
            localStorage.setItem('adminUser', JSON.stringify(merged));
            localStorage.setItem('urbanscope_admin_profile', JSON.stringify(cachedProfile));
            localStorage.setItem('urbanscope_admin_profile_ts', String(profileTs));
            READ_CACHE.leadProfile = { promise: null, data: cachedProfile, ts: profileTs };

            try {
                window.dispatchEvent(new CustomEvent('urbanscope:profileUpdated', { detail: merged }));
            } catch (ev) {}

            return { success: true, user: merged };
        } catch (err) {
            console.warn('apiUpdateAdminProfile notice:', err);
            return { success: false, error: err.message || 'Unable to update profile.' };
        }
    }

    async function apiGetLeadAgentProfile(options = {}) {
        const forceRefresh = Boolean(options && options.forceRefresh);
        const LEAD_PROFILE_TTL_MS = 300000;
        const now = Date.now();

        if (!forceRefresh && READ_CACHE.leadProfile.data && (now - READ_CACHE.leadProfile.ts) < LEAD_PROFILE_TTL_MS) {
            return READ_CACHE.leadProfile.data;
        }
        if (!forceRefresh && READ_CACHE.leadProfile.promise) {
            return READ_CACHE.leadProfile.promise;
        }

        let cached = null;
        let cachedTs = 0;
        try {
            const rawStored = localStorage.getItem('urbanscope_admin_profile');
            cached = JSON.parse(rawStored || 'null');
            cachedTs = Number(localStorage.getItem('urbanscope_admin_profile_ts') || '0') || 0;
            if (!forceRefresh && cached && cached.email && cachedTs && (now - cachedTs) < LEAD_PROFILE_TTL_MS) {
                READ_CACHE.leadProfile.data = cached;
                READ_CACHE.leadProfile.ts = cachedTs;
                return cached;
            }
        } catch (e) {}

        const saveCachedProfile = (merged) => {
            const fetchedAt = Date.now();
            try {
                const nextJson = JSON.stringify(merged);
                if (localStorage.getItem('urbanscope_admin_profile') !== nextJson) {
                    localStorage.setItem('urbanscope_admin_profile', nextJson);
                }
                localStorage.setItem('urbanscope_admin_profile_ts', String(fetchedAt));
            } catch (e) {}
            READ_CACHE.leadProfile.data = merged;
            READ_CACHE.leadProfile.ts = fetchedAt;
            return merged;
        };

        const runner = (async () => {
            try {
                const res = isLocalBackendReachableHost()
                    ? await fetchWithTimeout(`${getLocalApiBase()}/agent/profile`, { method: 'GET' }, 5000)
                    : await fetchWithTimeout('/api/session?action=lead-agent', { method: 'GET', credentials: 'same-origin' }, 5000);
                if (res.ok) {
                    const body = await res.json().catch(() => ({}));
                    const data = body.agent || body.profile || body;
                    if (data && (data.full_name || data.name || data.email)) {
                        const merged = {
                            name: data.full_name || data.name || (cached && cached.name) || 'Miriam Lobren',
                            full_name: data.full_name || data.name || (cached && cached.full_name) || 'Miriam Lobren',
                            email: data.email || (cached && cached.email) || 'miriamalobren@gmail.com',
                            phone: data.phone || (cached && cached.phone) || '+63 918 964 5434',
                            license: data.license_number || data.license || (cached && cached.license) || '',
                            license_number: data.license_number || data.license || (cached && cached.license_number) || '',
                            title: (data.title && data.title.trim()) || (cached && cached.title && cached.title.trim()) || 'Real Estate Salesperson',
                            brokerage: data.brokerage || (cached && cached.brokerage) || 'CD Miranda Realty',
                            bio: data.bio || (cached && cached.bio) || 'Serving Las Piñas, Cavite, and surrounding prime locations with high-integrity real estate solutions.',
                            avatar_url: sanitizeImageUrl(data.avatar_url || (cached && cached.avatar_url), 'assets/images/agent.jpg')
                        };
                        return saveCachedProfile(merged);
                    }
                }
            } catch (err) {
                console.warn('Get lead agent profile notice:', err.message || err);
            }

            if (cached) return cached;

            return {
                name: 'Miriam Lobren',
                full_name: 'Miriam Lobren',
                email: 'miriamalobren@gmail.com',
                phone: '+63 918 964 5434',
                license: '',
                license_number: '',
                title: 'Real Estate Salesperson',
                brokerage: 'CD Miranda Realty',
                bio: 'Serving Las Piñas, Cavite, and surrounding prime locations with high-integrity real estate solutions.',
                avatar_url: 'assets/images/agent.jpg'
            };
        })().finally(() => {
            if (READ_CACHE.leadProfile.promise === runner) {
                READ_CACHE.leadProfile.promise = null;
            }
        });

        READ_CACHE.leadProfile.promise = runner;
        return runner;
    }

    async function apiUpdateAdminPassword(arg1, arg2, arg3) {
        try {
            let currentPassword = '';
            let newPassword = '';

            if (arg3 !== undefined) {
                currentPassword = arg2;
                newPassword = arg3;
            } else {
                currentPassword = arg1;
                newPassword = arg2;
            }

            currentPassword = (currentPassword || '').trim();
            newPassword = (newPassword || '').trim();

            if (!currentPassword) {
                return { success: false, error: 'Please enter your current password.' };
            }
            if (!newPassword || newPassword.length < 8) {
                return { success: false, error: 'New password must be at least 8 characters long.' };
            }

            try {
                localStorage.removeItem('adminPassword');
                localStorage.removeItem('urbanscope_admin_password_updated');
            } catch (_) {}

            if (!isLocalBackendReachableHost()) {
                const adminSessionToken = localStorage.getItem('adminSessionToken') || '';
                let response = await hostedApiFetch('/api/auth/admin-password/change', {
                    method: 'POST',
                    headers: {
                        ...(adminSessionToken ? { 'Authorization': `Bearer ${adminSessionToken}` } : {})
                    },
                    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
                });

                const storedAdmin = JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem(USER_KEY) || '{}');
                const adminEmail = (storedAdmin.email || '').trim().toLowerCase();
                if (response.status === 401 && adminEmail && typeof apiCreateHostedAdminSession === 'function') {
                    const sessionRes = await apiCreateHostedAdminSession({ email: adminEmail, password: currentPassword });
                    if (sessionRes && sessionRes.success) {
                        const freshToken = sessionRes.token || localStorage.getItem('adminSessionToken') || '';
                        response = await hostedApiFetch('/api/auth/admin-password/change', {
                            method: 'POST',
                            headers: {
                                ...(freshToken ? { 'Authorization': `Bearer ${freshToken}` } : {})
                            },
                            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
                        });
                    }
                }

                const result = await response.json().catch(() => ({}));
                if (response.ok && result.success) {
                    if (result.token) {
                        try { localStorage.setItem('adminSessionToken', result.token); } catch (_) {}
                    }
                    return { success: true, message: result.message || 'Password updated successfully.' };
                }

                return { success: false, error: result.error || 'The current password you entered is incorrect.' };
            }

            const res = await localApiFetch('/admin/password', {
                method: 'PUT',
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword
                })
            }, 8000);

            const body = await res.json().catch(() => ({}));
            if (res.ok) {
                return { success: true, message: body.message || 'Password updated successfully!' };
            }
            return {
                success: false,
                error: body.detail || body.error || 'The current password you entered is incorrect.'
            };
        } catch (err) {
            console.error('Password update failure:', err);
            return { success: false, error: err.message || 'An error occurred while changing password.' };
        }
    }

    async function apiUpdateClientProfile(payload = {}) {
        try {
            const cleanName = String(payload.full_name !== undefined ? payload.full_name : (payload.name || '')).trim();
            let cleanPhone = String(payload.phone !== undefined ? payload.phone : '').trim();

            if (!cleanName || cleanName.length < 2 || cleanName.length > 120) {
                return { success: false, error: 'Full name must be between 2 and 120 characters.' };
            }
            if (cleanPhone.length > 40) {
                return { success: false, error: 'Phone number is too long.' };
            }
            if (cleanPhone) {
                const digitsOnly = cleanPhone.replace(/[\s\-()]/g, '');
                if (/^09\d{9}$/.test(digitsOnly)) {
                    cleanPhone = '+63' + digitsOnly.slice(1);
                } else if (/^639\d{9}$/.test(digitsOnly)) {
                    cleanPhone = '+' + digitsOnly;
                } else if (/^9\d{9}$/.test(digitsOnly)) {
                    cleanPhone = '+63' + digitsOnly;
                } else if (/^\+639\d{9}$/.test(digitsOnly)) {
                    cleanPhone = digitsOnly;
                } else {
                    return {
                        success: false,
                        error: 'Please enter a valid Philippine mobile number (e.g. 0917 123 4567 or +63 917 123 4567).'
                    };
                }
            }

            let cachedPrev = {};
            try {
                cachedPrev = JSON.parse(localStorage.getItem(USER_KEY) || localStorage.getItem(DEMO_KEY) || '{}') || {};
            } catch (_) {}

            const isLocal = isLocalBackendReachableHost();
            const res = isLocal
                ? await localApiFetch('/auth/me', {
                    method: 'PUT',
                    body: JSON.stringify({ full_name: cleanName, phone: cleanPhone })
                }, 8000)
                : await hostedApiFetch('/api/session', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'update-profile', full_name: cleanName, phone: cleanPhone })
                }, 10000);

            const body = await res.json().catch(() => ({}));
            if (!res.ok || body.success === false) {
                return {
                    success: false,
                    error: body.detail || body.error || body.message || 'Unable to update your profile.'
                };
            }

            const rawUser = body.user || body;
            const updatedUser = buildSessionUserFromApi(rawUser, {
                ...cachedPrev,
                full_name: cleanName,
                phone: cleanPhone
            });
            syncCachedClientUserState(updatedUser);

            return {
                success: true,
                user: updatedUser,
                message: body.message || 'Profile updated successfully.'
            };
        } catch (err) {
            console.warn('apiUpdateClientProfile notice:', err);
            return { success: false, error: (err && err.message) || 'Unable to update your profile right now.' };
        }
    }

    async function apiUpdateClientPassword(payload = {}) {
        try {
            const currentPassword = String(payload.current_password || '');
            const cleanNewPassword = String(payload.new_password || '').trim();

            if (!cleanNewPassword || cleanNewPassword.length < 8 || cleanNewPassword.length > 128) {
                return { success: false, error: 'New password must be between 8 and 128 characters long.' };
            }

            let cachedPrev = {};
            try {
                cachedPrev = JSON.parse(localStorage.getItem(USER_KEY) || localStorage.getItem(DEMO_KEY) || '{}') || {};
            } catch (_) {}

            const isLocal = isLocalBackendReachableHost();
            const res = isLocal
                ? await localApiFetch('/auth/password', {
                    method: 'PUT',
                    body: JSON.stringify({
                        current_password: currentPassword,
                        new_password: cleanNewPassword
                    })
                }, 8000)
                : await hostedApiFetch('/api/session', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'change-password',
                        current_password: currentPassword,
                        new_password: cleanNewPassword
                    })
                }, 10000);

            const body = await res.json().catch(() => ({}));
            if (!res.ok || body.success === false) {
                return {
                    success: false,
                    error: body.detail || body.error || body.message || 'Unable to update your password.'
                };
            }

            const rawUser = body.user || cachedPrev;
            const mergedUser = buildSessionUserFromApi(
                { ...rawUser, has_password: true },
                { ...cachedPrev, has_password: true }
            );
            syncCachedClientUserState(mergedUser);

            return {
                success: true,
                user: mergedUser,
                message: body.message || 'Password updated successfully.'
            };
        } catch (err) {
            console.warn('apiUpdateClientPassword notice:', err);
            return { success: false, error: (err && err.message) || 'Unable to update password right now.' };
        }
    }

    async function apiLinkGoogleAccount(payload = {}) {
        try {
            const credential = payload.credential || null;
            const accessToken = payload.access_token || null;
            if (!credential && !accessToken) {
                return { success: false, error: 'Missing Google sign-in token. Please try again.' };
            }

            let cachedPrev = {};
            try {
                cachedPrev = JSON.parse(localStorage.getItem(USER_KEY) || localStorage.getItem(DEMO_KEY) || localStorage.getItem('adminUser') || '{}') || {};
            } catch (_) {}

            const isLocal = isLocalBackendReachableHost();
            const res = isLocal
                ? await localApiFetch('/auth/google/link', {
                    method: 'POST',
                    body: JSON.stringify({ credential, access_token: accessToken })
                }, 10000)
                : await hostedApiFetch('/api/session', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'link-google', credential, access_token: accessToken })
                }, 10000);

            const body = await res.json().catch(() => ({}));
            if (!res.ok || body.success === false) {
                return {
                    success: false,
                    status: res.status,
                    error: body.detail || body.error || body.message || 'Unable to connect your Google account.'
                };
            }

            const rawUser = body.user || cachedPrev;
            const mergedUser = buildSessionUserFromApi(
                {
                    ...rawUser,
                    google_connected: true,
                    google_email: rawUser.google_email || cachedPrev.google_email || rawUser.email || ''
                },
                { ...cachedPrev, google_connected: true }
            );
            syncCachedClientUserState(mergedUser);

            if (mergedUser.role === 'admin' || mergedUser.role === 'superadmin') {
                try { localStorage.setItem('adminUser', JSON.stringify(mergedUser)); } catch (_) {}
                try { window.dispatchEvent(new CustomEvent('urbanscope:profileUpdated', { detail: mergedUser })); } catch (_) {}
            }

            return {
                success: true,
                user: mergedUser,
                message: body.message || 'Google account connected successfully!'
            };
        } catch (err) {
            console.warn('apiLinkGoogleAccount notice:', err);
            return { success: false, error: (err && err.message) || 'Unable to connect your Google account right now.' };
        }
    }

    async function postAuthFlow(path, payload) {
        try {
            const response = isLocalBackendReachableHost()
                ? await localApiFetch(`/auth/${path}`, { method: 'POST', body: JSON.stringify(payload) }, 12000)
                : await hostedApiFetch(`/api/auth/${path}`, { method: 'POST', body: JSON.stringify(payload) }, 12000);
            const result = await response.json().catch(() => ({}));
            if (!response.ok || result.success === false) {
                return { success: false, code: result.code || '', error: result.detail || result.error || 'Unable to complete the request. Please try again.' };
            }
            return result;
        } catch (error) {
            return { success: false, error: error.message || 'Unable to reach the authentication service.' };
        }
    }

    async function apiStartRegistrationOtp(email, botData = {}) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
            return { success: false, error: 'Please enter a valid email address.' };
        }

        const isLocal = isLocalBackendReachableHost();
        const serverRes = await postAuthFlow('register/start', {
            email: cleanEmail,
            ...buildBotFields(botData, isLocal)
        });
        if (!serverRes || serverRes.success === false) {
            return { success: false, error: serverRes?.error || 'Unable to deliver verification email. Please check your email and try again.' };
        }

        try { sessionStorage.removeItem('urbanscope_register_challenge'); } catch (_) {}

        return {
            success: true,
            message: serverRes.message || `A six-digit verification code has been sent to ${cleanEmail}. Please check your inbox and spam folder.`
        };
    }

    async function apiCompleteRegistrationOtp(email, code, password, fullName, phone, botData = {}) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanCode = String(code || '').trim();
        const cleanName = String(fullName || '').trim();
        const cleanPhone = String(phone || '').trim();
        const rawPassword = String(password || '');

        if (!cleanCode || !/^[0-9]{6}$/.test(cleanCode)) {
            return { success: false, error: 'Please enter a valid 6-digit verification code.' };
        }
        if (rawPassword.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters long.' };
        }

        const isLocal = isLocalBackendReachableHost();
        const serverRes = await postAuthFlow('register/verify', {
            email: cleanEmail,
            code: cleanCode,
            password: rawPassword,
            full_name: cleanName,
            phone: cleanPhone,
            terms_accepted: botData.terms_accepted !== false,
            ...buildBotFields(botData, isLocal)
        });

        if (!serverRes || serverRes.success === false) {
            return { success: false, error: serverRes?.error || 'Verification failed. Please check your code.' };
        }

        try { sessionStorage.removeItem('urbanscope_register_challenge'); } catch (_) {}
        const u = serverRes.user || {};
        const sessionUser = buildSessionUserFromApi(u, {
            email: cleanEmail,
            full_name: cleanName,
            phone: cleanPhone,
            has_password: true
        });
        const role = sessionUser.role;

        if (isLocal && serverRes.token) {
            localStorage.setItem(TOKEN_KEY, serverRes.token);
        }
        localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
        localStorage.setItem(DEMO_KEY, JSON.stringify(sessionUser));
        if (role === 'admin' || role === 'superadmin') {
            localStorage.setItem('adminUser', JSON.stringify(sessionUser));
        } else {
            localStorage.removeItem('adminUser');
        }
        clearUserDeletedLocal(u.id, cleanEmail);
        purgeInquiriesByEmailLocal(cleanEmail, u.id);

        return {
            success: true,
            data: {
                session: true,
                user: sessionUser,
                token: serverRes.token || '',
                redirect_url: serverRes.redirect_url || ((role === 'admin' || role === 'superadmin') ? '/pages/admin/dashboard.html' : '/index.html')
            }
        };
    }

    async function apiRequestPasswordReset(email, botData = {}) {
        const isLocal = isLocalBackendReachableHost();
        return postAuthFlow('password/reset/request', {
            email: String(email || '').trim().toLowerCase(),
            ...buildBotFields(botData, isLocal)
        });
    }

    async function apiCompletePasswordReset(email, code, password) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const res = await postAuthFlow('password/reset/confirm', {
            email: cleanEmail,
            code: String(code || '').trim(),
            password: String(password || '')
        });
        if (res && res.success) {
            try {
                [USER_KEY, DEMO_KEY].forEach((k) => {
                    const raw = localStorage.getItem(k);
                    if (!raw) return;
                    const parsed = JSON.parse(raw);
                    if (parsed && String(parsed.email || '').trim().toLowerCase() === cleanEmail) {
                        parsed.has_password = true;
                        localStorage.setItem(k, JSON.stringify(parsed));
                    }
                });
                invalidateReadCache('profile');
            } catch (_) {}
        }
        return res;
    }

    async function apiSendPasswordResetEmail(email, botData = {}) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
            return { success: false, error: 'Please enter a valid email address.' };
        }
        const serverRes = await apiRequestPasswordReset(cleanEmail, botData);
        if (!serverRes || serverRes.success === false) {
            return {
                success: false,
                code: serverRes?.code || '',
                error: serverRes?.error || 'Unable to send recovery email.'
            };
        }
        try { sessionStorage.removeItem('urbanscope_reset_challenge'); } catch (_) {}
        return {
            success: true,
            message: serverRes.message || `A six-digit verification code has been sent to ${cleanEmail}.`
        };
    }

    async function apiVerifyPasswordResetCode(email, code) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanCode = String(code || '').trim();
        if (!cleanCode || !/^[0-9]{6}$/.test(cleanCode)) {
            return { success: false, error: 'Please enter the 6-digit verification code.' };
        }
        const res = isLocalBackendReachableHost()
            ? await postAuthFlow('password/reset/check-code', { email: cleanEmail, code: cleanCode, purpose: 'password_reset' })
            : await postAuthFlow('password/reset/confirm', { email: cleanEmail, code: cleanCode, verifyOnly: true });
        if (!res || res.success === false) {
            return { success: false, error: res?.error || 'Invalid or expired verification code.' };
        }
        return { success: true, message: res.message || 'Code verified successfully.' };
    }

    async function apiResetPasswordWithVerifiedCode(email, codeOrPassword, maybeNewPassword) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanCode = maybeNewPassword !== undefined ? String(codeOrPassword || '').trim() : '';
        const newPassword = maybeNewPassword !== undefined ? String(maybeNewPassword || '') : String(codeOrPassword || '');

        if (!cleanCode || !/^[0-9]{6}$/.test(cleanCode)) {
            return { success: false, error: 'Missing or invalid verification code. Please restart password reset.' };
        }
        if (!newPassword || newPassword.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters long.' };
        }
        const res = await apiCompletePasswordReset(cleanEmail, cleanCode, newPassword);
        if (!res || res.success === false) {
            return { success: false, error: res?.error || 'Unable to update password. Please try again.' };
        }
        try { sessionStorage.removeItem('urbanscope_reset_challenge'); } catch (_) {}
        return { success: true, message: res.message || 'Password updated successfully! You can now log in.' };
    }

    function normalizePhoneDigits(p) {
        if (!p) return '';
        const digits = String(p).replace(/\D/g, '');
        if (digits.startsWith('63') && digits.length === 12) return digits.slice(2);
        if (digits.startsWith('0') && digits.length === 11) return digits.slice(1);
        return digits;
    }

    async function apiVerifyAccountForPasswordReset() {
        return {
            success: false,
            error: 'Phone-based password reset is disabled for security. Please use email verification.'
        };
    }

    async function apiResetPasswordByPhone() {
        return {
            success: false,
            error: 'Phone-based password reset is disabled for security. Please use email verification.'
        };
    }

    async function apiSignUp(email, password, fullName, phone, botData = {}) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanName = String(fullName || '').trim();
        const cleanPhone = String(phone || '').trim();
        const rawPassword = String(password || '');

        if (!cleanEmail || !cleanEmail.includes('@')) {
            return { success: false, error: 'Please enter a valid email address.' };
        }
        if (!rawPassword || rawPassword.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters long.' };
        }

        if (botData && botData.code) {
            return apiCompleteRegistrationOtp(cleanEmail, botData.code, rawPassword, cleanName, cleanPhone, botData);
        }

        if (isLocalBackendReachableHost()) {
            const res = await postAuthFlow('register', {
                email: cleanEmail,
                password: rawPassword,
                full_name: cleanName,
                phone: cleanPhone,
                ...buildBotFields(botData, true)
            });
            if (!res || res.success === false || !res.user) {
                return { success: false, error: res?.error || 'Registration requires email OTP verification.' };
            }
            const u = res.user;
            const role = normalizeAccountRole(u.role, u.email || cleanEmail);
            const sessionUser = {
                id: u.id,
                email: u.email,
                name: u.full_name,
                full_name: u.full_name,
                phone: u.phone || '',
                role: role,
                avatar_url: sanitizeImageUrl(u.avatar_url || '', ''),
                user_metadata: { full_name: u.full_name, phone: u.phone || '', avatar_url: sanitizeImageUrl(u.avatar_url || '', '') }
            };
            if (res.token) localStorage.setItem(TOKEN_KEY, res.token);
            localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
            localStorage.setItem(DEMO_KEY, JSON.stringify(sessionUser));
            return {
                success: true,
                data: { session: true, user: sessionUser, token: res.token || '', redirect_url: res.redirect_url }
            };
        }

        return { success: false, error: 'Email verification is required to register an account.' };
    }

    async function apiSignIn(email, password, botData = {}) {
        try {
            const cleanEmail = String(email || '').trim().toLowerCase();
            const rawPassword = String(password || '');
            const isLocal = isLocalBackendReachableHost();

            if (!cleanEmail || !rawPassword) {
                return { success: false, error: 'Please enter both your email address and password.' };
            }

            try {
                localStorage.removeItem('adminPassword');
                localStorage.removeItem('urbanscope_admin_password_updated');
            } catch (_) {}

            const res = isLocal
                ? await localApiFetch('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({
                        email: cleanEmail,
                        password: rawPassword,
                        ...buildBotFields(botData, true)
                    })
                }, 10000)
                : await hostedApiFetch('/api/session', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'login',
                        email: cleanEmail,
                        password: rawPassword,
                        ...buildBotFields(botData, false)
                    })
                }, 10000);

            const authRes = await res.json().catch(() => ({}));
            if (!res.ok || authRes.success === false) {
                return {
                    success: false,
                    error: authRes.detail || authRes.error || authRes.message || 'Invalid email or password.'
                };
            }

            if (authRes.requires_verification) {
                return {
                    success: true,
                    requires_verification: true,
                    email: authRes.email,
                    full_name: authRes.full_name,
                    avatar_url: sanitizeImageUrl(authRes.avatar_url || '', ''),
                    message: authRes.message
                };
            }

            const u = authRes.user;
            if (!u) {
                return { success: false, error: 'Authentication response was incomplete. Please try again.' };
            }

            const sessionUser = buildSessionUserFromApi(u, { email: cleanEmail });
            const role = sessionUser.role;

            if (isLocal && authRes.token) {
                localStorage.setItem(TOKEN_KEY, authRes.token);
            }
            localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
            localStorage.setItem(DEMO_KEY, JSON.stringify(sessionUser));
            if (role === 'admin' || role === 'superadmin') {
                localStorage.setItem('adminUser', JSON.stringify(sessionUser));
                if (!isLocal) {
                    if (authRes.token) {
                        try { localStorage.setItem('adminSessionToken', authRes.token); } catch (_) {}
                    }
                    if (!authRes.admin_session_ready) {
                        await apiCreateHostedAdminSession({ email: cleanEmail, password: rawPassword }).catch(() => {});
                    }
                }
            } else {
                localStorage.removeItem('adminUser');
            }

            const redirectUrl = authRes.redirect_url || (
                (role === 'admin' || role === 'superadmin')
                    ? '/pages/admin/dashboard.html'
                    : '/index.html'
            );

            return {
                success: true,
                data: {
                    user: sessionUser,
                    token: authRes.token || '',
                    admin_session_ready: Boolean(isLocal || authRes.admin_session_ready),
                    redirect_url: redirectUrl
                }
            };
        } catch (err) {
            return { success: false, error: err.message || 'Unable to sign in right now.' };
        }
    }

    async function apiGetGoogleConfig() {
        try {
            const res = isLocalBackendReachableHost()
                ? await fetchWithTimeout(`${getLocalApiBase()}/auth/google/config`, { method: 'GET' }, 4000)
                : await fetchWithTimeout('/api/session?action=config', { method: 'GET', credentials: 'same-origin' }, 4000);
            if (res.ok) {
                const cfg = await res.json().catch(() => ({}));
                const cid = String(cfg.client_id || cfg.googleClientId || '').trim();
                const turnstileSiteKey = String(cfg.turnstile_site_key || cfg.turnstileSiteKey || '').trim();
                if (turnstileSiteKey && typeof window !== 'undefined') {
                    window.URBANSCOPE_TURNSTILE_SITE_KEY = turnstileSiteKey;
                }
                if (cid && !cid.toLowerCase().startsWith('your_google_client_id')) {
                    return { enabled: true, client_id: cid, turnstile_site_key: turnstileSiteKey };
                }
            }
        } catch (e) {}

        const fallbackCid = (window.URBANSCOPE_GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID || '').trim();
        if (fallbackCid && !fallbackCid.toLowerCase().startsWith('your_google_client_id')) {
            return { enabled: true, client_id: fallbackCid, turnstile_site_key: String(window.URBANSCOPE_TURNSTILE_SITE_KEY || '') };
        }
        return { enabled: false, client_id: '', turnstile_site_key: '' };
    }

    async function apiSignInWithGoogle(googlePayload = {}) {
        try {
            const isLocal = isLocalBackendReachableHost();
            const body = {
                credential: googlePayload.credential || null,
                access_token: googlePayload.access_token || null,
                ...buildBotFields(googlePayload, isLocal)
            };

            const res = isLocal
                ? await localApiFetch('/auth/google', { method: 'POST', body: JSON.stringify(body) }, 10000)
                : await hostedApiFetch('/api/session', { method: 'POST', body: JSON.stringify({ action: 'google', ...body }) }, 10000);

            const rawText = await res.text().catch(() => '');
            let authRes = {};
            if (rawText) {
                try { authRes = JSON.parse(rawText); } catch (_) { authRes = {}; }
            }
            if (!res.ok || authRes.success === false) {
                const fallbackError = res.ok
                    ? 'Google authentication failed.'
                    : `Google authentication failed (HTTP ${res.status}). Please try again.`;
                return {
                    success: false,
                    error: authRes.detail || authRes.error || authRes.message || fallbackError
                };
            }

            if (authRes.requires_verification) {
                return {
                    success: true,
                    requires_verification: true,
                    otp_sent: authRes.otp_sent !== false,
                    email: authRes.email,
                    full_name: authRes.full_name,
                    avatar_url: sanitizeImageUrl(authRes.avatar_url || '', ''),
                    message: authRes.message
                };
            }

            const u = authRes.user;
            if (!u) {
                return { success: false, error: 'Google login returned an incomplete profile.' };
            }

            const sessionUser = buildSessionUserFromApi(u, {
                has_password: normalizeHasPassword(u)
            });
            const resolvedRole = sessionUser.role;

            if (isLocal && authRes.token) {
                localStorage.setItem(TOKEN_KEY, authRes.token);
            }
            localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
            localStorage.setItem(DEMO_KEY, JSON.stringify(sessionUser));
            if (resolvedRole === 'admin' || resolvedRole === 'superadmin') {
                localStorage.setItem('adminUser', JSON.stringify(sessionUser));
                if (!isLocal) {
                    if (authRes.token) {
                        try { localStorage.setItem('adminSessionToken', authRes.token); } catch (_) {}
                    }
                    if (!authRes.admin_session_ready) {
                        await apiCreateHostedAdminSession({ credential: body.credential, access_token: body.access_token }).catch(() => {});
                    }
                }
            } else {
                localStorage.removeItem('adminUser');
            }

            const redirectUrl = authRes.redirect_url || (
                (resolvedRole === 'admin' || resolvedRole === 'superadmin')
                    ? '/pages/admin/dashboard.html'
                    : '/index.html'
            );

            return {
                success: true,
                data: {
                    session: true,
                    user: sessionUser,
                    token: authRes.token || '',
                    admin_session_ready: Boolean(isLocal || authRes.admin_session_ready),
                    redirect_url: redirectUrl
                }
            };
        } catch (err) {
            const isTimeout = err && err.name === 'AbortError';
            return {
                success: false,
                error: isTimeout
                    ? 'Google authentication timed out. Please try again.'
                    : ((err && err.message) || 'Google authentication failed.')
            };
        }
    }

    async function apiVerifyGoogleRegistration(payload = {}) {
        const isLocal = isLocalBackendReachableHost();
        const cleanEmail = (payload.email || '').trim().toLowerCase();
        const cleanCode = (payload.code || '').trim();
        const fullName = (payload.full_name || '').trim() || cleanEmail.split('@')[0];
        const avatarUrl = sanitizeImageUrl(payload.avatar_url || '', '');
        const phone = (payload.phone || '').trim();

        const body = {
            email: cleanEmail,
            code: cleanCode,
            terms_accepted: Boolean(payload.terms_accepted),
            credential: payload.credential || null,
            access_token: payload.access_token || null,
            full_name: fullName,
            avatar_url: avatarUrl,
            phone: phone,
            ...buildBotFields(payload, isLocal)
        };

        try {
            const res = isLocal
                ? await localApiFetch('/auth/google/verify', { method: 'POST', body: JSON.stringify(body) })
                : await hostedApiFetch('/api/session', { method: 'POST', body: JSON.stringify({ action: 'google-verify', ...body }) });

            const authRes = await res.json().catch(() => ({}));
            if (!res.ok || authRes.success === false) {
                return {
                    success: false,
                    error: authRes.detail || authRes.error || authRes.message || 'Verification failed. Please check your code.'
                };
            }

            if (authRes.user) {
                const u = authRes.user;
                clearUserDeletedLocal(u.id, cleanEmail);
                purgeInquiriesByEmailLocal(cleanEmail, u.id);
                const sessionUser = buildSessionUserFromApi(u, {
                    email: cleanEmail,
                    full_name: fullName,
                    phone: phone,
                    avatar_url: avatarUrl,
                    has_password: (u.has_password !== undefined && u.has_password !== null) ? Boolean(u.has_password) : false
                });
                const role = sessionUser.role;
                if (authRes.token && isLocal) {
                    localStorage.setItem(TOKEN_KEY, authRes.token);
                }
                localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
                localStorage.setItem(DEMO_KEY, JSON.stringify(sessionUser));
                if (role === 'admin' || role === 'superadmin') {
                    localStorage.setItem('adminUser', JSON.stringify(sessionUser));
                    if (!isLocal) {
                        if (authRes.token) {
                            try { localStorage.setItem('adminSessionToken', authRes.token); } catch (_) {}
                        }
                        if (!authRes.admin_session_ready) {
                            await apiCreateHostedAdminSession({ credential: payload.credential, access_token: payload.access_token }).catch(() => {});
                        }
                    }
                } else {
                    localStorage.removeItem('adminUser');
                }
                return {
                    success: true,
                    data: {
                        session: true,
                        user: sessionUser,
                        token: authRes.token || '',
                        admin_session_ready: Boolean(isLocal || authRes.admin_session_ready),
                        redirect_url: authRes.redirect_url || ((role === 'admin' || role === 'superadmin') ? '/pages/admin/dashboard.html' : '/index.html')
                    }
                };
            }
            return { success: true, data: authRes };
        } catch (err) {
            return { success: false, error: err.message || 'Unable to connect to verification service.' };
        }
    }

    async function apiValidateGoogleOtp(email, code) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanCode = String(code || '').trim();

        if (!cleanEmail || !cleanEmail.includes('@')) {
            return { success: false, error: 'Please enter a valid email address.' };
        }
        if (!cleanCode || !/^[0-9]{6}$/.test(cleanCode)) {
            return { success: false, error: 'Please enter a valid 6-digit verification code.' };
        }

        try {
            const res = isLocalBackendReachableHost()
                ? await localApiFetch('/auth/register/check-code', {
                    method: 'POST',
                    body: JSON.stringify({ email: cleanEmail, code: cleanCode, purpose: 'register' })
                })
                : await hostedApiFetch('/api/auth/register/check', {
                    method: 'POST',
                    body: JSON.stringify({ email: cleanEmail, code: cleanCode, purpose: 'register' })
                });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                return {
                    success: false,
                    error: data.detail || data.error || data.message || 'The verification code is incorrect or has expired. Please check your email or request a new code.'
                };
            }
            return { success: true, message: 'Verification code is valid.' };
        } catch (err) {
            return { success: false, error: err.message || 'Unable to connect to verification service.' };
        }
    }

    async function apiCreateHostedAdminSession(credentials = {}) {
        if (isLocalBackendReachableHost()) return { success: true, local: true };
        try {
            const response = await hostedApiFetch('/api/auth/edge-session', {
                method: 'POST',
                body: JSON.stringify(credentials)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
                return { success: false, error: result.error || 'Unable to secure the admin session.' };
            }
            if (result.token) {
                try {
                    localStorage.setItem('adminSessionToken', result.token);
                } catch (_) {}
            }
            if (result.user?.role && result.user?.email) {
                try {
                    const currentUser = JSON.parse(localStorage.getItem(USER_KEY) || '{}');
                    if (String(currentUser.email || '').toLowerCase() === String(result.user.email).toLowerCase()) {
                        currentUser.role = result.user.role;
                        localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
                        localStorage.setItem(DEMO_KEY, JSON.stringify(currentUser));
                        localStorage.setItem('adminUser', JSON.stringify(currentUser));
                    }
                } catch (_) {}
            }
            return result;
        } catch (error) {
            return { success: false, error: error.message || 'Unable to reach the admin session service.' };
        }
    }

    async function apiGetHostedAdminSession() {
        if (isLocalBackendReachableHost()) return null;
        try {
            const response = await fetch('/api/auth/edge-session', {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store'
            });
            if (!response.ok) return null;
            const result = await response.json().catch(() => ({}));
            return result.authenticated ? (result.user || null) : null;
        } catch (_) {
            return null;
        }
    }

    async function apiSignOut() {
        if (isLocalBackendReachableHost()) {
            try {
                await localApiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
            } catch (e) {}
        } else {
            await Promise.all([
                hostedApiFetch('/api/session', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }).catch(() => {}),
                hostedApiFetch('/api/auth/edge-session', { method: 'DELETE' }).catch(() => {})
            ]);
        }
        clearClientAuthStorage();
    }

    async function apiGetCurrentUser(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && READ_CACHE.currentUser.hasValue && (now - READ_CACHE.currentUser.ts) < 5000) {
            return READ_CACHE.currentUser.data;
        }
        if (!forceRefresh && READ_CACHE.currentUser.promise) {
            return READ_CACHE.currentUser.promise;
        }

        const runner = (async () => {
            let resolvedUser = null;
            try {
                if (isLocalBackendReachableHost()) {
                    try {
                        const res = await localApiFetch('/auth/me', { method: 'GET' }, 5000);
                        if (res.ok) {
                            const u = await res.json();
                            const userObj = buildSessionUserFromApi(u);
                            localStorage.setItem(USER_KEY, JSON.stringify(userObj));
                            localStorage.setItem(DEMO_KEY, JSON.stringify(userObj));
                            resolvedUser = userObj;
                            READ_CACHE.currentUser = { promise: null, data: resolvedUser, ts: Date.now(), hasValue: true };
                            return resolvedUser;
                        }
                        if (res.status === 401 || res.status === 403) {
                            clearClientAuthStorage();
                            READ_CACHE.currentUser = { promise: null, data: null, ts: Date.now(), hasValue: true };
                            return null;
                        }
                    } catch (e) {}
                } else if (typeof location === 'undefined' || location.protocol !== 'file:') {
                    try {
                        const res = await hostedApiFetch('/api/session?action=me', { method: 'GET', cache: 'no-store' }, 5000);
                        if (res.ok) {
                            const body = await res.json().catch(() => ({}));
                            if (body && body.authenticated && body.user) {
                                const u = body.user;
                                const userObj = buildSessionUserFromApi(u);
                                localStorage.setItem(USER_KEY, JSON.stringify(userObj));
                                localStorage.setItem(DEMO_KEY, JSON.stringify(userObj));
                                resolvedUser = userObj;
                                READ_CACHE.currentUser = { promise: null, data: resolvedUser, ts: Date.now(), hasValue: true };
                                return resolvedUser;
                            }
                        }
                        if (res.status === 401 || res.status === 403) {
                            const adminSess = await apiGetHostedAdminSession();
                            if (adminSess && adminSess.email) {
                                resolvedUser = buildSessionUserFromApi(adminSess);
                                READ_CACHE.currentUser = { promise: null, data: resolvedUser, ts: Date.now(), hasValue: true };
                                return resolvedUser;
                            }
                            clearClientAuthStorage();
                            READ_CACHE.currentUser = { promise: null, data: null, ts: Date.now(), hasValue: true };
                            return null;
                        }
                    } catch (e) {}
                }

                const cached = JSON.parse(localStorage.getItem(USER_KEY)) || JSON.parse(localStorage.getItem(DEMO_KEY));
                resolvedUser = cached || null;
                READ_CACHE.currentUser = { promise: null, data: resolvedUser, ts: Date.now(), hasValue: true };
                return resolvedUser;
            } catch (e) {
                return null;
            }
        })().finally(() => {
            if (READ_CACHE.currentUser.promise === runner) {
                READ_CACHE.currentUser.promise = null;
            }
        });

        READ_CACHE.currentUser.promise = runner;
        return runner;
    }

    // ----------------------------------------------------------
    // 5. DASHBOARD & APPOINTMENTS SERVICES
    // ----------------------------------------------------------
    async function apiGetDashboardKPIs() {
        if (isLocalBackendReachableHost()) {
            try {
                const localRes = await localApiFetch('/view_dashboard_kpis', { method: 'GET' });
                if (localRes.ok) {
                    const localData = await localRes.json();
                    return Array.isArray(localData) ? localData[0] : localData;
                }
            } catch (e) {}
        } else {
            try {
                const hostedRes = await hostedApiFetch('/api/inquiries?action=stats', { method: 'GET' }, 6000);
                if (hostedRes.ok) {
                    const body = await hostedRes.json().catch(() => null);
                    const stats = extractApiObjectPayload(body);
                    if (stats && typeof stats === 'object') {
                        return stats;
                    }
                }
            } catch (e) {}
        }

        try {
            const [props, inquiries] = await Promise.all([
                apiGetProperties({ type: 'all' }).catch(() => []),
                apiGetInquiries().catch(() => [])
            ]);
            const pList = Array.isArray(props) ? props : [];
            const iList = Array.isArray(inquiries) ? inquiries : [];
            return {
                total_properties: pList.length,
                available_properties: pList.filter(p => String(p.status || 'Available').toLowerCase() === 'available').length,
                total_inquiries: iList.length,
                pending_inquiries: iList.filter(i => {
                    const s = String(i.status || 'Under Review').toLowerCase();
                    return s.includes('review') || s.includes('pending');
                }).length
            };
        } catch (e) {
            return null;
        }
    }

    async function apiGetAppointments() {
        try {
            if (isLocalBackendReachableHost()) {
                const res = await localApiFetch('/appointments', { method: 'GET' });
                if (res.ok) return await res.json();
                const inqs = await apiGetInquiries().catch(() => []);
                return Array.isArray(inqs)
                    ? inqs.filter(i => ['approved', 'scheduled'].includes(String(i.status || '').toLowerCase().trim()))
                    : [];
            }
            const res = await hostedApiFetch('/api/inquiries?action=appointments', { method: 'GET' });
            if (res.ok) {
                const body = await res.json().catch(() => []);
                return extractApiArrayPayload(body, 'appointments');
            }
        } catch (e) {
            console.warn('Appointments query error:', e);
        }
        return [];
    }

    // ----------------------------------------------------------
    // 6. EXPOSE TO GLOBAL SCOPE
    // ----------------------------------------------------------
    window.SUPABASE_URL = SUPABASE_URL;
    window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
    window.supabaseClient = supabaseClient;
    window.escapeHtml = escapeHtml;
    window.sanitizeImageUrl = sanitizeImageUrl;
    window.ensureCsrfToken = ensureCsrfToken;
    window.clearClientAuthStorage = clearClientAuthStorage;

    window.apiGetProperties = apiGetProperties;
    window.apiGetPropertyById = apiGetPropertyById;
    window.apiAddProperty = apiAddProperty;
    window.apiUpdateProperty = apiUpdateProperty;
    window.apiDeleteProperty = apiDeleteProperty;
    window.apiSubmitInquiry = apiSubmitInquiry;
    window.apiGetInquiries = apiGetInquiries;
    window.apiUpdateInquiryStatus = apiUpdateInquiryStatus;
    window.apiGetMyInquiries = apiGetMyInquiries;
    function showFeedbackToast(msg, type = 'success') {
        if (!msg || typeof document === 'undefined') return;
        let toast = document.getElementById('urbanFeedbackToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'urbanFeedbackToast';
            document.body.appendChild(toast);
        }

        let iconHtml = '<span class="toast-icon-success">✓</span>';
        if (type === 'error' || type === 'danger') {
            iconHtml = '<span class="toast-icon-error">✕</span>';
        } else if (type === 'info') {
            iconHtml = '<span class="toast-icon-info">ℹ</span>';
        } else if (type === 'warn' || type === 'warning') {
            iconHtml = '<span class="toast-icon-warn">⚠</span>';
        }

        toast.className = 'urban-feedback-toast';
        const cleanMsg = String(msg).replace(/^\s*[✓✕ℹ⚠]+\s*/u, '');
        toast.innerHTML = `${iconHtml} <span>${escapeHtml(cleanMsg)}</span>`;

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.classList.remove('show');
        }, 3200);
    }

    window.showFeedbackToast = showFeedbackToast;
    window.urbanToast = showFeedbackToast;

    window.apiUpdateMyInquiry = apiUpdateMyInquiry;
    window.apiDeleteMyInquiry = apiDeleteMyInquiry;
    window.apiCancelMyInquiry = apiCancelMyInquiry;
    window.apiGetAdminNotifications = apiGetAdminNotifications;
    window.apiGetClientNotifications = apiGetClientNotifications;
    window.apiMarkNotificationsRead = apiMarkNotificationsRead;
    window.apiMarkNotificationsSeen = apiMarkNotificationsSeen;
    window.apiGetUsers = apiGetUsers;
    window.apiGetSuperadminOverview = apiGetSuperadminOverview;
    window.apiGetSuperadminUsers = apiGetSuperadminUsers;
    window.apiSuperadminCreateUser = apiSuperadminCreateUser;
    window.apiSuperadminUpdateUser = apiSuperadminUpdateUser;
    window.apiSuperadminUpdateUserRole = apiSuperadminUpdateUserRole;
    window.apiSuperadminDeleteUser = apiSuperadminDeleteUser;
    window.apiRunSuperadminIntegrityCheck = apiRunSuperadminIntegrityCheck;
    window.apiUpdateAdminProfile = apiUpdateAdminProfile;
    window.apiGetLeadAgentProfile = apiGetLeadAgentProfile;
    window.apiUpdateAdminPassword = apiUpdateAdminPassword;
    window.apiUpdateClientProfile = apiUpdateClientProfile;
    window.apiUpdateClientPassword = apiUpdateClientPassword;
    window.apiLinkGoogleAccount = apiLinkGoogleAccount;
    window.apiSignUp = apiSignUp;
    window.apiStartRegistrationOtp = apiStartRegistrationOtp;
    window.apiCompleteRegistrationOtp = apiCompleteRegistrationOtp;
    window.apiRequestPasswordReset = apiRequestPasswordReset;
    window.apiCompletePasswordReset = apiCompletePasswordReset;
    window.apiSendPasswordResetEmail = apiSendPasswordResetEmail;
    window.apiVerifyPasswordResetCode = apiVerifyPasswordResetCode;
    window.apiResetPasswordWithVerifiedCode = apiResetPasswordWithVerifiedCode;
    window.apiVerifyAccountForPasswordReset = apiVerifyAccountForPasswordReset;
    window.apiResetPasswordByPhone = apiResetPasswordByPhone;
    window.apiSignIn = apiSignIn;
    window.apiGetGoogleConfig = apiGetGoogleConfig;
    window.apiSignInWithGoogle = apiSignInWithGoogle;
    window.apiValidateGoogleOtp = apiValidateGoogleOtp;
    window.apiVerifyGoogleRegistration = apiVerifyGoogleRegistration;
    window.apiCreateHostedAdminSession = apiCreateHostedAdminSession;
    window.apiGetHostedAdminSession = apiGetHostedAdminSession;
    window.apiSignOut = apiSignOut;
    window.apiGetCurrentUser = apiGetCurrentUser;
    window.apiGetDashboardKPIs = apiGetDashboardKPIs;
    window.apiGetAppointments = apiGetAppointments;
    window.apiEnsureAccreditedProperties = apiEnsureAccreditedProperties;
    window.apiGetCachedProperties = apiGetCachedProperties;
    window.apiGetLocalPropertiesFast = apiGetLocalPropertiesFast;
    window.getStaticFallbackProperties = getStaticFallbackProperties;
    window.isSupabaseConfigured = isBackendConfigured;
    window.isBackendConfigured = isBackendConfigured;

    console.log('✓ UrbanScope Live Supabase Cloud Client Connected:', SUPABASE_URL);
})(window);
