import { Suspense } from 'react';
import ClassHeatMap from '@/components/teacher/ClassHeatMap';

// Reads ?class / ?subject / ?chapter from the URL, so it renders on the client.
export default function TeacherHeatMapPage() {
  return <Suspense><ClassHeatMap /></Suspense>;
}
