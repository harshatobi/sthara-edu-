import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { loadContext } from '@/lib/tutor/groundingServer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/student/subjects — the subjects this student takes (their class's core
 * subjects and chosen electives), each with its official chapters and micro-topics.
 * The tutor's topic picker lists exactly these, so what a student can pick is what
 * the tutor will accept. Class and enrolment come from the database.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'student') return NextResponse.json({ error: 'Only students have subjects.' }, { status: 403 });
  const ctx = await loadContext(createAdminClient(), user.id);
  return NextResponse.json({
    level: ctx.scope.level,
    exams: ctx.scope.exams,
    subjects: ctx.scope.subjects.map(s => ({
      key: s.key, name: s.name, level: s.level, source: s.source,
      chapters: s.chapters.map(c => ({ name: c.name, unit: c.unit, topics: c.topics, exams: c.exams, formativeOnly: c.formativeOnly })),
    })),
  });
}
