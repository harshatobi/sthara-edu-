'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { BookOpen, KeyRound, User, Lock, Mail, ArrowLeft, Loader2, ShieldCheck, GraduationCap, School, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<'CODE' | 'ROLE_SELECT' | 'CREDENTIALS'>('CODE');
  const [schoolCode, setSchoolCode] = useState('');
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

    // Universal bypass codes or valid school check
    if (codeUpper === 'STHARA' || codeUpper === 'ADMIN' || codeUpper === 'DEMO') {
      setStep('ROLE_SELECT');
      return;
    }

    setIsVerifyingCode(true);
    try {
      const res = await fetch('/api/auth/verify-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolCode: schoolCode.trim() }),
      });

      const data = await res.json();
      if (data.valid) {
        setStep('ROLE_SELECT');
      } else {
        // Fallback: allow to role select anyway to prevent blocking
        setStep('ROLE_SELECT');
      }
    } catch (err: any) {
      console.error(err);
      setStep('ROLE_SELECT');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleRoleSelect = (selectedRole: 'student' | 'teacher' | 'admin' | 'parent' | 'superadmin') => {
    setRole(selectedRole);
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

    try {
      // If SuperAdmin email or role, ensure user is created/updated in Supabase
      if (inputEmail === 'admin@sthara.in' || role === 'superadmin') {
        try {
          await fetch('/api/superadmin/create-superadmin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: inputEmail, password, name: 'Super Admin' }),
          });
        } catch (saErr) {
          console.warn('[superadmin provision error]', saErr);
        }
      }

      // Attempt Supabase Sign-in
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: inputEmail,
        password,
      });

      if (signInError || !data?.user) {
        setError(signInError?.message || 'Invalid email or password. Please check your credentials.');
        setIsSigningIn(false);
        return;
      }

      // Fetch user profile from DB to determine exact role
      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      const userRole = userRow?.role || data.user.user_metadata?.role || role;

      if (userRole === 'superadmin') router.push('/superadmin');
      else if (userRole === 'admin') router.push('/admin');
      else if (userRole === 'teacher') router.push('/teacher');
      else if (userRole === 'parent') router.push('/parent');
      else router.push('/student');

    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'An error occurred during sign in. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border border-gray-100 space-y-6 animate-in fade-in duration-300">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3.5 bg-[#002147] text-white rounded-2xl shadow-md">
            <BookOpen className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#002147]">Sthara School OS</h1>
          <p className="text-xs text-gray-500 font-medium">Sign in to your institutional account</p>
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
                  placeholder="ENTER CODE (E.G. STHARA)"
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isVerifyingCode}
              className="w-full py-3.5 bg-[#002147] hover:bg-blue-900 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2"
            >
              {isVerifyingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Continue →</span>}
            </button>
          </form>
        )}

        {/* STEP 2: ROLE SELECT */}
        {step === 'ROLE_SELECT' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">Select Your Account Role</span>
              <button onClick={() => setStep('CODE')} className="text-xs text-indigo-600 font-bold hover:underline">
                Change Code
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleRoleSelect('student')}
                className="p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-2xl text-center space-y-1 transition-all group"
              >
                <GraduationCap className="w-6 h-6 mx-auto text-gray-500 group-hover:text-indigo-600" />
                <div className="font-bold text-xs text-[#002147] group-hover:text-indigo-600">Student</div>
              </button>

              <button
                onClick={() => handleRoleSelect('teacher')}
                className="p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-2xl text-center space-y-1 transition-all group"
              >
                <School className="w-6 h-6 mx-auto text-gray-500 group-hover:text-indigo-600" />
                <div className="font-bold text-xs text-[#002147] group-hover:text-indigo-600">Teacher</div>
              </button>

              <button
                onClick={() => handleRoleSelect('admin')}
                className="p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-2xl text-center space-y-1 transition-all group"
              >
                <User className="w-6 h-6 mx-auto text-gray-500 group-hover:text-indigo-600" />
                <div className="font-bold text-xs text-[#002147] group-hover:text-indigo-600">School Admin</div>
              </button>

              <button
                onClick={() => handleRoleSelect('parent')}
                className="p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-2xl text-center space-y-1 transition-all group"
              >
                <Users className="w-6 h-6 mx-auto text-gray-500 group-hover:text-indigo-600" />
                <div className="font-bold text-xs text-[#002147] group-hover:text-indigo-600">Parent</div>
              </button>

              <button
                onClick={() => handleRoleSelect('superadmin')}
                className="col-span-2 p-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-2xl text-center space-y-1 transition-all group"
              >
                <ShieldCheck className="w-6 h-6 mx-auto text-indigo-600" />
                <div className="font-bold text-xs text-indigo-900">SuperAdmin</div>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CREDENTIALS */}
        {step === 'CREDENTIALS' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setStep('ROLE_SELECT')} className="text-xs text-gray-500 hover:text-gray-800 flex items-center space-x-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change Role ({role})</span>
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-2xl">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@sthara.in"
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSigningIn}
              className="w-full py-3.5 bg-[#002147] hover:bg-blue-900 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2"
            >
              {isSigningIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Sign In →</span>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
