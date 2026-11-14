import type { Metadata } from 'next';
import AskOS from '@/components/ask/AskOS';
import '@/styles/ask.css';

export const metadata: Metadata = { title: 'Ask the School OS' };

export default function Page() {
  return <AskOS audience="teacher" />;
}
