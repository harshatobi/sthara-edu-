'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { Chip, Skeleton } from '@/components/canon/ui';
import { ReasonAction, Section, Table, errText, fmtDateTime, num } from '../../_ui';
import { useOpsApi } from '../../useOpsApi';

interface Switch { key: string; label: string; note: string; ai: boolean; on: boolean }
interface Logins { role: string; total: number; never: number; week: number; month: number; banned: number; temp_password: number; no_login: number; left_school: number }
interface Check { key: string; table: string; count: number; sample: string[]; title: string; means: string; fix: 'support' | 'people' | 'classes' | 'teaching' }
interface Data {
  switches: Switch[]; aiEnabled: boolean; canSwitch: boolean; diagnosticsError: string | null;
  diagnostics: { logins: Logins[]; stuck: { id: string; role: string; name: string | null; email: string | null; state: string }[]; checks: Check[] } | null;
}
interface Verdict { email: string; id: string; role: string; lastSignIn: string | null; canSignIn: boolean; blockers: string[]; notes: string[] }

const ROLE: Record<string, string> = { admin: 'Office', teacher: 'Teachers', student: 'Students', parent: 'Parents' };
const STATE: Record<string, string> = { no_login: 'No login', banned: 'Blocked', never: 'Never signed in' };
const FIX: Record<Check['fix'], string> = { support: 'Support', people: 'People', classes: 'Classes & subjects', teaching: 'Teaching' };

/**
 * A school's Controls tab: switch parts of the product off for this school, see who can and cannot sign in,
 * find out why one account cannot, and run the data-integrity checks.
 */
