import { NextResponse, type NextRequest } from 'next/server';
import { bad, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { toE164 } from '@/lib/whatsapp/config';
import { dbError, uuidOrNull } from '@/lib/schedule/server';
import type { StaffCategory } from '@/lib/schedule/types';

export const dynamic = 'force-dynamic';

/**
 * The staff register (schedule.workforce): everyone who works at the school, including
 * support staff with no login. A row can link a teacher or office account for its details.
 *   PUT    { id?, userId?, name, category, designation?, wingId?, phone?, employeeCode?, joinedOn?, active?,
 *            employment?: 'permanent' | 'contract' | 'visiting', contractFrom?, contractTo?, whatsappOptIn? }
 *          WhatsApp consent is only for staff with no login (accounts link WhatsApp themselves) and needs a phone.
 *   DELETE { id }   takes someone off the active register (kept for the record)
 */
const CATEGORIES: StaffCategory[] = ['teaching', 'office', 'support', 'assistant'];

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.workforce');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const id = b.id ? (isUuid(b.id) ? b.id : null) : null;
  if (b.id && !id) return bad('Unknown staff member.');
  const category: StaffCategory | null = CATEGORIES.includes(b.category) ? b.category : null;
  if (!category) return bad('Pick a category.');

  let name = str(b.name, 120);
  const userId = uuidOrNull(b.userId);
  if (userId) {
    const { data: u } = await db.from('users').select('id, name, role').eq('id', userId).eq('school_id', admin.schoolId).maybeSingle();
    if (!u || (u.role !== 'teacher' && u.role !== 'admin')) return bad('That account isn\'t a teacher or office account in this school.');
    name = name || u.name || '';
  }
  if (!name) return bad('Give their name.');
  const phone = b.phone ? toE164(b.phone) : null;
  if (b.phone && !phone) return bad('That phone number doesn\'t look right. Use a 10-digit mobile or +country code.');
  const wingId = uuidOrNull(b.wingId);
  if (wingId) {
    const { data: w } = await db.from('sched_wings').select('id').eq('id', wingId).eq('school_id', admin.schoolId).maybeSingle();
    if (!w) return bad('Unknown wing.');
  }
  const joinedOn = b.joinedOn ? String(b.joinedOn) : null;
  if (joinedOn && !ISO_DAY.test(joinedOn)) return bad('Pick the joining date.');
  const employment = ['permanent', 'contract', 'visiting'].includes(b.employment) ? b.employment : 'permanent';
  const contractFrom = b.contractFrom ? String(b.contractFrom) : null, contractTo = b.contractTo ? String(b.contractTo) : null;
  if ((contractFrom && !ISO_DAY.test(contractFrom)) || (contractTo && !ISO_DAY.test(contractTo))) return bad('Pick the contract dates.');
  if (contractFrom && contractTo && contractTo < contractFrom) return bad('The contract must end after it starts.');
  if (employment !== 'permanent' && !contractTo) return bad(`A ${employment} member of staff needs an end date for their contract.`);
  const optIn = !userId && !!b.whatsappOptIn;
  if (optIn && !phone) return bad('Add their mobile number to send them their roster on WhatsApp.');

  const row = {
    school_id: admin.schoolId, user_id: userId, name, category, designation: str(b.designation, 80), wing_id: wingId,
    phone_e164: phone, employee_code: str(b.employeeCode, 40) || null, joined_on: joinedOn, active: b.active !== false,
    employment, contract_from: employment === 'permanent' ? null : contractFrom, contract_to: employment === 'permanent' ? null : contractTo, whatsapp_opt_in: optIn,
    updated_at: new Date().toISOString(),
  };
  if (id) {
    const { data, error } = await db.from('staff_members').update(row).eq('id', id).eq('school_id', admin.schoolId).select('id').maybeSingle();
    if (error) return dbError(error, 'Could not save the staff member.');
    if (!data) return bad('That staff member is no longer on the register.', 404);
    return NextResponse.json({ ok: true, id });
  }
  const { data, error } = await db.from('staff_members').insert({ ...row, created_by: admin.id }).select('id').single();
  return error ? dbError(error, 'Could not add the staff member.') : NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.workforce');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!isUuid(b?.id)) return bad('Pick a staff member.');
  const { error } = await db.from('staff_members').update({ active: false, updated_at: new Date().toISOString() }).eq('id', b.id).eq('school_id', admin.schoolId);
  return error ? dbError(error, 'Could not update the register.') : NextResponse.json({ ok: true });
}
