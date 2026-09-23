'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';

/**
 * Five-step energy scale from the mockup (ENERGY): label + the 0–100 value it
 * plots at on the fortnight curve. Stored as wellness_logs.energy (1–5, the
 * range the DPDP migration constrains); the 0–100 value is derived, not stored.
 */
export const ENERGY_LEVELS = [
  { label: 'Drained', value: 18 },
  { label: 'Low', value: 38 },
  { label: 'Okay', value: 58 },
  { label: 'Good', value: 76 },
  { label: 'Charged', value: 94 },
] as const;

export const levelForValue = (v: number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  let best = 0;
  ENERGY_LEVELS.forEach((l, i) => { if (Math.abs(l.value - v) < Math.abs(ENERGY_LEVELS[best].value - v)) best = i; });
  return best;
};

export interface JournalEntry { id: string; at: string; mood: string; text: string; shared: boolean }
export interface DayPoint { day: string; value: number | null }

interface WellnessState {
  today: number | null;                 // index into ENERGY_LEVELS
  todayRowId: string | null;
  fortnight: DayPoint[];                // 13 prior days, oldest first (today is drawn separately)
  entries: JournalEntry[];
  consent: 'on-file' | 'pending' | 'unknown';
  /** Journal entries (wellness_logs.note). */
  journalSupported: boolean;
  /** Sharing with the class teacher needs wellness_logs.shared (schema.sql section 11). */
  sharingSupported: boolean;
}

const DAY = 86_400_000;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function fortnightFrom(rows: { created_at: string; value: number }[]): DayPoint[] {
  const byDay = new Map<string, number>();
  // rows arrive newest first; keep the latest check-in per day
  for (const r of rows) {
    const k = dayKey(new Date(r.created_at));
    if (!byDay.has(k)) byDay.set(k, r.value);
  }
  const out: DayPoint[] = [];
  for (let i = 13; i >= 1; i--) {
    const d = new Date(Date.now() - i * DAY);
    out.push({ day: String(d.getDate()), value: byDay.get(dayKey(d)) ?? null });
  }
  return out;
}

// ── Demo (no-session dev bypass): mockup WELL seed, persisted per browser ───
const DEMO_KEY = 'sthara_demo_student_wellness_v1';
function demoSeed(): WellnessState {
  const hist = [55, 48, 62, 40, 58, 70, 66, 72, 45, 68, 74, 80, 76];
  return {
    today: 3, todayRowId: null,
    fortnight: hist.map((value, i) => ({ day: String(new Date(Date.now() - (13 - i) * DAY).getDate()), value })),
    entries: [
      { id: 'd1', at: new Date(Date.now() - 2 * DAY).toISOString(), mood: 'Good', text: 'Maths is clicking better this week after the tutor sessions. Still nervous about the chapter test on Friday.', shared: false },
      { id: 'd2', at: new Date(Date.now() - 5 * DAY).toISOString(), mood: 'Okay', text: 'Long day. Homework piled up over the weekend but I got through the science worksheet.', shared: false },
      { id: 'd3', at: new Date(Date.now() - 8 * DAY).toISOString(), mood: 'Charged', text: 'Finally understood quadratics after the tutor session. Showed Meera the factoring trick too.', shared: true },
    ],
    consent: 'on-file', journalSupported: true, sharingSupported: true,
  };
}
function demoLoad(): WellnessState {
  try { const raw = localStorage.getItem(DEMO_KEY); if (raw) return JSON.parse(raw); } catch { /* storage unavailable */ }
  return demoSeed();
}
function demoSave(s: WellnessState) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

/** Stored energy (1-5) -> index into ENERGY_LEVELS, or null for missing/out-of-range values. */
const levelFromEnergy = (e: unknown): number | null => {
  const n = Number(e);
  return Number.isInteger(n) && n >= 1 && n <= ENERGY_LEVELS.length ? n - 1 : null;
};

/**
 * Live wellness_logs columns (verified 2026-09-23): id, student_id, school_id,
 * created_at, energy, mood, note. A check-in is a row with energy and no note;
 * a journal entry is a row with a note. Sharing needs the `shared` column from
 * schema.sql section 11, so it's detected at load and switched off until then.
 * `mood` isn't written: its column type can't be confirmed with the anon key.
 */
