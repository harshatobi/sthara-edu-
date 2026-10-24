import type { Metadata } from 'next';
import TimelineView from '@/components/parent/TimelineView';

export const metadata: Metadata = { title: 'Timeline' };

export default function Page() {
  return <TimelineView />;
}
