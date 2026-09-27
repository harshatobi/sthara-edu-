'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/errors/client';

/** The whole app failed (the root layout itself): reported to the ops error log, with a plain recovery page. */
export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { reportClientError('render', error, { digest: error.digest }); }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <title>Something went wrong · Sthara</title>
        <main role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#07142b', color: '#eef2fb', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ maxWidth: 520 }}>
            <div style={{ fontWeight: 800, letterSpacing: '.28em', fontSize: 15 }}>STHARA</div>
            <h1 style={{ fontSize: 'clamp(30px, 6vw, 46px)', fontWeight: 800, letterSpacing: '-.03em', margin: '28px 0 10px', lineHeight: 1.05 }}>Something went wrong.</h1>
            <p style={{ color: '#a9b8d3', fontSize: 17, lineHeight: 1.6, margin: 0 }}>The Sthara team has been told. Try again in a moment.</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
              <button onClick={() => unstable_retry()} style={{ background: '#a8c7ff', color: '#07142b', border: 0, padding: '13px 20px', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>Try again</button>
              <a href="/login" style={{ color: '#a8c7ff', padding: '13px 6px', fontWeight: 700, textDecoration: 'none' }}>Sign in</a>
            </div>
            {error.digest && <p style={{ color: '#6f82a6', fontSize: 12.5, marginTop: 22, fontFamily: 'ui-monospace, monospace' }}>Reference {error.digest}</p>}
          </div>
        </main>
      </body>
    </html>
  );
}
