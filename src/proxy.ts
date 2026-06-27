import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Middleware — Server-side route protection.
 * Redirects unauthenticated users (no Firebase session cookie) to /login.
 * Note: Firebase client SDK tokens are stored in IndexedDB (not cookies),
 * so we check for the Firebase auth token cookie that can be set on login.
 * As a lightweight layer, we also check for the Firebase __session cookie.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected route prefixes
  const protectedPrefixes = [
    '/student',
    '/teacher',
    '/admin',
    '/superadmin',
    '/parent',
  ];

  const isProtected = protectedPrefixes.some(prefix => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  // Check for Firebase session cookie (set after login)
  // Firebase web SDK stores the auth state in IndexedDB, but we look for
  // a lightweight __session cookie that we set on successful login.
  const sessionCookie = request.cookies.get('__session')?.value;

  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match all protected routes, exclude api/static/public paths
  matcher: [
    '/student/:path*',
    '/teacher/:path*',
    '/admin/:path*',
    '/superadmin/:path*',
    '/parent/:path*',
  ],
};
