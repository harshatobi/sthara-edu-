'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { BookOpen, KeyRound, User, Lock, Mail, ArrowLeft, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<'CODE' | 'ROLE_SELECT' | 'CREDENTIALS'>('CODE');
  const [schoolCode, setSchoolCode] = useState('');
  const [institutionType, setInstitutionType] = useState<'school' | 'college'>('school');
  const [role, setRole] = useState<'student' | 'teacher' | 'admin' | 'parent' | 'superadmin'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [schoolCodeError, setSchoolCodeError] = useState('');

  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSchoolCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolCode.trim()) { setSchoolCodeError('Please enter an institution code'); return; }

    const codeUpper = schoolCode.trim().toUpperCase();
    if (codeUpper === 'STHARA' || codeUpper === 'ADMIN') {
      setRole('superadmin');
      setStep('CREDENTIALS');
      return;
    }

    setIsVerifyingCode(true);
    setSchoolCodeError('');

    try {
      const res = await fetch('/api/auth/verify-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolCode: schoolCode.trim() }),
      });

      const data = await res.json();
      if (data.valid) {
        setInstitutionType(data.type === 'college' ? 'college' : 'school');
        setStep('ROLE_SELECT');
      } else {
        setSchoolCodeError(data.error || 'Institution code not found. Please check and try again.');
      }
    } catch (err: any) {
      console.error(err);
      setSchoolCodeError('Network error. Please check your connection and try again.');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleRoleSelect = (selectedRole: any) => {
    setRole(selectedRole);
    setStep('CREDENTIALS');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please enter email and password'); return; }

    setIsSigningIn(true);
    const timeoutId = setTimeout(() => {
      setIsSigningIn(false);
      setError('Login timed out. Please try again.');
    }, 20000);

    try {
      const inputEmail = email.trim().toLowerCase();

      // If SuperAdmin or admin@sthara.in, ensure account is provisioned in Supabase
      if (inputEmail === 'admin@sthara.in' || role === 'superadmin') {
        try {
          await fetch('/api/superadmin/create-superadmin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: inputEmail, password, name: 'Super Admin' }),
          });
        } catch (provisionErr) {
          console.warn('[superadmin provision error]', provisionErr);
        }
      }

      // Sign in with Supabase Auth
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: inputEmail,
        password,
      });

      clearTimeout(timeoutId);

      if (signInError || !data?.session) {
        setError(signInError?.message || 'Sign in failed. Please check credentials.');
        setIsSigningIn(false);
        return;
      }

      // Successful login redirect based on role
      const userRole = role;
      if (userRole === 'superadmin') router.push('/superadmin');
      else if (userRole === 'admin') router.push('/admin');
      else if (userRole === 'teacher') router.push('/teacher');
      else if (userRole === 'parent') router.push('/parent');
      else router.push('/student');

    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Login submit error:', err);
      setError(err.message || 'Login failed. Please try again.');
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border border-gray-100 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-indigo-600 text-white rounded-2xl shadow-md">
            <BookOpen className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#002147]">Sthara School OS</h1>
          <p className="text-xs text-gray-500 font-medium">Sign in to your institutional account</p>
        </div>

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
                  placeholder="Enter code (e.g. STHARA)"
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isVerifyingCode}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2"
            >
              {isVerifyingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Continue →</span>}
            </button>
          </form>
        )}

        {step === 'ROLE_SELECT' && (
          <div className="space-y-4">
            <button onClick={() => setStep('CODE')} className="text-xs text-gray-500 hover:text-gray-800 flex items-center space-x-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Institution Code</span>
            </button>

            <div className="grid grid-cols-2 gap-3">
              {(['student', 'teacher', 'admin', 'parent'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => handleRoleSelect(r)}
                  className="p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-2xl text-center space-y-1 transition-all group"
                >
                  <User className="w-5 h-5 mx-auto text-gray-500 group-hover:text-indigo-600" />
                  <div className="font-bold text-xs capitalize text-[#002147] group-hover:text-indigo-600">{r}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'CREDENTIALS' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <button onClick={() => setStep('CODE')} className="text-xs text-gray-500 hover:text-gray-800 flex items-center space-x-1 mb-2">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change Role ({role})</span>
            </button>

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
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSigningIn}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2"
            >
              {isSigningIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Sign In →</span>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
