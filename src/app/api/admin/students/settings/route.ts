import { NextResponse, type NextRequest } from 'next/server';
import { deny, requireAdmin, str } from '@/lib/admin/serverAuth';
import { openNextSession, readSettings, saveNumbering, saveSessionStart, sessionBlockers } from '@/lib/students/server';
import { saveChecklist } from '@/lib/students/documentsServer';

export const dynamic = 'force-dynamic';

/**
 * Register settings.
 *   GET                                         numbering, roll-number rule, session (students.read); what blocks the next session (session.manage)
 *   POST { action }:
 *     numbering { prefix, pad, rollRule }       students.manage
 *     session-start { month }                   session.manage (school admin)
 *     open-session { override? }                session.manage: every class promoted, or a reason
 *     checklist { list: [{ kind, from, to }] }  session.manage: the documents asked for at admission, per class
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ['students.read', 'session.manage']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const [settings, blockers] = await Promise.all([readSettings(db, admin.schoolId), admin.access.can('session.manage') ? sessionBlockers(db, admin.schoolId) : null]);
  return NextResponse.json({ settings, blockers, can: { manage: admin.access.can('students.manage'), session: admin.access.can('session.manage') } });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ['students.manage', 'session.manage']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = (await req.json().catch(() => null)) || {};
  const a = { id: admin.id, name: admin.name, schoolId: admin.schoolId };
  let out;
  if (b.action === 'numbering') { const d = deny(admin, 'students.manage'); if (d) return d; out = await saveNumbering(db, a, b); }
  else if (b.action === 'session-start') { const d = deny(admin, 'session.manage'); if (d) return d; out = await saveSessionStart(db, a, b.month); }
  else if (b.action === 'open-session') { const d = deny(admin, 'session.manage'); if (d) return d; out = await openNextSession(db, a, str(b.override, 300)); }
  else if (b.action === 'checklist') { const d = deny(admin, 'session.manage'); if (d) return d; out = await saveChecklist(db, { ...a, role: 'admin' }, b.list); }
  else out = { ok: false as const, error: 'Unknown action.', status: 400 };
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
