import 'server-only';
import { notFound } from 'next/navigation';
import { operatorFromCookies } from '@/lib/ops/auth';
import { can, type Capability } from '@/lib/ops/roles';

/**
 * For a section's page: a 404 when the signed-in operator's role cannot open it.
 * (The layout has already turned non-operators away; with no operator here it is the local dev preview.)
 */
export async function requireCapability(cap: Capability) {
  const op = await operatorFromCookies();
  if (op && !can(op.role, cap)) notFound();
}
