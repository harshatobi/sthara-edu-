'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whether a view has room for its 3D version: not on small cards or printed
 * sheets, and not once the browser has failed to draw it (`fail`).
 */
export function use3d(minWidth = 480) {
  const box = useRef<HTMLDivElement>(null);
  const [can3d, setCan3d] = useState(false);
  const fail = useCallback(() => setCan3d(false), []);
  useEffect(() => {
    const el = box.current;
    if (el && !el.closest('.lab-print') && el.clientWidth >= minWidth) setCan3d(true);
  }, [minWidth]);
  return { box, can3d, fail };
}
