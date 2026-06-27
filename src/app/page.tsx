import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Brain, BookOpen, GraduationCap, Users, BarChart3, Shield,
  ArrowRight, CheckCircle, Sparkles, Zap, Heart, Camera,
  ChevronRight, Globe, Lock, Star
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Sthara School OS — AI-Powered Learning Management for Indian Schools',
  description: 'The all-in-one AI-powered school operating system. Auto-grade handwritten homework, generate quizzes, and empower every student with a personal AI tutor. Built for Indian schools.',
};

const FEATURES = [
  {
    icon: Camera,
    color: 'bg-blue-100 text-blue-600',
    title: 'AI Homework Grading',
    desc: 'Students photograph their handwritten work. Our Gemini Vision AI grades it question-by-question in seconds with detailed feedback.'
  },
  {
    icon: Brain,
    color: 'bg-purple-100 text-purple-600',
    title: 'Personal AI Tutor',
    desc: 'Every student gets a 24/7 AI tutor that knows their weak areas and adapts to their learning style — in any subject.'
  },
  {
    icon: Sparkles,
    color: 'bg-indigo-100 text-indigo-600',
    title: 'Smart Quiz Generator',
    desc: 'Teachers generate MCQ quizzes and practice papers in 30 seconds — auto-graded, with weakness reports for each student.'
  },
  {
    icon: BarChart3,
    color: 'bg-emerald-100 text-emerald-600',
    title: 'Mastery Analytics',
    desc: 'Real-time heatmaps and mastery dashboards show exactly which topics need more attention, class-by-class.'
  },
  {
    icon: Heart,
    color: 'bg-rose-100 text-rose-600',
    title: 'Student Wellness',
    desc: 'Daily mood check-ins and wellness dashboards help teachers identify at-risk students before problems escalate.'
  },
  {
    icon: Shield,
    color: 'bg-amber-100 text-amber-600',
    title: 'DPDP Compliant',
    desc: 'Multi-tenant data isolation, Firebase auth, and full compliance with India\'s Digital Personal Data Protection Act 2023.'
  },
];

const STATS = [
  { value: '< 30s', label: 'To grade an assignment' },
  { value: '10x', label: 'Faster than manual marking' },
  { value: '100%', label: 'DPDP Act compliant' },
  { value: '∞', label: 'AI tutor availability' },
];

