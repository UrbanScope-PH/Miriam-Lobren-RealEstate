/**
 * UrbanScope - Sitewide Skeleton Loader Engine
 * Provides:
 * 1. Instant layout-matched page entry skeleton across all 24 active pages
 *    (automatically skipped if Welcome Splash is active on first visit).
 * 2. Progressive image loading shimmer for uncached photos across all pages.
 * 3. Reusable HTML skeleton builders for async tables, cards, notifications,
 *    calendar agenda, property grids, property detail, and inquiry history.
 */
(function (window, document) {
    'use strict';

    if (window.UrbanSkeleton && window.UrbanSkeleton.__initialized) return;

    const THEME_KEY = 'urbanscope_theme';
    const root = document.documentElement;
    const path = String(window.location.pathname || '').toLowerCase().replace(/\\/g, '/');

    // Sync Dark/Light theme before painting the skeleton so there is zero flash
    (function syncInitialTheme() {
        try {
            let saved = localStorage.getItem(THEME_KEY);
            if (saved !== 'dark' && saved !== 'light') {
                const match = document.cookie.match(/(?:^|;\s*)urbanscope_theme=(dark|light)(?:;|$)/);
                if (match) saved = match[1];
                else if (window.name && /__urbanscope_theme=(dark|light)/.test(window.name)) {
                    saved = window.name.match(/__urbanscope_theme=(dark|light)/)[1];
                }
            }
            if (saved === 'dark') {
                root.classList.add('dark-mode');
                root.setAttribute('data-theme', 'dark');
            }
        } catch (_) {}
    })();

    function detectPageKind() {
        if (path.endsWith('/pages/admin/login.html')) return 'skip';
        if (path.includes('/pages/admin/dashboard')) return 'admin-dashboard';
        if (
            path.includes('/pages/admin/propertylist')
            || path.includes('/pages/admin/clients')
            || path.includes('/pages/admin/users')
        ) {
            return 'admin-table';
        }
        if (
            path.includes('/pages/admin/add-property')
            || path.includes('/pages/admin/addproperty')
            || path.includes('/pages/admin/edit-property')
            || path.includes('/pages/admin/profile')
        ) {
            return 'admin-form';
        }
        if (path.includes('/pages/auth/')) return 'auth';
        if (path.includes('/pages/legal/')) return 'legal';
        if (path.includes('/pages/inquiry/history')) return 'history';
        if (path.includes('/pages/inquiry/')) return 'inquiry';
        if (path.includes('/pages/properties/')) return 'property';
        return 'home';
    }

    const pageKind = detectPageKind();

    // =========================================================================
    // REUSABLE INLINE SKELETON BUILDERS (for async data sections)
    // =========================================================================

    function buildTableRows(count, variant) {
        const rows = Math.max(1, Number(count) || 4);
        const type = String(variant || 'default');
        const out = [];

        for (let i = 0; i < rows; i++) {
            const wA = [74, 62, 82, 68, 78, 66][i % 6];
            const wB = [56, 48, 64, 52, 60, 44][i % 6];

            if (type === 'properties') {
                out.push(`
                    <tr class="sk-table-row" aria-hidden="true">
                        <td>
                            <div class="sk-cell-media">
                                <span class="sk sk-cell-thumb"></span>
                                <div class="sk-cell-stack">
                                    <span class="sk sk-line sk-md" style="width:${wA}%"></span>
                                    <span class="sk sk-line sk-xs" style="width:${wB}%"></span>
                                </div>
                            </div>
                        </td>
                        <td><span class="sk sk-line sk-sm" style="width:${wA}%"></span></td>
                        <td><span class="sk sk-pill" style="width:88px;height:24px"></span></td>
                        <td><span class="sk sk-line sk-md" style="width:76px"></span></td>
                        <td><span class="sk sk-pill" style="width:82px;height:24px"></span></td>
                        <td><div class="sk-cell-actions"><span class="sk sk-btn" style="width:94px;height:32px"></span></div></td>
                    </tr>
                `);
            } else if (type === 'clients') {
                out.push(`
                    <tr class="sk-table-row" aria-hidden="true">
                        <td>
                            <div class="sk-cell-media">
                                <span class="sk sk-cell-avatar"></span>
                                <div class="sk-cell-stack">
                                    <span class="sk sk-line sk-md" style="width:${wA}%"></span>
                                    <span class="sk sk-line sk-xs" style="width:${wB}%"></span>
                                </div>
                            </div>
                        </td>
                        <td><span class="sk sk-line sk-sm" style="width:104px"></span></td>
                        <td><span class="sk sk-line sk-sm" style="width:${wA}%"></span></td>
                        <td><span class="sk sk-line sk-sm" style="width:92px"></span></td>
                        <td><span class="sk sk-pill" style="width:96px;height:26px"></span></td>
                        <td><div class="sk-cell-actions"><span class="sk sk-btn" style="width:72px;height:32px"></span></div></td>
                    </tr>
                `);
            } else if (type === 'users') {
                out.push(`
                    <tr class="sk-table-row" aria-hidden="true">
                        <td><span class="sk sk-line sk-sm" style="width:42px"></span></td>
                        <td>
                            <div class="sk-cell-media">
                                <span class="sk sk-cell-avatar"></span>
                                <div class="sk-cell-stack">
                                    <span class="sk sk-line sk-md" style="width:${wA}%"></span>
                                    <span class="sk sk-line sk-xs" style="width:${wB}%"></span>
                                </div>
                            </div>
                        </td>
                        <td><span class="sk sk-line sk-sm" style="width:108px"></span></td>
                        <td><span class="sk sk-pill" style="width:78px;height:24px"></span></td>
                        <td><span class="sk sk-line sk-sm" style="width:88px"></span></td>
                        <td><div class="sk-cell-actions"><span class="sk sk-btn" style="width:66px;height:30px"></span><span class="sk sk-btn" style="width:66px;height:30px"></span></div></td>
                    </tr>
                `);
            } else {
                // Dashboard recent inquiries table
                out.push(`
                    <tr class="sk-table-row" aria-hidden="true">
                        <td><span class="sk sk-line sk-sm" style="width:82px"></span></td>
                        <td><span class="sk sk-line sk-md" style="width:${wA}%"></span></td>
                        <td><span class="sk sk-line sk-sm" style="width:${Math.min(92, wA + 10)}%"></span></td>
                        <td><span class="sk sk-line sk-sm" style="width:112px"></span></td>
                        <td><span class="sk sk-pill" style="width:92px;height:25px"></span></td>
                        <td><span class="sk sk-btn" style="width:76px;height:32px"></span></td>
                    </tr>
                `);
            }
        }
        return out.join('');
    }

    function buildMobileCards(count, variant) {
        const total = Math.max(1, Number(count) || 3);
        const type = String(variant || 'default');
        const out = [];
        for (let i = 0; i < total; i++) {
            out.push(`
                <div class="sk-mobile-card" aria-hidden="true">
                    <div class="sk-mobile-card-head">
                        <div class="sk-cell-media" style="flex:1">
                            ${type === 'properties'
                                ? '<span class="sk sk-cell-thumb"></span>'
                                : '<span class="sk sk-cell-avatar"></span>'}
                            <div class="sk-cell-stack">
                                <span class="sk sk-line sk-md" style="width:72%"></span>
                                <span class="sk sk-line sk-xs" style="width:52%"></span>
                            </div>
                        </div>
                        <span class="sk sk-pill" style="width:76px;height:24px"></span>
                    </div>
                    <div class="sk-mobile-card-body">
                        <span class="sk sk-line sk-sm" style="width:88%"></span>
                        <span class="sk sk-line sk-xs" style="width:62%"></span>
                    </div>
                    <div class="sk-mobile-card-foot">
                        <span class="sk sk-line sk-sm" style="width:36%"></span>
                        <span class="sk sk-btn" style="width:84px;height:34px"></span>
                    </div>
                </div>
            `);
        }
        return out.join('');
    }

    function buildNotifItems(count) {
        const total = Math.max(1, Number(count) || 3);
        const out = [];
        for (let i = 0; i < total; i++) {
            const w = [78, 66, 84, 70][i % 4];
            out.push(`
                <div class="sk-notif-item" aria-hidden="true">
                    <span class="sk sk-notif-icon"></span>
                    <div class="sk-notif-body">
                        <span class="sk sk-line sk-sm" style="width:${w}%"></span>
                        <span class="sk sk-line sk-xs" style="width:48%"></span>
                    </div>
                </div>
            `);
        }
        return out.join('');
    }

    function buildAgendaCard() {
        return `
            <div class="sk-agenda-card" aria-hidden="true">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                    <span class="sk sk-line sk-xs" style="width:34%"></span>
                    <span class="sk sk-line sk-xs" style="width:22%"></span>
                </div>
                <span class="sk sk-line sk-md" style="width:88%"></span>
                <span class="sk sk-line sk-sm" style="width:62%"></span>
            </div>
        `;
    }

    function buildPropertyCards(count) {
        const total = Math.max(1, Number(count) || 4);
        const out = [];
        for (let i = 0; i < total; i++) {
            out.push(`
                <article class="property-skeleton-card" aria-hidden="true">
                    <div class="property-skeleton-img"></div>
                    <div class="property-skeleton-info">
                        <span class="skeleton-bar" style="height:20px;width:72%"></span>
                        <span class="skeleton-bar" style="height:13px;width:88%"></span>
                        <div style="display:flex;gap:8px;margin-top:4px">
                            <span class="skeleton-bar" style="height:26px;width:70px;border-radius:999px"></span>
                            <span class="skeleton-bar" style="height:26px;width:70px;border-radius:999px"></span>
                            <span class="skeleton-bar" style="height:26px;width:76px;border-radius:999px"></span>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:12px;border-top:1px solid var(--sk-border)">
                            <span class="skeleton-bar" style="height:24px;width:44%"></span>
                            <span class="skeleton-bar" style="height:22px;width:24%;border-radius:999px"></span>
                        </div>
                    </div>
                </article>
            `);
        }
        return out.join('');
    }

    function buildHistoryCards(count) {
        const total = Math.max(1, Number(count) || 3);
        const out = [];
        for (let i = 0; i < total; i++) {
            out.push(`
                <div class="history-skeleton-card" aria-hidden="true">
                    <div class="history-sk-head">
                        <div style="flex:1;display:flex;flex-direction:column;gap:8px">
                            <span class="sk sk-line sk-xs" style="width:120px"></span>
                            <span class="sk sk-line sk-lg" style="width:62%"></span>
                        </div>
                        <span class="sk sk-pill" style="width:98px;height:28px"></span>
                    </div>
                    <div class="history-sk-body">
                        <span class="sk sk-line sk-sm" style="width:94%"></span>
                        <span class="sk sk-line sk-sm" style="width:74%"></span>
                    </div>
                    <div class="history-sk-foot">
                        <span class="sk sk-line sk-xs" style="width:150px"></span>
                        <div style="display:flex;gap:8px">
                            <span class="sk sk-btn" style="width:92px;height:34px"></span>
                            <span class="sk sk-btn" style="width:86px;height:34px"></span>
                        </div>
                    </div>
                </div>
            `);
        }
        return out.join('');
    }

    function buildInquiryPreviewSkeleton() {
        return `
            <div class="sk-inquiry-preview" id="inquiryPropPreviewSkeleton" aria-hidden="true">
                <span class="sk sk-inquiry-thumb"></span>
                <div class="sk-inquiry-meta">
                    <span class="sk sk-line sk-md" style="width:58%"></span>
                    <span class="sk sk-line sk-xs" style="width:76%"></span>
                    <span class="sk sk-line sk-sm" style="width:36%"></span>
                </div>
            </div>
        `;
    }

    function buildGalleryPlaceholders(count) {
        const total = Math.max(1, Number(count) || 4);
        const tiles = [];
        for (let i = 0; i < total; i++) {
            tiles.push('<span class="sk sk-gallery-tile"></span>');
        }
        return `<div class="sk-gallery-grid" aria-hidden="true">${tiles.join('')}</div>`;
    }

    function buildDetailSkeletonMarkup() {
        return `
            <div class="us-detail-skeleton" id="propertyDetailSkeleton" aria-hidden="true">
                <div class="us-detail-sk-header">
                    <div class="us-detail-sk-title">
                        <span class="sk sk-pill" style="width:96px;height:26px"></span>
                        <span class="sk sk-line sk-xl" style="width:62%"></span>
                        <span class="sk sk-line sk-sm" style="width:44%"></span>
                    </div>
                    <span class="sk sk-line sk-xl" style="width:180px"></span>
                </div>
                <span class="sk us-detail-sk-carousel"></span>
                <div class="us-detail-sk-thumbs">
                    <span class="sk us-detail-sk-thumb"></span>
                    <span class="sk us-detail-sk-thumb"></span>
                    <span class="sk us-detail-sk-thumb"></span>
                    <span class="sk us-detail-sk-thumb"></span>
                    <span class="sk us-detail-sk-thumb"></span>
                </div>
                <div class="us-detail-sk-specs">
                    <span class="sk us-detail-sk-spec-box"></span>
                    <span class="sk us-detail-sk-spec-box"></span>
                    <span class="sk us-detail-sk-spec-box"></span>
                    <span class="sk us-detail-sk-spec-box"></span>
                </div>
                <div class="us-detail-sk-prose">
                    <span class="sk sk-line sk-lg" style="width:32%"></span>
                    <span class="sk sk-line sk-sm" style="width:96%"></span>
                    <span class="sk sk-line sk-sm" style="width:90%"></span>
                    <span class="sk sk-line sk-sm" style="width:76%"></span>
                </div>
            </div>
        `;
    }

    // =========================================================================
    // FULL-PAGE ENTRY SKELETON TEMPLATES (9 page layouts)
    // =========================================================================

    function buildTopbarSkeleton(isAdmin) {
        return `
            <div class="us-sk-topbar">
                <div class="us-sk-topbar-brand">
                    ${isAdmin ? '<span class="sk sk-rect" style="width:34px;height:34px;border-radius:9px"></span>' : ''}
                    <span class="sk sk-circle" style="width:34px;height:34px"></span>
                    <div style="display:flex;flex-direction:column;gap:5px">
                        <span class="sk sk-line sk-md" style="width:118px"></span>
                        ${isAdmin ? '' : '<span class="sk sk-line sk-xs" style="width:88px"></span>'}
                    </div>
                </div>
                ${isAdmin ? '' : `
                    <div class="us-sk-topbar-nav">
                        <span class="sk sk-line sk-sm" style="width:52px"></span>
                        <span class="sk sk-line sk-sm" style="width:74px"></span>
                        <span class="sk sk-line sk-sm" style="width:48px"></span>
                        <span class="sk sk-line sk-sm" style="width:42px"></span>
                        <span class="sk sk-line sk-sm" style="width:62px"></span>
                    </div>
                `}
                <div class="us-sk-topbar-acts">
                    <span class="sk sk-circle" style="width:36px;height:36px"></span>
                    ${isAdmin
                        ? '<span class="sk sk-circle" style="width:36px;height:36px"></span><span class="sk sk-pill" style="width:58px;height:36px"></span>'
                        : '<span class="sk sk-btn" style="width:84px;height:36px"></span><span class="sk sk-btn" style="width:92px;height:36px"></span>'}
                </div>
            </div>
        `;
    }

    function buildPageTemplate(kind) {
        if (kind === 'auth') {
            return `
                <div class="us-sk-auth-split">
                    <div class="us-sk-auth-visual">
                        <span class="sk sk-pill" style="width:130px;height:28px"></span>
                        <span class="sk sk-line sk-xl" style="width:74%"></span>
                        <span class="sk sk-line sk-md" style="width:56%"></span>
                    </div>
                    <div class="us-sk-auth-form-wrap">
                        <div class="us-sk-auth-card">
                            <div style="display:flex;justify-content:space-between;align-items:center">
                                <span class="sk sk-pill" style="width:96px;height:32px"></span>
                                <span class="sk sk-circle" style="width:36px;height:36px"></span>
                            </div>
                            <span class="sk sk-line sk-xl" style="width:58%;margin-top:8px"></span>
                            <span class="sk sk-line sk-sm" style="width:82%"></span>
                            <span class="sk sk-rect" style="height:44px;margin-top:8px"></span>
                            <span class="sk sk-rect" style="height:44px"></span>
                            <span class="sk sk-rect" style="height:46px;border-radius:10px;margin-top:6px"></span>
                            <span class="sk sk-rect" style="height:44px;border-radius:10px"></span>
                        </div>
                    </div>
                </div>
            `;
        }

        if (kind === 'home') {
            return `
                ${buildTopbarSkeleton(false)}
                <div class="us-sk-body">
                    <div class="us-sk-home-hero">
                        <span class="sk sk-line sk-hero" style="width:min(540px, 86%)"></span>
                        <span class="sk sk-line sk-md" style="width:min(420px, 70%)"></span>
                        <span class="sk us-sk-home-search"></span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
                        <span class="sk sk-line sk-lg" style="width:210px"></span>
                        <div style="display:flex;gap:8px">
                            <span class="sk sk-pill" style="width:76px;height:32px"></span>
                            <span class="sk sk-pill" style="width:96px;height:32px"></span>
                            <span class="sk sk-pill" style="width:88px;height:32px"></span>
                        </div>
                    </div>
                    <div class="us-sk-card-grid-4">
                        ${Array.from({ length: 4 }).map(() => `
                            <div class="us-sk-prop-card">
                                <span class="sk us-sk-prop-card-img"></span>
                                <div class="us-sk-prop-card-body">
                                    <span class="sk sk-line sk-md" style="width:74%"></span>
                                    <span class="sk sk-line sk-xs" style="width:88%"></span>
                                    <span class="sk sk-line sk-lg" style="width:46%;margin-top:6px"></span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        if (kind === 'property') {
            return `
                ${buildTopbarSkeleton(false)}
                <div class="us-sk-body">
                    <div class="us-detail-sk-header">
                        <div class="us-detail-sk-title">
                            <span class="sk sk-pill" style="width:96px;height:26px"></span>
                            <span class="sk sk-line sk-xl" style="width:52%"></span>
                            <span class="sk sk-line sk-sm" style="width:38%"></span>
                        </div>
                        <span class="sk sk-line sk-xl" style="width:170px"></span>
                    </div>
                    <span class="sk us-detail-sk-carousel"></span>
                    <div class="us-detail-sk-thumbs">
                        <span class="sk us-detail-sk-thumb"></span>
                        <span class="sk us-detail-sk-thumb"></span>
                        <span class="sk us-detail-sk-thumb"></span>
                        <span class="sk us-detail-sk-thumb"></span>
                        <span class="sk us-detail-sk-thumb"></span>
                    </div>
                    <div class="us-detail-sk-specs">
                        <span class="sk us-detail-sk-spec-box"></span>
                        <span class="sk us-detail-sk-spec-box"></span>
                        <span class="sk us-detail-sk-spec-box"></span>
                        <span class="sk us-detail-sk-spec-box"></span>
                    </div>
                </div>
            `;
        }

        if (kind === 'legal') {
            return `
                ${buildTopbarSkeleton(false)}
                <div class="us-sk-body">
                    <div class="us-sk-legal-hero">
                        <span class="sk sk-pill" style="width:160px;height:30px"></span>
                        <span class="sk sk-line sk-xl" style="width:min(360px, 76%)"></span>
                        <span class="sk sk-line sk-sm" style="width:min(460px, 84%)"></span>
                    </div>
                    <div class="us-sk-legal-grid">
                        <div class="us-sk-panel">
                            <span class="sk sk-line sk-md" style="width:64%"></span>
                            <span class="sk sk-line sk-sm" style="width:86%"></span>
                            <span class="sk sk-line sk-sm" style="width:74%"></span>
                            <span class="sk sk-line sk-sm" style="width:90%"></span>
                            <span class="sk sk-line sk-sm" style="width:78%"></span>
                            <span class="sk sk-line sk-sm" style="width:68%"></span>
                        </div>
                        <div class="us-sk-panel">
                            <span class="sk sk-line sk-lg" style="width:46%"></span>
                            <span class="sk sk-line sk-sm" style="width:96%"></span>
                            <span class="sk sk-line sk-sm" style="width:92%"></span>
                            <span class="sk sk-line sk-sm" style="width:84%"></span>
                            <span class="sk sk-line sk-lg" style="width:40%;margin-top:12px"></span>
                            <span class="sk sk-line sk-sm" style="width:94%"></span>
                            <span class="sk sk-line sk-sm" style="width:88%"></span>
                        </div>
                    </div>
                </div>
            `;
        }

        if (kind === 'inquiry') {
            return `
                ${buildTopbarSkeleton(false)}
                <div class="us-sk-body" style="max-width:960px">
                    <div style="display:flex;flex-direction:column;gap:10px">
                        <span class="sk sk-line sk-xl" style="width:320px;max-width:80%"></span>
                        <span class="sk sk-line sk-sm" style="width:460px;max-width:92%"></span>
                    </div>
                    <div style="display:flex;gap:12px">
                        <span class="sk sk-rect" style="height:44px;flex:1;border-radius:12px"></span>
                        <span class="sk sk-rect" style="height:44px;flex:1;border-radius:12px"></span>
                    </div>
                    <div class="us-sk-panel">
                        <div class="us-sk-form-grid-2">
                            <span class="sk sk-rect" style="height:46px"></span>
                            <span class="sk sk-rect" style="height:46px"></span>
                            <span class="sk sk-rect" style="height:46px"></span>
                            <span class="sk sk-rect" style="height:46px"></span>
                        </div>
                        <span class="sk sk-rect" style="height:110px"></span>
                        <div style="display:flex;justify-content:flex-end;gap:10px">
                            <span class="sk sk-btn" style="width:110px"></span>
                            <span class="sk sk-btn" style="width:160px"></span>
                        </div>
                    </div>
                </div>
            `;
        }

        if (kind === 'history') {
            return `
                ${buildTopbarSkeleton(false)}
                <div class="us-sk-body">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
                        <div style="display:flex;flex-direction:column;gap:8px">
                            <span class="sk sk-line sk-xl" style="width:240px"></span>
                            <span class="sk sk-line sk-sm" style="width:340px;max-width:84vw"></span>
                        </div>
                        <span class="sk sk-btn" style="width:156px;height:42px"></span>
                    </div>
                    <div class="us-sk-stats-4">
                        ${Array.from({ length: 4 }).map(() => `
                            <div class="us-sk-kpi-box">
                                <span class="sk sk-rect" style="width:38px;height:38px;border-radius:10px"></span>
                                <div style="flex:1;display:flex;flex-direction:column;gap:6px">
                                    <span class="sk sk-line sk-xs" style="width:66%"></span>
                                    <span class="sk sk-line sk-lg" style="width:38%"></span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="us-sk-dash-row-2">
                        ${buildHistoryCards(2)}
                    </div>
                </div>
            `;
        }

        if (kind === 'admin-dashboard') {
            return `
                ${buildTopbarSkeleton(true)}
                <div class="us-sk-body">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
                        <div style="display:flex;flex-direction:column;gap:8px">
                            <span class="sk sk-line sk-xl" style="width:260px"></span>
                            <span class="sk sk-line sk-sm" style="width:320px;max-width:80vw"></span>
                        </div>
                        <div style="display:flex;gap:10px">
                            <span class="sk sk-btn" style="width:134px;height:40px"></span>
                            <span class="sk sk-btn" style="width:146px;height:40px"></span>
                        </div>
                    </div>
                    <div class="us-sk-kpi-grid-5">
                        ${Array.from({ length: 5 }).map(() => `
                            <div class="us-sk-kpi-box">
                                <span class="sk sk-rect" style="width:42px;height:42px;border-radius:11px"></span>
                                <div style="flex:1;display:flex;flex-direction:column;gap:7px">
                                    <span class="sk sk-line sk-xs" style="width:72%"></span>
                                    <span class="sk sk-line sk-lg" style="width:42%"></span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="us-sk-dash-row-2">
                        <div class="us-sk-panel">
                            <span class="sk sk-line sk-lg" style="width:150px"></span>
                            <div class="us-sk-donut-wrap">
                                <span class="sk sk-circle" style="width:156px;height:156px"></span>
                                <div style="flex:1;max-width:210px;display:flex;flex-direction:column;gap:12px">
                                    <span class="sk sk-line sk-sm" style="width:100%"></span>
                                    <span class="sk sk-line sk-sm" style="width:88%"></span>
                                    <span class="sk sk-line sk-sm" style="width:92%"></span>
                                    <span class="sk sk-line sk-sm" style="width:80%"></span>
                                </div>
                            </div>
                        </div>
                        <div class="us-sk-panel">
                            <span class="sk sk-line sk-lg" style="width:180px"></span>
                            ${buildNotifItems(3)}
                        </div>
                    </div>
                    <div class="us-sk-panel">
                        <span class="sk sk-line sk-lg" style="width:170px"></span>
                        ${Array.from({ length: 3 }).map(() => `
                            <div class="us-sk-row-item">
                                <span class="sk sk-line sk-md" style="width:76%"></span>
                                <span class="sk sk-line sk-sm" style="width:84%"></span>
                                <span class="sk sk-line sk-sm" style="width:68%"></span>
                                <span class="sk sk-pill" style="width:86px;height:24px"></span>
                                <span class="sk sk-btn" style="width:72px;height:30px"></span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        if (kind === 'admin-table') {
            return `
                ${buildTopbarSkeleton(true)}
                <div class="us-sk-body">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
                        <div style="display:flex;flex-direction:column;gap:8px">
                            <span class="sk sk-line sk-xl" style="width:240px"></span>
                            <span class="sk sk-line sk-sm" style="width:320px;max-width:82vw"></span>
                        </div>
                        <span class="sk sk-btn" style="width:152px;height:42px"></span>
                    </div>
                    <div style="display:flex;gap:12px;flex-wrap:wrap">
                        <span class="sk sk-rect" style="height:44px;flex:1;min-width:220px"></span>
                        <span class="sk sk-rect" style="height:44px;width:160px"></span>
                        <span class="sk sk-rect" style="height:44px;width:160px"></span>
                    </div>
                    <div class="us-sk-panel">
                        ${Array.from({ length: 6 }).map(() => `
                            <div class="us-sk-row-item">
                                <span class="sk sk-line sk-md" style="width:78%"></span>
                                <span class="sk sk-line sk-sm" style="width:82%"></span>
                                <span class="sk sk-line sk-sm" style="width:64%"></span>
                                <span class="sk sk-pill" style="width:84px;height:24px"></span>
                                <span class="sk sk-btn" style="width:76px;height:30px"></span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // admin-form (add-property, edit-property, profile)
        return `
            ${buildTopbarSkeleton(true)}
            <div class="us-sk-body" style="max-width:1180px">
                <div style="display:flex;flex-direction:column;gap:8px">
                    <span class="sk sk-line sk-xl" style="width:260px"></span>
                    <span class="sk sk-line sk-sm" style="width:360px;max-width:86vw"></span>
                </div>
                <div class="us-sk-panel">
                    <span class="sk sk-line sk-lg" style="width:180px"></span>
                    <div class="us-sk-form-grid-2">
                        <span class="sk sk-rect" style="height:46px"></span>
                        <span class="sk sk-rect" style="height:46px"></span>
                        <span class="sk sk-rect" style="height:46px"></span>
                        <span class="sk sk-rect" style="height:46px"></span>
                    </div>
                    <span class="sk sk-rect" style="height:128px"></span>
                    <div style="display:flex;justify-content:flex-end;gap:10px">
                        <span class="sk sk-btn" style="width:146px;height:42px"></span>
                    </div>
                </div>
            </div>
        `;
    }

    // =========================================================================
    // PAGE ENTRY SKELETON LIFECYCLE
    // =========================================================================

    let overlayEl = null;
    let mountedAt = 0;
    let dismissed = false;
    let doneCallbacks = [];

    function flushDoneCallbacks() {
        const list = doneCallbacks.slice();
        doneCallbacks = [];
        list.forEach((cb) => {
            try { cb(); } catch (_) {}
        });
        try {
            window.dispatchEvent(new CustomEvent('urbanscope:skeletonDone'));
        } catch (_) {}
    }

    function dismissPageSkeleton() {
        if (dismissed) return;
        dismissed = true;
        if (!overlayEl) {
            flushDoneCallbacks();
            return;
        }
        const el = overlayEl;
        el.classList.add('is-leaving');
        window.setTimeout(() => {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            overlayEl = null;
            flushDoneCallbacks();
        }, 250);
    }

    function scheduleSmartDismiss() {
        if (dismissed) return;
        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const minVisibleMs = reduceMotion ? 0 : 240;
        const elapsed = Date.now() - mountedAt;
        const remaining = Math.max(0, minVisibleMs - elapsed);
        window.setTimeout(() => {
            requestAnimationFrame(() => dismissPageSkeleton());
        }, remaining);
    }

    function shouldSkipPageOverlay() {
        if (pageKind === 'skip') return true;
        if (root.classList.contains('splash-pending')) return true;
        if (window.location.search.includes('no_skeleton=1')) return true;
        return false;
    }

    function mountPageOverlay() {
        if (dismissed || overlayEl || shouldSkipPageOverlay()) {
            dismissed = true;
            flushDoneCallbacks();
            return;
        }
        if (!document.body) return;
        // Double-check splash wasn't mounted synchronously by splash.js
        if (root.classList.contains('splash-pending') || document.getElementById('splash')) {
            dismissed = true;
            flushDoneCallbacks();
            return;
        }

        const el = document.createElement('div');
        el.id = 'usPageSkeleton';
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('data-skeleton-kind', pageKind);
        el.innerHTML = buildPageTemplate(pageKind);
        document.body.insertBefore(el, document.body.firstChild);
        overlayEl = el;
        mountedAt = Date.now();
    }

    if (!shouldSkipPageOverlay()) {
        if (document.body) {
            mountPageOverlay();
        } else {
            // Mount the moment <body> is created in the parser (before paint)
            const bodyWatcher = new MutationObserver(() => {
                if (document.body) {
                    bodyWatcher.disconnect();
                    mountPageOverlay();
                }
            });
            bodyWatcher.observe(root, { childList: true });
        }

        if (document.readyState === 'complete') {
            scheduleSmartDismiss();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                // Wait briefly for fonts/layout paint, or dismiss right away
                if (document.fonts && document.fonts.ready) {
                    Promise.race([
                        document.fonts.ready,
                        new Promise((r) => window.setTimeout(r, 420))
                    ]).then(scheduleSmartDismiss);
                } else {
                    scheduleSmartDismiss();
                }
            }, { once: true });

            window.addEventListener('load', () => {
                if (!dismissed) scheduleSmartDismiss();
            }, { once: true });

            // Hard failsafe ceiling: never leave a page obscured
            window.setTimeout(dismissPageSkeleton, 2200);
        }
    } else {
        dismissed = true;
    }

    // =========================================================================
    // PROGRESSIVE IMAGE SHIMMER (ALL PAGES)
    // =========================================================================

    function enhanceImageSkeleton(img) {
        if (!img || img.nodeName !== 'IMG') return;
        if (img.dataset.usImgSkWired === '1') return;
        if (img.closest('#usPageSkeleton, #splash')) return;
        // Skip tiny icons / brand logos
        if (img.classList.contains('brand-logo') || img.classList.contains('logo-icon')) return;

        img.dataset.usImgSkWired = '1';
        if (img.complete && img.naturalWidth > 0) return;

        img.classList.add('us-img-loading');
        let settled = false;
        const finish = (didLoad) => {
            if (settled) return;
            settled = true;
            img.classList.remove('us-img-loading');
            if (didLoad) img.classList.add('us-img-loaded');
        };
        img.addEventListener('load', () => finish(true), { once: true });
        img.addEventListener('error', () => finish(false), { once: true });
        window.setTimeout(() => finish(false), 6000);
    }

    function initProgressiveImageSkeletons() {
        document.querySelectorAll('img').forEach(enhanceImageSkeleton);
        if (typeof MutationObserver === 'function' && document.body) {
            const imgObserver = new MutationObserver((mutations) => {
                mutations.forEach((m) => {
                    m.addedNodes.forEach((node) => {
                        if (!node || node.nodeType !== 1) return;
                        if (node.nodeName === 'IMG') {
                            enhanceImageSkeleton(node);
                        } else if (node.querySelectorAll) {
                            node.querySelectorAll('img').forEach(enhanceImageSkeleton);
                        }
                    });
                });
            });
            imgObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProgressiveImageSkeletons, { once: true });
    } else {
        initProgressiveImageSkeletons();
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    window.UrbanSkeleton = {
        __initialized: true,
        pageKind,
        dismiss: dismissPageSkeleton,
        whenDone(cb) {
            if (typeof cb !== 'function') return;
            if (dismissed && !overlayEl) {
                cb();
            } else {
                doneCallbacks.push(cb);
            }
        },
        tableRows: buildTableRows,
        mobileCards: buildMobileCards,
        notifItems: buildNotifItems,
        agendaCard: buildAgendaCard,
        propertyCards: buildPropertyCards,
        historyCards: buildHistoryCards,
        inquiryPreview: buildInquiryPreviewSkeleton,
        galleryPlaceholders: buildGalleryPlaceholders,
        detailPlaceholder: buildDetailSkeletonMarkup,
        enhanceImage: enhanceImageSkeleton
    };
})(window, document);
