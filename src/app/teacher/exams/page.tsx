import type { Metadata } from 'next';
import TeacherExams from '@/components/teacher/exams/TeacherExams';

export const metadata: Metadata = { title: 'Exams' };

export default function Page() {
  return <TeacherExams />;
}
