import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Supabase constants (server-side only) ────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nqwvsuyiwswnsqbyhghb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xd3ZzdXlpd3N3bnNxYnloZ2hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDEzNzAzNSwiZXhwIjoyMDk5NzEzMDM1fQ.rFuYkmbA-T92TzWIqgbpCn2Ua_qdGymJB9u-9B4X2hk';

// ── Role → allowed path prefixes ─────────────────────────────────────────────
const ROLE_ROUTES: Record<string, string[]> = {
  superadmin: ['/superadmin', '/admin', '/teacher', '/student', '/parent'],
  admin:       ['/admin'],
  teacher:     ['/teacher'],
  student:     ['/student'],
  parent:      ['/parent'],
};

// ── Protected path prefixes (anything not public) ─────────────────────────────
const PROTECTED_PREFIXES = ['/admin', '/teacher', '/student', '/parent', '/superadmin'];

// ── Public paths that require no auth ────────────────────────────────────────
const PUBLIC_PATHS = ['/login', '/api', '/_next', '/favicon', '/public'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-protected and public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname === '/') {
    return NextResponse.next();
  }

  // Only enforce auth on protected routes
  const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // ── 1. Get session token from cookie ────────────────────────────────────────
  const sessionToken = request.cookies.get('__session')?.value;

  if (!sessionToken) {
    // No session — redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'unauthorized');
    return NextResponse.redirect(loginUrl);
  }

  try {
    // ── 2. Verify token and get user ─────────────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(sessionToken);

    if (authErr || !user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'session_expired');
      return NextResponse.redirect(loginUrl);
    }

    // ── 3. Get role from users table ─────────────────────────────────────────
    const { data: userRow } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const role = userRow?.role || user.user_metadata?.role as string || '';

    if (!role) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'no_role');
      return NextResponse.redirect(loginUrl);
    }

    // ── 4. Enforce role-based path access ────────────────────────────────────
    const allowedPrefixes = ROLE_ROUTES[role] || [];
    const isAllowed = allowedPrefixes.some(prefix => pathname.startsWith(prefix));

    if (!isAllowed) {
      // Redirect to this user's own dashboard instead of a generic error
      const dashboardMap: Record<string, string> = {
        student:    '/student',
        teacher:    '/teacher',
        admin:      '/admin',
        parent:     '/parent',
        superadmin: '/superadmin',
      };
      const redirectUrl = new URL(dashboardMap[role] || '/login', request.url);
      return NextResponse.redirect(redirectUrl);
    }

    // Allowed — pass through with role header for optional server-side use
    const response = NextResponse.next();
    response.headers.set('x-user-role', role);
    return response;

  } catch (err) {
    console.error('[middleware] error:', err);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'server_error');
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (images, etc.)
     * - api routes (they have their own auth)
     */
    '/((?!_next/static|_next/image|favicon.ico|public/|api/).*)',
  ],
};
