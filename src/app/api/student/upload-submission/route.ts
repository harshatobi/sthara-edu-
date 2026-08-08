import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * POST /api/student/upload-submission
 * Accepts multipart/form-data with:
 *   - file: the image/file to upload
 *   - studentId: the student's user ID
 *   - assignmentId: the assignment ID
 *   - pageIndex: 0-based page number
 *
 * Uses the service-role admin client to bypass storage RLS policies.
 * Returns { url: string } on success.
 */
export async function POST(req: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const studentId = formData.get('studentId') as string;
    const assignmentId = formData.get('assignmentId') as string;
    const pageIndex = formData.get('pageIndex') as string;

    if (!file || !studentId || !assignmentId) {
      return NextResponse.json({ error: 'Missing file, studentId, or assignmentId' }, { status: 400 });
    }

    // Only allow the authenticated user to upload their own files
    if (user.id !== studentId) {
      return NextResponse.json({ error: 'Forbidden: can only upload your own submissions' }, { status: 403 });
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${studentId}/${assignmentId}/${Date.now()}_page${Number(pageIndex) + 1}.${ext}`;

    const supabase = createAdminClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadErr } = await supabase.storage
      .from('submissions')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    const { data: publicUrlData } = supabase.storage
      .from('submissions')
      .getPublicUrl(path);

    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (err: any) {
    console.error('[upload-submission]', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
