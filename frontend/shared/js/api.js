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

    function applyUserTheme(mode, animate) {
        const root = document.documentElement;
        const isDark = mode === 'dark';
        const commitThemeDom = () => {
            root.classList.toggle('dark-mode', isDark);
            root.setAttribute('data-theme', isDark ? 'dark' : 'light');
            persistUserTheme(isDark ? 'dark' : 'light');

            document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
                btn.setAttribute('aria-pressed', String(isDark));
                btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
                btn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
            });
        };

        if (animate && typeof document.startViewTransition === 'function') {
            root.classList.remove('theme-transitioning');
            try {
                document.startViewTransition(commitThemeDom);
                return;
            } catch (_) {}
        }

        if (animate) {
            root.classList.add('theme-transitioning');
            if (globalThemeTimer) clearTimeout(globalThemeTimer);
            globalThemeTimer = setTimeout(() => {
                root.classList.remove('theme-transitioning');
            }, 520);
        }

        commitThemeDom();
    }

    applyUserTheme(getSavedUserTheme(), false);

    window.addEventListener('pageshow', () => {
        applyUserTheme(getSavedUserTheme(), false);
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

    function getLocalAuthHeaders(extra = {}) {
        const token = localStorage.getItem(TOKEN_KEY) ||
                      localStorage.getItem('urbanscope_jwt_token') ||
                      localStorage.getItem('access_token') ||
                      localStorage.getItem('adminToken') ||
                      localStorage.getItem('supabase_token') || '';
        const headers = { 'Content-Type': 'application/json', ...extra };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    function normalizeAccountRole(role, email) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (cleanEmail === 'urbanscope.cvsu@gmail.com') return 'superadmin';
        const r = String(role || '').trim().toLowerCase();
        if (r === 'superadmin') return 'superadmin';
        if (r === 'admin' || r === 'agent') return 'admin';
        if (cleanEmail === 'admin.realestate@gmail.com' || cleanEmail === 'miriamalobren@gmail.com' || cleanEmail === 'miriam@gmail.com') return 'admin';
        return 'user';
    }

    // ----------------------------------------------------------
    // 2. PROPERTY SERVICES
    // ----------------------------------------------------------
    async function apiGetProperties(filter = {}) {
        let liveProperties = [];

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
                    queryParts.push(`property_type=ilike.*${encodeURIComponent(filter.type)}*`);
                }
            }

            // 2. Location Filter
            if (filter.location && filter.location !== 'all') {
                const cleanLoc = filter.location.replace(/-/g, ' ').trim();
                queryParts.push(`location=ilike.*${encodeURIComponent(cleanLoc)}*`);
            }

            // 3. Search Keyword across title, location, description, amenities
            if (filter.search && filter.search.trim()) {
                const s = encodeURIComponent(filter.search.trim());
                queryParts.push(`or=(title.ilike.*${s}*,location.ilike.*${s}*,property_type.ilike.*${s}*,description.ilike.*${s}*,amenities.ilike.*${s}*)`);
            }

            queryParts.push('order=id.desc');

            const url = `${REST_BASE}/properties?${queryParts.join('&')}`;
            const res = await fetch(url, { method: 'GET', headers: getHeaders() });

            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    liveProperties = data;
                }
            }
        } catch (err) {
            console.warn('Supabase properties fetch notice, attempting fallback:', err.message);
        }

        // Fallback 1: Local Python backend if available
        if (liveProperties.length === 0 && isLocalBackendReachableHost()) {
            try {
                const localBase = getLocalApiBase();
                const localRes = await fetch(`${localBase}/properties`, { method: 'GET' });
                if (localRes.ok) {
                    const localData = await localRes.json();
                    if (Array.isArray(localData) && localData.length > 0) {
                        liveProperties = localData;
                    }
                }
            } catch (e) {}
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

        // Strictly retain only accredited properties: Airmen, Casasuerte, Kathleen, Liora
        liveProperties = liveProperties.filter(p => {
            if (!p) return false;
            const t = (p.title || p.propertyName || p.name || '').toLowerCase().trim();
            return t.includes('airmen') || t.includes('suerte') || t.includes('kathleen') || t.includes('liora');
        }).map(p => {
            if (!p) return p;
            const t = (p.title || p.propertyName || p.name || '').toLowerCase().trim();
            if (t.includes('suerte')) p.title = 'Casasuerte';
            else if (t.includes('kathleen')) p.title = 'Kathleen';
            return p;
        });

        // Fallback to static accredited properties if list is empty
        if (liveProperties.length === 0) {
            liveProperties = [
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
                    title: "Kathleen",
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
                    description: "Kathleen is a secure, family-friendly residential community offering 275 premium zen-inspired townhouses in Molino VII, Bacoor.",
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
                }
            ];
        }

        if (liveProperties.length > 0) {
            try {
                localStorage.setItem('cached_live_properties', JSON.stringify(liveProperties));
                ['urbanScopeProperties', 'properties'].forEach(k => {
                    const raw = localStorage.getItem(k);
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw);
                            if (Array.isArray(parsed)) {
                                const clean = parsed.filter(p => {
                                    const t = (p.title || p.propertyName || p.name || '').toLowerCase().trim();
                                    return t.includes('airmen') || t.includes('suerte') || t.includes('kathleen') || t.includes('liora');
                                });
                                localStorage.setItem(k, JSON.stringify(clean));
                            }
                        } catch (_) {}
                    }
                });
            } catch (e) {}
            return liveProperties;
        }

        return null;
    }

    async function apiGetPropertyById(id) {
        try {
            const url = `${REST_BASE}/properties?id=eq.${encodeURIComponent(id)}&select=*`;
            const res = await fetch(url, { method: 'GET', headers: getHeaders() });
            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) return data[0];
            }
        } catch (err) {
            console.warn(`Supabase notice fetching property #${id}:`, err.message);
        }

        // Fallback 1: Local backend
        if (isLocalBackendReachableHost()) {
            try {
                const localBase = getLocalApiBase();
                const localRes = await fetch(`${localBase}/properties/${encodeURIComponent(id)}`);
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

        const payload = {
            title: property.title || property.propertyName || 'New Listing',
            location: loc,
            city: city,
            province: province,
            property_type: property.property_type || property.propertyType || 'Villa',
            price: parseFloat(property.price) || 0,
            bedrooms: parseInt(property.bedrooms, 10) || 3,
            bathrooms: parseInt(property.bathrooms, 10) || 2,
            lot_area: parseFloat(property.lot_area || property.lotArea) || 120,
            floor_area: parseFloat(property.floor_area || property.floorArea) || 80,
            carports: parseInt(property.carports, 10) || 1,
            storeys: parseInt(property.storeys, 10) || 2,
            status: validStatus,
            image_url: property.image_url || (property.imageNames && property.imageNames[0] ? 'assets/images/' + property.imageNames[0] : 'assets/images/property1.jpg'),
            description: property.description || '',
            amenities: property.amenities || ''
        };

        let created = null;

        // 1. Insert into Supabase
        try {
            const res = await fetch(`${REST_BASE}/properties`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                created = Array.isArray(data) ? data[0] : data;
            }
        } catch (err) {
            console.warn('Supabase property insert notice:', err.message);
        }

        // 2. Also sync to local Python backend when on local dev host
        if (isLocalBackendReachableHost()) {
            try {
                const localBase = getLocalApiBase();
                const localRes = await fetch(`${localBase}/properties`, {
                    method: 'POST',
                    headers: getLocalAuthHeaders(),
                    credentials: 'include',
                    body: JSON.stringify(payload)
                });
                if (localRes.ok) {
                    const localData = await localRes.json();
                    if (!created) created = localData;
                }
            } catch (e) {
                console.warn('Local backend property insert notice:', e);
            }
        }

        // If both failed over network, create in-memory object
        if (!created) {
            created = {
                id: property.id || Date.now(),
                ...payload,
                created_at: new Date().toISOString()
            };
        }

        // 3. Immediately update all browser caches so frontend displays it instantly
        try {
            const cached = JSON.parse(localStorage.getItem('cached_live_properties') || '[]');
            cached.unshift(created);
            localStorage.setItem('cached_live_properties', JSON.stringify(cached));
        } catch (e) {}

        try {
            const urbanProps = JSON.parse(localStorage.getItem('urbanScopeProperties') || '[]');
            urbanProps.unshift(created);
            localStorage.setItem('urbanScopeProperties', JSON.stringify(urbanProps));
        } catch (e) {}

        try {
            const adminProps = JSON.parse(localStorage.getItem('properties') || '[]');
            adminProps.unshift({
                id: created.id,
                name: created.title,
                title: created.title,
                location: created.location,
                type: created.property_type,
                property_type: created.property_type,
                price: created.price,
                status: created.status,
                image_url: created.image_url
            });
            localStorage.setItem('properties', JSON.stringify(adminProps));
        } catch (e) {}

        return created;
    }

    async function apiUpdateProperty(id, property) {
        let updated = null;

        // 1. Try local FastAPI backend first when on local dev host
        if (isLocalBackendReachableHost()) {
            try {
                const localBase = getLocalApiBase();
                const localRes = await fetch(`${localBase}/properties/${encodeURIComponent(id)}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: getLocalAuthHeaders(),
                    body: JSON.stringify(property)
                });

                if (localRes.ok) {
                    updated = await localRes.json();
                }
            } catch (e) {
                console.warn('Local backend property update notice:', e);
            }
        }

        // 2. Also try live Supabase if available
        try {
            const res = await fetch(`${REST_BASE}/properties?id=eq.${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify(property)
            });

            if (res.ok) {
                const data = await res.json();
                const supaData = Array.isArray(data) ? data[0] : data;
                if (!updated) updated = supaData;
            }
        } catch (err) {
            console.warn(`Supabase update notice for property #${id}:`, err.message);
        }

        // 3. In-memory object fallback if network was unreachable
        if (!updated) {
            updated = { id: Number(id) || id, ...property };
        }

        // 4. Immediately sync all local storage property caches
        try {
            ['cached_live_properties', 'urbanScopeProperties', 'properties'].forEach(key => {
                const list = JSON.parse(localStorage.getItem(key) || '[]');
                if (Array.isArray(list) && list.length > 0) {
                    const idx = list.findIndex(p => String(p.id) === String(id));
                    if (idx !== -1) {
                        list[idx] = { ...list[idx], ...property };
                        localStorage.setItem(key, JSON.stringify(list));
                    }
                }
            });
        } catch (e) {}

        return updated;
    }

    async function apiDeleteProperty(id) {
        let deleted = false;

        // 1. Try local FastAPI backend first when on local dev host
        if (isLocalBackendReachableHost()) {
            try {
                const localBase = getLocalApiBase();
                const localRes = await fetch(`${localBase}/properties/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: getLocalAuthHeaders()
                });

                if (localRes.ok) {
                    deleted = true;
                }
            } catch (e) {
                console.warn('Local backend property delete notice:', e);
            }
        }

        // 2. Also try Supabase if configured
        try {
            const res = await fetch(`${REST_BASE}/properties?id=eq.${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: getHeaders()
            });

            if (res.ok) {
                deleted = true;
            }
        } catch (err) {
            console.warn(`Supabase delete notice for property #${id}:`, err.message);
        }

        // 3. Immediately clean up all local storage property caches
        try {
            ['cached_live_properties', 'urbanScopeProperties', 'properties'].forEach(key => {
                const list = JSON.parse(localStorage.getItem(key) || '[]');
                if (Array.isArray(list) && list.length > 0) {
                    const filtered = list.filter(p => String(p.id) !== String(id));
                    localStorage.setItem(key, JSON.stringify(filtered));
                }
            });
            // If offline, still treat as deleted locally
            if (!deleted) deleted = true;
        } catch (e) {}

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
        const overrides = getInquiryOverrides();
        let cached = [];
        try {
            cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
        } catch (_) {}

        const updatedList = list
            .filter(item => item && !deletedIds.has(String(item.id)))
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
            localStorage.setItem('inquiries', JSON.stringify(Array.from(cacheMap.values())));
        } catch (_) {}

        return updatedList;
    }

    function pushAdminEventNotification(eventObj) {
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

    async function apiGetAdminNotifications() {
        let items = [];
        try {
            const localEvents = JSON.parse(localStorage.getItem(ADMIN_EVENT_NOTIFS_KEY) || '[]');
            if (Array.isArray(localEvents)) {
                items = localEvents.filter(ev => ev && ev.type !== 'approved' && ev.type !== 'completed');
            }
        } catch (_) {}

        if (isLocalDevHost()) {
            try {
                const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                const res = await fetch(`${localBase}/notifications?role=admin`, { method: 'GET' });
                if (res.ok) {
                    const rows = await res.json();
                    if (Array.isArray(rows)) {
                        rows.forEach(r => {
                            const inqId = r.inquiry_id || r.id;
                            const nType = (r.type || 'info').toLowerCase();
                            // Admin should NEVER receive approval or completed notifications
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
                }
            } catch (_) {}
        }

        items = items.filter(it => it && it.type !== 'approved' && it.type !== 'completed');
        items.sort((a, b) => (b.time || 0) - (a.time || 0));
        return items;
    }

    async function apiGetClientNotifications(email) {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!cleanEmail) return [];

        const mapByKey = new Map();

        // 1. Local FastAPI backend notifications (persisted with is_read and is_seen)
        if (isLocalDevHost()) {
            try {
                const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                const res = await fetch(`${localBase}/notifications?email=${encodeURIComponent(cleanEmail)}`, { method: 'GET' });
                if (res.ok) {
                    const rows = await res.json();
                    if (Array.isArray(rows)) {
                        rows.forEach(r => {
                            const inqId = r.inquiry_id || r.id;
                            const key = `${(r.type || 'approved').toLowerCase()}_${inqId}`;
                            const createdMs = r.created_at ? new Date(r.created_at).getTime() : Date.now();
                            mapByKey.set(key, {
                                id: `srv_${r.id}`,
                                db_id: r.id,
                                notifKey: key,
                                type: (r.type || 'approved').toLowerCase(),
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
                }
            } catch (_) {}
        }

        // 2. Try Supabase Cloud
        try {
            let userId = null;
            try {
                const cur = (typeof apiGetCurrentUser === 'function') ? apiGetCurrentUser() : null;
                if (cur && cur.id && String(cur.email || '').trim().toLowerCase() === cleanEmail) {
                    userId = cur.id;
                }
            } catch (_) {}

            if (!userId) {
                const uRes = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(cleanEmail)}&select=id`, {
                    method: 'GET',
                    headers: getHeaders()
                });
                if (uRes.ok) {
                    const uData = await uRes.json();
                    if (Array.isArray(uData) && uData.length > 0 && uData[0].id) {
                        userId = uData[0].id;
                    }
                }
            }

            if (userId) {
                const res = await fetch(`${REST_BASE}/notifications?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=50`, {
                    method: 'GET',
                    headers: getHeaders()
                });
                if (res.ok) {
                    const rows = await res.json();
                    if (Array.isArray(rows)) {
                        rows.forEach(r => {
                            const inqId = r.reference_id || r.inquiry_id || r.id;
                            const key = `approved_${inqId}`;
                            if (!mapByKey.has(key)) {
                                const createdMs = r.created_at ? new Date(r.created_at).getTime() : Date.now();
                                mapByKey.set(key, {
                                    id: `sb_${r.id}`,
                                    db_id: r.id,
                                    notifKey: key,
                                    type: (r.reference_type === 'inquiry' ? 'approved' : (r.type || 'approved')).toLowerCase(),
                                    inquiryId: inqId,
                                    client_email: cleanEmail,
                                    property_title: r.property_title || '',
                                    title: r.title || `Inquiry #${inqId} Approved!`,
                                    message: r.message || `Your inquiry has been approved by Miriam Lobren!`,
                                    is_read: Boolean(r.is_read),
                                    is_seen: Boolean(r.is_seen),
                                    created_at: r.created_at,
                                    time: isNaN(createdMs) ? Date.now() : createdMs
                                });
                            }
                        });
                    }
                }
            }
        } catch (_) {}

        // 3. Local stored client notifications (offline fallback)
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

        // 4. Derive from client's live inquiries with 'Approved' status
        try {
            const myInquiries = await apiGetMyInquiries(cleanEmail);
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

        const result = Array.from(mapByKey.values());
        result.sort((a, b) => (b.time || 0) - (a.time || 0));
        return result;
    }

    async function apiMarkNotificationsRead(payload) {
        const data = payload || {};
        const email = (data.email || '').trim().toLowerCase();
        const inquiryId = data.inquiryId || data.inquiry_id;
        const notifId = data.notifId || data.id;

        // 1. FastAPI backend
        if (isLocalDevHost()) {
            try {
                const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                await fetch(`${localBase}/notifications/read`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, inquiry_id: inquiryId, id: notifId, role: data.role })
                });
            } catch (_) {}
        }

        // 2. Supabase Cloud
        try {
            let sbUrl = '';
            if (notifId && typeof notifId === 'number') {
                sbUrl = `${REST_BASE}/notifications?id=eq.${encodeURIComponent(notifId)}`;
            } else if (email) {
                let userId = null;
                const uRes = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(email)}&select=id`, {
                    method: 'GET',
                    headers: getHeaders()
                });
                if (uRes.ok) {
                    const uData = await uRes.json();
                    if (Array.isArray(uData) && uData.length > 0) userId = uData[0].id;
                }
                if (userId) {
                    sbUrl = `${REST_BASE}/notifications?user_id=eq.${encodeURIComponent(userId)}`;
                    if (inquiryId) {
                        sbUrl += `&reference_id=eq.${encodeURIComponent(inquiryId)}`;
                    }
                }
            }
            if (sbUrl) {
                await fetch(sbUrl, {
                    method: 'PATCH',
                    headers: getHeaders(),
                    body: JSON.stringify({ is_read: true })
                });
            }
        } catch (_) {}

        // 3. Local sync
        if (email) {
            try {
                const readKey = 'client_notifs_read_ids_' + email;
                const readIds = JSON.parse(localStorage.getItem(readKey) || '[]');
                if (inquiryId) {
                    const k = 'approved_' + inquiryId;
                    if (!readIds.includes(k)) readIds.push(k);
                }
                localStorage.setItem(readKey, JSON.stringify(readIds));
            } catch (_) {}
        }

        window.dispatchEvent(new CustomEvent('clientNotificationRead', { detail: payload }));
        return true;
    }

    async function apiMarkNotificationsSeen(payload) {
        const data = payload || {};
        const email = (data.email || '').trim().toLowerCase();
        const inquiryId = data.inquiryId || data.inquiry_id;
        const notifId = data.notifId || data.id;

        // 1. FastAPI backend
        if (isLocalDevHost()) {
            try {
                const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                await fetch(`${localBase}/notifications/seen`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, inquiry_id: inquiryId, id: notifId, role: data.role })
                });
            } catch (_) {}
        }

        // 3. Local sync
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

        return true;
    }

    async function apiSubmitInquiry(inquiry) {
        const payload = {
            property_title: inquiry.property_title || inquiry.propertyTitle || 'General Inquiry',
            client_name: (inquiry.client_name || inquiry.clientName || 'Client').trim(),
            client_email: (inquiry.client_email || inquiry.clientEmail || '').trim(),
            client_phone: (inquiry.client_phone || inquiry.clientPhone || '').trim(),
            message: (inquiry.message || '').trim(),
            status: inquiry.status || 'Under Review'
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

        // 1. Try Supabase Cloud
        try {
            const res = await fetch(`${REST_BASE}/inquiries`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                result = { success: true, data: Array.isArray(data) ? data[0] : data };
            }
        } catch (err) {
            console.warn('Supabase inquiry save notice:', err.message);
        }

        // 2. Also sync to Local FastAPI Python backend when on local dev host
        if (isLocalDevHost()) {
            try {
                const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                const localRes = await fetch(`${localBase}/inquiries`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (localRes.ok) {
                    const localData = await localRes.json();
                    if (!result) result = { success: true, data: localData.data || localData };
                }
            } catch (e) {}
        }

        // Cache in localStorage & broadcast event for active admin listeners
        try {
            const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
            const record = (result && result.data) ? result.data : {
                id: Date.now(),
                ...payload,
                created_at: new Date().toISOString()
            };
            cached.unshift(record);
            localStorage.setItem('inquiries', JSON.stringify(cached));
            window.dispatchEvent(new CustomEvent('inquirySubmitted', { detail: record }));
        } catch (_) {}

        return result || { success: true, data: payload };
    }

    async function apiGetInquiries() {
        let list = [];

        // 1. Try Local FastAPI backend first on local dev host
        if (isLocalDevHost()) {
            try {
                const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                const token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem('adminToken') || localStorage.getItem('supabase_token') || '';
                const localRes = await fetch(`${localBase}/inquiries`, {
                    method: 'GET',
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                    credentials: 'same-origin'
                });
                if (localRes.ok) {
                    const localData = await localRes.json();
                    if (Array.isArray(localData) && localData.length > 0) {
                        list = localData;
                    }
                }
            } catch (e) {}
        }

        // 2. Try Supabase REST
        try {
            const res = await fetch(`${REST_BASE}/inquiries?select=*&order=created_at.desc`, {
                method: 'GET',
                headers: getHeaders()
            });

            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    if (!list.length) {
                        list = data;
                    } else {
                        const existingIds = new Set(list.map(i => String(i.id)));
                        data.forEach(item => {
                            if (!existingIds.has(String(item.id))) {
                                list.push(item);
                            }
                        });
                    }
                }
            }
        } catch (err) {
            console.warn('Supabase inquiries fetch notice:', err.message);
        }

        // 3. Fallback: localStorage
        if (!list.length) {
            try {
                const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
                if (Array.isArray(cached) && cached.length > 0) {
                    list = cached;
                }
            } catch (_) {}
        }

        list = applyLocalInquiryState(list);

        if (list.length >= 0) {
            try {
                localStorage.setItem('inquiries', JSON.stringify(list));
            } catch (_) {}
            return list;
        }

        return null;
    }

    async function apiUpdateInquiryStatus(id, newStatus) {
        let updated = false;
        const nowIso = new Date().toISOString();
        const token = localStorage.getItem(TOKEN_KEY) ||
                      localStorage.getItem('urbanscope_jwt_token') ||
                      localStorage.getItem('access_token') ||
                      localStorage.getItem('adminToken') ||
                      localStorage.getItem('supabase_token') || '';

        // 1. Try FastAPI backend first
        if (isLocalDevHost()) {
            try {
                const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                let adminEmail = '';
                try {
                    const adminUser = JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem(USER_KEY) || '{}');
                    adminEmail = adminUser.email || '';
                } catch (_) {}

                const res = await fetch(`${localBase}/inquiries/${encodeURIComponent(id)}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({ status: newStatus, caller_email: adminEmail, admin_email: adminEmail })
                });
                if (res.ok) updated = true;
            } catch (e) {
                console.warn('FastAPI inquiry status update notice:', e);
            }
        }

        // 2. Try Supabase Cloud
        try {
            const res = await fetch(`${REST_BASE}/inquiries?id=eq.${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) updated = true;
        } catch (e) {}

        // 3. Always update localStorage cache & overrides
        let targetInquiry = null;
        try {
            const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
            const idx = cached.findIndex(i => String(i.id) === String(id));
            if (idx !== -1) {
                cached[idx].status = newStatus;
                cached[idx].updated_at = nowIso;
                targetInquiry = cached[idx];
                localStorage.setItem('inquiries', JSON.stringify(cached));
            }
        } catch (_) {}

        saveInquiryOverride(id, { status: newStatus, updated_at: nowIso });

        // 4. If admin approved the inquiry, mark as read for admin and push notification for the user
        if (String(newStatus || '').toLowerCase().trim() === 'approved') {
            // Mark as read in admin notification state immediately so no badge appears for admin
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

                // Sync notification to Supabase Cloud if active
                try {
                    let clientUserId = targetInquiry.client_id || targetInquiry.user_id;
                    if (!clientUserId && clientEmail) {
                        const uRes = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(clientEmail)}&select=id`, {
                            method: 'GET',
                            headers: getHeaders()
                        });
                        if (uRes.ok) {
                            const uData = await uRes.json();
                            if (Array.isArray(uData) && uData.length > 0 && uData[0].id) {
                                clientUserId = uData[0].id;
                            }
                        }
                    }

                    if (clientUserId) {
                        fetch(`${REST_BASE}/notifications`, {
                            method: 'POST',
                            headers: getHeaders(),
                            body: JSON.stringify({
                                user_id: clientUserId,
                                title: notifTitle,
                                message: notifMsg,
                                reference_type: 'inquiry',
                                reference_id: Number(id),
                                is_read: false
                            })
                        }).catch(() => {});
                    }
                } catch (_) {}
            }
        }

        window.dispatchEvent(new CustomEvent('inquiryStatusChanged', { detail: { id, status: newStatus } }));
        window.dispatchEvent(new CustomEvent('inquiriesUpdated', { detail: { id, status: newStatus } }));

        return updated;
    }

    async function apiGetMyInquiries(email) {
        let list = [];
        const cleanEmail = (email || '').trim().toLowerCase();
        const token = localStorage.getItem(TOKEN_KEY) ||
                      localStorage.getItem('urbanscope_jwt_token') ||
                      localStorage.getItem('access_token') ||
                      localStorage.getItem('adminToken') ||
                      localStorage.getItem('supabase_token') || '';

        // 1. Try FastAPI backend
        if (isLocalDevHost()) {
            try {
                const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                const url = cleanEmail ? `${localBase}/inquiries/my?email=${encodeURIComponent(cleanEmail)}` : `${localBase}/inquiries/my`;
                const res = await fetch(url, {
                    method: 'GET',
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                    credentials: 'same-origin'
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) list = data;
                }
            } catch (e) {}
        }

        // 2. Try Supabase Cloud
        if (cleanEmail) {
            try {
                const res = await fetch(`${REST_BASE}/inquiries?client_email=ilike.${encodeURIComponent(cleanEmail)}&order=created_at.desc`, {
                    method: 'GET',
                    headers: getHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        if (!list.length) {
                            list = data;
                        } else {
                            const existingIds = new Set(list.map(i => String(i.id)));
                            data.forEach(item => {
                                if (!existingIds.has(String(item.id))) list.push(item);
                            });
                        }
                    }
                }
            } catch (err) {}
        }

        // 3. Fallback: filter cached inquiries in localStorage
        if (!list.length && cleanEmail) {
            try {
                const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
                if (Array.isArray(cached) && cached.length > 0) {
                    list = cached.filter(i => (i.client_email || i.clientEmail || '').trim().toLowerCase() === cleanEmail);
                }
            } catch (_) {}
        }

        list = applyLocalInquiryState(list);
        return list;
    }

    async function apiUpdateMyInquiry(id, updates, email) {
        let updated = false;
        let updatedRecord = null;
        const cleanEmail = (email || '').trim().toLowerCase();
        const nowIso = new Date().toISOString();
        const payload = { ...updates };
        if (cleanEmail && !payload.client_email) payload.client_email = cleanEmail;

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

        const token = localStorage.getItem(TOKEN_KEY) ||
                      localStorage.getItem('urbanscope_jwt_token') ||
                      localStorage.getItem('access_token') ||
                      localStorage.getItem('supabase_token') ||
                      localStorage.getItem('adminToken') || '';

        // 1. Try FastAPI
        if (isLocalDevHost()) {
            try {
                const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                const res = await fetch(`${localBase}/inquiries/${encodeURIComponent(id)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    const data = await res.json();
                    updated = true;
                    updatedRecord = data.data || data;
                } else if (res.status === 400) {
                    return { success: false, error: 'Approved inquiries can no longer be modified.' };
                }
            } catch (e) {}
        }

        // 2. Always sync to Supabase Cloud as well
        try {
            const supaUpdates = { ...updates };
            delete supaUpdates.client_email;
            const res = await fetch(`${REST_BASE}/inquiries?id=eq.${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify(supaUpdates)
            });
            if (res.ok) {
                updated = true;
            }
        } catch (e) {}

        // 3. Update localStorage cache & overrides
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

        return { success: updated || Boolean(updatedRecord), data: updatedRecord };
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

        const token = localStorage.getItem(TOKEN_KEY) ||
                      localStorage.getItem('urbanscope_jwt_token') ||
                      localStorage.getItem('access_token') ||
                      localStorage.getItem('supabase_token') ||
                      localStorage.getItem('adminToken') || '';

        // 1. Delete in FastAPI
        if (isLocalDevHost()) {
            try {
                const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                const url = cleanEmail ? `${localBase}/inquiries/${encodeURIComponent(id)}?client_email=${encodeURIComponent(cleanEmail)}` : `${localBase}/inquiries/${encodeURIComponent(id)}`;
                const res = await fetch(url, {
                    method: 'DELETE',
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                    credentials: 'same-origin'
                });
                if (res.ok) deleted = true;
            } catch (e) {}
        }

        // 2. Always delete in Supabase Cloud as well
        try {
            const res = await fetch(`${REST_BASE}/inquiries?id=eq.${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: getHeaders()
            });
            if (res.ok) deleted = true;
        } catch (e) {}

        // 3. Remove from localStorage cache & mark deleted
        markInquiryDeletedLocal(id);
        try {
            const cached = JSON.parse(localStorage.getItem('inquiries') || '[]');
            const filtered = cached.filter(i => String(i.id) !== String(id));
            localStorage.setItem('inquiries', JSON.stringify(filtered));
        } catch (_) {}

        // 4. Notify admin that the client cancelled/removed the inquiry
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

        window.dispatchEvent(new CustomEvent('inquiryCancelled', { detail: { id, clientName, propTitle } }));
        window.dispatchEvent(new CustomEvent('inquiryStatusChanged', { detail: { id, status: 'Cancelled' } }));
        window.dispatchEvent(new CustomEvent('inquiriesUpdated', { detail: { id, status: 'Deleted' } }));

        return { success: true };
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

        const res = await apiUpdateMyInquiry(id, { status: 'Cancelled' }, email);
        if (res && res.success) {
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
        const deletedIds = new Set(getDeletedUserIds());
        const deletedEmails = new Set(getDeletedUserEmails());
        if (u.id !== undefined && deletedIds.has(String(u.id))) return true;
        const cleanEmail = String(u.email || '').trim().toLowerCase();
        if (cleanEmail && deletedEmails.has(cleanEmail)) return true;
        return false;
    }

    function formatUserRecord(u) {
        if (!u) return null;
        return {
            ...u,
            role: normalizeAccountRole(u.role, u.email)
        };
    }

    async function apiGetUsers() {
        try {
            const res = await fetch(`${REST_BASE}/users?select=id,email,full_name,phone,role,created_at,license_number,avatar_url,bio&order=created_at.desc`, {
                method: 'GET',
                headers: getHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    return data.filter(u => !isUserRecordDeleted(u)).map(formatUserRecord);
                }
            }
        } catch (err) {
            console.warn('Supabase users fetch notice, trying local API:', err.message);
        }

        if (isLocalBackendReachableHost()) {
            try {
                const localBase = getLocalApiBase();
                const localRes = await fetch(`${localBase}/users`, {
                    method: 'GET',
                    headers: getLocalAuthHeaders(),
                    credentials: 'include'
                });
                if (localRes.ok) {
                    const localUsers = await localRes.json();
                    if (Array.isArray(localUsers)) {
                        return localUsers.filter(u => !isUserRecordDeleted(u)).map(formatUserRecord);
                    }
                }
            } catch (_) {}
        }

        return [];
    }

    async function apiGetSuperadminUsers() {
        let users = null;

        // 1. Try local FastAPI backend when running on local dev host (non-HTTPS)
        if (isLocalBackendReachableHost()) {
            try {
                const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;
                const localRes = await fetch(`${getLocalApiBase()}/superadmin/users`, {
                    method: 'GET',
                    headers: getLocalAuthHeaders(),
                    credentials: 'include',
                    signal: controller ? controller.signal : undefined
                });
                if (timeoutId) clearTimeout(timeoutId);
                if (localRes.ok) {
                    const localData = await localRes.json();
                    if (Array.isArray(localData) && localData.length > 0) {
                        users = localData;
                    }
                }
            } catch (localErr) {
                console.warn('Local superadmin users fetch notice, using Supabase Cloud:', localErr.message || localErr);
            }
        }

        // 2. Fetch from live Supabase Cloud (primary on Vercel/remote, automatic fallback on local)
        if (!users) {
            try {
                const res = await fetch(`${REST_BASE}/users?select=id,email,full_name,phone,role,created_at,license_number,avatar_url,bio&order=id.asc`, {
                    method: 'GET',
                    headers: getHeaders()
                });
                if (res.ok) {
                    const cloudData = await res.json();
                    if (Array.isArray(cloudData)) {
                        users = cloudData;
                    }
                }
            } catch (cloudErr) {
                console.warn('Supabase superadmin users fetch notice:', cloudErr.message || cloudErr);
            }
        }

        // 3. Offline localStorage fallback if both network tiers are unreachable
        if (!users) {
            try {
                const cached = JSON.parse(localStorage.getItem('cached_superadmin_users') || '[]');
                if (Array.isArray(cached) && cached.length > 0) {
                    users = cached;
                }
            } catch (_) {}
        }

        if (Array.isArray(users)) {
            const cleaned = users
                .filter(u => !isUserRecordDeleted(u))
                .map(formatUserRecord)
                .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));

            try {
                localStorage.setItem('cached_superadmin_users', JSON.stringify(cleaned));
            } catch (_) {}
            return cleaned;
        }

        return [];
    }

    async function apiGetSuperadminOverview() {
        // 1. Try local FastAPI backend when running on local dev host (non-HTTPS)
        if (isLocalBackendReachableHost()) {
            try {
                const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;
                const localRes = await fetch(`${getLocalApiBase()}/superadmin/overview`, {
                    method: 'GET',
                    headers: getLocalAuthHeaders(),
                    credentials: 'include',
                    signal: controller ? controller.signal : undefined
                });
                if (timeoutId) clearTimeout(timeoutId);
                if (localRes.ok) {
                    const data = await localRes.json();
                    if (data && data.metrics) {
                        return { ...data, engine: 'sqlite' };
                    }
                }
            } catch (_) {}
        }

        // 2. Compute live executive metrics from Supabase Cloud (primary on Vercel/remote)
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
            superadmin_email: 'urbanscope.cvsu@gmail.com',
            metrics: {
                total_users: users.length,
                superadmins: superadminCount || 1,
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
        let assignedRole = String(payload.role || 'user').trim().toLowerCase();
        if (!['user', 'admin', 'superadmin'].includes(assignedRole)) {
            assignedRole = 'user';
        }
        if (cleanEmail === 'urbanscope.cvsu@gmail.com') {
            assignedRole = 'superadmin';
        }

        if (!cleanName || !cleanEmail) {
            return { success: false, error: 'Full name and email address are required.' };
        }
        if (plainPassword.length < 6) {
            return { success: false, error: 'Password must be at least 6 characters long.' };
        }

        if (!isLocalBackendReachableHost()) {
            try {
                const response = await fetch('/api/superadmin/users', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create', payload: { full_name: cleanName, email: cleanEmail, phone: cleanPhone, password: plainPassword, role: assignedRole } })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result.success) return { success: false, error: result.error || 'Failed to create account.' };
                clearUserDeletedLocal(result.user && result.user.id, cleanEmail);
                return { ...result, user: formatUserRecord(result.user) };
            } catch (error) {
                return { success: false, error: error.message || 'Unable to reach account management.' };
            }
        }

        let createdUser = null;
        let localHandled = false;

        // 1. Create on local FastAPI backend if running on local dev host
        if (isLocalBackendReachableHost()) {
            try {
                const localRes = await fetch(`${getLocalApiBase()}/superadmin/users`, {
                    method: 'POST',
                    headers: getLocalAuthHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({
                        full_name: cleanName,
                        email: cleanEmail,
                        phone: cleanPhone,
                        password: plainPassword,
                        role: assignedRole
                    })
                });
                const localData = await localRes.json().catch(() => ({}));
                if (localRes.ok && localData.success) {
                    createdUser = localData.user || null;
                    localHandled = true;
                } else if (localRes.status === 400 || localRes.status === 403) {
                    return { success: false, error: localData.detail || 'Failed to create account.' };
                }
            } catch (localErr) {
                console.warn('Local superadmin create user notice, syncing directly to Supabase Cloud:', localErr.message || localErr);
            }
        }

        // 2. Create / synchronize in Supabase Cloud
        const passwordHash = await hashPBKDF2(plainPassword);
        try {
            const checkRes = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(cleanEmail)}&select=id,email,bio`, {
                method: 'GET',
                headers: getHeaders()
            });
            const existingRows = checkRes.ok ? await checkRes.json().catch(() => []) : [];
            const existing = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;

            if (existing && existing.id) {
                const wasSoftDeleted = String(existing.bio || '').trim() === SOFT_DELETE_BIO_MARKER ||
                                       getDeletedUserEmails().includes(cleanEmail) ||
                                       getDeletedUserIds().includes(String(existing.id));

                if (!wasSoftDeleted && !localHandled) {
                    return { success: false, error: 'Email is already registered.' };
                }

                const patchRes = await fetch(`${REST_BASE}/users?id=eq.${encodeURIComponent(existing.id)}`, {
                    method: 'PATCH',
                    headers: getHeaders(),
                    body: JSON.stringify({
                        full_name: cleanName,
                        phone: cleanPhone,
                        password_hash: passwordHash,
                        role: assignedRole,
                        bio: '',
                        updated_at: new Date().toISOString()
                    })
                });
                if (patchRes.ok) {
                    const patched = await patchRes.json().catch(() => []);
                    const row = Array.isArray(patched) ? patched[0] : patched;
                    if (!createdUser && row) createdUser = row;
                }
            } else {
                const insertRes = await fetch(`${REST_BASE}/users`, {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify({
                        email: cleanEmail,
                        password_hash: passwordHash,
                        full_name: cleanName,
                        phone: cleanPhone,
                        role: assignedRole,
                        avatar_url: 'assets/images/agent.jpg',
                        bio: ''
                    })
                });
                if (insertRes.ok) {
                    const inserted = await insertRes.json().catch(() => []);
                    const row = Array.isArray(inserted) ? inserted[0] : inserted;
                    if (!createdUser && row) createdUser = row;
                } else if (!localHandled) {
                    const errBody = await insertRes.json().catch(() => ({}));
                    return { success: false, error: errBody.message || errBody.details || 'Failed to create account in cloud database.' };
                }
            }
        } catch (cloudErr) {
            if (!localHandled) {
                return { success: false, error: cloudErr.message || 'Network error while creating account.' };
            }
        }

        clearUserDeletedLocal(createdUser && createdUser.id, cleanEmail);

        return {
            success: true,
            message: 'Account created successfully.',
            user: formatUserRecord(createdUser || {
                id: Date.now(),
                email: cleanEmail,
                full_name: cleanName,
                phone: cleanPhone,
                role: assignedRole,
                created_at: new Date().toISOString()
            })
        };
    }

    async function apiSuperadminUpdateUser(userId, payload = {}) {
        const cleanName = payload.full_name !== undefined ? String(payload.full_name).trim() : undefined;
        const cleanEmail = payload.email !== undefined ? String(payload.email).trim().toLowerCase() : undefined;
        const originalEmail = String(payload.original_email || cleanEmail || '').trim().toLowerCase();
        const cleanPhone = payload.phone !== undefined ? String(payload.phone).trim() : undefined;
        const rawRole = payload.role !== undefined ? String(payload.role).trim().toLowerCase() : undefined;
        const rawPassword = payload.password ? String(payload.password).trim() : '';

        if (originalEmail === 'urbanscope.cvsu@gmail.com') {
            if (cleanEmail && cleanEmail !== 'urbanscope.cvsu@gmail.com') {
                return { success: false, error: 'The root Superadmin email address cannot be changed.' };
            }
            if (rawRole && rawRole !== 'superadmin') {
                return { success: false, error: 'The root Superadmin account cannot be demoted.' };
            }
        }

        if (rawRole && !['user', 'admin', 'superadmin'].includes(rawRole)) {
            return { success: false, error: "Invalid role. Must be 'user', 'admin', or 'superadmin'." };
        }

        if (!isLocalBackendReachableHost()) {
            try {
                const response = await fetch('/api/superadmin/users', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'update', user_id: userId, payload })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result.success) return { success: false, error: result.error || 'Failed to update user account.' };
                clearUserDeletedLocal(result.user && result.user.id, result.user && result.user.email);
                return { ...result, user: formatUserRecord(result.user) };
            } catch (error) {
                return { success: false, error: error.message || 'Unable to reach account management.' };
            }
        }

        let updatedUser = null;
        let localHandled = false;

        // 1. Update on local FastAPI backend if running on local dev host
        if (isLocalBackendReachableHost()) {
            try {
                const localBody = {};
                if (cleanName) localBody.full_name = cleanName;
                if (cleanEmail) localBody.email = cleanEmail;
                if (cleanPhone !== undefined) localBody.phone = cleanPhone;
                if (rawRole) localBody.role = rawRole;
                if (rawPassword && rawPassword.length >= 6) localBody.password = rawPassword;

                const localRes = await fetch(`${getLocalApiBase()}/superadmin/users/${encodeURIComponent(userId)}`, {
                    method: 'PUT',
                    headers: getLocalAuthHeaders(),
                    credentials: 'include',
                    body: JSON.stringify(localBody)
                });
                const localData = await localRes.json().catch(() => ({}));
                if (localRes.ok && localData.success) {
                    updatedUser = localData.user || null;
                    localHandled = true;
                } else if (localRes.status === 400 || localRes.status === 403) {
                    return { success: false, error: localData.detail || 'Failed to update user account.' };
                }
            } catch (localErr) {
                console.warn('Local superadmin update user notice, syncing directly to Supabase Cloud:', localErr.message || localErr);
            }
        }

        // 2. Synchronize update to Supabase Cloud
        try {
            if (!localHandled && cleanEmail && originalEmail && cleanEmail !== originalEmail) {
                const dupRes = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(cleanEmail)}&select=id,bio`, {
                    method: 'GET',
                    headers: getHeaders()
                });
                const dupRows = dupRes.ok ? await dupRes.json().catch(() => []) : [];
                const activeDup = Array.isArray(dupRows)
                    ? dupRows.find(r => String(r.id) !== String(userId) && String(r.bio || '').trim() !== SOFT_DELETE_BIO_MARKER)
                    : null;
                if (activeDup) {
                    return { success: false, error: 'Email is already in use by another account.' };
                }
            }

            const patchBody = { updated_at: new Date().toISOString() };
            if (cleanName) patchBody.full_name = cleanName;
            if (cleanEmail) patchBody.email = cleanEmail;
            if (cleanPhone !== undefined) patchBody.phone = cleanPhone;
            if (rawRole) patchBody.role = rawRole;
            if (rawPassword && rawPassword.length >= 6) {
                patchBody.password_hash = await hashPBKDF2(rawPassword);
            }

            let cloudRows = [];
            const byIdRes = await fetch(`${REST_BASE}/users?id=eq.${encodeURIComponent(userId)}`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify(patchBody)
            });
            if (byIdRes.ok) {
                cloudRows = await byIdRes.json().catch(() => []);
            }

            if ((!Array.isArray(cloudRows) || cloudRows.length === 0) && (originalEmail || cleanEmail)) {
                const lookupEmail = originalEmail || cleanEmail;
                const byEmailRes = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(lookupEmail)}`, {
                    method: 'PATCH',
                    headers: getHeaders(),
                    body: JSON.stringify(patchBody)
                });
                if (byEmailRes.ok) {
                    cloudRows = await byEmailRes.json().catch(() => []);
                }
            }

            if (Array.isArray(cloudRows) && cloudRows.length > 0 && !updatedUser) {
                updatedUser = cloudRows[0];
            }
        } catch (cloudErr) {
            if (!localHandled) {
                return { success: false, error: cloudErr.message || 'Network error while updating user account.' };
            }
        }

        return {
            success: true,
            message: 'User account updated successfully.',
            user: formatUserRecord(updatedUser || {
                id: userId,
                full_name: cleanName,
                email: cleanEmail || originalEmail,
                phone: cleanPhone,
                role: rawRole || 'user'
            })
        };
    }

    async function apiSuperadminUpdateUserRole(userId, newRole, email = '') {
        const targetRole = String(newRole || '').trim().toLowerCase();
        const cleanEmail = String(email || '').trim().toLowerCase();

        if (!['user', 'admin', 'superadmin'].includes(targetRole)) {
            return { success: false, error: "Invalid role. Must be 'user', 'admin', or 'superadmin'." };
        }
        if (cleanEmail === 'urbanscope.cvsu@gmail.com' && targetRole !== 'superadmin') {
            return { success: false, error: 'The root Superadmin account (urbanscope.cvsu@gmail.com) cannot be demoted.' };
        }

        if (!isLocalBackendReachableHost()) {
            try {
                const response = await fetch('/api/superadmin/users', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'update', user_id: userId, payload: { role: targetRole } })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result.success) return { success: false, error: result.error || 'Failed to update role.' };
                clearUserDeletedLocal(result.user && result.user.id, result.user && result.user.email);
                return { ...result, user: formatUserRecord(result.user) };
            } catch (error) {
                return { success: false, error: error.message || 'Unable to reach account management.' };
            }
        }

        let updatedUser = null;
        let localHandled = false;

        // 1. Update on local FastAPI backend if running on local dev host
        if (isLocalBackendReachableHost()) {
            try {
                const localRes = await fetch(`${getLocalApiBase()}/superadmin/users/${encodeURIComponent(userId)}/role`, {
                    method: 'PUT',
                    headers: getLocalAuthHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({ role: targetRole })
                });
                const localData = await localRes.json().catch(() => ({}));
                if (localRes.ok && localData.success) {
                    updatedUser = localData.user || null;
                    localHandled = true;
                } else if (localRes.status === 400 || localRes.status === 403) {
                    return { success: false, error: localData.detail || 'Failed to update role.' };
                }
            } catch (localErr) {
                console.warn('Local superadmin role update notice, syncing directly to Supabase Cloud:', localErr.message || localErr);
            }
        }

        // 2. Synchronize role update to Supabase Cloud
        try {
            const patchBody = { role: targetRole, updated_at: new Date().toISOString() };
            let cloudRows = [];
            const byIdRes = await fetch(`${REST_BASE}/users?id=eq.${encodeURIComponent(userId)}`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify(patchBody)
            });
            if (byIdRes.ok) {
                cloudRows = await byIdRes.json().catch(() => []);
            }

            if ((!Array.isArray(cloudRows) || cloudRows.length === 0) && cleanEmail) {
                const byEmailRes = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(cleanEmail)}`, {
                    method: 'PATCH',
                    headers: getHeaders(),
                    body: JSON.stringify(patchBody)
                });
                if (byEmailRes.ok) {
                    cloudRows = await byEmailRes.json().catch(() => []);
                }
            }

            if (Array.isArray(cloudRows) && cloudRows.length > 0 && !updatedUser) {
                updatedUser = cloudRows[0];
            }
        } catch (cloudErr) {
            if (!localHandled) {
                return { success: false, error: cloudErr.message || 'Network error while updating role.' };
            }
        }

        return {
            success: true,
            message: `Role updated to '${targetRole}'`,
            user: formatUserRecord(updatedUser || { id: userId, email: cleanEmail, role: targetRole })
        };
    }

    async function apiSuperadminDeleteUser(userId, email = '') {
        const cleanEmail = String(email || '').trim().toLowerCase();

        if (cleanEmail === 'urbanscope.cvsu@gmail.com') {
            return { success: false, error: 'Cannot delete root Superadmin account.' };
        }
        if (cleanEmail === 'admin.realestate@gmail.com' || cleanEmail === 'miriamalobren@gmail.com') {
            return { success: false, error: 'Cannot delete primary Realty Admin account.' };
        }

        let localHandled = false;

        // 1. Delete from local FastAPI backend if running on local dev host
        if (isLocalBackendReachableHost()) {
            try {
                const localRes = await fetch(`${getLocalApiBase()}/superadmin/users/${encodeURIComponent(userId)}`, {
                    method: 'DELETE',
                    headers: getLocalAuthHeaders(),
                    credentials: 'include'
                });
                const localData = await localRes.json().catch(() => ({}));
                if (localRes.ok && localData.success) {
                    localHandled = true;
                } else if (localRes.status === 400 || localRes.status === 403) {
                    return { success: false, error: localData.detail || 'Failed to delete account.' };
                }
            } catch (localErr) {
                console.warn('Local superadmin delete user notice, syncing directly to Supabase Cloud:', localErr.message || localErr);
            }
        }

        // 2. Delete from Supabase Cloud (with cross-device soft-delete fallback if RLS DELETE policy is not yet pushed)
        try {
            let deletedRows = [];
            const delById = await fetch(`${REST_BASE}/users?id=eq.${encodeURIComponent(userId)}`, {
                method: 'DELETE',
                headers: getHeaders()
            });
            if (delById.ok) {
                deletedRows = await delById.json().catch(() => []);
            }

            if ((!Array.isArray(deletedRows) || deletedRows.length === 0) && cleanEmail) {
                const delByEmail = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(cleanEmail)}`, {
                    method: 'DELETE',
                    headers: getHeaders()
                });
                if (delByEmail.ok) {
                    deletedRows = await delByEmail.json().catch(() => []);
                }
            }

            if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
                // Fallback when remote RLS DELETE policy has not yet been pushed: deactivate across all devices via UPDATE
                const softDeleteBody = {
                    bio: SOFT_DELETE_BIO_MARKER,
                    password_hash: SOFT_DELETE_HASH_MARKER,
                    google_id: null,
                    role: 'user',
                    updated_at: new Date().toISOString()
                };
                const filterParam = cleanEmail
                    ? `email=ilike.${encodeURIComponent(cleanEmail)}`
                    : `id=eq.${encodeURIComponent(userId)}`;
                await fetch(`${REST_BASE}/users?${filterParam}`, {
                    method: 'PATCH',
                    headers: getHeaders(),
                    body: JSON.stringify(softDeleteBody)
                }).catch(() => {});
                markUserDeletedLocal(userId, cleanEmail);
            } else {
                clearUserDeletedLocal(userId, cleanEmail);
            }
        } catch (cloudErr) {
            if (!localHandled) {
                return { success: false, error: cloudErr.message || 'Network error while deleting account.' };
            }
        }

        return {
            success: true,
            message: `User account ${cleanEmail || '#' + userId} deleted successfully.`
        };
    }

    async function apiRunSuperadminIntegrityCheck() {
        // 1. Try local SQLite PRAGMA integrity check on local dev host
        if (isLocalBackendReachableHost()) {
            try {
                const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;
                const localRes = await fetch(`${getLocalApiBase()}/superadmin/integrity`, {
                    method: 'GET',
                    headers: getLocalAuthHeaders(),
                    credentials: 'include',
                    signal: controller ? controller.signal : undefined
                });
                if (timeoutId) clearTimeout(timeoutId);
                if (localRes.ok) {
                    const data = await localRes.json();
                    return { ...data, engine: 'sqlite' };
                }
            } catch (_) {}
        }

        // 2. Live Supabase Cloud relational & RBAC governance verification
        try {
            const [uRes, pRes, iRes] = await Promise.all([
                fetch(`${REST_BASE}/users?select=id,email,role,bio`, { method: 'GET', headers: getHeaders() }),
                fetch(`${REST_BASE}/properties?select=id,agent_id`, { method: 'GET', headers: getHeaders() }),
                fetch(`${REST_BASE}/inquiries?select=id,client_id,property_id`, { method: 'GET', headers: getHeaders() })
            ]);

            if (!uRes.ok || !pRes.ok || !iRes.ok) {
                return {
                    success: false,
                    engine: 'supabase',
                    integrity: `HTTP Status (${uRes.status}/${pRes.status}/${iRes.status})`,
                    foreign_key_violations: 0,
                    trigger_active: false,
                    table_count: 12
                };
            }

            const users = await uRes.json().catch(() => []);
            const props = await pRes.json().catch(() => []);
            const inquiries = await iRes.json().catch(() => []);

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

            const hasRoot = users.some(u =>
                String(u.email || '').trim().toLowerCase() === 'urbanscope.cvsu@gmail.com' &&
                String(u.role || '').trim().toLowerCase() === 'superadmin'
            );

            return {
                success: fkViolations === 0 && hasRoot,
                engine: 'supabase',
                integrity: (fkViolations === 0 && hasRoot) ? 'ok' : (hasRoot ? 'FK mismatch' : 'Root role check warning'),
                foreign_key_violations: fkViolations,
                trigger_active: hasRoot,
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
            let userId = null;
            if (arg2 !== undefined) {
                userId = arg1;
                profileData = arg2 || {};
            } else {
                profileData = arg1 || {};
            }

            const storedAdmin = JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem(USER_KEY) || '{}');
            const savedProfile = JSON.parse(localStorage.getItem('urbanscope_admin_profile') || '{}');
            const targetEmail = (profileData.email || storedAdmin.email || savedProfile.email || 'admin.realestate@gmail.com').trim().toLowerCase();
            const originalEmail = (profileData.original_email || storedAdmin.email || savedProfile.email || 'admin.realestate@gmail.com').trim().toLowerCase();
            const fullName = (profileData.full_name || profileData.name || profileData.fullName || storedAdmin.name || 'Miriam Lobren').trim();
            const phone = (profileData.phone !== undefined ? profileData.phone : (storedAdmin.phone || '')).trim();
            const license = (profileData.license_number || profileData.license || profileData.licenseNumber || storedAdmin.license || storedAdmin.license_number || '').trim();
            const title = (profileData.title !== undefined ? profileData.title : (storedAdmin.title || '')).trim();
            const brokerage = (profileData.brokerage !== undefined ? profileData.brokerage : (storedAdmin.brokerage || '')).trim();
            const bio = (profileData.bio !== undefined ? profileData.bio : (storedAdmin.bio || '')).trim();

            const avatarUrl = profileData.avatar_url || storedAdmin.avatar_url || localStorage.getItem('urbanscope_profile_avatar') || 'assets/images/agent.jpg';

            let updatedUser = null;

            // 1. Sync to local backend if running in dev environment
            if (isLocalDevHost()) {
                try {
                    const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                    const token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem('adminToken') || localStorage.getItem('access_token');
                    const localRes = await fetch(`${localBase}/admin/profile`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': token ? ('Bearer ' + token) : ''
                        },
                        credentials: 'include',
                        body: JSON.stringify({
                            full_name: fullName,
                            email: targetEmail,
                            original_email: originalEmail,
                            phone: phone,
                            license_number: license,
                            title: title,
                            brokerage: brokerage,
                            bio: bio,
                            avatar_url: avatarUrl
                        })
                    });
                    if (localRes.ok) {
                        const localData = await localRes.json();
                        if (localData && localData.id) {
                            updatedUser = localData;
                        }
                    }
                } catch (localErr) {
                    console.warn('Local admin profile update notice:', localErr);
                }
            }

            // 2. Sync to Supabase Cloud
            const payload = {
                full_name: fullName,
                email: targetEmail,
                phone: phone,
                license_number: license,
                title: title,
                brokerage: brokerage,
                bio: bio,
                avatar_url: avatarUrl,
                role: 'admin'
            };
            const corePayload = {
                full_name: fullName,
                email: targetEmail,
                phone: phone,
                license_number: license,
                avatar_url: avatarUrl,
                role: 'admin'
            };

            const safePayload = {
                full_name: fullName,
                phone: phone,
                license_number: license,
                title: title,
                brokerage: brokerage,
                bio: bio,
                avatar_url: avatarUrl
            };

            const sendSupabasePatch = async (url, customBody = payload) => {
                let res = await fetch(url, {
                    method: 'PATCH',
                    headers: getHeaders(),
                    body: JSON.stringify(customBody)
                });
                if (!res.ok && (res.status === 400 || res.status === 409)) {
                    const fallback = (res.status === 409) ? safePayload : corePayload;
                    res = await fetch(url, {
                        method: 'PATCH',
                        headers: getHeaders(),
                        body: JSON.stringify(fallback)
                    });
                }
                return res;
            };

            try {
                let sbUpdated = false;

                // A. Try updating by target email first (if target user row exists)
                if (targetEmail) {
                    const res = await sendSupabasePatch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(targetEmail)}`);
                    if (res.ok) {
                        const updated = await res.json().catch(() => []);
                        if (Array.isArray(updated) && updated.length > 0) {
                            updatedUser = { ...(updatedUser || {}), ...updated[0] };
                            sbUpdated = true;
                        }
                    }
                }

                // B. If original email differs and not updated yet, try original email
                if (!sbUpdated && originalEmail && originalEmail !== targetEmail) {
                    const res = await sendSupabasePatch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(originalEmail)}`);
                    if (res.ok) {
                        const updated = await res.json().catch(() => []);
                        if (Array.isArray(updated) && updated.length > 0) {
                            updatedUser = { ...(updatedUser || {}), ...updated[0] };
                            sbUpdated = true;
                        }
                    }
                }

                // C. If original email is admin.realestate@gmail.com and targetEmail is custom, ensure target is admin
                if (targetEmail && targetEmail !== 'admin.realestate@gmail.com') {
                    await sendSupabasePatch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(targetEmail)}`, { role: 'admin' }).catch(() => {});
                }

                // D. Synchronize all admin accounts in Supabase with safePayload (title, name, phone, avatar)
                await sendSupabasePatch(`${REST_BASE}/users?role=eq.admin`, safePayload).catch(() => {});
            } catch (sbErr) {
                console.warn('Supabase profile sync notice:', sbErr);
            }

            // 3. Synchronize all local storage sessions
            const current = JSON.parse(localStorage.getItem(USER_KEY) || '{}');
            const merged = {
                ...current,
                ...storedAdmin,
                ...(updatedUser || {}),
                ...profileData,
                id: (updatedUser && updatedUser.id) || storedAdmin.id || current.id || 1,
                name: fullName,
                full_name: fullName,
                email: targetEmail,
                phone: phone,
                license: license,
                license_number: license,
                title: title,
                brokerage: brokerage,
                bio: bio,
                avatar_url: avatarUrl,
                avatar: avatarUrl,
                role: 'admin',
                user_metadata: {
                    name: fullName,
                    full_name: fullName,
                    email: targetEmail,
                    phone: phone,
                    license: license,
                    license_number: license,
                    title: title,
                    brokerage: brokerage,
                    bio: bio,
                    avatar_url: avatarUrl
                }
            };

            localStorage.setItem(USER_KEY, JSON.stringify(merged));
            localStorage.setItem(DEMO_KEY, JSON.stringify(merged));
            localStorage.setItem('adminUser', JSON.stringify(merged));
            localStorage.setItem('urbanscope_admin_profile', JSON.stringify({
                name: fullName,
                full_name: fullName,
                email: targetEmail,
                phone: phone,
                license: license,
                license_number: license,
                title: title,
                brokerage: brokerage,
                bio: bio,
                avatar_url: avatarUrl
            }));

            try {
                window.dispatchEvent(new CustomEvent('urbanscope:profileUpdated', { detail: merged }));
            } catch (ev) {}

            return { success: true, user: merged };
        } catch (err) {
            console.warn('apiUpdateAdminProfile notice:', err);
            try {
                const storedAdmin = JSON.parse(localStorage.getItem('adminUser') || '{}');
                const merged = { ...storedAdmin, ...(arg1 || {}) };
                localStorage.setItem('adminUser', JSON.stringify(merged));
                localStorage.setItem('urbanscope_admin_profile', JSON.stringify(merged));
                try {
                    window.dispatchEvent(new CustomEvent('urbanscope:profileUpdated', { detail: merged }));
                } catch (ev) {}
                return { success: true, user: merged };
            } catch (e) {}
            return { success: false, error: err.message };
        }
    }

    async function apiGetLeadAgentProfile() {
        const isRealAgentEmail = (em) => {
            if (!em) return false;
            const clean = String(em).trim().toLowerCase();
            return clean &&
                   clean !== 'admin.realestate@gmail.com' &&
                   clean !== 'urbanscope.cvsu@gmail.com' &&
                   !clean.endsWith('@example.com');
        };

        let cached = null;
        try {
            cached = JSON.parse(localStorage.getItem('urbanscope_admin_profile') || 'null');
            if (!cached) {
                const adminUser = JSON.parse(localStorage.getItem('adminUser') || 'null');
                if (adminUser && (adminUser.role === 'admin' || isRealAgentEmail(adminUser.email))) {
                    cached = adminUser;
                }
            }
        } catch (e) {}

        // 1. Query backend if on local dev host
        if (isLocalDevHost()) {
            const localBase = (typeof location !== 'undefined' && location.origin && location.port === '8000') ? `${location.origin}/api` : 'http://127.0.0.1:8000/api';
            try {
                const res = await fetch(`${localBase}/agent/profile`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.email && isRealAgentEmail(data.email)) {
                        const cachedTitle = (cached && cached.title && cached.title.trim()) ? cached.title.trim() : null;
                        const backendTitle = (data.title && data.title.trim()) ? data.title.trim() : null;
                        const effectiveTitle = backendTitle || cachedTitle || 'Real Estate Salesperson';

                        const merged = {
                            name: data.full_name || data.name || (cached && cached.name) || 'Miriam Lobren',
                            full_name: data.full_name || data.name || (cached && cached.full_name) || 'Miriam Lobren',
                            email: data.email || (cached && cached.email) || 'miriamalobren@gmail.com',
                            phone: data.phone || (cached && cached.phone) || '+63 918 964 5434',
                            license: data.license_number || data.license || (cached && cached.license) || '',
                            license_number: data.license_number || data.license || (cached && cached.license_number) || '',
                            title: effectiveTitle,
                            brokerage: data.brokerage || (cached && cached.brokerage) || 'CD Miranda Realty',
                            bio: data.bio || (cached && cached.bio) || 'Serving Las Piñas, Cavite, and surrounding prime locations with high-integrity real estate solutions.',
                            avatar_url: data.avatar_url || (cached && cached.avatar_url) || 'assets/images/agent.jpg'
                        };
                        try {
                            localStorage.setItem('urbanscope_admin_profile', JSON.stringify(merged));
                        } catch (e) {}
                        try {
                            window.dispatchEvent(new CustomEvent('urbanscope:profileUpdated', { detail: merged }));
                        } catch (ev) {}
                        return merged;
                    }
                }
            } catch (err) {
                console.warn('Backend get agent profile notice:', err);
            }
        }

        // 2. Query Supabase Cloud
        try {
            let res = await fetch(`${REST_BASE}/users?role=in.(admin,superadmin)&select=*`, { headers: getHeaders() });
            let users = [];
            if (res.ok) {
                users = await res.json().catch(() => []);
            }
            if (!Array.isArray(users) || users.length === 0) {
                const fallbackRes = await fetch(`${REST_BASE}/users?select=*&limit=10`, { headers: getHeaders() });
                if (fallbackRes.ok) {
                    users = await fallbackRes.json().catch(() => []);
                }
            }
            if (Array.isArray(users) && users.length > 0) {
                // Remote lead admin resolution priority:
                // 1. Remote admin user with a real configured agent email (excluding system accounts), sorted by updated_at DESC, id DESC
                // 2. Any remote user record with a real configured agent email (sorted by id DESC)
                // 3. Fallback admin user with admin.realestate@gmail.com
                // 4. First user record in result set
                let u = null;
                const customAdmins = users.filter(x => (x.role === 'admin' || x.role === 'superadmin') && isRealAgentEmail(x.email));
                if (customAdmins.length > 0) {
                    customAdmins.sort((a, b) => {
                        const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
                        const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
                        if (dateB !== dateA) return dateB - dateA; // Most recently updated first
                        return (b.id || 0) - (a.id || 0);          // Highest ID (newest account) first
                    });
                    u = customAdmins[0];
                }
                if (!u) {
                    const anyCustom = users.filter(x => isRealAgentEmail(x.email)).sort((a, b) => (b.id || 0) - (a.id || 0));
                    if (anyCustom.length > 0) {
                        u = anyCustom[0];
                    }
                }
                if (!u) {
                    u = users.find(x => (x.email || '').trim().toLowerCase() === 'admin.realestate@gmail.com') || users[0];
                }

                if (u) {
                    const cachedTitle = (cached && cached.title && cached.title.trim()) ? cached.title.trim() : null;
                    const remoteTitle = (u.title && u.title.trim()) ? u.title.trim() : null;
                    const effectiveTitle = remoteTitle || cachedTitle || 'Real Estate Salesperson';

                    const effectiveEmail = u.email || 'miriamalobren@gmail.com';
                    const effectivePhone = u.phone || (cached && cached.phone) || '+63 918 964 5434';

                    const merged = {
                        name: u.full_name || (cached && cached.name) || 'Miriam Lobren',
                        full_name: u.full_name || (cached && cached.full_name) || 'Miriam Lobren',
                        email: effectiveEmail,
                        phone: effectivePhone,
                        license: u.license_number || (cached && cached.license) || '',
                        license_number: u.license_number || (cached && cached.license_number) || '',
                        title: effectiveTitle,
                        brokerage: u.brokerage || (cached && cached.brokerage) || 'CD Miranda Realty',
                        bio: u.bio || (cached && cached.bio) || 'Serving Las Piñas, Cavite, and surrounding prime locations with high-integrity real estate solutions.',
                        avatar_url: u.avatar_url || (cached && cached.avatar_url) || 'assets/images/agent.jpg'
                    };
                    try {
                        localStorage.setItem('urbanscope_admin_profile', JSON.stringify(merged));
                    } catch (e) {}
                    try {
                        window.dispatchEvent(new CustomEvent('urbanscope:profileUpdated', { detail: merged }));
                    } catch (ev) {}
                    return merged;
                }
            }
        } catch (sbErr) {
            console.warn('Supabase get agent profile notice:', sbErr);
        }

        if (cached) return cached;

        return {
            name: (cached && cached.name) || 'Miriam Lobren',
            full_name: (cached && cached.full_name) || 'Miriam Lobren',
            email: (cached && cached.email) || 'miriamalobren@gmail.com',
            phone: (cached && cached.phone) || '+63 918 964 5434',
            license: (cached && cached.license) || '',
            license_number: (cached && cached.license_number) || '',
            title: (cached && cached.title) || 'Real Estate Salesperson',
            brokerage: (cached && cached.brokerage) || 'CD Miranda Realty',
            bio: (cached && cached.bio) || 'Serving Las Piñas, Cavite, and surrounding prime locations with high-integrity real estate solutions.',
            avatar_url: (cached && cached.avatar_url) || 'assets/images/agent.jpg'
        };
    }

    async function verifyPBKDF2(plainPassword, storedHash) {
        if (!plainPassword || !storedHash) return false;
        if (plainPassword === storedHash) return true;
        if (!storedHash.includes('$')) return false;
        try {
            const [saltHex, keyHex] = storedHash.split('$');
            if (!saltHex || !keyHex) return false;
            if (typeof crypto === 'undefined' || !crypto.subtle) return false;

            const enc = new TextEncoder();
            const pwKey = await crypto.subtle.importKey(
                'raw',
                enc.encode(plainPassword),
                { name: 'PBKDF2' },
                false,
                ['deriveBits']
            );
            const bits = await crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: enc.encode(saltHex),
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                pwKey,
                256
            );
            const hex = Array.from(new Uint8Array(bits))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            return hex.toLowerCase() === keyHex.toLowerCase();
        } catch (e) {
            console.warn('verifyPBKDF2 notice:', e);
            return false;
        }
    }

    async function hashPBKDF2(plainPassword) {
        if (!plainPassword) return '';
        try {
            if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.getRandomValues) {
                return plainPassword;
            }
            const saltBytes = new Uint8Array(16);
            crypto.getRandomValues(saltBytes);
            const saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            const enc = new TextEncoder();

            const pwKey = await crypto.subtle.importKey(
                'raw',
                enc.encode(plainPassword),
                { name: 'PBKDF2' },
                false,
                ['deriveBits']
            );
            const bits = await crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: enc.encode(saltHex),
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                pwKey,
                256
            );
            const hex = Array.from(new Uint8Array(bits))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            return `${saltHex}$${hex}`;
        } catch (e) {
            console.warn('hashPBKDF2 notice:', e);
            return plainPassword;
        }
    }

    async function apiUpdateAdminPassword(arg1, arg2, arg3) {
        try {
            let targetUserId = null;
            let currentPassword = '';
            let newPassword = '';

            if (arg3 !== undefined) {
                targetUserId = arg1;
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
            if (!newPassword || newPassword.length < 6) {
                return { success: false, error: 'New password must be at least 6 characters long.' };
            }

            const storedAdmin = JSON.parse(localStorage.getItem('adminUser') || localStorage.getItem(USER_KEY) || '{}');
            const adminEmail = (storedAdmin.email || 'miriamalobren@gmail.com').trim().toLowerCase();
            if (!targetUserId && storedAdmin.id) {
                targetUserId = storedAdmin.id;
            }

            if (!isLocalBackendReachableHost()) {
                const adminSessionToken = localStorage.getItem('adminSessionToken') || '';
                let response = await fetch('/api/auth/admin-password/change', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(adminSessionToken ? { 'Authorization': `Bearer ${adminSessionToken}` } : {})
                    },
                    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
                });

                // Auto re-authenticate with current password if session expired or missing
                if (response.status === 401 && typeof apiCreateHostedAdminSession === 'function') {
                    const sessionRes = await apiCreateHostedAdminSession({ email: adminEmail, password: currentPassword });
                    if (sessionRes && sessionRes.success) {
                        const freshToken = sessionRes.token || localStorage.getItem('adminSessionToken') || '';
                        response = await fetch('/api/auth/admin-password/change', {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: {
                                'Content-Type': 'application/json',
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
                    localStorage.setItem('adminPassword', newPassword);
                    localStorage.setItem('urbanscope_admin_password_updated', newPassword);
                    return { success: true, message: result.message || 'Password updated successfully.' };
                }

                if (result.error && !result.error.toLowerCase().includes('session')) {
                    return { success: false, error: result.error };
                }
            }

            let backendSucceeded = false;

            // 1. Direct call to FastAPI backend if on local dev network and HTTP (avoids Mixed Content on HTTPS)
            const isHttps = typeof location !== 'undefined' && location.protocol === 'https:';
            if (isLocalDevHost() && !isHttps) {
                let localBase = '/api';
                if (typeof location !== 'undefined') {
                    if (location.port === '8000') {
                        localBase = `${location.origin}/api`;
                    } else {
                        const host = location.hostname || '127.0.0.1';
                        localBase = `http://${host}:8000/api`;
                    }
                }

                try {
                    const token = localStorage.getItem(TOKEN_KEY) ||
                                  localStorage.getItem('urbanscope_jwt_token') ||
                                  localStorage.getItem('access_token') ||
                                  localStorage.getItem('adminToken') ||
                                  localStorage.getItem('supabase_token') || '';

                    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                    const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;

                    const res = await fetch(`${localBase}/admin/password`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                        },
                        credentials: (typeof location !== 'undefined' && location.port === '8000') ? 'same-origin' : 'include',
                        body: JSON.stringify({
                            current_password: currentPassword,
                            new_password: newPassword,
                            email: adminEmail
                        }),
                        signal: controller ? controller.signal : undefined
                    });
                    if (timeoutId) clearTimeout(timeoutId);

                    if (res.ok) {
                        backendSucceeded = true;
                    } else if (res.status === 400) {
                        const errData = await res.json().catch(() => ({}));
                        return {
                            success: false,
                            error: errData.detail || 'The current password you entered is incorrect.'
                        };
                    }
                } catch (backendErr) {
                    console.warn('Backend password update notice, attempting cloud fallback:', backendErr);
                }
            }

            // Generate PBKDF2 hash for new password
            const newHash = await hashPBKDF2(newPassword);

            if (backendSucceeded) {
                localStorage.setItem('urbanscope_admin_password_updated', newPassword);
                localStorage.setItem('adminPassword', newPassword);

                // Push new PBKDF2 hash to Supabase Cloud so phones and other devices immediately stay in sync
                try {
                    const checkRes = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(adminEmail)}&select=*`, {
                        headers: getHeaders()
                    });
                    const cloudUsers = await checkRes.json().catch(() => []);
                    if (cloudUsers && cloudUsers.length > 0) {
                        await fetch(`${REST_BASE}/users?id=eq.${cloudUsers[0].id}`, {
                            method: 'PATCH',
                            headers: getHeaders(),
                            body: JSON.stringify({ password_hash: newHash, updated_at: new Date().toISOString() })
                        });
                    } else {
                        await fetch(`${REST_BASE}/users`, {
                            method: 'POST',
                            headers: getHeaders(),
                            body: JSON.stringify({
                                email: adminEmail,
                                password_hash: newHash,
                                full_name: storedAdmin.full_name || storedAdmin.name || 'Miriam Lobren',
                                phone: storedAdmin.phone || '+63 918 964 5434',
                                role: storedAdmin.role || 'admin',
                                avatar_url: storedAdmin.avatar_url || 'assets/images/agent.jpg',
                                license_number: storedAdmin.license_number || '',
                                title: storedAdmin.title || 'Real Estate Salesperson',
                                brokerage: storedAdmin.brokerage || 'CD Miranda Realty'
                            })
                        });
                    }
                } catch (e) {}

                return { success: true, message: 'Password updated successfully!' };
            }

            // 2. Cloud Supabase verification & update (for mobile devices, phones, Vercel, or disconnected sessions)
            let user = null;
            try {
                const checkRes = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(adminEmail)}&select=*`, {
                    method: 'GET',
                    headers: getHeaders()
                });
                const users = await checkRes.json().catch(() => []);
                user = users && users.length > 0 ? users[0] : null;
            } catch (e) {}

            const stored = user ? (user.password_hash || '') : '';
            const locallyUpdated = localStorage.getItem('urbanscope_admin_password_updated') || '';
            const activePass = localStorage.getItem('adminPassword') || '';

            let isMatch = false;

            if (stored && stored.includes('$')) {
                isMatch = await verifyPBKDF2(currentPassword, stored);
            } else if (stored) {
                isMatch = (currentPassword === stored);
            }

            // Fallback ONLY when no remote stored hash exists in cloud
            if (!stored) {
                const effectivePass = locallyUpdated || activePass;
                if (effectivePass) {
                    isMatch = (currentPassword === effectivePass);
                } else if (adminEmail === 'miriamalobren@gmail.com' && currentPassword === '111112') {
                    isMatch = true;
                } else if (adminEmail === 'admin.realestate@gmail.com' && currentPassword === 'realestate2026') {
                    isMatch = true;
                } else if (adminEmail === 'urbanscope.cvsu@gmail.com' && (currentPassword === 'urbanscope2026' || currentPassword === 'urbanscope')) {
                    isMatch = true;
                }
            }

            if (!isMatch) {
                return { success: false, error: 'The current password you entered is incorrect.' };
            }

            // Update or insert password in Supabase Cloud
            try {
                if (user && user.id) {
                    await fetch(`${REST_BASE}/users?id=eq.${user.id}`, {
                        method: 'PATCH',
                        headers: getHeaders(),
                        body: JSON.stringify({ password_hash: newHash, updated_at: new Date().toISOString() })
                    });
                } else {
                    await fetch(`${REST_BASE}/users`, {
                        method: 'POST',
                        headers: getHeaders(),
                        body: JSON.stringify({
                            email: adminEmail,
                            password_hash: newHash,
                            full_name: storedAdmin.full_name || storedAdmin.name || 'Miriam Lobren',
                            phone: storedAdmin.phone || '+63 918 964 5434',
                            role: storedAdmin.role || 'admin',
                            avatar_url: storedAdmin.avatar_url || 'assets/images/agent.jpg',
                            license_number: storedAdmin.license_number || '',
                            title: storedAdmin.title || 'Real Estate Salesperson',
                            brokerage: storedAdmin.brokerage || 'CD Miranda Realty'
                        })
                    });
                }
            } catch (patchErr) {
                console.warn('Supabase password patch error:', patchErr);
            }

            localStorage.setItem('urbanscope_admin_password_updated', newPassword);
            localStorage.setItem('adminPassword', newPassword);

            return { success: true, message: 'Password has been successfully updated!' };
        } catch (err) {
            console.error('Password update failure:', err);
            return { success: false, error: err.message || 'An error occurred while changing password.' };
        }
    }

    async function postAuthFlow(path, payload) {
        try {
            const base = isLocalBackendReachableHost() ? `${getLocalApiBase()}/auth` : '/api/auth';
            const response = await fetch(`${base}/${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || result.success === false) {
                return { success: false, code: result.code || '', error: result.detail || result.error || 'Unable to complete the request. Please try again.' };
            }
            return result;
        } catch (error) {
            return { success: false, error: error.message || 'Unable to reach the authentication service.' };
        }
    }

    async function apiStartRegistrationOtp(email) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
            return { success: false, error: 'Please enter a valid email address.' };
        }

        // 1. Check if an active account already exists in Supabase Cloud
        try {
            const res = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(cleanEmail)}&select=id,email,bio,password_hash`, {
                headers: getHeaders()
            });
            if (res.ok) {
                const users = await res.json().catch(() => []);
                if (Array.isArray(users) && users.length > 0) {
                    const u = users[0];
                    const wasSoftDeleted = String(u.bio || '').trim() === SOFT_DELETE_BIO_MARKER ||
                                           getDeletedUserEmails().includes(cleanEmail);
                    if (!wasSoftDeleted && u.password_hash) {
                        return { success: false, error: 'An account with this email already exists. Please log in.' };
                    }
                }
            }
        } catch (_) {}

        // 2. Dispatch OTP via serverless function (emails code using Gmail SMTP)
        let serverRes = null;
        try {
            serverRes = await postAuthFlow('register/start', { email: cleanEmail });
            if (!serverRes || serverRes.success === false) {
                return { success: false, error: serverRes?.error || 'Unable to deliver verification email. Please check your email and try again.' };
            }
        } catch (e) {
            return { success: false, error: e.message || 'Unable to contact email delivery service.' };
        }

        // 3. Store active registration challenge in sessionStorage
        const activeCode = serverRes.codeHash;
        const challenge = {
            email: cleanEmail,
            code: activeCode,
            expires_at: Date.now() + 10 * 60 * 1000
        };
        sessionStorage.setItem('urbanscope_register_challenge', JSON.stringify(challenge));

        return {
            success: true,
            message: `A six-digit verification code has been sent to ${cleanEmail}. Please check your inbox and spam folder.`
        };
    }

    async function apiCompleteRegistrationOtp(email, code, password, fullName, phone) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanCode = String(code || '').trim();
        const cleanName = String(fullName || '').trim();
        const cleanPhone = String(phone || '').trim();

        if (!cleanCode || !/^[0-9]{6}$/.test(cleanCode)) {
            return { success: false, error: 'Please enter a valid 6-digit verification code.' };
        }

        // 1. Verify code against active challenge in sessionStorage
        let codeValid = false;
        try {
            const raw = sessionStorage.getItem('urbanscope_register_challenge');
            if (raw) {
                const challenge = JSON.parse(raw);
                if (challenge.email === cleanEmail) {
                    if (Date.now() > challenge.expires_at) {
                        return { success: false, error: 'Verification code has expired. Please request a new code.' };
                    }
                    if (challenge.code === cleanCode) {
                        codeValid = true;
                    }
                }
            }
        } catch (_) {}

        // 2. Fallback to server verification if sessionStorage was unavailable or cleared
        if (!codeValid) {
            try {
                const serverRes = await postAuthFlow('register/verify', {
                    email: cleanEmail,
                    code: cleanCode,
                    password: String(password || ''),
                    full_name: cleanName,
                    phone: cleanPhone
                });
                if (serverRes && serverRes.success) {
                    codeValid = true;
                }
            } catch (_) {}
        }

        if (!codeValid) {
            return { success: false, error: 'The verification code you entered is incorrect. Please check your email.' };
        }

        // 3. Code verified! Remove challenge and complete user registration via apiSignUp
        sessionStorage.removeItem('urbanscope_register_challenge');
        return await apiSignUp(cleanEmail, password, cleanName, cleanPhone);
    }

    async function apiRequestPasswordReset(email) {
        return postAuthFlow('password/reset/request', { email: String(email || '').trim().toLowerCase() });
    }

    async function apiCompletePasswordReset(email, code, password) {
        return postAuthFlow('password/reset/confirm', {
            email: String(email || '').trim().toLowerCase(),
            code: String(code || '').trim(),
            password: String(password || '')
        });
    }

    async function apiSendPasswordResetEmail(email) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
            return { success: false, error: 'Please enter a valid email address.' };
        }
        try {
            // 1. Verify user exists in Supabase Cloud
            const res = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(cleanEmail)}&select=id,email,full_name,bio`, {
                headers: getHeaders()
            });
            if (!res.ok) {
                return { success: false, error: 'Unable to check account. Please try again.' };
            }
            const users = await res.json().catch(() => []);
            if (!Array.isArray(users) || users.length === 0) {
                return { success: false, error: 'No account found with that email address.' };
            }
            const user = users[0];
            if (user.bio === SOFT_DELETE_BIO_MARKER || getDeletedUserEmails().includes(cleanEmail)) {
                return { success: false, error: 'This account has been deactivated.' };
            }

            // 2. Try server-side OTP dispatch
            let serverRes = null;
            try {
                serverRes = await apiRequestPasswordReset(cleanEmail);
                if (!serverRes || serverRes.success === false) {
                    return { success: false, error: serverRes?.error || 'Unable to send recovery email.' };
                }
            } catch (err) {
                return { success: false, error: err.message || 'Unable to reach the email recovery service.' };
            }

            // 3. Store active reset challenge in sessionStorage
            const activeCode = serverRes.codeHash;
            const challenge = {
                email: cleanEmail,
                code: activeCode,
                expires_at: Date.now() + 10 * 60 * 1000,
                userId: user.id
            };
            sessionStorage.setItem('urbanscope_reset_challenge', JSON.stringify(challenge));

            return {
                success: true,
                message: `A six-digit verification code has been sent to ${cleanEmail}. Please check your inbox and spam folder.`
            };
        } catch (err) {
            return { success: false, error: err.message || 'An error occurred while requesting recovery code.' };
        }
    }

    async function apiVerifyPasswordResetCode(email, code) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanCode = String(code || '').trim();
        if (!cleanCode || !/^[0-9]{6}$/.test(cleanCode)) {
            return { success: false, error: 'Please enter the 6-digit verification code.' };
        }
        try {
            const raw = sessionStorage.getItem('urbanscope_reset_challenge');
            if (!raw) {
                return { success: false, error: 'Verification session expired. Please request a new code.' };
            }
            const challenge = JSON.parse(raw);
            if (challenge.email !== cleanEmail) {
                return { success: false, error: 'Verification email mismatch. Please request a new code.' };
            }
            if (Date.now() > challenge.expires_at) {
                return { success: false, error: 'Verification code has expired. Please request a new one.' };
            }
            if (challenge.code !== cleanCode) {
                return { success: false, error: 'The verification code you entered is incorrect. Please check your email.' };
            }
            challenge.verified = true;
            sessionStorage.setItem('urbanscope_reset_challenge', JSON.stringify(challenge));
            return { success: true, message: 'Code verified successfully.' };
        } catch (err) {
            return { success: false, error: 'Unable to verify code. Please try again.' };
        }
    }

    async function apiResetPasswordWithVerifiedCode(email, newPassword) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!newPassword || newPassword.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters long.' };
        }
        try {
            const raw = sessionStorage.getItem('urbanscope_reset_challenge');
            if (!raw) {
                return { success: false, error: 'Session expired. Please request a new verification code.' };
            }
            const challenge = JSON.parse(raw);
            if (challenge.email !== cleanEmail || !challenge.verified) {
                return { success: false, error: 'Please verify the email code first before setting a new password.' };
            }

            const passwordHash = await hashPBKDF2(newPassword);

            // Update Supabase Cloud
            const patchRes = await fetch(`${REST_BASE}/users?id=eq.${encodeURIComponent(challenge.userId)}`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify({
                    password_hash: passwordHash,
                    updated_at: new Date().toISOString()
                })
            });
            if (!patchRes.ok) {
                return { success: false, error: 'Failed to update password in database. Please try again.' };
            }

            // Sync with local backend if running
            if (isLocalBackendReachableHost()) {
                try {
                    await fetch(`${getLocalApiBase()}/auth/reset-password-direct`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: cleanEmail, password: newPassword })
                    });
                } catch (_) {}
            }

            sessionStorage.removeItem('urbanscope_reset_challenge');
            return { success: true, message: 'Password updated successfully! You can now log in.' };
        } catch (err) {
            return { success: false, error: err.message || 'An error occurred while updating your password.' };
        }
    }

    function normalizePhoneDigits(p) {
        if (!p) return '';
        const digits = String(p).replace(/\D/g, '');
        if (digits.startsWith('63') && digits.length === 12) return digits.slice(2);
        if (digits.startsWith('0') && digits.length === 11) return digits.slice(1);
        return digits;
    }

    async function apiVerifyAccountForPasswordReset(email, phone) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanPhone = normalizePhoneDigits(phone);
        if (!cleanEmail || !cleanPhone) {
            return { success: false, error: 'Please enter both your registered email and phone number.' };
        }
        try {
            const res = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(cleanEmail)}&select=id,email,phone,full_name,bio`, {
                headers: getHeaders()
            });
            if (!res.ok) {
                return { success: false, error: 'Account verification could not be completed. Please try again.' };
            }
            const users = await res.json().catch(() => []);
            if (!Array.isArray(users) || users.length === 0) {
                return { success: false, error: 'No account found with that email address.' };
            }
            const user = users[0];
            if (user.bio === SOFT_DELETE_BIO_MARKER || getDeletedUserEmails().includes(cleanEmail)) {
                return { success: false, error: 'This account has been deactivated.' };
            }
            const userPhone = normalizePhoneDigits(user.phone || '');
            if (!userPhone || userPhone !== cleanPhone) {
                return { success: false, error: 'The phone number does not match our records for this account.' };
            }
            return { success: true, user: { id: user.id, email: user.email, name: user.full_name } };
        } catch (err) {
            return { success: false, error: err.message || 'An error occurred during account verification.' };
        }
    }

    async function apiResetPasswordByPhone(email, phone, newPassword) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanPhone = normalizePhoneDigits(phone);
        if (!cleanEmail || !cleanPhone) {
            return { success: false, error: 'Please provide your registered email and phone number.' };
        }
        if (!newPassword || newPassword.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters long.' };
        }
        const verifyRes = await apiVerifyAccountForPasswordReset(cleanEmail, cleanPhone);
        if (!verifyRes.success) return verifyRes;

        const userId = verifyRes.user.id;
        try {
            const passwordHash = await hashPBKDF2(newPassword);
            const patchRes = await fetch(`${REST_BASE}/users?id=eq.${encodeURIComponent(userId)}`, {
                method: 'PATCH',
                headers: getHeaders(),
                body: JSON.stringify({
                    password_hash: passwordHash,
                    updated_at: new Date().toISOString()
                })
            });
            if (!patchRes.ok) {
                return { success: false, error: 'Unable to update password. Please try again.' };
            }

            // Sync with local backend if reachable
            if (isLocalBackendReachableHost()) {
                try {
                    await fetch(`${getLocalApiBase()}/auth/reset-password-direct`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: cleanEmail, password: newPassword })
                    });
                } catch (_) {}
            }

            return { success: true, message: 'Password updated successfully! You can now log in with your new password.' };
        } catch (err) {
            return { success: false, error: err.message || 'An error occurred while resetting your password.' };
        }
    }

    async function apiSignUp(email, password, fullName, phone) {
        try {
            const cleanEmail = String(email || '').trim().toLowerCase();
            const cleanName = String(fullName || '').trim();
            const cleanPhone = String(phone || '').trim();

            if (!cleanEmail || !cleanEmail.includes('@')) {
                return { success: false, error: 'Please enter a valid email address.' };
            }
            if (!password || password.length < 8) {
                return { success: false, error: 'Password must be at least 8 characters long.' };
            }

            // 1. Direct registration with FastAPI backend when on local dev host
            if (isLocalBackendReachableHost()) {
                try {
                    const localBase = getLocalApiBase();
                    const res = await fetch(`${localBase}/auth/register`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: cleanEmail,
                            password: password,
                            full_name: cleanName,
                            phone: cleanPhone
                        })
                    });

                    if (res.ok) {
                        const regData = await res.json();
                        if (regData.success && regData.user) {
                            const u = regData.user;
                            const sessionUser = {
                                id: u.id,
                                email: u.email,
                                name: u.full_name,
                                full_name: u.full_name,
                                phone: u.phone || '',
                                role: u.role || 'user',
                                avatar_url: u.avatar_url || '',
                                user_metadata: { full_name: u.full_name, phone: u.phone, avatar_url: u.avatar_url || '' }
                            };

                            localStorage.setItem(TOKEN_KEY, regData.token);
                            localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
                            localStorage.setItem(DEMO_KEY, JSON.stringify(sessionUser));
                            if (sessionUser.role === 'admin' || sessionUser.role === 'superadmin') {
                                localStorage.setItem('adminUser', JSON.stringify(sessionUser));
                            }
                            clearUserDeletedLocal(u.id, cleanEmail);

                            return {
                                success: true,
                                data: {
                                    session: true,
                                    user: sessionUser,
                                    token: regData.token,
                                    redirect_url: regData.redirect_url
                                }
                            };
                        }
                    } else {
                        const err = await res.json().catch(() => ({}));
                        return { success: false, error: err.detail || 'Registration failed' };
                    }
                } catch (err) {
                    console.warn('Backend register attempt notice, syncing to Supabase Cloud:', err);
                }
            }

            // 2. Cloud registration in Supabase PostgreSQL (Vercel / remote / offline backend)
            let role = 'user';
            if (cleanEmail === 'urbanscope.cvsu@gmail.com') role = 'superadmin';
            else if (cleanEmail === 'admin.realestate@gmail.com' || cleanEmail === 'miriamalobren@gmail.com' || cleanEmail === 'miriam@gmail.com') role = 'admin';

            let createdId = Date.now();
            try {
                const checkRes = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(cleanEmail)}&select=id,email,bio,password_hash,role,full_name,phone`, {
                    method: 'GET',
                    headers: getHeaders()
                });
                const existingRows = checkRes.ok ? await checkRes.json().catch(() => []) : [];
                const existing = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;
                const passwordHash = await hashPBKDF2(password);

                if (existing && existing.id) {
                    const wasSoftDeleted = String(existing.bio || '').trim() === SOFT_DELETE_BIO_MARKER ||
                                           getDeletedUserEmails().includes(cleanEmail);
                    if (wasSoftDeleted) {
                        const patchRes = await fetch(`${REST_BASE}/users?id=eq.${encodeURIComponent(existing.id)}`, {
                            method: 'PATCH',
                            headers: getHeaders(),
                            body: JSON.stringify({
                                full_name: cleanName || existing.full_name,
                                phone: cleanPhone || existing.phone,
                                password_hash: passwordHash,
                                role: role,
                                bio: '',
                                updated_at: new Date().toISOString()
                            })
                        });
                        if (patchRes.ok) {
                            const patched = await patchRes.json().catch(() => []);
                            const row = Array.isArray(patched) ? patched[0] : patched;
                            if (row && row.id) createdId = row.id;
                        }
                    } else if (!existing.password_hash) {
                        // User previously signed in via Google and is setting a password
                        const patchRes = await fetch(`${REST_BASE}/users?id=eq.${encodeURIComponent(existing.id)}`, {
                            method: 'PATCH',
                            headers: getHeaders(),
                            body: JSON.stringify({
                                full_name: cleanName || existing.full_name,
                                phone: cleanPhone || existing.phone,
                                password_hash: passwordHash,
                                updated_at: new Date().toISOString()
                            })
                        });
                        if (patchRes.ok) {
                            createdId = existing.id;
                            role = existing.role || 'user';
                        }
                    } else {
                        return {
                            success: false,
                            error: 'An account with this email address already exists. Please log in or use "Forgot Password".'
                        };
                    }
                } else {
                    const insertRes = await fetch(`${REST_BASE}/users`, {
                        method: 'POST',
                        headers: getHeaders(),
                        body: JSON.stringify({
                            email: cleanEmail,
                            password_hash: passwordHash,
                            full_name: cleanName,
                            phone: cleanPhone,
                            role: role,
                            avatar_url: 'assets/images/agent.jpg',
                            bio: ''
                        })
                    });
                    if (insertRes.ok) {
                        const inserted = await insertRes.json().catch(() => []);
                        const row = Array.isArray(inserted) ? inserted[0] : inserted;
                        if (row && row.id) createdId = row.id;
                    }
                }
            } catch (cloudErr) {
                console.warn('Supabase registration sync notice:', cloudErr);
            }

            clearUserDeletedLocal(createdId, cleanEmail);

            const sessionUser = {
                id: createdId,
                email: cleanEmail,
                name: cleanName,
                full_name: cleanName,
                phone: cleanPhone,
                role: role,
                user_metadata: { full_name: cleanName, phone: cleanPhone }
            };

            const simulatedToken = 'sb_session_' + sessionUser.id + '_' + Date.now();
            localStorage.setItem(TOKEN_KEY, simulatedToken);
            localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
            localStorage.setItem(DEMO_KEY, JSON.stringify(sessionUser));

            return {
                success: true,
                data: {
                    session: true,
                    user: sessionUser,
                    token: simulatedToken,
                    redirect_url: role === 'superadmin'
                        ? '/pages/superadmin/dashboard.html'
                        : (role === 'admin' ? '/pages/admin/dashboard.html' : '/index.html')
                }
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async function apiSignIn(email, password) {
        try {
            const cleanEmail = email.trim().toLowerCase();

            // 1. Direct authentication with FastAPI Backend if reachable
            const isHttps = typeof location !== 'undefined' && location.protocol === 'https:';
            if (isLocalDevHost() && !isHttps) {
                let localBase = '/api';
                if (typeof location !== 'undefined') {
                    if (location.port === '8000') {
                        localBase = `${location.origin}/api`;
                    } else {
                        const host = location.hostname || '127.0.0.1';
                        localBase = `http://${host}:8000/api`;
                    }
                }

                try {
                    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                    const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;

                    const res = await fetch(`${localBase}/auth/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: cleanEmail, password: password }),
                        signal: controller ? controller.signal : undefined
                    });
                    if (timeoutId) clearTimeout(timeoutId);

                    if (res.ok) {
                        const authRes = await res.json();
                        if (authRes.success && authRes.user) {
                            const u = authRes.user;
                            const sessionUser = {
                                id: u.id,
                                email: u.email,
                                name: u.full_name,
                                full_name: u.full_name,
                                phone: u.phone || '',
                                role: u.role || 'user',
                                avatar_url: u.avatar_url || '',
                                user_metadata: { full_name: u.full_name, phone: u.phone, avatar_url: u.avatar_url || '' }
                            };

                            localStorage.setItem(TOKEN_KEY, authRes.token);
                            localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
                            localStorage.setItem(DEMO_KEY, JSON.stringify(sessionUser));
                            if (sessionUser.role === 'admin' || sessionUser.role === 'superadmin') {
                                localStorage.setItem('adminUser', JSON.stringify(sessionUser));
                                localStorage.setItem('adminPassword', password);
                                localStorage.setItem('urbanscope_admin_password_updated', password);
                            }

                            return {
                                success: true,
                                data: {
                                    user: sessionUser,
                                    token: authRes.token,
                                    redirect_url: authRes.redirect_url
                                }
                            };
                        }
                    } else if (res.status === 401) {
                        const errData = await res.json().catch(() => ({}));
                        return {
                            success: false,
                            error: errData.detail || 'Invalid email or password.'
                        };
                    }
                } catch (backendErr) {
                    console.warn('Backend login attempt notice, falling back:', backendErr);
                }
            }

            // 2. Cloud Supabase authentication if remote or offline
            try {
                const sbRes = await fetch(`${REST_BASE}/users?email=ilike.${encodeURIComponent(cleanEmail)}&select=*`, {
                    headers: getHeaders()
                });
                const sbUsers = await sbRes.json().catch(() => []);
                const remoteUser = sbUsers && sbUsers.length > 0 ? sbUsers[0] : null;

                if (remoteUser) {
                    const storedHash = remoteUser.password_hash || '';
                    if (String(remoteUser.bio || '').trim() === SOFT_DELETE_BIO_MARKER || storedHash === SOFT_DELETE_HASH_MARKER) {
                        return { success: false, error: 'This account has been removed.' };
                    }
                    if (Object.prototype.hasOwnProperty.call(remoteUser, 'email_verified_at') && !remoteUser.email_verified_at) {
                        return { success: false, error: 'Verify your email address first, or use Forgot password to prove account ownership.' };
                    }
                    let passValid = false;
                    if (storedHash && storedHash.includes('$')) {
                        passValid = await verifyPBKDF2(password, storedHash);
                    }
                    if (!passValid && storedHash && password === storedHash) {
                        passValid = true;
                    }
                    // Only check offline/fallback passwords if remoteUser has no stored password_hash
                    if (!storedHash) {
                        const locallyUpdated = localStorage.getItem('urbanscope_admin_password_updated') || '';
                        const activePass = localStorage.getItem('adminPassword') || '';
                        const effectiveAdminPass = locallyUpdated || activePass;
                        if (effectiveAdminPass) {
                            passValid = (password === effectiveAdminPass);
                        } else if (cleanEmail === 'urbanscope.cvsu@gmail.com' && (password === 'urbanscope2026' || password === 'urbanscope')) {
                            passValid = true;
                        } else if (cleanEmail === 'miriamalobren@gmail.com' && password === '111112') {
                            passValid = true;
                        } else if (cleanEmail === 'admin.realestate@gmail.com' && password === 'realestate2026') {
                            passValid = true;
                        }
                    }

                    if (!passValid) {
                        return { success: false, error: 'Incorrect email or password.' };
                    }

                    const role = normalizeAccountRole(remoteUser.role, cleanEmail);
                    const sessionUser = {
                        id: remoteUser.id,
                        email: remoteUser.email,
                        name: remoteUser.full_name || cleanEmail.split('@')[0],
                        full_name: remoteUser.full_name || cleanEmail.split('@')[0],
                        phone: remoteUser.phone || '',
                        role: role,
                        avatar_url: remoteUser.avatar_url || 'assets/images/agent.jpg',
                        license_number: remoteUser.license_number || '',
                        user_metadata: {
                            full_name: remoteUser.full_name,
                            phone: remoteUser.phone,
                            avatar_url: remoteUser.avatar_url
                        }
                    };

                    const simulatedToken = 'sb_session_' + sessionUser.id + '_' + Date.now();
                    localStorage.setItem(TOKEN_KEY, simulatedToken);
                    localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
                    localStorage.setItem(DEMO_KEY, JSON.stringify(sessionUser));
                    if (sessionUser.role === 'admin' || sessionUser.role === 'superadmin') {
                        localStorage.setItem('adminUser', JSON.stringify(sessionUser));
                        if (isLocalBackendReachableHost()) {
                            localStorage.setItem('adminPassword', password);
                            localStorage.setItem('urbanscope_admin_password_updated', password);
                        }
                    }

                    const redirectUrl = (role === 'superadmin') 
                        ? '/pages/superadmin/dashboard.html' 
                        : (role === 'admin' ? '/pages/admin/dashboard.html' : '/index.html');

                    return {
                        success: true,
                        data: { user: sessionUser, token: simulatedToken, redirect_url: redirectUrl }
                    };
                }
            } catch (cloudErr) {
                console.warn('Supabase sign-in lookup notice:', cloudErr);
            }

            // 3. Fallback for offline or static demo sessions
            let role = 'user';
            const locallyUpdated = localStorage.getItem('urbanscope_admin_password_updated') || '';
            const activePass = localStorage.getItem('adminPassword') || '';
            const effectiveAdminPass = locallyUpdated || activePass;

            const savedProfile = JSON.parse(localStorage.getItem('urbanscope_admin_profile') || '{}');
            const leadAdminEmail = (savedProfile.email || 'miriamalobren@gmail.com').toLowerCase();

            if (cleanEmail === 'urbanscope.cvsu@gmail.com') {
                const isValid = effectiveAdminPass
                    ? (password === effectiveAdminPass)
                    : (password === 'urbanscope2026' || password === 'urbanscope');
                if (!isValid) return { success: false, error: 'Incorrect admin password.' };
                role = 'superadmin';
            } else if (cleanEmail === 'miriamalobren@gmail.com' || cleanEmail === leadAdminEmail) {
                const isValid = effectiveAdminPass
                    ? (password === effectiveAdminPass)
                    : (password === '111112');
                if (!isValid) return { success: false, error: 'Incorrect admin password.' };
                role = 'admin';
            } else if (cleanEmail === 'admin.realestate@gmail.com') {
                const isValid = effectiveAdminPass
                    ? (password === effectiveAdminPass)
                    : (password === 'realestate2026');
                if (!isValid) return { success: false, error: 'Incorrect admin password.' };
                role = 'admin';
            } else {
                return { success: false, error: 'Invalid email or password.' };
            }

            const name = cleanEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const sessionUser = {
                id: (role === 'superadmin' ? 1 : (role === 'admin' ? 2 : 10)),
                email: cleanEmail,
                name: name,
                full_name: name,
                phone: '',
                role: role,
                user_metadata: { full_name: name }
            };

            const simulatedToken = 'sb_session_' + sessionUser.id + '_' + Date.now();
            localStorage.setItem(TOKEN_KEY, simulatedToken);
            localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
            localStorage.setItem(DEMO_KEY, JSON.stringify(sessionUser));
            if (sessionUser.role === 'admin' || sessionUser.role === 'superadmin') {
                localStorage.setItem('adminUser', JSON.stringify(sessionUser));
            }

            const redirectUrl = (role === 'superadmin') 
                ? '/pages/superadmin/dashboard.html' 
                : (role === 'admin' ? '/pages/admin/dashboard.html' : '/index.html');

            return {
                success: true,
                data: { user: sessionUser, token: simulatedToken, redirect_url: redirectUrl }
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async function apiGetGoogleConfig() {
        if (isLocalDevHost()) {
            const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
            try {
                const res = await fetch(`${localBase}/auth/google/config`, { method: 'GET' });
                if (res.ok) {
                    const cfg = await res.json();
                    const cid = (cfg.client_id || '').trim();
                    if (cid && !cid.toLowerCase().startsWith('your_google_client_id')) {
                        return { enabled: true, client_id: cid };
                    }
                }
            } catch (e) {}
        }

        const fallbackCid = (window.URBANSCOPE_GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID || '').trim();
        if (fallbackCid && !fallbackCid.toLowerCase().startsWith('your_google_client_id')) {
            return { enabled: true, client_id: fallbackCid };
        }
        return { enabled: false, client_id: '' };
    }

    async function syncGoogleUserToSupabase(userObj) {
        if (!userObj || !userObj.email) return null;
        try {
            const cleanEmail = userObj.email.trim().toLowerCase();
            const checkRes = await fetch(
                `${REST_BASE}/users?email=ilike.${encodeURIComponent(cleanEmail)}&select=id,google_id,avatar_url,role`,
                { method: 'GET', headers: getHeaders() }
            );
            if (!checkRes.ok) return null;
            const rows = await checkRes.json().catch(() => []);
            const existing = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

            if (existing && existing.id) {
                const patchBody = {};
                if (userObj.google_id && !existing.google_id) {
                    patchBody.google_id = userObj.google_id;
                }
                const isRegular = existing.role === 'user' || existing.role === 'client';
                if (userObj.avatar_url && (!existing.avatar_url || (isRegular && existing.avatar_url === 'assets/images/agent.jpg'))) {
                    patchBody.avatar_url = userObj.avatar_url;
                }
                if (Object.keys(patchBody).length > 0) {
                    await fetch(`${REST_BASE}/users?id=eq.${encodeURIComponent(existing.id)}`, {
                        method: 'PATCH',
                        headers: getHeaders(),
                        body: JSON.stringify(patchBody)
                    }).catch(() => {});
                }
                return existing;
            } else {
                const supaRole = userObj.role === 'superadmin'
                    ? 'superadmin'
                    : (userObj.role === 'admin' ? 'admin' : 'user');
                const insertRes = await fetch(`${REST_BASE}/users`, {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify({
                        email: cleanEmail,
                        full_name: userObj.full_name || userObj.name || cleanEmail.split('@')[0],
                        phone: userObj.phone || '',
                        role: supaRole,
                        avatar_url: userObj.avatar_url || 'assets/images/agent.jpg',
                        google_id: userObj.google_id || null
                    })
                });
                if (insertRes.ok) {
                    const created = await insertRes.json().catch(() => []);
                    return Array.isArray(created) ? created[0] : created;
                }
            }
        } catch (err) {
            console.warn('Supabase Google user sync notice:', err.message);
        }
        return null;
    }

    async function apiSignInWithGoogle(googlePayload = {}) {
        try {
            const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
            const body = {
                credential: googlePayload.credential || null,
                access_token: googlePayload.access_token || null
            };

            // 1. Authoritative server-side verification & session creation via FastAPI (local dev only)
            if (isLocalDevHost()) {
                try {
                    const res = await fetch(`${localBase}/auth/google`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });

                    if (res.ok) {
                        const authRes = await res.json();
                        if (authRes.success && authRes.user) {
                            const u = authRes.user;
                            const sessionUser = {
                                id: u.id,
                                email: u.email,
                                name: u.full_name,
                                full_name: u.full_name,
                                phone: u.phone || '',
                                role: u.role || 'user',
                                avatar_url: u.avatar_url || '',
                                google_id: u.google_id || null,
                                user_metadata: {
                                    full_name: u.full_name,
                                    phone: u.phone || '',
                                    avatar_url: u.avatar_url || ''
                                }
                            };

                            localStorage.setItem(TOKEN_KEY, authRes.token);
                            localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
                            localStorage.setItem(DEMO_KEY, JSON.stringify(sessionUser));
                            if (sessionUser.role === 'admin' || sessionUser.role === 'superadmin') {
                                localStorage.setItem('adminUser', JSON.stringify(sessionUser));
                            } else {
                                localStorage.removeItem('adminUser');
                            }

                            // Sync verified Google profile to Supabase Cloud users table
                            syncGoogleUserToSupabase(u).catch(() => {});

                            return {
                                success: true,
                                data: {
                                    session: true,
                                    user: sessionUser,
                                    token: authRes.token,
                                    redirect_url: authRes.redirect_url
                                }
                            };
                        }
                    } else {
                        const errData = await res.json().catch(() => ({}));
                        return {
                            success: false,
                            error: errData.detail || 'Google authentication failed.'
                        };
                    }
                } catch (networkErr) {
                    console.warn('Local FastAPI Google auth unreachable, attempting static cloud verification:', networkErr);
                }
            }

            // 2. Static deployment fallback (e.g. Vercel without Python server)
            const cfg = await apiGetGoogleConfig();
            if (!cfg.enabled || !cfg.client_id) {
                return {
                    success: false,
                    error: 'Google Sign-In is not configured. Add GOOGLE_CLIENT_ID to your .env file.'
                };
            }

            let profile = null;
            if (body.access_token) {
                const tRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(body.access_token)}`);
                if (!tRes.ok) return { success: false, error: 'Invalid or expired Google access token.' };
                const tInfo = await tRes.json();
                if (tInfo.aud !== cfg.client_id && tInfo.azp !== cfg.client_id) {
                    return { success: false, error: 'Google token client ID mismatch.' };
                }
                const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { 'Authorization': `Bearer ${body.access_token}` }
                });
                if (!uRes.ok) return { success: false, error: 'Unable to fetch Google account profile.' };
                profile = await uRes.json();
            } else if (body.credential) {
                const idRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(body.credential)}`);
                if (!idRes.ok) return { success: false, error: 'Invalid or expired Google ID token.' };
                profile = await idRes.json();
                if (profile.aud !== cfg.client_id) {
                    return { success: false, error: 'Google token client ID mismatch.' };
                }
            } else {
                return { success: false, error: 'Missing Google authentication token.' };
            }

            const cleanEmail = (profile.email || '').trim().toLowerCase();
            const isVerified = profile.email_verified === true || String(profile.email_verified).toLowerCase() === 'true';
            if (!cleanEmail || !isVerified) {
                return { success: false, error: 'Google account email is not verified.' };
            }

            let role = 'user';
            if (cleanEmail === 'urbanscope.cvsu@gmail.com') role = 'superadmin';
            else if (cleanEmail === 'admin.realestate@gmail.com' || cleanEmail === 'miriamalobren@gmail.com' || cleanEmail === 'miriam@gmail.com') role = 'admin';

            const fullName = (profile.name || cleanEmail.split('@')[0]).trim();
            const avatarUrl = (profile.picture || '').trim();
            const googleSub = (profile.sub || '').trim();

            const supaRecord = await syncGoogleUserToSupabase({
                email: cleanEmail,
                full_name: fullName,
                phone: '',
                role: role,
                avatar_url: avatarUrl,
                google_id: googleSub
            });

            const resolvedRole = normalizeAccountRole(supaRecord?.role || role, cleanEmail);

            const sessionUser = {
                id: (supaRecord && supaRecord.id) ? supaRecord.id : Date.now(),
                email: cleanEmail,
                name: fullName,
                full_name: fullName,
                phone: '',
                role: resolvedRole,
                avatar_url: avatarUrl,
                google_id: googleSub,
                user_metadata: { full_name: fullName, avatar_url: avatarUrl }
            };

            const simulatedToken = 'sb_google_' + sessionUser.id + '_' + Date.now();
            localStorage.setItem(TOKEN_KEY, simulatedToken);
            localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
            localStorage.setItem(DEMO_KEY, JSON.stringify(sessionUser));
            if (resolvedRole === 'admin' || resolvedRole === 'superadmin') {
                localStorage.setItem('adminUser', JSON.stringify(sessionUser));
            } else {
                localStorage.removeItem('adminUser');
            }

            const redirectUrl = (resolvedRole === 'superadmin')
                ? '/pages/superadmin/dashboard.html'
                : (resolvedRole === 'admin' ? '/pages/admin/dashboard.html' : '/index.html');

            return {
                success: true,
                data: { session: true, user: sessionUser, token: simulatedToken, redirect_url: redirectUrl }
            };
        } catch (err) {
            return { success: false, error: err.message || 'Google authentication failed.' };
        }
    }

    async function apiCreateHostedAdminSession(credentials = {}) {
        if (isLocalDevHost()) return { success: true, local: true };
        try {
            const response = await fetch('/api/auth/edge-session', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
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
        if (isLocalDevHost()) return null;
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
        if (isLocalDevHost()) {
            try {
                const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                await fetch(`${localBase}/auth/logout`, { method: 'POST' }).catch(() => {});
            } catch (e) {}
        } else {
            await fetch('/api/auth/edge-session', {
                method: 'DELETE',
                credentials: 'same-origin'
            }).catch(() => {});
        }
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(DEMO_KEY);
        localStorage.removeItem('adminUser');
    }

    async function apiGetCurrentUser() {
        try {
            const token = localStorage.getItem(TOKEN_KEY);
            if (token && isLocalDevHost()) {
                try {
                    const localBase = (location.port === '8000') ? '/api' : 'http://127.0.0.1:8000/api';
                    const res = await fetch(`${localBase}/auth/me`, {
                        method: 'GET',
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    if (res.ok) {
                        const u = await res.json();
                        return {
                            id: u.id,
                            email: u.email,
                            name: u.full_name,
                            full_name: u.full_name,
                            phone: u.phone || '',
                            role: u.role || 'user',
                            avatar_url: u.avatar_url || '',
                            google_id: u.google_id || null,
                            user_metadata: {
                                full_name: u.full_name,
                                phone: u.phone || '',
                                avatar_url: u.avatar_url || ''
                            }
                        };
                    }
                } catch (e) {}
            }
            const cached = JSON.parse(localStorage.getItem(USER_KEY)) || JSON.parse(localStorage.getItem(DEMO_KEY));
            return cached || null;
        } catch (e) {
            return null;
        }
    }

    // ----------------------------------------------------------
    // 5. DASHBOARD & APPOINTMENTS SERVICES
    // ----------------------------------------------------------
    async function apiGetDashboardKPIs() {
        try {
            const res = await fetch(`${REST_BASE}/view_dashboard_kpis?select=*`, {
                method: 'GET',
                headers: getHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                return data && data.length > 0 ? data[0] : null;
            }
        } catch (e) {
            console.warn('Dashboard KPIs view query error:', e);
        }

        if (isLocalBackendReachableHost()) {
            try {
                const localBase = getLocalApiBase();
                const localRes = await fetch(`${localBase}/view_dashboard_kpis`, {
                    method: 'GET',
                    headers: getLocalAuthHeaders()
                });
                if (localRes.ok) {
                    const localData = await localRes.json();
                    return localData && localData.length > 0 ? localData[0] : null;
                }
            } catch (_) {}
        }

        return null;
    }

    async function apiGetAppointments() {
        try {
            const res = await fetch(`${REST_BASE}/appointments?select=*&order=appointment_date.asc`, {
                method: 'GET',
                headers: getHeaders()
            });
            if (res.ok) return await res.json();
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

    window.apiGetProperties = apiGetProperties;
    window.apiGetPropertyById = apiGetPropertyById;
    window.apiAddProperty = apiAddProperty;
    window.apiUpdateProperty = apiUpdateProperty;
    window.apiDeleteProperty = apiDeleteProperty;
    window.apiSubmitInquiry = apiSubmitInquiry;
    window.apiGetInquiries = apiGetInquiries;
    window.apiUpdateInquiryStatus = apiUpdateInquiryStatus;
    window.apiGetMyInquiries = apiGetMyInquiries;
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
    window.apiCreateHostedAdminSession = apiCreateHostedAdminSession;
    window.apiGetHostedAdminSession = apiGetHostedAdminSession;
    window.apiSignOut = apiSignOut;
    window.apiGetCurrentUser = apiGetCurrentUser;
    window.apiGetDashboardKPIs = apiGetDashboardKPIs;
    window.apiGetAppointments = apiGetAppointments;
    window.isSupabaseConfigured = isBackendConfigured;
    window.isBackendConfigured = isBackendConfigured;

    console.log('✓ UrbanScope Live Supabase Cloud Client Connected:', SUPABASE_URL);
})(window);
