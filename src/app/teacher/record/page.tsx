import type { Metadata } from 'next';
import MyRecord from '@/components/hr/MyRecord';
import { PageBar } from '@/components/canon/ui';

export const metadata: Metadata = { title: 'My record' };

export default function Page() {
  return (
    <>
      <PageBar eyebrow="MY RECORD" title="My employee record" sub="Your job, history, qualifications and the details the school holds about you." />
      <MyRecord />
    </>
  );
}
