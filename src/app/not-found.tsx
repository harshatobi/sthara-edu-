import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: false } };

/** Site-wide 404, in the marketing site's palette (the site's own 404.html only served standalone). */
export default function NotFound() {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#07142b', color: '#eef2fb', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 520 }}>
        <Link href="/" style={{ color: '#eef2fb', fontWeight: 800, letterSpacing: '.28em', textDecoration: 'none', fontSize: 15 }}>STHARA</Link>
        <h1 style={{ fontSize: 'clamp(34px, 6vw, 52px)', fontWeight: 800, letterSpacing: '-.03em', margin: '28px 0 10px', lineHeight: 1.05 }}>Page not found.</h1>
        <p style={{ color: '#a9b8d3', fontSize: 17, lineHeight: 1.6, margin: 0 }}>The page may have moved, or the link may be mistyped.</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
          <Link href="/" style={{ background: '#a8c7ff', color: '#07142b', padding: '13px 20px', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>Return to Sthara</Link>
          <Link href="/contact" style={{ color: '#a8c7ff', padding: '13px 6px', fontWeight: 700, textDecoration: 'none' }}>Contact the team</Link>
          <Link href="/login" style={{ color: '#a8c7ff', padding: '13px 6px', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
        </div>
      </div>
    </main>
  );
}
