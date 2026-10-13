import { redirect } from 'next/navigation';
import { requireCapability } from '../gate';

/** Old address of a school's page (before the workspace moved under /ops/schools). */
export default async function OldSchoolPage({ params }: { params: Promise<{ schoolId: string }> }) {
  await requireCapability('schools.read');
  const { schoolId } = await params;
  redirect(`/ops/schools/${encodeURIComponent(schoolId)}`);
}
