import type { Metadata } from 'next';
import DeskSettings from './DeskSettings';
import { requireCapability } from '../../gate';

export const metadata: Metadata = { title: 'Service desk settings' };

export default async function Page() {
  await requireCapability('desk.read');
  return <DeskSettings />;
}
