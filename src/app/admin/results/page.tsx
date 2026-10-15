import { redirect } from 'next/navigation';

/** Results moved into Exams & Report Cards. */
export default function Page() {
  redirect('/admin/exams');
}
