import type { Metadata } from 'next';
import HealthConsole from './HealthConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'System health' };

export default async function OpsHealthPage() {
  await requireCapability('health.read');
  return <HealthConsole />;
}
