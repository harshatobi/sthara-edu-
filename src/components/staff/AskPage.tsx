'use client';

/**
 * Ask the School OS for teachers (their classes) and school leadership (the school,
 * within their office roles). Canon classes only. The rail links WhatsApp, where
 * the same School OS answers, plus alerts, parent messages and the morning digest.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { PaperPlaneRightIcon as PaperPlaneRight } from '@phosphor-icons/react/dist/ssr/PaperPlaneRight';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { WhatsappLogoIcon as WhatsappLogo } from '@phosphor-icons/react/dist/ssr/WhatsappLogo';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import WhatsAppSimulator from '@/components/whatsapp/Simulator';
import { useAuth } from '@/contexts/AuthContext';
import type { StaffAction, StaffReply, StaffTurn } from '@/lib/staff/ask';

const TONE: Record<Tone, string> = { g: '#10B981', a: '#F59E0B', r: '#E11D48', b: '#2F6BFF', p: '#7C5CFC', n: '#7A8699' };
interface Thread { id: string; title: string; turns: StaffTurn[]; at: number }
const MAX_THREADS = 20;
const titleOf = (t: string) => (t.length > 46 ? `${t.slice(0, 45).trimEnd()}…` : t) || 'New conversation';
const newId = () => Math.random().toString(36).slice(2, 10);
/** Event-time clock (only ever called from handlers, never during render). */
const stamp = () => Date.now();

const STARTERS: Record<'teacher' | 'leadership', string[]> = {
  teacher: ['What needs me today?', "Who hasn't submitted this week's homework?", 'Which students are slipping, and why?', 'Any parents waiting for a reply?', 'Who has checked in low on energy?'],
  leadership: ['What needs my attention today?', 'Which classes are struggling most, and why?', 'How are fee collections this month?', 'Which teachers have a grading backlog?', 'What has escalated to me?'],
};

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

function useThreads(uid: string | undefined) {
  const key = uid ? `sthara.staff.ask.${uid}` : null;
  const [threads, setThreads] = useState<Thread[]>([]);
  // Read after mount (the server has no localStorage; reading during render would mismatch hydration).
  useEffect(() => {
    if (!key) return;
    let v: Thread[] = [];
    try { const x = JSON.parse(localStorage.getItem(key) || '[]'); v = Array.isArray(x) ? x : []; } catch { /* private mode */ }
    let alive = true;
    Promise.resolve().then(() => { if (alive) setThreads(v); });
    return () => { alive = false; };
  }, [key]);
  const save = useCallback((next: Thread[]) => {
    setThreads(next);
    if (key) try { localStorage.setItem(key, JSON.stringify(next.slice(0, MAX_THREADS))); } catch { /* full or private */ }
  }, [key]);
  return { threads, save };
}

