import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/server';
import { verify } from '@/lib/certificates/server';
import { dmy } from '@/lib/certificates/certs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Check a certificate', robots: { index: false, follow: false } };

/**
 * The page a certificate's QR code opens. Anyone can check that a certificate is genuine and still valid; it shows
 * only the school, the kind and number, the student's name and the date (brief 05: no date of birth, parents,
 * Aadhaar or marks).
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await verify(createAdminClient(), token);
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, background: '#F4F6FA', color: '#002147', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 16, padding: '28px 24px', boxShadow: '0 1px 3px rgba(0,33,71,.08)' }}>
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', color: '#64748B', margin: 0 }}>CERTIFICATE CHECK</p>
        {!v ? (
          <>
            <h1 style={{ fontSize: 22, margin: '10px 0 8px' }}>Not found</h1>
            <p style={{ color: '#475569', lineHeight: 1.5, margin: 0 }}>Sthara has no certificate for this link. Check the link, or ask the school that issued it.</p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, margin: '10px 0 4px' }}>{v.title}{v.duplicate ? ' (duplicate)' : ''}</h1>
            <p style={{ margin: '0 0 18px', fontWeight: 800, color: v.valid ? '#047857' : '#B91C1C' }}>{v.valid ? 'VALID: issued by the school and not cancelled' : 'CANCELLED by the school'}</p>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', margin: 0, fontSize: 15 }}>
              <dt style={{ color: '#64748B' }}>School</dt><dd style={{ margin: 0, fontWeight: 700 }}>{v.school}</dd>
              <dt style={{ color: '#64748B' }}>Number</dt><dd style={{ margin: 0, fontWeight: 700 }}>{v.number ?? '—'}</dd>
              <dt style={{ color: '#64748B' }}>Student</dt><dd style={{ margin: 0, fontWeight: 700 }}>{v.student}</dd>
              <dt style={{ color: '#64748B' }}>Issued on</dt><dd style={{ margin: 0, fontWeight: 700 }}>{dmy(v.issuedOn) || '—'}</dd>
            </dl>
            <p style={{ color: '#64748B', fontSize: 13, lineHeight: 1.5, margin: '18px 0 0' }}>Compare these with the certificate in your hand. If anything differs, contact the school.</p>
          </>
        )}
        <p style={{ color: '#94A3B8', fontSize: 12, margin: '22px 0 0', textAlign: 'center' }}>Powered by Sthara &middot; The Institutional OS</p>
      </div>
    </main>
  );
}
