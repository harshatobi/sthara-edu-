'use client';

import { useEffect, useRef, useState } from 'react';
import { BellIcon as Bell } from '@phosphor-icons/react/dist/ssr/Bell';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';

interface Note { id: string; title: string; body: string; type: string; read: boolean; created_at: string }

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

/**
 * Teachers' and office staff's in-app notifications (leave decisions, covers, duties, timetables, alerts),
 * which until now only reached them on WhatsApp. Reads their own rows (RLS) and may only flip `read`.
 */
export default function NotificationBell() {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!profile?.uid) return;
    let alive = true;
    createClient().from('notifications').select('id, title, body, type, read, created_at')
      .eq('user_id', profile.uid).order('created_at', { ascending: false }).limit(40)
      .then(({ data }) => { if (alive) setNotes((data as Note[]) || []); });
    return () => { alive = false; };
  }, [profile?.uid, nonce]);
  useEffect(() => {
    const refresh = () => setNonce(n => n + 1);
    window.addEventListener('focus', refresh);
    const t = setInterval(refresh, 120_000);
    return () => { window.removeEventListener('focus', refresh); clearInterval(t); };
  }, []);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const unread = notes.filter(n => !n.read).length;
  const markAll = async () => {
    const ids = notes.filter(n => !n.read).map(n => n.id);
    if (!ids.length) return;
    setNotes(ns => ns.map(n => ({ ...n, read: true })));
    await createClient().from('notifications').update({ read: true }).in('id', ids);
  };

  return (
    <>
      <button type="button" className="nb-btn" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open}
        onClick={() => { setOpen(o => !o); }}>
        <Bell size={20} weight={unread ? 'fill' : 'regular'} />
        {unread > 0 && <span className="nb-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="nb-scrim" onClick={() => { setOpen(false); markAll(); }} aria-hidden="true" />
          <div className="nb-panel" role="dialog" aria-label="Notifications" tabIndex={-1} ref={panel}>
            <div className="nb-hd">
              <b>Notifications</b>
              {unread > 0 && <button type="button" className="btn sm" onClick={markAll}>Mark all read</button>}
              <button type="button" aria-label="Close" onClick={() => { setOpen(false); markAll(); }}><X size={16} weight="bold" /></button>
            </div>
            {notes.length ? notes.map(n => (
              <div key={n.id} className={`nb-item${n.read ? '' : ' un'}`}>
                <b>{n.title}</b>
                <p>{n.body}</p>
                <span>{ago(n.created_at)}</span>
              </div>
            )) : <p className="muted" style={{ padding: 18 }}>Nothing yet. Leave decisions, covers, duties and new timetables show up here.</p>}
          </div>
        </>
      )}
    </>
  );
}
