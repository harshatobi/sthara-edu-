'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, BookOpen, GraduationCap, Users, ArrowRight, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Step = 'SCHOOL_CODE' | 'ROLE_SELECT' | 'CREDENTIALS';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep]                     = useState<Step>('SCHOOL_CODE');
  const [schoolCode, setSchoolCode]         = useState('');
  const [institutionType, setInstitutionType] = useState<'school' | 'college'>('school');
  const [role, setRole]                     = useState<'student' | 'teacher' | 'admin' | 'parent' | 'superadmin' | null>(null);
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [showPassword, setShowPassword]     = useState(false);
  const [error, setError]                   = useState('');
  const [schoolCodeError, setSchoolCodeError] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [resetMessage, setResetMessage]     = useState('');
  const [isSigningIn, setIsSigningIn]       = useState(false);

  const handleSchoolCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.toUpperCase();
    const alphanumericOnly = rawValue.replace(/[^A-Z0-9]/g, '');
    if (rawValue !== alphanumericOnly && rawValue.length > 0) {
      setSchoolCodeError('Only letters and numbers are allowed');
    } else {
      setSchoolCodeError('');
    }
    setSchoolCode(alphanumericOnly);
  };

  const handleSchoolCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolCode.trim()) { setSchoolCodeError('School code cannot be empty'); return; }
    if (schoolCode.length < 3) { setSchoolCodeError('School code is too short'); return; }

    // Superadmin code — skip school lookup
    if (schoolCode === 'STHARA' || schoolCode === 'ADMIN') {
      setSchoolCodeError('');
      setStep('ROLE_SELECT');
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

      // Sign in with Supabase
      let { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: inputEmail,
        password,
      });

      // Auto-provision SuperAdmin if first login with admin@sthara.in
      if (signInError && (inputEmail === 'admin@sthara.in' || role === 'superadmin')) {
        try {
          const saRes = await fetch('/api/superadmin/create-superadmin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: inputEmail, password, name: 'Super Admin' }),
          });
          const saJson = await saRes.json();
          if (saJson.success) {
            const retry = await supabase.auth.signInWithPassword({ email: inputEmail, password });
            data = retry.data;
            signInError = retry.error;
          }
        } catch (saErr) {
          console.error('[superadmin provision error]', saErr);
        }
      }

      clearTimeout(timeoutId);

      if (signInError || !data?.session) {
        if (signInError?.message?.toLowerCase().includes('invalid')) {
          setError('Incorrect email or password. Please try again.');
        } else {
          setError(signInError?.message || 'Sign in failed. Please try again.');
        }
        setIsSigningIn(false);
        return;
      }

      // Get role from server
      const res = await fetch('/api/auth/get-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: data.session.access_token }),
      });
      const roleData = await res.json();

      if (!res.ok || !roleData.role) {
        await supabase.auth.signOut();
        setError('Account profile not found. Please contact your school administrator.');
        setIsSigningIn(false);
        return;
      }

      const userRole: string = roleData.role;

      // Role mismatch check
      const isSuperadmin = userRole === 'superadmin';
      const selectedSuperadmin = role === 'superadmin' || role === 'admin';
      if (role && userRole !== role && !(isSuperadmin && selectedSuperadmin)) {
        await supabase.auth.signOut();
        setError(`This account is not registered as a ${role}. Please go back and select the correct role.`);
        setIsSigningIn(false);
        return;
      }

      const destinations: Record<string, string> = {
        superadmin: '/superadmin',
        teacher:    '/teacher',
        student:    '/student',
        admin:      '/admin',
        parent:     '/parent',
      };
      window.location.href = destinations[userRole] || '/';

    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Login error:', err);
      setError(err.message || 'An unexpected error occurred.');
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold text-[#002147]">
          Sthara School OS
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Sign in to your institutional account
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-gray-100 sm:rounded-3xl sm:px-10 border border-gray-100">
          {step === 'SCHOOL_CODE' && (
            <form onSubmit={handleSchoolCodeSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Institution Code
                </label>
                <input
                  type="text"
                  value={schoolCode}
                  onChange={handleSchoolCodeChange}
                  placeholder="Enter School Code (e.g. STHARA)"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-center tracking-widest text-lg uppercase"
                />
                {schoolCodeError && <p className="text-xs text-rose-500 mt-2 font-medium">{schoolCodeError}</p>}
                <p className="text-xs text-gray-400 mt-2 text-center">Enter <strong>STHARA</strong> for SuperAdmin access</p>
              </div>

              <button
                type="submit"
                disabled={isVerifyingCode}
                className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center justify-center space-x-2"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {step === 'ROLE_SELECT' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setStep('SCHOOL_CODE')}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 font-semibold mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Code
              </button>

              <h3 className="text-lg font-bold text-[#002147] mb-2">Select Role</h3>

              <div className="grid grid-cols-1 gap-3">
                {[
                  { r: 'admin', label: 'School Admin', icon: Shield, desc: 'Manage institution, staff, & students' },
                  { r: 'teacher', label: 'Teacher', icon: BookOpen, desc: 'Syllabus, homework, & grading' },
                  { r: 'student', label: 'Student', icon: GraduationCap, desc: 'Homework, AI tutor, & progress' },
                  { r: 'parent', label: 'Parent', icon: Users, desc: 'Child monitoring & messages' },
                  { r: 'superadmin', label: 'Super Admin', icon: Shield, desc: 'Global platform control' },
                ].map(item => (
                  <button
                    key={item.r}
                    onClick={() => handleRoleSelect(item.r)}
                    className="p-4 border border-gray-200 rounded-2xl text-left hover:border-indigo-600 hover:bg-indigo-50/50 transition-all flex items-center space-x-4 group"
                  >
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <item.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{item.label}</div>
                      <div className="text-xs text-gray-500">{item.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'CREDENTIALS' && (
            <form onSubmit={handleLoginSubmit} className="space-y-6">
              <button
                type="button"
                onClick={() => setStep('ROLE_SELECT')}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 font-semibold mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Change Role ({role})
              </button>

              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@sthara.in"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center justify-center space-x-2"
              >
                <span>{isSigningIn ? 'Signing in...' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
