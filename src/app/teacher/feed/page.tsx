import type { Metadata } from 'next';
import TeacherFeedPage from '@/components/teacher/FeedPage';

export const metadata: Metadata = { title: 'Situational feed' };

export default function Page() {
  return <TeacherFeedPage />;
}
