import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { pageAll } from '@/lib/ops/page';
import { allowanceFrom, DESIGN_SHARE, ECONOMY_AT, CAP_SHARE } from '@/lib/ai/allowance';
import { effectivePrice } from '@/lib/settings/registry';
import { getSchoolPolicy } from '@/lib/settings/server';
import { currentSession, sessionSettings, sessionStartDay } from '@/lib/students/register';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ops/usage/allowance   The AI cost cap per school this academic session (Moses, 2026-11-06: AI per
 * student per year never above 50% of the price; design for 25%). Per school: the price, the cap, each student's
 * own AI plus an equal share of the school's other AI, how many are in economy (70%+) or paused (100%), the
 * average against the 25% design target, and the students closest to the cap. Operators only.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'usage.read');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  try {
    // bounded: the schools on the platform
    const { data: schools, error } = await db.from('schools').select('id, name, settings').order('name').limit(2000);
    if (error) throw new Error(error.message);
    const out = [];
    for (const s of schools ?? []) {
      const session = currentSession(s.settings);
      const since = new Date(`${sessionStartDay(session, sessionSettings(s.settings).startMonth)}T00:00:00+05:30`).toISOString();
      const [students, usage, policy] = await Promise.all([
        pageAll<{ id: string; name: string | null }>((a, b) => db.from('users').select('id, name').eq('school_id', s.id).eq('role', 'student').order('id').range(a, b)),
        pageAll<{ student_id: string | null; cost_usd: number | string | null }>((a, b) => db.from('ai_usage').select('student_id, cost_usd')
          .eq('school_id', s.id).gte('at', since).order('id').range(a, b), 200_000),
        getSchoolPolicy(s.id, db).catch(() => null),
      ]);
      const n = students.data.length;
      if (!n && !usage.data.length) continue;
      const own = new Map<string, number>();
      let shared = 0;
      for (const u of usage.data) {
        const c = Number(u.cost_usd) || 0;
        if (u.student_id) own.set(u.student_id, (own.get(u.student_id) ?? 0) + c); else shared += c;
      }
      const perStudentShared = n ? shared / n : 0;
      const price = policy ? effectivePrice(policy) : null;
      const rows = students.data.map(st => ({ id: st.id, name: st.name || 'Student', ...allowanceFrom(price, (own.get(st.id) ?? 0) + perStudentShared) }));
      const base = allowanceFrom(price, 0);
      const avgUsed = rows.length ? rows.reduce((x, r) => x + r.used, 0) / rows.length : 0;
      out.push({
        id: s.id, name: s.name, session, since, students: n,
        priceInr: base.priceInr, capInr: base.capInr, sharedPerStudentInr: allowanceFrom(price, perStudentShared).spentInr,
        // Average use as a share of the price (the cap is half the price): compare with the 25% design target.
        avgShareOfPrice: Math.round(avgUsed * CAP_SHARE * 1000) / 1000,
        economy: rows.filter(r => r.level === 'economy').length, paused: rows.filter(r => r.level === 'paused').length,
        top: rows.filter(r => r.spentInr > 0).sort((a, b) => b.used - a.used).slice(0, 8),
      });
    }
    return NextResponse.json({ schools: out.sort((a, b) => b.paused - a.paused || b.economy - a.economy || b.avgShareOfPrice - a.avgShareOfPrice),
      designShare: DESIGN_SHARE, capShare: CAP_SHARE, economyAt: ECONOMY_AT, checkedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[ops allowance]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not work out the allowances.' }, { status: 500 });
  }
}
