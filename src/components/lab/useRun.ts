'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Progress of a run, 0 → 1. While the class predicts (conceal) it holds at 0;
 * each new runKey replays from 0 over `ms`; with no run yet it shows the end
 * state (1) so the builder always shows a complete picture.
 */
export function useRun(runKey: number, conceal: boolean, ms: number): number {
  const [k, setK] = useState(1);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!runKey || conceal) return;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const x = Math.min(1, (t - start) / ms);
      setK(x);
      if (x < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [runKey, conceal, ms]);

  return conceal ? 0 : k;
}
