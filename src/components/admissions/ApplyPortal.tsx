'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyIcon as Key } from '@phosphor-icons/react/dist/ssr/Key';
import { WhatsappLogoIcon as WhatsappLogo } from '@phosphor-icons/react/dist/ssr/WhatsappLogo';
import { SignOutIcon as SignOut } from '@phosphor-icons/react/dist/ssr/SignOut';
import { PageBar, Skeleton } from '@/components/canon/ui';
import { CardHead, Field } from '@/components/admin/kit';
import FamilyApplications, { type Send } from './FamilyApplications';
import '@/styles/canon.css';

interface Me {
  school: { name: string; code: string; open: boolean; note: string | null; phoneSignIn: boolean };
  me: { kind: 'phone' | 'code'; label: string } | null;
}

class SignedOut extends Error {}

/** The apply page for families without a Sthara login: sign in, then the family's applications. */
export default function ApplyPortal({ code }: { code: string }) {
  const [state, setState] = useState<Me | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce(n => n + 1), []);

  const post = useCallback(async <T,>(body: Record<string, unknown>): Promise<T> => {
    const res = await fetch('/api/apply', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, school: code }) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && json?.code === 'signed_out') throw new SignedOut(json.error);
    if (!res.ok) throw new Error(json?.error || 'Something went wrong. Try again.');
    return json as T;
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    post<Me>({ action: 'me' })
      .then(r => { if (!cancelled) setState(r); })
      .catch(e => { if (!cancelled) setFatal(e instanceof Error ? e.message : 'Could not load the page.'); });
    return () => { cancelled = true; };
  }, [post, nonce]);

  // A session that ended (four hours, or the office ended the code) goes back to signing in.
  const send: Send = useCallback(async body => {
    try { return await post(body); } catch (e) { if (e instanceof SignedOut) refresh(); throw e; }
  }, [post, refresh]) as Send;

  return (
    <div className="canon" data-role="parent">
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap" />
      <main id="canon-main" style={{ maxWidth: 980, margin: '0 auto', width: '100%' }}>
        <PageBar eyebrow="APPLY FOR ADMISSION" title={state?.school.name ?? 'Apply for admission'}
          actions={state?.me && (
            <button className="btn sm" onClick={async () => { await post({ action: 'sign-out' }).catch(() => null); refresh(); }}>
              <SignOut size={14} /> Sign out ({state.me.label})
            </button>
          )} />
        {fatal ? <div className="note err" role="alert">{fatal}</div>
          : !state ? <div className="card"><Skeleton h={22} style={{ marginBottom: 14 }} /><Skeleton h={22} /></div>
          : (<>
            {state.school.note && <div className="note" style={{ marginBottom: 16, whiteSpace: 'pre-line' }}>{state.school.note}</div>}
            {state.me
              ? <FamilyApplications key={state.me.label} send={send} canCreate={state.me.kind === 'phone' && state.school.open} startOpen={state.me.kind === 'code'}
                closedNote={state.me.kind === 'code' ? 'Your access code is for this application. To apply for another child, ask the admissions office.' : 'The school isn’t taking new applications online at the moment.'} />
              : <SignIn school={state.school} post={post} onIn={refresh} />}
          </>)}
        <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 28 }}>Powered by Sthara · The Institutional OS</p>
      </main>
    </div>
  );
}

function SignIn({ school, post, onIn }: { school: Me['school']; post: <T>(b: Record<string, unknown>) => Promise<T>; onIn: () => void }) {
  const [how, setHow] = useState<'phone' | 'code'>(school.phoneSignIn && school.open ? 'phone' : 'code');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState<{ phone: string; testCode?: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [access, setAccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await f(); } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); }
  };
  const phoneOk = school.phoneSignIn && school.open;
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <CardHead title="Sign in to apply" sub="No account needed. Your application is saved as you go, so you can come back to it." />
      {phoneOk && (
        <div className="seg" role="tablist" aria-label="How to sign in" style={{ marginBottom: 16 }}>
          <button role="tab" aria-selected={how === 'phone'} className={how === 'phone' ? 'on' : ''} onClick={() => { setHow('phone'); setErr(null); }}><WhatsappLogo size={14} /> With my phone</button>
          <button role="tab" aria-selected={how === 'code'} className={how === 'code' ? 'on' : ''} onClick={() => { setHow('code'); setErr(null); }}><Key size={14} /> I have an access code</button>
        </div>
      )}
      {!phoneOk && (
        <p style={{ fontSize: 14, margin: '0 0 14px' }}>
          {school.open ? 'Ask the admissions office for an access code, then enter it here.' : 'The school isn’t taking new applications online at the moment. If the admissions office gave you an access code, enter it here.'}
        </p>
      )}
      {how === 'phone' && phoneOk ? (
        !sent ? (<>
          <Field label="MOBILE NUMBER (WHATSAPP)" htmlFor="ap-phone" hint="We send a 6-digit code on WhatsApp.">
            <input id="ap-phone" className="cmp-in" inputMode="tel" autoComplete="tel" maxLength={20} value={phone} onChange={e => setPhone(e.target.value)} />
          </Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, margin: '4px 0 14px' }}>
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I agree to {school.name} contacting me on WhatsApp about this application.</span>
          </label>
          <button className="btn pri" disabled={busy || !phone.trim() || !consent}
            onClick={() => run(async () => setSent(await post<{ phone: string; testCode?: string }>({ action: 'otp-start', phone, consent })))}>
            {busy ? 'Sending…' : 'Send me a code'}
          </button>
        </>) : (<>
          <p style={{ fontSize: 14, margin: '0 0 12px' }}>We sent a code to <b>{sent.phone}</b> on WhatsApp.</p>
          {sent.testCode && <div className="note" style={{ marginBottom: 12 }}>Test mode (WhatsApp isn’t connected yet): your code is <b className="mono">{sent.testCode}</b>.</div>}
          <Field label="THE 6-DIGIT CODE" htmlFor="ap-otp">
            <input id="ap-otp" className="cmp-in mono" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn pri" disabled={busy || otp.length !== 6} onClick={() => run(async () => { await post({ action: 'otp-verify', phone, code: otp }); onIn(); })}>{busy ? 'Checking…' : 'Sign in'}</button>
            <button className="btn" disabled={busy} onClick={() => { setSent(null); setOtp(''); }}>Use another number</button>
          </div>
        </>)
      ) : (<>
        <Field label="ACCESS CODE" htmlFor="ap-access" hint="Eight letters and numbers from the admissions office, like K7QM-4XPA.">
          <input id="ap-access" className="cmp-in mono" autoCapitalize="characters" autoComplete="off" maxLength={12} value={access} onChange={e => setAccess(e.target.value.toUpperCase())} />
        </Field>
        <button className="btn pri" disabled={busy || access.replace(/[\s-]/g, '').length < 8} onClick={() => run(async () => { await post({ action: 'code', code: access }); onIn(); })}>{busy ? 'Checking…' : 'Open my application'}</button>
      </>)}
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
    </div>
  );
}
