'use client';

import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { Bar, Chip, Empty, PageBar, Skeleton, hmColor, type Tone } from '@/components/canon/ui';
import DemoNote from '@/components/canon/DemoNote';
import { useAuth } from '@/contexts/AuthContext';
import { useStudentDesk } from '@/lib/student/useStudentDesk';
import { dmy, subjectColor } from '@/lib/student/shape';
import type { EvidenceKind, SubjectMastery } from '@/lib/student/types';
import MasteryTree, { GATE_LABEL } from './MasteryTree';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import { subjectIcon } from '@/components/canon/subjectIcon';

const KIND_TONE: Record<EvidenceKind, Tone> = { Homework: 'n', Quiz: 'b', Classwork: 'n', Tutor: 'p' };

export default function MasteryPage() {
  return <Suspense fallback={<MasterySkeleton />}><Mastery /></Suspense>;
}

function Mastery() {
  const { desk, error, reload } = useStudentDesk();
  const { profile, getAuthToken } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!desk) return <MasterySkeleton />;

  if (desk.subjects.length === 0) {
    return (
      <>
        <PageBar eyebrow="MASTERY TRACKER" title="Your TML Breakdown" sub="Every score that feeds your True Mastery Level, and how much it counts." />
        <div className="card">
          <Empty icon={<InteractiveIcon icon={ChartLineUp} color="#3B82F6" size={32} active />} title="No evidence yet">
            Your TML starts building as soon as your first assignment or quiz is graded.
          </Empty>
        </div>
      </>
    );
  }

  const wanted = params.get('subject');
  const m: SubjectMastery = desk.subjects.find(s => s.subject.toLowerCase() === wanted?.toLowerCase()) 
    // Canon opens on Mathematics (mockup MSUBJ default) when there's no explicit pick.
    ?? desk.subjects.find(s => s.subject === 'Mathematics') ?? desk.subjects[0];
  const pick = (s: string) => router.replace(`${pathname}?subject=${encodeURIComponent(s)}`, { scroll: false });

  const items = m.topics.flatMap(t => t.items);
  const graded = items.filter(i => i.pct !== null);
  const firm = m.topics.filter(t => t.gate === 'firm').length;
  const chrono = [...items].sort((a, b) => (b.at ? new Date(b.at).getTime() : 0) - (a.at ? new Date(a.at).getTime() : 0));

  // Recompute through /api/tml/compute (the same engine teachers' views read), then reload.
  const refresh = async () => {
    if (!profile) return;
    setRefreshing(true); setRefreshMsg(null);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/tml/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ studentId: profile.uid }),
      });
      if (!res.ok) throw new Error();
      reload();
      setRefreshMsg('Recomputed from your latest graded work.');
    } catch {
      setRefreshMsg('Could not recompute right now. Your last computed TML is still shown.');
    } finally {
      setRefreshing(false);
    }
  };

  const COMPONENTS: [string, string, number | null][] = [
    ['Homework & classwork, from your photos + your teacher', '40% of the academic score', m.components.homework],
    ['Quizzes & tests, timed', '40% of the academic score', m.components.quiz],
    ['AI Tutor depth — how independently you got there', '20% of the academic score', m.components.tutor],
  ];

  return (
    <>
      {desk.mode === 'demo' && <DemoNote />}
      <PageBar
        eyebrow="MASTERY TRACKER"
        title="Your TML Breakdown"
        sub="Every score that feeds your True Mastery Level, and how much it counts."
        actions={<>
          <Chip tone={desk.mode === 'live' ? 'g' : 'n'} title="Computed by the same TML engine your teachers' views read — not a separate estimate">
            <CheckCircle size={13} weight="fill" /> {desk.mode === 'live' ? 'Live' : 'Demo'} · TML engine
          </Chip>
          {desk.mode === 'live' && (
            <button className="btn" onClick={refresh} disabled={refreshing}>
              <ArrowsClockwise size={15} weight="bold" /> {refreshing ? 'Recomputing…' : 'Recompute'}
            </button>
          )}
        </>}
      />
      {refreshMsg && <div className="note info" style={{ marginBottom: 18 }} role="status">{refreshMsg}</div>}

      <div className="tabs" role="tablist" aria-label="Subject">
        {desk.subjects.map(s => (
          <button key={s.subject} role="tab" aria-selected={s === m} className={`tab${s === m ? ' on blue' : ''}`} onClick={() => pick(s.subject)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <InteractiveIcon icon={subjectIcon(s.subject)} color={s === m ? '#fff' : subjectColor(s.subject)} size={16} active={s === m} />
            {s.subject}
          </button>
        ))}
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="lb">{m.subject.toUpperCase()} TML</div>
          <div className="vl" style={{ color: m.tml !== null ? hmColor(m.tml) : 'var(--mut2)' }}>{m.tml !== null ? `${m.tml}%` : '—'}</div>
          <div className="nt" style={{ color: 'var(--mut)' }}>{m.note}</div>
        </div>
        <div className="kpi">
          <div className="lb">WEAKEST TOPIC</div>
          <div className="vl" style={{ fontSize: 24 }}>{m.weakest?.name ?? '—'}</div>
          <div className="nt" style={{ color: m.weakest?.score != null ? hmColor(m.weakest.score) : 'var(--mut)' }}>
            {m.weakest ? `${m.weakest.score}% · ${GATE_LABEL[m.weakest.gate]}` : 'Nothing scored yet'}
          </div>
        </div>
        <div className="kpi">
          <div className="lb">EVIDENCE ITEMS</div>
          <div className="vl">{graded.length}</div>
          <div className="nt" style={{ color: 'var(--mut)' }}>
            Across {m.topics.length} topic{m.topics.length === 1 ? '' : 's'}{items.length > graded.length ? ` · ${items.length - graded.length} still pending` : ''}
          </div>
        </div>
        <div className="kpi">
          <div className="lb">CONFIDENCE</div>
          <div className="vl" style={{ fontSize: 30 }}>{firm} of {m.topics.length}</div>
          <div className="nt" style={{ color: 'var(--mut)' }}>Topics confirmed — five or more graded pieces each</div>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>What goes into this</h3>
          <p className="muted" style={{ marginBottom: 18 }}>
            Your {m.subject} TML blends these together, and leans more on whichever ones you actually have evidence for.
          </p>
          {COMPONENTS.map(([name, weight, v]) => (
            <div key={name} className="row">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{weight}</div>
              </div>
              {v !== null ? <Bar value={v} /> : <div className="bar" />}
              <b style={{ width: 50, textAlign: 'right', fontSize: 14, color: v !== null ? hmColor(v) : 'var(--mut2)' }}>{v !== null ? `${v}%` : '—'}</b>
            </div>
          ))}
          <div className="note" style={{ marginTop: 16 }}>
            Those three make up 70% of your TML. The other 30% is attendance (10%), how you engage in class (10%), app use (5%) and
            how often you practise with the AI Tutor (5%). Older work counts for a little less — a score&apos;s weight halves every two weeks —
            and so does needing hints to get there.
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>What fed this score</h3>
          <p className="muted" style={{ marginBottom: 18 }}>Every {m.subject.toLowerCase()} assignment, quiz, test and tutor session behind your TML.</p>
          {chrono.map((e, i) => (
            <div key={i} className="row">
              <Chip tone={KIND_TONE[e.kind]}><span style={{ minWidth: 64, textAlign: 'center' }}>{e.kind}</span></Chip>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{e.title}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{e.pct === null && e.label === 'Not started' ? `Due ${dmy(e.at)}` : dmy(e.at)}</div>
              </div>
              <b style={{ fontSize: 14, color: e.pct === null ? 'var(--mut2)' : undefined }}>{e.label}</b>
            </div>
          ))}
        </div>
      </div>

      <h3 className="sec"><span className="dot" style={{ background: 'var(--pale)', color: 'var(--blue)' }}><ArrowRight size={14} weight="bold" /></span>How your {m.subject} TML was built</h3>
      <div className="card">
        <p className="muted">Each assignment, quiz and tutor session merges into the topic it belongs to. Every topic then merges into your {m.subject} True Mastery Level.</p>
        <div className="tlegend" style={{ marginTop: 16 }}>
          <span><i style={{ background: hmColor(90) }} />Assignment, quiz or tutor score</span>
          <span><i style={{ background: hmColor(60), width: 15, height: 15 }} />Topic score</span>
          <span><i style={{ background: '#fff', border: '2px dashed var(--line)' }} />Not graded yet</span>
          <span><i className="sq" style={{ background: 'var(--ink)' }} />Subject TML</span>
        </div>
        <div className="tree-wrap"><MasteryTree m={m} /></div>
        <div className="note" style={{ marginTop: 12 }}>
          Items on the same topic merge into one topic score — that&apos;s why a strong quiz can offset a weaker homework before either reaches your TML.
          {m.topics.some(t => t.gate !== 'firm') && <> Topics marked <b>Still building</b> have fewer than five graded pieces, so expect them to move.</>}
        </div>
        {m.computedAt && <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>Last computed {dmy(m.computedAt)}.</p>}
      </div>
    </>
  );
}

function MasterySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading mastery">
      <Skeleton h={104} style={{ borderRadius: 20, marginBottom: 22 }} />
      <Skeleton h={54} w={520} style={{ borderRadius: 14, marginBottom: 20 }} />
      <div className="kpis">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={140} style={{ borderRadius: 20 }} />)}</div>
      <div className="g2"><Skeleton h={380} style={{ borderRadius: 20 }} /><Skeleton h={380} style={{ borderRadius: 20 }} /></div>
    </div>
  );
}
