'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserPlusIcon as UserPlus } from '@phosphor-icons/react/dist/ssr/UserPlus';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { Chip, type Tone } from '@/components/canon/ui';
import { createClient } from '@/lib/supabase/client';
import { getAuthToken } from '@/lib/auth/getAuthToken';
import { fmtDate } from '@/lib/admin/format';

type Role = 'teacher' | 'admin' | 'student' | 'parent';
interface Row { role: Role; name: string; email: string; className: string; rollNo: string; children: string }
interface Req {
  id: string; kind: 'enrolment' | 'accounts'; status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  people: { role: string; name: string; email: string }[]; created_at: string; decision_note: string | null; note: string | null;
}
const ROLE_LABEL: Record<Role, string> = { teacher: 'Teacher', admin: 'Office / admin', student: 'Student', parent: 'Parent' };
const STATUS: Record<Req['status'], { t: string; tone: Tone }> = {
  pending: { t: 'WITH STHARA', tone: 'a' }, approved: { t: 'CREATED', tone: 'g' }, rejected: { t: 'NOT APPROVED', tone: 'r' }, cancelled: { t: 'WITHDRAWN', tone: 'n' },
};
const blank = (): Row => ({ role: 'teacher', name: '', email: '', className: '', rollNo: '', children: '' });

/**
 * New logins for the school are made by Sthara (every login can use the AI features), so the school lists who needs
 * one here and Sthara creates them. Recent requests and their status sit above the form.
 */
export default function AccountRequests() {
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [sections, setSections] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const db = createClient();
    const [{ data: r }, { data: c }] = await Promise.all([
      db.from('account_requests').select('id, kind, status, people, created_at, decision_note, note').eq('kind', 'accounts').order('created_at', { ascending: false }).limit(8),
      db.from('classes').select('name'),
    ]);
    setReqs((r as Req[] | null) ?? []);
    setSections((c || []).map(x => x.name as string).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await load(); })();
    return () => { cancelled = true; };
  }, [load]);

  const call = async (method: 'POST' | 'DELETE', body: unknown) => {
    const token = await getAuthToken();
    const res = await fetch('/api/admin/account-requests', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  };
  const set = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      await call('POST', {
        note,
        people: rows.map(r => ({
          role: r.role, name: r.name, email: r.email,
          ...(r.role === 'student' ? { className: r.className, rollNo: r.rollNo } : {}),
          ...(r.role === 'parent' ? { children: r.children } : {}),
        })),
      });
      setMsg({ ok: true, text: `Sent to Sthara: ${rows.length} ${rows.length === 1 ? 'login' : 'logins'}. You'll get the sign-in details from Sthara once they are made.` });
      setRows([blank()]); setNote(''); setOpen(false);
      await load();
    } catch (e: unknown) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not send the request.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800 }}>New logins</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Sthara creates every login for your school. List who needs one and Sthara sets it up and sends you the sign-in details. New students join through Admissions.</p>
        </div>
        {!open && <button className="btn pri" onClick={() => { setOpen(true); setMsg(null); }}><UserPlus size={15} weight="bold" /> Request logins</button>}
      </div>

      {msg && <div className={msg.ok ? 'note info' : 'err'} role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 12 }}>{msg.text}</div>}

      {open && (
        <div style={{ marginTop: 14 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(130px,.8fr) minmax(150px,1fr) minmax(190px,1.2fr) minmax(160px,1fr) auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select className="cmp-sel" aria-label={`Row ${i + 1} role`} value={r.role} onChange={e => set(i, { role: e.target.value as Role })}>
                {(Object.keys(ROLE_LABEL) as Role[]).map(k => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
              </select>
              <input className="cmp-in" aria-label={`Row ${i + 1} name`} placeholder="Full name" value={r.name} onChange={e => set(i, { name: e.target.value })} />
              <input className="cmp-in" aria-label={`Row ${i + 1} email`} placeholder="Email" type="email" value={r.email} onChange={e => set(i, { email: e.target.value })} />
              {r.role === 'student' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="cmp-sel" aria-label={`Row ${i + 1} section`} value={r.className} onChange={e => set(i, { className: e.target.value })}>
                    <option value="">Section</option>{sections.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input className="cmp-in" aria-label={`Row ${i + 1} admission number`} placeholder="Adm. no." value={r.rollNo} onChange={e => set(i, { rollNo: e.target.value })} />
                </div>
              ) : r.role === 'parent' ? (
                <input className="cmp-in" aria-label={`Row ${i + 1} children's admission numbers`} placeholder="Children's adm. nos." value={r.children} onChange={e => set(i, { children: e.target.value })} />
              ) : <span />}
              <button className="btn sm" aria-label={`Remove row ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}><X size={13} weight="bold" /></button>
            </div>
          ))}
          <button className="btn sm" onClick={() => setRows(rs => [...rs, blank()])}><Plus size={12} weight="bold" /> Add a person</button>
          <textarea className="cmp-in" style={{ marginTop: 10, minHeight: 60 }} aria-label="Note for Sthara" placeholder="Note for Sthara (optional): joining date, anything to know" value={note} onChange={e => setNote(e.target.value)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn pri" disabled={busy || rows.some(r => !r.name.trim() || !r.email.trim())} onClick={send}>{busy ? 'Sending…' : 'Send to Sthara'}</button>
          </div>
        </div>
      )}

      {reqs && reqs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {reqs.map(r => (
            <div key={r.id} className="row">
              <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].t}</Chip>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.people.map(p => p.name).slice(0, 4).join(', ')}{r.people.length > 4 ? ` and ${r.people.length - 4} more` : ''}</div>
                <div className="muted" style={{ fontSize: 12 }}>Requested {fmtDate(r.created_at)}{r.decision_note ? ` · Sthara: "${r.decision_note}"` : ''}</div>
              </div>
              {r.status === 'pending' && (
                <button className="btn sm" onClick={async () => { try { await call('DELETE', { id: r.id }); await load(); } catch (e: unknown) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not withdraw.' }); } }}>Withdraw</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
