'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chip, PageBar, Skeleton } from '@/components/canon/ui';
import { PASSWORD_MIN, passwordProblem } from '@/lib/ops/password';
import { ROLE_INFO, roleLabel, type OperatorRole } from '@/lib/ops/roles';
import { Facts, Section, errText } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Me { email: string; role: OperatorRole; mustChangePassword: boolean }

/** Platform Manager > My account: who you are signed in as, and your own password. */
export default function AccountConsole() {
  const api = useOpsApi();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { api<Me>('/me').then(setMe).catch(e => setErr(errText(e))); }, [api]);

  const problem = next ? passwordProblem(next, current, me?.email ?? '') ?? (again && again !== next ? 'The two new passwords do not match.' : null) : null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null); setDone(false);
    try {
      await api('/me', { method: 'POST', body: { current, next } });
      setCurrent(''); setNext(''); setAgain(''); setDone(true);
      setMe(m => (m ? { ...m, mustChangePassword: false } : m));
      router.refresh(); // clears the temporary-password notice
    } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="My account" sub="Your own sign-in. Your role and territories are set by the director on the Operators page." />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      <Section title="Signed in as">
        {!me ? <Skeleton h={60} /> : (
          <Facts rows={[
            ['Email', me.email],
            ['Role', <>{roleLabel(me.role)} {me.mustChangePassword && <Chip tone="a">TEMPORARY PASSWORD</Chip>}</>],
            ['What the role is for', ROLE_INFO[me.role].note],
          ]} />
        )}
      </Section>
      <Section title="Change password" sub={`At least ${PASSWORD_MIN} characters, with letters and a digit. You stay signed in here; other devices stay signed in until their session runs out.`}>
        {done && <div className="note info" style={{ marginBottom: 14 }} role="status">Password changed.</div>}
        <form onSubmit={submit} style={{ maxWidth: 460, display: 'grid', gap: 14 }}>
          <div>
            <label className="lbl" htmlFor="pw-cur">CURRENT PASSWORD</label>
            <input id="pw-cur" type="password" autoComplete="current-password" className="cmp-in" required value={current} onChange={e => setCurrent(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="pw-new">NEW PASSWORD</label>
            <input id="pw-new" type="password" autoComplete="new-password" className="cmp-in" required minLength={PASSWORD_MIN} maxLength={128} value={next} onChange={e => setNext(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="pw-again">NEW PASSWORD AGAIN</label>
            <input id="pw-again" type="password" autoComplete="new-password" className="cmp-in" required value={again} onChange={e => setAgain(e.target.value)} />
          </div>
          {problem && <div className="note" role="status">{problem}</div>}
          <div className="acts">
            <button className="btn pri" disabled={busy || !current || !next || next !== again || !!problem}>{busy ? 'Changing…' : 'Change password'}</button>
          </div>
        </form>
      </Section>
    </>
  );
}
