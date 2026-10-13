import type { Metadata } from 'next';
import ErrorsConsole from './ErrorsConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Error log' };

export default async function Page() {
  await requireCapability('errors.read');
  return <ErrorsConsole />;
}
