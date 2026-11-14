import type { Metadata } from 'next';
import BankConsole from './BankConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Question bank' };

export default async function Page() {
  await requireCapability('bank.read');
  return <BankConsole />;
}
