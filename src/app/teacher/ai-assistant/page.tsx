import { Suspense } from 'react';
import Studio from '@/components/teacher/studio/Studio';
import '@/styles/studio.css';

// Reads ?class / ?subject from the URL, so it renders on the client.
export default function TeacherStudioPage() {
  return <Suspense><Studio /></Suspense>;
}
