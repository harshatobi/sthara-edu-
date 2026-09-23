import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { normClass } from '@/lib/ops/people';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/ops/schools/:id/classes — { classes: [{ name, grade, section, subjects: string[] }] }
 * Creates classes that don't exist and updates subjects on those that do
 * (matched by normalised name, so "10-A" and "Class 10A" are the same class).
 * Never deletes: removing a class with students would orphan them.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const input: any[] = Array.isArray(b.classes) ? b.classes.slice(0, 200) : [];
  const admin = createAdminClient();
  const { data: school } = await admin.from('schools').select('id').eq('id', id).maybeSingle();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  const { data: existing } = await admin.from('classes').select('id, name, metadata').eq('school_id', id);
  const byNorm = new Map((existing || []).map(c => [normClass(c.name), c]));
  let created = 0, updated = 0;
  for (const c of input) {
    const name = String(c?.name || '').trim().slice(0, 40);
    if (!name) continue;
    const subjects = [...new Set((Array.isArray(c.subjects) ? c.subjects : []).map((s: unknown) => String(s).trim()).filter(Boolean))].slice(0, 40);
    const meta = { grade: String(c.grade || '').trim() || null, section: String(c.section || '').trim() || null, subjects };
    const hit = byNorm.get(normClass(name));
    if (hit) {
      const { error } = await admin.from('classes').update({ metadata: { ...(hit.metadata || {}), ...meta } }).eq('id', hit.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      updated++;
    } else {
      const { data, error } = await admin.from('classes').insert({ school_id: id, name, metadata: meta }).select('id, name, metadata').single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      byNorm.set(normClass(name), data);
      created++;
    }
  }
  return NextResponse.json({ created, updated });
}
