'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { LinkSimpleIcon as LinkSimple } from '@phosphor-icons/react/dist/ssr/LinkSimple';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { EyeSlashIcon as EyeSlash } from '@phosphor-icons/react/dist/ssr/EyeSlash';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { Chip, Empty, PageBar, type Tone } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import type { AdminDesk } from '@/lib/admin/desk';
import { ago, fmtDate, isoDay, plural } from '@/lib/admin/format';
import { MODULES, probe, type Finding, type Level, type Module, type ProbeAction } from '@/lib/admin/probe';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { DeskGate, Field } from './kit';

export const LEVEL: Record<Level, { t: string; tone: Tone; color: string }> = {
  critical: { t: 'CRITICAL', tone: 'r', color: '#E11D48' },
  high: { t: 'HIGH', tone: 'r', color: '#F97316' },
  medium: { t: 'MEDIUM', tone: 'a', color: '#F59E0B' },
  low: { t: 'LOW', tone: 'n', color: '#94A3B8' },
};

export default function ProbePage() {
  return <DeskGate need="probe.view">{desk => <Probe desk={desk} />}</DeskGate>;
}

function Probe({ desk }: { desk: AdminDesk }) {
  const router = useRouter();
  const params = useSearchParams();
  const [toast, toastEl] = useToast();
  const { findings, acknowledged, hiddenModules } = useMemo(() => probe(desk), [desk]);
  const [mod, setMod] = useState<Module | 'all'>('all');
  const [minLevel, setMinLevel] = useState<Level | 'all'>('all');
  const [showAcked, setShowAcked] = useState(false);
  const order: Level[] = ['critical', 'high', 'medium', 'low'];
  const list = findings.filter(f => (mod === 'all' || f.module === mod) && (minLevel === 'all' || order.indexOf(f.level) <= order.indexOf(minLevel)));
  const selKey = params.get('f');
  const selected = [...findings, ...acknowledged].find(f => f.key === selKey) ?? list[0] ?? null;
  const select = (k: string) => router.replace(`/admin/probe?f=${encodeURIComponent(k)}`, { scroll: false });
  const counts = (m: Module) => findings.filter(f => f.module === m).length;
  const visibleModules = (Object.keys(MODULES) as Module[]).filter(m => !hiddenModules.includes(m));

  return (
    <>
      {toastEl}
      <PageBar eyebrow="PROBE" title="What's going wrong, and why"
        sub={`${plural(findings.length, 'finding')} across ${visibleModules.map(m => MODULES[m].label.toLowerCase()).join(', ')} · worked out from live records ${ago(desk.loadedAt)}`}
        actions={<>
          {order.slice(0, 2).map(l => {
            const n = findings.filter(f => f.level === l).length;
            return n ? <Chip key={l} tone={LEVEL[l].tone}>{n} {LEVEL[l].t}</Chip> : null;
          })}
        </>} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div className="seg" role="group" aria-label="Filter by area">
          <button className={mod === 'all' ? 'on' : ''} aria-pressed={mod === 'all'} onClick={() => setMod('all')}>All {findings.length}</button>
          {visibleModules.map(m => (
            <button key={m} className={mod === m ? 'on' : ''} aria-pressed={mod === m} onClick={() => setMod(m)}>{MODULES[m].label} {counts(m)}</button>
          ))}
        </div>
        <select className="cmp-sel" style={{ width: 190, padding: '9px 12px' }} aria-label="Minimum severity" value={minLevel} onChange={e => setMinLevel(e.target.value as Level | 'all')}>
          <option value="all">Every severity</option>
          <option value="critical">Critical only</option>
          <option value="high">High and above</option>
          <option value="medium">Medium and above</option>
        </select>
        {hiddenModules.length > 0 && (
          <span className="muted" style={{ fontSize: 12.5 }}>Your role doesn&apos;t cover {hiddenModules.map(m => MODULES[m].label.toLowerCase()).join(', ')}, so findings there aren&apos;t shown.</span>
        )}
      </div>

      <div className="g2" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)', alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {list.length ? list.map(f => (
            <button key={f.key} onClick={() => select(f.key)} className={`probe-item${selected?.key === f.key ? ' on' : ''}`} aria-current={selected?.key === f.key}>
              <span className="probe-sev" style={{ background: LEVEL[f.level].color }} aria-hidden="true" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <Chip tone={LEVEL[f.level].tone} className="xs">{LEVEL[f.level].t}</Chip>
                  <span className="muted" style={{ fontSize: 11.5, fontWeight: 700 }}>{MODULES[f.module].label.toUpperCase()}</span>
                  {f.causes.length > 0 && <span className="muted" style={{ fontSize: 11.5, display: 'inline-flex', gap: 4, alignItems: 'center' }}><LinkSimple size={12} weight="bold" /> linked</span>}
                </span>
                <b style={{ display: 'block', fontSize: 14, lineHeight: 1.35 }}>{f.title}</b>
              </span>
              <span className="num muted" style={{ fontSize: 12, fontWeight: 800 }}>{f.severity}</span>
            </button>
          )) : (
            <div style={{ padding: 26 }}>
              <Empty icon={<CheckCircle size={26} weight="duotone" />} title={findings.length ? 'Nothing at this level' : 'Nothing needs attention'}>
                {findings.length ? 'Widen the filters to see the rest.' : 'Probe re-checks every time the school\'s data loads.'}
              </Empty>
            </div>
          )}
          {acknowledged.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line)', padding: '12px 18px' }}>
              <button className="lbl" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--mut)' }} onClick={() => setShowAcked(v => !v)} aria-expanded={showAcked}>
                {showAcked ? 'Hide' : 'Show'} {plural(acknowledged.length, 'acknowledged finding')}
              </button>
              {showAcked && acknowledged.map(f => (
                <button key={f.key} onClick={() => select(f.key)} className="row-btn" style={{ opacity: 0.75 }}>
                  <EyeSlash size={15} />
                  <span style={{ flex: 1, fontSize: 13 }}>{f.title}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>{f.ack.status === 'snoozed' ? `until ${fmtDate(f.ack.snoozeUntil, true)}` : 'acknowledged'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: 'sticky', top: 16 }}>
          {selected ? <Detail key={selected.key} f={selected} desk={desk} all={[...findings, ...acknowledged]} onSelect={select} onDone={toast} />
            : <div className="card"><Empty icon={<Sparkle size={26} weight="duotone" />} title="Pick a finding">Its evidence, likely causes and what you can do about it appear here.</Empty></div>}
        </div>
      </div>
    </>
  );
}

