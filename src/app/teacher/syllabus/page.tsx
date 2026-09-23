import { Suspense } from 'react';
import SyllabusWorkspace from '@/components/teacher/syllabus/SyllabusWorkspace';

// Reads ?class / ?subject / ?tab / ?lesson from the URL, so it renders on the client.
export default function TeacherSyllabusPage() {
  return <Suspense><SyllabusWorkspace /></Suspense>;
}
