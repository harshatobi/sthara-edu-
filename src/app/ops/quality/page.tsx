import type { Metadata } from 'next';
import QualityConsole from './QualityConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Quality' };

export default async function Page() {
  await requireCapability('qa.read');
  return <QualityConsole />;
}
