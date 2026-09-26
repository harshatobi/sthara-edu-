'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AddressBookIcon as AddressBook } from '@phosphor-icons/react/dist/ssr/AddressBook';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { KeyIcon as Key } from '@phosphor-icons/react/dist/ssr/Key';
import { Chip, Empty, PageBar, Skeleton, type Tone } from '@/components/canon/ui';
import type { RegistrySchool } from '@/lib/ops/attention';
import { Table, downloadCsv, errText, fmtDate, num } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Row {
  id: string; name: string; email: string; role: string; schoolId: string | null; school: string | null; schoolCode: string | null;
  detail: string; tempPassword: boolean; createdAt: string;
}
const ROLE_TONE: Record<string, Tone> = { admin: 'n', teacher: 'b', student: 'g', parent: 'p', superadmin: 'r' };
const ROLES = [['', 'All roles'], ['admin', 'Admins'], ['teacher', 'Teachers'], ['student', 'Students'], ['parent', 'Parents'], ['superadmin', 'Operators']] as const;

/** Platform Manager > People: find any account on the platform, for support. */
export default function PeopleConsole() {
  const api = useOpsApi();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [role, setRole] = useState(params.get('role') ?? '');
  const [school, setSchool] = useState(params.get('school') ?? '');
  const [schools, setSchools] = useState<RegistrySchool[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [capped, setCapped] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<Record<string, string>>({});

  useEffect(() => { api<RegistrySchool[]>('/schools').then(setSchools).catch(() => {}); }, [api]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const sp = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(role ? { role } : {}), ...(school ? { school } : {}) });
      api<{ people: Row[]; capped: boolean }>(`/people?${sp}`)
        .then(d => { if (live) { setRows(d.people); setCapped(d.capped); setErr(null); } })
        .catch(e => { if (live) { setErr(errText(e)); setRows([]); } });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [api, q, role, school]);

  const reset = async (p: Row) => {
    if (!p.schoolId) return;
    try {
      const r = await api<{ tempPassword: string }>(`/schools/${p.schoolId}/people/${p.id}`, { method: 'POST', body: { action: 'reset-password' } });
      setIssued(s => ({ ...s, [p.id]: r.tempPassword }));
    } catch (e) { setIssued(s => ({ ...s, [p.id]: `Error: ${errText(e)}` })); }
  };

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="People"
        sub="Every account on Sthara. Search by name, email or roll number to help a school's user."
        actions={<button className="btn" disabled={!rows?.length} onClick={() => downloadCsv(`sthara-people-${new Date().toISOString().slice(0, 10)}.csv`,
          [['Name', 'Email', 'Role', 'School', 'Code', 'Detail', 'Temporary password', 'Created'], ...(rows ?? []).map(p => [p.name, p.email, p.role, p.school, p.schoolCode, p.detail, p.tempPassword ? 'yes' : 'no', fmtDate(p.createdAt)])])}>
          <DownloadSimple size={15} weight="bold" /> Export CSV
        </button>} />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      <div className="card">
        <div className="ops-filters">
          <input className="cmp-in" autoFocus placeholder="Name, email or roll number" aria-label="Search people" value={q} onChange={e => setQ(e.target.value)} />
          <select className="cmp-sel" aria-label="Role" value={role} onChange={e => setRole(e.target.value)}>
            {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="cmp-sel" aria-label="School" value={school} onChange={e => setSchool(e.target.value)}>
            <option value="">All schools</option>
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {!rows ? <div>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={44} style={{ marginBottom: 8 }} />)}</div> : (
          <>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{num(rows.length)} {rows.length === 1 ? 'account' : 'accounts'}{capped ? ' (first 200: refine the search)' : ''}</div>
            <Table head={<tr><th>Name</th><th>Role</th><th>School</th><th>Detail</th><th>Created</th><th className="r">Support</th></tr>}
              empty={!rows.length && <Empty icon={<AddressBook size={28} weight="duotone" />} title="Nobody matches">Try part of a name, an email or a roll number.</Empty>}>
              {rows.map(p => (
                <tr key={p.id}>
                  <td><div className="nm">{p.name || '—'}</div><div className="sub" style={{ overflowWrap: 'anywhere' }}>{p.email}</div></td>
                  <td><Chip tone={ROLE_TONE[p.role] ?? 'n'}>{p.role === 'superadmin' ? 'OPERATOR' : p.role.toUpperCase()}</Chip>{p.tempPassword && <div className="sub">temp password</div>}</td>
                  <td>{p.schoolId ? <Link href={`/ops/schools/${p.schoolId}?tab=people`} style={{ fontWeight: 600 }}>{p.school}</Link> : <span className="muted">—</span>}{p.schoolCode && <div className="sub mono">{p.schoolCode}</div>}</td>
                  <td style={{ fontSize: 13 }}>{p.detail || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.createdAt)}</td>
                  <td className="r">
                    {issued[p.id]
                      ? <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{issued[p.id]}</span>
                      : p.schoolId && p.role !== 'superadmin' && <button className="btn sm" onClick={() => reset(p)}><Key size={13} weight="bold" /> New password</button>}
                  </td>
                </tr>
              ))}
            </Table>
            {Object.keys(issued).length > 0 && <div className="note" style={{ marginTop: 12 }}>New temporary passwords are shown once and not stored. Hand them over securely.</div>}
          </>
        )}
      </div>
    </>
  );
}
