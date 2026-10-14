import type { Metadata } from 'next';
import CaseView from './CaseView';
import { requireCapability } from '../../gate';

export const metadata: Metadata = { title: 'Case' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('desk.read');
  const { id } = await params;
  return <CaseView id={id} />;
}
