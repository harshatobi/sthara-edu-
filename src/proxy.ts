import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Proxy (previously Middleware) — Server-side route protection.
 * Redirects unauthenticated users (no Firebase session cookie) to /login.
 *
 * The __session cookie is set by AuthContext.tsx after a successful Firebase login.
 * This gives us a lightweight server-edge auth check without needing the Admin SDK here.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected route prefixes — anything under these requires a session cookie
  const protectedPrefixes = [
    '/student',
    '/teacher',
    '/admin',
    '/superadmin',
    '/parent',
  ];

  const isProtected = protectedPrefixes.some(prefix => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  // Check for our lightweight session cookie (set by AuthContext on login)
  const sessionCookie = request.cookies.get('__session')?.value;

  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Only run on these route patterns — avoids running on API, _next, or static files
  matcher: [
    '/student/:path*',
    '/teacher/:path*',
    '/admin/:path*',
    '/superadmin/:path*',
    '/parent/:path*',
  ],
};
