'use client';

import StaffAskPage from '@/components/staff/AskPage';
import { DeskGate } from './kit';

/** Ask the School OS for school leadership (os.ask: school admin, principal, vice principal). */
export default function AdminAskPage() {
  return <DeskGate need="os.ask">{() => <StaffAskPage role="leadership" />}</DeskGate>;
}
