import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Proxy — Server-side route protection.
 *
 * Responsibilities:
 *  1. Redirect unauthenticated users (no __session cookie) to /login
 *  2. Redirect expired-trial users to /trial-expired
 *
 * The __session cookie is set by AuthContext.tsx on login.
 * The __trial_ok cookie is set by AuthContext.tsx after verifying trial status.
 */
export function proxy(request: NextRequest) {
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

  // 2. Trial check — superadmins are exempt; regular school users must have active trial/plan
  // The __trial_ok cookie is set client-side by AuthContext after checking Firestore.
  // Superadmins never have a schoolId so they're always exempt.
  const trialOk = request.cookies.get('__trial_ok')?.value;
  const isSuperadminPath = pathname.startsWith('/superadmin');

  if (!isSuperadminPath && trialOk === 'expired') {
    return NextResponse.redirect(new URL('/trial-expired', request.url));
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
