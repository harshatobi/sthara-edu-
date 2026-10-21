import type { Metadata } from 'next';
import StudentRecord from '@/components/admin/students/StudentRecord';

export const metadata: Metadata = { title: 'Student record' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudentRecord id={id} />;
}
