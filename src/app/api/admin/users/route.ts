import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { accessOf } from '@/lib/admin/serverAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users?schoolId=xxx
 * Fetches all users for a school using service role (bypasses RLS).
 * Requires admin role.
 */
export async function GET(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    if (!schoolId) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });

    const supabase = createAdminClient(); // service role — bypasses RLS

    // Verify requesting user is an admin/superadmin of this school
    const { data: requestingUser } = await supabase
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (
      !requestingUser ||
      requestingUser.school_id !== schoolId ||
      !['admin', 'superadmin'].includes(requestingUser.role)
    ) {
      return NextResponse.json({ error: 'Forbidden: must be school admin' }, { status: 403 });
    }

    if (requestingUser.role === 'admin') {
      const access = await accessOf(supabase, user.id, requestingUser.school_id);
      if (!access.can('people.manage') && !access.can('access.manage')) return NextResponse.json({ error: "Your role doesn't include this." }, { status: 403 });
    }

    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, name, email, role, student_class, branch, custom_student_id, assignments, teacher_class, metadata, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (usersErr) throw usersErr;

    // Parents' children from the verified guardian links (the source of truth), not the older metadata list.
    const parentIds = (users || []).filter(u => u.role === 'parent').map(u => u.id);
    const { data: links } = parentIds.length
      ? await supabase.from('guardians').select('parent_id, student_id, verified').in('parent_id', parentIds)
      : { data: [] as any[] };
    const nameOf = new Map((users || []).map(u => [u.id, u.name]));
    const children = new Map<string, { name: string; verified: boolean }[]>();
    for (const l of links || []) children.set(l.parent_id, [...(children.get(l.parent_id) || []), { name: nameOf.get(l.student_id) || 'A student', verified: !!l.verified }]);
    return NextResponse.json({ users: (users || []).map(u => (u.role === 'parent' ? { ...u, children: children.get(u.id) || [] } : u)) });
  } catch (err: any) {
    console.error('[admin/users] Error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
