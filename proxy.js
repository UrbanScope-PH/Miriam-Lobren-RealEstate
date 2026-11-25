import { next } from '@vercel/functions';
import { clearAdminSessionCookie, isMainAdminEmail, readAdminSession } from './lib/admin-session.js';

const SUPPORT_ASSET = /\.(?:css|js|map|png|jpe?g|svg|ico|webp|gif|woff2?|ttf|otf)$/i;

function routeKind(pathname) {
    const path = pathname.replace(/\/+$/, '') || '/';
    const lower = path.toLowerCase();
    if (lower === '/pages/superadmin' || lower.startsWith('/pages/superadmin/') ||
        lower === '/frontend/pages/superadmin' || lower.startsWith('/frontend/pages/superadmin/') ||
        lower === '/superadmin' || lower.startsWith('/superadmin/')) {
        return 'superadmin';
    }
    if (lower === '/pages/admin/users.html' ||
        lower === '/frontend/pages/admin/users.html' ||
        lower === '/admin/users.html') {
        return 'rbac';
    }
    if (lower === '/pages/admin' || lower.startsWith('/pages/admin/') ||
        lower === '/frontend/pages/admin' || lower.startsWith('/frontend/pages/admin/') ||
        lower === '/admin' || lower.startsWith('/admin/')) {
        return 'admin';
    }
    return null;
}

function isPublicPortalResource(pathname) {
    const fileName = pathname.split('/').pop().toLowerCase();
    return fileName === 'login.html' || SUPPORT_ASSET.test(fileName);
}

function redirectToLogin(request, clearCookie) {
    const url = new URL(request.url);
    const loginUrl = new URL('/pages/auth/login.html', url.origin);
    const redirectPath = `${url.pathname.replace(/^\//, '')}${url.search}`;
    loginUrl.searchParams.set('redirect', redirectPath);

    const headers = new Headers({
        Location: loginUrl.toString(),
        'Cache-Control': 'private, no-store, max-age=0'
    });
    if (clearCookie) headers.append('Set-Cookie', clearAdminSessionCookie());
    return new Response(null, { status: 302, headers });
}

function forbiddenResponse() {
    return new Response(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>403 Forbidden</title><body style="font:16px system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:24px;color:#1b2e21"><h1>Access restricted</h1><p>Your account does not have permission to view this administrative page.</p><a href="/">Return to UrbanScope</a></body></html>',
        {
            status: 403,
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'private, no-store, max-age=0',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
                'Referrer-Policy': 'strict-origin-when-cross-origin'
            }
        }
    );
}

export default async function proxy(request) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // When an active admin accesses the landing page, route directly to the admin dashboard
    const isRootLanding = pathname === '/' || pathname === '/index.html' || pathname === '/frontend/index.html';
    if (isRootLanding) {
        const session = readAdminSession(request);
        if (session && ['admin', 'superadmin'].includes(session.role)) {
            return new Response(null, {
                status: 302,
                headers: { Location: '/pages/admin/dashboard.html', 'Cache-Control': 'private, no-store, max-age=0' }
            });
        }
        return next();
    }

    const kind = routeKind(url.pathname);
    if (!kind || isPublicPortalResource(url.pathname)) return next();

    const session = readAdminSession(request);
    if (!session) return redirectToLogin(request, Boolean(request.headers.get('cookie')));

    if (!['admin', 'superadmin'].includes(session.role)) {
        return forbiddenResponse();
    }

    if (kind === 'superadmin') {
        const destination = isMainAdminEmail(session.email)
            ? '/pages/admin/users.html'
            : '/pages/admin/dashboard.html';
        return new Response(null, {
            status: 302,
            headers: { Location: destination, 'Cache-Control': 'private, no-store, max-age=0' }
        });
    }

    if (kind === 'rbac' && !isMainAdminEmail(session.email)) {
        return new Response(null, {
            status: 302,
            headers: { Location: '/pages/admin/dashboard.html', 'Cache-Control': 'private, no-store, max-age=0' }
        });
    }

    return next({
        headers: {
            'Cache-Control': 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            Vary: 'Cookie'
        }
    });
}
