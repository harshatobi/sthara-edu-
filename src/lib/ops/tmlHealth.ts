/**
 * TML must never go quietly stale. A student is "stale" when teacher-confirmed work exists that is newer than
 * their latest TML snapshot (plus a grace period for the recompute to run), or when they have graded work and
 * no snapshot at all. A broken engine shows up here within the hour instead of when a parent notices.
 */
export const TML_GRACE_MS = 30 * 60_000;

export function staleTmlStudents(
  evidence: { student_id: string; at: string | null }[],
  snapshots: { student_id: string; computed_at: string }[],
  now: number,
): string[] {
  const newest = new Map<string, number>();
  for (const e of evidence) {
    const t = e.at ? Date.parse(e.at) : NaN;
    if (Number.isFinite(t) && t > (newest.get(e.student_id) ?? 0)) newest.set(e.student_id, t);
  }
  const latest = new Map<string, number>();
  for (const s of snapshots) {
    const t = Date.parse(s.computed_at);
    if (Number.isFinite(t) && t > (latest.get(s.student_id) ?? 0)) latest.set(s.student_id, t);
  }
  const out: string[] = [];
  for (const [id, t] of newest) {
    if (now - t < TML_GRACE_MS) continue;
    const snap = latest.get(id);
    if (snap === undefined || snap + TML_GRACE_MS < t) out.push(id);
  }
  return out;
}
