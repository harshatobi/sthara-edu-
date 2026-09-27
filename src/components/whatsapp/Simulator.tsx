'use client';

/**
 * WhatsApp test chat (test mode only): type as if on your phone, and see exactly
 * what Sthara would send back. Messages go through the real inbound handler.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PaperPlaneRightIcon as PaperPlaneRight } from '@phosphor-icons/react/dist/ssr/PaperPlaneRight';
import { useAuth } from '@/contexts/AuthContext';

interface Msg { id: string; dir: 'in' | 'out'; kind: string; body: string; at: string }

/** WhatsApp's *bold* and _italic_ as text styling; everything else plain. */
function Formatted({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return <>{parts.map((p, i) => (p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <b key={i}>{p.slice(1, -1)}</b>
    : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? <i key={i}>{p.slice(1, -1)}</i> : <span key={i}>{p}</span>))}</>;
}

export default function WhatsAppSimulator({ hints }: { hints: string[] }) {
  const { getAuthToken } = useAuth();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const call = useCallback(async (method: 'GET' | 'POST', body?: unknown) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const res = await fetch('/api/whatsapp/simulate', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
    return data;
  }, [getAuthToken]);

  useEffect(() => {
    let alive = true;
    call('GET').then(d => { if (alive) setMsgs(d.messages); }).catch(e => { if (alive) { setErr(e.message); setMsgs([]); } });
    return () => { alive = false; };
  }, [call]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length, busy]);

  const send = async (t: string) => {
    const q = t.trim();
    if (!q || busy) return;
    setBusy(true); setErr(null); setText('');
    setMsgs(m => [...(m || []), { id: `local-${m?.length ?? 0}`, dir: 'in', kind: 'ask', body: q, at: '' }]);
    try {
      const d = await call('POST', { text: q });
      setMsgs(m => [...(m || []).filter(x => !x.id.startsWith('local-')), ...d.messages]);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginTop: 12 }}>
      <div style={{ background: '#075E54', color: '#fff', padding: '8px 12px', fontSize: 12.5, fontWeight: 700 }}>Test chat · as if from your phone</div>
      <div style={{ background: '#ECE5DD', padding: 10, height: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }} aria-live="polite">
        {!msgs ? <span className="muted" style={{ fontSize: 12 }}>Loading…</span>
          : !msgs.length ? <span className="muted" style={{ fontSize: 12 }}>Nothing yet. Try: {hints.join(' · ')}</span>
          : msgs.map(m => (
            <div key={m.id} style={{
              alignSelf: m.dir === 'in' ? 'flex-end' : 'flex-start', maxWidth: '88%', background: m.dir === 'in' ? '#DCF8C6' : '#fff',
              borderRadius: 10, padding: '6px 9px', fontSize: 12.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', boxShadow: '0 1px 1px rgba(0,0,0,.08)',
            }}><Formatted text={m.body} /></div>
          ))}
        {busy && <span className="muted" style={{ fontSize: 12, alignSelf: 'flex-start' }}>Sthara is typing…</span>}
        <div ref={end} />
      </div>
      <form onSubmit={e => { e.preventDefault(); void send(text); }} style={{ display: 'flex', gap: 6, padding: 8, background: '#fff' }}>
        <input className="cmp-in" style={{ margin: 0, flex: 1, fontSize: 13 }} value={text} onChange={e => setText(e.target.value)} placeholder="Message" aria-label="Test WhatsApp message" disabled={busy} />
        <button className="btn pri sm" disabled={busy || !text.trim()} aria-label="Send"><PaperPlaneRight size={15} weight="fill" /></button>
      </form>
      {msgs && msgs.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 8px 8px', background: '#fff' }}>
          {hints.map(h => <button key={h} type="button" className="btn sm" style={{ fontSize: 11.5, padding: '4px 10px' }} disabled={busy} onClick={() => void send(h)}>{h}</button>)}
        </div>
      )}
      {err && <div className="err" role="alert" style={{ margin: 8 }}>{err}</div>}
    </div>
  );
}
