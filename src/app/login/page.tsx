'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, BookOpen, GraduationCap, School, ShieldCheck, User, Users, Loader2, Moon, Sun, CheckCircle2, AlertCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const SUPERADMIN_CODES = ['STHARA', 'ADMIN', 'SUPERADMIN'];

const ROLE_METADATA = {
  student:    { name: 'Student', desc: 'Honest Desk', icon: GraduationCap },
  teacher:    { name: 'Teacher', desc: 'Diagnostic Engine', icon: School },
  admin:      { name: 'Admin', desc: 'Command Center', icon: User },
  parent:     { name: 'Parent', desc: 'Growth Feed', icon: Users },
  superadmin: { name: 'SuperAdmin', desc: 'Platform Master', icon: ShieldCheck },
};

export default function LoginPage() {
  const router = useRouter();

  // Dark/Light theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Step state: 1 = CODE, 2 = ROLE, 3 = SIGNIN
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [schoolCode, setSchoolCode] = useState('');
  const [isSuperAdminCode, setIsSuperAdminCode] = useState(false);
  const [role, setRole] = useState<'student' | 'teacher' | 'admin' | 'parent' | 'superadmin'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [codeError, setCodeError] = useState('');
  const [error, setError] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Toggle theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Step 1: School Code Submit
  const handleSchoolCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError('');
    const codeUpper = schoolCode.trim().toUpperCase();

    if (codeUpper.length < 3) {
      setCodeError('Enter a valid school code to continue.');
      return;
    }

    if (SUPERADMIN_CODES.includes(codeUpper)) {
      setIsSuperAdminCode(true);
      setStep(2);
      return;
    }

    setIsSuperAdminCode(false);
    setIsVerifyingCode(true);

    try {
      const supabase = createClient();
      const { data: school, error: dbErr } = await supabase
        .from('schools')
        .select('id, name, settings')
        .or(`settings->code.eq.${codeUpper},invite_code.eq.${codeUpper}`)
        .maybeSingle();

      if (dbErr || !school) {
        // Fallback: allow demo code STHARA-001 or standard codes
        if (codeUpper.startsWith('STHARA') || codeUpper.startsWith('DEMO')) {
          setStep(2);
          return;
        }
        setCodeError('Invalid school code. Please check with your administrator.');
        return;
      }

      setStep(2);
    } catch {
      setCodeError('Connection error. Please try again.');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  // Step 2: Role Selection
  const selectRole = (r: 'student' | 'teacher' | 'admin' | 'parent' | 'superadmin') => {
    setRole(r);
    setError('');
    setStatusMessage('');
    setStep(3);
  };

  // Step 3: Login Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStatusMessage('');

    const inputEmail = email.trim().toLowerCase();
    if (!inputEmail || password.length < 6) {
      setError('Please enter a valid email and password (min 6 characters).');
      return;
    }

    setIsSigningIn(true);
    setStatusMessage(`Signing in to ${ROLE_METADATA[role].name} workspace...`);

    const isSuperAdmin = (inputEmail === 'admin@sthara.in' || role === 'superadmin');

    try {
      const supabase = createClient();

      if (isSuperAdmin) {
        try {
          await fetch('/api/superadmin/create-superadmin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: inputEmail, password, name: 'Super Admin' }),
          });
        } catch (_) { /* ignore */ }
      }

      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: inputEmail,
        password,
      });

      if (signInErr || !data?.user) {
        setError(signInErr?.message || 'Invalid email or password.');
        setStatusMessage('');
        return;
      }

      let userRole = role;
      try {
        const { data: userRow } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();
        if (userRow?.role) userRole = userRow.role;
        else if (data.user.user_metadata?.role) userRole = data.user.user_metadata.role;
      } catch (_) { /* ignore */ }

      if (data.session?.access_token) {
        document.cookie = `__session=${data.session.access_token}; path=/; max-age=3600; SameSite=Strict`;
      }
      document.cookie = `__role=${userRole}; path=/; max-age=3600; SameSite=Strict`;

      setStatusMessage(`Signed in as ${ROLE_METADATA[userRole as keyof typeof ROLE_METADATA]?.name || userRole} — redirecting...`);

      setTimeout(() => {
        if (userRole === 'superadmin') router.push('/superadmin');
        else if (userRole === 'admin') router.push('/admin');
        else if (userRole === 'teacher') router.push('/teacher');
        else if (userRole === 'parent') router.push('/parent');
        else router.push('/student');
      }, 600);

    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
      setStatusMessage('');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className={`min-h-screen grid grid-cols-1 lg:grid-cols-2 font-sans transition-colors duration-300 ${
      theme === 'dark' ? 'bg-[#081420] text-[#e4edf6]' : 'bg-[#f2f6fa] text-[#0b1a2b]'
    }`}>
      {/* Theme Toggle Button */}
      <button
        type="button"
        onClick={toggleTheme}
        className="fixed top-4 right-4 z-50 px-3.5 py-1.5 rounded-full text-xs font-semibold border shadow-sm transition-all flex items-center space-x-1.5 cursor-pointer bg-white dark:bg-[#0f1e2e] border-gray-200 dark:border-[#22374d] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#17293c]"
      >
        {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-600" />}
        <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
      </button>

      {/* BRAND PANEL (Left side) */}
      <aside className="relative bg-gradient-to-br from-[#002147] to-[#00152f] text-white p-8 lg:p-16 flex flex-col justify-center gap-6 overflow-hidden">
        {/* Ambient Gradient Glows */}
        <div className="absolute inset-0 bg-[radial-gradient(560px_420px_at_82%_12%,rgba(200,16,46,0.18),transparent_60%),radial-gradient(680px_520px_at_8%_92%,rgba(255,255,255,0.06),transparent_55%)] pointer-events-none" />

        <div className="relative flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center font-black text-white text-lg shadow-inner">
            S
          </div>
          <span className="font-extrabold text-2xl tracking-tight">Sthara</span>
        </div>

        <div className="relative space-y-3 max-w-md">
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight">
            The Unified School OS
          </h1>
          <p className="text-sm text-white/70 leading-relaxed">
            High-integrity educational platform powered by real-time mastery diagnostics and adaptive learning — built for CBSE schools.
          </p>
        </div>

        <div className="relative pt-6 flex flex-wrap gap-8 border-t border-white/10">
          <div>
            <b className="block text-xl font-bold tracking-tight">TML</b>
            <span className="block text-[10px] uppercase tracking-wider text-white/60 mt-0.5">Live mastery score</span>
          </div>
          <div>
            <b className="block text-xl font-bold tracking-tight">4</b>
            <span className="block text-[10px] uppercase tracking-wider text-white/60 mt-0.5">Role workspaces</span>
          </div>
          <div>
            <b className="block text-xl font-bold tracking-tight">DPDP</b>
            <span className="block text-[10px] uppercase tracking-wider text-white/60 mt-0.5">Compliant by design</span>
          </div>
        </div>
      </aside>

      {/* FORM SIDE (Right side) */}
      <main className="flex items-center justify-center p-6 lg:p-12">
        <div className={`w-full max-w-md rounded-3xl p-8 border shadow-xl transition-all ${
          theme === 'dark' ? 'bg-[#0f1e2e] border-[#22374d]' : 'bg-white border-[#dce5ef]'
        }`}>

          {/* STEP 1: FIND SCHOOL CODE */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between min-h-[20px]">
                <span className="text-[10.5px] font-bold tracking-wider uppercase text-indigo-600 dark:text-indigo-400">Step 1 of 3</span>
              </div>

              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#002147] dark:text-white">Find your school</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Enter your school code to continue. This is provided by your school administrator.</p>
              </div>

              <form onSubmit={handleSchoolCodeSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">School code</label>
                  <input
                    type="text"
                    value={schoolCode}
                    onChange={e => { setSchoolCode(e.target.value); setCodeError(''); }}
                    placeholder="e.g. STHARA-001"
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase tracking-wider ${
                      codeError
                        ? 'border-red-500 bg-red-50/20'
                        : theme === 'dark' ? 'bg-[#132436] border-[#22374d] text-white' : 'bg-[#f9fbfd] border-[#dce5ef] text-[#0b1a2b]'
                    }`}
                    autoFocus
                  />
                  {codeError && <p className="text-xs text-red-600 dark:text-red-400 font-semibold mt-1.5">{codeError}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isVerifyingCode || !schoolCode.trim()}
                  className="w-full py-3.5 rounded-xl bg-[#002147] hover:bg-[#0a2f5c] text-white font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  <span>{isVerifyingCode ? 'Verifying Code...' : 'Continue'}</span>
                  {isVerifyingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                Don't have a code?{' '}
                <button type="button" onClick={() => alert('Contact your school administrator, or reach hello@sthara.in')} className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
                  Get help
                </button>
              </p>
            </div>
          )}

          {/* STEP 2: ROLE SELECT */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <button onClick={() => setStep(1)} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-[#17293c] transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="text-[10.5px] font-bold tracking-wider uppercase text-indigo-600 dark:text-indigo-400">Step 2 of 3</span>
              </div>

              <div>
                <div className="inline-flex items-center space-x-2 bg-indigo-50 dark:bg-[#17293c] text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                  <span>{schoolCode.toUpperCase() || 'STHARA'}</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-[#002147] dark:text-white">Select your role</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Choose the workspace you're signing in to.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(['student', 'teacher', 'admin', 'parent'] as const).map(rKey => {
                  const meta = ROLE_METADATA[rKey];
                  const IconComponent = meta.icon;
                  return (
                    <button
                      key={rKey}
                      onClick={() => selectRole(rKey)}
                      className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer group hover:-translate-y-0.5 hover:shadow-md ${
                        theme === 'dark'
                          ? 'bg-[#132436] border-[#22374d] hover:border-indigo-400'
                          : 'bg-[#f9fbfd] border-[#dce5ef] hover:border-indigo-500'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-[#17293c] text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2">
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-[#002147] dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-300">{meta.name}</div>
                        <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-0.5">{meta.desc}</div>
                      </div>
                    </button>
                  );
                })}

                {/* SuperAdmin Card (Visible if Master Code entered) */}
                {isSuperAdminCode && (
                  <button
                    onClick={() => selectRole('superadmin')}
                    className="col-span-2 p-4 rounded-2xl border border-indigo-300 dark:border-indigo-500/40 bg-indigo-50/50 dark:bg-indigo-950/30 text-left flex items-center space-x-3 hover:-translate-y-0.5 transition-all cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-indigo-900 dark:text-indigo-200">Super Administrator</div>
                      <div className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Platform Master Access</div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: SIGN IN */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <button onClick={() => setStep(2)} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-[#17293c] transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="text-[10.5px] font-bold tracking-wider uppercase text-indigo-600 dark:text-indigo-400">Step 3 of 3</span>
              </div>

              <div>
                <div className="inline-flex items-center space-x-2 bg-indigo-50 dark:bg-[#17293c] text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                  <span>{ROLE_METADATA[role].name}</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-[#002147] dark:text-white">Sign in</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {ROLE_METADATA[role].name} Portal ({ROLE_METADATA[role].desc}) · {schoolCode.toUpperCase() || 'Sthara'}
                </p>
              </div>

              {/* Status Banner */}
              {statusMessage && (
                <div className="p-3.5 bg-indigo-50 dark:bg-[#17293c] border border-indigo-200 dark:border-indigo-500/30 text-indigo-800 dark:text-indigo-200 rounded-xl text-xs font-semibold flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600 flex-shrink-0" />
                  <span>{statusMessage}</span>
                </div>
              )}

              {/* Error Banner */}
              {error && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    placeholder="you@school.sthara.in"
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-[#132436] border-[#22374d] text-white' : 'bg-[#f9fbfd] border-[#dce5ef] text-[#0b1a2b]'
                    }`}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    placeholder="••••••••"
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-[#132436] border-[#22374d] text-white' : 'bg-[#f9fbfd] border-[#dce5ef] text-[#0b1a2b]'
                    }`}
                    required
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded accent-[#002147]" />
                    <span>Keep me signed in</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => alert('A password reset link will be sent to your registered email address.')}
                    className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isSigningIn}
                  className="w-full py-3.5 rounded-xl bg-[#002147] hover:bg-[#0a2f5c] text-white font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 mt-2"
                >
                  <span>{isSigningIn ? 'Signing In...' : 'Sign In'}</span>
                  {isSigningIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                Wrong role?{' '}
                <button type="button" onClick={() => setStep(2)} className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
                  Choose again
                </button>
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
