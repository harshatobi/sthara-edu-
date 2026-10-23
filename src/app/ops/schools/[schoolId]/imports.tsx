'use client';

import { useEffect, useMemo, useState } from 'react';
import { LockKeyOpenIcon as LockKeyOpen } from '@phosphor-icons/react/dist/ssr/LockKeyOpen';
import { Skeleton } from '@/components/canon/ui';
import ImportCenter, { type ImportApi } from '@/components/import/ImportCenter';
import { IMPORT_ROLES } from '@/lib/ops/roles';
import { datasetOf } from '@/lib/import/datasets';
import { Section, errText } from '../../_ui';
import { useOperator } from '../../OpsShell';
import { useOpsApi } from '../../useOpsApi';

interface Grant { id: string; scope: 'records' | 'view_as' | 'import'; expiresAt: string; reason: string }

/**
 * A school's Imports tab: its import history for anyone who can see the school, and, for a director inside an
 * import window, the same import screen the school's office has, run on the school's behalf.
 */
export function ImportsTab({ schoolId, onChanged }: { schoolId: string; onChanged: (msg: string) => void }) {
  const api = useOpsApi();
  const { role } = useOperator();
  const [grant, setGrant] = useState<Grant | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const director = IMPORT_ROLES.includes(role);

  useEffect(() => {
    let live = true;
    api<{ myGrant: Grant | null }>(`/schools/${schoolId}/account`)
      .then(d => {
        if (!live) return;
        setGrant(d.myGrant); setErr(null);
        setOpen(d.myGrant?.scope === 'import' && Date.parse(d.myGrant.expiresAt) > Date.now());
      })
      .catch(e => { if (live) { setErr(errText(e)); setGrant(null); } });
    return () => { live = false; };
  }, [api, schoolId, nonce]);

  const importApi = useMemo<ImportApi>(() => ({
    list: () => api(`/schools/${schoolId}/import`),
    get: id => api(`/schools/${schoolId}/import/${id}`),
    create: body => api(`/schools/${schoolId}/import`, { method: 'POST', body }),
    act: (id, action) => api(`/schools/${schoolId}/import/${id}`, { method: 'POST', body: { action } }),
    fileUrls: (id, names) => api(`/schools/${schoolId}/import/${id}`, { method: 'POST', body: { action: 'file-urls', names } }),
  }), [api, schoolId]);

  if (grant === undefined) return <Skeleton h={200} style={{ borderRadius: 20 }} />;
  return (
    <>
      {err && <div className="note err" role="alert" style={{ marginBottom: 16 }}>{err}</div>}
      {!director ? (
        <div className="note" style={{ marginBottom: 18 }}>Only a director can import a school&apos;s data on its behalf. The school&apos;s own principal or school admin can import it from Data Import.</div>
      ) : !open ? (
        <Section title="Import for this school"
          sub="For a school that cannot run the import itself. It needs an import window: a written reason, 30 minutes, shown to the school with everything done under it. Imports started inside it finish on their own.">
          {grant
            ? <div className="note">You have a {grant.scope === 'view_as' ? 'view-as' : 'records'} window open on this school. End it in Ownership &amp; access, then open an import window here.</div>
            : <OpenImportWindow schoolId={schoolId} onOpened={() => { onChanged('Import window open for 30 minutes.'); setNonce(x => x + 1); }} />}
        </Section>
      ) : null}
      {director && open
        ? <ImportCenter api={importApi} who="sthara" />
        : <History api={importApi} />}
    </>
  );
}

/** Read-only history (who, when, which file, counts) for operators without an import window. */
function History({ api }: { api: ImportApi }) {
  const [rows, setRows] = useState<Awaited<ReturnType<ImportApi['list']>>['jobs'] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.list().then(r => setRows(r.jobs)).catch(e => setErr(errText(e))); }, [api]);
  return (
    <Section title="Import history" sub="Every bulk import into this school, by the school or by Sthara.">
      {err ? <div className="note err" role="alert">{err}</div> : !rows ? <Skeleton h={100} /> : !rows.length ? <div className="muted">No imports yet.</div> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Started</th><th>Dataset</th><th>File</th><th>By</th><th className="r">Rows</th><th>Status</th></tr></thead>
            <tbody>{rows.map(j => (
              <tr key={j.id}><td style={{ whiteSpace: 'nowrap' }}>{new Date(j.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td><td>{datasetOf(j.dataset)?.label ?? j.dataset}</td>
                <td style={{ overflowWrap: 'anywhere' }}>{j.file_name}</td><td>{j.by_name}</td><td className="r">{j.total_rows ?? ''}</td><td>{j.status}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function OpenImportWindow({ schoolId, onOpened }: { schoolId: string; onOpened: () => void }) {
  const api = useOpsApi();
  const [reason, setReason] = useState('');
  const [caseRef, setCaseRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await api(`/schools/${schoolId}/access`, { method: 'POST', body: { reason, caseRef: caseRef || null, scope: 'import' } }); onOpened(); }
    catch (x) { setErr(errText(x)); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit}>
      <div className="g2">
        <div>
          <label className="lbl" htmlFor="iw-reason">WHY STHARA IS IMPORTING (THE SCHOOL SEES THIS)</label>
          <input id="iw-reason" className="cmp-in" maxLength={500} placeholder="e.g. Loading 2019-2025 attendance from the school's old software, as agreed with the principal" value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="iw-case">CASE OR TICKET (OPTIONAL)</label>
          <input id="iw-case" className="cmp-in" maxLength={80} value={caseRef} onChange={e => setCaseRef(e.target.value)} />
        </div>
      </div>
      {err && <div className="note err" style={{ marginTop: 14 }} role="alert">{err}</div>}
      <div className="acts" style={{ marginTop: 14 }}>
        <button className="btn pri" disabled={busy || reason.trim().length < 10}><LockKeyOpen size={15} weight="bold" /> {busy ? 'Opening…' : 'Open a 30-minute import window'}</button>
      </div>
    </form>
  );
}
