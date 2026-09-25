import { NextResponse, type NextRequest } from 'next/server';
import { bad, ISO_DAY, requireAdmin, str } from '@/lib/admin/serverAuth';
import { sessionOf, sessionStart } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

/**
 * CBSE wellness report for the current session (school admins only).
 *   PUT  { dueOn?, data: { interventions?, counsellorReferrals?, trainingHours?, signatoryName?, signatoryTitle? } }   save draft
 *   POST { file: true }    freeze the auto-populated figures (computed here, from the database) and mark filed
 * A filed report can't be edited.
 */

const NUM_FIELDS = ['interventions', 'counsellorReferrals', 'trainingHours'] as const;
const TEXT_FIELDS = ['signatoryName', 'signatoryTitle'] as const;
const REQUIRED = [...NUM_FIELDS, ...TEXT_FIELDS];

async function current(db: any, schoolId: string, session: string) {
  const { data } = await db.from('school_filings').select('*').eq('school_id', schoolId).eq('kind', 'cbse_wellness').eq('session', session).maybeSingle();
  return data;
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, 'wellness.file');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const session = sessionOf();
  const cur = await current(db, admin.schoolId, session);
  if (cur?.status === 'filed') return bad('This report has been filed and can\'t be changed.');

  const data: Record<string, unknown> = { ...(cur?.data || {}) };
  for (const k of NUM_FIELDS) {
    if (b.data?.[k] === undefined) continue;
    if (b.data[k] === '' || b.data[k] === null) { delete data[k]; continue; }
    const n = Number(b.data[k]);
    if (!Number.isFinite(n) || n < 0 || n > 100000) return bad('Enter whole numbers for the counts and hours.');
    data[k] = k === 'trainingHours' ? Math.round(n * 10) / 10 : Math.round(n);
  }
  for (const k of TEXT_FIELDS) if (b.data?.[k] !== undefined) data[k] = str(b.data[k], 120) || undefined;
  const dueOn = b.dueOn === undefined ? cur?.due_on ?? null : ISO_DAY.test(str(b.dueOn, 10)) ? str(b.dueOn, 10) : null;

  const { error } = await db.from('school_filings').upsert({
    school_id: admin.schoolId, kind: 'cbse_wellness', session, data, due_on: dueOn, updated_by: admin.id,
  }, { onConflict: 'school_id,kind,session' });
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'wellness.file');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b?.file) return bad('Invalid request.');
  const session = sessionOf();
  const cur = await current(db, admin.schoolId, session);
  if (!cur) return bad('Save the manual sections first.');
  if (cur.status === 'filed') return bad('Already filed.');
  const missing = REQUIRED.filter(k => cur.data?.[k] === undefined || cur.data?.[k] === '');
  if (missing.length) return bad('Fill in every manual section, including the signatory, before filing.');

  // Aggregates only — no student-level rows are stored in the snapshot.
  const since = sessionStart(session);
  const [students, logs, consents] = await Promise.all([
    db.from('users').select('id', { count: 'exact', head: true }).eq('school_id', admin.schoolId).eq('role', 'student'),
    db.from('wellness_logs').select('student_id, energy').eq('school_id', admin.schoolId).gte('created_at', since).not('energy', 'is', null).limit(200000),
    db.from('consents').select('student_id').eq('school_id', admin.schoolId).eq('consent_type', 'wellness_checkin').eq('granted', true).is('revoked_at', null),
  ]);
  if (logs.error) return bad(logs.error.message, 500);
  const rows = logs.data || [];
  const participants = new Set(rows.map((r: any) => r.student_id)).size;
  const avg = rows.length ? rows.reduce((s: number, r: any) => s + Number(r.energy), 0) / rows.length : null;
  const snapshot = {
    computedAt: new Date().toISOString(), since,
    enrolled: students.count ?? 0, participants, checkins: rows.length,
    // Suppressed below 5 students, as on screen.
    avgEnergyPct: participants >= 5 && avg !== null ? Math.round(((avg - 1) / 4) * 100) : null,
    lowEnergyShare: participants >= 5 ? Math.round((rows.filter((r: any) => Number(r.energy) <= 2).length / rows.length) * 100) : null,
    consentsOnFile: (consents.data || []).length,
    flagRule: 'A check-in at energy 2 or below is flagged in the wellness feed of every teacher of that student.',
  };

  const { error } = await db.from('school_filings').update({
    status: 'filed', filed_at: new Date().toISOString(), filed_by: admin.id, snapshot,
  }).eq('id', cur.id).eq('status', 'draft');
  if (error) return bad(error.message, 500);
  return NextResponse.json({ filed: true, snapshot });
}
