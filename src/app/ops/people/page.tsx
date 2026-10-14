import type { Metadata } from 'next';
import PeopleConsole from './PeopleConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'People' };

export default async function Page() {
  await requireCapability('people.search');
  return <PeopleConsole />;
}
