'use client';

import { useState } from 'react';
import { LightbulbIcon as Lightbulb } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { Empty, Skeleton, hmColor } from '@/components/canon/ui';
import { useGet } from '@/components/canon/useGet';

/**
 * The child's recent AI tutor sessions for the parent (Socratic tutor PR3): what they worked on, how well they
 * understood it in plain words, what they showed, what to work on, and the next step. Never the conversation.
 */
interface S { id: string; subject: string | null; topic: string | null; hots: boolean; at: string; depth: number | null; strengths: string[]; toFix: string[]; next: string | null }

const words = (d: number | null) => d === null ? null : d >= 90 ? 'Excellent understanding' : d >= 75 ? 'Strong understanding' : d >= 50 ? 'Getting there' : d > 0 ? 'Needs more practice' : 'Ended early';

export default function TutorSummary({ childId, firstName }: { childId: string; firstName: string }) {
  const { data, error } = useGet<{ sessions: S[] }>(`/api/parent/tutor?child=${childId}`);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card pt-card" aria-labelledby="pt-h" style={{ marginTop: 18 }}>
      <h3 id="pt-h" className="pt-h"><Lightbulb size={18} weight="duotone" color="#7C5CFC" /> {firstName}&apos;s AI tutor sessions</h3>
      <p className="muted pt-sub">The tutor asks questions instead of giving answers. Here is what {firstName} showed in the last two months.</p>
      {error ? <div className="note err" role="alert">{error}</div> : !data ? <Skeleton h={90} /> : data.sessions.length ? (
        <ul className="pt-list">
          {data.sessions.map(s => {
            const isOpen = open === s.id;
            const w = words(s.depth);
            return (
              <li key={s.id}>
                <button className="pt-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
                  <span className="pt-t"><b>{s.topic ?? 'A chapter'}</b><span>{s.subject}{s.hots ? ', challenge level' : ''}, {new Date(s.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></span>
                  {w && <span className="pt-w" style={{ color: s.depth ? hmColor(s.depth) : undefined }}>{w}</span>}
                </button>
                {isOpen && (s.strengths.length || s.toFix.length || s.next) ? (
                  <div className="pt-body">
                    {s.strengths.length > 0 && <><b>What {firstName} showed</b><ul>{s.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
                    {s.toFix.length > 0 && <><b>To work on</b><ul>{s.toFix.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
                    {s.next && <><b>Next time</b><p>{s.next}</p></>}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : <Empty icon={<Lightbulb size={26} weight="duotone" />} title="No tutor sessions in the last two months">When {firstName} finishes a session with the AI tutor, what they showed appears here.</Empty>}
    </section>
  );
}
