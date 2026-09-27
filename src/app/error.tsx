'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/errors/client';

/**
 * A page that failed to render: reported to the ops error log, with a way back instead of a blank screen. The
 * reference is the error's digest, which operators can search for in the error log.
 */
export default function PageError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { reportClientError('render', error, { digest: error.digest }); }, [error]);
  return (
    <main role="alert" style={{ minHeight: '70dvh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', color: '#062347', margin: '0 0 10px' }}>This page didn&apos;t load.</h1>
        <p style={{ color: '#556378', fontSize: 15.5, lineHeight: 1.6, margin: 0 }}>
          Something went wrong on our side. The Sthara team has been told. Try again, and if it keeps happening, share the reference below with your school office.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
          <button onClick={() => unstable_retry()} style={{ background: '#062347', color: '#fff', border: 0, padding: '12px 20px', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Try again</button>
          <a href="/login" style={{ color: '#062347', padding: '12px 14px', fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>Go to sign in</a>
        </div>
        {error.digest && <p style={{ color: '#8A96A8', fontSize: 12.5, marginTop: 18, fontFamily: 'ui-monospace, monospace' }}>Reference {error.digest}</p>}
      </div>
    </main>
  );
}
