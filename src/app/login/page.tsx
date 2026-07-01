'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, BookOpen, GraduationCap, Users, ArrowRight, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';

import { auth, db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';


type Step = 'SCHOOL_CODE' | 'ROLE_SELECT' | 'CREDENTIALS';

export default function LoginPage() {
  const router = useRouter();
  const { profile, loading } = useAuth();

  const [step, setStep] = useState<Step>('SCHOOL_CODE');
  const [schoolCode, setSchoolCode] = useState('');
  const [role, setRole] = useState<'student' | 'teacher' | 'admin' | 'parent' | 'superadmin' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [schoolCodeError, setSchoolCodeError] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [loginAttempted, setLoginAttempted] = useState(false);

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
    if (!schoolCode.trim()) {
      setSchoolCodeError('School code cannot be empty');
      return;
    }
    
    if (schoolCode.length < 3) {
      setSchoolCodeError('School code is too short');
      return;
    }
    
    if (schoolCode === 'STHARA' || schoolCode === 'ADMIN') {
      setSchoolCodeError('');
      setStep('ROLE_SELECT');
      return;
    }

    setIsVerifyingCode(true);
    setSchoolCodeError('');

    try {
      // First try direct doc lookup (schoolCode IS the docId — used by superadmin portal)
      const directSnap = await getDoc(doc(db, 'schools', schoolCode));
      if (directSnap.exists()) {
        setStep('ROLE_SELECT');
        return;
      }
      // Fallback: query by 'code' field (legacy schools)
      const q = query(collection(db, 'schools'), where('code', '==', schoolCode));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setStep('ROLE_SELECT');
        return;
      }
      setSchoolCodeError('School Code Not Found. Please check and try again.');
    } catch (err) {
      console.error(err);
      setSchoolCodeError('Network error. Please try again.');
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
    console.log('Login submit triggered', { email, role });
    setError('');
    
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setIsSigningIn(true);
    // safety timeout to avoid indefinite spinner
    const timeoutId = setTimeout(() => {
      console.warn('Login timeout reached');
      setIsSigningIn(false);
      setError('Login is taking longer than expected. Please try again later.');
    }, 15000);
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      clearTimeout(timeoutId);
      console.log('Firebase signIn success', credential);
      const uid = credential.user.uid;

      // ── Directly fetch role from Firestore and redirect immediately ──
      // Don't rely on useEffect + AuthContext chain — it has timing issues
      let userRole: string | null = null;
      console.log('Fetching user role for uid', uid);

      // 1. Check superadmins collection first
      try {
        const saSnap = await getDoc(doc(db, 'superadmins', uid));
        if (saSnap.exists()) {
          userRole = 'superadmin';
          console.log('User found in superadmins collection');
        }
      } catch (e) { console.error('Error checking superadmins', e); }

      // 2. Check global_users
      if (!userRole) {
        try {
          const guSnap = await getDoc(doc(db, 'global_users', uid));
          if (guSnap.exists()) {
            userRole = guSnap.data().role;
            console.log('User found in global_users collection with role', userRole);
          }
        } catch (e) { console.error('Error checking global_users', e); }
      }

      // 3. Check users (legacy)
      if (!userRole) {
        try {
          const uSnap = await getDoc(doc(db, 'users', uid));
          if (uSnap.exists()) {
            userRole = uSnap.data().role;
            console.log('User found in users collection with role', userRole);
          }
        } catch (e) { console.error('Error checking users', e); }
      }

      if (!userRole) {
        setError('Account profile not found. Please contact your school administrator.');
        setIsSigningIn(false);
        console.warn('No role found for uid');
        return;
      }

      // Role mismatch check (allow superadmin to use 'admin' or 'superadmin' selector)
      const isSuperadmin = userRole === 'superadmin';
      const selectedSuperadmin = role === 'superadmin' || role === 'admin';
      if (role && userRole !== role && !(isSuperadmin && selectedSuperadmin)) {
        await signOut(auth);
        setError(`This account is not registered as a ${role}. Please go back and select the correct role.`);
        setIsSigningIn(false);
        console.warn('Role mismatch', { selected: role, actual: userRole });
        return;
      }

      // ── Redirect based on role ──
      const destinations: Record<string, string> = {
        superadmin: '/superadmin',
        teacher:    '/teacher',
        student:    '/student',
        admin:      '/admin',
        parent:     '/parent',
      };
      console.log('Redirecting to role dashboard', userRole);
      window.location.href = destinations[userRole] || '/';

    } catch (err: any) {
      console.error('Login error', err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Incorrect email or password. Please try again.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please reset your password or try again later.');
      } else {
        setError('Sign in failed. Please check your connection and try again.');
      }
      setIsSigningIn(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setResetMessage('');
    if (!email) {
      setError('Please enter your email first to reset your password.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setResetMessage('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      console.error(err);
      setError('Failed to send reset email. Make sure your email is correct.');
    }
  };

      // Allow superadmin to log in via either 'admin' or 'superadmin' role selection
      const isRoleMismatch = role && profile.role !== role &&
        !(profile.role === 'superadmin' && (role === 'admin' || role === 'superadmin'));
      if (isRoleMismatch) {
        signOut(auth).then(() => {
          setError(`This account is not registered as a ${role}. Please go back and select the correct role.`);
          setIsSigningIn(false);
          setLoginAttempted(false);
        }).catch(console.error);
        return;
      }
      // Correct role — redirect to dashboard
      if (profile.role === 'superadmin') { router.push('/superadmin'); return; }
      if (profile.role === 'student')    { router.push('/student');    return; }
      if (profile.role === 'teacher')    { router.push('/teacher');    return; }
      if (profile.role === 'admin')      { router.push('/admin');      return; }
      if (profile.role === 'parent')     { router.push('/parent');     return; }
    }
    // NOTE: Do NOT auto-signout when already logged in visiting /login.
    // This caused a race condition where fresh logins got signed out mid-flow.
  }, [loading, profile, loginAttempted, router, role]);


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#001229] to-[#002147] p-6">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center">
        {/* Branding Section */}
        <div className="text-white space-y-6">
          <div className="flex items-center space-x-3 mb-8">
            <Shield className="w-12 h-12 text-[#dc143c]" />
            <h1 className="text-4xl font-bold tracking-tight">Sthara</h1>
          </div>
          <h2 className="text-3xl font-light">The Unified School OS</h2>
          <p className="text-white/70 text-lg">
            High-integrity educational platform powered by advanced diagnostics and adaptive learning.
          </p>
        </div>

        {/* Dynamic Login Flow */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl shadow-2xl min-h-[400px] flex flex-col justify-center relative">
          
          {step === 'SCHOOL_CODE' && (
            <div className="animate-in fade-in duration-300">
              <h3 className="text-2xl font-semibold text-white mb-2">Welcome</h3>
              <p className="text-white/60 mb-8">Enter your school code to continue.</p>
              
              <form onSubmit={handleSchoolCodeSubmit} className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={schoolCode}
                    onChange={handleSchoolCodeChange}
                    placeholder="e.g. DPS101"
                    maxLength={10}
                    className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 uppercase transition-colors ${
                      schoolCodeError 
                        ? 'border-[#dc143c] focus:ring-[#dc143c]/50' 
                        : 'border-white/10 focus:ring-white/20'
                    }`}
                  />
                  {schoolCodeError && (
                    <p className="text-[#dc143c] text-sm mt-2 font-medium" data-testid="school-code-error">
                      {schoolCodeError}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!schoolCode.trim() || isVerifyingCode}
                  className="w-full flex items-center justify-center space-x-2 bg-white text-[#002147] py-3 rounded-xl font-semibold hover:bg-white/90 focus:ring-4 focus:ring-white/40 active:scale-95 transition-all disabled:opacity-50"
                >
                  <span>{isVerifyingCode ? 'Verifying...' : 'Continue'}</span>
                  {!isVerifyingCode && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            </div>
          )}

          {step === 'ROLE_SELECT' && (
            <div className="animate-in slide-in-from-right-4 duration-300">
              <button 
                onClick={() => setStep('SCHOOL_CODE')}
                className="absolute top-6 left-6 text-white/50 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <h3 className="text-2xl font-semibold text-white mb-2 mt-4 text-center">Select your role</h3>
              <p className="text-white/60 mb-8 text-center text-sm">School: {schoolCode.toUpperCase()}</p>
              
              <div className="grid grid-cols-2 gap-4">
                <RoleCard onClick={() => handleRoleSelect('student')} icon={BookOpen} title="Student" subtitle="Honest Desk" />
                <RoleCard onClick={() => handleRoleSelect('teacher')} icon={GraduationCap} title="Teacher" subtitle="Diagnostic Engine" />
                <RoleCard onClick={() => handleRoleSelect('admin')} icon={Shield} title="Admin" subtitle="Command Center" />
                <RoleCard onClick={() => handleRoleSelect('parent')} icon={Users} title="Parent" subtitle="Growth Feed" />
                {(schoolCode === 'STHARA' || schoolCode === 'ADMIN') && (
                  <RoleCard onClick={() => handleRoleSelect('superadmin')} icon={Shield} title="Super Admin" subtitle="Platform Control" />
                )}
              </div>
            </div>
          )}

          {step === 'CREDENTIALS' && (
            <div className="animate-in slide-in-from-right-4 duration-300">
               <button 
                onClick={() => role === 'superadmin' ? setStep('SCHOOL_CODE') : setStep('ROLE_SELECT')}
                className="absolute top-6 left-6 text-white/50 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <h3 className="text-2xl font-semibold text-white mb-2 mt-4">Sign In</h3>
              <p className="text-white/60 mb-8 text-sm capitalize">
                {role} Portal {role !== 'superadmin' && `• ${schoolCode.toUpperCase()}`}
              </p>
              
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email Address"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {error && <p className="text-[#dc143c] text-sm text-center font-medium bg-[#dc143c]/10 p-2 rounded-lg">{error}</p>}
                {resetMessage && <p className="text-green-400 text-sm text-center font-medium bg-green-400/10 p-2 rounded-lg">{resetMessage}</p>}
                
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-white/60 hover:text-white text-sm transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isSigningIn || !email || !password}
                  className="w-full flex items-center justify-center space-x-2 bg-white text-[#002147] py-3 rounded-xl font-semibold hover:bg-white/90 transition-colors mt-4 disabled:opacity-50 disabled:bg-white/50"
                >
                  {isSigningIn ? (
                    <>
                      <div className="w-5 h-5 border-2 border-[#002147]/30 border-t-[#002147] rounded-full animate-spin" />
                      <span>Signing you in...</span>
                    </>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </form>
            </div>
          )}

        </div>

        {/* Register your school / privacy links */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-white/40 text-sm font-medium">
            New school?{' '}
            <Link href="/onboard" className="text-white font-bold hover:underline">
              Register for a free 30-day trial →
            </Link>
          </p>
          <p className="text-white/30 text-xs">
            <Link href="/privacy" className="hover:text-white/50 transition-colors">Privacy Policy</Link>
            {' · '}
            <Link href="/terms" className="hover:text-white/50 transition-colors">Terms of Service</Link>
          </p>
        </div>
      </div>
    </div>
  );
}


function RoleCard({ onClick, icon: Icon, title, subtitle }: { onClick: () => void; icon: any; title: string; subtitle: string }) {
  return (
    <button 
      onClick={onClick}
      className="group flex flex-col items-center justify-center p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/20 hover:border-white/30 transition-all duration-300 w-full text-center"
    >
      <Icon className="w-8 h-8 text-[#dc143c] group-hover:scale-110 transition-transform duration-300 mb-3" />
      <h4 className="text-white font-medium text-sm">{title}</h4>
      <p className="text-white/60 text-[10px] mt-1">{subtitle}</p>
    </button>
  );
}
