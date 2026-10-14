import type { Metadata } from 'next';
import MarketingConsole from './MarketingConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Marketing' };

export default async function Page() {
  await requireCapability('marketing.read');
  return <MarketingConsole />;
}
