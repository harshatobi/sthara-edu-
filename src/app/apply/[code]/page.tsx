import type { Metadata } from 'next';
import ApplyPortal from '@/components/admissions/ApplyPortal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Apply for admission', robots: { index: false, follow: false } };

/**
 * A school's apply page (admissions phase 2b): families sign in with a code on WhatsApp or an access code from the
 * admissions office, then fill in and send their application. No Sthara login. The school is named by its sign-in
 * code; everything is loaded through /api/apply.
 */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ApplyPortal code={decodeURIComponent(code)} />;
}
