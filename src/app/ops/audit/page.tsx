import type { Metadata } from 'next';
import AuditConsole from './AuditConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Audit log' };

export default async function Page() {
  await requireCapability('audit.read');
  return <AuditConsole />;
}
