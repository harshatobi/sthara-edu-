'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';

/** Transient save confirmation (mockup #sw pill). Returns [show, <Toast/> element]. */
export function useToast(ms = 2200) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), ms);
  }, [ms]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const el = (
    <div aria-live="polite" role="status">
      {msg && <div className="toast" key={msg}><CheckCircle size={17} weight="fill" color="#34D399" />{msg}</div>}
    </div>
  );
  return [show, el] as const;
}
