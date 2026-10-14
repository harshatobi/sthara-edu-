import type { Metadata } from 'next';
import PartnersConsole from './PartnersConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Partners and commissions' };

export default async function Page() {
  await requireCapability('partners.read');
  return <PartnersConsole />;
}
