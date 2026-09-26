import type { Metadata } from 'next';
import OperatorsConsole from './OperatorsConsole';

export const metadata: Metadata = { title: 'Operators' };

export default function Page() {
  return <OperatorsConsole />;
}
