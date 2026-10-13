import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { can } from '@/lib/ops/roles';
import { featureLabel } from '@/lib/ai/pricing';
import { APP_JOBS, isAppJob, runJob } from '@/lib/debug/jobs';
import { SINCE, isRateLimited, isSince, percentile } from '@/lib/debug/route';
import { whatsappConfig } from '@/lib/whatsapp/config';
import { SWITCHED_OFF, sendWhatsApp, type WaKind } from '@/lib/whatsapp/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/ops/delivery?since=15m|1h|6h|24h|7d&school= — what the platform sent and ran:
 *   ai        every model call in the period by feature (failures, rate limits, latency) and the latest failures
 *   whatsapp  the message log without message text: direction, kind, status, error, the number's last four digits
 *   inApp     in-app notifications and fee reminders by kind
 *   jobs      the database scheduler's jobs and runs, and the app's own jobs
 *   platform  the release this server runs and the migrations the database has
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'debug.read');
  if (op instanceof Response) return op;
  const sp = req.nextUrl.searchParams;
  const since = isSince(sp.get('since')) ? sp.get('since') as keyof typeof SINCE : '24h';
  const school = UUID.test(sp.get('school') || '') ? sp.get('school')! : null;
  const from = new Date(Date.now() - SINCE[since] * 60_000).toISOString();
  const db = createAdminClient();
  let aiQ = db.from('ai_usage').select('id, at, feature, model, school_id, ok, latency_ms, error').gte('at', from);
  let waQ = db.from('whatsapp_log').select('id, created_at, direction, kind, status, error, school_id, phone_e164').gte('created_at', from);
  let noteQ = db.from('notifications').select('type, read').gte('created_at', from);
  let remQ = db.from('fee_reminders').select('channel, recipients').gte('sent_at', from);
  if (school) { aiQ = aiQ.eq('school_id', school); waQ = waQ.eq('school_id', school); noteQ = noteQ.eq('school_id', school); remQ = remQ.eq('school_id', school); }

  const [ai, wa, notes, reminders, jobs, runs, migrations, schools] = await Promise.all([
    aiQ.order('at', { ascending: false }).limit(10_000),
    waQ.order('created_at', { ascending: false }).limit(2000),
    noteQ.limit(20_000),
    remQ.limit(10_000),
    db.rpc('ops_jobs'),
    db.from('ops_job_runs').select('id, job, started_at, finished_at, ok, detail, triggered_by').order('started_at', { ascending: false }).limit(100),
    db.rpc('ops_migrations'),
    db.from('schools').select('id, name'),
  ]);
  const schoolName = Object.fromEntries((schools.data || []).map(s => [s.id, s.name]));

  const aiRows = ai.data || [];
  const byFeature = new Map<string, typeof aiRows>();
  for (const r of aiRows) byFeature.set(r.feature, [...(byFeature.get(r.feature) ?? []), r]);
  const aiStats = [...byFeature].map(([feature, rows]) => {
    const okMs = rows.filter(r => r.ok).map(r => r.latency_ms ?? 0);
    return {
      feature, label: featureLabel(feature), calls: rows.length, failed: rows.filter(r => !r.ok).length,
      rateLimited: rows.filter(r => !r.ok && isRateLimited(r.error)).length, p50: percentile(okMs, 50), p95: percentile(okMs, 95),
    };
  }).sort((a, b) => b.failed - a.failed || b.calls - a.calls);

  const waRows = wa.data || [];
  const count = <T,>(rows: T[], key: (r: T) => string) => Object.entries(rows.reduce<Record<string, number>>((m, r) => { const k = key(r); m[k] = (m[k] ?? 0) + 1; return m; }, {})).map(([k, n]) => ({ key: k, n })).sort((a, b) => b.n - a.n);
  const noteRows = notes.data || [];
  const byType = new Map<string, { n: number; unread: number }>();
  for (const n of noteRows) { const x = byType.get(n.type || 'general') ?? { n: 0, unread: 0 }; x.n += 1; if (!n.read) x.unread += 1; byType.set(n.type || 'general', x); }

  return NextResponse.json({
    since, from, schools: schoolName, canManage: can(op.role, 'debug.manage'),
    ai: {
      calls: aiRows.length, failed: aiRows.filter(r => !r.ok).length, rateLimited: aiRows.filter(r => !r.ok && isRateLimited(r.error)).length,
      capped: aiRows.length === 10_000, stats: aiStats,
      failures: aiRows.filter(r => !r.ok).slice(0, 100).map(r => ({
        id: r.id, at: r.at, feature: r.feature, label: featureLabel(r.feature), model: r.model, schoolId: r.school_id,
        latencyMs: r.latency_ms, error: r.error, rateLimited: isRateLimited(r.error),
      })),
    },
    whatsapp: wa.error ? null : {
      mode: whatsappConfig().mode,
      byStatus: count(waRows, r => `${r.direction}:${r.status}`),
      rows: waRows.slice(0, 200).map(r => ({
        id: r.id, at: r.created_at, direction: r.direction, kind: r.kind, status: r.status, error: r.error, schoolId: r.school_id,
        phoneTail: String(r.phone_e164 || '').slice(-4),
        canResend: r.direction === 'out' && r.status === 'failed' && r.kind !== 'otp',
      })),
    },
    inApp: {
      notifications: [...byType].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.n - a.n),
      notificationsCapped: noteRows.length === 20_000,
      reminders: reminders.error ? [] : count(reminders.data || [], r => r.channel || 'unknown'),
    },
    jobs: {
      scheduler: jobs.error ? null : jobs.data,
      app: Object.entries(APP_JOBS).map(([key, j]) => ({ key, ...j, runs: runs.error ? [] : (runs.data || []).filter(r => r.job === key).slice(0, 10) })),
    },
    platform: {
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
      region: process.env.VERCEL_REGION ?? null,
      migrations: migrations.error ? null : migrations.data,
    },
  });
}

