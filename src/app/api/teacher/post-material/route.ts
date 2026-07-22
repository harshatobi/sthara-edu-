import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export async function POST(req: NextRequest) {
  const { user, error: authError } = await verifyApiToken(req.headers.get('authorization'));
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { schoolId, teacherId, teacherName, topic, outputFormat, content } = await req.json();

    if (!schoolId || !teacherId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Insert material
    const { data: material, error: matErr } = await supabase
      .from('materials')
      .insert({
        school_id: schoolId,
        teacher_id: teacherId,
        title: `AI Generated ${outputFormat}: ${String(topic || '').substring(0, 30)}...`,
        content: { body: content, format: outputFormat },
        subject: null,
        class: null,
      })
      .select('id')
      .single();

    if (matErr) throw matErr;

    // Insert notification
    await supabase.from('notifications').insert({
      school_id: schoolId,
      student_id: null,
      title: `New Material: ${outputFormat}`,
      body: `Your teacher ${teacherName || ''} posted new study material for you to review.`,
      read: false,
    });

    return NextResponse.json({ success: true, materialId: material.id });
  } catch (error: any) {
    console.error('Error posting material:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
