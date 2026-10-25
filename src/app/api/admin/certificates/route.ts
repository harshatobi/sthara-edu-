import { NextResponse, type NextRequest } from 'next/server';
import { deny, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import {
  approve, cancel, duplicate, one, pdfLink, portalUploadUrl, prepare, recordPortal, register, saveDraft, saveSettings, saveType, sendBack, settings, submit, types,
} from '@/lib/certificates/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Certificates out (brief 05).
 *   GET ?studentId=&status=&q=                  the register (students.read or any certificates permission), the kinds, settings
 *   GET ?id=                                    one certificate with its values and the dues check
 *   POST { action }:
 *     prepare { studentId, typeId, purpose?, conduct?, fyStart? }   certificates.prepare: a draft filled from the record
 *     save { id, data } | submit { id }                             certificates.prepare
 *     approve { id, override? } | send-back { id, note }            certificates.approve
 *     cancel { id, reason } | duplicate { id }                      certificates.approve (a draft: whoever prepares)
 *     pdf { id }                                                    a two-minute link (recorded); a draft is a DRAFT preview
 *     portal-url { id, ext } | portal-record { id, ref, path? }     certificates.prepare: a state-board TC from the portal
 *     type-save { id?, title?, body?, prefix, needsApproval?, active? } | settings-save { ... }   certificates.setup
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ['students.read', 'certificates.prepare', 'certificates.approve', 'certificates.setup']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const p = req.nextUrl.searchParams;
  const can = { prepare: admin.access.can('certificates.prepare'), approve: admin.access.can('certificates.approve'), setup: admin.access.can('certificates.setup') };
  try {
    const id = p.get('id');
    if (id) {
      if (!isUuid(id)) return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
      const c = await one(db, admin.schoolId, id);
      return c ? NextResponse.json({ ...c, can }) : NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
    }
    const studentId = p.get('studentId');
    const [rows, ts, set] = await Promise.all([
      register(db, admin.schoolId, { studentId: isUuid(studentId) ? studentId : undefined, status: p.get('status') ?? undefined, search: str(p.get('q'), 60) }),
      types(db, admin.schoolId), settings(db, admin.schoolId),
    ]);
    // The signature and stamp images go only to whoever sets them up.
    const s = can.setup ? set : { ...set, signature: set.signature ? 'set' : null, stamp: set.stamp ? 'set' : null };
    return NextResponse.json({ certificates: rows, types: ts, settings: s, can });
  } catch (e) {
    console.error('[admin/certificates]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load the certificates.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ['students.read', 'certificates.prepare', 'certificates.approve', 'certificates.setup']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = (await req.json().catch(() => null)) || {};
  const a = { id: admin.id, name: admin.name, schoolId: admin.schoolId };
  const need = (p: 'certificates.prepare' | 'certificates.approve' | 'certificates.setup') => deny(admin, p);
  const id = isUuid(b.id) ? b.id : null;
  const noId = { ok: false as const, error: 'Pick a certificate.', status: 400 };
  let out;
  switch (b.action) {
    case 'prepare': { const d = need('certificates.prepare'); if (d) return d; out = isUuid(b.studentId) ? await prepare(db, a, b.studentId, b) : { ok: false as const, error: 'Pick a student.', status: 400 }; break; }
    case 'save': { const d = need('certificates.prepare'); if (d) return d; out = id ? await saveDraft(db, a, id, b.data) : noId; break; }
    case 'submit': { const d = need('certificates.prepare'); if (d) return d; out = id ? await submit(db, a, id) : noId; break; }
    case 'approve': { const d = need('certificates.approve'); if (d) return d; out = id ? await approve(db, a, id, str(b.override, 300)) : noId; break; }
    case 'send-back': { const d = need('certificates.approve'); if (d) return d; out = id ? await sendBack(db, a, id, str(b.note, 300)) : noId; break; }
    case 'cancel': {
      // Throwing away one's own draft is preparing; cancelling an issued certificate is the principal's.
      const c = id ? await one(db, admin.schoolId, id) : null;
      if (!c) { out = noId; break; }
      const d = need(c.cert.status === 'draft' ? 'certificates.prepare' : 'certificates.approve'); if (d) return d;
      out = await cancel(db, a, id!, str(b.reason, 300)); break;
    }
    case 'duplicate': { const d = need('certificates.approve'); if (d) return d; out = id ? await duplicate(db, a, id) : noId; break; }
    case 'pdf': out = id ? await pdfLink(db, a, id) : noId; break;
    case 'portal-url': { const d = need('certificates.prepare'); if (d) return d; out = id ? await portalUploadUrl(db, a, id, str(b.ext, 5).toLowerCase()) : noId; break; }
    case 'portal-record': { const d = need('certificates.prepare'); if (d) return d; out = id ? await recordPortal(db, a, id, b) : noId; break; }
    case 'type-save': { const d = need('certificates.setup'); if (d) return d; out = await saveType(db, a, b); break; }
    case 'settings-save': { const d = need('certificates.setup'); if (d) return d; out = await saveSettings(db, a, b); break; }
    default: out = { ok: false as const, error: 'Unknown action.', status: 400 };
  }
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
