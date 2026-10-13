'use client';

import { useCallback, useEffect, useState } from 'react';
import { LifebuoyIcon as Lifebuoy } from '@phosphor-icons/react/dist/ssr/Lifebuoy';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, PageBar, type Tone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useAuth } from '@/contexts/AuthContext';
import { ago } from '@/lib/admin/format';
import type { CaseStatus, Priority } from '@/lib/ops/desk';
import { CardHead, DeskGate } from './kit';

interface Case { id: string; ref: string; subject: string; category: string; status: CaseStatus; statusText: string; raisedByName: string | null; createdAt: string; updatedAt: string; newReply: boolean }
interface Message { id: string; from: 'school' | 'operator' | 'system'; name: string | null; body: string; at: string }
interface List { cases: Case[]; categories: { key: string; label: string }[]; urgencies: { key: Priority; label: string }[] }

const TONE: Record<CaseStatus, Tone> = { new: 'b', open: 'b', waiting_school: 'a', resolved: 'g', closed: 'n' };
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export default function SupportPage() {
  return <DeskGate>{() => <Support />}</DeskGate>;
}

/** The school office's line to Sthara: raise a case, follow it, reply, and confirm when it is fixed. */
function Support() {
  const { getAuthToken } = useAuth();
  const [toast, toastEl] = useToast();
  const [list, setList] = useState<List | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [raising, setRaising] = useState(false);

  const call = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const token = await getAuthToken();
    const res = await fetch(`/api/admin/support${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
    return data as T;
  }, [getAuthToken]);
  const load = useCallback(() => {
    call<List>('').then(d => { setList(d); setErr(null); }).catch(e => setErr(e instanceof Error ? e.message : 'Could not load your cases.'));
  }, [call]);
  useEffect(() => { load(); }, [load]);

  if (openId) return <>{toastEl}<CaseThread id={openId} call={call} toast={toast} back={() => { setOpenId(null); load(); }} /></>;
  const live = (list?.cases ?? []).filter(c => c.status !== 'closed' && c.status !== 'resolved');

  return (
    <>
      {toastEl}
      <PageBar eyebrow="HELP" title="Help & support"
        sub="Tell Sthara what is wrong or what you need. Everyone in the office sees the school's cases, so a colleague can pick one up."
        actions={<button className="btn pri" onClick={() => setRaising(r => !r)}><Plus size={15} weight="bold" /> Raise a case</button>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {raising && list && <NewCase list={list} call={call} onCancel={() => setRaising(false)} onRaised={(id, ref) => { setRaising(false); toast(`${ref} raised. Sthara has it.`); setOpenId(id); }} />}

      <div className="card">
        <CardHead title="Your school's cases" sub={list ? (live.length ? `${live.length} open.` : 'Nothing open.') : 'Loading…'} />
        {list && !list.cases.length && (
          <Empty icon={<Lifebuoy size={28} weight="duotone" />} title="No cases yet">When something is not working, or you need a change only Sthara can make, raise a case here.</Empty>
        )}
        {(list?.cases ?? []).map(c => (
          <button key={c.id} type="button" className="row" onClick={() => setOpenId(c.id)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 14 }}>{c.subject}</b>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {c.ref} · {list?.categories.find(x => x.key === c.category)?.label ?? 'Other'} · raised {ago(c.createdAt)}{c.raisedByName ? ` by ${c.raisedByName}` : ''}
              </div>
            </div>
            {c.newReply && <Chip tone="r">NEW REPLY</Chip>}
            <Chip tone={TONE[c.status]}>{c.statusText.toUpperCase()}</Chip>
          </button>
        ))}
      </div>
    </>
  );
}

type Call = <T>(path: string, body?: unknown) => Promise<T>;

function NewCase({ list, call, onCancel, onRaised }: { list: List; call: Call; onCancel: () => void; onRaised: (id: string, ref: string) => void }) {
  const [f, setF] = useState({ subject: '', description: '', category: list.categories[0]?.key ?? 'other', urgency: 'normal' as Priority });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  return (
    <form className="card" style={{ marginBottom: 22 }} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { const out = await call<{ id: string; ref: string }>('', { action: 'new', ...f }); onRaised(out.id, out.ref); } catch (x) { setErr(x instanceof Error ? x.message : 'Could not raise the case.'); setBusy(false); }
    }}>
      <CardHead title="Raise a case" sub="Say what you were doing, what you expected and what happened. Name the class, student or receipt if it concerns one." />
      <div className="g2">
        <div>
          <label className="lbl" htmlFor="s-subject">IN A FEW WORDS</label>
          <input id="s-subject" className="cmp-in" required minLength={4} maxLength={160} placeholder="e.g. Class 9-B marks missing from report cards" value={f.subject} onChange={e => set('subject', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="lbl" htmlFor="s-cat">ABOUT</label>
            <select id="s-cat" className="cmp-sel" value={f.category} onChange={e => set('category', e.target.value)}>
              {list.categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="s-urg">HOW URGENT</label>
            <select id="s-urg" className="cmp-sel" value={f.urgency} onChange={e => set('urgency', e.target.value as Priority)}>
              {list.urgencies.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
            </select>
          </div>
        </div>
      </div>
      <label className="lbl" htmlFor="s-desc" style={{ marginTop: 16 }}>WHAT IS HAPPENING</label>
      <textarea id="s-desc" className="cmp-in" rows={5} required maxLength={8000} value={f.description} onChange={e => set('description', e.target.value)} />
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Do not paste passwords. Sthara&apos;s team may open your school&apos;s records to fix this; every time they do is listed under Roles &amp; Access.</p>
      {err && <div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 16 }}>
        <button className="btn pri" disabled={busy}>{busy ? 'Sending…' : 'Send to Sthara'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function CaseThread({ id, call, toast, back }: { id: string; call: Call; toast: (m: string) => void; back: () => void }) {
  const [d, setD] = useState<{ case: Case; messages: Message[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    call<{ case: Case; messages: Message[] }>(`?id=${id}`).then(x => { setD(x); setErr(null); }).catch(e => setErr(e instanceof Error ? e.message : 'Could not load the case.'));
  }, [call, id]);
  useEffect(() => { load(); }, [load]);
  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setErr(null);
    try { await call('', { id, ...body }); setText(''); toast(done); load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); }
  };
  const c = d?.case;
  return (
    <>
      <div style={{ marginBottom: 12 }}><button className="btn sm" onClick={back}><ArrowLeft size={14} weight="bold" /> All cases</button></div>
      <PageBar eyebrow={c?.ref ?? 'CASE'} title={c?.subject ?? 'Loading…'} sub={c ? <Chip tone={TONE[c.status]}>{c.statusText.toUpperCase()}</Chip> : undefined} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      {d && c && (
        <div className="card">
          <div style={{ display: 'grid', gap: 12 }}>
            {d.messages.map(m => (
              <div key={m.id} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', borderStyle: m.from === 'system' ? 'dashed' : 'solid', background: m.from === 'operator' ? 'var(--body)' : m.from === 'system' ? 'transparent' : '#fff' }}>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}><b style={{ color: 'var(--ink)' }}>{m.from === 'system' ? 'Update' : m.name ?? 'School'}</b> · {when(m.at)}</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>
              </div>
            ))}
            {!d.messages.length && <p className="muted" style={{ fontSize: 13.5 }}>Sthara logged this case for you. Replies will appear here.</p>}
          </div>
          {c.status === 'closed' ? (
            <p className="muted" style={{ fontSize: 13.5, marginTop: 18 }}>This case is closed. If it comes back, raise a new case and mention {c.ref}.</p>
          ) : (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
              {c.status === 'resolved' && <div className="note info" style={{ marginBottom: 12 }}>Sthara marked this resolved. Confirm it, or reply if it is not fixed and the case reopens.</div>}
              <textarea className="cmp-in" rows={4} maxLength={8000} aria-label="Your reply" placeholder={c.status === 'resolved' ? 'Not fixed? Say what still happens' : 'Add to the case'} value={text} onChange={e => setText(e.target.value)} />
              <div className="acts" style={{ marginTop: 10 }}>
                <button className="btn pri" disabled={busy || !text.trim()} onClick={() => act({ action: 'reply', body: text }, c.status === 'resolved' ? 'Case reopened.' : 'Reply sent.')}>{c.status === 'resolved' ? 'Reply and reopen' : 'Send reply'}</button>
                {c.status === 'resolved' && <button className="btn" disabled={busy} onClick={() => act({ action: 'close' }, 'Thanks. Case closed.')}>Yes, it is fixed</button>}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
