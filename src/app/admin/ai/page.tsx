import { redirect } from 'next/navigation';

/** The old admin AI assistant is now Ask the School OS. */
export default function Page() {
  redirect('/admin/ask');
}
