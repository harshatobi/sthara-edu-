import type { Metadata } from 'next';
import PipelineConsole from './PipelineConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Pipeline' };

export default async function Page() {
  await requireCapability('sales.read');
  return <PipelineConsole />;
}
