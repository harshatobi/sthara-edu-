import type { Metadata } from 'next';
import CertificatesPage from '@/components/admin/certificates/CertificatesPage';

export const metadata: Metadata = { title: 'Certificates' };

export default function Page() {
  return <CertificatesPage />;
}
