import type { Metadata } from 'next';
import OpportunityView from './OpportunityView';
import { requireCapability } from '../../gate';

export const metadata: Metadata = { title: 'Deal' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('sales.read');
  const { id } = await params;
  return <OpportunityView id={id} />;
}
