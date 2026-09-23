'use client';
import { useMemo, useSyncExternalStore } from 'react';
import { applyDemoAction, parseDemo, type DemoAction } from './teacher';
const KEY = 'sthara.teacher-demo.v1';
const EVENT = 'sthara-teacher-demo-change';
let fallback: string | null = null;
function snapshot() { if (fallback !== null) return fallback; try { return localStorage.getItem(KEY); } catch { return null; } }
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(EVENT, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(EVENT, listener); };
}
export function useTeacherDemo(actor: string) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const state = useMemo(() => parseDemo(raw), [raw]);
  function dispatch(action: DemoAction) {
    const next = applyDemoAction(parseDemo(snapshot()), action, actor, crypto.randomUUID(), new Date().toISOString());
    const serialized = JSON.stringify(next);
    let persisted = true;
    try { localStorage.setItem(KEY, serialized); fallback = null; } catch { fallback = serialized; persisted = false; }
    window.dispatchEvent(new Event(EVENT));
    return persisted;
  }
  return { state, dispatch };
}
