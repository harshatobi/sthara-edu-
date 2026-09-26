import type { Metadata } from 'next';
import SchoolWorkspace from './SchoolWorkspace';

export const metadata: Metadata = { title: 'School' };

export default async function OpsSchoolPage({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await params;
  return <SchoolWorkspace schoolId={schoolId} />;
}
