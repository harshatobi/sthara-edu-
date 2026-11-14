'use client';

import { useEffect, useState } from 'react';
import { Chip, PageBar, Skeleton } from '@/components/canon/ui';
import { COMPETENCY_SHORT, QTYPE_LABEL, isChoice, type StudioItem } from '@/lib/studio/types';
import { LETTERS } from '@/lib/studio/handout';
import { Section, Table, errText, num } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Coverage { cls: string; subject: string; chapters: { name: string; seq: number; approved: number; unreviewed: number; target: number }[] }

/**
 * Platform Manager > Question bank: Sthara's starter bank for Classes 9-10 Science and Mathematics.
 * Fill a chapter (a dry run shows how many questions and the rough cost first), then review what was written:
 * every stored question already passed the separate solve, the computed-answer check and the syllabus check.
 */
export default function BankConsole() {
  const api = useOpsApi();
  const [cov, setCov] = useState<{ coverage: Coverage[]; usdPerItem: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ key: string; cls: string; subject: string; chapter: string; toWrite: number; estimateUsd: number } | null>(null);
  const [queue, setQueue] = useState<{ key: string; items: StudioItem[] } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<{ coverage: Coverage[]; usdPerItem: number }>('/bank?view=coverage').then(d => { if (live) setCov(d); }).catch(e => { if (live) setErr(errText(e)); });
    return () => { live = false; };
  }, [api, tick]);

  async function dry(cls: string, subject: string, chapter: string) {
    setBusy(`dry:${chapter}`); setErr(null);
    try { const r = await api<{ toWrite: number; estimateUsd: number }>('/bank', { method: 'POST', body: { class: cls, subject, chapter, dry: true } }); setPlan({ key: `${cls}|${subject}|${chapter}`, cls, subject, chapter, ...r }); }
    catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  }
  async function fill() {
    if (!plan) return;
    setBusy(`fill:${plan.chapter}`); setErr(null);
    try {
      const r = await api<{ stored: number; flagged: number }>('/bank', { method: 'POST', body: { class: plan.cls, subject: plan.subject, chapter: plan.chapter } });
      setNote(`${plan.chapter}: ${r.stored} questions stored for review${r.flagged ? `, ${r.flagged} failed the checks and were dropped` : ''}.`);
      setPlan(null); setTick(t => t + 1);
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  }
  async function review(cls: string, subject: string, chapter: string) {
    setBusy(`q:${chapter}`);
    try { const r = await api<{ items: StudioItem[] }>(`/bank?${new URLSearchParams({ view: 'queue', class: cls, subject, chapter })}`); setQueue({ key: `${cls}|${subject}|${chapter}`, items: r.items }); }
    catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  }
  async function decide(ids: string[], action: 'approve' | 'retire') {
    setBusy(action);
    try {
      await api('/bank', { method: 'PATCH', body: { ids, action } });
      setQueue(q => (q ? { ...q, items: q.items.filter(i => !ids.includes(i.id)) } : q));
      setTick(t => t + 1);
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  }

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Question bank" sub="Sthara's starter bank for every school: fill chapters with checked questions, then review them. Schools see unreviewed questions too, marked as such." />
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {note && <div className="note info" style={{ marginBottom: 12 }}>{note}</div>}
      {plan && (
        <Section title={`Fill ${plan.chapter}`} sub={`${plan.cls} ${plan.subject}`}>
          <p style={{ fontSize: 14 }}>{plan.toWrite ? <>Writes and checks <b>{num(plan.toWrite)}</b> questions, about <b>US${plan.estimateUsd.toFixed(2)}</b> (≈ ₹{num(Math.round(plan.estimateUsd * 95.5))}). Only questions that pass every check are stored.</> : 'This chapter is already full.'}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {plan.toWrite > 0 && <button className="btn pri" disabled={!!busy} onClick={fill}>{busy?.startsWith('fill') ? 'Writing and checking… (a few minutes)' : 'Fill this chapter'}</button>}
            <button className="btn" onClick={() => setPlan(null)}>Cancel</button>
          </div>
        </Section>
      )}
      {queue && (
        <Section title={`Review: ${queue.key.split('|')[2]}`} sub={`${queue.items.length} waiting`} actions={<>
          {queue.items.length > 0 && <button className="btn sm pri" disabled={!!busy} onClick={() => decide(queue.items.map(i => i.id), 'approve')}>Approve all shown</button>}
          <button className="btn sm" onClick={() => setQueue(null)}>Close</button>
        </>}>
          {!queue.items.length ? <p className="muted" style={{ fontSize: 14 }}>Nothing waiting here.</p> : queue.items.map((it, n) => (
            <div key={it.id} style={{ padding: '12px 0', borderTop: '1px solid #EEF2F7' }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{n + 1}. {it.text}</div>
              {isChoice(it.qtype) && it.options && <div style={{ fontSize: 13.5, marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 14px' }}>{it.options.map((o, k) => <span key={k} style={k === it.answer ? { color: '#0F7A55', fontWeight: 700 } : undefined}>{LETTERS[k]}. {o}</span>)}</div>}
              {it.scheme && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{it.scheme}</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                <Chip tone="n">{it.topic || 'General'}</Chip><Chip tone="n">{COMPETENCY_SHORT[it.competency]}</Chip><Chip tone="n">{QTYPE_LABEL[it.qtype]}, {it.marks}</Chip>
                {it.check.computed && <Chip tone="g">Answer computed</Chip>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button className="btn sm pri" disabled={!!busy} onClick={() => decide([it.id], 'approve')}>Approve</button>
                  <button className="btn sm" disabled={!!busy} onClick={() => decide([it.id], 'retire')}>Retire</button>
                </span>
              </div>
            </div>
          ))}
        </Section>
      )}
      {!cov ? <Skeleton h={400} /> : cov.coverage.map(c => (
        <Section key={`${c.cls}${c.subject}`} title={`${c.cls} ${c.subject}`} sub={`${c.chapters.reduce((n, x) => n + x.approved, 0)} approved, ${c.chapters.reduce((n, x) => n + x.unreviewed, 0)} waiting for review`}>
          <Table head={<tr><th>CHAPTER</th><th>APPROVED</th><th>WAITING</th><th>TARGET</th><th /></tr>}>
            {c.chapters.map(ch => (
              <tr key={ch.name}>
                <td>{ch.seq}. {ch.name}</td>
                <td>{ch.approved}</td>
                <td>{ch.unreviewed ? <button className="btn sm" disabled={!!busy} onClick={() => review(c.cls, c.subject, ch.name)}>{ch.unreviewed} to review</button> : 0}</td>
                <td>{ch.target}</td>
                <td style={{ textAlign: 'right' }}>{ch.approved + ch.unreviewed < ch.target && <button className="btn sm" disabled={!!busy} onClick={() => dry(c.cls, c.subject, ch.name)}>{busy === `dry:${ch.name}` ? 'Counting…' : 'Fill'}</button>}</td>
              </tr>
            ))}
          </Table>
        </Section>
      ))}
    </>
  );
}
