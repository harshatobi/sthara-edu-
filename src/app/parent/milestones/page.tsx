import { redirect } from 'next/navigation';

// Superseded by the canon parent portal.
export default function Page() {
  redirect('/parent/progress');
}
