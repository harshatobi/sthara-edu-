import type { Metadata } from 'next';
import Gallery from '@/components/lab/Gallery';

export const metadata: Metadata = { title: 'Live Lab' };

export default function Page() {
  return <Gallery />;
}
