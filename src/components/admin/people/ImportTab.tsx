'use client';

import { useState } from 'react';
import { UploadSimpleIcon as UploadSimple } from '@phosphor-icons/react/dist/ssr/UploadSimple';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { Pager, usePaged } from '@/components/canon/Pager';
import { Chip } from '@/components/canon/ui';
import { CardHead, downloadCsv } from '@/components/admin/kit';
import { parseCsv, readXlsx } from '@/lib/schedule/importer';
import { IMPORT_COLUMNS, parseImport, type ImportRow } from '@/lib/hr/engine';
import type { Call, PeopleData } from '@/lib/hr/usePeople';

const API = '/api/admin/people/import';
interface PreviewRow { line: string; name: string; creates: boolean; matchedBy: 'code' | 'email' | 'name' | null; matchedName: string | null; sets: string[]; problems: string[]; notes: string[] }
interface Preview { ok: boolean; committed: false; rows: PreviewRow[]; summary: { total: number; creates: number; updates: number; problems: number } }
const HOW = { code: 'employee code', email: 'login email', name: 'name' };

/**
 * Loads the employee master from a sheet: pick a file, see row by row what it would do, then save. Nothing is
 * written until every row is clean. Logins are never created here; a row with a login email must match one.
 */
export default function ImportTab({ data, call, reload, toast }: { data: PeopleData; call: Call; reload: () => void; toast: (m: string) => void }) {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileProblems, setFileProblems] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const read = async (f: File) => {
    setErr(null); setPreview(null); setResult(null); setRows(null); setFileName(f.name); setBusy(true);
    try {
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.xls')) throw new Error('That is the old Excel format. Save it as .xlsx or CSV and try again.');
      const table = lower.endsWith('.xlsx') ? await readXlsx(await f.arrayBuffer()) : parseCsv(await f.text());
      const parsed = parseImport(table);
      setFileProblems(parsed.problems);
      if (!parsed.rows.length) return;
      setRows(parsed.rows);
      setPreview(await call<Preview>(API, 'POST', { rows: parsed.rows }));
    } catch (e: any) { setErr(e?.message || 'Could not read that file.'); } finally { setBusy(false); }
  };
  const commit = async () => {
    if (!rows) return;
    setBusy(true); setErr(null);
    try {
      const r = await call<any>(API, 'POST', { rows, commit: true });
      if (!r.committed) { setPreview(r); return; }
      setResult(r); setRows(null); setPreview(null); reload(); toast(`${r.created} added, ${r.updated} updated`);
    } catch (e: any) { setErr(e?.message || 'The import failed.'); } finally { setBusy(false); }
  };
  const template = () => downloadCsv('sthara-employee-import-template.csv', [IMPORT_COLUMNS.map(c => c[1]), IMPORT_COLUMNS.map(c => c[2])]);
  const exportCurrent = () => {
    const dept = (id: string | null) => data.departments.find(d => d.id === id)?.name ?? '', grade = (id: string | null) => data.grades.find(g => g.id === id)?.name ?? '';
    const mgr = (id: string | null) => { const m = data.people.find(p => p.id === id); return m ? m.employeeCode || m.name : ''; };
    const cell: Record<string, (p: PeopleData['people'][number]) => string> = {
      employeeCode: p => p.employeeCode ?? '', name: p => p.name, email: p => p.email ?? '', category: p => p.category, designation: p => p.designation, department: p => dept(p.departmentId),
      grade: p => grade(p.gradeId), reportsTo: p => mgr(p.managerId), employment: p => p.employment, contractTo: p => p.contractTo ?? '', joinedOn: p => p.joinedOn ?? '', phone: p => p.phone ?? '',
    };
    downloadCsv(`sthara-employees-to-complete-${data.today}.csv`, [IMPORT_COLUMNS.map(c => c[1]), ...data.people.filter(p => p.active).map(p => IMPORT_COLUMNS.map(c => cell[c[0]]?.(p) ?? ''))]);
  };
  const shown = preview ? preview.rows.filter(r => !onlyProblems || r.problems.length) : [];
  const { shown: shownPage, pager } = usePaged(shown, `${onlyProblems}|${fileName}`);

  return (
    <div className="card">
      <CardHead title="Import from Excel" sub="For loading joining dates, departments, reporting lines, personal, statutory and bank details in one go. Blank cells leave what is already on a record alone."
        right={<div className="hr-acts">
          <button className="btn sm" onClick={template}><DownloadSimple size={13} /> Empty template</button>
          <button className="btn sm" onClick={exportCurrent}><DownloadSimple size={13} /> Current staff to fill in</button>
        </div>} />
      <ol className="muted" style={{ fontSize: 13.5, lineHeight: 1.7, paddingLeft: 18, marginBottom: 16 }}>
        <li>Download <b>Current staff to fill in</b>: everyone on the register with their job columns filled, and the personal, statutory and bank columns blank.</li>
        <li>Fill it in Excel. Add rows for staff with no login who aren&apos;t on the register yet. Aadhaar takes only the last four digits.</li>
        <li>Save as .xlsx or CSV and choose the file here. You see what every row will do before anything is saved.</li>
      </ol>
      {!data.can.sensitive && <div className="note info" style={{ marginBottom: 14 }}>Your role can import job details. Files with personal, statutory or bank columns filled in need someone with sensitive-details access.</div>}
      <label className="btn pri" style={{ cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        <UploadSimple size={15} weight="bold" /> {busy && !preview ? 'Reading…' : rows ? 'Choose another file' : 'Choose a file'}
        <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
      </label>
      {fileName && <span className="muted" style={{ marginLeft: 12, fontSize: 13 }}>{fileName}</span>}
      {err && <div className="note err" role="alert" style={{ marginTop: 14 }}>{err}</div>}
      {fileProblems.length > 0 && <div className="note" style={{ marginTop: 14 }}>{fileProblems.map((p, i) => <div key={i}>{p}</div>)}</div>}

      {result && (
        <div className="note info" role="status" style={{ marginTop: 16 }}>
          <b>Import saved: {result.created} added, {result.updated} updated.</b>
          {result.warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {preview && (
        <div style={{ marginTop: 18 }}>
          <div className="sch-bar">
            <Chip tone="b">{preview.summary.total} ROWS</Chip>
            <Chip tone="g">{preview.summary.creates} NEW</Chip>
            <Chip tone="n">{preview.summary.updates} UPDATES</Chip>
            {preview.summary.problems > 0 && <Chip tone="r">{preview.summary.problems} WITH PROBLEMS</Chip>}
            <span className="sp" />
            {preview.summary.problems > 0 && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} /> Only rows with problems</label>}
            <button className="btn pri" disabled={busy || !preview.ok} onClick={commit}>{busy ? 'Saving…' : `Save ${preview.summary.total} rows`}</button>
          </div>
          {!preview.ok && <div className="note err" style={{ marginBottom: 12 }}>Nothing has been saved. Fix the rows marked below in the file and choose it again.</div>}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th className="c">Row</th><th>Name</th><th>What happens</th><th>Sets</th></tr></thead>
              <tbody>{shownPage.map(r => (
                <tr key={r.line}>
                  <td className="c num">{r.line}</td>
                  <td><b>{r.name || '—'}</b></td>
                  <td>
                    {r.problems.length ? r.problems.map((p, i) => <div key={i} style={{ color: 'var(--red)', fontWeight: 600 }}>{p}</div>)
                      : r.creates ? <Chip tone="g">NEW, NO LOGIN</Chip>
                        : <>Updates {r.matchedName}<div className="muted" style={{ fontSize: 12 }}>matched by {HOW[r.matchedBy!]}</div></>}
                    {r.notes.map((n, i) => <div key={i} className="muted" style={{ fontSize: 12 }}>{n}</div>)}
                  </td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{r.sets.map(s => s.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ') || 'nothing'}</td>
                </tr>
              ))}</tbody>
            </table>
            <Pager {...pager} noun="rows" />
          </div>
        </div>
      )}
    </div>
  );
}
