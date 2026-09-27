import type { Metadata } from 'next';
import ErrorsConsole from './ErrorsConsole';

export const metadata: Metadata = { title: 'Error log' };

export default function Page() {
  return <ErrorsConsole />;
}
