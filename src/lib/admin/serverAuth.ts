import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { Access, activeGrants, PERMS, type Perm } from './rbac';
import { isoDay } from './format';

export interface SchoolAdmin { id: string; name: string; schoolId: string; schoolName: string; access: Access }

/**
 * Resolves the caller of an admin route from their bearer token and checks
 * they hold `need` (any one of, when an array). Role, school and office roles
 * come from the database, never the request body, so an admin can only act
 * on their own school and only within their grants.
 */
export async function requireAdmin(req: NextRequest, need?: Perm | Perm[]): Promise<{ admin: SchoolAdmin; db: SupabaseClient } | { res: NextResponse }> {
  const { user, error, blocked } = await verifyApiToken(req.headers.get('authorization'));
  if (blocked) return { res: NextResponse.json({ error, code: blocked }, { status: 403 }) };
  if (!user || error) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(`admin:${user.id}:${ip}`, ...limitOf('admin')).allowed) {
    return { res: NextResponse.json({ error: 'Too many requests. Wait a minute and try again.' }, { status: 429 }) };
  }
  const db = createAdminClient();
  const { data: row } = await db.from('users').select('id, name, role, school_id, schools(name)').eq('id', user.id).maybeSingle();
  if (!row || row.role !== 'admin' || !row.school_id) {
    return { res: NextResponse.json({ error: 'Only school office accounts can do this.' }, { status: 403 }) };
  }
  const { data: grants } = await db.from('role_grants').select('*').eq('user_id', row.id).eq('school_id', row.school_id).is('revoked_at', null);
  const access = new Access(activeGrants(grants || [], isoDay()).map(g => g.role));
  const needs = need ? (Array.isArray(need) ? need : [need]) : [];
  if (needs.length && !access.any(...needs)) {
    return { res: NextResponse.json({ error: `Your role doesn't allow this (${PERMS[needs[0]].toLowerCase()}). Ask a school admin.` }, { status: 403 }) };
  }
  const school: any = Array.isArray((row as any).schools) ? (row as any).schools[0] : (row as any).schools;
  return { db, admin: { id: row.id, name: row.name || 'Admin', schoolId: row.school_id, schoolName: school?.name || 'your school', access } };
}

/** For routes with several actions: 403 unless the admin holds `p`. */
export function deny(admin: SchoolAdmin, p: Perm): NextResponse | null {
  return admin.access.can(p) ? null : NextResponse.json({ error: `Your role doesn't allow this (${PERMS[p].toLowerCase()}). Ask a school admin.` }, { status: 403 });
}

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
export const str = (v: unknown, n = 2000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
/** Rupee amount with at most two decimals, or null. */
export function money(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e9) return null;
  const paise = Math.round(n * 100);
  return Math.abs(paise - n * 100) < 1e-6 ? paise / 100 : null;
}

/** Office access of any user, for routes that do their own caller lookup. */
export async function accessOf(db: SupabaseClient, userId: string, schoolId: string): Promise<Access> {
  const { data } = await db.from('role_grants').select('*').eq('user_id', userId).eq('school_id', schoolId).is('revoked_at', null);
  return new Access(activeGrants(data || [], isoDay()).map(g => g.role));
}
