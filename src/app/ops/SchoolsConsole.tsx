'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { BuildingsIcon as Buildings } from '@phosphor-icons/react/dist/ssr/Buildings';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { dmy } from '@/lib/student/shape';
import { useOpsApi } from './useOpsApi';
import OpsFrame from './OpsFrame';

interface SchoolRow {
  id: string;
  name: string;
  settings: any;
  trial_expires_at: string | null;
  counts: Record<string, number>;
}

const suggestCode = (name: string) =>
  (name.toUpperCase().match(/\b[A-Z]/g) || []).join('').slice(0, 4).padEnd(3, 'X') + '-' + String(Math.floor(100 + Math.random() * 900));

export default function SchoolsConsole({ devPreview }: { devPreview: boolean }) {
  const api = useOpsApi();
  const router = useRouter();
  const [schools, setSchools] = useState<SchoolRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', curriculum: 'CBSE', board: '', city: '', plan: 'trial', trialDays: 30 });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<SchoolRow[]>('/schools').then(setSchools).catch(e => { setErr(e.message); setSchools([]); });
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      const { id } = await api<{ id: string }>('/schools', { method: 'POST', body: form });
      router.push(`/ops/${id}`);
    } catch (e: any) { setErr(e.message); setSaving(false); }
  };

  return (
    <OpsFrame devPreview={devPreview}>
      <PageBar eyebrow="OPERATOR CONSOLE" title="Schools"
        sub="Onboard a school: set up classes and subjects, then add its admins, teachers, students and parents."
        actions={<button className="btn pri" onClick={() => setCreating(c => !c)}><Plus size={15} weight="bold" /> New school</button>} />

      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}

      {creating && (
        <form className="card" style={{ marginBottom: 22 }} onSubmit={create}>
          <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>New school</h3>
          <div className="g2">
            <div>
              <label className="lbl" htmlFor="s-name">SCHOOL NAME</label>
              <input id="s-name" className="tin" style={{ width: '100%' }} required maxLength={120} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value, code: f.code || '' }))}
                onBlur={() => setForm(f => ({ ...f, code: f.code || (f.name ? suggestCode(f.name) : '') }))} />
            </div>
            <div>
              <label className="lbl" htmlFor="s-code">SCHOOL CODE (USED AT LOGIN)</label>
              <input id="s-code" className="tin mono" style={{ width: '100%' }} required minLength={3} maxLength={12} value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') }))} />
            </div>
            <div>
              <label className="lbl" htmlFor="s-cur">CURRICULUM</label>
              <select id="s-cur" className="tin" style={{ width: '100%' }} value={form.curriculum} onChange={e => setForm(f => ({ ...f, curriculum: e.target.value }))}>
                {['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge IGCSE', 'Other'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="s-city">CITY</label>
              <input id="s-city" className="tin" style={{ width: '100%' }} maxLength={80} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <label className="lbl" htmlFor="s-plan">PLAN</label>
              <select id="s-plan" className="tin" style={{ width: '100%' }} value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                {['trial', 'standard', 'premium', 'enterprise'].map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            {form.plan === 'trial' && (
              <div>
                <label className="lbl" htmlFor="s-trial">TRIAL LENGTH (DAYS)</label>
                <input id="s-trial" type="number" min={1} max={365} className="tin" style={{ width: '100%' }} value={form.trialDays}
                  onChange={e => setForm(f => ({ ...f, trialDays: Number(e.target.value) }))} />
              </div>
            )}
          </div>
          <div className="acts" style={{ marginTop: 18 }}>
            <button className="btn pri" disabled={saving}>{saving ? 'Creating…' : <>Create and continue <ArrowRight size={15} weight="bold" /></>}</button>
            <button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card" style={{ padding: '10px 26px' }}>
        {schools === null ? (
          <div style={{ padding: '16px 0' }}>{[0, 1, 2].map(i => <Skeleton key={i} h={48} style={{ marginBottom: 10 }} />)}</div>
        ) : schools.length === 0 ? (
          <Empty icon={<Buildings size={30} weight="duotone" />} title="No schools yet">Create the first school to start onboarding.</Empty>
        ) : schools.map(s => {
          const c = s.counts;
          return (
            <Link key={s.id} className="row" style={{ display: 'flex' }} href={`/ops/${s.id}`}>
              <div className="av"><Buildings size={19} weight="duotone" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{s.name}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  <span className="mono">{s.settings?.code || '—'}</span> · {s.settings?.curriculum || 'Curriculum not set'}
                  {s.trial_expires_at && ` · trial ends ${dmy(s.trial_expires_at)}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Chip tone="n">{c.admin ?? 0} admin</Chip>
                <Chip tone="b">{c.teacher ?? 0} teachers</Chip>
                <Chip tone="g">{c.student ?? 0} students</Chip>
                <Chip tone="p">{c.parent ?? 0} parents</Chip>
              </div>
              <Chip tone={s.settings?.plan === 'trial' ? 'a' : 'g'}>{(s.settings?.plan || 'trial').toUpperCase()}</Chip>
            </Link>
          );
        })}
      </div>
    </OpsFrame>
  );
}
