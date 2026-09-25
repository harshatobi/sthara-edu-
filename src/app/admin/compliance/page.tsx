import type { Metadata } from 'next';
import CompliancePage from '@/components/admin/CompliancePage';

export const metadata: Metadata = { title: 'DPDP & compliance' };

export default function Page() {
  return <CompliancePage />;
}
