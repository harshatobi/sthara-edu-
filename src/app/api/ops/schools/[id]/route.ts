import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { loadRegistry } from '@/lib/ops/registry';
import { can } from '@/lib/ops/roles';
import { pageAll } from '@/lib/ops/page';
import { loadTerritories } from '@/lib/ops/scope';
import { territoryPath } from '@/lib/ops/territories';
import { deleteSchool } from '@/lib/ops/deletions';
import { normaliseCode, parseReason } from '@/lib/settings/registry';
import { invalidateSettings } from '@/lib/settings/server';
import { USD_TO_INR } from '@/lib/ai/pricing';

export const dynamic = 'force-dynamic';

type SchoolMetricsJson = { data?: Record<string, unknown> } & Record<string, unknown>;
/** Subject-link counts sit with the other data-quality counts. */
const withSubjects = (m: SchoolMetricsJson | null, s: Record<string, number> | null) => (m && s ? { ...m, data: { ...(m.data || {}), ...s } } : m);

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/ops/schools/:id — everything the school workspace shows: the school as
 * the product enforces it, classes, roster, its change journal, its data audit
 * trail and its AI spend over the last 30 days.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const op = await operatorFor(req, 'schools.read', (await params).id);
  if (op instanceof Response) return op;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const db = createAdminClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [registry, { data: school }, { data: classes }, roster, journal, audit, usage, metrics, subjectMetrics] = await Promise.all([
    loadRegistry(db),
    db.from('schools').select('id, name, settings, trial_expires_at, created_at, updated_at').eq('id', id).maybeSingle(),
    db.from('classes').select('id, name, metadata').eq('school_id', id).order('name'),
    // Every account, a page at a time: one request stops at 1,000 rows.
    pageAll((from, to) => db.from('users').select('id, role, name, email, student_class, custom_student_id, teacher_class, assignments, metadata, created_at')
      .eq('school_id', id).order('role').order('name').order('id').range(from, to)),
    db.from('settings_changes').select('id, at, actor_email, scope, school_id, key, old_value, new_value, reason')
      .eq('school_id', id).order('at', { ascending: false }).limit(200),
    db.from('audit_log').select('id, at, actor_id, actor_role, action, table_name, row_id')
      .eq('school_id', id).order('at', { ascending: false }).limit(100),
    db.rpc('ops_school_ai', { p_school: id, p_since: since }),
    db.rpc('ops_school_metrics', { p_school: id }),
    db.rpc('ops_subject_metrics', { p_school: id }),
  ]);
  const people = roster.data;
  // Where the school sits and who owns it, for the page's summary strip.
  const { data: acc } = await db.from('ops_accounts').select('state, district, territory_id, owner_id').eq('school_id', id).maybeSingle();
  const [territories, ownerRow] = await Promise.all([
    acc?.territory_id ? loadTerritories(db) : Promise.resolve([]),
    acc?.owner_id ? db.from('users').select('name, email').eq('id', acc.owner_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const facts = registry.find(s => s.id === id);
  if (!school || !facts) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  // Guardian links, so the roster can flag students no verified parent can see (and parents with no child).
  const studentIds = (people || []).filter(p => p.role === 'student').map(p => p.id);
  // In chunks: a thousand ids do not fit in one request.
  const links: { parent_id: string; student_id: string; verified: boolean }[] = [];
  let linkErr: { message: string } | null = null;
  for (let i = 0; i < studentIds.length && !linkErr; i += 150) {
    const r = await pageAll<{ parent_id: string; student_id: string; verified: boolean }>((from, to) => db.from('guardians').select('parent_id, student_id, verified')
      .in('student_id', studentIds.slice(i, i + 150)).order('id').range(from, to));
    if (r.error) linkErr = r.error; else links.push(...r.data);
  }
  const leftIds = new Set((people || []).filter(p => (p.metadata as { left?: unknown } | null)?.left).map(p => p.id));
  const verifiedLinks = (links || []).filter(l => l.verified && !leftIds.has(l.parent_id));

  // Names for the audit trail's actors.
  const actorIds = [...new Set((audit.data || []).map(a => a.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await db.from('users').select('id, name, email').in('id', actorIds) : { data: [] };
  const who = new Map((actors || []).map(a => [a.id, a.name || a.email]));

  return NextResponse.json({
    school,
    facts,
    classes: classes || [],
    // Roles that neither manage accounts nor search the directory get the roster for its counts, without who is who.
    people: can(op.role, 'schools.manage') || can(op.role, 'people.search') ? people || []
      : (people || []).map(p => ({ ...p, name: null, email: null, custom_student_id: null })),
    // School health counts (null until the ops_school_metrics migration is applied).
    metrics: metrics.error ? null : withSubjects(((metrics.data || []) as { metrics: SchoolMetricsJson }[])[0]?.metrics ?? null,
      subjectMetrics.error ? null : ((subjectMetrics.data || []) as { metrics: Record<string, number> }[])[0]?.metrics ?? null),
    usdToInr: USD_TO_INR,
    guardians: linkErr ? null : {
      studentsWithParent: [...new Set(verifiedLinks.map(l => l.student_id))],
      parentsWithChild: [...new Set(verifiedLinks.map(l => l.parent_id))],
    },
    journal: journal.error ? null : journal.data,
    audit: audit.error ? null : !can(op.role, 'schools.manage') && !can(op.role, 'audit.read') ? []
      : (audit.data || []).map(a => ({ ...a, actor: a.actor_id ? who.get(a.actor_id) ?? null : null })),
    ai: usage.error || !usage.data ? null : {
      calls: Number((usage.data as { calls: number }).calls), failed: Number((usage.data as { failed: number }).failed),
      tokens: Number((usage.data as { tokens: number }).tokens), costUsd: Number((usage.data as { costUsd: number }).costUsd),
    },
    rosterCapped: roster.capped,
    account: {
      state: acc?.state ?? null, district: acc?.district ?? null,
      territory: acc?.territory_id ? territoryPath(territories, acc.territory_id) : null,
      owner: acc?.owner_id ? ownerRow.data?.name || ownerRow.data?.email || 'Former operator' : null,
    },
  });
}

/**
 * DELETE /api/ops/schools/:id — { confirmCode, reason }: permanently delete a school and every
 * account in it. The operator types the school's sign-in code (or its name, if it has none) to confirm. Refused (409) when the
 * school has fee records, which are kept: suspend such a school instead.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const op = await operatorFor(req, 'schools.delete', (await params).id);
  if (op instanceof Response) return op;
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
