import type { Metadata } from 'next';
import PeopleConsole from './PeopleConsole';

export const metadata: Metadata = { title: 'People' };

export default function Page() {
  return <PeopleConsole />;
}