function useWellnessStore() {
  const { profile, user, loading: authLoading } = useAuth();
  const [state, setState] = useState<WellnessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const demo = !user;

  const load = useCallback(async () => {
    if (!profile) return;
    if (demo) { setState(demoLoad()); return; }
    const supabase = createClient();
    try {
      const since = new Date(Date.now() - 14 * DAY).toISOString();
      // Independent reads — run them together rather than one after another.
      const [{ data: logs, error: e1 }, { data: journal, error: e2 }, { error: eShared }, { data: consentRow, error: e3 }] = await Promise.all([
        supabase.from('wellness_logs').select('id, created_at, energy, note')
          .eq('student_id', profile.uid).gte('created_at', since).order('created_at', { ascending: false }),
        supabase.from('wellness_logs').select('id, created_at, energy, note')
          .eq('student_id', profile.uid).not('note', 'is', null).order('created_at', { ascending: false }).limit(50),
        supabase.from('wellness_logs').select('shared').limit(0),
        supabase.from('consents').select('granted, revoked_at')
          .eq('student_id', profile.uid).eq('consent_type', 'wellness_checkin').maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const sharingSupported = !eShared;
      const sharedById = new Map<string, boolean>();
      if (sharingSupported && journal?.length) {
        const { data: flags } = await supabase.from('wellness_logs').select('id, shared').in('id', journal.map(j => j.id));
        (flags || []).forEach((f: any) => sharedById.set(f.id, !!f.shared));
      }

      const rows = logs || [];
      const checkins = rows.filter(r => !r.note && levelFromEnergy(r.energy) !== null);
      const todayKey = dayKey(new Date());
      const todayRow = checkins.find(r => dayKey(new Date(r.created_at)) === todayKey);
      setState({
        today: todayRow ? levelFromEnergy(todayRow.energy) : null,
        todayRowId: todayRow?.id ?? null,
        fortnight: fortnightFrom(checkins.map(r => ({ created_at: r.created_at, value: ENERGY_LEVELS[levelFromEnergy(r.energy)!].value }))),
        entries: (journal || []).map(r => {
          const lvl = levelFromEnergy(r.energy);
          return { id: r.id, at: r.created_at, text: r.note, shared: sharedById.get(r.id) ?? false, mood: lvl !== null ? ENERGY_LEVELS[lvl].label : 'Not set' };
        }),
        // No consents table yet (DPDP migration pending) -> 'unknown', shown as private-by-default.
        consent: e3 ? 'unknown' : consentRow?.granted && !consentRow.revoked_at ? 'on-file' : 'pending',
        journalSupported: true,
        sharingSupported,
      });
    } catch (e: any) {
      setError(e?.message || 'Could not load your wellness history.');
    }
  }, [profile, demo]);

  useEffect(() => { if (!authLoading) void load(); }, [authLoading, load]);

  /** One check-in per day: re-tapping updates today's row instead of stacking new ones. */
  const setEnergy = useCallback(async (level: number) => {
    if (!profile || !state) return;
    const prev = state;
    setState({ ...state, today: level });
    if (demo) { demoSave({ ...state, today: level }); return; }
    const supabase = createClient();
    const payload = { energy: level + 1 };
    const res = state.todayRowId
      ? await supabase.from('wellness_logs').update(payload).eq('id', state.todayRowId).select('id').single()
      : await supabase.from('wellness_logs').insert({ student_id: profile.uid, school_id: profile.schoolId, ...payload }).select('id').single();
    if (res.error) { setState(prev); setError('Could not save your check-in. Try again.'); return; }
    setState(s => (s ? { ...s, today: level, todayRowId: res.data?.id ?? s.todayRowId } : s));
  }, [profile, state, demo]);

  const addEntry = useCallback(async (text: string, shared: boolean): Promise<string> => {
    if (!profile || !state) return 'Not ready yet.';
    const mood = state.today !== null ? ENERGY_LEVELS[state.today] : null;
    const entry: JournalEntry = { id: `local-${Date.now()}`, at: new Date().toISOString(), mood: mood?.label ?? 'Not set', text, shared };
    const done = shared ? 'Saved and shared with your class teacher.' : 'Saved privately. Only you can read this.';
    if (demo) { const next = { ...state, entries: [entry, ...state.entries] }; setState(next); demoSave(next); return done; }
    if (shared && !state.sharingSupported) return 'Sharing with your teacher switches on once your school finishes a database update. Save it privately for now.';
    const row: Record<string, unknown> = { student_id: profile.uid, school_id: profile.schoolId, note: text, energy: state.today !== null ? state.today + 1 : null };
    if (state.sharingSupported) row.shared = shared;
    const { data, error: e } = await createClient().from('wellness_logs').insert(row).select('id').single();
    if (e) return 'Could not save that entry. Try again.';
    setState(s => (s ? { ...s, entries: [{ ...entry, id: data.id }, ...s.entries] } : s));
    return done;
  }, [profile, state, demo]);

  const toggleShare = useCallback(async (id: string): Promise<string> => {
    if (!state) return '';
    if (!demo && !state.sharingSupported) return 'Sharing with your teacher switches on once your school finishes a database update.';
    const target = state.entries.find(e => e.id === id);
    if (!target) return '';
    const shared = !target.shared;
    const next = { ...state, entries: state.entries.map(e => (e.id === id ? { ...e, shared } : e)) };
    setState(next);
    const msg = shared ? 'Entry shared with your class teacher.' : 'Entry is private again.';
    if (demo) { demoSave(next); return msg; }
    const { error: e } = await createClient().from('wellness_logs').update({ shared }).eq('id', id);
    if (e) { setState(state); return 'Could not change sharing. Try again.'; }
    return msg;
  }, [state, demo]);

  return { state, error, demo, setEnergy, addEntry, toggleShare };
}

type WellnessStore = ReturnType<typeof useWellnessStore>;
const WellnessContext = createContext<WellnessStore | null>(null);

/** Loads wellness once for the /student area, so the dashboard and Wellness Center share one state. */
export function WellnessProvider({ children }: { children: ReactNode }) {
  return createElement(WellnessContext.Provider, { value: useWellnessStore() }, children);
}

export function useWellness(): WellnessStore {
  const ctx = useContext(WellnessContext);
  if (!ctx) throw new Error('useWellness must be used inside <WellnessProvider> (the student layout).');
  return ctx;
}
