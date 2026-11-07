'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LightbulbIcon as Lightbulb } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { Chip, Empty, PageBar, Skeleton, hmColor } from '@/components/canon/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import type { Insight, InsightChapter, InsightStudent } from '@/lib/tutor/insightServer';
import ScopePicker, { useScopeSelection } from './ScopePicker';

/**
 * Tutor insight (Socratic tutor PR3, decisions of 2026-11-06): what the tutor has seen in a class and subject. A
 * heat strip of chapters by average depth, then per chapter the misconceptions it tagged (and in whom), the
 * students who are struggling, and the chapter's misconception bank, which the teacher curates: the tutor tags
 * only against the active bank. Transcripts are never shown here.
 */
export default function TutorInsight() {
  const { desk, error } = useTeacherDesk();
  const { classes, cls, subjects, subject, go } = useScopeSelection(desk?.scope ?? []);
  const { getAuthToken } = useAuth();
  const tokenRef = useRef(getAuthToken);
  useEffect(() => { tokenRef.current = getAuthToken; });
  const [data, setData] = useState<{ key: string; insight: Insight | null; err: string | null } | null>(null);
  const [tick, setTick] = useState(0);
  const key = `${cls}|${subject}|${tick}`;

  useEffect(() => {
    if (!cls || !subject) return;
    let on = true;
    (async () => {
      try {
        const res = await fetch(`/api/teacher/tutor-insight?${new URLSearchParams({ class: cls, subject })}`, { headers: { Authorization: `Bearer ${await tokenRef.current()}` } });
        const d = await res.json().catch(() => ({}));
        if (on) setData({ key, insight: res.ok ? d : null, err: res.ok ? null : d.error || 'Could not load.' });
      } catch { if (on) setData({ key, insight: null, err: 'Could not load.' }); }
    })();
    return () => { on = false; };
  }, [cls, subject, key]);

  const call = useCallback(async (method: 'POST' | 'PATCH', body: unknown) => {
    const res = await fetch('/api/teacher/tutor-bank', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenRef.current()}` }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Could not save.');
    setTick(t => t + 1);
  }, []);

  const picker = <ScopePicker classes={classes} cls={cls} subjects={subjects} subject={subject} onChange={n => go({ class: n.class ?? cls, subject: n.subject ?? (n.class ? null : subject) })} />;
  const head = <PageBar eyebrow="AI TUTOR" title="Tutor insight" sub="What the Socratic tutor has seen in this class: misconceptions that keep coming up, who is struggling, and the bank it tags against." actions={picker} />;

  if (error) return <div className="note err" role="alert">Couldn&apos;t load your classes: {error}</div>;
  if (!desk) return <div aria-busy="true">{head}<div className="card"><Skeleton h={260} /></div></div>;
  if (!subject) return <>{head}<div className="card"><Empty icon={<Lightbulb size={26} weight="duotone" />} title="Pick a subject">Tutor insight is per class and subject.</Empty></div></>;
  const current = data && data.key === key ? data : null;
  if (!current) return <>{head}<div className="card"><Skeleton h={60} style={{ marginBottom: 14 }} /><Skeleton h={180} /></div></>;
  if (current.err || !current.insight) return <>{head}<div className="note err" role="alert">{current.err}</div></>;
  const ins = current.insight;
  const worked = ins.chapters.filter(c => c.sessions > 0);
  const sessions = worked.reduce((n, c) => n + c.sessions, 0);
  const depths = worked.map(c => c.depth).filter((d): d is number => d !== null);

  return (
    <>
      {head}
      <section className="card ti-summary" aria-label="Summary">
        <dl className="ti-facts">
          <div><dt>Chapters worked</dt><dd>{worked.length}</dd></div>
          <div><dt>Sessions finished</dt><dd>{sessions}</dd></div>
          <div><dt>Average depth</dt><dd style={{ color: depths.length ? hmColor(Math.round(depths.reduce((a, b) => a + b, 0) / depths.length)) : undefined }}>{depths.length ? Math.round(depths.reduce((a, b) => a + b, 0) / depths.length) : 'None yet'}</dd></div>
          <div><dt>Misconceptions seen</dt><dd>{ins.chapters.reduce((n, c) => n + c.misconceptions.length, 0)}</dd></div>
        </dl>
        {worked.length > 0 && (
          <div className="ti-heat" role="list" aria-label="Average tutor depth by chapter">
            {worked.map(c => (
              <a key={c.chapterKey} role="listitem" href={`#ti-${c.chapterKey.replace(/\s+/g, '-')}`} className="ti-cell"
                style={{ background: c.depth !== null ? `color-mix(in srgb, ${hmColor(c.depth)} 22%, #fff)` : 'var(--body)', borderColor: c.depth !== null ? hmColor(c.depth) : 'var(--line)' }}
                title={`${c.name}: depth ${c.depth ?? 'n/a'}, ${c.students} students`}>
                <b>{c.depth ?? '-'}</b><span>{c.name}</span>
              </a>
            ))}
          </div>
        )}
      </section>
      {ins.chapters.length ? ins.chapters.map(c => <ChapterCard key={c.chapterKey} c={c} cls={cls} subject={subject} subjectKey={ins.subjectKeys[0]} call={call} />) : (
        <div className="card"><Empty icon={<Lightbulb size={26} weight="duotone" />} title="No tutor sessions yet">
          As students in {cls} finish Socratic sessions in {subject}, the chapters, misconceptions and depth appear here.
        </Empty></div>
      )}
    </>
  );
}

