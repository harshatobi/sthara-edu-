import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifyApiToken(request.headers.get('authorization'));
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { schoolId, classData } = body;

    if (!schoolId || !classData || !classData.name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('classes')
      .insert({
        school_id: schoolId,
        name: classData.name,
        metadata: {
          ...classData,
          enrolledStudentIds: [],
        },
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, classId: data.id });
  } catch (error: any) {
    console.error('Create Class Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
