'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isRole, withTimeout } from '@/lib/auth/roles';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BookOpenIcon as BookOpen } from '@phosphor-icons/react/dist/ssr/BookOpen';
import { ChalkboardTeacherIcon as ChalkboardTeacher } from '@phosphor-icons/react/dist/ssr/ChalkboardTeacher';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import InteractiveIcon from '@/components/ui/InteractiveIcon';
import PlatformNotice from '@/components/ui/PlatformNotice';
import { colorForIcon } from '@/lib/iconColors';

type Role = 'student' | 'teacher' | 'admin' | 'parent';
type Step = 'code' | 'role' | 'creds';

// The demo school's code (sample desks). Every other code is looked up in the
// schools table via /api/auth/verify-school, and sign-in then checks the
// account belongs to that school.
const DEMO_CODE = 'SCH-VSN-2026';
const DEMO_SCHOOL = 'DPS Vasundhara';
const DEFAULT_CODE = DEMO_CODE;

const ROLE_INFO: Record<Role, { label: string; sub: string; email: string }> = {
  student: { label: 'Student', sub: 'Honest Desk', email: 'ananya.iyer@student.sthara.in' },
  teacher: { label: 'Teacher', sub: 'Teaching Copilot', email: 'priya.menon@dpsvasundhara.edu.in' },
  admin: { label: 'Admin', sub: 'Command Centre', email: 'admin@dpsvasundhara.edu.in' },
  parent: { label: 'Parent', sub: 'Growth Feed', email: 'parent.iyer@sthara.in' },
};
const ROLE_ORDER: Role[] = ['student', 'teacher', 'admin', 'parent'];

// Exact measured brand mark — cropped from the real supplied logo artwork
// (see assets/MARK_GEOMETRY.md in the launch-site design system), recolored
// solid white for the dark login background via the same feColorMatrix the
// marketing site uses (filter id="brand-white").
function BrandMark({ size = 52 }: { size?: number }) {
  return (
    <svg viewBox="350 146 196 316" width={size} height={size} aria-hidden="true" style={{ filter: 'url(#lg-brand-white)' }}>
      <image href="/brand/sthara-logo-presentation.png" width={895} height={813} />
    </svg>
  );
}

const ROLE_ICONS: Record<Role, typeof BookOpen> = {
  student: BookOpen,
  teacher: ChalkboardTeacher,
  admin: ShieldCheck,
  parent: UsersThree,
};

function RoleIcon({ role }: { role: Role }) {
  const Icon = ROLE_ICONS[role];
  return <InteractiveIcon icon={Icon} color={colorForIcon(Icon)} size={30} />;
}

