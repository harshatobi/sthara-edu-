import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Middleware — Server-side route protection.
 *
 * Responsibilities:
 *  1. Redirect unauthenticated users (no __session cookie) to /login
 *  2. Redirect expired-trial users to /trial-expired
 *  3. Enforce role-based access: students can't visit /admin, teachers can't visit /student, etc.
 *
 * The __session cookie is set by AuthContext.tsx AND login/page.tsx on login.
 * The __trial_ok cookie is set by AuthContext.tsx after verifying trial status.
 * The __role cookie is set by login/page.tsx synchronously before router.push.
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Public routes — always allowed ─────────────────────────────────────────
  const publicPrefixes = ['/login', '/onboard', '/privacy', '/terms', '/_next', '/api', '/trial-expired'];
  if (publicPrefixes.some(p => pathname.startsWith(p)) || pathname === '/') {
    return NextResponse.next();
  }

  // ── Protected routes — require session ─────────────────────────────────────
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

  // 2. Trial check — superadmins are exempt
  const trialOk = request.cookies.get('__trial_ok')?.value;
  const isSuperadminPath = pathname.startsWith('/superadmin');
  if (!isSuperadminPath && trialOk === 'expired') {
    return NextResponse.redirect(new URL('/trial-expired', request.url));
  }

  // 3. Role check — use __role cookie (set synchronously on login before router.push)
  const role = request.cookies.get('__role')?.value;
  if (role) {
    const allowedPrefixes = ROLE_ROUTES[role] || [];
    const isAllowed = allowedPrefixes.some(prefix => pathname.startsWith(prefix));
    if (!isAllowed) {
      // Redirect to this user's own dashboard
      const dest = DASHBOARD[role] || '/login';
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }
  // If no __role cookie yet (e.g. cookie not propagated), allow through —
  // the client-side AuthContext guard will catch unauthorized access.

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
