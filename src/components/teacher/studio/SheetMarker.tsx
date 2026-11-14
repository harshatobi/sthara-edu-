'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CameraIcon as Camera } from '@phosphor-icons/react/dist/ssr/Camera';
import { WarningCircleIcon as WarningCircle } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { useAuth } from '@/contexts/AuthContext';
import { compressPhoto } from '@/lib/grading/compress';
import { LETTERS } from '@/lib/studio/handout';
import { useStudioApi } from './api';
import type { SheetData } from './BubbleSheets';

interface Read { code: string; studentId: string | null; picks: (number | null)[]; unclear: number[] }

/**
 * Marking a paper quiz from photos: the teacher photographs the bubble sheets (one or several per photo), checks what
 * was read (unclear marks are highlighted and must be set or left blank on purpose), then saves. Nothing is saved
 * until they do; the photos themselves are not kept.
 */
export default function SheetMarker({ assignmentId, nameOf, onClose, onSaved }: {
  assignmentId: string; nameOf: (id: string) => string; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const api = useStudioApi();
  const { getAuthToken } = useAuth();
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [reads, setReads] = useState<Map<string, Read>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    api<{ sheets: SheetData[] }>(`/api/teacher/studio/sheets?assignmentId=${assignmentId}`).then(r => { if (live) setSheets(r.sheets); }).catch(e => { if (live) setError(e?.message); });
    return () => { live = false; };
  }, [api, assignmentId]);
  const byCode = useMemo(() => new Map((sheets ?? []).map(s => [s.code, s])), [sheets]);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const token = await getAuthToken();
    if (!token) { setError('Your session has expired. Sign in again.'); return; }
    const list = [...files].slice(0, 30);
    for (const [i, f] of list.entries()) {
      setBusy(`Reading photo ${i + 1} of ${list.length}…`);
      try {
        const blob = await compressPhoto(f, 2400, 0.88);
        const form = new FormData();
        form.append('assignmentId', assignmentId);
        form.append('file', new File([blob], `sheet-${i + 1}.jpg`, { type: 'image/jpeg' }));
        const res = await fetch('/api/teacher/studio/sheets', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { setError(`Photo ${i + 1}: ${d?.error || 'couldn’t be read.'}`); continue; }
        setReads(m => { const n = new Map(m); for (const r of d.sheets as Read[]) n.set(r.code, r); return n; });
      } catch (e: any) { setError(`Photo ${i + 1}: ${e?.message || 'couldn’t be read.'}`); }
    }
    setBusy(null);
    if (file.current) file.current.value = '';
  }

  const setPick = (code: string, q: number, v: number | null) =>
    setReads(m => { const n = new Map(m); const r = n.get(code); if (r) n.set(code, { ...r, picks: r.picks.map((p, i) => (i === q ? v : p)), unclear: r.unclear.filter(u => u !== q + 1) }); return n; });

  const rows = [...reads.values()];
  const known = rows.filter(r => r.studentId);
  const stillUnclear = known.reduce((n, r) => n + r.unclear.length, 0);
  const missing = (sheets ?? []).filter(s => !reads.has(s.code));

  async function save() {
    setBusy('Saving…'); setError(null);
    try {
      const r = await api<{ saved: number; problems: string[] }>('/api/teacher/studio/sheets', 'PUT', { assignmentId, rows: known.map(x => ({ studentId: x.studentId, picks: x.picks })) });
      if (r.problems.length) setError(r.problems.join(' '));
      onSaved(`${r.saved} sheet${r.saved === 1 ? '' : 's'} marked`);
      if (!r.problems.length) onClose();
    } catch (e: any) { setError(e?.message); } finally { setBusy(null); }
  }

  return (
    <div className="sd-card sd-pad" style={{ marginBottom: 14 }} role="region" aria-label="Mark bubble sheets">
      <div className="sd-hd">
        <div><h2>Mark bubble sheets</h2><p>Photograph the sheets: one per photo is clearest, a few side by side also works. Check what was read, then save.</p></div>
        <button className="btn sm" onClick={onClose} aria-label="Close"><X size={13} weight="bold" /></button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="btn sm pri" style={{ cursor: busy ? 'default' : 'pointer' }}>
          <Camera size={14} weight="bold" /> Add photos
          <input ref={file} type="file" accept="image/*" capture="environment" multiple hidden disabled={!!busy} onChange={e => addPhotos(e.target.files)} />
        </label>
        {busy && <span className="sd-mut" aria-live="polite" style={{ fontSize: 13.5 }}>{busy}</span>}
        {sheets && <span className="sd-mut" style={{ fontSize: 13.5 }}>{known.length} of {sheets.length} sheets read{missing.length && known.length ? `; still to photograph: ${missing.slice(0, 5).map(s => nameOf(s.studentId)).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}` : ''}</span>}
      </div>
      {error && <div className="note err" role="alert" style={{ marginTop: 10 }}>{error}</div>}

      {rows.length > 0 && (
        <table className="sd-tbl" style={{ marginTop: 12 }} aria-label="What was read">
          <thead><tr><th>SHEET</th><th>ANSWERS (unclear ones highlighted: set or leave blank)</th><th>SCORE</th></tr></thead>
          <tbody>{rows.map(r => {
            const s = byCode.get(r.code);
            const right = s ? r.picks.filter((p, i) => p !== null && p === s.questions[i]?.answer).length : 0;
            return (
              <tr key={r.code}>
                <td><b>{r.studentId ? nameOf(r.studentId) : 'Not on this work'}</b><small className="mono">{r.code}</small></td>
                <td>
                  {!s ? <span className="sd-mut" style={{ fontSize: 13 }}><WarningCircle size={13} weight="bold" /> This code isn&apos;t one of this work&apos;s sheets, so it won&apos;t be saved.</span> : (
                    <div className="sd-sheetrow">{r.picks.map((p, i) => (
                      <label key={i} className={r.unclear.includes(i + 1) ? 'unclear' : undefined}>
                        <span>{i + 1}</span>
                        <select value={p ?? ''} aria-label={`${nameOf(r.studentId!)} question ${i + 1}`} onChange={e => setPick(r.code, i, e.target.value === '' ? null : Number(e.target.value))}>
                          <option value="">–</option>
                          {(s.questions[i]?.options ?? ['', '', '', '']).map((_, k) => <option key={k} value={k}>{LETTERS[k]}</option>)}
                        </select>
                      </label>
                    ))}</div>
                  )}
                </td>
                <td>{s ? <><b className="mono">{right}/{s.questions.length}</b>
                  {r.unclear.length > 0 && <button className="btn sm" style={{ marginTop: 4 }} onClick={() => setReads(m => { const n = new Map(m); n.set(r.code, { ...r, unclear: [] }); return n; })}>Leave unclear blank</button>}</> : null}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      {known.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn sm pri" disabled={!!busy || stillUnclear > 0} onClick={save}><CheckCircle size={14} weight="bold" /> Save {known.length} marked sheet{known.length === 1 ? '' : 's'}</button>
          {stillUnclear > 0 && <span style={{ fontSize: 13.5, color: '#B45309', fontWeight: 700 }}><WarningCircle size={14} weight="bold" /> {stillUnclear} unclear answer{stillUnclear === 1 ? '' : 's'} to check first</span>}
        </div>
      )}
    </div>
  );
}
