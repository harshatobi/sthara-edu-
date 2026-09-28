import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { normClass } from '@/lib/ops/people';
import { levelOf, type SubjectKind } from '@/lib/subjects/catalog';
import { setClassSubjects, type OfferItem } from '@/lib/subjects/server';

export const dynamic = 'force-dynamic';

interface ClassInput { name?: unknown; grade?: unknown; section?: unknown; subjects?: unknown }

const items = (v: unknown): OfferItem[] => (Array.isArray(v) ? v : []).slice(0, 40).flatMap(x => {
  if (typeof x === 'string') return x.trim() ? [{ name: x.trim() }] : [];
  const o = x as { name?: unknown; kind?: unknown } | null;
  const name = typeof o?.name === 'string' ? o.name.trim() : '';
  const kind = o?.kind === 'core' || o?.kind === 'elective' ? (o.kind as SubjectKind) : undefined;
  return name ? [{ name, kind }] : [];
});

/**
 * PUT /api/ops/schools/:id/classes — { classes: [{ name, grade, section, subjects: (string | {name, kind})[] }], confirmRemove? }
 * Creates classes that don't exist (matched by normalised name, so "10-A" and "Class 10A" are the same
 * class) and sets each class's subjects. Subjects must be official curriculum subjects for the class's
 * level; they're linked (class_subjects), and every teacher module is renamed to the official name.
 * Classes Sthara has no curriculum for yet keep their subject names as plain text.
 * Removing a subject that has teachers or electives needs confirmRemove (409 says what's affected).
 * Never deletes classes: removing a class with students would orphan them.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const input: ClassInput[] = Array.isArray(b.classes) ? b.classes.slice(0, 200) : [];
  const admin = createAdminClient();
  const { data: school } = await admin.from('schools').select('id').eq('id', id).maybeSingle();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  const { data: existing } = await admin.from('classes').select('id, name, metadata').eq('school_id', id);
  const byNorm = new Map((existing || []).map(c => [normClass(c.name), c]));
  let created = 0, updated = 0;
  const renamed: Record<string, number> = {};
  for (const c of input) {
    const name = String(c?.name || '').trim().slice(0, 40);
    if (!name) continue;
    const subjects = items(c.subjects);
    const meta = { grade: String(c.grade || '').trim() || null, section: String(c.section || '').trim() || null };
    let hit = byNorm.get(normClass(name));
    if (hit) {
      const { error } = await admin.from('classes').update({ metadata: { ...(hit.metadata || {}), ...meta } }).eq('id', hit.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      updated++;
    } else {
      const { data, error } = await admin.from('classes').insert({ school_id: id, name, metadata: { ...meta, subjects: [] } }).select('id, name, metadata').single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      byNorm.set(normClass(name), data);
      hit = data;
      created++;
    }
    if (!levelOf(name)) {
      // No curriculum for this level yet: plain names, flagged as unlinked in the School Manager.
      await admin.from('classes').update({ metadata: { ...(hit!.metadata || {}), ...meta, subjects: [...new Set(subjects.map(s => s.name))] } }).eq('id', hit!.id);
      continue;
    }
    const r = await setClassSubjects(admin, id, op.id, 'operator', hit!.id, subjects, b.confirmRemove === true);
    if (!r.ok) {
      const { ok: _ok, status, ...rest } = r;
      void _ok;
      return NextResponse.json({ ...rest, class: name, created, updated }, { status });
    }
    for (const [k, v] of Object.entries(r.renamed ?? {})) renamed[k] = (renamed[k] ?? 0) + Number(v);
  }
  return NextResponse.json({ created, updated, renamed });
}
