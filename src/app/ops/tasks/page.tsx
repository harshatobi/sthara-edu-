import type { Metadata } from 'next';
import TasksConsole from './TasksConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Follow-ups' };

export default async function Page() {
  await requireCapability('crm.read');
  return <TasksConsole />;
}