const PLANS = [
  {
    name: 'Trial',
    price: 'Free',
    duration: '30 days',
    highlight: false,
    features: [
      'All features unlocked',
      'Unlimited teachers & students',
      'AI grading & tutoring',
      'Full admin dashboard',
      'No credit card required',
    ]
  },
  {
    name: 'School',
    price: '₹4,999',
    duration: 'per month',
    highlight: true,
    features: [
      'Everything in Trial',
      'Priority AI processing',
      'Dedicated support',
      'Custom school branding',
      'Data export & reports',
      'Parent portal access',
    ]
  },
  {
    name: 'District',
    price: 'Custom',
    duration: 'contact us',
    highlight: false,
    features: [
      'Multi-school management',
      'Centralized analytics',
      'On-premise option available',
      'SLA guarantee',
      'Training & onboarding',
    ]
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-[#002147] font-black text-xl tracking-tight">Sthara School OS</span>
          <div className="hidden md:flex items-center space-x-8 text-sm font-semibold text-gray-500">
            <a href="#features" className="hover:text-[#002147] transition-colors">Features</a>
            <a href="#pricing" className="hover:text-[#002147] transition-colors">Pricing</a>
            <Link href="/privacy" className="hover:text-[#002147] transition-colors">Privacy</Link>
          </div>
          <div className="flex items-center space-x-3">
            <Link href="/login" className="text-sm font-bold text-gray-600 hover:text-[#002147] transition-colors">
              Sign In
            </Link>
            <Link
              href="/onboard"
              className="bg-[#002147] text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-[#003580] transition-colors flex items-center space-x-1.5"
            >
              <span>Start Free Trial</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-[#001233] via-[#002147] to-[#003580] text-white overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-blue-400/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-36 text-center">
          <div className="inline-flex items-center space-x-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 mb-8">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-semibold text-white/80">Powered by Google Gemini AI</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight tracking-tight">
            The AI Brain<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-indigo-300">
              Your School Needs
            </span>
          </h1>
          <p className="text-xl text-white/70 font-medium max-w-2xl mx-auto mb-10 leading-relaxed">
            Auto-grade handwritten homework, give every student a personal AI tutor,
            and get real-time mastery analytics — all in one platform built for Indian schools.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/onboard"
              id="hero-cta"
              className="w-full sm:w-auto bg-white text-[#002147] font-black px-8 py-4 rounded-2xl text-lg hover:bg-gray-100 transition-all shadow-xl flex items-center justify-center space-x-2 group"
            >
              <Zap className="w-5 h-5 text-yellow-500" />
              <span>Start Free 30-Day Trial</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto border border-white/30 text-white font-bold px-8 py-4 rounded-2xl text-lg hover:bg-white/10 transition-all flex items-center justify-center space-x-2"
            >
              <span>Sign In</span>
            </Link>
          </div>
          <p className="mt-6 text-white/40 text-sm font-medium">No credit card · No setup fee · Cancel anytime</p>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <section className="border-b border-gray-100 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {STATS.map(s => (
              <div key={s.label}>
                <div className="text-4xl font-black text-[#002147] mb-1">{s.value}</div>
                <div className="text-sm text-gray-500 font-semibold">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-[#002147] mb-4">Everything Your School Needs</h2>
            <p className="text-gray-500 font-medium max-w-xl mx-auto">
              One platform, every tool — no switching between 10 different apps.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map(f => (
              <div key={f.title} className="p-7 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all group">
                <div className={`w-12 h-12 ${f.color} rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-black text-[#002147] mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed font-medium">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-black text-[#002147] mb-4">Up and Running in Minutes</h2>
          <p className="text-gray-500 font-medium mb-16">From registration to first graded assignment in under 10 minutes.</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: '01', icon: Globe, title: 'Register School', desc: 'Enter your school info and create your admin account.' },
              { step: '02', icon: Users, title: 'Add Teachers & Students', desc: 'Import your roster from the admin dashboard.' },
              { step: '03', icon: BookOpen, title: 'Create Assignments', desc: 'Teachers create assignments with AI-generated questions.' },
              { step: '04', icon: BarChart3, title: 'Watch Results Flow In', desc: 'Students submit, AI grades instantly, you see insights.' },
            ].map((item, i) => (
              <div key={item.step} className="relative">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center h-full">
                  <div className="text-xs font-black text-blue-600 tracking-widest mb-3">{item.step}</div>
                  <div className="w-10 h-10 bg-[#002147]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <item.icon className="w-5 h-5 text-[#002147]" />
                  </div>
                  <h3 className="font-black text-[#002147] mb-2">{item.title}</h3>
                  <p className="text-gray-500 text-sm font-medium">{item.desc}</p>
                </div>
                {i < 3 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 z-10">
                    <ChevronRight className="w-6 h-6 text-gray-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-[#002147] mb-4">Simple, Transparent Pricing</h2>
            <p className="text-gray-500 font-medium">Start free, scale when you're ready. No hidden fees.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className={`rounded-3xl p-8 border-2 ${plan.highlight
                  ? 'border-[#002147] bg-[#002147] text-white shadow-2xl scale-105'
                  : 'border-gray-100 bg-white'
                } relative`}
              >
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-400 to-orange-400 text-[#002147] text-xs font-black px-4 py-1.5 rounded-full">
                    ⭐ Most Popular
                  </div>
                )}
                <div className={`text-xs font-black uppercase tracking-widest mb-3 ${plan.highlight ? 'text-white/60' : 'text-gray-400'}`}>
                  {plan.name}
                </div>
                <div className={`text-4xl font-black mb-1 ${plan.highlight ? 'text-white' : 'text-[#002147]'}`}>
                  {plan.price}
                </div>
                <div className={`text-sm font-medium mb-8 ${plan.highlight ? 'text-white/60' : 'text-gray-400'}`}>
                  {plan.duration}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className={`flex items-start space-x-2.5 text-sm font-medium ${plan.highlight ? 'text-white/80' : 'text-gray-600'}`}>
                      <CheckCircle className={`w-4 h-4 mt-0.5 shrink-0 ${plan.highlight ? 'text-emerald-400' : 'text-emerald-500'}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.name === 'District' ? 'mailto:sales@sthara.in' : '/onboard'}
                  className={`block w-full text-center py-3 rounded-xl font-bold text-sm transition-all ${
                    plan.highlight
                      ? 'bg-white text-[#002147] hover:bg-gray-100'
                      : 'bg-[#002147] text-white hover:bg-[#003580]'
                  }`}
                >
                  {plan.name === 'District' ? 'Contact Sales' : plan.name === 'Trial' ? 'Start Free Trial' : 'Get Started'}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust / Compliance ─────────────────────────────────────────────── */}
      <section className="py-16 px-6 bg-gray-50 border-t border-gray-100">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-8">Built for India. Trusted by Schools.</p>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { icon: Shield, label: 'DPDP Act 2023 Compliant' },
              { icon: Lock, label: 'Firebase Security' },
              { icon: Globe, label: 'Hosted in India' },
              { icon: Star, label: '30-Day Free Trial' },
            ].map(item => (
              <div key={item.label} className="flex items-center space-x-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-600 shadow-sm">
                <item.icon className="w-4 h-4 text-[#002147]" />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-gradient-to-br from-[#001233] to-[#003580] text-white text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-black mb-6">Ready to Transform Your School?</h2>
          <p className="text-white/60 font-medium mb-10 text-lg">
            Join forward-thinking schools using AI to reduce teacher workload and improve student outcomes.
          </p>
          <Link
            href="/onboard"
            className="inline-flex items-center space-x-2 bg-white text-[#002147] font-black px-10 py-4 rounded-2xl text-lg hover:bg-gray-100 transition-all shadow-xl"
          >
            <Zap className="w-5 h-5 text-yellow-500" />
            <span>Register Your School — Free</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="mt-4 text-white/40 text-sm">No credit card · No setup fee · 30-day trial</p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="bg-[#001233] text-white/40 py-10 px-6 text-center text-sm font-medium border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-white font-black text-lg">Sthara School OS</span>
          <div className="flex items-center space-x-6">
            <Link href="/privacy" className="hover:text-white/70 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white/70 transition-colors">Terms of Service</Link>
            <a href="mailto:support@sthara.in" className="hover:text-white/70 transition-colors">Support</a>
            <Link href="/login" className="hover:text-white/70 transition-colors">Login</Link>
          </div>
          <p>© 2026 Sthara School OS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
