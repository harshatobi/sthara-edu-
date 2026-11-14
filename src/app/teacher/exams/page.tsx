import { Suspense } from 'react';
import type { Metadata } from 'next';
import TeacherExams from '@/components/teacher/exams/TeacherExams';

export const metadata: Metadata = { title: 'Exams' };

export default function Page() {
  // TeacherExams reads ?sheet=&from= (opened from the Studio), which needs a Suspense boundary.
  return <Suspense><TeacherExams /></Suspense>;
}
