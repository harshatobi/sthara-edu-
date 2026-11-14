'use client';

import { useEffect, useState } from 'react';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { Skeleton } from '@/components/canon/ui';
import { useStudioApi } from './api';
import { RetentionCard } from './AnalysisView';

/** One retention check, opened from "Ready for you": when it goes out, with Move / Hand out now / Skip. */
export default function RetentionPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (msg: string) => void }) {
  const api = useStudioApi();
  const [row, setRow] = useState<any | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    api<{ followups: any[] }>('/api/teacher/studio/followups')
      .then(r => { if (live) setRow(r.followups.find(f => f.id === id) ?? null); })
      .catch(() => { if (live) setRow(null); });
    return () => { live = false; };
  }, [api, id]);
  return (
    <div style={{ marginBottom: 14, position: 'relative', maxWidth: 520 }}>
      <button className="btn sm" style={{ position: 'absolute', right: 10, top: 10, zIndex: 1 }} onClick={onClose} aria-label="Close"><X size={13} weight="bold" /></button>
      {row === undefined ? <Skeleton h={140} />
        : row === null ? <div className="note info">That retention check isn&apos;t there any more. <button className="btn sm" onClick={onClose}>Close</button></div>
          : (
            <>
              {row.chapter_name && <p className="sd-mut" style={{ fontSize: 13, margin: '0 0 6px 2px' }}>{row.class} {row.subject}: {row.chapter_name}{row.topics?.length ? ` (${row.topics.slice(0, 4).join(', ')})` : ''}</p>}
              <RetentionCard r={row} onChanged={onChanged} />
            </>
          )}
    </div>
  );
}
