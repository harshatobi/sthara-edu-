'use client';

/**
 * Link WhatsApp for staff: code by WhatsApp, then the switches for alerts, parent messages and the morning digest.
 * Opened from the "Also on WhatsApp" chip on Ask the School OS (moved off the Ask page itself, 2026-11-13).
 */
import { useCallback, useEffect, useState } from 'react';
import { WhatsappLogoIcon as WhatsappLogo } from '@phosphor-icons/react/dist/ssr/WhatsappLogo';
import { Skeleton } from '@/components/canon/ui';
import WhatsAppSimulator from '@/components/whatsapp/Simulator';
import { useAuth } from '@/contexts/AuthContext';

function useApi() {
  const { getAuthToken } = useAuth();
  return useCallback(async <T,>(path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<T> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
    return data as T;
  }, [getAuthToken]);
}


interface WaStatus {
  mode: 'live' | 'simulated'; businessNumber: string | null; linked: boolean; phone: string | null; optedIn: boolean; pending: boolean;
  prefs: Record<string, boolean>; available: { key: string; label: string; hint: string }[];
}

/** Link WhatsApp: code by WhatsApp, then the switches for alerts, parent messages and the digest. */
export default function WhatsAppCard({ role }: { role: 'teacher' | 'leadership' }) {
  const api = useApi();
  const [st, setSt] = useState<WaStatus | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'enter' | 'code' | null>(null);
  const [testCode, setTestCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<WaStatus>('/api/staff/whatsapp', 'GET').then(s => { if (alive) { setSt(s); setLoadErr(null); } }).catch(e => { if (alive) setLoadErr(e.message); });
    return () => { alive = false; };
  }, [api, nonce]);
  const reload = () => setNonce(n => n + 1);
  const act = async (body: Record<string, unknown> | null, after?: (r: any) => void) => {
    setBusy(true); setErr(null);
    try { const r = body ? await api('/api/staff/whatsapp', 'POST', body) : await api('/api/staff/whatsapp', 'DELETE'); after?.(r); reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const view = stage ?? (st?.pending ? 'code' : 'enter');

  return (
    <div className="card" id="whatsapp">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, marginBottom: 6 }}><WhatsappLogo size={19} weight="fill" color="#25D366" /> On WhatsApp too</h3>
      {loadErr ? <p className="muted" style={{ fontSize: 13 }}>{loadErr}</p> : !st ? <Skeleton h={80} /> : (
        <>
          {st.mode === 'simulated' && <div className="note" style={{ fontSize: 12, marginBottom: 10 }}><b>Test mode:</b> WhatsApp isn&apos;t connected yet, so messages are logged, not delivered, and the link code is shown here.</div>}
          {st.linked ? (
            <>
              <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Linked to <b>{st.phone}</b>. Message {st.businessNumber ?? 'the school number'} to ask the same questions{role === 'teacher' ? ', reply ACK to alerts, R to parents, or ABSENT 4, 12 to mark your register' : ', reply ACK to escalations or R to parents'}.</p>
              {st.available.map(p => (
                <label key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 8 }}>
                  <input type="checkbox" checked={st.prefs[p.key] !== false} disabled={busy || !st.optedIn} onChange={e => void act({ action: 'prefs', prefs: { [p.key]: e.target.checked } })} />
                  <span><b>{p.label}</b><br /><span className="muted">{p.hint}</span></span>
                </label>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <button className="btn sm" disabled={busy} onClick={() => void act({ action: st.optedIn ? 'optout' : 'optin' })}>{st.optedIn ? 'Pause' : 'Resume'}</button>
                <button className="btn sm" disabled={busy} onClick={() => void act(null, () => setStage('enter'))}>Unlink</button>
              </div>
              {st.mode === 'simulated' && (
                <WhatsAppSimulator hints={role === 'teacher' ? ['TODAY', 'What needs me today?', 'ABSENT 2', 'ACK', 'HELP'] : ['TODAY', 'What needs my attention?', 'ACK', 'HELP']} />
              )}
            </>
          ) : view === 'enter' ? (
            <form onSubmit={e => { e.preventDefault(); void act({ action: 'start', phone, consent: agree }, r => { setStage('code'); setTestCode(r.testCode ?? null); }); }}>
              <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Ask from WhatsApp, and get {role === 'teacher' ? 'urgent alerts, parent messages and a morning digest' : 'escalations, parent messages and a morning digest'} there.</p>
              <div className="cmp-fld"><label htmlFor="wa-phone">YOUR WHATSAPP NUMBER</label>
                <input id="wa-phone" className="cmp-in" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="98765 43210" /></div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, marginBottom: 10 }}>
                <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
                <span>I agree to receive school messages about my work on WhatsApp. I can pause or unlink at any time.</span>
              </label>
              <button className="btn pri sm" disabled={busy || !phone.trim() || !agree}>{busy ? 'Sending code…' : 'Send code'}</button>
            </form>
          ) : (
            <form onSubmit={e => { e.preventDefault(); void act({ action: 'verify', code }, () => { setStage(null); setTestCode(null); setCode(''); }); }}>
              <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>We sent a 6-digit code on WhatsApp. It expires in 10 minutes.</p>
              {testCode && <div className="note" style={{ fontSize: 12.5, marginBottom: 8 }}>Test mode code: <b className="mono">{testCode}</b></div>}
              <div className="cmp-fld"><label htmlFor="wa-code">CODE</label>
                <input id="wa-code" className="cmp-in mono" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" style={{ letterSpacing: '.3em' }} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn pri sm" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Link WhatsApp'}</button>
                <button type="button" className="btn sm" disabled={busy} onClick={() => { setStage('enter'); setCode(''); setTestCode(null); }}>Other number</button>
              </div>
            </form>
          )}
          {err && <div className="err" role="alert" style={{ marginTop: 10 }}>{err}</div>}
        </>
      )}
    </div>
  );
}
