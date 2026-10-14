'use client';

import { PageBar } from '@/components/canon/ui';
import Results from '@/components/exams/Results';

export default function Page() {
  return (
    <>
      <PageBar eyebrow="RESULTS" title="My report cards" sub="Every report card your school has published, as issued." />
      <Results audience="student" />
    </>
  );
}