export default function StaffAskPage({ role }: { role: 'teacher' | 'leadership' }) {
  const { profile } = useAuth();
  const api = useApi();
  const { threads, save } = useThreads(profile?.uid);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const streamEnd = useRef<HTMLDivElement>(null);
  const active = threads.find(t => t.id === activeId) ?? null;
  const turns = active?.turns ?? [];

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setErr(null); setBusy(true); setDraft('');
    const base: Thread = active ?? { id: newId(), title: titleOf(q), turns: [], at: stamp() };
    const withQ: Thread = { ...base, turns: [...base.turns, { role: 'me', text: q, at: stamp() }], at: stamp() };
    const rest = threads.filter(t => t.id !== base.id);
    save([withQ, ...rest]);
    setActiveId(withQ.id);
    try {
      const { reply } = await api<{ reply: StaffReply }>('/api/staff/ask', 'POST', { messages: withQ.turns.map(t => ({ role: t.role, text: t.text })) });
      save([{ ...withQ, turns: [...withQ.turns, { role: 'os', text: reply.say || reply.ask.map(a => a.question).join(' '), reply, at: stamp() }] }, ...rest]);
    } catch (e: any) {
      save([{ ...withQ, turns: base.turns }, ...rest].filter(t => t.turns.length));
      if (!base.turns.length) setActiveId(null);
      setDraft(q);
      setErr(e?.message || 'Something went wrong.');
    } finally { setBusy(false); }
  };

  useEffect(() => { streamEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns.length, busy]);

  return (
    <>
      <PageBar eyebrow="ASK THE SCHOOL OS" title={role === 'teacher' ? 'Ask anything about your classes' : 'Ask anything about the school'}
        sub={role === 'teacher'
          ? 'Answers come from your classes: mastery, homework, the situational feed, attendance, wellness check-ins and parent messages. It can draft replies and acknowledge feed items for you to confirm.'
          : 'Answers come from the school’s records, only in the areas your role covers: academics, staff, fees, admissions, wellness, the feed, incidents and attendance.'}
        actions={<button className="btn" onClick={() => { setActiveId(null); setErr(null); }}><Plus size={16} weight="bold" /> New conversation</button>} />
      <div className="cp-grid">
        <div className="card cp-chat" style={{ padding: 0 }}>
          <div className="cp-ctx">
            <ShieldCheck size={15} weight="duotone" color="#10B981" />
            <span>{role === 'teacher' ? 'Sees only your classes.' : 'Sees only what your role allows.'} Names never leave Sthara&apos;s servers; journals stay private.</span>
          </div>
          <div className="cp-stream" aria-live="polite">
            {!turns.length && !busy && (
              <div className="cp-ai">
                <div className="cp-av"><Sparkle size={17} weight="fill" /></div>
                <div className="cp-body">
                  <div className="cp-say">{role === 'teacher'
                    ? 'Ask what needs you, who is behind, why a student is slipping, or what to say to a parent. I read your classes first, then answer.'
                    : 'Ask what needs you, where the school is slipping and why, how fees and admissions are going, or who needs support. I answer from the records your role can see.'}</div>
                  <div className="sugg">{STARTERS[role].map(s => <button key={s} type="button" onClick={() => void send(s)}>{s}</button>)}</div>
                </div>
              </div>
            )}
            {turns.map((t, i) => t.role === 'me'
              ? <div key={i} className="cp-me">{t.text}</div>
              : <OsTurn key={i} turn={t} last={i === turns.length - 1} onAsk={send} />)}
            {busy && (
              <div className="cp-ai" aria-label="The School OS is reading the records">
                <div className="cp-av"><Sparkle size={17} weight="fill" /></div>
                <div className="cp-body"><div className="cp-say" style={{ display: 'grid', gap: 8 }}>
                  <span className="muted">Reading the school&apos;s records…</span>
                  <Skeleton h={12} w="92%" /><Skeleton h={12} w="74%" /><Skeleton h={12} w="52%" />
                </div></div>
              </div>
            )}
            {err && <div className="note err" role="alert"><Warning size={15} weight="bold" /> {err} <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => void send(draft)}>Try again</button></div>}
            <div ref={streamEnd} />
          </div>
          <form className="cp-input" onSubmit={e => { e.preventDefault(); void send(draft); }}>
            <label htmlFor="staff-ask-in" className="sr-only">Your question</label>
            <textarea id="staff-ask-in" rows={1} value={draft} onChange={e => setDraft(e.target.value)} disabled={busy}
              placeholder={role === 'teacher' ? 'Ask about your classes, students, homework or parents…' : 'Ask about the school…'}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); } }} />
            <button className="btn pri" type="submit" disabled={busy || !draft.trim()} aria-label="Send"><PaperPlaneRight size={17} weight="fill" /></button>
          </form>
        </div>

        <div className="cp-rail">
          <WhatsAppCard role={role} />
          {threads.length > 0 && (
            <div className="card" style={{ padding: '16px 0 8px' }}>
              <h3 style={{ padding: '0 18px 8px', fontSize: 14 }}>Earlier conversations</h3>
              {threads.slice(0, 8).map(t => (
                <button key={t.id} className="row-btn" style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, padding: '8px 18px', textAlign: 'left', fontSize: 13, fontWeight: t.id === activeId ? 800 : 600 }}
                  onClick={() => { setActiveId(t.id); setErr(null); }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  <i className="muted" style={{ fontStyle: 'normal', fontSize: 12 }}>{new Date(t.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</i>
                </button>
              ))}
              <button className="row-btn" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 18px', fontSize: 12.5, color: 'var(--red)' }} onClick={() => { save([]); setActiveId(null); }}>Clear history on this device</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function OsTurn({ turn, last, onAsk }: { turn: StaffTurn; last: boolean; onAsk: (t: string) => void }) {
  const r = turn.reply;
  return (
    <div className="cp-ai">
      <div className="cp-av"><Sparkle size={17} weight="fill" /></div>
      <div className="cp-body">
        {r?.say && <div className="cp-say md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{r.say}</ReactMarkdown></div>}
        {!!r?.facts.length && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            {r.facts.map((f, i) => (
              <div key={i} style={{ borderLeft: `3px solid ${TONE[f.tone]}`, background: 'var(--body)', borderRadius: 10, padding: '8px 12px' }}>
                <div className="muted" style={{ fontSize: 11.5 }}>{f.label}</div><b style={{ fontSize: 16 }}>{f.value}</b>
              </div>
            ))}
          </div>
        )}
        {!!r?.ask.length && (
          <div className="cp-ask">
            {r.ask.map(q => (
              <div key={q.id}>
                <div className="q">{q.question}</div>
                <div>{q.options.map(o => <button key={o} type="button" className="opt" disabled={!last} onClick={() => onAsk(o)}>{o}</button>)}</div>
              </div>
            ))}
          </div>
        )}
        {r?.actions.map((a, i) => <ActionCard key={i} action={a} />)}
        {last && !!r?.suggestions.length && <div className="sugg">{r.suggestions.map(s => <button key={s} type="button" onClick={() => onAsk(s)}>{s}</button>)}</div>}
      </div>
    </div>
  );
}

/** A drafted reply or acknowledgement: nothing happens until the person confirms. */
function ActionCard({ action }: { action: StaffAction }) {
  const api = useApi();
  const [body, setBody] = useState(action.kind === 'reply' ? action.draft : action.kind === 'ack' ? action.note : '');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'dismissed'>('idle');
  const [err, setErr] = useState<string | null>(null);
  if (action.kind === 'open') return <Link href={action.href} className="btn sm" style={{ alignSelf: 'flex-start' }}>{action.label} <ArrowRight size={13} weight="bold" /></Link>;
  if (state === 'dismissed') return null;
  const go = async () => {
    setState('busy'); setErr(null);
    try {
      if (action.kind === 'reply') await api('/api/staff/messages', 'POST', { threadId: action.threadId, body });
      else await api('/api/feed', 'POST', { action: 'ack', id: action.situationId, note: body });
      setState('done');
    } catch (e: any) { setErr(e?.message || 'Could not do that.'); setState('idle'); }
  };
  if (state === 'done') {
    return (
      <div className="note" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <CheckCircle size={18} weight="fill" color="#10B981" />
        <span>{action.kind === 'reply' ? `Sent to ${action.toName}. It's in Parent Messages.` : `Acknowledged: ${action.title}`}</span>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 14, boxShadow: 'none', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: 13.5 }}>
        {action.kind === 'reply' ? <EnvelopeSimple size={17} weight="duotone" color="#0EA5E9" /> : <CheckCircle size={17} weight="duotone" color="#10B981" />}
        <b>{action.kind === 'reply' ? `Reply to ${action.toName}` : `Acknowledge: ${action.title}`}</b>
      </div>
      {action.kind === 'reply' && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Re: {action.subject}</div>}
      <textarea className="cmp-in" value={body} onChange={e => setBody(e.target.value)} rows={action.kind === 'reply' ? 4 : 2}
        aria-label={action.kind === 'reply' ? 'Reply' : 'Note (optional)'} maxLength={action.kind === 'reply' ? 4000 : 500}
        placeholder={action.kind === 'ack' ? 'Note (optional)' : undefined} style={{ marginBottom: 8 }} />
      {err && <div className="err" role="alert" style={{ marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 12, marginRight: 'auto' }}>Nothing happens until you confirm.</span>
        <button className="btn sm" onClick={() => setState('dismissed')}>Not now</button>
        <button className="btn pri sm" disabled={state === 'busy' || (action.kind === 'reply' && !body.trim())} onClick={() => void go()}>
          {state === 'busy' ? 'Working…' : action.kind === 'reply' ? 'Send reply' : 'Acknowledge'}
        </button>
      </div>
    </div>
  );
}

interface WaStatus {
  mode: 'live' | 'simulated'; businessNumber: string | null; linked: boolean; phone: string | null; optedIn: boolean; pending: boolean;
  prefs: Record<string, boolean>; available: { key: string; label: string; hint: string }[];
}

/** Link WhatsApp: code by WhatsApp, then the switches for alerts, parent messages and the digest. */
function WhatsAppCard({ role }: { role: 'teacher' | 'leadership' }) {
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
