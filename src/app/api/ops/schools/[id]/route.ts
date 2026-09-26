import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { loadRegistry } from '@/lib/ops/registry';
import { deleteSchool } from '@/lib/ops/deletions';
import { normaliseCode, parseReason } from '@/lib/settings/registry';
import { invalidateSettings } from '@/lib/settings/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/ops/schools/:id — everything the school workspace shows: the school as
 * the product enforces it, classes, roster, its change journal, its data audit
 * trail and its AI spend over the last 30 days.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const db = createAdminClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [registry, { data: school }, { data: classes }, { data: people }, journal, audit, usage] = await Promise.all([
    loadRegistry(db),
    db.from('schools').select('id, name, settings, trial_expires_at, created_at, updated_at').eq('id', id).maybeSingle(),
    db.from('classes').select('id, name, metadata').eq('school_id', id).order('name'),
    db.from('users').select('id, role, name, email, student_class, custom_student_id, teacher_class, assignments, metadata, created_at')
      .eq('school_id', id).order('role').order('name'),
    db.from('settings_changes').select('id, at, actor_email, scope, school_id, key, old_value, new_value, reason')
      .eq('school_id', id).order('at', { ascending: false }).limit(200),
    db.from('audit_log').select('id, at, actor_id, actor_role, action, table_name, row_id')
      .eq('school_id', id).order('at', { ascending: false }).limit(100),
    db.from('ai_usage').select('cost_usd, input_tokens, output_tokens, thinking_tokens, ok').eq('school_id', id).gte('at', since).limit(50_000),
  ]);
  const facts = registry.find(s => s.id === id);
  if (!school || !facts) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  // Names for the audit trail's actors.
  const actorIds = [...new Set((audit.data || []).map(a => a.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await db.from('users').select('id, name, email').in('id', actorIds) : { data: [] };
  const who = new Map((actors || []).map(a => [a.id, a.name || a.email]));

  const u = usage.data || [];
  return NextResponse.json({
    school,
    facts,
    classes: classes || [],
    people: people || [],
    journal: journal.error ? null : journal.data,
    audit: audit.error ? null : (audit.data || []).map(a => ({ ...a, actor: a.actor_id ? who.get(a.actor_id) ?? null : null })),
    ai: usage.error ? null : {
      calls: u.length,
      failed: u.filter(r => !r.ok).length,
      tokens: u.reduce((n, r) => n + r.input_tokens + r.output_tokens + r.thinking_tokens, 0),
      costUsd: u.reduce((n, r) => n + Number(r.cost_usd ?? 0), 0),
    },
  });
}

/**
 * DELETE /api/ops/schools/:id — { confirmCode, reason }: permanently delete a school and every
 * account in it. The operator types the school's sign-in code (or its name, if it has none) to confirm. Refused (409) when the
 * school has fee records, which are kept: suspend such a school instead.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const reason = parseReason(b.reason);
  if (!reason) return NextResponse.json({ error: 'Give a reason for deleting the school (at least 4 characters).' }, { status: 400 });
  const db = createAdminClient();
  const { data: school } = await db.from('schools').select('name, settings').eq('id', id).maybeSingle();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  // Confirm with the sign-in code, or the name for a school that has no code.
  const code = String((school.settings as { code?: unknown } | null)?.code ?? '');
  const typed = typeof b.confirmCode === 'string' ? b.confirmCode : '';
  const confirmed = code ? normaliseCode(typed) === code : typed.trim().toLowerCase() === String(school.name).trim().toLowerCase();
  if (!confirmed) {
    return NextResponse.json({ error: code ? 'Type the school’s sign-in code exactly to confirm.' : 'Type the school’s name exactly to confirm.' }, { status: 400 });
  }
  const out = await deleteSchool(db, op, id, reason);
  invalidateSettings(id);
  return out.ok ? NextResponse.json({ ok: true, ...out.result }) : NextResponse.json({ error: out.error }, { status: out.status });
}
