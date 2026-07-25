'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, KeyRound, User, Lock, Mail, ArrowLeft, Loader2, ShieldCheck, GraduationCap, School, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Codes that unlock SuperAdmin login
const SUPERADMIN_CODES = ['STHARA', 'ADMIN', 'SUPERADMIN'];

export default function LoginPage() {
  const router = useRouter();

  const [step, setStep] = useState<'CODE' | 'ROLE_SELECT' | 'CREDENTIALS'>('CODE');
  const [schoolCode, setSchoolCode] = useState('');
  const [isSuperAdminCode, setIsSuperAdminCode] = useState(false); // tracks if code unlocks SuperAdmin
  const [role, setRole] = useState<'student' | 'teacher' | 'admin' | 'parent' | 'superadmin'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [schoolCodeError, setSchoolCodeError] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSchoolCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSchoolCodeError('');
    if (!schoolCode.trim()) {
      setSchoolCodeError('Please enter an institution code');
      return;
    }

    const codeUpper = schoolCode.trim().toUpperCase();

    // Check if this is a SuperAdmin master code
    const isMasterCode = SUPERADMIN_CODES.includes(codeUpper);
    setIsSuperAdminCode(isMasterCode);

    setIsVerifyingCode(true);
    setTimeout(() => {
      setIsVerifyingCode(false);
      setStep('ROLE_SELECT');
    }, 400);
  };

  const handleRoleSelect = (selectedRole: 'student' | 'teacher' | 'admin' | 'parent' | 'superadmin') => {
    setRole(selectedRole);
    setError('');
    setStep('CREDENTIALS');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setIsSigningIn(true);
    const inputEmail = email.trim().toLowerCase();
    const isSuperAdmin = (inputEmail === 'admin@sthara.in' || role === 'superadmin');

    try {
      const supabase = createClient();

      // For superadmin: provision DB row FIRST so users table has a record
      if (isSuperAdmin) {
        try {
          await fetch('/api/superadmin/create-superadmin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: inputEmail, password, name: 'Super Admin' }),
          });
        } catch (provErr) {
          console.warn('[provision] skipped:', provErr);
        }
      }

      // Sign in with Supabase Auth
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: inputEmail,
        password,
      });

      if (signInError) {
        setError(signInError.message || 'Invalid email or password. Please check your credentials.');
        return;
      }

      if (!data?.user) {
        setError('Sign in failed. Please try again.');
        return;
      }

      // Determine role from DB → metadata → selected role
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

      // Route to correct dashboard
      if (userRole === 'superadmin') router.push('/superadmin');
      else if (userRole === 'admin') router.push('/admin');
      else if (userRole === 'teacher') router.push('/teacher');
      else if (userRole === 'parent') router.push('/parent');
      else router.push('/student');

    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'A network error occurred. Please check your connection.');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border border-gray-100 space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3.5 bg-[#002147] text-white rounded-2xl shadow-md">
            <BookOpen className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#002147]">Sthara School OS</h1>
          <p className="text-xs text-gray-500 font-medium">Sign in to your institutional account</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center space-x-2 text-xs font-bold">
          {['CODE', 'ROLE_SELECT', 'CREDENTIALS'].map((s, i) => (
            <div key={s} className="flex items-center space-x-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all
                ${step === s ? 'bg-[#002147] text-white scale-110' :
                  ['CODE', 'ROLE_SELECT', 'CREDENTIALS'].indexOf(step) > i ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {['CODE', 'ROLE_SELECT', 'CREDENTIALS'].indexOf(step) > i ? '✓' : i + 1}
              </div>
              {i < 2 && <div className="w-6 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        {/* STEP 1: INSTITUTION CODE */}
        {step === 'CODE' && (
          <form onSubmit={handleSchoolCodeSubmit} className="space-y-4">
            {schoolCodeError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-2xl">
                {schoolCodeError}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Institution Code</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={schoolCode}
                  onChange={e => setSchoolCode(e.target.value)}
                  placeholder="ENTER YOUR SCHOOL CODE"
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase tracking-wider"
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5 pl-1">Contact your school administration for the code</p>
            </div>

            <button
              type="submit"
              disabled={isVerifyingCode || !schoolCode.trim()}
              className="w-full py-3.5 bg-[#002147] hover:bg-blue-900 disabled:opacity-50 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center justify-center"
            >
              {isVerifyingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Continue →</span>}
            </button>
          </form>
        )}

        {/* STEP 2: ROLE SELECT */}
        {step === 'ROLE_SELECT' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-600">Select your role</p>
              <button onClick={() => setStep('CODE')} className="text-xs text-indigo-600 font-bold hover:underline flex items-center space-x-1">
                <ArrowLeft className="w-3 h-3" />
                <span>Change Code</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleRoleSelect('student')}
                className="p-4 bg-gray-50 hover:bg-blue-50 border-2 border-gray-200 hover:border-blue-300 rounded-2xl text-center space-y-2 transition-all group active:scale-95">
                <GraduationCap className="w-7 h-7 mx-auto text-gray-400 group-hover:text-blue-600 transition-colors" />
                <div className="font-bold text-xs text-gray-700 group-hover:text-blue-700">Student</div>
              </button>

              <button onClick={() => handleRoleSelect('teacher')}
                className="p-4 bg-gray-50 hover:bg-green-50 border-2 border-gray-200 hover:border-green-300 rounded-2xl text-center space-y-2 transition-all group active:scale-95">
                <School className="w-7 h-7 mx-auto text-gray-400 group-hover:text-green-600 transition-colors" />
                <div className="font-bold text-xs text-gray-700 group-hover:text-green-700">Teacher</div>
              </button>

              <button onClick={() => handleRoleSelect('admin')}
                className="p-4 bg-gray-50 hover:bg-orange-50 border-2 border-gray-200 hover:border-orange-300 rounded-2xl text-center space-y-2 transition-all group active:scale-95">
                <User className="w-7 h-7 mx-auto text-gray-400 group-hover:text-orange-600 transition-colors" />
                <div className="font-bold text-xs text-gray-700 group-hover:text-orange-700">School Admin</div>
              </button>

              <button onClick={() => handleRoleSelect('parent')}
                className="p-4 bg-gray-50 hover:bg-purple-50 border-2 border-gray-200 hover:border-purple-300 rounded-2xl text-center space-y-2 transition-all group active:scale-95">
                <Users className="w-7 h-7 mx-auto text-gray-400 group-hover:text-purple-600 transition-colors" />
                <div className="font-bold text-xs text-gray-700 group-hover:text-purple-700">Parent</div>
              </button>

              {/* SuperAdmin — ONLY visible for master codes (STHARA / ADMIN) */}
              {isSuperAdminCode && (
                <button onClick={() => handleRoleSelect('superadmin')}
                  className="col-span-2 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 hover:from-indigo-100 hover:to-blue-100 border-2 border-indigo-200 hover:border-indigo-400 rounded-2xl text-center space-y-1.5 transition-all group active:scale-95">
                  <ShieldCheck className="w-7 h-7 mx-auto text-indigo-600 group-hover:text-indigo-800 transition-colors" />
                  <div className="font-bold text-xs text-indigo-800">Super Administrator</div>
                  <div className="text-[10px] text-indigo-500">Platform-level access</div>
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: CREDENTIALS */}
        {step === 'CREDENTIALS' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold capitalize">
                {role === 'superadmin' ? '⚡ Super Admin' : role === 'admin' ? '🏫 School Admin' : `${role.charAt(0).toUpperCase()}${role.slice(1)}`}
              </div>
              <button type="button" onClick={() => setStep('ROLE_SELECT')}
                className="text-xs text-gray-400 hover:text-gray-700 flex items-center space-x-1 transition-colors">
                <ArrowLeft className="w-3 h-3" />
                <span>Change Role</span>
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-2xl">
                ⚠️ {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder={role === 'superadmin' ? 'admin@sthara.in' : 'your@email.com'}
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required autoFocus />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required />
              </div>
            </div>

            <button type="submit" disabled={isSigningIn}
              className="w-full py-3.5 bg-[#002147] hover:bg-blue-900 disabled:opacity-60 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2 active:scale-95">
              {isSigningIn
                ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Signing in...</span></>
                : <span>Sign In →</span>
              }
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
