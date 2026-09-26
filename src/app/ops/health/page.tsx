import type { Metadata } from 'next';
import HealthConsole from './HealthConsole';

export const metadata: Metadata = { title: 'System health' };

export default function OpsHealthPage() {
  return <HealthConsole />;
}
