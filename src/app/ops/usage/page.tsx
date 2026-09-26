import type { Metadata } from 'next';
import UsageConsole from './UsageConsole';

export const metadata: Metadata = { title: 'AI usage & cost' };

export default function Page() {
  return <UsageConsole />;
}
