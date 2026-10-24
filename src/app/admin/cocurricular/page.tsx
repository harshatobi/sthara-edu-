import type { Metadata } from 'next';
import CocurricularPage from '@/components/admin/cocurricular/CocurricularPage';

export const metadata: Metadata = { title: 'Co-curricular' };

export default function Page() {
  return <CocurricularPage />;
}
