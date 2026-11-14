'use client';

import AskOS from '@/components/ask/AskOS';
import { DeskGate } from './kit';

/** Ask the School OS for every office role, scoped to what each role can see (revamp of 2026-11-13). */
export default function AdminAskPage() {
  return <DeskGate need="dashboard.view">{() => <AskOS audience="office" />}</DeskGate>;
}
