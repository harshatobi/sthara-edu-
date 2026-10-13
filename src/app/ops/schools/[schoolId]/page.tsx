import type { Metadata } from 'next';
import SchoolWorkspace from './SchoolWorkspace';
import { requireCapability } from '../../gate';

export const metadata: Metadata = { title: 'School' };

export default async function OpsSchoolPage({ params }: { params: Promise<{ schoolId: string }> }) {
  await requireCapability('schools.read');
  const { schoolId } = await params;
  return <SchoolWorkspace schoolId={schoolId} />;
}
