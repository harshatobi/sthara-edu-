'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { PaperPlaneRightIcon as PaperPlaneRight } from '@phosphor-icons/react/dist/ssr/PaperPlaneRight';
import { WhatsappLogoIcon as WhatsappLogo } from '@phosphor-icons/react/dist/ssr/WhatsappLogo';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { ago, fmtDate } from '@/lib/admin/format';
import { useFamily } from '@/lib/parent/useFamily';
import { TOPICS, TOPIC_LABEL, type Topic } from '@/lib/parent/ask';
import type { FamilyView } from '@/lib/parent/family';
import { FamilyGate } from './common';

interface Msg { id: string; from: 'parent' | 'teacher' | 'admin'; name: string; body: string; channel: 'web' | 'whatsapp'; at: string }
interface ThreadDetail { thread: { id: string; subject: string; topic: string; status: string; audience: string; studentId: string; staffReadAt: string | null }; messages: Msg[] }

export default function Messages() {
  return (
    <FamilyGate>
      {({ view }) => <Inbox view={view} />}
    </FamilyGate>
  );
}

function Inbox({ view }: { view: FamilyView }) {
  const params = useSearchParams();
  const router = useRouter();
  const { reload } = useFamily();
  const selected = params.get('thread');
  const composing = params.get('new') !== null;
  const go = (q: Record<string, string> | null) => router.replace(q ? `/parent/messages?${new URLSearchParams(q)}` : '/parent/messages', { scroll: false });
  const kidName = (id: string) => view.children.find(c => c.id === id)?.firstName ?? 'Your child';

  return (
    <>
      <PageBar eyebrow="SCHOOL MESSAGES" title="Messages with the school"
        sub="Write to your child's teachers or the school office. Replies arrive here, and on WhatsApp if you've linked it."
        actions={<button className="btn pri" onClick={() => go({ new: '1' })}><Plus size={16} weight="bold" /> New message</button>} />
      <div className={`pa-inbox${selected || composing ? ' has-open' : ''}`}>
        <div className="card pa-inbox-list" style={{ padding: 0 }}>
          {view.threads.length ? view.threads.map(t => (
            <button key={t.id} className={`pa-inbox-item${t.id === selected ? ' on' : ''}${t.unread ? ' unread' : ''}`} onClick={() => go({ thread: t.id })}>
              <div className="pa-inbox-top">
                <b className="pa-trunc">{t.staff?.name ?? 'School office'}</b>
                <i>{ago(t.lastAt)}</i>
              </div>
              <div className="pa-trunc pa-inbox-subj">{t.subject}</div>
              <div className="pa-trunc muted">{view.children.length > 1 ? `${kidName(t.studentId)} · ` : ''}{t.lastFrom === 'parent' ? 'You: ' : ''}{t.preview}</div>
              {t.status === 'closed' && <span className="ch n xs" style={{ marginTop: 6 }}>Closed</span>}
            </button>
          )) : (
            <Empty icon={<EnvelopeSimple size={30} weight="duotone" />} title="No conversations yet">
              Start one with a teacher or the office. You can also ask the School OS to draft it for you.
            </Empty>
          )}
        </div>
        <div className="pa-inbox-pane">
          {composing ? <Composer view={view} onDone={id => { reload(); go({ thread: id }); }} onCancel={() => go(null)} />
            : selected ? <ThreadView key={selected} id={selected} view={view} onBack={() => go(null)} onChanged={reload} />
            : (
              <div className="card"><Empty icon={<EnvelopeSimple size={32} weight="duotone" />} title="Pick a conversation">
                Or start a new message. Teachers usually reply within a school day.
              </Empty></div>
            )}
        </div>
      </div>
    </>
  );
}

