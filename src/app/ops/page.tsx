import type { Metadata } from 'next';
import OverviewConsole from './OverviewConsole';

export const metadata: Metadata = { title: 'Overview' };

export default function OpsOverviewPage() {
  return <OverviewConsole />;
}
