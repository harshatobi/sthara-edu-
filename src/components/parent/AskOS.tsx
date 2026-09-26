'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatsCircleIcon as ChatsCircle } from '@phosphor-icons/react/dist/ssr/ChatsCircle';
import { PaperPlaneRightIcon as PaperPlaneRight } from '@phosphor-icons/react/dist/ssr/PaperPlaneRight';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { EnvelopeSimpleIcon as EnvelopeSimple } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { WhatsappLogoIcon as WhatsappLogo } from '@phosphor-icons/react/dist/ssr/WhatsappLogo';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { PageBar, Skeleton } from '@/components/canon/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useFamily } from '@/lib/parent/useFamily';
import { PAGES, TOPIC_LABEL, type AskAction, type AskReply, type AskTurn, type Topic } from '@/lib/parent/ask';
import type { FamilyView } from '@/lib/parent/family';
import { FamilyGate, TONE_COLOR } from './common';

interface Thread { id: string; title: string; turns: AskTurn[]; at: number }
const MAX_THREADS = 20;
const titleOf = (t: string) => (t.length > 46 ? `${t.slice(0, 45).trimEnd()}…` : t) || 'New conversation';
const newId = () => Math.random().toString(36).slice(2, 10);

function useThreads(uid: string | undefined) {
  const key = uid ? `sthara.parent.ask.${uid}` : null;
  const [threads, setThreads] = useState<Thread[]>(() => {
    if (!key) return [];
    try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const save = useCallback((next: Thread[]) => {
    setThreads(next);
    if (key) try { localStorage.setItem(key, JSON.stringify(next.slice(0, MAX_THREADS))); } catch { /* full or private */ }
  }, [key]);
  return { threads, save, activeId, setActiveId };
}

export default function AskOS() {
  return (
    <FamilyGate skeleton={<><Skeleton h={86} style={{ borderRadius: 20, marginBottom: 22 }} /><Skeleton h={520} style={{ borderRadius: 20 }} /></>}>
      {({ view }) => <AskWorkspace view={view} />}
    </FamilyGate>
  );
}

function AskWorkspace({ view }: { view: FamilyView }) {
  const { profile } = useAuth();
  const { findings, call, reload } = useFamily();
  const { threads, save, activeId, setActiveId } = useThreads(profile?.uid);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const streamEnd = useRef<HTMLDivElement>(null);
  const params = useSearchParams();
  const seeded = useRef(false);

  const active = threads.find(t => t.id === activeId) ?? null;
  const turns = active?.turns ?? [];

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setErr(null);
    setBusy(true);
    setDraft('');
    const base: Thread = active ?? { id: newId(), title: titleOf(q), turns: [], at: Date.now() };
    const withQ: Thread = { ...base, turns: [...base.turns, { role: 'parent', text: q, at: Date.now() }], at: Date.now() };
    const rest = threads.filter(t => t.id !== base.id);
    save([withQ, ...rest]);
    setActiveId(withQ.id);
    try {
      const { reply } = await call<{ reply: AskReply }>('/api/parent/ask', 'POST', {
        messages: withQ.turns.map(t => ({ role: t.role, text: t.text })),
      });
      const answer: AskTurn = { role: 'os', text: reply.say || reply.ask.map(a => a.question).join(' '), reply, at: Date.now() };
      save([{ ...withQ, turns: [...withQ.turns, answer] }, ...rest]);
    } catch (e: any) {
      // Drop the unanswered question so "try again" resends it cleanly.
      save([{ ...withQ, turns: base.turns }, ...rest].filter(t => t.turns.length));
      if (!base.turns.length) setActiveId(null);
      setDraft(q);
      setErr(e?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, [active, busy, call, save, setActiveId, threads]);

  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; }, [send]);

  // A question handed over from Home or a Probe card (?q=…) is asked once, in a fresh thread.
  useEffect(() => {
    const q = params.get('q');
    if (!q || seeded.current || !profile?.uid) return;
    seeded.current = true;
    setActiveId(null);
    window.history.replaceState(null, '', '/parent/ask');
    // Next tick, so `active` is the new (empty) thread.
    setTimeout(() => void sendRef.current(q), 0);
  }, [params, profile?.uid, setActiveId]);


  useEffect(() => { streamEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns.length, busy]);

  const kids = view.children;
  const starters = useMemo(() => {
    const top = findings.slice(0, 3).map(f => f.ask);
    const k = kids[0]?.firstName ?? 'my child';
    return [...new Set([...top, `How is ${k} doing this week?`, `What homework is due?`, `How can I help ${k} at home?`, 'Are any fees due?'])].slice(0, 5);
  }, [findings, kids]);

  return (
    <>
      <PageBar eyebrow="ASK THE SCHOOL OS" title="Ask anything about your child"
        sub="Answers come from the school's own records: schoolwork, mastery, wellbeing you've consented to, fees and messages. Ask in any language."
        actions={<button className="btn" onClick={() => { setActiveId(null); setErr(null); }}><Plus size={16} weight="bold" /> New conversation</button>} />
      <div className="cp-grid">
        <div className="card cp-chat" style={{ padding: 0 }}>
          <div className="cp-ctx">
            <ShieldCheck size={15} weight="duotone" color="#10B981" />
            <span>Sees only {kids.map(k => k.firstName).join(' and ')}&apos;s records. Names never leave Sthara&apos;s servers.</span>
          </div>
          <div className="cp-stream" aria-live="polite">
            {!turns.length && !busy && (
              <div className="pa-intro">
                <div className="pa-intro-mark" aria-hidden="true"><ChatsCircle size={30} weight="duotone" /></div>
                <h2>What would you like to know?</h2>
                <p className="muted">I can explain a mark, show what&apos;s due, suggest 15-minute help at home, check fees, and write to a teacher for you. I&apos;ll ask if I need more detail, and point out anything you should know.</p>
                <div className="pa-starters light">
                  {starters.map(s => <button key={s} type="button" onClick={() => void send(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {turns.map((t, i) => t.role === 'parent'
              ? <div key={i} className="cp-me">{t.text}</div>
              : <OsTurn key={i} turn={t} last={i === turns.length - 1} onAsk={send} view={view} onSent={reload} />)}
            {busy && (
              <div className="cp-ai" aria-label="The School OS is reading the records">
                <div className="cp-av"><Sparkle size={18} weight="fill" /></div>
                <div className="cp-body">
                  <div className="cp-say" style={{ display: 'grid', gap: 8 }}>
                    <span className="muted">Reading the school&apos;s records…</span>
                    <Skeleton h={12} w="92%" /><Skeleton h={12} w="78%" /><Skeleton h={12} w="54%" />
                  </div>
                </div>
              </div>
            )}
            {err && <div className="note err" role="alert"><Warning size={15} weight="bold" /> {err} <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => void send(draft)}>Try again</button></div>}
            <div ref={streamEnd} />
          </div>
          <form className="cp-input" onSubmit={e => { e.preventDefault(); void send(draft); }}>
            <label htmlFor="ask-in" className="sr-only">Your question</label>
            <textarea id="ask-in" rows={1} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask about marks, homework, wellbeing, fees, or say what you want to tell the school…"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); } }} disabled={busy} />
            <button className="btn pri" type="submit" disabled={busy || !draft.trim()} aria-label="Send"><PaperPlaneRight size={17} weight="fill" /></button>
          </form>
        </div>

        <div className="cp-rail">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="pa-card-hd"><div><h3><Sparkle size={17} weight="duotone" color="#7C5CFC" /> Probe</h3><p className="muted">Noticed before you asked. Tap to ask.</p></div></div>
            {findings.length ? findings.slice(0, 6).map(f => {
              const kid = kids.find(k => k.id === f.childId);
              return (
                <button key={f.id} className="probe-item" onClick={() => void send(f.ask)} disabled={busy}>
                  <span className="probe-sev" style={{ background: TONE_COLOR[f.tone] }} aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b className="pa-trunc" style={{ display: 'block', fontSize: 13.5 }}>{f.title}</b>
                    <span className="muted">{kids.length > 1 && kid ? `${kid.firstName} · ` : ''}{f.ask}</span>
                  </span>
                  <ArrowRight size={14} color="#9AA6B8" />
                </button>
              );
            }) : <p className="muted" style={{ padding: '6px 18px 18px' }}>Nothing flagged right now.</p>}
          </div>

          <div className="card pa-wa-card">
            <h3><WhatsappLogo size={18} weight="fill" color="#25D366" /> Ask on WhatsApp too</h3>
            {view.whatsapp.linked ? (
              <p className="muted">Linked to {view.whatsapp.phone}. Message {view.whatsapp.businessNumber ?? 'the school number'} with any question and get the same answers.
                {view.whatsapp.mode === 'simulated' && <><br /><b>Test mode:</b> WhatsApp isn&apos;t connected yet, so messages are logged, not delivered.</>}</p>
            ) : (
              <p className="muted">Link your number to get grades, alerts and teacher replies on WhatsApp, and to ask the School OS from there.</p>
            )}
            <Link className="btn sm" href="/parent/settings#whatsapp">{view.whatsapp.linked ? 'WhatsApp settings' : 'Link WhatsApp'}</Link>
          </div>

          {threads.length > 0 && (
            <div className="card" style={{ padding: '16px 0 8px' }}>
              <h3 style={{ padding: '0 18px 8px', fontSize: 14 }}>Earlier conversations</h3>
              {threads.slice(0, 8).map(t => (
                <button key={t.id} className={`pa-thread-btn${t.id === activeId ? ' on' : ''}`} onClick={() => { setActiveId(t.id); setErr(null); }}>
                  <span className="pa-trunc">{t.title}</span>
                  <i>{new Date(t.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</i>
                </button>
              ))}
              <button className="pa-thread-btn danger" onClick={() => { save([]); setActiveId(null); }}>Clear history on this device</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function OsTurn({ turn, last, onAsk, view, onSent }: { turn: AskTurn; last: boolean; onAsk: (t: string) => void; view: FamilyView; onSent: () => void }) {
  const r = turn.reply;
  return (
    <div className="cp-ai">
      <div className="cp-av"><Sparkle size={18} weight="fill" /></div>
      <div className="cp-body">
        {r?.say && <div className="cp-say md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{r.say}</ReactMarkdown></div>}
        {!!r?.facts.length && (
          <div className="pa-facts">
            {r.facts.map((f, i) => <div key={i} style={{ ['--t' as string]: TONE_COLOR[f.tone] }}><span>{f.label}</span><b>{f.value}</b></div>)}
          </div>
        )}
        {!!r?.ask.length && (
          <div className="cp-ask">
            {r.ask.map(q => (
              <div key={q.id}>
                <div className="q">{q.question}</div>
                <div className="pa-opts">{q.options.map(o => <button key={o} type="button" className="opt" disabled={!last} onClick={() => onAsk(o)}>{o}</button>)}</div>
              </div>
            ))}
          </div>
        )}
        {r?.actions.map((a, i) => a.kind === 'message'
          ? <MessageDraft key={i} action={a} view={view} onSent={onSent} />
          : <Link key={i} href={PAGES[a.page]} className="btn sm" style={{ alignSelf: 'flex-start' }}>{a.label} <ArrowRight size={13} weight="bold" /></Link>)}
        {last && !!r?.suggestions.length && (
          <div className="pa-starters light compact">
            {r.suggestions.map(s => <button key={s} type="button" onClick={() => onAsk(s)}>{s}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** A message the School OS drafted: the parent edits and confirms; nothing is sent before that. */
function MessageDraft({ action, view, onSent }: { action: Extract<AskAction, { kind: 'message' }>; view: FamilyView; onSent: () => void }) {
  const { call } = useFamily();
  const [subject, setSubject] = useState(action.subject);
  const [body, setBody] = useState(action.draft);
  const [childId, setChildId] = useState(action.childId ?? view.children[0]?.id ?? '');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'dismissed'>('idle');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (state === 'dismissed') return null;
  const child = view.children.find(c => c.id === childId);
  const submit = async () => {
    setState('sending'); setErr(null);
    try {
      const r = await call<{ threadId: string }>('/api/parent/messages', 'POST', {
        childId, audience: action.audience, staffId: action.to, topic: action.topic, subject, body,
      });
      setThreadId(r.threadId); setState('sent'); onSent();
    } catch (e: any) { setErr(e?.message || 'Could not send.'); setState('idle'); }
  };
  if (state === 'sent') {
    return (
      <div className="pa-draft sent">
        <CheckCircle size={20} weight="fill" color="#10B981" />
        <div style={{ flex: 1 }}><b>Sent to {action.toName}</b><div className="muted">Their reply will appear in Messages{view.whatsapp.linked ? ' and on WhatsApp' : ''}.</div></div>
        <Link className="btn sm" href={`/parent/messages?thread=${threadId}`}>Open</Link>
      </div>
    );
  }
  return (
    <div className="pa-draft">
      <div className="pa-draft-hd">
        <EnvelopeSimple size={17} weight="duotone" color="#0EA5E9" />
        <b>Draft to {action.toName}</b>
        <span className="ch b xs">{TOPIC_LABEL[action.topic as Topic] ?? 'General'}</span>
        {view.children.length > 1 && (
          <select value={childId} onChange={e => setChildId(e.target.value)} aria-label="About which child" className="pa-sel">
            {view.children.map(c => <option key={c.id} value={c.id}>About {c.firstName}</option>)}
          </select>
        )}
      </div>
      <input className="tin" value={subject} onChange={e => setSubject(e.target.value)} aria-label="Subject" maxLength={160} />
      <textarea className="qta" value={body} onChange={e => setBody(e.target.value)} aria-label="Message" rows={4} style={{ minHeight: 96 }} maxLength={4000} />
      {err && <div className="note err">{err}</div>}
      <div className="pa-draft-ft">
        <span className="muted">Nothing is sent until you press Send{child ? `. About ${child.firstName}.` : '.'}</span>
        <button className="btn sm" onClick={() => setState('dismissed')}>Not now</button>
        <button className="btn sm pri" disabled={state === 'sending' || !body.trim() || !childId} onClick={() => void submit()}>
          <PaperPlaneRight size={13} weight="fill" /> {state === 'sending' ? 'Sending' : 'Send'}
        </button>
      </div>
    </div>
  );
}
