'use client';

import { useEffect, useState } from 'react';
import { WhatsappLogoIcon as WhatsappLogo } from '@phosphor-icons/react/dist/ssr/WhatsappLogo';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { InfoIcon as Info } from '@phosphor-icons/react/dist/ssr/Info';
import { PageBar } from '@/components/canon/ui';
import { createClient } from '@/lib/supabase/client';
import { CONSENT_TYPES } from '@/lib/admin/constants';
import { useFamily } from '@/lib/parent/useFamily';
import type { FamilyView } from '@/lib/parent/family';
import { FamilyGate } from './common';

const POLICY_VERSION = '2026-09';
const PREFS: { key: string; label: string; hint: string }[] = [
  { key: 'grades', label: 'Grades', hint: 'When a teacher confirms a mark' },
  { key: 'alerts', label: 'Learning alerts', hint: 'When a chapter drops into "severe need"' },
  { key: 'messages', label: 'Teacher replies', hint: 'Replies to your messages' },
  { key: 'fees', label: 'Fee reminders', hint: 'Reminders from the fee office' },
];

export default function Settings() {
  useEffect(() => {
    // Anchor links (#whatsapp, #privacy) from other pages land after the data renders.
    const id = window.location.hash.slice(1);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, []);
  return (
    <FamilyGate>
      {({ view }) => (
        <>
          <PageBar eyebrow="WHATSAPP & PRIVACY" title="How the school reaches you" sub="Link WhatsApp to ask the School OS and get updates there. Decide what the school may do with your child's data." />
          <WhatsAppCard view={view} />
          <Privacy view={view} />
        </>
      )}
    </FamilyGate>
  );
}

function WhatsAppCard({ view }: { view: FamilyView }) {
  const { call, reload } = useFamily();
  const wa = view.whatsapp;
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'enter' | 'code'>(wa.pending ? 'code' : 'enter');
  const [sentTo, setSentTo] = useState<string | null>(wa.pending && wa.phone ? wa.phone : null);
  const [testCode, setTestCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const act = async (body: Record<string, unknown>, after?: (r: any) => void) => {
    setBusy(true); setErr(null); setOk(null);
    try { const r = await call('/api/parent/whatsapp', 'POST', body); after?.(r); reload(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <section id="whatsapp" className="card pa-wa">
      <div className="pa-wa-hd">
        <span className="pa-wa-mark"><WhatsappLogo size={26} weight="fill" /></span>
        <div style={{ flex: 1 }}>
          <h3>WhatsApp</h3>
          <p className="muted">Ask the School OS from WhatsApp, and get grades, alerts and teacher replies there.</p>
        </div>
        {wa.linked && <span className={`ch ${wa.optedIn ? 'g' : 'a'}`}>{wa.optedIn ? 'Connected' : 'Paused'}</span>}
      </div>
      {wa.mode === 'simulated' && (
        <div className="note info" style={{ marginBottom: 16 }}>
          <Info size={14} weight="bold" /> <b>Test mode.</b> The school&apos;s WhatsApp Business line isn&apos;t connected yet, so nothing is delivered to your phone: messages are logged instead, and the link code is shown here. Everything else works the same.
        </div>
      )}
      {wa.linked ? (
        <>
          <div className="pa-wa-linked">
            <CheckCircle size={20} weight="fill" color="#10B981" />
            <div style={{ flex: 1 }}><b>{wa.phone}</b><div className="muted">Message {wa.businessNumber ?? 'the school’s WhatsApp number'} any time. Reply STOP there to pause.</div></div>
            <button className="btn sm" disabled={busy} onClick={() => void act({ action: wa.optedIn ? 'optout' : 'optin' })}>{wa.optedIn ? 'Pause updates' : 'Resume updates'}</button>
            <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); try { await call('/api/parent/whatsapp', 'DELETE'); reload(); setStage('enter'); } catch (e: any) { setErr(e.message); } setBusy(false); }}>Unlink</button>
          </div>
          <div className="lbl" style={{ marginTop: 20 }}>SEND ME</div>
          <div className="pa-prefs">
            {PREFS.map(p => (
              <label key={p.key} className="pa-pref">
                <input type="checkbox" checked={wa.prefs[p.key] !== false} disabled={busy || !wa.optedIn}
                  onChange={e => void act({ action: 'prefs', prefs: { [p.key]: e.target.checked } })} />
                <span><b>{p.label}</b><i>{p.hint}</i></span>
              </label>
            ))}
          </div>
        </>
      ) : stage === 'enter' ? (
        <form className="pa-form" onSubmit={e => { e.preventDefault(); void act({ action: 'start', phone, consent: agree }, r => { setStage('code'); setSentTo(r.phone); setTestCode(r.testCode ?? null); }); }}>
          <label><span className="lbl">YOUR WHATSAPP NUMBER</span>
            <input className="tin" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="98765 43210" />
          </label>
          <label className="pa-pref">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <span><b>I agree to receive messages from the school on WhatsApp</b><i>About my child&apos;s schoolwork, progress, wellbeing and fees. I can pause or unlink at any time.</i></span>
          </label>
          <div><button className="btn pri" disabled={busy || !phone.trim() || !agree}>{busy ? 'Sending code' : 'Send code'}</button></div>
        </form>
      ) : (
        <form className="pa-form" onSubmit={e => { e.preventDefault(); void act({ action: 'verify', code }, () => setOk('WhatsApp is linked.')); }}>
          <p className="muted">We sent a 6-digit code on WhatsApp{sentTo ? ` to ${sentTo}` : ''}. It expires in 10 minutes.</p>
          {testCode && <div className="note info">Test mode code: <b className="mono">{testCode}</b></div>}
          <label><span className="lbl">CODE</span>
            <input className="tin mono" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" style={{ maxWidth: 180, letterSpacing: '.3em' }} />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn pri" disabled={busy || code.length !== 6}>{busy ? 'Checking' : 'Link WhatsApp'}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => { setStage('enter'); setCode(''); setTestCode(null); }}>Use another number</button>
          </div>
        </form>
      )}
      {err && <div className="note err" style={{ marginTop: 14 }}>{err}</div>}
      {ok && <div className="note info" style={{ marginTop: 14 }}>{ok}</div>}
    </section>
  );
}

