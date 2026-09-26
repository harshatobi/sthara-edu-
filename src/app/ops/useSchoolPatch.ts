'use client';

import { useCallback } from 'react';
import type { SchoolPatch } from '@/lib/settings/registry';
import { useOpsApi } from './useOpsApi';

export interface AccessResult { changed: number; skipped: number; failed: { id: string; error: string }[] }

/** PATCH one school's settings through the journalled endpoint. */
export function useSchoolPatch() {
  const api = useOpsApi();
  return useCallback(
    (id: string, changes: Partial<Record<keyof SchoolPatch, unknown>>, reason: string, expectedUpdatedAt?: string | null) =>
      api<{ ok: true; access: AccessResult | null; unchanged?: boolean }>(`/schools/${id}/settings`, {
        method: 'PATCH', body: { changes, reason, expectedUpdatedAt: expectedUpdatedAt ?? undefined },
      }),
    [api],
  );
}

/** YYYY-MM-DD (IST) `days` after the later of today and the current end date. */
export function extendedEnd(currentEnd: string | null, days: number, now = Date.now()) {
  const base = Math.max(now, currentEnd ? new Date(currentEnd).getTime() : 0);
  return new Date(base + days * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
