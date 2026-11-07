import { next } from '@vercel/functions';
import { clearAdminSessionCookie, readAdminSession } from './lib/admin-session.js';

const SUPERADMIN_EMAIL = 'urbanscope.cvsu@gmail.com';
const SUPPORT_ASSET = /\.(?:css|js|map|png|jpe?g|svg|ico|webp|gif|woff2?|ttf|otf)$/i;

function routeKind(pathname) {
    const path = pathname.replace(/\/+$/, '') || '/';
    if (path === '/pages/superadmin' || path.startsWith('/pages/superadmin/') ||
        path === '/frontend/pages/superadmin' || path.startsWith('/frontend/pages/superadmin/') ||
        path === '/superadmin' || path.startsWith('/superadmin/')) {
        return 'superadmin';
    }
    if (path === '/pages/admin' || path.startsWith('/pages/admin/') ||
        path === '/frontend/pages/admin' || path.startsWith('/frontend/pages/admin/') ||
        path === '/admin' || path.startsWith('/admin/')) {
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
                'Cache-Control': 'private, no-store, max-age=0'
            }
        }
    );
}

export default async function proxy(request) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // When an active admin or superadmin accesses the landing page, route directly to their dashboard
    const isRootLanding = pathname === '/' || pathname === '/index.html' || pathname === '/frontend/index.html';
    if (isRootLanding) {
        const session = readAdminSession(request);
        if (session) {
            if (session.role === 'superadmin' && session.email === SUPERADMIN_EMAIL) {
                return new Response(null, {
                    status: 302,
                    headers: { Location: '/pages/superadmin/dashboard.html', 'Cache-Control': 'private, no-store, max-age=0' }
                });
            }
            if (['admin', 'superadmin'].includes(session.role)) {
                return new Response(null, {
                    status: 302,
                    headers: { Location: '/pages/admin/dashboard.html', 'Cache-Control': 'private, no-store, max-age=0' }
                });
            }
        }
        return next();
    }

    const kind = routeKind(url.pathname);
    if (!kind || isPublicPortalResource(url.pathname)) return next();

    const session = readAdminSession(request);
    if (!session) return redirectToLogin(request, Boolean(request.headers.get('cookie')));

    if (kind === 'superadmin' &&
        (session.email !== SUPERADMIN_EMAIL || session.role !== 'superadmin')) {
        return forbiddenResponse();
    }

    if (kind === 'admin' && !['admin', 'superadmin'].includes(session.role)) {
        return forbiddenResponse();
    }

    return next({
        headers: {
            'Cache-Control': 'private, no-store, max-age=0',
            Vary: 'Cookie'
        }
    });
}
