import type { Metadata } from 'next';
import AuditConsole from './AuditConsole';

export const metadata: Metadata = { title: 'Audit log' };

export default function Page() {
  return <AuditConsole />;
}
