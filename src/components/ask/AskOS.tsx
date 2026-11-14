'use client';

/**
 * Ask the School OS (revamp of 2026-11-13), one page for teachers, every office
 * role and parents. Fills the screen: saved conversations on the left, the
 * conversation in the middle (opening on today's cards and what the School OS
 * noticed), trends and findings on the right. Answers carry the live lookups
 * that ran, numbered sources, tables and charts, and drafted actions that wait
 * for the person to confirm.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { PaperPlaneRightIcon as Send } from '@phosphor-icons/react/dist/ssr/PaperPlaneRight';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { ShieldCheckIcon as Shield } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { WhatsappLogoIcon as WhatsappLogo } from '@phosphor-icons/react/dist/ssr/WhatsappLogo';
import { MagnifyingGlassIcon as Search } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass';
import { PushPinIcon as Pin } from '@phosphor-icons/react/dist/ssr/PushPin';
import { ShareNetworkIcon as Share } from '@phosphor-icons/react/dist/ssr/ShareNetwork';
import { FilePdfIcon as FilePdf } from '@phosphor-icons/react/dist/ssr/FilePdf';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { ArrowUpRightIcon as ArrowUpRight } from '@phosphor-icons/react/dist/ssr/ArrowUpRight';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { ClockIcon as Clock } from '@phosphor-icons/react/dist/ssr/Clock';
import { EnvelopeSimpleIcon as Envelope } from '@phosphor-icons/react/dist/ssr/EnvelopeSimple';
import { ChartLineUpIcon as ChartLine } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { CurrencyInrIcon as Rupee } from '@phosphor-icons/react/dist/ssr/CurrencyInr';
import { UsersThreeIcon as Users } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { CalendarBlankIcon as Calendar } from '@phosphor-icons/react/dist/ssr/CalendarBlank';
import { ListIcon as ListIco } from '@phosphor-icons/react/dist/ssr/List';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { EyeSlashIcon as EyeSlash } from '@phosphor-icons/react/dist/ssr/EyeSlash';
import { AiTag, PageBar, Skeleton } from '@/components/canon/ui';
import PrintFoot from '@/components/ui/PrintFoot';
import WhatsAppCard from '@/components/staff/WhatsAppLink';
import { useAuth } from '@/contexts/AuthContext';
import type { AskAction, AskReply, Tone, TodayTile } from '@/lib/ask/protocol';
import type { Glance, Insight, TodayPayload } from '@/lib/ask/today';

type Audience = 'teacher' | 'office' | 'parent';
interface Conv { id: string; title: string; pinned: boolean; lastAt: string }
interface TurnV { id: string; role: 'me' | 'os'; text: string; reply: AskReply | null; at: string }
interface Shared { id: string; turnId: string; from: string; note: string | null; at: string; seen: boolean; question: string; reply: AskReply; hidden: boolean }
interface Colleague { id: string; name: string; role: string }

const TONE: Record<Tone, string> = { g: '#0E8A61', a: '#B45309', r: '#E11D48', b: '#2F6BFF', n: '#5F6B7D' };
const ICON: Record<TodayTile['icon'], ReactNode> = {
  warn: <Warning size={15} weight="bold" />, clock: <Clock size={15} weight="bold" />, mail: <Envelope size={15} weight="bold" />, chart: <ChartLine size={15} weight="bold" />,
  check: <CheckCircle size={15} weight="bold" />, money: <Rupee size={15} weight="bold" />, people: <Users size={15} weight="bold" />, calendar: <Calendar size={15} weight="bold" />,
};
const TITLE: Record<Audience, string> = { teacher: 'Ask anything about your classes', office: 'Ask anything about the school', parent: 'Ask the school' };
const PH: Record<Audience, string> = {
  teacher: 'Ask about your classes…',
  office: 'Ask about the school…',
  parent: 'Ask about your child…',
};

function useApi() {
  const { getAuthToken } = useAuth();
  return useCallback(async <T,>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: unknown): Promise<T> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.error || 'Something went wrong. Try again.'), { data });
    return data as T;
  }, [getAuthToken]);
}

const when = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `Today, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function AskOS({ audience }: { audience: Audience }) {
  const api = useApi();
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [todayErr, setTodayErr] = useState<string | null>(null);
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [q, setQ] = useState('');
  const [shared, setShared] = useState<Shared[]>([]);
  const [people, setPeople] = useState<Colleague[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnV[]>([]);
  const [openShared, setOpenShared] = useState<Shared | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ left: number; limit: number } | null>(null);
  const [sharing, setSharing] = useState<TurnV | null>(null);
  const [wa, setWa] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<'one' | 'all' | null>(null);
  const streamEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const staff = audience !== 'parent';
  const active = convs?.find(c => c.id === activeId) ?? null;

  const loadToday = useCallback(() => {
    api<TodayPayload>('/api/ask/today').then(t => { setToday(t); setQuota(t.quota); setTodayErr(null); }).catch(e => setTodayErr(e.message));
  }, [api]);
  const loadConvs = useCallback((term = '') => {
    api<{ conversations: Conv[] }>(`/api/ask/conversations${term ? `?q=${encodeURIComponent(term)}` : ''}`).then(r => setConvs(r.conversations)).catch(() => setConvs([]));
  }, [api]);
  const loadShared = useCallback((seen = false) => {
    if (!staff) return;
    api<{ shared: Shared[]; colleagues: Colleague[] }>(`/api/ask/share${seen ? '?seen=1' : ''}`).then(r => { setShared(r.shared); setPeople(r.colleagues); }).catch(() => {});
  }, [api, staff]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => { if (!alive) return; loadToday(); loadConvs(); loadShared(); });
    return () => { alive = false; };
  }, [loadToday, loadConvs, loadShared]);
  useEffect(() => {
    const t = setTimeout(() => loadConvs(q.trim()), q ? 280 : 0);
    return () => clearTimeout(t);
  }, [q, loadConvs]);
  // Follow the conversation as it grows; the opening screen stays at the top.
  useEffect(() => { if (turns.length || busy) streamEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns.length, busy]);

  const openConv = async (id: string) => {
    setActiveId(id); setOpenShared(null); setErr(null); setLoadingConv(true); setHistOpen(false);
    try { const r = await api<{ turns: TurnV[] }>(`/api/ask/conversations?id=${id}`); setTurns(r.turns); }
    catch (e: any) { setErr(e.message); setTurns([]); }
    finally { setLoadingConv(false); }
  };
  const newConv = () => { setActiveId(null); setTurns([]); setOpenShared(null); setErr(null); setHistOpen(false); inputRef.current?.focus(); };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setErr(null); setBusy(true); setDraft(''); setOpenShared(null);
    const temp: TurnV = { id: `tmp-${Date.now()}`, role: 'me', text: t, reply: null, at: new Date().toISOString() };
    setTurns(prev => (activeId ? [...prev, temp] : [temp]));
    try {
      const r = await api<{ conversationId: string; questionId: string; answerId: string; reply: AskReply; quota: { left: number; limit: number } | null }>('/api/ask', 'POST', { conversationId: activeId, text: t });
      setTurns(prev => [...prev.filter(x => x.id !== temp.id), { ...temp, id: r.questionId }, { id: r.answerId, role: 'os', text: r.reply.say, reply: r.reply, at: new Date().toISOString() }]);
      if (r.quota) setQuota(r.quota);
      if (!activeId) setActiveId(r.conversationId);
      loadConvs(q.trim());
    } catch (e: any) {
      setTurns(prev => prev.filter(x => x.id !== temp.id));
      setDraft(t);
      setErr(e.message);
      if (e?.data?.quota) setQuota(e.data.quota);
    } finally { setBusy(false); }
  };

  // A question handed over from another page (?q=…) is asked once, in a new conversation.
  const { profile } = useAuth();
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  const seeded = useRef(false);
  useEffect(() => {
    const q0 = new URLSearchParams(window.location.search).get('q');
    if (!q0 || seeded.current || !profile?.uid) return;
    seeded.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    setTimeout(() => void sendRef.current(q0.slice(0, 3000)), 0);
  }, [profile?.uid]);

  const togglePin = async () => {
    if (!active) return;
    await api('/api/ask/conversations', 'PATCH', { id: active.id, pinned: !active.pinned }).catch(() => {});
    loadConvs(q.trim());
  };
  const remove = async (all: boolean) => {
    setConfirmDel(null);
    if (all) await api('/api/ask/conversations?all=1', 'DELETE').catch(() => {});
    else if (active) await api(`/api/ask/conversations?id=${active.id}`, 'DELETE').catch(() => {});
    newConv(); loadConvs(q.trim());
  };

  const pinned = (convs || []).filter(c => c.pinned);
  const recent = (convs || []).filter(c => !c.pinned);
  const unseen = shared.filter(s => !s.seen).length;
  const empty = !activeId && !openShared && !turns.length && !busy;
  const outOfQuestions = !!quota && quota.left === 0;

  const history = (
    <aside className={`ask-hist card${histOpen ? ' open' : ''}`} aria-label="Your conversations">
      <div className="ask-hist-top">
        <label className="ask-search"><Search size={15} /><span className="sr-only">Search conversations</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search conversations" /></label>
        <button className="ask-x" onClick={() => setHistOpen(false)} aria-label="Close"><X size={16} /></button>
      </div>
      <div className="ask-hist-list">
        {staff && shared.length > 0 && !q && (
          <>
            <h4>SHARED WITH YOU {unseen > 0 && <span className="ask-badge">{unseen} new</span>}</h4>
            {shared.slice(0, 6).map(s => (
              <button key={s.id} className={`ask-hrow${openShared?.id === s.id ? ' on' : ''}`} onClick={() => { setOpenShared(s); setActiveId(null); setTurns([]); setHistOpen(false); if (!s.seen) loadShared(true); }}>
                <b>{s.question || 'An answer'}</b><span>{s.from} · {when(s.at)}{!s.seen ? ' · new' : ''}</span>
              </button>
            ))}
          </>
        )}
        {convs === null ? <div style={{ padding: '8px 16px', display: 'grid', gap: 8 }}><Skeleton h={34} /><Skeleton h={34} /><Skeleton h={34} /></div> : (
          <>
            {!q && <h4>PINNED</h4>}
            {!q && !pinned.length && <p className="ask-hint">Pin a conversation to keep it here.</p>}
            {pinned.map(c => <HistRow key={c.id} c={c} on={c.id === activeId} onOpen={() => void openConv(c.id)} />)}
            <h4>{q ? 'MATCHING' : 'RECENT'}</h4>
            {!recent.length && <p className="ask-hint">{q ? 'Nothing matches.' : 'Your questions and answers will be saved here.'}</p>}
            {recent.map(c => <HistRow key={c.id} c={c} on={c.id === activeId} onOpen={() => void openConv(c.id)} />)}
          </>
        )}
      </div>
      <div className="ask-hist-foot">
        <p>Saved to your account on every device. Kept until you delete it.</p>
        {confirmDel === 'all'
          ? <div className="ask-confirm"><span>Delete every conversation? This can’t be undone.</span><button className="btn sm" onClick={() => setConfirmDel(null)}>Keep</button><button className="btn sm danger" onClick={() => void remove(true)}>Delete all</button></div>
          : (convs?.length ? <button className="ask-link-danger" onClick={() => setConfirmDel('all')}>Delete all conversations</button> : null)}
      </div>
    </aside>
  );

  return (
    <>
      <PrintFoot />
      <PageBar eyebrow="ASK THE SCHOOL OS" title={TITLE[audience]}
        sub={today ? `${today.greeting} · ${today.scope}` : 'Answers only from the records you can see'}
        actions={<>
          {staff
            ? <button className="ask-chip" onClick={() => setWa(true)}><WhatsappLogo size={15} weight="fill" color="#1DA851" />Also on WhatsApp</button>
            : <Link className="ask-chip" href="/parent/settings#whatsapp"><WhatsappLogo size={15} weight="fill" color="#1DA851" />Also on WhatsApp</Link>}
          <button className="btn ask-hist-btn" onClick={() => setHistOpen(true)}><ListIco size={16} weight="bold" />History</button>
          <button className="btn pri" onClick={newConv}><Plus size={16} weight="bold" />New conversation</button>
        </>} />

      <div className="ask-os">
        {history}
        {histOpen && <div className="ask-scrim" onClick={() => setHistOpen(false)} />}

        <section className="ask-main">
          {!empty && <TodayStrip today={today} err={todayErr} compact onAsk={send} busy={busy || outOfQuestions} />}

          <div className="card ask-chat">
            <div className="ask-chat-h">
              <span className="t">{openShared ? `Shared by ${openShared.from}` : active?.title ?? 'New conversation'}</span>
              <span className="ask-scope"><Shield size={14} weight="duotone" />{today?.scope ?? (audience === 'parent' ? 'Your children only' : 'What your role can see')}</span>
              {active && !openShared && (
                <div className="r no-print">
                  <button className={`btn sm${active.pinned ? ' on' : ''}`} onClick={() => void togglePin()} aria-pressed={active.pinned}><Pin size={14} weight={active.pinned ? 'fill' : 'bold'} /><span className="lbl">{active.pinned ? 'Pinned' : 'Pin'}</span></button>
                  <button className="btn sm" onClick={() => window.print()} aria-label="Save PDF" title="Save PDF"><FilePdf size={14} weight="bold" /><span className="lbl">Save PDF</span></button>
                  {confirmDel === 'one'
                    ? <span className="ask-confirm"><span>Delete this conversation?</span><button className="btn sm" onClick={() => setConfirmDel(null)}>Keep</button><button className="btn sm danger" onClick={() => void remove(false)}>Delete</button></span>
                    : <button className="btn sm" onClick={() => setConfirmDel('one')} aria-label="Delete conversation" title="Delete conversation"><Trash size={14} weight="bold" /></button>}
                </div>
              )}
            </div>

            <div className="ask-stream" aria-live="polite">
              {openShared ? (
                <div className="ask-shared">
                  {openShared.note && <div className="ask-note">“{openShared.note}” · {openShared.from}</div>}
                  {openShared.question && <div className="ask-me">{openShared.question}</div>}
                  {openShared.hidden && <div className="ask-hidden"><EyeSlash size={16} weight="bold" />Some of this answer uses records your role can’t see, so it is hidden.</div>}
                  <Answer id={openShared.turnId} reply={openShared.reply} last={false} onAsk={send} staff={staff} kids={today?.children} />
                </div>
              ) : empty ? (
<>
                  <TodayStrip today={today} err={todayErr} compact={false} inline onAsk={send} busy={busy || outOfQuestions} />
                  <Welcome audience={audience} today={today} onAsk={send} disabled={outOfQuestions} />
                </>
              ) : loadingConv ? (
                <div style={{ display: 'grid', gap: 12 }}><Skeleton h={40} w="60%" style={{ justifySelf: 'end' }} /><Skeleton h={140} /><Skeleton h={40} w="50%" style={{ justifySelf: 'end' }} /><Skeleton h={120} /></div>
              ) : turns.map((t, i) => t.role === 'me'
                ? <div key={t.id} className="ask-me">{t.text}</div>
                : <Answer key={t.id} id={t.id} reply={t.reply} last={i === turns.length - 1 && !busy} onAsk={send} staff={staff} kids={today?.children}
                  onShare={staff && !t.id.startsWith('tmp-') ? () => setSharing(t) : undefined} />)}
              {busy && (
                <div className="ask-os-turn" aria-label="The School OS is reading the records">
                  <div className="ask-av"><Sparkle size={17} weight="fill" /></div>
                  <div className="ask-body"><span className="muted">Reading the records{audience === 'parent' ? '' : ' your role can see'}…</span><Skeleton h={12} w="90%" /><Skeleton h={12} w="72%" /><Skeleton h={90} /></div>
                </div>
              )}
              {err && <div className="note err" role="alert"><Warning size={15} weight="bold" /> {err} {!outOfQuestions && draft && <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => void send(draft)}>Try again</button>}</div>}
              <div ref={streamEnd} />
            </div>

            <form className="ask-composer no-print" onSubmit={e => { e.preventDefault(); void send(draft); }}>
              <div className="ask-cin">
                <label htmlFor="ask-in" className="sr-only">Your question</label>
                <textarea id="ask-in" ref={inputRef} rows={1} value={draft} disabled={busy || outOfQuestions}
                  onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`; }}
                  placeholder={outOfQuestions ? 'You’ve used today’s questions. Ask again tomorrow.' : PH[audience]}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); } }} />
                <button className="ask-send" type="submit" disabled={busy || !draft.trim() || outOfQuestions} aria-label="Send"><Send size={17} weight="fill" /><AiTag /></button>
              </div>
              <div className="ask-cmeta">
                <span className="priv" title={`Names never leave Sthara’s servers.${audience !== 'office' ? ' Wellness journals stay private.' : ''}`}><Shield size={13} weight="bold" />Names never leave Sthara’s servers</span>
                {quota && <span className="ask-quota">{quota.left} of {quota.limit} left today<i><b style={{ width: `${(quota.left / quota.limit) * 100}%` }} /></i></span>}
              </div>
            </form>
          </div>
        </section>

        <aside className="ask-rail" aria-label="At a glance">
          <GlancePanel today={today} />
          {!empty && <InsightList items={today?.insights || []} onAsk={send} disabled={busy || outOfQuestions} />}
        </aside>
      </div>

      {sharing && <ShareDialog turn={sharing} people={people} onClose={() => setSharing(null)} />}
      {wa && (
        <div className="ask-modal" role="dialog" aria-modal="true" aria-label="WhatsApp" onClick={e => { if (e.target === e.currentTarget) setWa(false); }}>
          <div className="ask-modal-box">
            <button className="ask-x" onClick={() => setWa(false)} aria-label="Close"><X size={18} /></button>
            <WhatsAppCard role={audience === 'teacher' ? 'teacher' : 'leadership'} />
          </div>
        </div>
      )}
    </>
  );
}

function HistRow({ c, on, onOpen }: { c: Conv; on: boolean; onOpen: () => void }) {
  return <button className={`ask-hrow${on ? ' on' : ''}`} onClick={onOpen} aria-current={on || undefined}><b>{c.title}</b><span>{when(c.lastAt)}</span></button>;
}

// ── Today ────────────────────────────────────────────────────────────────────
function TodayStrip({ today, err, compact, inline, onAsk, busy }: { today: TodayPayload | null; err: string | null; compact: boolean; inline?: boolean; onAsk: (t: string) => void; busy: boolean }) {
  if (err) return null;
  return (
    <section className={`${inline ? 'ask-today inline' : 'card ask-today'}${compact ? ' compact' : ''}`} aria-label="Today for you">
      {!compact && <div className="ask-today-h"><h2>Today for you</h2><span>Built from the records, no AI used</span></div>}
      <div className="ask-tiles">
        {!today ? [0, 1, 2, 3].map(i => <Skeleton key={i} h={compact ? 52 : 118} />) : today.tiles.length ? today.tiles.map(t => (
          <div key={t.key} className="ask-tile">
            <div className="k" style={{ color: TONE[t.tone] }}>{ICON[t.icon]}{t.label}</div>
            <div className="v">{t.value}</div>
            {!compact && <div className="d">{t.detail}</div>}
            <div className="a">
              <button className="ask" disabled={busy} onClick={() => onAsk(t.ask)}><Sparkle size={12} weight="fill" />Ask about this</button>
              {t.href && <Link href={t.href}>Open</Link>}
            </div>
          </div>
        )) : <p className="ask-hint" style={{ padding: 0 }}>Nothing needs you right now.</p>}
      </div>
    </section>
  );
}

function Welcome({ audience, today, onAsk, disabled }: { audience: Audience; today: TodayPayload | null; onAsk: (t: string) => void; disabled: boolean }) {
  return (
    <div className="ask-welcome">
      <div className="ask-os-turn">
        <div className="ask-av"><Sparkle size={17} weight="fill" /></div>
        <div className="ask-body">
          <p className="ask-say">{audience === 'teacher'
            ? 'Ask what needs you, who is behind, why a student is slipping, or what to say to a parent. I look up the records you can see, then answer with sources.'
            : audience === 'office'
              ? 'Ask where things are slipping and why, about a class, a student, a teacher, or the numbers your role covers. I look up the records, then answer with sources.'
              : 'Ask how your child is doing, what is due, why a mark changed, or how to help at home. I look up your child’s records, then answer with sources.'}</p>
          <div className="ask-sugg">{(today?.starters || []).map(s => <button key={s} disabled={disabled} onClick={() => onAsk(s)}>{s}</button>)}</div>
        </div>
      </div>
      <InsightList items={today?.insights || []} onAsk={onAsk} disabled={disabled} grid loading={!today} />
      <div className="ask-glance-inline"><GlancePanel today={today} inline /></div>
    </div>
  );
}

function InsightList({ items, onAsk, disabled, grid, loading }: { items: Insight[]; onAsk: (t: string) => void; disabled: boolean; grid?: boolean; loading?: boolean }) {
  if (!loading && !items.length) return null;
  return (
    <section className={grid ? 'ask-worth grid' : 'card ask-worth'} aria-label="Worth a look">
      <h3>Worth a look</h3>
      <div className="ask-worth-list">
        {loading ? [0, 1].map(i => <Skeleton key={i} h={96} />) : items.map(f => (
          <div key={f.key} className="ask-insight" style={{ borderLeftColor: TONE[f.tone] }}>
            <b>{f.title}</b>
            <p>{f.detail}</p>
            <div className="a">
              <button disabled={disabled} onClick={() => onAsk(f.ask)}><Sparkle size={12} weight="fill" />Ask why</button>
              {f.href && <Link href={f.href}>Open <ArrowUpRight size={12} weight="bold" /></Link>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GlancePanel({ today, inline }: { today: TodayPayload | null; inline?: boolean }) {
  if (today && !today.glance.length) return null;
  return (
    <section className={inline ? 'ask-glance' : 'card ask-glance'} aria-label="This week at a glance">
      <h3>At a glance</h3>
      {!today ? [0, 1, 2].map(i => <Skeleton key={i} h={64} style={{ marginBottom: 10 }} />) : today.glance.map(g => <GlanceRow key={g.key} g={g} />)}
    </section>
  );
}

function GlanceRow({ g }: { g: Glance }) {
  const body = (
    <>
      <div className="gl-top"><span>{g.label}</span><b style={{ color: TONE[g.tone] }}>{g.value}</b></div>
      <Spark values={g.series} labels={g.seriesLabels} unit={g.unit} tone={g.tone} />
      <div className="gl-hint">{g.hint}</div>
    </>
  );
  return g.href ? <Link className="ask-gl" href={g.href}>{body}</Link> : <div className="ask-gl">{body}</div>;
}

function Spark({ values, labels, unit, tone }: { values: number[]; labels: string[]; unit: string; tone: Tone }) {
  if (values.length < 2) return <div className="gl-none">Not enough history yet</div>;
  const w = 240, h = 44, max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 8)] as const);
  const fmt = (v: number) => (unit === '₹' ? `₹${v >= 1e5 ? `${(v / 1e5).toFixed(1)} L` : v.toLocaleString('en-IN')}` : `${v}${unit}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="gl-spark" role="img" aria-label={values.map((v, i) => `${labels[i] ?? ''} ${fmt(v)}`).join(', ')} preserveAspectRatio="none">
      <polyline fill="none" stroke={TONE[tone]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts.map(p => p.join(',')).join(' ')} vectorEffect="non-scaling-stroke" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={TONE[tone]} />
      {pts.map((p, i) => <title key={i}>{`${labels[i] ?? ''}: ${fmt(values[i])}`}</title>)}
    </svg>
  );
}

// ── An answer ────────────────────────────────────────────────────────────────
/** [3] in the answer -> a link to source 3 below it. */
const linkCites = (md: string, id: string) => md.replace(/\[(\d{1,2})\](?!\()/g, (_, n) => `[\\[${n}\\]](#src-${id}-${n})`);

function Answer({ id, reply, last, onAsk, staff, onShare, kids }: { id: string; reply: AskReply | null; last: boolean; onAsk: (t: string) => void; staff: boolean; onShare?: () => void; kids?: { id: string; name: string }[] }) {
  if (!reply) return null;
  const max = reply.chart ? Math.max(...reply.chart.points.map(p => p.value), 1) : 1;
  return (
    <div className="ask-os-turn">
      <div className="ask-av"><Sparkle size={17} weight="fill" /></div>
      <div className="ask-body">
        {reply.lookups.length > 0 && (
          <div className="ask-trace">Looked up {reply.lookups.map(l => <span key={l} className="s"><Check size={11} weight="bold" />{l}</span>)}</div>
        )}
        {reply.say && (
          <div className="ask-say md">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              a: ({ href, children: c }) => href?.startsWith('#src-')
                ? <a className="ask-cite" href={href} aria-label={`Source ${String(c).replace(/\D/g, '')}`}>{String(c).replace(/\D/g, '')}</a>
                : <a href={href} target="_blank" rel="noreferrer">{c}</a>,
            }}>{linkCites(reply.say, id)}</ReactMarkdown>
          </div>
        )}
        {reply.facts.length > 0 && (
          <div className="ask-facts">{reply.facts.map((f, i) => <div key={i} style={{ borderLeftColor: TONE[f.tone] }}><span>{f.label}</span><b>{f.value}</b></div>)}</div>
        )}
        {reply.chart && (
          <figure className="ask-viz">
            <figcaption>{reply.chart.title}</figcaption>
            {reply.chart.points.map((p, i) => (
              <div key={i} className="bar"><span>{p.label}</span><div className="tr"><div className={`fl${p.warn ? ' w' : ''}`} style={{ width: `${Math.max(2, (p.value / max) * 100)}%` }} /></div><b>{reply.chart!.unit === '₹' ? `₹${p.value.toLocaleString('en-IN')}` : `${p.value}${reply.chart!.unit}`}</b>{p.warn && <span className="sr-only">concern</span>}</div>
            ))}
          </figure>
        )}
        {reply.table && (
          <div className="ask-tbl">
            {reply.table.title && <div className="cap">{reply.table.title}</div>}
            <div className="scroll"><table>
              <thead><tr>{reply.table.columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
              <tbody>{reply.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={/^[₹\d.,\s%/-]+$/.test(c) ? 'n' : undefined}>{c}</td>)}</tr>)}</tbody>
            </table></div>
            {reply.table.note && <div className="note-t">{reply.table.note}</div>}
          </div>
        )}
        {reply.ask.length > 0 && (
          <div className="ask-q">{reply.ask.map(qq => (
            <div key={qq.id}><div className="q">{qq.question}</div><div className="opts">{qq.options.map(o => <button key={o} disabled={!last} onClick={() => onAsk(o)}>{o}</button>)}</div></div>
          ))}</div>
        )}
        {reply.actions.map((a, i) => <ActionCard key={i} action={a} staff={staff} kids={kids} />)}
        {reply.sources.length > 0 && (
          <div className="ask-sources">
            <span className="h">SOURCES</span>
            {reply.sources.map(s => {
              const inner = <><sup>{s.n}</sup><b>{s.label}</b><span>{s.detail}</span>{s.href && <ArrowRight size={13} weight="bold" />}</>;
              return s.href
                ? <Link key={s.n} id={`src-${id}-${s.n}`} href={s.href}>{inner}</Link>
                : <div key={s.n} id={`src-${id}-${s.n}`} className="nolink">{inner}</div>;
            })}
          </div>
        )}
        {(onShare || (last && reply.suggestions.length > 0)) && (
          <div className="ask-after">
            {last && reply.suggestions.map(s => <button key={s} className="sg" onClick={() => onAsk(s)}>{s}</button>)}
            {onShare && <button className="btn sm share no-print" onClick={onShare}><Share size={13} weight="bold" />Share</button>}
          </div>
        )}
      </div>
    </div>
  );
}

