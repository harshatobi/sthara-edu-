import type { Metadata } from 'next';
import SchoolsRegistry from './SchoolsRegistry';

export const metadata: Metadata = { title: 'Schools' };

export default function OpsSchoolsPage() {
  return <SchoolsRegistry />;
}
