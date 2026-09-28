'use client';

/**
 * School health in the Platform Manager: the badge, the school workspace's Health
 * tab, the Overview ranking and the rule-based Ask box. Everything here is built
 * from counts (ops_school_metrics), never from named records.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { MagnifyingGlassIcon as MagnifyingGlass } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass';
import { Chip, Empty, type Tone } from '@/components/canon/ui';
import type { RegistrySchool } from '@/lib/ops/attention';
import { ASK_EXAMPLES, ask, type AskSchool } from '@/lib/ops/ask';
import { BAND_LABEL, PILLARS, scoreHealth, weekStart, type Band, type FixTab, type Health, type Role, type SchoolMetrics, type Severity } from '@/lib/ops/health';
import { effectivePrice } from '@/lib/settings/registry';
import { Section, Table, fmtDateTime, num } from './_ui';

export type { SchoolMetrics } from '@/lib/ops/health';

const BAND_TONE: Record<Band, Tone> = { strong: 'g', fair: 'b', weak: 'a', critical: 'r', setup: 'n', suspended: 'r' };
const BAND_INK: Record<Band, string> = { strong: '#047857', fair: '#1D4ED8', weak: '#B45309', critical: 'var(--red)', setup: 'var(--mut)', suspended: 'var(--red)' };
const SEV_TONE: Record<Severity, Tone> = { high: 'r', medium: 'a', low: 'n' };
const scoreBand = (s: number | null): Band => (s === null ? 'setup' : s >= 80 ? 'strong' : s >= 60 ? 'fair' : s >= 40 ? 'weak' : 'critical');

/** Health from a registry row and its metrics. Pilots have no price yet; others use the contract or list price. */
export function healthOf(f: RegistrySchool, m: SchoolMetrics, usdToInr: number): Health {
  return scoreHealth(m, {
    active: f.active, plan: f.plan, trialExpired: f.trialExpired, trialDaysLeft: f.trialDaysLeft,
    contractStudents: f.contractStudents, pricePerStudent: f.plan === 'pilot' ? null : effectivePrice(f), usdToInr,
  });
}

export function HealthBadge({ h }: { h: Health }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {h.score !== null && <b style={{ fontSize: 16, color: BAND_INK[h.band], minWidth: 26, textAlign: 'right' }}>{h.score}</b>}
      <Chip tone={BAND_TONE[h.band]}>{BAND_LABEL[h.band].toUpperCase()}</Chip>
    </span>
  );
}

function Meter({ score }: { score: number | null }) {
  const band = scoreBand(score);
  return (
    <div className="ops-bar" aria-hidden="true" style={{ height: 6 }}>
      <i style={{ width: `${score ?? 0}%`, background: BAND_INK[band] }} />
    </div>
  );
}

// ── School workspace: Health tab ──────────────────────────────────────────────

const ROLES: [Role, string][] = [['teacher', 'Teachers'], ['student', 'Students'], ['parent', 'Parents'], ['admin', 'Office']];

