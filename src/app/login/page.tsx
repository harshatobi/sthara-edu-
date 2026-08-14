'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<'student' | 'teacher' | 'admin' | 'parent'>('teacher');
  const [email, setEmail] = useState('priya.menon@dpsvasundhara.edu.in');
  const [password, setPassword] = useState('••••••••••');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      // Sign in or demo bypass
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      }).catch(() => ({ data: null, error: null }));

      // Set role cookie
      document.cookie = `__role=${role}; path=/; max-age=86400; SameSite=Lax`;
      if (data?.session?.access_token) {
        document.cookie = `__session=${data.session.access_token}; path=/; max-age=86400; SameSite=Lax`;
      }

      router.push(`/${role}`);
    } catch (err: any) {
      // Fallback redirect for demo environment
      document.cookie = `__role=${role}; path=/; max-age=86400; SameSite=Lax`;
      router.push(`/${role}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <style jsx global>{`
        :root {
          --nav: #062347;
          --nav2: #0A2C57;
          --red: #E11D48;
          --ink: #002147;
          --body: #F7F9FB;
          --line: #E8EDF4;
          --mut: #7A8699;
          --mut2: #9AA6B8;
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
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        }
        .lg-left {
          max-width: 460px;
          color: #fff;
        }
        .lg-mark {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 28px;
        }
        .lg-mark svg {
          width: 52px;
          height: 52px;
        }
        .lg-mark span {
          font-size: 44px;
          font-weight: 800;
          letter-spacing: -.03em;
        }
        .lg-left h1 {
          font-size: 42px;
          font-weight: 800;
          margin-bottom: 16px;
          line-height: 1.1;
        }
        .lg-left p {
          color: #9DB4D4;
          font-size: 17px;
          line-height: 1.6;
        }
        .lg-tag {
          display: inline-block;
          margin-top: 26px;
          padding: 8px 16px;
          border: 1px solid rgba(225, 29, 72, .5);
          border-radius: 99px;
          color: #FF8FA8;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: .16em;
        }
        .lg-card {
          background: rgba(255, 255, 255, .05);
          border: 1px solid rgba(255, 255, 255, .1);
          border-radius: 24px;
          padding: 36px;
          width: 380px;
          backdrop-filter: blur(12px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .lg-card h2 {
          color: #fff;
          font-size: 26px;
          font-weight: 800;
          margin-bottom: 6px;
        }
        .lg-card .sub {
          color: #8FA5C4;
          font-size: 13px;
          margin-bottom: 24px;
        }
        .lg-in {
          width: 100%;
          background: rgba(255, 255, 255, .07);
          border: 1px solid rgba(255, 255, 255, .12);
          border-radius: 12px;
          padding: 14px 16px;
          color: #fff;
          font-size: 14px;
          font-family: inherit;
          margin-bottom: 12px;
          outline: none;
          transition: border-color 0.2s;
        }
        .lg-in:focus {
          border-color: var(--red);
        }
        .lg-roles {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin: 6px 0 18px;
        }
        .lg-role {
          padding: 12px 8px;
          border: 1px solid rgba(255, 255, 255, .14);
          border-radius: 12px;
          color: #B9CAE2;
          font-size: 13px;
          font-weight: 600;
          text-align: center;
          transition: .15s;
          cursor: pointer;
          background: none;
        }
        .lg-role:hover {
          background: rgba(255, 255, 255, .07);
        }
        .lg-role.on {
          background: var(--red);
          border-color: var(--red);
          color: #fff;
        }
        .lg-go {
          width: 100%;
          background: var(--red);
          color: #fff;
          border-radius: 12px;
          padding: 15px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: transform 0.15s, background 0.15s;
        }
        .lg-go:hover {
          background: #c8102e;
          transform: translateY(-1px);
        }
        .lg-foot {
          text-align: center;
          color: #6E86A6;
          font-size: 12px;
          margin-top: 18px;
          line-height: 1.6;
        }
      `}</style>

      <div className="lg-left">
        <div className="lg-mark">
          <svg viewBox="0 0 100 120">
            <path d="M50 8 L86 26 v40 c0 26-16 42-36 48-20-6-36-22-36-48V26Z" fill="none" stroke="#E11D48" strokeWidth="7" />
            <path d="M50 34 v52" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
            <path d="M64 44c-10-8-28-4-28 8s28 6 28 18-18 16-28 8" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
          </svg>
          <span>Sthara</span>
        </div>
        <h1>The Unified School OS</h1>
        <p>One platform for Students, Teachers, Administrators and Parents. High-integrity education powered by True Mastery Level diagnostics and adaptive learning.</p>
        <div className="lg-tag">UNLEASH YOURSELF</div>
      </div>

      <div className="lg-card">
        <h2>Sign In</h2>
        <div className="sub">Demo environment · DPS Vasundhara · sch-vsn-2026</div>

        <form onSubmit={handleSignIn}>
          <input
            className="lg-in"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email address"
            required
          />
          <input
            className="lg-in"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            required
          />

          <div className="lg-roles">
            {(['student', 'teacher', 'admin', 'parent'] as const).map(r => (
              <button
                key={r}
                type="button"
                className={`lg-role ${role === r ? 'on' : ''}`}
                onClick={() => {
                  setRole(r);
                  if (r === 'student') setEmail('ananya.iyer@student.sthara.in');
                  else if (r === 'teacher') setEmail('priya.menon@dpsvasundhara.edu.in');
                  else if (r === 'admin') setEmail('admin@dpsvasundhara.edu.in');
                  else setEmail('parent.iyer@sthara.in');
                }}
              >
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>

          <button type="submit" className="lg-go" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In →'}
          </button>
        </form>

        <div className="lg-foot">
          New school? <a href="/#pricing" style={{ color: '#B9CAE2', fontWeight: 700 }}>Book a paid pilot →</a><br />
          <span style={{ opacity: 0.6 }}>Privacy Policy · Terms of Service</span>
        </div>
      </div>
    </div>
  );
}
