import { NextResponse, type NextRequest } from 'next/server';
import { deny, isUuid, requireAdmin } from '@/lib/admin/serverAuth';
import { addEvent, getHealth, removeEvent, saveCard, setFlags } from '@/lib/students/healthServer';

export const dynamic = 'force-dynamic';

/**
 * One student's health record.
 *   GET    health.read: the whole record (the look is recorded); students.read: the UDISE+ part only
 *   POST   health.manage { action }:
 *     card { blood_group, height_cm, ..., allergies, conditions, medication }   consented parts need the parent's consent
 *     event-add { kind, on_date, data, note } | event-remove { eventId }
 *     flags { keep?, hold? }   keep after leaving / legal hold (stop the retention erasure)
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ['health.read', 'students.read']);
  if ('res' in auth) return auth.res;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const full = auth.admin.access.can('health.read');
  const out = await getHealth(auth.db, { id: auth.admin.id, schoolId: auth.admin.schoolId }, id, full);
  if (!out) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  return NextResponse.json({ ...out, can: { manage: auth.admin.access.can('health.manage') } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, 'health.manage');
  if ('res' in auth) return auth.res;
  const d = deny(auth.admin, 'health.manage'); if (d) return d;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const b = (await req.json().catch(() => null)) || {};
  const a = { id: auth.admin.id, schoolId: auth.admin.schoolId };
  const out = b.action === 'card' ? await saveCard(auth.db, a, id, b.card || {})
    : b.action === 'event-add' ? await addEvent(auth.db, a, id, b.event || {})
      : b.action === 'event-remove' ? (isUuid(b.eventId) ? await removeEvent(auth.db, a, id, b.eventId) : { ok: false as const, error: 'Pick an entry.', status: 400 })
        : b.action === 'flags' ? await setFlags(auth.db, a, id, { keep: b.keep, hold: b.hold })
          : { ok: false as const, error: 'Unknown action.', status: 400 };
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
