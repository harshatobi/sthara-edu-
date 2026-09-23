'use client';

import { useState } from 'react';
import { BatteryLowIcon as BatteryLow } from '@phosphor-icons/react/dist/ssr/BatteryLow';
import { BatteryMediumIcon as BatteryMedium } from '@phosphor-icons/react/dist/ssr/BatteryMedium';
import { BatteryHighIcon as BatteryHigh } from '@phosphor-icons/react/dist/ssr/BatteryHigh';
import { BatteryFullIcon as BatteryFull } from '@phosphor-icons/react/dist/ssr/BatteryFull';
import { RocketIcon as Rocket } from '@phosphor-icons/react/dist/ssr/Rocket';
import { NotePencilIcon as NotePencil } from '@phosphor-icons/react/dist/ssr/NotePencil';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { Chip, Empty, PageBar, Skeleton, hmColor, type Tone } from '@/components/canon/ui';
import { dmy } from '@/lib/student/shape';
import { useToast } from '@/components/canon/useToast';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import { ENERGY_LEVELS, useWellness } from '@/lib/student/useWellness';

const ENERGY_ICONS = [BatteryLow, BatteryMedium, BatteryHigh, BatteryFull, Rocket];

/** Mockup "Who can see what" — the DPDP visibility contract shown to the student. */
const VISIBILITY: [string, string, Tone, string][] = [
  ['You', 'Everything — check-ins, journals, TML', 'g', 'FULL'],
  ['Class teacher', 'Energy trend + at-risk flag, and only journal entries you share', 'b', 'LIMITED'],
  ['Parent', 'Fortnightly wellness summary', 'b', 'LIMITED'],
  ['School admin', 'Anonymised class aggregates for CBSE', 'n', 'AGGREGATE'],
];

