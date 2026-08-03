import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Proxy — Server-side route protection.
 * (proxy.ts is the Turbopack/Next.js 16 middleware filename alongside middleware.ts;
 *  only ONE of these files can exist. This project uses proxy.ts.)
 *
 * Responsibilities:
 *  1. Redirect unauthenticated users (no __session cookie) to /login
 *  2. Redirect expired-trial users to /trial-expired
 *  3. Enforce role-based access using __role cookie
 *
 * Cookies are set synchronously in login/page.tsx before router.push.
 */

// ── Role → allowed path prefixes ─────────────────────────────────────────────
const ROLE_ROUTES: Record<string, string[]> = {
  superadmin: ['/superadmin', '/admin', '/teacher', '/student', '/parent'],
  admin:      ['/admin'],
  teacher:    ['/teacher'],
  student:    ['/student'],
  parent:     ['/parent'],
};

const DASHBOARD: Record<string, string> = {
  student:    '/student',
  teacher:    '/teacher',
  admin:      '/admin',
  parent:     '/parent',
  superadmin: '/superadmin',
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Public routes — always allowed ─────────────────────────────────────────
  const publicPrefixes = ['/login', '/onboard', '/privacy', '/terms', '/_next', '/api', '/trial-expired'];
  if (publicPrefixes.some(p => pathname.startsWith(p)) || pathname === '/') {
    return NextResponse.next();
  }

  // ── Protected routes only ───────────────────────────────────────────────────
  const protectedPrefixes = ['/student', '/teacher', '/admin', '/superadmin', '/parent'];
  const isProtected = protectedPrefixes.some(p => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // 1. Auth check — must have session cookie
  const sessionCookie = request.cookies.get('__session')?.value;
  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Trial check
  const trialOk = request.cookies.get('__trial_ok')?.value;
  const isSuperadminPath = pathname.startsWith('/superadmin');
  if (!isSuperadminPath && trialOk === 'expired') {
    return NextResponse.redirect(new URL('/trial-expired', request.url));
  }

  // 3. Role check — uses __role cookie set synchronously in login/page.tsx
  const role = request.cookies.get('__role')?.value;
  if (role) {
    const allowedPrefixes = ROLE_ROUTES[role] || [];
    const isAllowed = allowedPrefixes.some(prefix => pathname.startsWith(prefix));
    if (!isAllowed) {
      const dest = DASHBOARD[role] || '/login';
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/student/:path*',
    '/teacher/:path*',
    '/admin/:path*',
    '/superadmin/:path*',
    '/parent/:path*',
  ],
};
