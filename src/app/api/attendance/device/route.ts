import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { importPunches } from '@/lib/attendance/server';

export const dynamic = 'force-dynamic';

/**
 * Biometric devices push punches here (set up per school under Schedule > Attendance > Devices).
 *   POST  Authorization: Bearer <device token>
 *         { punches: [{ code: "E104", at: "2026-10-05 07:52" | ISO timestamp, direction?: "in" | "out" }] }   up to 1000
 * Times without a zone are school-local (IST). Codes are matched to employee codes on the staff register.
 *
 * NOTE (cloud setup, pending): most Indian devices (eSSL, ZKTeco, Realtime) push through their vendor cloud or the
 * ZKTeco "ADMS" protocol (GET/POST /iclock/cdata with tab-separated ATTLOG lines), not this JSON. When a school's
 * vendor cloud is chosen, add a small adapter route that translates its webhook (or ADMS ATTLOG lines) into this
 * shape and calls importPunches. Until then schools upload the device's export on the attendance board.
 */
export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim() || req.headers.get('x-device-token') || '';
  if (token.length < 20) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(`device:${ip}`, 120, 60_000).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const db = createAdminClient();
  const { data: device } = await db.from('attendance_devices').select('id, school_id, active').eq('token_hash', createHash('sha256').update(token).digest('hex')).maybeSingle();
  if (!device || !device.active) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null);
  const punches = Array.isArray(b?.punches) ? b.punches.slice(0, 1000) : [];
  if (!punches.length) return NextResponse.json({ error: 'No punches' }, { status: 400 });
  const r = await importPunches(db, device.school_id, punches, { createdBy: null, deviceId: device.id });
  await db.from('attendance_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', device.id);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ ok: true, ...r });
}
