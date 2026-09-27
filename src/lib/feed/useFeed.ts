'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import type { Category, Kind, Severity } from './rules';

export interface FeedItem {
  id: string;
  kind: Kind | string;
  category: Category;
  severity: Severity;
  title: string;
  message: string;
  studentId: string | null;
  studentName: string | null;
  className: string | null;
  subject: string | null;
  teacherId: string | null;
  audience: 'staff' | 'principal';
  sourceTable: string | null;
  sourceId: string | null;
  metadata: Record<string, any>;
  createdAt: string;
  acknowledgedAt: string | null;
  ackByName: string | null;
  ackNote: string | null;
  escalateAt: string | null;
  escalatedAt: string | null;
}

const COLS = 'id, type, category, severity, title, message, student_id, student_name, class_name, subject, teacher_id, audience, source_table, source_id, metadata, created_at, acknowledged_at, ack_by_name, ack_note, escalate_at, escalated_at';

export const toItem = (r: any): FeedItem => ({
  id: r.id, kind: r.type, category: r.category, severity: r.severity, title: r.title || r.message || 'Situation', message: r.message || '',
  studentId: r.student_id ?? null, studentName: r.student_name ?? null, className: r.class_name ?? null, subject: r.subject ?? null,
  teacherId: r.teacher_id ?? null, audience: r.audience ?? 'staff', sourceTable: r.source_table ?? null, sourceId: r.source_id ?? null,
  metadata: r.metadata || {}, createdAt: r.created_at, acknowledgedAt: r.acknowledged_at ?? null, ackByName: r.ack_by_name ?? null,
  ackNote: r.ack_note ?? null, escalateAt: r.escalate_at ?? null, escalatedAt: r.escalated_at ?? null,
});

/**
 * The caller's situational feed: what row-level security lets them see (their
 * classes for teachers, the school for principals), live via Realtime, plus a
 * server scan on open so new signals appear without a background job.
 */
export function useFeed(days = 30) {
  const { profile, getAuthToken } = useAuth();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // Which load the server scan last finished for; scanning while it lags the current one.
  const [scannedFor, setScannedFor] = useState(-1);
  const schoolId = profile?.schoolId;
  const [supabase] = useState(() => createClient());
  const scanning = !!schoolId && scannedFor !== nonce;

  const call = useCallback(async (path: string, method: 'POST' | 'PATCH', body: unknown) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
    return data;
  }, [getAuthToken]);

  /** One read of the feed through row-level security. */
  const fetchItems = useCallback(() => {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    return supabase.from('situations').select(COLS)
      .eq('school_id', schoolId!).gte('created_at', since).order('created_at', { ascending: false }).limit(500);
  }, [schoolId, days, supabase]);

  useEffect(() => {
    if (!schoolId) return;
    let alive = true;
    const load = () => fetchItems().then(({ data, error: e }) => {
      if (!alive) return;
      if (e) { setError(e.message); return; }
      setError(null);
      setItems((data || []).map(toItem));
    });
    load();
    // Scan on open (server-throttled), then reload whatever it raised.
    const forNonce = nonce;
    call('/api/feed', 'POST', { action: 'scan' })
      .then(r => { if (alive && r && !r.skipped && (r.created || r.updated || r.escalated)) load(); })
      .catch(() => { /* the feed still shows what exists */ })
      .finally(() => { if (alive) setScannedFor(forNonce); });
    const channel = supabase.channel(`feed_${schoolId}_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'situations', filter: `school_id=eq.${schoolId}` }, (p: any) => {
        if (!p.new?.id) return;
        const next = toItem(p.new);
        setItems(prev => {
          if (!prev) return prev;
          const i = prev.findIndex(x => x.id === next.id);
          if (i === -1) return [next, ...prev];
          const copy = prev.slice();
          copy[i] = next;
          return copy;
        });
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [schoolId, fetchItems, call, nonce, supabase]);

  const acknowledge = useCallback(async (id: string, note?: string) => {
    const r = await call('/api/feed', 'POST', { action: 'ack', id, note });
    setItems(prev => prev?.map(x => (x.id === id ? { ...x, acknowledgedAt: r.acknowledgedAt || new Date().toISOString(), ackByName: r.by || x.ackByName, ackNote: note || null } : x)) ?? prev);
  }, [call]);

  return { items, error, scanning, acknowledge, reload: () => setNonce(n => n + 1), call };
}
