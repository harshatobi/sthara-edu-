'use client';

import { useCallback, useState } from 'react';
import { defaults, validateParams, type LabEngine, type Params } from '@/lib/lab/types';

/**
 * Values for one engine. A change the engine would refuse (a titration that
 * needs more than the burette holds) is not applied; `blocked` says why.
 */
export function useLabParams(engine: LabEngine<any>, initial?: Params) {
  const [params, setParams] = useState<Params>(() => (initial && validateParams(engine, initial)) || defaults(engine));
  const [blocked, setBlocked] = useState<string | null>(null);

  const setParam = useCallback((key: string, value: number | string) => {
    setParams(cur => {
      const next = { ...cur, [key]: value };
      if (validateParams(engine, next)) { setBlocked(null); return next; }
      setBlocked(engine.check?.(next as any) ?? 'That value is outside what this simulation allows.');
      return cur;
    });
  }, [engine]);

  const reset = useCallback(() => { setParams(defaults(engine)); setBlocked(null); }, [engine]);
  const replace = useCallback((p: Params) => { const ok = validateParams(engine, p); if (ok) { setParams(ok); setBlocked(null); } }, [engine]);

  return { params, setParam, blocked, reset, replace };
}
