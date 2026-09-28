import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { metresBetween } from '@/lib/attendance/engine';
import { recordPunch } from '@/lib/attendance/server';

export const dynamic = 'force-dynamic';

/** A position fix rougher than this (or the campus radius, if larger) can't say whether someone is on campus. */
const MAX_ACCURACY_M = 500;

/**
 * Check in or out from the app (teachers and office accounts).
 *   POST { direction: 'in' | 'out', lat?, lng?, accuracy? }
 * With a campus location set, a position is required: it is compared here and only "on campus: yes/no" is
 * stored (the coordinates are never saved). A fix too rough to place someone on campus is refused rather
 * than recorded as unknown. Schools without a campus location record on_campus as unknown.
 * The position comes from the phone, so this raises the bar rather than proving presence: off-campus
 * punches are flagged for the register, and biometric punches stay the stronger record.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  if (!checkRateLimit(`checkin:${staff.id}`, ...limitOf('checkin')).allowed) return NextResponse.json({ error: 'Too many check-ins at once.' }, { status: 429 });
  const b = await req.json().catch(() => null);
  if (b?.direction !== 'in' && b?.direction !== 'out') return NextResponse.json({ error: 'Check in or check out?' }, { status: 400 });
  const { data: s } = await db.from('attendance_settings').select('geofence_lat, geofence_lng, geofence_radius_m').eq('school_id', staff.schoolId).maybeSingle();
  const lat = Number(b.lat), lng = Number(b.lng);
  const has = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const fenced = s?.geofence_lat !== null && s?.geofence_lat !== undefined;
  const accuracy = Number(b.accuracy);
  if (fenced && !has) return NextResponse.json({ error: 'Turn on location for this site to check in from the app.' }, { status: 400 });
  if (fenced && Number.isFinite(accuracy) && accuracy > Math.max(MAX_ACCURACY_M, Number(s.geofence_radius_m))) {
    return NextResponse.json({ error: `Your location is only accurate to about ${Math.round(accuracy)} m. Step outside or turn on precise location and try again.` }, { status: 400 });
  }
  let onCampus: boolean | null = null;
  let distance: number | null = null;
  if (fenced && has) {
    distance = Math.round(metresBetween({ lat, lng }, { lat: Number(s.geofence_lat), lng: Number(s.geofence_lng) }));
    onCampus = distance <= Number(s.geofence_radius_m);
  }
  const { error } = await recordPunch(db, { schoolId: staff.schoolId, userId: staff.id, direction: b.direction, source: 'app', onCampus });
  if (error) { console.error('[checkin]', error.message); return NextResponse.json({ error: 'Could not record that. Try again.' }, { status: 500 }); }
  return NextResponse.json({ ok: true, onCampus, distance: onCampus === false ? distance : null });
}
