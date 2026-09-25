import type { Metadata } from 'next';
import BoardPack from '@/components/admin/BoardPack';

export const metadata: Metadata = { title: 'Board pack' };

export default function Page() {
  return <BoardPack />;
}
