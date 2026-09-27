'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';

/** A small modal editor: Escape or the backdrop closes it, focus moves in and returns after. */
export default function Pop({ title, sub, onClose, children, wide }: { title: string; sub?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.sch-x)')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="sch-pop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="sch-pop-title" style={wide ? { width: 'min(860px,100%)' } : undefined}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <h2 id="sch-pop-title" style={{ fontSize: 19, fontWeight: 800 }}>{title}</h2>
            {sub && <p className="muted" style={{ marginTop: 4 }}>{sub}</p>}
          </div>
          <button type="button" className="sch-icon sch-x" onClick={onClose} aria-label="Close"><X size={16} weight="bold" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Save-button state for an editor: busy while the call runs, the route's message on failure. */
export async function run(setBusy: (b: boolean) => void, setErr: (e: string | null) => void, fn: () => Promise<unknown>): Promise<boolean> {
  setBusy(true); setErr(null);
  try { await fn(); return true; } catch (e: any) { setErr(e?.message || 'Something went wrong.'); return false; } finally { setBusy(false); }
}
