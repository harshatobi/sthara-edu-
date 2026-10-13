import type { Metadata } from 'next';
import UsageConsole from './UsageConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'AI usage & cost' };

export default async function Page() {
  await requireCapability('usage.read');
  return <UsageConsole />;
}
