'use client';

import { useEffect, useState } from 'react';
import { InfoIcon as Info } from '@phosphor-icons/react/dist/ssr/Info';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { WarningOctagonIcon as WarningOctagon } from '@phosphor-icons/react/dist/ssr/WarningOctagon';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';

type Tone = 'info' | 'warning' | 'critical';
interface Notice { message: string; tone: Tone }

const TONES: Record<Tone, { bg: string; fg: string; border: string; Icon: typeof Info }> = {
  info: { bg: '#EAF2FF', fg: '#1E3A8A', border: '#C7DAFF', Icon: Info },
  warning: { bg: '#FFF8E7', fg: '#7A5A08', border: '#F7DC93', Icon: Warning },
  critical: { bg: '#FFE4EA', fg: '#9F1239', border: '#FDB4C4', Icon: WarningOctagon },
};

// One fetch per page load, shared by every mounted notice.
let pending: Promise<Notice | null> | null = null;
const load = () => (pending ??= fetch('/api/platform/public')
  .then(r => (r.ok ? r.json() : null))
  .then(d => (d?.notice?.message ? { message: String(d.notice.message), tone: (d.notice.tone in TONES ? d.notice.tone : 'info') as Tone } : null))
  .catch(() => null));

const key = (n: Notice) => `sthara.notice.${n.tone}.${n.message.length}.${n.message.slice(0, 40)}`;

/**
 * The operator's platform-wide notice (Settings > Platform controls > Sign-in
 * notice): planned downtime, incidents. Information and warnings can be
 * dismissed per message; incidents stay until the operator clears them.
 */
export default function PlatformNotice({ variant = 'bar' }: { variant?: 'bar' | 'card' }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let live = true;
    load().then(n => {
      if (!live || !n) return;
      try { if (n.tone !== 'critical' && localStorage.getItem(key(n))) return; } catch { /* storage blocked */ }
      setNotice(n);
    });
    return () => { live = false; };
  }, []);

  if (!notice || hidden) return null;
  const t = TONES[notice.tone];
  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(key(notice), '1'); } catch { /* storage blocked */ }
  };
  return (
    <div role={notice.tone === 'critical' ? 'alert' : 'status'}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
        borderRadius: variant === 'card' ? 14 : 12, padding: '11px 14px', fontSize: 13.5, fontWeight: 600, lineHeight: 1.5,
        marginBottom: variant === 'card' ? 16 : 18, width: '100%', textAlign: 'left',
      }}>
      <t.Icon size={18} weight="fill" style={{ flex: '0 0 auto', marginTop: 1 }} aria-hidden="true" />
      <span style={{ flex: 1, minWidth: 0 }}>{notice.message}</span>
      {notice.tone !== 'critical' && (
        <button type="button" onClick={dismiss} aria-label="Dismiss notice"
          style={{ flex: '0 0 auto', color: 'inherit', opacity: 0.7, background: 'none', border: 0, cursor: 'pointer', padding: 2, display: 'grid', placeItems: 'center' }}>
          <X size={15} weight="bold" />
        </button>
      )}
    </div>
  );
}
