import type { Metadata } from 'next';
import CommandCentre from '@/components/admin/CommandCentre';

export const metadata: Metadata = { title: 'Command Centre' };

export default function AdminPage() {
  return <CommandCentre />;
}
