import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Wellness Center' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
