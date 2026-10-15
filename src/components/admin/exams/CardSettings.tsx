'use client';

import { useState } from 'react';
import { UploadSimpleIcon as UploadSimple } from '@phosphor-icons/react/dist/ssr/UploadSimple';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { CardHead } from '@/components/admin/kit';
import { run } from '@/components/schedule/Pop';
import type { Call } from '@/lib/exams/useApi';
import type { ExamsData, Toast } from './ExamsPage';

/** Shrinks an uploaded logo to at most 360px on its long side, as PNG, so it stays small in every card. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That file isn\'t an image.')); i.src = url; });
    const k = Math.min(1, 360 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/png');
    if (out.length > 400000) throw new Error('That logo is too detailed to store. Try a simpler PNG.');
    return out;
  } finally { URL.revokeObjectURL(url); }
}

/** How the school's report cards look, who signs them, and whether they wait for overdue fees. */
export default function CardSettingsView({ data, call, reload, toast, schoolName }: { data: ExamsData; call: Call; reload: () => void; toast: Toast; schoolName: string }) {
  const s = data.settings;
  const ro = !data.can.manage;
  const [logo, setLogo] = useState<string | null>(s.logo);
  const [logoChanged, setLogoChanged] = useState(false);
  const [accent, setAccent] = useState(s.accent);
  const [affiliation, setAffiliation] = useState(s.affiliation ?? '');
  const [address, setAddress] = useState(s.address ?? '');
  const [signatures, setSignatures] = useState<string[]>(s.signatures);
  const [hold, setHold] = useState(s.holdOnDues);
  const [minAmount, setMinAmount] = useState(s.holdMinAmount);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = () => run(setBusy, setErr, () => call('/api/admin/exams', 'POST', {
    action: 'settings', accent, affiliation, address, signatures, holdOnDues: hold, holdMinAmount: minAmount, ...(logoChanged ? { logo } : {}),
  })).then(ok => { if (ok) { toast('Report card settings saved. They apply to cards published from now on.'); setLogoChanged(false); reload(); } });
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try { setLogo(await shrink(f)); setLogoChanged(true); setErr(null); } catch (e: any) { setErr(e.message); }
  };
  return (
    <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="g2" style={{ marginBottom: 18 }}>
        <div className="card">
          <CardHead title="The card's heading" sub="Printed at the top of every report card. Cards already published keep the look they were published with." />
          <div className="rc" style={{ ['--rc-accent' as string]: accent, padding: 16, marginBottom: 16 }}>
            <div className="rc-head" style={{ paddingBottom: 10 }}>
              {logo ? <img className="rc-logo" src={logo} alt="School logo" /> : <div className="rc-logo rc-mono" aria-hidden="true">{schoolName.split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 3).map(w => w[0]).join('')}</div>}
              <div className="rc-school"><h1 style={{ fontSize: 17 }}>{schoolName}</h1>{affiliation && <p>{affiliation}</p>}{address && <p>{address}</p>}</div>
              <div className="rc-title"><span>REPORT CARD</span></div>
            </div>
          </div>
          <div className="ex-form">
            <div>
              <label>Logo</label>
              <div className="hr-acts">
                <label className="btn sm" style={{ cursor: 'pointer' }}><UploadSimple size={14} weight="bold" /> {logo ? 'Replace' : 'Upload'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => pick(e.target.files?.[0])} /></label>
                {logo && <button className="btn sm" onClick={() => { setLogo(null); setLogoChanged(true); }}><Trash size={14} weight="bold" /> Remove</button>}
              </div>
            </div>
            <div><label htmlFor="cs-a">Colour</label><input id="cs-a" type="color" className="ex-in" style={{ height: 40, padding: 4 }} value={accent} onChange={e => setAccent(e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label htmlFor="cs-af">Affiliation line</label><input id="cs-af" className="ex-in" maxLength={120} value={affiliation} onChange={e => setAffiliation(e.target.value)} placeholder="Affiliated to CBSE, New Delhi · Affiliation no. 3630000" /></div>
            <div style={{ gridColumn: '1 / -1' }}><label htmlFor="cs-ad">Address</label><input id="cs-ad" className="ex-in" maxLength={300} value={address} onChange={e => setAddress(e.target.value)} /></div>
          </div>
        </div>
        <div className="card">
          <CardHead title="Signatures" sub="Lines at the foot of the card, left to right. Up to four." />
          {signatures.map((x, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 36px', gap: 8, marginBottom: 8 }}>
              <input className="ex-in" aria-label={`Signature ${i + 1}`} maxLength={40} value={x} onChange={e => setSignatures(signatures.map((y, j) => (j === i ? e.target.value : y)))} />
              <button className="btn sm" aria-label="Remove" onClick={() => setSignatures(signatures.filter((_, j) => j !== i))}><Trash size={13} /></button>
            </div>
          ))}
          {signatures.length < 4 && <button className="btn sm" onClick={() => setSignatures([...signatures, ''])}>Add a signature line</button>}

          <h4 style={{ margin: '22px 0 8px', fontWeight: 800 }}>Fees</h4>
          <label className="ex-chk"><input type="checkbox" checked={hold} onChange={e => setHold(e.target.checked)} />Hold report cards while fees are overdue</label>
          {hold && <div style={{ marginTop: 10, maxWidth: 260 }}><label className="muted" htmlFor="cs-m" style={{ fontSize: 12 }}>Only when at least this much is overdue (Rs)</label><input id="cs-m" type="number" min={0} className="ex-in" value={minAmount} onChange={e => setMinAmount(Number(e.target.value))} /></div>}
          <p className="muted" style={{ marginTop: 10 }}>A held card is published and kept, but the family only sees that it is with the office. The fees office or the principal releases it, and the family is told. The student is never told why.</p>
        </div>
      </div>
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {!ro && <button className="btn pri" disabled={busy} onClick={save}>Save report card settings</button>}
    </fieldset>
  );
}