export function ControlsTab({ schoolId, go, inspect, onChanged }: {
  schoolId: string; go: (tab: Check['fix']) => void;
  /** Opens a record in the Records tab (null when this operator has no access to it). */
  inspect: ((table: string, id: string) => void) | null;
  onChanged: (msg: string) => void;
}) {
  const api = useOpsApi();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    api<Data>(`/schools/${schoolId}/controls`).then(x => { setD(x); setErr(null); }).catch(e => setErr(errText(e)));
  }, [api, schoolId]);
  useEffect(() => { load(); }, [load]);

  if (err && !d) return <div className="note err" role="alert">{err}</div>;
  if (!d) return <div className="card">{[0, 1, 2].map(i => <Skeleton key={i} h={48} style={{ marginBottom: 12 }} />)}</div>;
  const off = d.switches.filter(s => !s.on).length;
  const diag = d.diagnostics;
  const failing = (diag?.checks ?? []).filter(c => c.count > 0);

  return (
    <>
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      <Section title="Switches" sub={`Turn one part of the product off for this school without suspending it. A change reaches every server within half a minute. ${off ? `${off} off now.` : 'Everything is on.'}`}>
        {!d.aiEnabled && <div className="note" style={{ marginBottom: 14 }}>All AI is off for this school (Subscription &amp; access), so the AI switches below make no difference until it is back on.</div>}
        <Table head={<tr><th>Part</th><th>Covers</th><th>State</th>{d.canSwitch && <th aria-label="Actions" />}</tr>}>
          {d.switches.map(s => (
            <tr key={s.key}>
              <td className="nm" style={{ whiteSpace: 'nowrap' }}>{s.label}</td>
              <td style={{ fontSize: 13.5 }}>{s.note}</td>
              <td>{s.on ? <Chip tone="g">ON</Chip> : <Chip tone="r">OFF</Chip>}</td>
              {d.canSwitch && (
                <td>
                  <ReasonAction label={s.on ? 'Turn off' : 'Turn on'} confirm={s.on ? `Turn ${s.label} off` : `Turn ${s.label} on`} danger={s.on}
                    run={async reason => {
                      await api(`/schools/${schoolId}/controls`, { method: 'PATCH', body: { key: s.key, on: !s.on, reason } });
                      onChanged(`${s.label} turned ${s.on ? 'off' : 'on'}.`); load();
                    }} />
                </td>
              )}
            </tr>
          ))}
        </Table>
        {!d.canSwitch && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Your role can see the switches but not change them.</p>}
      </Section>

      {d.diagnosticsError && <div className="note err" style={{ marginBottom: 18 }}>{d.diagnosticsError}</div>}
      {diag && (
        <>
          <Section title="Sign-in" sub="Who has signed in, and who cannot. People marked as having left are counted apart.">
            <Table head={<tr><th>Role</th><th className="r">Accounts</th><th className="r">Signed in, 7 days</th><th className="r">30 days</th><th className="r">Never</th><th className="r">Temporary password</th><th className="r">Blocked</th><th className="r">No login</th><th className="r">Left</th></tr>}>
              {diag.logins.map(l => (
                <tr key={l.role}>
                  <td className="nm">{ROLE[l.role] ?? l.role}</td>
                  <td className="r">{num(l.total)}</td><td className="r">{num(l.week)}</td><td className="r">{num(l.month)}</td>
                  <td className="r" style={l.never ? { color: '#B45309', fontWeight: 700 } : undefined}>{num(l.never)}</td>
                  <td className="r">{num(l.temp_password)}</td>
                  <td className="r" style={l.banned ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{num(l.banned)}</td>
                  <td className="r" style={l.no_login ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{num(l.no_login)}</td>
                  <td className="r">{num(l.left_school)}</td>
                </tr>
              ))}
            </Table>
            {diag.stuck.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div className="lbl">STAFF WHO CANNOT OR HAVE NOT SIGNED IN ({diag.stuck.length}{diag.stuck.length === 50 ? '+' : ''})</div>
                <Table head={<tr><th>Person</th><th>Role</th><th>State</th></tr>}>
                  {diag.stuck.map(s => (
                    <tr key={s.id}>
                      <td>{s.name || s.email ? <><div className="nm">{s.name || s.email}</div><div className="sub" style={{ overflowWrap: 'anywhere' }}>{s.email}</div></> : <span className="mono" style={{ fontSize: 12 }}>{s.id.slice(0, 8)}</span>}</td>
                      <td>{s.role === 'admin' ? 'Office' : 'Teacher'}</td>
                      <td><Chip tone={s.state === 'never' ? 'a' : 'r'}>{(STATE[s.state] ?? s.state).toUpperCase()}</Chip></td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
            <SignInCheck schoolId={schoolId} />
          </Section>

          <Section title="Data checks" sub={failing.length ? `${failing.length} of ${diag.checks.length} checks found something. Each is fixed from the tab named beside it.` : `All ${diag.checks.length} checks are clean.`}>
            <Table head={<tr><th>Check</th><th>Why it matters</th><th className="r">Found</th><th>Fix in</th><th>Examples</th></tr>}>
              {[...diag.checks].sort((a, b) => Number(b.count > 0) - Number(a.count > 0)).map(c => (
                <tr key={c.key}>
                  <td className="nm">{c.title}</td>
                  <td style={{ fontSize: 13, maxWidth: 380 }}>{c.means}</td>
                  <td className="r">{c.count ? <b style={{ color: '#B45309' }}>{num(c.count)}</b> : <CheckCircle size={17} weight="fill" color="#047857" aria-label="None" />}</td>
                  <td>{c.count ? <button className="btn sm" onClick={() => go(c.fix)}>{FIX[c.fix]}</button> : ''}</td>
                  <td>
                    <div className="acts" style={{ gap: 6 }}>
                      {c.sample.map(id => inspect
                        ? <button key={id} className="btn sm mono" title="Open in Records (needs an access window)" onClick={() => inspect(c.table, id)}>{id.slice(0, 8)}</button>
                        : <span key={id} className="mono" style={{ fontSize: 12 }}>{id.slice(0, 8)}</span>)}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </Section>
        </>
      )}
    </>
  );
}

function SignInCheck({ schoolId }: { schoolId: string }) {
  const api = useOpsApi();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState<Verdict | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null); setV(null);
    try { setV(await api<Verdict>(`/schools/${schoolId}/controls`, { method: 'POST', body: { email } })); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
      <div className="lbl">WHY CAN&apos;T THIS PERSON SIGN IN?</div>
      <form className="acts" onSubmit={check}>
        <input className="cmp-in" type="email" style={{ flex: '1 1 300px', width: 'auto' }} aria-label="Account email" placeholder="The account's email address" value={email} onChange={e => setEmail(e.target.value)} />
        <button className="btn pri" disabled={busy || !email.includes('@')}>{busy ? 'Checking…' : 'Check'}</button>
      </form>
      {err && <div className="note err" style={{ marginTop: 12 }} role="alert">{err}</div>}
      {v && (
        <div className={`note ${v.canSignIn ? 'info' : 'err'}`} style={{ marginTop: 12 }} role="status">
          <b>{v.email}</b> ({v.role}) {v.canSignIn ? 'can sign in.' : 'cannot sign in.'} Last sign-in: {v.lastSignIn ? fmtDateTime(v.lastSignIn) : 'never'}.
          {(v.blockers.length > 0 || v.notes.length > 0) && (
            <ul style={{ margin: '8px 0 0 18px', lineHeight: 1.6 }}>
              {v.blockers.map(b => <li key={b}><b>{b}</b></li>)}
              {v.notes.map(n => <li key={n}>{n}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
