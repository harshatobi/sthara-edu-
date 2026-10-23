'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useGet } from '@/components/canon/useGet';
import { isoDay } from '@/lib/admin/format';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import KirtiView, { type KirtiRecord } from '@/components/cocurricular/KirtiView';
import { Field, Workspace } from '../kit';

/** The student record's Kirti tab: house history, clubs and teams, and every Kirti entry with its status. */
export default function StudentKirti({ studentId, firstName, active }: { studentId: string; firstName: string; active: boolean }) {
  const { data, error, reload } = useGet<KirtiRecord & { houseList: { id: string; name: string }[]; can: { manage: boolean } }>(`/api/admin/cocurricular?studentId=${studentId}`);
  const [moving, setMoving] = useState(false);
  const [toast, toastEl] = useToast();
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={18} style={{ marginBottom: 14 }} />)}</div>;
  const cur = data.houses.find(h => !h.to);
  return (
    <>
      {toastEl}
      {data.can.manage && active && data.houseList.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button className="btn sm" onClick={() => setMoving(true)}>{cur ? 'Move to another house' : 'Place in a house'}</button>
        </div>
      )}
      <KirtiView r={data} firstName={firstName} office />
      {moving && <Move studentId={studentId} houses={data.houseList.filter(h => h.name !== cur?.name)} moving={!!cur} onClose={() => setMoving(false)} onDone={() => { setMoving(false); toast('Saved.'); reload(); }} />}
    </>
  );
}

function Move({ studentId, houses, moving, onClose, onDone }: { studentId: string; houses: { id: string; name: string }[]; moving: boolean; onClose: () => void; onDone: () => void }) {
  const { call } = useAdminDesk();
  const [houseId, setHouseId] = useState(houses[0]?.id ?? '');
  const [from, setFrom] = useState(isoDay());
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setErr(null);
    try { await call('/api/admin/cocurricular', 'POST', { action: 'place', studentId, houseId, from, reason }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  return (
    <Workspace title={moving ? 'Move to another house' : 'Place in a house'} sub={moving ? 'The current house is kept in the history, ending the day before.' : undefined} onClose={onClose}
      actions={<button className="btn pri" disabled={!houseId || (moving && reason.trim().length < 3)} onClick={go}>Save</button>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="g2">
        <Field label="HOUSE" htmlFor="mv-h"><select id="mv-h" className="cmp-sel" value={houseId} onChange={e => setHouseId(e.target.value)}>{houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
        <Field label="FROM" htmlFor="mv-d"><input id="mv-d" type="date" className="cmp-in" value={from} onChange={e => setFrom(e.target.value)} /></Field>
      </div>
      <Field label={moving ? 'WHY' : 'NOTE (OPTIONAL)'} htmlFor="mv-r"><input id="mv-r" className="cmp-in" value={reason} maxLength={200} onChange={e => setReason(e.target.value)} /></Field>
    </Workspace>
  );
}