export function HealthTab({ health, metrics, go }: { health: Health; metrics: SchoolMetrics; go: (t: FixTab) => void }) {
  const weeks = useMemo(() => {
    const cur = weekStart(metrics.at);
    return [...new Set(metrics.weekly.map(w => w.week))].sort().slice(-6).map(w => ({ w, current: w === cur }));
  }, [metrics]);
  const findingsBy = (k: string) => health.findings.filter(f => f.pillar === k);

  return (
    <>
      <div className="g2" style={{ gridTemplateColumns: 'minmax(220px, 300px) 1fr', alignItems: 'stretch' }}>
        <Section title="Health" sub={`Counts only · as of ${fmtDateTime(metrics.at)}`}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, color: BAND_INK[health.band] }}>{health.score ?? '—'}</div>
          <div style={{ marginTop: 10 }}><Chip tone={BAND_TONE[health.band]}>{BAND_LABEL[health.band].toUpperCase()}</Chip></div>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 12 }}>
            {health.band === 'setup' ? 'Scored once the school has students.' : health.band === 'suspended' ? 'Not scored while suspended.'
              : 'Adoption 35%, Operations 25%, Data quality 20%, Commercial 20%. A pillar with nothing to measure yet is left out.'}
          </p>
        </Section>
        <Section title="What needs doing" sub={health.findings.length ? `${health.findings.length} findings, most serious first` : undefined}>
          {!health.findings.length ? <Empty icon={<CheckCircle size={26} weight="duotone" />} title="Nothing is pulling this school down" /> : (
            <div>
              {health.findings.slice(0, 8).map(f => (
                <div key={f.id} className="row" style={{ alignItems: 'flex-start' }}>
                  <Chip tone={SEV_TONE[f.severity]}>{f.severity.toUpperCase()}</Chip>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{f.title}</div>
                    {f.detail && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{f.detail}</div>}
                  </div>
                  {f.tab && <button className="btn sm" onClick={() => go(f.tab!)}>Fix <ArrowRight size={12} weight="bold" /></button>}
                </div>
              ))}
              {health.findings.length > 8 && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{health.findings.length - 8} more below, by pillar.</p>}
            </div>
          )}
        </Section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18, marginBottom: 18 }}>
        {health.pillars.map(p => (
          <section key={p.key} className="card" aria-label={`${p.label} pillar`} style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <h3 style={{ fontSize: 14, margin: 0, flex: 1 }}>{p.label} <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>· {p.weight}%</span></h3>
              <b style={{ fontSize: 22, color: BAND_INK[scoreBand(p.score)] }}>{p.score ?? '—'}</b>
            </div>
            <div style={{ margin: '8px 0 12px' }}><Meter score={p.score} /></div>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '0 0 10px' }}>{PILLARS.find(x => x.key === p.key)?.about}</p>
            {p.measures.length ? p.measures.map(x => (
              <div key={x.label} style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '4px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ flex: 1 }}>{x.label}</span>
                <span className="muted" style={{ whiteSpace: 'nowrap' }}>{x.value}</span>
              </div>
            )) : <p className="muted" style={{ fontSize: 12.5 }}>Nothing to measure yet.</p>}
            {findingsBy(p.key).length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--mut)' }}>{findingsBy(p.key).length} finding{findingsBy(p.key).length === 1 ? '' : 's'}</div>
            )}
          </section>
        ))}
      </div>

      <div className="g2">
        <Section title="Adoption by role" sub="Signed in is from the login record. Active means they did something: submitted, set or graded work, marked attendance, messaged, recorded a payment.">
          <Table head={<tr><th>Role</th><th className="r">People</th><th className="r">Signed in, 7 d</th><th className="r">Active, 7 d</th><th className="r">Active, 30 d</th><th className="r">Never signed in</th></tr>}>
            {ROLES.filter(([k]) => metrics.roles[k]?.total).map(([k, l]) => {
              const s = metrics.roles[k]!;
              const pctOf = (n: number) => `${Math.round((n / s.total) * 100)}%`;
              return (
                <tr key={k}>
                  <td className="nm">{l}</td>
                  <td className="r num">{num(s.total)}</td>
                  <td className="r num">{num(s.signedIn7)} <span className="muted">{pctOf(s.signedIn7)}</span></td>
                  <td className="r num"><b>{num(s.active7)}</b> <span className="muted">{pctOf(s.active7)}</span></td>
                  <td className="r num">{num(s.active30)}</td>
                  <td className="r num" style={{ color: s.never ? 'var(--red)' : undefined }}>{num(s.never)}</td>
                </tr>
              );
            })}
          </Table>
        </Section>
        <Section title="Active people by week" sub="Distinct people who did something each week (Monday start). The current week is still running.">
          {!weeks.length ? <p className="muted" style={{ fontSize: 13 }}>No activity in the last 8 weeks.</p> : (
            <Table head={<tr><th>Role</th>{weeks.map(w => <th key={w.w} className="r">{w.w.slice(8)}/{w.w.slice(5, 7)}{w.current ? '*' : ''}</th>)}</tr>}>
              {ROLES.filter(([k]) => metrics.roles[k]?.total).map(([k, l]) => (
                <tr key={k}>
                  <td className="nm">{l}</td>
                  {weeks.map(w => <td key={w.w} className="r num">{metrics.weekly.find(x => x.week === w.w && x.role === k)?.active ?? 0}</td>)}
                </tr>
              ))}
            </Table>
          )}
        </Section>
      </div>

      {metrics.classes.length > 0 && (
        <Section title="Students active by class" sub="Last 7 days.">
          <Table head={<tr><th>Class</th><th className="r">Students</th><th className="r">Active</th><th style={{ width: '40%' }}>Share</th></tr>}>
            {metrics.classes.map(c => {
              const share = c.students ? Math.round((c.active7 / c.students) * 100) : null;
              return (
                <tr key={c.name}>
                  <td className="nm">{c.name}</td>
                  <td className="r num">{num(c.students)}</td>
                  <td className="r num">{num(c.active7)}</td>
                  <td>{share === null ? <span className="muted">No students</span> : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1 }}><Meter score={share} /></div><span className="num" style={{ fontSize: 12, minWidth: 34 }}>{share}%</span></div>
                  )}</td>
                </tr>
              );
            })}
          </Table>
        </Section>
      )}
    </>
  );
}

/** A compact health card for the workspace Overview tab. */
export function HealthCard({ health, open }: { health: Health; open: () => void }) {
  return (
    <Section title="Health" actions={<button className="btn sm" onClick={open}>Details <ArrowRight size={13} weight="bold" /></button>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: BAND_INK[health.band] }}>{health.score ?? '—'}</div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 14px' }}>
          {health.pillars.map(p => (
            <div key={p.key} style={{ fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{p.label}</span><b>{p.score ?? '—'}</b></div>
              <Meter score={p.score} />
            </div>
          ))}
        </div>
      </div>
      {health.findings.slice(0, 3).map(f => (
        <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '5px 0' }}>
          <Chip tone={SEV_TONE[f.severity]}>{f.severity.toUpperCase()}</Chip><span>{f.title}</span>
        </div>
      ))}
    </Section>
  );
}

