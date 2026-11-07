import { Suspense } from 'react';
import TutorInsight from '@/components/teacher/TutorInsight';

// Reads ?class / ?subject from the URL, so it renders on the client.
export default function TeacherTutorInsightPage() {
  return <Suspense><TutorInsight /></Suspense>;
}