function Spark({ points, unit }: { points: { x: string; y: number | null }[]; unit: string }) {
  const vals = points.map(p => p.y).filter((v): v is number => v !== null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals) - 2;
  const hi = Math.max(...vals) + 2;
  const W = 300, H = 70;
  const xy = points.map((p, i) => (p.y === null ? null : [(i / (points.length - 1)) * W, H - ((p.y - lo) / Math.max(1, hi - lo)) * H] as const));
  const d = xy.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p![0].toFixed(1)},${p![1].toFixed(1)}`).join(' ');
  return (
    <figure style={{ margin: '14px 0 4px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 70 }} role="img" aria-label={points.map(p => `${p.x}: ${p.y ?? 'no data'}${unit}`).join(', ')}>
        <path d={d} fill="none" stroke="#2F6BFF" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {xy.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#2F6BFF" />)}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--mut2)', fontWeight: 700 }}>
        <span>{points[0].x}</span><span>{points[points.length - 1].x}</span>
      </div>
    </figure>
  );
}

function Detail({ f, desk, all, onSelect, onDone }: { f: Finding & { ack?: any }; desk: AdminDesk; all: Finding[]; onSelect: (k: string) => void; onDone: (m: string) => void }) {
  const { call, reload } = useAdminDesk();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nudge, setNudge] = useState<Extract<ProbeAction, { kind: 'nudge_teacher' }> | null>(null);
  const [msg, setMsg] = useState('');
  const [hiding, setHiding] = useState<'ack' | 'snooze' | null>(null);
  const [note, setNote] = useState('');
  const [until, setUntil] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return isoDay(d); });

  const run = async (id: string, path: string, body: unknown, done: (r: any) => string) => {
    setBusy(id); setErr(null);
    try { const r = await call(path, 'POST', body); onDone(done(r)); reload(); return true; }
    catch (e: any) { setErr(e.message); return false; }
    finally { setBusy(null); }
  };
  const act = (a: ProbeAction, i: number) => {
    const id = `a${i}`;
    if (a.kind === 'nudge_teacher') { setNudge(a); setMsg(a.message); return; }
    if (a.kind === 'request_consent') return run(id, '/api/admin/probe', { action: 'request_consent', consentType: a.consentType, studentIds: a.studentIds },
      r => (r.sent ? `Consent requested from ${plural(r.sent, 'family', 'families')}` : 'Everyone was already asked this week'));
    if (a.kind === 'remind_fees') return run(id, '/api/admin/fees', { action: 'remind', studentIds: a.studentIds },
      r => `${plural(r.sent, 'family', 'families')} reminded${r.skipped?.length ? ` · ${r.skipped.length} skipped` : ''}`);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <Chip tone={LEVEL[f.level].tone}>{LEVEL[f.level].t} · {f.severity}</Chip>
        <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{MODULES[f.module].label.toUpperCase()}</span>
        {f.ack && <Chip tone="n">{f.ack.status === 'snoozed' ? `SNOOZED UNTIL ${fmtDate(f.ack.snoozeUntil, true).toUpperCase()}` : 'ACKNOWLEDGED'}</Chip>}
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{f.title}</h2>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.65, marginTop: 8 }}>{f.summary}</p>

      {f.evidence.length > 0 && (
        <div className="probe-ev">
          {f.evidence.map(e => (
            <div key={e.label}><span>{e.label}</span><b style={{ color: e.tone === 'r' ? 'var(--red)' : e.tone === 'a' ? '#B45309' : e.tone === 'g' ? 'var(--green)' : undefined }}>{e.value}</b></div>
          ))}
        </div>
      )}
      {f.series && <><div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', marginTop: 16 }}>{f.series.label.toUpperCase()}</div><Spark points={f.series.points} unit={f.series.unit} /></>}

      {f.causes.length > 0 && (
        <>
          <div className="muted" style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', margin: '18px 0 6px' }}>WHY THIS IS LIKELY HAPPENING</div>
          {f.causes.map(c => <div key={c} style={{ display: 'flex', gap: 8, fontSize: 13.5, padding: '5px 0' }}><LinkSimple size={15} weight="bold" style={{ flex: '0 0 auto', marginTop: 2, color: 'var(--blue)' }} />{c}</div>)}
        </>
      )}
      {f.related.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {f.related.map(k => { const r = all.find(x => x.key === k); return r ? <button key={k} className="btn sm" onClick={() => onSelect(k)}>Related: {r.title.length > 48 ? `${r.title.slice(0, 46)}…` : r.title}</button> : null; })}
        </div>
      )}

      {err && <div className="err" role="alert" style={{ marginTop: 14 }}>{err}</div>}

      {nudge ? (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <Field label={`MESSAGE TO ${nudge.teacherName.toUpperCase()}`} htmlFor="nudge-msg" hint="Arrives in their Sthara notifications, signed with your name. One nudge per teacher per day.">
            <textarea id="nudge-msg" className="cmp-in" value={msg} maxLength={600} onChange={e => setMsg(e.target.value)} />
          </Field>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setNudge(null)}>Cancel</button>
            <button className="btn pri" disabled={busy !== null || !msg.trim()} onClick={async () => {
              if (await run('nudge', '/api/admin/probe', { action: 'nudge_teacher', teacherId: nudge.teacherId, message: msg }, () => `Note sent to ${nudge.teacherName}`)) setNudge(null);
            }}><PaperPlaneTilt size={15} weight="bold" /> {busy === 'nudge' ? 'Sending…' : 'Send'}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
          {f.actions.map((a, i) => a.kind === 'link'
            ? <Link key={i} className="btn sm" href={a.href}>{a.label} <ArrowRight size={13} weight="bold" /></Link>
            : <button key={i} className="btn sm pri" disabled={busy !== null} onClick={() => act(a, i)}>{busy === `a${i}` ? 'Working…' : a.label}</button>)}
        </div>
      )}

      <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        {f.ack ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 12.5, flex: 1 }}>
              {f.ack.status === 'snoozed' ? 'Snoozed' : 'Acknowledged'} by {desk.workforce.admins.find(x => x.id === f.ack.by)?.name ?? 'an admin'} {ago(f.ack.at)}{f.ack.note ? `: "${f.ack.note}"` : ''}
            </span>
            <button className="btn sm" disabled={busy !== null} onClick={() => run('unack', '/api/admin/probe', { action: 'unack', key: f.key }, () => 'Back on the list')}>Bring back</button>
          </div>
        ) : hiding ? (
          <>
            <div className="g2" style={{ gap: 12 }}>
              <Field label="NOTE (OPTIONAL)" htmlFor="ack-note"><input id="ack-note" className="cmp-in" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="What's being done about it" /></Field>
              {hiding === 'snooze' && <Field label="UNTIL" htmlFor="ack-until"><input id="ack-until" type="date" className="cmp-in" value={until} min={isoDay()} onChange={e => setUntil(e.target.value)} /></Field>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn sm" onClick={() => setHiding(null)}>Cancel</button>
              <button className="btn sm pri" disabled={busy !== null} onClick={async () => {
                if (await run('ack', '/api/admin/probe', { action: hiding, key: f.key, fingerprint: f.fingerprint, until, note },
                  () => (hiding === 'ack' ? 'Acknowledged; it returns if it gets worse' : `Snoozed until ${fmtDate(until, true)}`))) setHiding(null);
              }}>{hiding === 'ack' ? 'Acknowledge' : 'Snooze'}</button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12.5, flex: 1 }}>Handled, or being handled?</span>
            <button className="btn sm" onClick={() => setHiding('ack')}>Acknowledge</button>
            <button className="btn sm" onClick={() => setHiding('snooze')}>Snooze</button>
          </div>
        )}
      </div>
    </div>
  );
}
