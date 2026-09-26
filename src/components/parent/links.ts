import type { ProbeFinding } from '@/lib/parent/probe';

/** Deep link into a new message to the right person, pre-filled. */
export function contactHref(childId: string, c: NonNullable<ProbeFinding['contact']>, body?: string) {
  const p = new URLSearchParams({ new: '1', child: childId, to: c.to?.id ?? 'office', topic: c.topic, subject: c.subject });
  if (body) p.set('body', body);
  return `/parent/messages?${p.toString()}`;
}