/**
 * POST /api/ops/delivery
 *   { action: 'resend', id }   send a failed outgoing WhatsApp message again (never sign-in codes)
 *   { action: 'run', job }     run one of the app's repeat-safe jobs now
 */
export async function POST(req: NextRequest) {
  const op = await operatorFor(req, 'debug.manage');
  if (op instanceof Response) return op;
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();

  if (b.action === 'run') {
    if (!isAppJob(b.job)) return NextResponse.json({ error: 'That job cannot be run from here.' }, { status: 400 });
    const run = await runJob(db, b.job, `operator:${op.email}`);
    return NextResponse.json({ ok: run.ok, run });
  }

  if (b.action === 'resend') {
    if (typeof b.id !== 'string' || !UUID.test(b.id)) return NextResponse.json({ error: 'Pick a message.' }, { status: 400 });
    const { data: m } = await db.from('whatsapp_log').select('id, direction, kind, status, error, body, phone_e164, user_id, school_id, meta').eq('id', b.id).maybeSingle();
    if (!m) return NextResponse.json({ error: 'That message no longer exists.' }, { status: 404 });
    if (m.direction !== 'out' || m.status !== 'failed' || m.kind === 'otp' || m.error === SWITCHED_OFF) {
      return NextResponse.json({ error: 'Only a failed outgoing message can be sent again, and never a sign-in code.' }, { status: 409 });
    }
    const out = await sendWhatsApp(db, {
      to: m.phone_e164, body: m.body, kind: m.kind as WaKind, userId: m.user_id, schoolId: m.school_id,
      meta: { ...((m.meta as Record<string, unknown> | null) ?? {}), resendOf: m.id, resentBy: op.email },
    });
    await db.from('audit_log').insert({
      actor_id: op.id, actor_role: 'operator', action: 'whatsapp.resent', table_name: 'whatsapp_log', row_id: m.id, school_id: m.school_id,
      new_values: { status: out.status, error: out.error ?? null },
    });
    return NextResponse.json({ ok: out.ok, status: out.status, error: out.error ?? null });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
