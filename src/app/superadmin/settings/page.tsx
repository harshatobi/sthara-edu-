import { redirect } from 'next/navigation';

// Platform settings moved to the operator console (Settings), where every
// control is enforced, needs a reason and is kept in a change log. The old page
// here wrote to public.platform_settings, which nothing read.
export default function PlatformSettings() {
  redirect('/ops/settings');
}
