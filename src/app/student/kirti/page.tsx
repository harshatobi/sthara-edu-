import type { Metadata } from 'next';
import { StudentKirti } from '@/components/cocurricular/MyKirti';

export const metadata: Metadata = { title: 'Kirti' };

export default function Page() {
  return <StudentKirti />;
}
