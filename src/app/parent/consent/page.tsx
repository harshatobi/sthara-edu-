'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { CONSENT_TYPES } from '@/lib/admin/constants';

interface Child { id: string; name: string; cls: string }
type Row = { student_id: string; consent_type: string; granted: boolean; granted_at: string | null; revoked_at: string | null };

const POLICY_VERSION = '2026-09';

/**
 * A parent gives or withdraws consent, per child and per purpose (DPDP).
 * Writes go through public.set_consent, which checks the parent is a verified
 * guardian of that child and audits every change.
 */
export default function ParentConsentPage() {
  const { profile } = useAuth();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!profile?.uid) return;
    let cancelled = false;
    const db = createClient();
    (async () => {
      const { data: links, error: e1 } = await db.from('guardians').select('student_id').eq('parent_id', profile.uid).eq('verified', true);
      if (e1) { if (!cancelled) setErr(e1.message); return; }
      const ids = (links || []).map(l => l.student_id);
      const [kids, cons] = await Promise.all([
        ids.length ? db.from('users').select('id, name, student_class').in('id', ids) : Promise.resolve({ data: [], error: null }),
        ids.length ? db.from('consents').select('student_id, consent_type, granted, granted_at, revoked_at').in('student_id', ids) : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;
      setChildren((kids.data || []).map((k: any) => ({ id: k.id, name: k.name || 'Your child', cls: k.student_class || '' })));
      setRows((cons.data || []) as Row[]);
    })();
    return () => { cancelled = true; };
  }, [profile?.uid, nonce]);

  const set = async (studentId: string, type: string, granted: boolean) => {
    setBusy(`${studentId}:${type}`); setErr(null);
    const { error } = await createClient().rpc('set_consent', { p_student: studentId, p_type: type, p_granted: granted, p_policy_version: POLICY_VERSION });
    if (error) setErr(error.message);
    setBusy(null);
    setNonce(n => n + 1);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center"><ShieldCheck size={20} /></div>
        <h1 className="text-2xl font-extrabold text-[#002147]">Consent &amp; privacy</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6 leading-relaxed">
        Under India&apos;s data protection law (DPDP), the school needs your permission before using some of your child&apos;s data.
        You can give or withdraw it at any time. Every change is recorded.
      </p>
      {err && <div role="alert" className="mb-4 rounded-xl bg-rose-50 border-l-4 border-rose-500 p-3 text-sm text-rose-800">{err}</div>}
      {!children ? (
        <div className="space-y-3" aria-busy="true">{[0, 1].map(i => <div key={i} className="h-40 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
      ) : !children.length ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm text-sm text-slate-600">
          No child is linked to your account yet, or the school hasn&apos;t verified the link. Contact the school office.
        </div>
      ) : children.map(c => (
        <section key={c.id} className="rounded-2xl bg-white p-6 shadow-sm mb-4">
          <h2 className="text-lg font-bold text-[#002147]">{c.name}</h2>
          <p className="text-xs text-slate-500 mb-3">{c.cls}</p>
          <ul className="divide-y divide-slate-100">
            {Object.entries(CONSENT_TYPES).map(([type, meta]) => {
              const r = rows.find(x => x.student_id === c.id && x.consent_type === type);
              const on = !!r?.granted && !r.revoked_at;
              const key = `${c.id}:${type}`;
              return (
                <li key={type} className="flex items-center gap-4 py-3">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[#002147]">{meta.label}</div>
                    <div className="text-xs text-slate-500">{meta.purpose}</div>
                    <div className="text-xs mt-1 text-slate-400">
                      {on ? `Given ${r?.granted_at ? new Date(r.granted_at).toLocaleDateString('en-IN') : ''}` : r?.revoked_at ? `Withdrawn ${new Date(r.revoked_at).toLocaleDateString('en-IN')}` : 'Not given yet'}
                    </div>
                  </div>
                  <button disabled={busy === key} onClick={() => set(c.id, type, !on)}
                    className={`rounded-xl px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${on ? 'border border-slate-200 text-slate-700 hover:border-slate-300' : 'bg-[#002147] text-white hover:bg-[#0B2E5C]'}`}>
                    {busy === key ? 'Saving…' : on ? 'Withdraw' : 'Give consent'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
