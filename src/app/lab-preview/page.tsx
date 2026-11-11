import { notFound } from 'next/navigation';
import Preview from './Preview';

// Development only: the 3D bench prototype without signing in. Not served in production.
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Preview />;
}
