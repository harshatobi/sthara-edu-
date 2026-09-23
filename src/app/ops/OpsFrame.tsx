'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import '@/styles/canon.css';

/** Chrome for the unlisted operator console: no sidebar, nothing that links out to it. */
export default function OpsFrame({ children, devPreview }: { children: ReactNode; devPreview: boolean }) {
  return (
    <div className="canon">
      <link rel="stylesheet" precedence="default"
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap" />
      <main style={{ maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 18 }}>
          <Link href="/ops" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>Sthara</Link>
          <span style={{ color: 'var(--red)', fontSize: 11, fontWeight: 800, letterSpacing: '.14em' }}>OPERATOR CONSOLE</span>
        </div>
        {devPreview && (
          <div className="note info" style={{ marginBottom: 18 }}>
            <b>Local preview.</b> You&apos;re seeing this through the dev role cookie. Loading or saving anything needs a real operator session against Supabase.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