/** DPDP consent per child and purpose, through public.set_consent (verified guardian check + audit). */
function Privacy({ view }: { view: FamilyView }) {
  const { reload } = useFamily();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const set = async (studentId: string, type: string, granted: boolean) => {
    setBusy(`${studentId}:${type}`); setErr(null);
    const { error } = await createClient().rpc('set_consent', { p_student: studentId, p_type: type, p_granted: granted, p_policy_version: POLICY_VERSION });
    if (error) setErr(error.message);
    setBusy(null);
    reload();
  };
  return (
    <section id="privacy" className="card" style={{ marginTop: 18 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={20} weight="duotone" color="#10B981" /> Consent &amp; privacy</h3>
      <p className="muted" style={{ margin: '6px 0 14px' }}>
        Under India&apos;s data protection law (DPDP), the school needs your permission for some uses of your child&apos;s data. You can give or withdraw it at any time; every change is recorded.
        Your child&apos;s wellness journal stays private to them either way.
      </p>
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {view.children.map(c => (
        <div key={c.id} className="pa-consent">
          <div className="pa-consent-kid"><b>{c.name}</b><span className="muted">{c.cls}</span></div>
          {Object.entries(CONSENT_TYPES).map(([type, meta]) => {
            const v = c.consents[type];
            const key = `${c.id}:${type}`;
            return (
              <div key={type} className="row">
                <div style={{ flex: 1 }}>
                  <b>{meta.label}</b>
                  <div className="muted">{meta.purpose}</div>
                </div>
                <span className={`ch ${v === undefined ? 'n' : v ? 'g' : 'a'} xs`}>{v === undefined ? 'Not decided' : v ? 'Given' : 'Withdrawn'}</span>
                <button className={`btn sm${v ? '' : ' pri'}`} disabled={busy === key} onClick={() => void set(c.id, type, !v)}>
                  {busy === key ? 'Saving' : v ? 'Withdraw' : 'Give consent'}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