function ThreadView({ id, view, onBack, onChanged }: { id: string; view: FamilyView; onBack: () => void; onChanged: () => void }) {
  const { call } = useFamily();
  const [d, setD] = useState<ThreadDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const load = useCallback(() => {
    call<ThreadDetail>(`/api/parent/messages?thread=${id}`).then(x => { setD(x); setErr(null); }).catch(e => setErr(e.message));
  }, [call, id]);
  useEffect(() => { load(); onChanged(); /* marks read */ }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try { await call('/api/parent/messages', 'POST', { threadId: id, body: reply }); setReply(''); load(); onChanged(); }
    catch (e: any) { setErr(e.message); }
    finally { setSending(false); }
  };
  if (err && !d) return <div className="card"><div className="note err">{err}</div></div>;
  if (!d) return <div className="card"><Skeleton h={22} w="50%" /><div style={{ height: 16 }} /><Skeleton h={80} /><div style={{ height: 12 }} /><Skeleton h={80} w="70%" /></div>;
  const kid = view.children.find(c => c.id === d.thread.studentId);
  const lastMine = [...d.messages].reverse().find(m => m.from === 'parent');
  const seen = lastMine && d.thread.staffReadAt && new Date(d.thread.staffReadAt) >= new Date(lastMine.at);
  return (
    <div className="card pa-thread">
      <div className="pa-thread-hd">
        <button className="btn sm pa-back" onClick={onBack} aria-label="Back to conversations"><ArrowLeft size={14} weight="bold" /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="pa-trunc">{d.thread.subject}</h3>
          <div className="muted">{kid ? `About ${kid.firstName} · ` : ''}{TOPIC_LABEL[d.thread.topic as Topic] ?? 'General'}{d.thread.status === 'closed' ? ' · closed by school' : ''}</div>
        </div>
      </div>
      <div className="pa-msgs">
        {d.messages.map(m => (
          <div key={m.id} className={`pa-msg ${m.from === 'parent' ? 'me' : 'them'}`}>
            <div className="pa-msg-meta">{m.name} · {fmtDate(m.at, true)} {new Date(m.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
              {m.channel === 'whatsapp' && <span title="Sent from WhatsApp"><WhatsappLogo size={12} weight="fill" color="#25D366" /></span>}</div>
            <div className="pa-msg-bd">{m.body}</div>
          </div>
        ))}
        {seen && <div className="muted" style={{ textAlign: 'right', fontSize: 12 }}>Seen by the school</div>}
      </div>
      {err && <div className="note err">{err}</div>}
      <form className="cp-input" onSubmit={e => { e.preventDefault(); void send(); }}>
        <label htmlFor="pa-reply" className="sr-only">Reply</label>
        <textarea id="pa-reply" rows={2} value={reply} onChange={e => setReply(e.target.value)} placeholder="Write a reply…" maxLength={4000} />
        <button className="btn pri" disabled={sending || !reply.trim()} aria-label="Send reply"><PaperPlaneRight size={16} weight="fill" /></button>
      </form>
    </div>
  );
}

function Composer({ view, onDone, onCancel }: { view: FamilyView; onDone: (threadId: string) => void; onCancel: () => void }) {
  const { call, child: focus } = useFamily();
  const params = useSearchParams();
  const [childId, setChildId] = useState(params.get('child') || focus?.id || view.children[0]?.id || '');
  const child = view.children.find(c => c.id === childId) ?? view.children[0];
  const [to, setTo] = useState(params.get('to') || child?.classTeacher?.id || 'office');
  const [topic, setTopic] = useState<Topic>((TOPICS as readonly string[]).includes(params.get('topic') || '') ? (params.get('topic') as Topic) : 'general');
  const [subject, setSubject] = useState(params.get('subject') || '');
  const [body, setBody] = useState(params.get('body') || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const validTo = to === 'office' || !!child?.teachers.some(t => t.id === to);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await call<{ threadId: string }>('/api/parent/messages', 'POST', {
        childId: child?.id, audience: to === 'office' ? 'office' : 'teacher', staffId: to === 'office' ? null : to, topic, subject: subject || TOPIC_LABEL[topic], body,
      });
      onDone(r.threadId);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="card pa-compose">
      <div className="pa-thread-hd">
        <button className="btn sm pa-back" onClick={onCancel} aria-label="Back"><ArrowLeft size={14} weight="bold" /></button>
        <h3>New message</h3>
      </div>
      <div className="pa-form">
        {view.children.length > 1 && (
          <label><span className="lbl">ABOUT</span>
            <select className="tin" value={childId} onChange={e => { setChildId(e.target.value); setTo('office'); }}>
              {view.children.map(c => <option key={c.id} value={c.id}>{c.name} · {c.cls}</option>)}
            </select>
          </label>
        )}
        <label><span className="lbl">TO</span>
          <select className="tin" value={validTo ? to : 'office'} onChange={e => setTo(e.target.value)}>
            {child?.teachers.map(t => <option key={t.id} value={t.id}>{t.name}{t.classTeacher ? ' (class teacher)' : ''}{t.subjects.length ? ` · ${t.subjects.join(', ')}` : ''}</option>)}
            <option value="office">School office (fees, admissions, leave, anything else)</option>
          </select>
        </label>
        <label><span className="lbl">TOPIC</span>
          <div className="pa-topics">
            {TOPICS.map(t => <button key={t} type="button" className={`fchip${topic === t ? ' on' : ''}`} onClick={() => setTopic(t)}>{TOPIC_LABEL[t]}</button>)}
          </div>
        </label>
        <label><span className="lbl">SUBJECT</span><input className="tin" value={subject} onChange={e => setSubject(e.target.value)} placeholder={TOPIC_LABEL[topic]} maxLength={160} /></label>
        <label><span className="lbl">MESSAGE</span><textarea className="qta" value={body} onChange={e => setBody(e.target.value)} maxLength={4000} placeholder="Be specific: what happened, and what you'd like from the school." /></label>
      </div>
      {err && <div className="note err">{err}</div>}
      <div className="pa-draft-ft">
        <span className="muted">The {to === 'office' ? 'school office' : 'teacher'} is notified in Sthara.</span>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={busy || !body.trim() || !child} onClick={() => void submit()}><PaperPlaneRight size={15} weight="fill" /> {busy ? 'Sending' : 'Send'}</button>
      </div>
    </div>
  );
}
