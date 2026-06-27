'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  School, CheckCircle, ArrowRight, ArrowLeft, Loader2,
  BookOpen, Users, Shield, Sparkles, Building2, Mail,
  Phone, Globe, Lock, Eye, EyeOff, Zap
} from 'lucide-react';
import Link from 'next/link';

// ─── Firebase secondary app (so we don't sign out the current admin) ───────────
function getSecondaryAuth() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const secondaryApp = getApps().find(a => a.name === 'secondary') || initializeApp(config, 'secondary');
  return getAuth(secondaryApp);
}

// ─── Generate a unique 6-character school code ──────────────────────────────
function generateSchoolCode(name: string): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3)
    .padEnd(3, 'X');
  const suffix = Math.floor(100 + Math.random() * 900).toString();
  return `${prefix}${suffix}`;
}

type Step = 'SCHOOL_INFO' | 'ADMIN_SETUP' | 'REVIEW' | 'DONE';

const CURRICULUM_OPTIONS = ['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge IGCSE', 'Other'];
const BOARD_OPTIONS = [
  'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Andhra Pradesh', 'Telangana',
  'Delhi', 'Rajasthan', 'Uttar Pradesh', 'Kerala', 'Gujarat', 'Other'
];

export default function OnboardPage() {
  const router = useRouter();

  // Step tracking
  const [step, setStep] = useState<Step>('SCHOOL_INFO');

  // School info
  const [schoolName, setSchoolName] = useState('');
  const [curriculum, setCurriculum] = useState('CBSE');
  const [board, setBoard] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');

  // Admin account
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [schoolCode, setSchoolCode] = useState('');

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateSchoolInfo = () => {
    if (!schoolName.trim()) { setError('School name is required.'); return false; }
    if (schoolName.trim().length < 3) { setError('School name must be at least 3 characters.'); return false; }
    if (!city.trim()) { setError('City is required.'); return false; }
    if (!curriculum) { setError('Please select a curriculum.'); return false; }
    setError(''); return true;
  };

  const validateAdminSetup = () => {
    if (!adminName.trim()) { setError('Admin name is required.'); return false; }
    if (!adminEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      setError('Please enter a valid email address.'); return false;
    }
    if (adminPassword.length < 8) { setError('Password must be at least 8 characters.'); return false; }
    if (!/(?=.*[A-Z])/.test(adminPassword)) { setError('Password must contain at least one uppercase letter.'); return false; }
    if (!/(?=.*[0-9])/.test(adminPassword)) { setError('Password must contain at least one number.'); return false; }
    setError(''); return true;
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validateAdminSetup()) return;
    setIsSubmitting(true);
    setError('');

    try {
      // 1. Check if email is already registered
      const emailCheck = query(collection(db, 'users'), where('email', '==', adminEmail.toLowerCase()));
      const emailSnap = await getDocs(emailCheck);
      if (!emailSnap.empty) {
        setError('This email is already registered. Please use a different email.');
        setIsSubmitting(false);
        return;
      }

      // 2. Generate unique school code (ensure uniqueness)
      let code = generateSchoolCode(schoolName);
      let codeExists = true;
      let attempts = 0;
      while (codeExists && attempts < 10) {
        const codeCheck = query(collection(db, 'schools'), where('code', '==', code));
        const codeSnap = await getDocs(codeCheck);
        if (codeSnap.empty) { codeExists = false; }
        else { code = generateSchoolCode(schoolName); attempts++; }
      }

      const schoolId = `sch-${code.toLowerCase()}`;

      // 3. Create admin Firebase Auth account (via secondary app)
      const secondaryAuth = getSecondaryAuth();
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, adminEmail.toLowerCase(), adminPassword);
      const adminUid = userCred.user.uid;
      await signOut(secondaryAuth);

      // 4. Create school document
      await setDoc(doc(db, 'schools', schoolId), {
        name: schoolName.trim(),
        code,
        curriculum,
        board: board || null,
        city: city.trim(),
        phone: phone.trim() || null,
        website: website.trim() || null,
        createdAt: serverTimestamp(),
        adminUid,
        adminEmail: adminEmail.toLowerCase(),
        plan: 'trial',   // All new schools start on trial
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30-day trial
        active: true,
      });

      // 5. Create admin user in global users collection
      await setDoc(doc(db, 'users', adminUid), {
        uid: adminUid,
        email: adminEmail.toLowerCase(),
        name: adminName.trim(),
        role: 'admin',
        schoolId,
        createdAt: serverTimestamp(),
      });

      // 6. Also add to school's users subcollection
      await setDoc(doc(db, 'schools', schoolId, 'users', adminUid), {
        uid: adminUid,
        email: adminEmail.toLowerCase(),
        name: adminName.trim(),
        role: 'admin',
        schoolId,
        createdAt: serverTimestamp(),
      });

      setSchoolCode(code);
      setStep('DONE');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered with another account.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.');
      } else {
        setError('Registration failed. Please check your connection and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (step === 'DONE') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#001233] via-[#002147] to-[#003580] flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-10 text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-emerald-200">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-black text-[#002147] mb-2">Welcome to Sthara! 🎉</h1>
          <p className="text-gray-500 font-medium mb-8">Your school is registered and ready to go.</p>

          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 mb-8 text-left space-y-3">
            <h3 className="font-bold text-[#002147] text-sm uppercase tracking-widest mb-3">Your School Credentials</h3>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-sm font-medium">School Name</span>
              <span className="font-bold text-[#002147]">{schoolName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-sm font-medium">School Code</span>
              <span className="font-black text-2xl text-blue-700 tracking-widest">{schoolCode}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-sm font-medium">Admin Email</span>
              <span className="font-bold text-[#002147]">{adminEmail}</span>
            </div>
            <div className="border-t border-blue-200 pt-3 mt-3">
              <p className="text-xs text-blue-600 font-semibold">
                📋 Save this information! Your School Code is what teachers and students use to log in.
              </p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-sm text-amber-700 font-medium text-left">
            🕐 Your 30-day free trial starts now. Add your teachers and students from the Admin dashboard.
          </div>

          <Link
            href="/login"
            className="block w-full py-4 bg-[#002147] text-white rounded-2xl font-bold text-lg hover:bg-[#003580] transition-colors"
          >
            Go to Login →
          </Link>
          <p className="text-xs text-gray-400 mt-4">Enter school code <strong>{schoolCode}</strong> + your admin credentials</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001233] via-[#002147] to-[#003580] flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 mb-4">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <span className="text-white/80 text-sm font-semibold">Free 30-Day Trial — No Credit Card</span>
          </div>
          <h1 className="text-4xl font-black text-white mb-2">Get Started with Sthara</h1>
          <p className="text-white/60 font-medium">AI-powered learning management for your school</p>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center justify-center space-x-2 mb-8">
          {(['SCHOOL_INFO', 'ADMIN_SETUP', 'REVIEW'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                step === s ? 'bg-white text-[#002147] border-white' :
                (['SCHOOL_INFO', 'ADMIN_SETUP', 'REVIEW'].indexOf(step) > i)
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white/20 text-white/40 border-white/20'
              }`}>
                {['SCHOOL_INFO', 'ADMIN_SETUP', 'REVIEW'].indexOf(step) > i ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              {i < 2 && <div className={`w-12 h-0.5 mx-1 ${['SCHOOL_INFO', 'ADMIN_SETUP', 'REVIEW'].indexOf(step) > i ? 'bg-emerald-500' : 'bg-white/20'}`} />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">

          {/* ── Step 1: School Info ─────────────────────────────────────────── */}
          {step === 'SCHOOL_INFO' && (
            <div className="p-8 md:p-10">
              <div className="flex items-center space-x-3 mb-8">
                <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-[#002147]">School Information</h2>
                  <p className="text-gray-400 text-sm font-medium">Tell us about your institution</p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">School Name *</label>
                  <input
                    id="school-name"
                    type="text"
                    value={schoolName}
                    onChange={e => setSchoolName(e.target.value)}
                    placeholder="e.g. Delhi Public School, Bhopal"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-medium transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Curriculum *</label>
                    <select
                      id="curriculum"
                      value={curriculum}
                      onChange={e => setCurriculum(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-medium bg-white"
                    >
                      {CURRICULUM_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">State Board (if applicable)</label>
                    <select
                      id="board"
                      value={board}
                      onChange={e => setBoard(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-medium bg-white"
                    >
                      <option value="">Select state...</option>
                      {BOARD_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">City *</label>
                    <input
                      id="city"
                      type="text"
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      placeholder="e.g. Mumbai"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Phone (optional)</label>
                    <input
                      id="school-phone"
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Website (optional)</label>
                  <input
                    id="school-website"
                    type="url"
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                    placeholder="https://yourschool.edu.in"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-medium"
                  />
                </div>
              </div>

              {error && <p className="mt-4 text-red-600 text-sm font-semibold bg-red-50 p-3 rounded-xl border border-red-200">{error}</p>}

              <button
                id="next-to-admin"
                onClick={() => { if (validateSchoolInfo()) setStep('ADMIN_SETUP'); }}
                className="mt-8 w-full py-4 bg-[#002147] text-white rounded-2xl font-bold text-lg hover:bg-[#003580] transition-colors flex items-center justify-center space-x-2"
              >
                <span>Continue</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* ── Step 2: Admin Account ───────────────────────────────────────── */}
          {step === 'ADMIN_SETUP' && (
            <div className="p-8 md:p-10">
              <div className="flex items-center space-x-3 mb-8">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-[#002147]">Admin Account</h2>
                  <p className="text-gray-400 text-sm font-medium">This will be the school administrator</p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Full Name *</label>
                  <input
                    id="admin-name"
                    type="text"
                    value={adminName}
                    onChange={e => setAdminName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Work Email *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      id="admin-email"
                      type="email"
                      value={adminEmail}
                      onChange={e => setAdminEmail(e.target.value)}
                      placeholder="admin@yourschool.edu.in"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-medium"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      placeholder="Min 8 chars, 1 uppercase, 1 number"
                      className="w-full pl-10 pr-12 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-medium"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Password strength indicator */}
                  <div className="mt-2 flex space-x-1">
                    {[
                      adminPassword.length >= 8,
                      /[A-Z]/.test(adminPassword),
                      /[0-9]/.test(adminPassword),
                      /[^A-Za-z0-9]/.test(adminPassword),
                    ].map((met, i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${met ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">Strength: 8+ chars · uppercase · number · special char</p>
                </div>
              </div>

              {error && <p className="mt-4 text-red-600 text-sm font-semibold bg-red-50 p-3 rounded-xl border border-red-200">{error}</p>}

              <div className="mt-8 flex space-x-3">
                <button
                  onClick={() => { setError(''); setStep('SCHOOL_INFO'); }}
                  className="flex-1 py-4 border border-gray-200 text-gray-600 rounded-2xl font-bold hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  id="next-to-review"
                  onClick={() => { if (validateAdminSetup()) setStep('REVIEW'); }}
                  className="flex-2 flex-1 py-4 bg-[#002147] text-white rounded-2xl font-bold hover:bg-[#003580] transition-colors flex items-center justify-center space-x-2"
                >
                  <span>Review</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Review ──────────────────────────────────────────────── */}
          {step === 'REVIEW' && (
            <div className="p-8 md:p-10">
              <div className="flex items-center space-x-3 mb-8">
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-[#002147]">Review & Confirm</h2>
                  <p className="text-gray-400 text-sm font-medium">Everything look good?</p>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="bg-gray-50 rounded-2xl p-5 space-y-3 border border-gray-100">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center space-x-1.5">
                    <Building2 className="w-3.5 h-3.5" /><span>School Details</span>
                  </h3>
                  <Row label="Name" value={schoolName} />
                  <Row label="Curriculum" value={curriculum} />
                  {board && <Row label="State Board" value={board} />}
                  <Row label="City" value={city} />
                  {phone && <Row label="Phone" value={phone} />}
                  {website && <Row label="Website" value={website} />}
                </div>

                <div className="bg-gray-50 rounded-2xl p-5 space-y-3 border border-gray-100">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center space-x-1.5">
                    <Shield className="w-3.5 h-3.5" /><span>Admin Account</span>
                  </h3>
                  <Row label="Name" value={adminName} />
                  <Row label="Email" value={adminEmail} />
                  <Row label="Password" value={'•'.repeat(adminPassword.length)} />
                </div>

                <div className="bg-blue-50 rounded-2xl p-4 border border-blue-200 text-sm text-blue-700 font-medium">
                  🎁 <strong>30-day free trial</strong> starts immediately. No credit card required. 
                  Add unlimited teachers and students during your trial.
                </div>

                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 text-xs text-gray-500">
                  By registering, you agree to our{' '}
                  <Link href="/privacy" className="text-blue-600 hover:underline font-semibold">Privacy Policy</Link>{' '}
                  and{' '}
                  <Link href="/terms" className="text-blue-600 hover:underline font-semibold">Terms of Service</Link>.
                  Sthara complies with the DPDP Act 2023.
                </div>
              </div>

              {error && <p className="mb-4 text-red-600 text-sm font-semibold bg-red-50 p-3 rounded-xl border border-red-200">{error}</p>}

              <div className="flex space-x-3">
                <button
                  onClick={() => { setError(''); setStep('ADMIN_SETUP'); }}
                  className="flex-1 py-4 border border-gray-200 text-gray-600 rounded-2xl font-bold hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2"
                >
                  <ArrowLeft className="w-4 h-4" /><span>Back</span>
                </button>
                <button
                  id="submit-onboarding"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-4 bg-gradient-to-r from-[#002147] to-[#003580] text-white rounded-2xl font-bold hover:opacity-90 transition-all flex items-center justify-center space-x-2 shadow-lg disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /><span>Registering...</span></>
                  ) : (
                    <><Zap className="w-5 h-5" /><span>Launch Sthara</span></>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer links */}
        <div className="text-center mt-6 text-white/50 text-sm font-medium">
          Already have an account?{' '}
          <Link href="/login" className="text-white font-bold hover:underline">Sign In</Link>
          {' · '}
          <Link href="/privacy" className="hover:text-white/80">Privacy</Link>
          {' · '}
          <Link href="/terms" className="hover:text-white/80">Terms</Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500 font-medium">{label}</span>
      <span className="text-sm font-bold text-[#002147] text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}