// ── Overview: ranking and Ask ─────────────────────────────────────────────────

export function SchoolHealthSection({ schools, metrics, usdToInr }: { schools: RegistrySchool[]; metrics: Record<string, SchoolMetrics> | null; usdToInr: number }) {
  const router = useRouter();
  const rows: AskSchool[] = useMemo(() => !metrics ? [] : schools.filter(s => metrics[s.id]).map(s => ({
    id: s.id, name: s.name, plan: s.plan, active: s.active, testSchool: s.testSchool, trialDaysLeft: s.trialDaysLeft, trialExpired: s.trialExpired,
    contractStudents: s.contractStudents, metrics: metrics[s.id], usdToInr, health: healthOf(s, metrics[s.id], usdToInr),
  })), [schools, metrics, usdToInr]);
  const [showTest, setShowTest] = useState(false);
  const ranked = rows.filter(r => showTest || !r.testSchool)
    .sort((a, b) => (a.health.score ?? 101) - (b.health.score ?? 101) || a.name.localeCompare(b.name));

  if (!metrics) {
    return <Section title="School health"><div className="note err">School health isn&apos;t available: the ops_school_metrics function is missing from the database.</div></Section>;
  }
  return (
    <Section title="School health" sub="Weakest first. Counts only: adoption, operations, data quality and commercial."
      actions={rows.some(r => r.testSchool) ? <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={showTest} onChange={e => setShowTest(e.target.checked)} /> Show test schools</label> : undefined}>
      <AskBox schools={rows} includeTest={showTest} />
      {!ranked.length ? <Empty icon={<CheckCircle size={26} weight="duotone" />} title="No schools to score yet" /> : (
        <Table head={<tr><th>School</th><th className="r">Health</th>{PILLARS.map(p => <th key={p.key} className="r">{p.label}</th>)}<th>Top finding</th></tr>}>
          {ranked.map(r => (
            <tr key={r.id} className="click" onClick={() => router.push(`/ops/schools/${r.id}?tab=health`)}>
              <td className="nm">{r.name}{r.testSchool && <div className="sub">Test school</div>}</td>
              <td className="r"><HealthBadge h={r.health} /></td>
              {r.health.pillars.map(p => <td key={p.key} className="r num" style={{ color: BAND_INK[scoreBand(p.score)] }}>{p.score ?? '—'}</td>)}
              <td style={{ fontSize: 12.5 }}>{r.health.findings[0]?.title ?? <span className="muted">None</span>}</td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function AskBox({ schools, includeTest }: { schools: AskSchool[]; includeTest?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const answer = useMemo(() => (asked ? ask(asked, schools, { includeTest }) : null), [asked, schools, includeTest]);
  const run = (text: string) => { setQ(text); setAsked(text.trim() || null); };

  let body: ReactNode = null;
  if (answer && !answer.ok) {
    body = (
      <div className="note" role="status" style={{ marginTop: 10 }}>
        {answer.reading} Try one of these:
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {answer.help!.map(h => <button key={h} type="button" className="btn sm" onClick={() => run(h)}>{h}</button>)}
        </div>
      </div>
    );
  } else if (answer) {
    body = (
      <div style={{ marginTop: 10 }}>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 6px' }}>Read as: {answer.reading} · {answer.rows.length} {answer.rows.length === 1 ? 'school' : 'schools'}</p>
        {answer.rows.length ? (
          <Table head={<tr><th>School</th><th className="r">{answer.metric!.label}</th></tr>}>
            {answer.rows.map(r => (
              <tr key={r.id} className="click" onClick={() => router.push(`/ops/schools/${r.id}?tab=health`)}>
                <td className="nm">{r.name}</td><td className="r num"><b>{r.display}</b></td>
              </tr>
            ))}
          </Table>
        ) : <p style={{ fontSize: 13 }}>No school matches.</p>}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <form onSubmit={e => { e.preventDefault(); run(q); }} style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <MagnifyingGlass size={15} weight="bold" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--mut)' }} aria-hidden="true" />
          <input className="cmp-in" style={{ paddingLeft: 34, width: '100%' }} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Ask about your schools, e.g. which schools have fee collection under 50%?" aria-label="Ask about your schools" />
        </div>
        <button className="btn pri" disabled={!q.trim()}>Ask</button>
        {asked && <button type="button" className="btn" onClick={() => { setQ(''); setAsked(null); }}>Clear</button>}
      </form>
      {!asked && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {ASK_EXAMPLES.slice(0, 4).map(h => <button key={h} type="button" className="btn sm" onClick={() => run(h)}>{h}</button>)}
        </div>
      )}
      {body}
    </div>
  );
}