export default function LoginPage() {
  const router = useRouter();
  const { startDemo } = useAuth();

  const [step, setStep] = useState<Step>('code');

  const [schoolCode, setSchoolCode] = useState('');
  const [schoolName, setSchoolName] = useState('');
  /** Set when the code matched a real school; null for the demo code. */
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [codeChecking, setCodeChecking] = useState(false);
  const [codeError, setCodeError] = useState('');

  const [role, setRole] = useState<Role>('teacher');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [credsError, setCredsError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const passRef = useRef<HTMLInputElement>(null);

  const checkCode = async () => {
    const code = (schoolCode.trim() || DEFAULT_CODE).toUpperCase();
    setCodeError('');
    setCodeChecking(true);
    try {
      if (code === DEMO_CODE) {
        setSchoolId(null);
        setSchoolName(DEMO_SCHOOL);
      } else {
        const res = await withTimeout(fetch('/api/auth/verify-school', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolCode: code }),
        }));
        const data = await res.json().catch(() => ({}));
        if (!data.valid) { setCodeError(data.error || 'School code not found.'); return; }
        setSchoolId(data.schoolId);
        setSchoolName(data.name);
      }
      setSchoolCode(code);
      setStep('role');
    } catch {
      setCodeError('We couldn’t check that code. Check your connection and try again.');
    } finally {
      setCodeChecking(false);
    }
  };

  const backToCode = () => setStep('code');
  const backToRoles = () => setStep('role');

  const pickRole = (r: Role) => {
    setRole(r);
    setEmail(ROLE_INFO[r].email);
    setPassword('');
    setCredsError('');
    setStep('creds');
  };

  const signIn = async () => {
    if (!email.trim() || !password) {
      setCredsError('Enter your ID and password.');
      return;
    }
    setCredsError('');
    setSigningIn(true);
    try {
      const supabase = createClient();
      const { data, error } = await withTimeout(supabase.auth.signInWithPassword({ email: email.trim(), password }));
      if (error || !data.session) throw new Error(error?.message || 'Sign-in failed.');
      const { data: account, error: profileError } = await withTimeout(supabase.from('users').select('role, school_id').eq('id', data.user.id).single());
      if (profileError || !isRole(account?.role)) throw new Error('Your school account profile is unavailable. Contact your administrator.');
      // A real school code must match the account's school (operators excepted).
      if (schoolId && account.role !== 'superadmin' && account.school_id !== schoolId) {
        await supabase.auth.signOut();
        throw new Error(`This account isn’t registered at ${schoolName}. Check the school code.`);
      }
      document.cookie = `__role=${account.role}; path=/; max-age=3600; SameSite=Lax`;
      document.cookie = `__session=${data.session.access_token}; path=/; max-age=3600; SameSite=Lax`;
      router.replace(`/${account.role}`);
    } catch (err) {
      setCredsError(err instanceof Error ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="login-container">
      {/* Hidden filter defs — recolors the raster brand mark to solid white,
          matching the exact matrix used on sthara.in's dark theme. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="lg-brand-white" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -.243 -.817 -.083 0 1.143" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </svg>

      <style jsx global>{`
        :root {
          --nav: #062347;
          --red: #E11D48;
          --ink: #002147;
        }
        .login-container {
          position: fixed;
          inset: 0;
          z-index: 60;
          background: radial-gradient(1200px 700px at 20% 30%, #0B2E5C, #03162E 70%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
          gap: 80px;
          flex-wrap: wrap;
          /* Scrolls when the card doesn't fit (phones, landscape, on-screen keyboard). */
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          align-content: safe center;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        }
        .lg-left { max-width: 460px; color: #fff; }
        .lg-mark { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
        .lg-mark span { font-size: 44px; font-weight: 800; letter-spacing: -.03em; }
        .lg-left h1 { font-size: 42px; font-weight: 800; margin-bottom: 16px; line-height: 1.1; }
        .lg-left p { color: #9DB4D4; font-size: 17px; line-height: 1.6; }
        .lg-tag {
          display: inline-block; margin-top: 26px; padding: 8px 16px;
          border: 1px solid rgba(225,29,72,.5); border-radius: 99px;
          color: #FF8FA8; font-size: 12px; font-weight: 700; letter-spacing: .16em;
        }
        .lg-card {
          background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
          border-radius: 24px; padding: 36px; width: 380px; backdrop-filter: blur(12px);
          box-shadow: 0 20px 60px rgba(0,0,0,.3);
        }
        .lg-card h2 { color: #fff; font-size: 26px; font-weight: 800; margin-bottom: 6px; }
        .lg-card .sub { color: #8FA5C4; font-size: 13px; margin-bottom: 24px; }
        .lg-in {
          width: 100%; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12);
          border-radius: 12px; padding: 14px 16px; color: #fff; font-size: 16px;
          font-family: inherit; margin-bottom: 12px; outline: none; transition: border-color .2s;
        }
        .lg-in:focus { border-color: var(--red); }
        .lg-in::placeholder { color: #6E86A6; }
        .lg-go {
          width: 100%; background: var(--red); color: #fff; border-radius: 12px; padding: 15px;
          font-size: 15px; font-weight: 700; cursor: pointer; border: none;
          transition: transform .15s, background .15s;
          display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 50px;
        }
        .lg-go + .lg-go { margin-top: 10px; background: rgba(255,255,255,.08); }
        .lg-go:hover:not(:disabled) { background: #c8102e; transform: translateY(-1px); }
        .lg-go:disabled { opacity: .6; cursor: default; }
        .lg-err {
          background: rgba(225,29,72,.14); border: 1px solid rgba(225,29,72,.4); color: #FF9DB2;
          border-radius: 10px; padding: 10px 13px; font-size: 12.5px; font-weight: 600;
          margin: -2px 0 12px; line-height: 1.5;
        }
        .lg-foot { text-align: center; color: #6E86A6; font-size: 12px; margin-top: 18px; line-height: 1.6; }
        .lg-back {
          width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
          color: #B9CAE2; font-size: 18px; border-radius: 10px; margin-bottom: 18px;
          background: none; border: none; cursor: pointer;
        }
        .lg-back:hover { background: rgba(255,255,255,.07); }
        .lg-role-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 22px; }
        .lg-role-card {
          background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
          border-radius: 16px; padding: 26px 14px; text-align: center; transition: .15s;
          color: #fff; cursor: pointer;
        }
        .lg-role-card:hover { background: rgba(255,255,255,.09); border-color: rgba(255,255,255,.2); }
        .lg-role-card svg { width: 30px; height: 30px; margin: 0 auto 14px; display: block; }
        .lg-role-card .t { font-weight: 800; font-size: 15px; }
        .lg-role-card .s { font-size: 12px; color: #8FA5C4; margin-top: 4px; }
        .lg-foot a { color: #B9CAE2; display: inline-flex; align-items: center; gap: 5px; }
        /* Phone: brand block compacts above a full-width card that starts on screen. */
        @media (max-width: 760px) {
          .login-container {
            padding: calc(28px + env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom));
            gap: 26px; align-content: flex-start; align-items: flex-start;
          }
          .lg-left { max-width: none; width: 100%; }
          .lg-mark { margin-bottom: 14px; gap: 10px; }
          .lg-mark svg { width: 36px; height: 36px; }
          .lg-mark span { font-size: 30px; }
          .lg-left h1 { font-size: 24px; margin-bottom: 8px; }
          .lg-left p { font-size: 14px; line-height: 1.5; }
          .lg-tag { display: none; }
          .lg-card { width: 100%; padding: 24px 20px; border-radius: 20px; }
          .lg-role-card { padding: 20px 10px; }
        }
        @media (max-width: 760px) and (max-height: 700px) { .lg-left p { display: none; } }
      `}</style>

      <div className="lg-left">
        <div className="lg-mark">
          <BrandMark />
          <span>Sthara</span>
        </div>
        <h1>The Unified School OS</h1>
        <p>One platform for Students, Teachers, Administrators and Parents. High-integrity education powered by True Mastery Level diagnostics and adaptive learning.</p>
        <div className="lg-tag">UNLEASH YOURSELF</div>
      </div>

      <div className="lg-card">
        <PlatformNotice variant="card" />
        {step === 'code' && (
          <div>
            <h2>Welcome</h2>
            <div className="sub">Enter your school code to continue.</div>
            <input
              className="lg-in"
              placeholder={`E.G. ${DEFAULT_CODE}`}
              autoComplete="off"
              autoFocus
              value={schoolCode}
              onChange={e => setSchoolCode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') checkCode(); }}
            />
            {codeError && <div className="lg-err">{codeError}</div>}
            <button className="lg-go" onClick={checkCode} disabled={codeChecking}>
              {codeChecking ? 'Checking…' : <>Continue <ArrowRight size={16} weight="bold" /></>}
            </button>
            <div className="lg-foot">
              New school? <b style={{ color: '#B9CAE2', cursor: 'pointer' }}>
                <Link href="/#pricing">Book a paid pilot <ArrowRight size={13} weight="bold" /></Link>
              </b>
              <br />
              <span style={{ opacity: .6 }}>Privacy Policy</span> <span style={{ opacity: .6 }}>·</span>{' '}
              <span style={{ opacity: .6 }}>Terms of Service</span>
            </div>
          </div>
        )}

        {step === 'role' && (
          <div>
            <button className="lg-back" onClick={backToCode} aria-label="Back to school code"><ArrowLeft size={18} weight="bold" /></button>
            <h2 style={{ textAlign: 'center' }}>Select your role</h2>
            <div className="sub" style={{ textAlign: 'center' }}>School: {schoolName} ({schoolCode})</div>
            <div className="lg-role-grid">
              {ROLE_ORDER.map(r => (
                <button key={r} className="lg-role-card" onClick={() => pickRole(r)}>
                  <RoleIcon role={r} />
                  <div className="t">{ROLE_INFO[r].label}</div>
                  <div className="s">{ROLE_INFO[r].sub}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'creds' && (
          <div>
            <button className="lg-back" onClick={backToRoles} aria-label="Back to role selection"><ArrowLeft size={18} weight="bold" /></button>
            <h2 style={{ textAlign: 'center' }}>Sign in as {ROLE_INFO[role].label}</h2>
            <div className="sub" style={{ textAlign: 'center' }}>{schoolName} · {ROLE_INFO[role].sub}</div>
            <input
              className="lg-in"
              placeholder="ID"
              aria-label="Email ID"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') passRef.current?.focus(); }}
            />
            <input
              ref={passRef}
              className="lg-in"
              type="password"
              placeholder="Password"
              aria-label="Password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') signIn(); }}
            />
            {credsError && <div className="lg-err">{credsError}</div>}
            <button className="lg-go" onClick={signIn} disabled={signingIn}>
              {signingIn ? 'Signing in…' : <>Sign in <ArrowRight size={16} weight="bold" /></>}
            </button>
            {process.env.NODE_ENV === 'development' && <button className="lg-go" disabled={signingIn} onClick={() => startDemo(role)}>Open local demo</button>}
            <div className="lg-foot">
              <span style={{ opacity: .6, cursor: 'pointer' }}>Forgot password?</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
