'use client';

/**
 * Situational feed pieces shared by the teacher feed and the principal's
 * command view: the item card (acknowledge, escalation state), the filterable
 * list and the incident form. Canon classes only.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { ChartLineDownIcon as ChartLineDown } from '@phosphor-icons/react/dist/ssr/ChartLineDown';
import { HeartIcon as Heart } from '@phosphor-icons/react/dist/ssr/Heart';
import { CalendarXIcon as CalendarX } from '@phosphor-icons/react/dist/ssr/CalendarX';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { EyeIcon as Eye } from '@phosphor-icons/react/dist/ssr/Eye';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { BellSimpleIcon as BellSimple } from '@phosphor-icons/react/dist/ssr/BellSimple';
import { Chip, Empty, Skeleton, type Tone } from '@/components/canon/ui';
import {
  CATEGORY_LABEL, INCIDENT_CATEGORIES, INCIDENT_RULES, isEscalated, SEVERITY_LABEL, type Category, type IncidentCategory, type Severity,
} from '@/lib/feed/rules';
import type { FeedItem } from '@/lib/feed/useFeed';
import { displayClass } from '@/lib/teacher/scope';

export const CATEGORY_ICON: Record<Category, Icon> = {
  academic: ChartLineDown, wellness: Heart, attendance: CalendarX, incident: Warning, security: Eye,
};
export const SEVERITY_TONE: Record<Severity, Tone> = { critical: 'r', high: 'a', normal: 'n' };
const SEVERITY_COLOR: Record<Severity, string> = { critical: 'var(--red)', high: 'var(--amber)', normal: 'var(--mut)' };

export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '';
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
/** "12 min", "3 h 5 min" between two instants. */
export function span(fromIso: string, toIso: string) {
  const m = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${Math.round(h / 24)} d`;
}

/** The current time, ticking every 30 s so "in 12 min" and escalation states stay true. */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** The escalation line under an item. */
function EscalationState({ item, now }: { item: FeedItem; now: number }) {
  if (item.acknowledgedAt) {
    return (
      <div style={{ fontSize: 12.5, marginTop: 6, color: 'var(--green)', display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <CheckCircle size={14} weight="fill" style={{ alignSelf: 'center' }} />
        <span>Acknowledged{item.ackByName ? ` by ${item.ackByName}` : ''} after {span(item.createdAt, item.acknowledgedAt)}</span>
        {item.ackNote && <span className="muted">&middot; &ldquo;{item.ackNote}&rdquo;</span>}
      </div>
    );
  }
  if (isEscalated(item, now)) return <div style={{ fontSize: 12.5, marginTop: 6, color: 'var(--red)', fontWeight: 700 }}>Escalated to the principal{item.escalateAt ? ` at ${clock(item.escalateAt)}` : ''}</div>;
  if (item.escalateAt) {
    const mins = Math.round((Date.parse(item.escalateAt) - now) / 60_000);
    return <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Goes to the principal {mins < 90 ? `in ${Math.max(1, mins)} min` : `at ${clock(item.escalateAt)}`} if not acknowledged</div>;
  }
  return null;
}

export function FeedCard({ item, onAck, actions, showTeacherLine }: {
  item: FeedItem; onAck?: (id: string, note: string) => Promise<void>; actions?: ReactNode; showTeacherLine?: string | null;
}) {
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = useNow();
  const I = CATEGORY_ICON[item.category] ?? BellSimple;
  const escalated = isEscalated(item, now);
  const ack = async () => {
    if (!onAck) return;
    setBusy(true); setErr(null);
    try { await onAck(item.id, note.trim()); setNoting(false); setNote(''); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const meta = [item.studentName, item.className ? displayClass(item.className) : null, item.subject, ago(item.createdAt, now)].filter(Boolean).join(' · ');
  return (
    <div className="row" style={{ alignItems: 'flex-start', opacity: item.acknowledgedAt ? 0.72 : 1 }}>
      <div aria-hidden style={{
        width: 40, height: 40, borderRadius: 12, flex: '0 0 40px', display: 'grid', placeItems: 'center',
        background: item.severity === 'critical' ? 'rgba(225,29,72,.12)' : item.severity === 'high' ? 'rgba(245,158,11,.14)' : 'var(--body)',
        color: SEVERITY_COLOR[item.severity],
      }}><I size={20} weight="duotone" /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          {item.severity !== 'normal' && <Chip tone={SEVERITY_TONE[item.severity]}>{SEVERITY_LABEL[item.severity].toUpperCase()}</Chip>}
          <Chip tone="b">{CATEGORY_LABEL[item.category]?.toUpperCase() ?? item.category}</Chip>
          {item.audience === 'principal' && <Chip tone="p">PRINCIPAL ONLY</Chip>}
          {escalated && <Chip tone="r">ESCALATED</Chip>}
        </div>
        <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.4 }}>{item.title}</div>
        {item.message && <div className="muted" style={{ fontSize: 13, marginTop: 3, lineHeight: 1.55 }}>{item.message}</div>}
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{meta}{showTeacherLine ? ` · ${showTeacherLine}` : ''}</div>
        <EscalationState item={item} now={now} />
        {noting && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input className="cmp-in" style={{ flex: '1 1 220px', margin: 0 }} value={note} maxLength={500} autoFocus
              aria-label="What you did (optional)" placeholder="What you did, e.g. spoke to the student (optional)"
              onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ack(); }} />
            <button className="btn pri sm" disabled={busy} onClick={ack}>{busy ? 'Saving…' : 'Acknowledge'}</button>
            <button className="btn sm" disabled={busy} onClick={() => { setNoting(false); setNote(''); }}>Cancel</button>
          </div>
        )}
        {err && <div className="err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
        {actions}
      </div>
      {!item.acknowledgedAt && onAck && !noting && (
        <button className="btn sm" onClick={() => setNoting(true)} aria-label={`Acknowledge: ${item.title}`}>
          <CheckCircle size={15} /> Acknowledge
        </button>
      )}
    </div>
  );
}

type Show = 'open' | 'all' | 'escalated';

/** Category and state filters over a list of items. */
export function FeedList({ items, onAck, actionsFor, teacherLine, emptyText, initialShow = 'open' }: {
  items: FeedItem[] | null; onAck?: (id: string, note: string) => Promise<void>;
  actionsFor?: (item: FeedItem) => ReactNode; teacherLine?: (item: FeedItem) => string | null; emptyText?: string; initialShow?: Show;
}) {
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [show, setShow] = useState<Show>(initialShow);
  const [q, setQ] = useState('');
  const now = useNow();
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const i of items || []) if (!i.acknowledgedAt) { c.all++; c[i.category] = (c[i.category] || 0) + 1; }
    return c;
  }, [items]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items || [])
      .filter(i => cat === 'all' || i.category === cat)
      .filter(i => show === 'all' || (show === 'open' ? !i.acknowledgedAt : isEscalated(i, now)))
      .filter(i => !needle || `${i.title} ${i.message} ${i.studentName || ''} ${i.className || ''}`.toLowerCase().includes(needle))
      // Open first by severity, then newest.
      .sort((a, b) => Number(!!a.acknowledgedAt) - Number(!!b.acknowledgedAt)
        || ({ critical: 0, high: 1, normal: 2 }[a.severity] - { critical: 0, high: 1, normal: 2 }[b.severity])
        || b.createdAt.localeCompare(a.createdAt));
  }, [items, cat, show, q, now]);

  return (
    <>
      <div className="filters" role="group" aria-label="Filter by kind">
        {(['all', 'academic', 'wellness', 'attendance', 'incident', 'security'] as const).map(c => (
          <button key={c} className={`fchip${cat === c ? ' on' : ''}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c === 'all' ? 'Everything' : CATEGORY_LABEL[c]}{counts[c] ? ` · ${counts[c]}` : ''}
          </button>
        ))}
        <input className="search" type="search" placeholder="Search student, class or text" aria-label="Search the feed" value={q} onChange={e => setQ(e.target.value)} />
        <div className="seg" role="group" aria-label="Show" style={{ marginLeft: 'auto' }}>
          {([['open', 'Open'], ['escalated', 'Escalated'], ['all', 'All']] as const).map(([k, l]) => (
            <button key={k} className={show === k ? 'on' : ''} aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
        {!items ? [0, 1, 2, 3].map(i => <Skeleton key={i} h={64} style={{ margin: '12px 0' }} />)
          : list.length ? list.map(i => <FeedCard key={i.id} item={i} onAck={onAck} actions={actionsFor?.(i)} showTeacherLine={teacherLine?.(i)} />)
          : <Empty icon={<BellSimple size={26} weight="duotone" />} title={show === 'open' ? 'Nothing needs you right now' : 'Nothing here'}>
              {emptyText || 'New signals from homework, quizzes, wellness check-ins, attendance and incidents appear here as they happen.'}
            </Empty>}
      </div>
    </>
  );
}

export interface StudentOption { id: string; name: string; cls: string }

/** Log an incident. Routing (who hears, whether parents are told) follows the category. */
export function IncidentForm({ students, classes, onSubmit, onCancel }: {
  students: StudentOption[]; classes: string[];
  onSubmit: (body: Record<string, unknown>) => Promise<{ hint?: string; parentsTold?: number; parentNotice?: string }>;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<IncidentCategory>('discipline');
  const [studentQ, setStudentQ] = useState('');
  const [studentId, setStudentId] = useState('');
  const [className, setClassName] = useState('');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [location, setLocation] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rule = INCIDENT_RULES[category];
  const picked = students.find(s => s.id === studentId);
  const matches = useMemo(() => {
    const n = studentQ.trim().toLowerCase();
    if (!n || picked) return [];
    return students.filter(s => s.name.toLowerCase().includes(n) || s.cls.toLowerCase().includes(n)).slice(0, 8);
  }, [studentQ, students, picked]);

  const submit = async () => {
    if (summary.trim().length < 3) { setErr('Give a one-line summary.'); return; }
    setBusy(true); setErr(null);
    try {
      await onSubmit({ category, summary, details, location, urgent, studentId: studentId || undefined, className: studentId ? undefined : className || undefined });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 18, borderLeft: `4px solid ${rule.severity === 'critical' || urgent ? 'var(--red)' : 'var(--ink)'}` }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>Log an incident</h3>
      <div className="g2" style={{ gap: 14 }}>
        <div className="cmp-fld"><label htmlFor="in-cat">WHAT HAPPENED</label>
          <select id="in-cat" className="cmp-sel" value={category} onChange={e => setCategory(e.target.value as IncidentCategory)}>
            {INCIDENT_CATEGORIES.map(c => <option key={c} value={c}>{INCIDENT_RULES[c].label}</option>)}
          </select></div>
        <div className="cmp-fld" style={{ position: 'relative' }}><label htmlFor="in-stu">STUDENT</label>
          {picked ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="cmp-in" style={{ flex: 1, margin: 0 }}>{picked.name} · {picked.cls}</span>
              <button className="btn sm" onClick={() => { setStudentId(''); setStudentQ(''); }}>Change</button>
            </div>
          ) : (
            <>
              <input id="in-stu" className="cmp-in" value={studentQ} onChange={e => setStudentQ(e.target.value)} placeholder="Type a name (leave empty if no one student)" autoComplete="off" />
              {matches.length > 0 && (
                <div role="listbox" aria-label="Matching students" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, background: '#fff', boxShadow: 'var(--sh)', borderRadius: 12, padding: 4 }}>
                  {matches.map(s => (
                    <button key={s.id} role="option" aria-selected={false} className="row-btn" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8 }}
                      onClick={() => { setStudentId(s.id); setStudentQ(''); }}>{s.name} <span className="muted">· {s.cls}</span></button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {!picked && (
        <div className="cmp-fld"><label htmlFor="in-cls">CLASS (IF NO ONE STUDENT)</label>
          <select id="in-cls" className="cmp-sel" value={className} onChange={e => setClassName(e.target.value)}>
            <option value="">Not class-specific</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select></div>
      )}
      <div className="cmp-fld"><label htmlFor="in-sum">ONE-LINE SUMMARY</label>
        <input id="in-sum" className="cmp-in" value={summary} maxLength={160} onChange={e => setSummary(e.target.value)} placeholder="e.g. Fell on the stairs, grazed knee" /></div>
      <div className="g2" style={{ gap: 14 }}>
        <div className="cmp-fld"><label htmlFor="in-loc">WHERE</label>
          <input id="in-loc" className="cmp-in" value={location} maxLength={120} onChange={e => setLocation(e.target.value)} placeholder="e.g. Block B stairs" /></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, fontWeight: 600, marginTop: 18 }}>
          <input type="checkbox" checked={urgent || rule.severity === 'critical'} disabled={rule.severity === 'critical'} onChange={e => setUrgent(e.target.checked)} />
          Urgent: alert the principal within the hour
        </label>
      </div>
      <div className="cmp-fld"><label htmlFor="in-det">DETAILS (STAFF ONLY)</label>
        <textarea id="in-det" className="cmp-in" value={details} maxLength={4000} onChange={e => setDetails(e.target.value)}
          placeholder="What you saw, who was involved, what you did. Parents never see this text." /></div>
      <div className={`note${category === 'child_protection' ? ' err' : ''}`} style={{ marginBottom: 14, fontSize: 13 }}>{rule.hint}</div>
      {err && <div className="err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className={`btn ${rule.severity === 'critical' || urgent ? 'red' : 'pri'}`} disabled={busy} onClick={submit}>{busy ? 'Logging…' : 'Log incident'}</button>
      </div>
    </div>
  );
}
