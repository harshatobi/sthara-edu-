'use client';

import { useEffect, useState } from 'react';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { Skeleton } from '@/components/canon/ui';
import { ACCESS_LABEL, ACCESS_NEEDS, type AccessNeed } from '@/lib/studio/types';
import { useStudioApi } from './api';

interface Row { id: string; name: string; roll: string; needs: AccessNeed[]; suggested: AccessNeed[] | null }

/**
 * Access needs for a class: large print, read aloud, extra time, text instead of figures, simpler wording. The class
 * teacher (and the counsellor or office) sets them; other teachers of the class see them. Only needs are shown,
 * never a diagnosis. Studio materials and student versions follow them automatically.
 */
export default function AccessNeedsPanel({ cls, onClose, onToast }: { cls: string; onClose: () => void; onToast: (m: string) => void }) {
  const api = useStudioApi();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api<{ canEdit: boolean; students: Row[] }>(`/api/teacher/access-needs?${new URLSearchParams({ class: cls, suggest: '1' })}`)
      .then(r => { if (live) { setRows(r.students); setCanEdit(r.canEdit); } }).catch(e => { if (live) setError(e?.message); });
    return () => { live = false; };
  }, [api, cls]);

  async function toggle(r: Row, n: AccessNeed) {
    const needs = r.needs.includes(n) ? r.needs.filter(x => x !== n) : [...r.needs, n];
    setRows(rs => rs!.map(x => (x.id === r.id ? { ...x, needs } : x)));
    try { await api('/api/teacher/access-needs', 'PUT', { studentId: r.id, needs }); onToast(`Saved for ${r.name.split(' ')[0]}`); }
    catch (e: any) { setError(e?.message); setRows(rs => rs!.map(x => (x.id === r.id ? r : x))); }
  }

  return (
    <section className="sd-card sd-pad" style={{ marginBottom: 14 }} aria-label={`Access needs, ${cls}`}>
      <div className="sd-hd">
        <div><h2>Access needs, {cls}</h2><p>{canEdit ? 'Tick what each student needs. Materials and their own versions follow these.' : 'Set by the class teacher. Materials and student versions follow these.'}</p></div>
        <button className="btn sm" onClick={onClose}><X size={13} weight="bold" /> Close</button>
      </div>
      {error && <div className="note err" role="alert" style={{ marginBottom: 8 }}>{error}</div>}
      {!rows ? <Skeleton h={200} /> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="sd-needs">
            <thead><tr><th>STUDENT</th><th>NEEDS</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id}>
                <td><b>{r.name}</b>{r.roll && <div className="sd-mut" style={{ fontSize: 12.5 }}>{r.roll}</div>}</td>
                <td>
                  <div className="tg" role="group" aria-label={`Needs for ${r.name}`}>
                    {ACCESS_NEEDS.map(n => (
                      <button key={n} aria-pressed={r.needs.includes(n)} disabled={!canEdit} onClick={() => toggle(r, n)}>{ACCESS_LABEL[n]}</button>
                    ))}
                  </div>
                  {canEdit && r.suggested?.some(n => !r.needs.includes(n)) && (
                    <div className="sd-mut" style={{ fontSize: 12.5, marginTop: 4 }}>Suggested from the health record: {r.suggested.filter(n => !r.needs.includes(n)).map(n => ACCESS_LABEL[n]).join(', ')}</div>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