const names = (xs: InsightStudent[], max = 4) => xs.slice(0, max).map(s => s.name.split(' ')[0]).join(', ') + (xs.length > max ? ` and ${xs.length - max} more` : '');

function ChapterCard({ c, cls, subject, subjectKey, call }: { c: InsightChapter; cls: string; subject: string; subjectKey: string; call: (m: 'POST' | 'PATCH', b: unknown) => Promise<void> }) {
  return (
    <section className="card ti-ch" id={`ti-${c.chapterKey.replace(/\s+/g, '-')}`} aria-label={c.name}>
      <div className="ti-ch-h">
        <h2>{c.name}</h2>
        <div className="ti-chips">
          {c.sessions > 0 ? <>
            <Chip tone="b">{c.sessions} {c.sessions === 1 ? 'SESSION' : 'SESSIONS'}</Chip>
            <Chip tone="b">{c.students} {c.students === 1 ? 'STUDENT' : 'STUDENTS'}</Chip>
            {c.depth !== null && <span className="ti-depth" style={{ color: hmColor(c.depth) }}>Depth {c.depth}</span>}
          </> : <Chip tone="n">NO SESSIONS YET</Chip>}
        </div>
      </div>
      <div className="ti-cols">
        <div>
          <h3>Misconceptions seen</h3>
          {c.misconceptions.length ? (
            <ul className="ti-list">
              {c.misconceptions.map(m => <li key={m.id}><b>{m.label}</b><span>{m.students.length} {m.students.length === 1 ? 'student' : 'students'}: {names(m.students)}</span></li>)}
            </ul>
          ) : <p className="muted ti-none">{c.sessions ? 'None tagged in finished sessions.' : 'Appears as students finish sessions.'}</p>}
        </div>
        <div>
          <h3>Struggling</h3>
          {c.struggling.length ? (
            <ul className="ti-list">
              {c.struggling.map(s => (
                <li key={s.id}><b>{s.name}</b><span>Latest depth under 50. <Link href={`/teacher/mastery?${new URLSearchParams({ class: cls, subject, student: s.id })}`}>Open in Mastery Tracker</Link></span></li>
              ))}
            </ul>
          ) : <p className="muted ti-none">{c.sessions ? 'Nobody’s latest session is under 50.' : 'Nothing yet.'}</p>}
        </div>
      </div>
      <Bank c={c} cls={cls} subject={subject} subjectKey={subjectKey} call={call} />
    </section>
  );
}

function Bank({ c, cls, subject, subjectKey, call }: { c: InsightChapter; cls: string; subject: string; subjectKey: string; call: (m: 'POST' | 'PATCH', b: unknown) => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const active = c.bank.filter(b => b.status === 'active').length;
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn(); setEditing(null); setLabel(''); setDesc(''); } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); } };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run(() => editing && editing !== 'new'
      ? call('PATCH', { id: editing, class: cls, subject, label, description: desc })
      : call('POST', { class: cls, subject, subjectKey, chapter: c.name, label, description: desc }));
  };
  return (
    <details className="ti-bank">
      <summary>Misconception bank <span className="muted">{active} active{c.bank.length > active ? `, ${c.bank.length - active} retired` : ''}</span></summary>
      <p className="muted ti-none">The tutor tags only these. Edit the wording, retire ones that don’t fit your class, or add what you see in lessons.</p>
      {c.bank.length > 0 && (
        <ul className="ti-list ti-bank-list">
          {c.bank.map(b => (
            <li key={b.id} className={b.status === 'retired' ? 'retired' : undefined}>
              <b>{b.label}</b>
              <span>{b.description || (b.source === 'ai' ? 'Suggested by the tutor.' : 'Added by a teacher.')}</span>
              <div className="ti-acts">
                <Chip tone={b.source === 'ai' ? 'n' : 'p'}>{b.source === 'ai' ? 'AI' : 'TEACHER'}</Chip>
                {b.status === 'active' && <button className="btn sm" disabled={busy} onClick={() => { setEditing(b.id); setLabel(b.label); setDesc(b.description); }}>Edit</button>}
                <button className="btn sm" disabled={busy} onClick={() => void run(() => call('PATCH', { id: b.id, class: cls, subject, status: b.status === 'active' ? 'retired' : 'active' }))}>{b.status === 'active' ? 'Retire' : 'Restore'}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <form className="ti-form" onSubmit={save}>
          <label>Misconception<input className="tin" value={label} maxLength={120} required minLength={3} onChange={e => setLabel(e.target.value)} placeholder="e.g. Thinks a bigger denominator means a bigger fraction" /></label>
          <label>How it shows up (optional)<input className="tin" value={desc} maxLength={400} onChange={e => setDesc(e.target.value)} /></label>
          <div className="ti-acts"><button className="btn sm pri" disabled={busy}>{editing === 'new' ? 'Add' : 'Save'}</button><button type="button" className="btn sm" onClick={() => setEditing(null)}>Cancel</button></div>
        </form>
      ) : <button className="btn sm" onClick={() => { setEditing('new'); setLabel(''); setDesc(''); }}>Add a misconception</button>}
      {msg && <div className="note err" role="alert" style={{ marginTop: 8 }}><Warning size={14} weight="bold" /> {msg}</div>}
    </details>
  );
}
