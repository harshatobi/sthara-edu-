import type { Metadata } from 'next';
import TeacherDashboard from './TeacherDashboard';

export const metadata: Metadata = { title: 'Dashboard' };

export default function TeacherPage() {
  return <TeacherDashboard />;
}
