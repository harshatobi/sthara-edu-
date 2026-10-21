'use client';

import { useMemo } from 'react';
import { FirstAidKitIcon as FirstAidKit } from '@phosphor-icons/react/dist/ssr/FirstAidKit';
import { useGet } from '@/components/canon/useGet';

/** Health alerts for a class the teacher teaches: student login id to the alert line (allergies, serious conditions). */
export function useClassAlerts(cls: string | null | undefined): Map<string, string> {
  const { data } = useGet<{ alerts: { studentId: string; alert: string }[] }>(cls ? `/api/teacher/health-alerts?cls=${encodeURIComponent(cls)}` : null);
  return useMemo(() => new Map((data?.alerts ?? []).map(a => [a.studentId, a.alert])), [data]);
}

/** The red first-aid mark next to a student's name; the alert reads on hover, focus and to screen readers. */
export function HealthAlertMark({ alert }: { alert: string | undefined }) {
  if (!alert) return null;
  return (
    <span tabIndex={0} title={alert} style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 6, color: 'var(--red)', verticalAlign: 'middle', cursor: 'help' }}>
      <FirstAidKit size={15} weight="fill" aria-hidden="true" /><span className="sr">Health alert: {alert}</span>
    </span>
  );
}
