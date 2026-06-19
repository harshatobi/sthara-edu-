'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, BookOpen, GraduationCap, Users, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';

type Step = 'SCHOOL_CODE' | 'ROLE_SELECT' | 'CREDENTIALS';

export default function LoginPage() {
  const router = useRouter();
  const { profile } = useAuth(); // We don't need setMockProfile anymore

  const [step, setStep] = useState<Step>('SCHOOL_CODE');
  const [schoolCode, setSchoolCode] = useState('');
  const [role, setRole] = useState<'student' | 'teacher' | 'admin' | 'parent' | 'superadmin' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [schoolCodeError, setSchoolCodeError] = useState('');

  const handleSchoolCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Auto-capitalize and strip any special characters (only allow letters and numbers)
    const rawValue = e.target.value.toUpperCase();
    const alphanumericOnly = rawValue.replace(/[^A-Z0-9]/g, '');
    
    // Check if user tried to type special characters
    if (rawValue !== alphanumericOnly && rawValue.length > 0) {
      setSchoolCodeError('Only letters and numbers are allowed');
    } else {
      setSchoolCodeError('');
    }

    // Apply max length constraint implicitly via state slicing or just let maxLength HTML attribute handle it
    setSchoolCode(alphanumericOnly);
  };

  const handleSchoolCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolCode.trim()) {
      setSchoolCodeError('School code cannot be empty');
      return;
    }
    
    if (schoolCode.length < 3) {
      setSchoolCodeError('School code is too short');
      return;
    }
    
    // Check if user is logging into the unified portal without a school code
    if (schoolCode === 'ADMIN') {
      // In a real app, this would route to a global admin login, but we'll just show role select for now
      // SuperAdmins should simply enter 'ADMIN' and log in to get routed by AuthContext
    }

    setSchoolCodeError('');
    setStep('ROLE_SELECT');
  };

  const handleRoleSelect = (selectedRole: any) => {
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

    try {
      // Login with Firebase
      const cred = await signInWithEmailAndPassword(auth, email, password);
      
      // Temporary setup hook for the newly created admin account
      if (email === 'admin@sthara.com') {
        const { setDoc, doc } = await import('firebase/firestore');
        await setDoc(doc(auth.app ? (await import('@/lib/firebase/config')).db : {} as any, 'superadmins', cred.user.uid), {
          email: 'admin@sthara.com',
          role: 'superadmin',
          createdAt: new Date()
        }).catch(e => console.error("Setup doc error:", e));
        
        await setDoc(doc(auth.app ? (await import('@/lib/firebase/config')).db : {} as any, 'global_users', cred.user.uid), {
          email: 'admin@sthara.com',
          role: 'superadmin',
          name: 'Super Admin'
        }).catch(e => console.error("Setup doc error:", e));
      }

      // We will let the useEffect handle the routing based on the actual profile role
    } catch (err: any) {
      console.error(err);
      setError('Invalid credentials or school mapping.');
    }
  };

  // Listen for profile changes to route accurately based on true database role
  useEffect(() => {
    if (profile) {
      if (profile.role === 'superadmin') router.push('/superadmin');
      else if (profile.role === 'student') router.push('/student');
      else if (profile.role === 'teacher') router.push('/teacher');
      else if (profile.role === 'admin') router.push('/admin');
      else if (profile.role === 'parent') router.push('/parent');
    }
  }, [profile, router]);

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
                  disabled={!schoolCode.trim()}
                  className="w-full flex items-center justify-center space-x-2 bg-white text-[#002147] py-3 rounded-xl font-semibold hover:bg-white/90 transition-colors disabled:opacity-50"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
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
                <div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>
                {error && <p className="text-[#dc143c] text-sm text-center font-medium bg-[#dc143c]/10 p-2 rounded-lg">{error}</p>}
                
                <button
                  type="submit"
                  className="w-full bg-white text-[#002147] py-3 rounded-xl font-semibold hover:bg-white/90 transition-colors mt-4"
                >
                  Sign In
                </button>
              </form>
            </div>
          )}

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
