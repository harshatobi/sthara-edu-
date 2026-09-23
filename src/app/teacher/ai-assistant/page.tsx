import { Suspense } from 'react';
import Copilot from '@/components/teacher/copilot/Copilot';

// Reads ?class / ?subject from the URL, so it renders on the client.
export default function TeacherCopilotPage() {
  return <Suspense><Copilot /></Suspense>;
}
