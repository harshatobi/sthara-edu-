import type { Metadata } from 'next';
import TerritoriesConsole from './TerritoriesConsole';

export const metadata: Metadata = { title: 'Territories' };

export default function Page() {
  return <TerritoriesConsole />;
}
