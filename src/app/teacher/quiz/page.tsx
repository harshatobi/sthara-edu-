import { Suspense } from 'react';
import AssignmentBoard from '@/components/teacher/AssignmentBoard';

// The board reads ?class / ?a / ?s from the URL, so it renders on the client.
export default function TeacherQuizPage() {
  return <Suspense><AssignmentBoard kind="quiz" /></Suspense>;
}
