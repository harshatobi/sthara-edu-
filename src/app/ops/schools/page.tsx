import type { Metadata } from 'next';
import SchoolsRegistry from './SchoolsRegistry';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Schools' };

export default async function OpsSchoolsPage() {
  await requireCapability('schools.read');
  return <SchoolsRegistry />;
}
