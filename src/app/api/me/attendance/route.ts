import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { metresBetween } from '@/lib/attendance/engine';
import { recordPunch } from '@/lib/attendance/server';

export const dynamic = 'force-dynamic';

/**
 * Check in or out from the app (teachers and office accounts).
 *   POST { direction: 'in' | 'out', lat?, lng? }
 * With a campus location set, the position is compared here and only "on campus: yes/no" is stored; the
 * coordinates are never saved. Without a position (or a campus location) on_campus stays unknown.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  if (!checkRateLimit(`checkin:${staff.id}`, ...limitOf('leave')).allowed) return NextResponse.json({ error: 'Too many check-ins at once.' }, { status: 429 });
  const b = await req.json().catch(() => null);
  if (b?.direction !== 'in' && b?.direction !== 'out') return NextResponse.json({ error: 'Check in or check out?' }, { status: 400 });
  const { data: s } = await db.from('attendance_settings').select('geofence_lat, geofence_lng, geofence_radius_m').eq('school_id', staff.schoolId).maybeSingle();
  const lat = Number(b.lat), lng = Number(b.lng);
  const has = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  let onCampus: boolean | null = null;
  let distance: number | null = null;
  if (s?.geofence_lat !== null && s?.geofence_lat !== undefined && has) {
    distance = Math.round(metresBetween({ lat, lng }, { lat: Number(s.geofence_lat), lng: Number(s.geofence_lng) }));
    onCampus = distance <= Number(s.geofence_radius_m);
  }
  const { error } = await recordPunch(db, { schoolId: staff.schoolId, userId: staff.id, direction: b.direction, source: 'app', onCampus });
  if (error) { console.error('[checkin]', error.message); return NextResponse.json({ error: 'Could not record that. Try again.' }, { status: 500 }); }
  return NextResponse.json({ ok: true, onCampus, distance: onCampus === false ? distance : null });
}
