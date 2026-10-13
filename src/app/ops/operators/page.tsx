import type { Metadata } from 'next';
import OperatorsConsole from './OperatorsConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Operators' };

export default async function Page() {
  await requireCapability('operators.read');
  return <OperatorsConsole />;
}