/** A drafted reply, acknowledgement or message: nothing happens until the person confirms. */
function ActionCard({ action, staff, kids }: { action: AskAction; staff: boolean; kids?: { id: string; name: string }[] }) {
  const api = useApi();
  const initial = action.kind === 'reply' || action.kind === 'message' ? action.draft : action.kind === 'ack' ? action.note : '';
  const [body, setBody] = useState(initial);
  const [childId, setChildId] = useState<string | null>(action.kind === 'message' ? action.childId ?? (kids?.length === 1 ? kids[0].id : null) : null);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'dismissed'>('idle');
  const [err, setErr] = useState<string | null>(null);
  if (action.kind === 'open') return <Link href={action.href} className="btn sm" style={{ alignSelf: 'flex-start' }}>{action.label} <ArrowRight size={13} weight="bold" /></Link>;
  if (state === 'dismissed') return null;
  const go = async () => {
    setState('busy'); setErr(null);
    try {
      if (action.kind === 'reply') await api('/api/staff/messages', 'POST', { threadId: action.threadId, body });
      else if (action.kind === 'ack') await api('/api/feed', 'POST', { action: 'ack', id: action.situationId, note: body });
      else await api('/api/parent/messages', 'POST', { childId, audience: action.audience, staffId: action.to, topic: action.topic, subject: action.subject, body });
      setState('done');
    } catch (e: any) { setErr(e?.message || 'Could not do that.'); setState('idle'); }
  };
  if (state === 'done') {
    return <div className="ask-done"><CheckCircle size={18} weight="fill" color="#10B981" /><span>{action.kind === 'ack' ? `Acknowledged: ${action.title}` : `Sent to ${action.toName}. It’s in ${staff ? 'Parent messages' : 'Messages'}.`}</span></div>;
  }
  const title = action.kind === 'reply' ? `Reply to ${action.toName}` : action.kind === 'ack' ? `Acknowledge: ${action.title}` : `Message to ${action.toName}`;
  return (
    <div className="ask-draft">
      <div className="h">{action.kind === 'ack' ? <CheckCircle size={16} weight="duotone" /> : <Envelope size={16} weight="duotone" />}<b>{title}</b></div>
      {(action.kind === 'reply' || action.kind === 'message') && <div className="sub">Re: {action.subject}</div>}
      {action.kind === 'message' && !action.childId && (kids?.length ?? 0) > 1 && (
        <label className="kid">About <select value={childId ?? ''} onChange={e => setChildId(e.target.value || null)}><option value="">Choose a child</option>{kids!.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
      )}
      <textarea value={body} onChange={e => setBody(e.target.value)} rows={action.kind === 'ack' ? 2 : 4} maxLength={action.kind === 'ack' ? 500 : 4000}
        aria-label={action.kind === 'ack' ? 'Note (optional)' : 'Message'} placeholder={action.kind === 'ack' ? 'Note (optional)' : undefined} />
      {err && <div className="err" role="alert">{err}</div>}
      <div className="f">
        <span>Nothing is sent until you confirm.</span>
        <button className="btn sm" onClick={() => setState('dismissed')}>Not now</button>
        <button className="btn pri sm" disabled={state === 'busy' || (action.kind !== 'ack' && !body.trim()) || (action.kind === 'message' && !childId)} onClick={() => void go()}>
          {state === 'busy' ? 'Working…' : action.kind === 'ack' ? 'Acknowledge' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// ── Share ────────────────────────────────────────────────────────────────────
function ShareDialog({ turn, people, onClose }: { turn: TurnV; people: Colleague[]; onClose: () => void }) {
  const api = useApi();
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const list = useMemo(() => people.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60), [people, q]);
  const go = async () => {
    setState('busy'); setErr(null);
    try { await api('/api/ask/share', 'POST', { turnId: turn.id, to: pick, note: note.trim() || undefined }); setState('done'); }
    catch (e: any) { setErr(e.message); setState('idle'); }
  };
  return (
    <div className="ask-modal" role="dialog" aria-modal="true" aria-label="Share this answer" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ask-modal-box">
        <button className="ask-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <h3><Share size={18} weight="bold" /> Share this answer</h3>
        {state === 'done' ? (
          <div className="ask-done" style={{ marginTop: 12 }}><CheckCircle size={18} weight="fill" color="#10B981" /><span>Shared. It appears under “Shared with you” on their Ask page.</span></div>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>Colleagues see it only as far as their own role allows; anything else is hidden from them.</p>
            <label className="ask-search" style={{ margin: '0 0 8px' }}><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a colleague" aria-label="Find a colleague" /></label>
            <div className="ask-people">
              {list.map(p => (
                <label key={p.id}><input type="checkbox" checked={pick.includes(p.id)} onChange={e => setPick(x => e.target.checked ? [...x, p.id].slice(0, 10) : x.filter(y => y !== p.id))} /><b>{p.name}</b><span>{p.role}</span></label>
              ))}
              {!list.length && <p className="ask-hint">Nobody matches.</p>}
            </div>
            <textarea className="ask-note-in" rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note (optional)" aria-label="Note" />
            {err && <div className="err" role="alert">{err}</div>}
            <div className="f"><span>{pick.length ? `${pick.length} selected` : 'Choose up to 10'}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={!pick.length || state === 'busy'} onClick={() => void go()}>{state === 'busy' ? 'Sharing…' : 'Share'}</button></div>
          </>
        )}
      </div>
    </div>
  );
}

