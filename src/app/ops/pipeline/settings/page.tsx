import type { Metadata } from 'next';
import PipelineSettings from './PipelineSettings';
import { requireCapability } from '../../gate';

export const metadata: Metadata = { title: 'Pipeline settings' };

export default async function Page() {
  await requireCapability('sales.read');
  return <PipelineSettings />;
}
