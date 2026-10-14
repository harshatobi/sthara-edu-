import type { Metadata } from 'next';
import AccountConsole from './AccountConsole';

export const metadata: Metadata = { title: 'My account' };

export default function Page() {
  return <AccountConsole />;
}
