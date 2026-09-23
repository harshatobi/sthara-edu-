import { Suspense } from 'react';
import MasteryTracker from '@/components/teacher/MasteryTracker';

// Reads ?class / ?subject / ?student from the URL, so it renders on the client.
export default function TeacherMasteryPage() {
  return <Suspense><MasteryTracker /></Suspense>;
}
