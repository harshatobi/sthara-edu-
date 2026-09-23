import { redirect } from 'next/navigation';

// Assignments, quizzes and grading all live in the Assignment Manager now.
export default function Page() {
  redirect('/teacher/homework');
}
