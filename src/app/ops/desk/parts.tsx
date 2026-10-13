'use client';

import { Chip, type Tone } from '@/components/canon/ui';
import { PRIORITY_LABEL, STATUS_LABEL, dueText, type CaseStatus, type Priority, type SlaState } from '@/lib/ops/desk';

const PRIORITY_TONE: Record<Priority, Tone> = { urgent: 'r', high: 'a', normal: 'b', low: 'n' };
const STATUS_TONE: Record<CaseStatus, Tone> = { new: 'r', open: 'b', waiting_school: 'a', resolved: 'g', closed: 'n' };

export const PriorityChip = ({ p }: { p: Priority }) => <Chip tone={PRIORITY_TONE[p]}>{PRIORITY_LABEL[p].toUpperCase()}</Chip>;
export const CaseStatusChip = ({ s }: { s: CaseStatus }) => <Chip tone={STATUS_TONE[s]}>{STATUS_LABEL[s].toUpperCase()}</Chip>;

/** Where a case stands against its deadline, in a few words. */
export function SlaChip({ sla }: { sla: SlaState }) {
  if (sla.stage === 'done') return sla.everBreached ? <Chip tone="r" title="A deadline was missed on this case">MISSED</Chip> : <Chip tone="g">ON TIME</Chip>;
  const what = sla.stage === 'first_response' ? 'First reply' : 'Resolve';
  const when = sla.minutesLeft === null ? '' : dueText(sla.minutesLeft);
  const tone: Tone = sla.level === 'breached' ? 'r' : sla.level === 'soon' ? 'a' : sla.level === 'paused' ? 'n' : 'g';
  return <Chip tone={tone} title={sla.level === 'paused' ? 'Waiting on the school; the deadline still stands' : undefined}>{`${what} ${when}`.toUpperCase()}</Chip>;
}
