import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { bad, deny, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { DOC_KINDS, QUAL_KINDS, day } from '@/lib/hr/engine';
import { BUCKET, hrError, recordView, schoolToday } from '@/lib/hr/server';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;
/** What a file really is, from its first bytes (the name and the browser's type can say anything). */
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/**
 * Staff documents and qualifications (hr.manage). Files live in the private "staff-docs" bucket; opening one
 * needs hr.sensitive, gives a link that works for two minutes, and is recorded in the audit trail.
 *
 *   GET ?id=            a short-lived link to a document's file (hr.sensitive)
 *   POST multipart      staffMemberId, kind, title, issuedOn?, expiresOn?, file? (PDF, JPEG, PNG or WebP up to 10 MB).
 *                       Without a file it is a dated record, e.g. a police verification with its expiry.
 *   POST json           { entity: 'qualification', id?, staffMemberId, kind, title, institution?, year?, result?, verified?, documentId? }
 *   DELETE              { entity: 'document' | 'qualification', id }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'hr.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const no = deny(admin, 'hr.sensitive');
  if (no) return no;
  const id = req.nextUrl.searchParams.get('id');
  if (!isUuid(id)) return bad('Pick a document.');
  const { data: d, error } = await db.from('staff_documents').select('id, staff_member_id, kind, storage_path, file_name').eq('id', id).eq('school_id', admin.schoolId).maybeSingle();
  if (error) return hrError(error, 'Could not open the document.');
  if (!d) return bad('That document is no longer there.', 404);
  if (!d.storage_path) return bad('That record has no file.');
  const signed = await db.storage.from(BUCKET).createSignedUrl(d.storage_path, 120, { download: d.file_name || undefined });
  if (signed.error || !signed.data?.signedUrl) { console.error('[hr] sign failed:', signed.error?.message); return bad('Could not open the document.', 500); }
  await recordView(db, admin, 'staff_documents', d.id, [d.kind]);
  return NextResponse.json({ url: signed.data.signedUrl });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'hr.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const school = admin.schoolId;
  const memberOk = async (id: unknown) => {
    if (!isUuid(id)) return false;
    const { data } = await db.from('staff_members').select('id').eq('id', id).eq('school_id', school).maybeSingle();
    return !!data;
  };

  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    if (!form) return bad('Invalid upload.');
    const f = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v : ''; };
    const memberId = f('staffMemberId');
    if (!(await memberOk(memberId))) return bad('That employee isn\'t on this school\'s register.', 404);
    const kind = f('kind');
    if (!(kind in DOC_KINDS)) return bad('Pick the kind of document.');
    const title = str(f('title'), 120) || DOC_KINDS[kind as keyof typeof DOC_KINDS];
    const issued = f('issuedOn') ? day(f('issuedOn')) : null, expires = f('expiresOn') ? day(f('expiresOn')) : null;
    if ((f('issuedOn') && !issued) || (f('expiresOn') && !expires)) return bad('Check the dates.');
    if (issued && issued > schoolToday()) return bad('The issue date is in the future.');
    if (issued && expires && expires < issued) return bad('It can\'t expire before it was issued.');
    const file = form.get('file');
    let stored: { path: string; name: string; mime: string; size: number } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) return bad('That file is over 10 MB. Scan at a lower resolution or split it.');
      const buf = Buffer.from(await file.arrayBuffer());
      const type = sniff(buf);
      if (!type) return bad('Upload a PDF, JPEG, PNG or WebP.');
      const path = `${school}/${memberId}/${randomUUID()}.${type.ext}`;
      const up = await db.storage.from(BUCKET).upload(path, buf, { contentType: type.mime, upsert: false });
      if (up.error) { console.error('[hr] upload failed:', up.error.message); return bad('Could not store the file. Try again.', 500); }
      stored = { path, name: str(file.name, 200).replace(/[\\/]/g, '_') || `document.${type.ext}`, mime: type.mime, size: file.size };
    } else if (!expires && !issued) {
      return bad('Attach a file, or give the dates for a record without one.');
    }
    const { data, error } = await db.from('staff_documents').insert({
      school_id: school, staff_member_id: memberId, kind, title, issued_on: issued, expires_on: expires,
      storage_path: stored?.path ?? null, file_name: stored?.name ?? null, mime: stored?.mime ?? null, size_bytes: stored?.size ?? null, uploaded_by: admin.id,
    }).select('id').single();
    if (error) {
      if (stored) await db.storage.from(BUCKET).remove([stored.path]);
      return hrError(error, 'Could not save the document.');
    }
    return NextResponse.json({ ok: true, id: data.id });
  }

  const b = await req.json().catch(() => null);
  if (b?.entity !== 'qualification') return bad('Invalid request.');
  if (!(await memberOk(b.staffMemberId))) return bad('That employee isn\'t on this school\'s register.', 404);
  if (!(b.kind in QUAL_KINDS)) return bad('Pick the kind of qualification.');
  const title = str(b.title, 120);
  if (!title) return bad('Name the qualification, like "B.Sc Mathematics".');
  const blank = b.year === null || b.year === undefined || b.year === '';
  const year = blank ? null : Number(b.year);
  if (year !== null && (!Number.isInteger(year) || year < 1950 || year > Number(schoolToday().slice(0, 4)))) return bad('Check the year.');
  let documentId: string | null = null;
  if (b.documentId) {
    const { data: d } = isUuid(b.documentId) ? await db.from('staff_documents').select('id').eq('id', b.documentId).eq('staff_member_id', b.staffMemberId).maybeSingle() : { data: null };
    if (!d) return bad('That certificate isn\'t among this employee\'s documents.');
    documentId = d.id;
  }
  const row = {
    kind: b.kind, title, institution: str(b.institution, 160) || null, year, result: str(b.result, 60) || null, document_id: documentId,
    // Verified means someone at the school saw the original; it records who and when.
    verified_on: b.verified ? (day(b.verifiedOn) ?? schoolToday()) : null, verified_by: b.verified ? admin.id : null,
  };
  if (b.id) {
    if (!isUuid(b.id)) return bad('Unknown qualification.');
    const { data: old } = await db.from('staff_qualifications').select('verified_on, verified_by').eq('id', b.id).eq('staff_member_id', b.staffMemberId).maybeSingle();
    if (!old) return bad('That qualification is no longer there.', 404);
    // Editing something already verified keeps the original verifier.
    if (b.verified && old.verified_on) { row.verified_on = old.verified_on; row.verified_by = old.verified_by; }
    const { error } = await db.from('staff_qualifications').update(row).eq('id', b.id);
    return error ? hrError(error, 'Could not save the qualification.') : NextResponse.json({ ok: true, id: b.id });
  }
  const { data, error } = await db.from('staff_qualifications').insert({ ...row, school_id: school, staff_member_id: b.staffMemberId, created_by: admin.id }).select('id').single();
  return error ? hrError(error, 'Could not save the qualification.') : NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, 'hr.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!isUuid(b?.id)) return bad('Pick a record.');
  if (b.entity === 'qualification') {
    const { error } = await db.from('staff_qualifications').delete().eq('id', b.id).eq('school_id', admin.schoolId);
    return error ? hrError(error, 'Could not remove the qualification.') : NextResponse.json({ ok: true });
  }
  if (b.entity !== 'document') return bad('Unknown record type.');
  const { data: d } = await db.from('staff_documents').select('id, storage_path').eq('id', b.id).eq('school_id', admin.schoolId).maybeSingle();
  if (!d) return bad('That document is no longer there.', 404);
  const { error } = await db.from('staff_documents').delete().eq('id', d.id);
  if (error) return hrError(error, 'Could not remove the document.');
  if (d.storage_path) {
    const rm = await db.storage.from(BUCKET).remove([d.storage_path]);
    if (rm.error) console.error('[hr] file not removed:', d.storage_path, rm.error.message);
  }
  return NextResponse.json({ ok: true });
}