export default function WellnessPage() {
  const { state, error, demo, setEnergy, addEntry, toggleShare } = useWellness();
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, toastEl] = useToast();

  if (!state && !error) {
    return (
      <div aria-busy="true" aria-label="Loading wellness">
        <Skeleton h={104} style={{ borderRadius: 20, marginBottom: 22 }} />
        <div className="g2"><Skeleton h={480} style={{ borderRadius: 20 }} /><Skeleton h={480} style={{ borderRadius: 20 }} /></div>
      </div>
    );
  }
  if (!state) return <div className="note err" role="alert">{error}</div>;

  const today = state.today;
  const todayVal = today !== null ? ENERGY_LEVELS[today].value : null;
  const hist = state.fortnight.filter(d => d.value !== null).map(d => d.value!) as number[];
  const avg = hist.length ? Math.round(hist.reduce((a, b) => a + b, 0) / hist.length) : null;

  const save = async (shared: boolean) => {
    const t = draft.trim();
    if (!t) { setSaved('Write something first — your journal is still empty.'); return; }
    setSaving(true);
    const msg = await addEntry(t, shared);
    setSaving(false);
    setSaved(msg);
    if (!/could not|switched off/i.test(msg)) setDraft('');
  };

  return (
    <>
      <PageBar
        eyebrow="WELLNESS CENTER"
        title="How are you doing today?"
        sub="Private by default. Your teacher sees trends, not your words, unless you tap Share."
        actions={state.consent === 'on-file'
          ? <Chip tone="g"><ShieldCheck size={13} weight="fill" /> Parent consent on file · DPDP</Chip>
          : state.consent === 'pending'
            ? <Chip tone="a" title="Your school needs a parent or guardian's consent on record for wellness check-ins"><Warning size={13} weight="fill" /> Parent consent pending · DPDP</Chip>
            : <Chip tone="n"><ShieldCheck size={13} weight="fill" /> DPDP · private by default</Chip>}
      />
      {demo && <div className="note info no-print" style={{ marginBottom: 18 }}><b>Demo records.</b> Check-ins and journal entries here are saved in this browser only.</div>}
      {error && <div className="note err" style={{ marginBottom: 18 }} role="alert">{error}</div>}

      <div className="g2">
        <div className="card">
          <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>Daily energy check-in</h3>
          <p className="muted" style={{ marginBottom: 22 }}>One tap. Takes three seconds. Builds your fortnightly wellness curve.</p>
          <div className="en-row" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', marginBottom: 12 }} role="group" aria-label="Today's energy">
            {ENERGY_LEVELS.map((lvl, i) => {
              const Icon = ENERGY_ICONS[i];
              const on = today === i;
              return (
                <button key={lvl.label} className={`en-card${on ? ' on' : ''}`} aria-pressed={on} aria-label={lvl.label}
                  style={{ '--lvl': hmColor(lvl.value) } as React.CSSProperties}
                  onClick={async () => { setSaved(''); await setEnergy(i); toast(`Energy logged as ${lvl.label}`); }}>
                  <InteractiveIcon icon={Icon} color={hmColor(lvl.value)} size={30} active={on} />
                  <div className="l">{lvl.label}</div>
                </button>
              );
            })}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 24 }} aria-live="polite">
            {today !== null
              ? <>Today logged as <b style={{ color: hmColor(todayVal!) }}>{ENERGY_LEVELS[today].label}</b> — that&apos;s the last bar on your fortnight chart.</>
              : 'No check-in yet today.'}
          </p>

          <label htmlFor="jrnl" className="lbl">JOURNAL — OPTIONAL</label>
          <textarea id="jrnl" className="qta" style={{ minHeight: 110 }} maxLength={4000} placeholder="What's on your mind today?…"
            value={draft} onChange={e => setDraft(e.target.value)} disabled={!state.journalSupported} />
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn pri" onClick={() => save(false)} disabled={saving || !state.journalSupported}>Save privately</button>
            <button className="btn" onClick={() => save(true)} disabled={saving || !state.journalSupported || (!demo && !state.sharingSupported)}
              title={!demo && !state.sharingSupported ? 'Available once your school finishes a pending database update' : undefined}>Share with class teacher</button>
          </div>
          {!demo && !state.sharingSupported && (
            <div className="note" style={{ marginTop: 14 }}>Entries save privately. Sharing with your class teacher switches on once your school finishes a pending database update.</div>
          )}
          {saved && <div className="note" style={{ marginTop: 14 }} aria-live="polite">{saved}</div>}
        </div>

        <div>
          <div className="card" style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 4 }}>Your fortnight</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 18 }}>The last bar is today — it moves when you change your check-in.</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 150 }} role="img"
              aria-label={`Fortnightly energy chart. Today is ${today !== null ? ENERGY_LEVELS[today].label : 'not logged'}.`}>
              {state.fortnight.map((d, i) => d.value !== null
                ? <div key={i} title={`${d.day}: ${d.value}%`} style={{ flex: 1, height: `${d.value}%`, background: hmColor(d.value), borderRadius: '6px 6px 0 0', opacity: 0.55 }} />
                : <div key={i} title={`${d.day}: no check-in`} style={{ flex: 1, height: '6%', background: '#EDF1F7', borderRadius: '6px 6px 0 0' }} />)}
              {todayVal !== null
                ? <div style={{ flex: 1, height: `${todayVal}%`, background: hmColor(todayVal), borderRadius: '6px 6px 0 0', boxShadow: `0 0 0 2px #fff,0 0 0 4px ${hmColor(todayVal)}55`, transition: 'height .3s ease' }} />
                : <div style={{ flex: 1, height: '14%', border: '2px dashed var(--line)', borderRadius: '6px 6px 0 0' }} />}
            </div>
            <div style={{ display: 'flex', gap: 9, marginTop: 7 }}>
              {state.fortnight.map((d, i) => <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--mut2)', fontWeight: 700 }}>{d.day}</span>)}
              <span style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--ink)', fontWeight: 800 }}>Today</span>
            </div>
            <div className="note" style={{ marginTop: 20 }}>{fortnightNote(todayVal, hist, avg)}</div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 14 }}>Who can see what</h3>
            {VISIBILITY.map(([who, what, tone, label]) => (
              <div key={who} className="row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{who}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{what}</div>
                </div>
                <Chip tone={tone}>{label}</Chip>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h3 className="sec"><span className="dot" style={{ background: 'var(--pale)', color: 'var(--blue)' }}><NotePencil size={15} weight="bold" /></span>Your journal</h3>
      <div className="card">
        {state.entries.length === 0 ? (
          <Empty icon={<InteractiveIcon icon={NotePencil} color="#7C3AED" size={30} active />} title="No journal entries yet">
            Anything you save above will show up here for you to read later.
          </Empty>
        ) : state.entries.map(e => (
          <div key={e.id} className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div style={{ minWidth: 96 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{isToday(e.at) ? 'Today' : dmy(e.at)}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>Felt {e.mood}</div>
            </div>
            <p style={{ flex: 1, fontSize: 14, lineHeight: 1.7, color: '#33465F', whiteSpace: 'pre-wrap' }}>{e.text}</p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              <Chip tone={e.shared ? 'b' : 'n'}>{e.shared ? 'SHARED' : 'PRIVATE'}</Chip>
              {(demo || state.sharingSupported) && <button className="btn sm" onClick={async () => setSaved(await toggleShare(e.id))}>{e.shared ? 'Make private' : 'Share'}</button>}
            </div>
          </div>
        ))}
        <div className="note" style={{ marginTop: 16 }}>Private entries are never shown to your teacher or parents — only the energy number feeds your wellness trend.</div>
      </div>
      {toastEl}
    </>
  );
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

function fortnightNote(t: number | null, hist: number[], avg: number | null): string {
  if (avg === null) return t === null ? 'Check in above and today’s bar fills in. Your curve builds from here.' : `Today is ${t}% — your first check-in this fortnight.`;
  if (t === null) return `Check in above and today's bar fills in. Your fortnight average so far is ${avg}%.`;
  const lo = Math.min(...hist), hi = Math.max(...hist);
  const vsAvg = t >= avg ? `${t - avg} points above` : `${avg - t} points below`;
  const tail = t < lo ? 'That is your lowest day this fortnight — worth telling someone if it keeps up.'
    : t > hi ? 'That is your best day this fortnight.' : `${t - lo} above your lowest day.`;
  return `Today is ${t}% — ${vsAvg} your fortnight average of ${avg}%. ${tail}`;
}
