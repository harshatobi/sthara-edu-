'use client';

import { useEffect, useState } from 'react';
import { usePrintOne } from './usePrintOne';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { ImageIcon as ImageGlyph } from '@phosphor-icons/react/dist/ssr/Image';
import { Chip, Skeleton } from '@/components/canon/ui';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import { useOptionalTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { svgDataUrl } from '@/lib/teacher/svg';
import type { Artifact } from '@/lib/teacher/copilot';

type Diagram = Extract<Artifact, { kind: 'diagram' }>;
type Picture = Extract<Artifact, { kind: 'image' }>;

/** A labelled diagram, already cleaned on the server; shown through <img>, so nothing in it can run. */
export function DiagramArtifact({ a, sample }: { a: Diagram; sample?: string | null }) {
  const { box, print } = usePrintOne();
  const download = () => {
    const url = URL.createObjectURL(new Blob([a.svg], { type: 'image/svg+xml' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `${a.title.replace(/[^\w -]+/g, '').trim() || 'diagram'}.svg` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className={`art${sample ? ' sample' : ''}`} ref={box}>
      <div className="art-hd"><div>
        {sample && <><Chip tone="a">EXAMPLE</Chip>{' '}</>}<Chip tone="p">DIAGRAM</Chip>
        <h3 style={{ fontSize: 17, fontWeight: 800, marginTop: 8 }}>{a.title}</h3>
      </div></div>
      <div className="art-bd">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URL of a cleaned SVG; next/image adds nothing here */}
        <img src={svgDataUrl(a.svg)} alt={a.caption || a.title} style={{ width: '100%', maxHeight: 520, objectFit: 'contain', background: '#fff' }} />
        {a.caption && <p className="muted" style={{ marginTop: 8 }}>{a.caption}</p>}
      </div>
      {sample ? <div className="art-ft muted" style={{ fontSize: 12 }}>{sample}</div> : (
        <div className="art-ft">
          <button className="btn sm" onClick={print}><Printer size={13} weight="bold" /> Print</button>
          <button className="btn sm" onClick={download}><DownloadSimple size={13} weight="bold" /> Save as SVG</button>
        </div>
      )}
    </div>
  );
}

/**
 * An illustration. The Copilot proposes the picture; generating it costs money, so the teacher presses
 * the button (and can edit the description first). Once made it is kept privately for the school and
 * shown through a short-lived link fetched when the card appears.
 */
export function ImageArtifact({ a, cls, subject, sample, onChange }: { a: Picture; cls: string; subject: string; sample?: string | null; onChange?: (next: Artifact) => void }) {
  const desk = useOptionalTeacherDesk();
  const { box, print } = usePrintOne();
  const [prompt, setPrompt] = useState(a.prompt);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!a.path) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch(`/api/teacher/copilot/image?${new URLSearchParams({ path: a.path! })}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) { if (res.ok && data.url) setUrl(data.url); else setError('This picture is no longer available.'); }
      } catch { if (!cancelled) setError('Could not load the picture.'); }
    })();
    return () => { cancelled = true; };
  }, [a.path]);

  const generate = async () => {
    if (!desk) return;
    setBusy(true); setError(null);
    try {
      const r = await desk.call<{ path: string; url: string | null }>('/api/teacher/copilot/image', 'POST', { class: cls, subject, prompt });
      setUrl(r.url);
      onChange?.({ ...a, prompt, path: r.path });
    } catch (e: any) { setError(e?.message || 'The picture couldn’t be made.'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`art${sample ? ' sample' : ''}`} ref={box}>
      <div className="art-hd"><div>
        {sample && <><Chip tone="a">EXAMPLE</Chip>{' '}</>}<Chip tone="p">ILLUSTRATION</Chip>
        <h3 style={{ fontSize: 17, fontWeight: 800, marginTop: 8 }}>{a.title}</h3>
      </div></div>
      <div className="art-bd">
        {a.path && !url && !error && <Skeleton h={280} />}
        {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file */}
        {url && <img src={url} alt={a.caption || a.title} style={{ width: '100%', maxHeight: 560, objectFit: 'contain', borderRadius: 12, background: '#F7F9FB' }} />}
        {!a.path && !url && (
          <div className="cmp-fld">
            <label htmlFor={`img-${a.title}`}>WHAT THE PICTURE SHOWS (you can change it)</label>
            <textarea id={`img-${a.title}`} className="cmp-in" rows={3} maxLength={800} value={prompt} disabled={!!sample} onChange={e => setPrompt(e.target.value)} />
            <span className="muted" style={{ fontSize: 12 }}>Pictures carry no labels (image models misspell them): add them on the board, or ask for a labelled diagram instead.</span>
          </div>
        )}
        {a.caption && <p className="muted" style={{ marginTop: 8 }}>{a.caption}</p>}
        {error && <div className="err" role="alert" style={{ marginTop: 10 }}>{error}</div>}
      </div>
      {sample ? <div className="art-ft muted" style={{ fontSize: 12 }}>{sample}</div> : (
        <div className="art-ft">
          {!a.path && !url && <button className="btn sm red" disabled={busy || prompt.trim().length < 8 || !desk} onClick={generate}><ImageGlyph size={13} weight="fill" /> {busy ? 'Drawing… (about 15 s)' : 'Generate picture (about ₹4)'}</button>}
          {url && <button className="btn sm" onClick={print}><Printer size={13} weight="bold" /> Print</button>}
        </div>
      )}
    </div>
  );
}
