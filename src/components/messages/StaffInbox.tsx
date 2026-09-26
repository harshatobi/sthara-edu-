'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { PaperPlaneRightIcon as PaperPlaneRight } from '@phosphor-icons/react/dist/ssr/PaperPlaneRight';
import { WhatsappLogoIcon as WhatsappLogo } from '@phosphor-icons/react/dist/ssr/WhatsappLogo';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useAuth } from '@/contexts/AuthContext';
import { ago, fmtDate } from '@/lib/admin/format';
import { TOPIC_LABEL, type Topic } from '@/lib/parent/ask';
import '@/styles/parent.css';

interface Row {
  id: string; subject: string; topic: string; status: 'open' | 'closed'; audience: 'teacher' | 'office'; lastAt: string;
  parentName: string; student: { id: string; name: string; cls: string }; staffName: string | null; unread: boolean; preview: string; lastFrom: string | null;
}
interface Detail {
  thread: { id: string; subject: string; topic: string; status: 'open' | 'closed'; audience: string; parentName: string; student: { name: string; cls: string }; parentReadAt: string | null };
  messages: { id: string; from: string; name: string; body: string; channel: string; at: string }[];
}

function useApi() {
  const { getAuthToken } = useAuth();
  return useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const token = await getAuthToken();
    const res = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
    return data as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Parent conversations for a teacher (their own) or the school office (messages.office). */
export default function StaffInbox({ role, base }: { role: 'teacher' | 'admin'; base: string }) {
  const api = useApi();
  const params = useSearchParams();
  const router = useRouter();
  const selected = params.get('thread');
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ threads: Row[] }>(`/api/staff/messages${role === 'admin' && all ? '?all=1' : ''}`).then(d => { setRows(d.threads); setErr(null); }).catch(e => setErr(e.message));
  }, [api, role, all]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);
  const open = (id: string | null) => router.replace(id ? `${base}?thread=${id}` : base, { scroll: false });
  const unread = rows?.filter(r => r.unread).length ?? 0;

  return (
    <div>
      <PageBar eyebrow="PARENT MESSAGES" title={role === 'teacher' ? 'Messages from parents' : 'Messages to the school office'}
        sub={role === 'teacher' ? 'Parents write to you about their child. Replies reach them in the parent portal and on WhatsApp if they linked it.' : 'Fees, admissions, leave and anything parents send to the office.'}
        actions={role === 'admin' ? (
          <div className="tabs" style={{ margin: 0 }}>
            <button className={`tab${!all ? ' on blue' : ''}`} onClick={() => setAll(false)}>Office</button>
            <button className={`tab${all ? ' on blue' : ''}`} onClick={() => setAll(true)}>Whole school</button>
          </div>
        ) : unread ? <span className="ch b">{unread} unread</span> : undefined} />
      {err && !rows ? (
        <div className="card"><Empty icon={<Warning size={32} weight="duotone" />} title="Messages didn’t load">{err}</Empty></div>
      ) : (
        <div className={`pa-inbox${selected ? ' has-open' : ''}`}>
          <div className="card pa-inbox-list" style={{ padding: 0 }}>
            {!rows ? <div style={{ padding: 18, display: 'grid', gap: 12 }}>{[0, 1, 2].map(i => <Skeleton key={i} h={58} />)}</div>
              : rows.length ? rows.map(t => (
                <button key={t.id} className={`pa-inbox-item${t.id === selected ? ' on' : ''}${t.unread ? ' unread' : ''}`} onClick={() => open(t.id)}>
                  <div className="pa-inbox-top"><b className="pa-trunc">{t.parentName}</b><i>{ago(t.lastAt)}</i></div>
                  <div className="pa-trunc pa-inbox-subj">{t.subject}</div>
                  <div className="pa-trunc muted">{t.student.name} · {t.student.cls}{all && t.staffName ? ` · to ${t.staffName}` : ''}</div>
                  <div className="pa-trunc muted">{t.lastFrom === 'parent' ? '' : 'You: '}{t.preview}</div>
                  {t.status === 'closed' && <span className="ch n xs" style={{ marginTop: 6 }}>Closed</span>}
                </button>
              )) : (
                <Empty icon={<EnvelopeSimple size={30} weight="duotone" />} title="No messages yet">
                  When a parent writes {role === 'teacher' ? 'to you' : 'to the office'}, it appears here and you get a notification.
                </Empty>
              )}
          </div>
          <div className="pa-inbox-pane">
            {selected ? <Thread key={selected} id={selected} role={role} onBack={() => open(null)} onChanged={load} />
              : <div className="card"><Empty icon={<EnvelopeSimple size={32} weight="duotone" />} title="Pick a conversation">Parents see your reply straight away.</Empty></div>}
          </div>
        </div>
      )}
    </div>
  );
}

function Thread({ id, role, onBack, onChanged }: { id: string; role: 'teacher' | 'admin'; onBack: () => void; onChanged: () => void }) {
  const api = useApi();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<Detail>(`/api/staff/messages?thread=${id}`).then(x => { setD(x); setErr(null); onChanged(); }).catch(e => setErr(e.message));
  }, [api, id, onChanged]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    setBusy(true);
    try { await api('/api/staff/messages', 'POST', { threadId: id, body: reply }); setReply(''); load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const setStatus = async (status: 'open' | 'closed') => {
    try { await api('/api/staff/messages', 'PATCH', { threadId: id, status }); load(); } catch (e: any) { setErr(e.message); }
  };
  if (err && !d) return <div className="card"><div className="note err">{err}</div></div>;
  if (!d) return <div className="card"><Skeleton h={22} w="50%" /><div style={{ height: 16 }} /><Skeleton h={80} /></div>;
  const t = d.thread;
  return (
    <div className="card pa-thread">
      <div className="pa-thread-hd">
        <button className="btn sm pa-back" onClick={onBack} aria-label="Back to conversations"><ArrowLeft size={14} weight="bold" /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="pa-trunc">{t.subject}</h3>
          <div className="muted">{t.parentName} · parent of {t.student.name} ({t.student.cls}) · {TOPIC_LABEL[t.topic as Topic] ?? 'General'}</div>
        </div>
        <button className="btn sm" onClick={() => void setStatus(t.status === 'open' ? 'closed' : 'open')}>{t.status === 'open' ? 'Close' : 'Reopen'}</button>
      </div>
      <div className="pa-msgs">
        {d.messages.map(m => (
          <div key={m.id} className={`pa-msg ${m.from === 'parent' ? 'them' : 'me'}`}>
            <div className="pa-msg-meta">{m.name} · {fmtDate(m.at, true)} {new Date(m.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
              {m.channel === 'whatsapp' && <span title="Sent from WhatsApp"><WhatsappLogo size={12} weight="fill" color="#25D366" /></span>}</div>
            <div className="pa-msg-bd">{m.body}</div>
          </div>
        ))}
      </div>
      {err && <div className="note err" style={{ margin: '0 22px 12px' }}>{err}</div>}
      <form className="cp-input" onSubmit={e => { e.preventDefault(); if (reply.trim()) void send(); }}>
        <label htmlFor="st-reply" className="sr-only">Reply</label>
        <textarea id="st-reply" rows={2} value={reply} onChange={e => setReply(e.target.value)} maxLength={4000}
          placeholder={role === 'teacher' ? 'Reply to the parent…' : 'Reply for the school office…'} />
        <button className="btn pri" disabled={busy || !reply.trim()} aria-label="Send reply"><PaperPlaneRight size={16} weight="fill" /></button>
      </form>
    </div>
  );
}
