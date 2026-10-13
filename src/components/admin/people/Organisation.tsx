'use client';

import { useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { TreeStructureIcon as TreeStructure } from '@phosphor-icons/react/dist/ssr/TreeStructure';
import { StairsIcon as Stairs } from '@phosphor-icons/react/dist/ssr/Stairs';
import { ChairIcon as Chair } from '@phosphor-icons/react/dist/ssr/Chair';
import { Chip, Empty } from '@/components/canon/ui';
import { CardHead } from '@/components/admin/kit';
import Pop, { run } from '@/components/schedule/Pop';
import { inr } from '@/lib/admin/format';
import { STAFF_CATEGORIES } from '@/lib/schedule/types';
import { DEPARTMENT_KINDS, postFill, type Department, type Grade, type Post } from '@/lib/hr/engine';
import type { Call, PeopleData } from '@/lib/hr/usePeople';
import { In, Sel } from './forms';

const API = '/api/admin/people/structure';
type Editing = { k: 'dept'; v: Partial<Department> } | { k: 'grade'; v: Partial<Grade> } | { k: 'post'; v: Partial<Post> };

/** Departments and their heads, grades with pay bands, sanctioned posts against people in post, and HR settings. */
export default function Organisation({ data, call, reload, toast }: { data: PeopleData; call: Call; reload: () => void; toast: (m: string) => void }) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const active = data.people.filter(p => p.active);
  const inDept = (id: string) => active.filter(p => p.departmentId === id).length;
  const inGrade = (id: string) => active.filter(p => p.gradeId === id).length;
  const name = (id: string | null) => data.people.find(p => p.id === id)?.name ?? '';
  const dept = (id: string | null) => data.departments.find(d => d.id === id)?.name ?? '';
  const grade = (id: string | null) => data.grades.find(g => g.id === id)?.name ?? '';
  const posts = postFill(data.posts, data.people);
  const sanctioned = posts.reduce((n, p) => n + p.sanctioned, 0), vacant = posts.reduce((n, p) => n + Math.max(0, p.vacant), 0);
  const unplaced = active.filter(p => !p.departmentId).length;
  const done = (msg: string) => { setEditing(null); reload(); toast(msg); };

  return (
    <>
      {unplaced > 0 && data.departments.length > 0 && <div className="note" style={{ marginBottom: 18 }}><b>{unplaced} {unplaced === 1 ? 'person is' : 'people are'} in no department.</b> Filter the directory by &ldquo;No department&rdquo; and set it with Change job, or load it in one go with Import.</div>}
      <div className="g2" style={{ marginBottom: 18 }}>
        <div className="card">
          <CardHead title="Departments" sub="Each person belongs to one. The head is who its people usually report to."
            right={<button className="btn sm pri" onClick={() => setEditing({ k: 'dept', v: { kind: 'academic', active: true } })}><Plus size={12} weight="bold" /> Add</button>} />
          {data.departments.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Department</th><th>Head</th><th className="c">People</th><th /></tr></thead>
              <tbody>{data.departments.map(d => (
                <tr key={d.id} style={d.active ? undefined : { opacity: 0.5 }}>
                  <td><b>{d.name}</b><div className="muted" style={{ fontSize: 12 }}>{DEPARTMENT_KINDS[d.kind]}{d.active ? '' : ' · retired'}</div></td>
                  <td>{name(d.headId) || <span className="muted">—</span>}</td>
                  <td className="c num">{inDept(d.id)}</td>
                  <td className="r"><button className="sch-icon" aria-label={`Edit ${d.name}`} onClick={() => setEditing({ k: 'dept', v: d })}><PencilSimple size={15} /></button></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty icon={<TreeStructure size={26} weight="duotone" />} title="No departments yet">Add the school&apos;s departments: Science, Languages, Primary, Accounts, Transport, Housekeeping.</Empty>}
        </div>
        <div className="card">
          <CardHead title="Grades and pay bands" sub={data.can.sensitive ? 'A grade sets the monthly pay range for the people in it. Payroll will build on these.' : 'Pay bands are visible to HR, the principal and the school admin.'}
            right={<button className="btn sm pri" onClick={() => setEditing({ k: 'grade', v: { active: true, sort: data.grades.length + 1 } })}><Plus size={12} weight="bold" /> Add</button>} />
          {data.grades.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Grade</th>{data.can.sensitive && <th>Monthly pay band</th>}<th className="c">People</th><th /></tr></thead>
              <tbody>{data.grades.map(g => (
                <tr key={g.id} style={g.active ? undefined : { opacity: 0.5 }}>
                  <td><b>{g.name}</b><div className="muted" style={{ fontSize: 12 }}>{g.category ? STAFF_CATEGORIES[g.category] : 'Any category'}{g.active ? '' : ' · retired'}</div></td>
                  {data.can.sensitive && <td className="num">{g.payMin !== null || g.payMax !== null ? `${g.payMin !== null ? inr(g.payMin) : 'open'} to ${g.payMax !== null ? inr(g.payMax) : 'open'}` : <span className="muted">Not set</span>}</td>}
                  <td className="c num">{inGrade(g.id)}</td>
                  <td className="r"><button className="sch-icon" aria-label={`Edit ${g.name}`} onClick={() => setEditing({ k: 'grade', v: g })}><PencilSimple size={15} /></button></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty icon={<Stairs size={26} weight="duotone" />} title="No grades yet">Add PRT, TGT and PGT for teachers, and the grades used for office and support staff.</Empty>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Sanctioned posts" sub={posts.length ? `${sanctioned} posts sanctioned, ${vacant} vacant. Filled is counted from the people in that department and grade today.` : 'How many posts the management has approved for each department and grade.'}
          right={<button className="btn sm pri" disabled={!data.departments.length} onClick={() => setEditing({ k: 'post', v: { sanctioned: 1 } })}><Plus size={12} weight="bold" /> Add</button>} />
        {posts.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Department</th><th>Grade</th><th className="c">Sanctioned</th><th className="c">Filled</th><th className="c">Vacant</th><th /></tr></thead>
            <tbody>{posts.map(p => (
              <tr key={p.id}>
                <td><b>{dept(p.departmentId)}</b>{p.note && <div className="muted" style={{ fontSize: 12 }}>{p.note}</div>}</td>
                <td>{grade(p.gradeId) || <span className="muted">Any grade</span>}</td>
                <td className="c num">{p.sanctioned}</td>
                <td className="c num">{p.filled}</td>
                <td className="c">{p.vacant > 0 ? <Chip tone="a">{p.vacant} VACANT</Chip> : p.vacant < 0 ? <Chip tone="r">{-p.vacant} OVER</Chip> : <Chip tone="g">FULL</Chip>}</td>
                <td className="r"><button className="sch-icon" aria-label="Edit post" onClick={() => setEditing({ k: 'post', v: p })}><PencilSimple size={15} /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty icon={<Chair size={26} weight="duotone" />} title="No sanctioned posts yet">{data.departments.length ? 'Add a count for a department, or for one grade within it, to see vacancies.' : 'Add departments first.'}</Empty>}
      </div>

      <SettingsCard data={data} call={call} onSaved={() => { reload(); toast('Settings saved'); }} />

      {editing?.k === 'dept' && <DeptEditor v={editing.v} data={data} call={call} onClose={() => setEditing(null)} onSaved={done} />}
      {editing?.k === 'grade' && <GradeEditor v={editing.v} data={data} call={call} onClose={() => setEditing(null)} onSaved={done} />}
      {editing?.k === 'post' && <PostEditor v={editing.v} data={data} call={call} onClose={() => setEditing(null)} onSaved={done} />}
    </>
  );
}

interface EditorProps<T> { v: Partial<T>; data: PeopleData; call: Call; onClose: () => void; onSaved: (m: string) => void }
function Buttons({ busy, err, onClose, onSave, onRemove, removeLabel, disabled }: { busy: boolean; err: string | null; onClose: () => void; onSave: () => void; onRemove?: () => void; removeLabel?: string; disabled?: boolean }) {
  return (
    <>
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {onRemove && <button className="btn" disabled={busy} onClick={onRemove}>{removeLabel}</button>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={busy || disabled} onClick={onSave}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </>
  );
}

function DeptEditor({ v, data, call, onClose, onSaved }: EditorProps<Department>) {
  const [f, setF] = useState({ name: v.name ?? '', kind: v.kind ?? 'academic', headId: v.headId ?? '', active: v.active !== false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={v.id ? `Edit ${v.name}` : 'Add a department'} onClose={onClose}>
      <div className="sch-fields">
        <In id="de-n" label="NAME" value={f.name} maxLength={80} onChange={x => setF({ ...f, name: x })} />
        <Sel id="de-k" label="KIND" value={f.kind} onChange={x => setF({ ...f, kind: x as Department['kind'] })}>{Object.entries(DEPARTMENT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>
        <Sel id="de-h" label="HEAD" value={f.headId} onChange={x => setF({ ...f, headId: x })}>
          <option value="">Nobody yet</option>{data.people.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Sel>
      </div>
      {v.id && !f.active && <label style={{ display: 'flex', gap: 8, fontSize: 13, marginTop: 12 }}><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Bring this department back into use</label>}
      <Buttons busy={busy} err={err} onClose={onClose} disabled={!f.name.trim()}
        onSave={async () => { if (await run(setBusy, setErr, () => call(API, 'PUT', { entity: 'department', id: v.id, ...f, headId: f.headId || null }))) onSaved('Department saved'); }}
        onRemove={v.id && v.active ? async () => { let retired = false; if (await run(setBusy, setErr, async () => { retired = (await call<{ retired: boolean }>(API, 'DELETE', { entity: 'department', id: v.id })).retired; })) onSaved(retired ? 'Department retired (kept for past records)' : 'Department removed'); } : undefined}
        removeLabel="Remove" />
    </Pop>
  );
}

function GradeEditor({ v, data, call, onClose, onSaved }: EditorProps<Grade>) {
  const [f, setF] = useState({ name: v.name ?? '', category: v.category ?? '', payMin: v.payMin != null ? String(v.payMin) : '', payMax: v.payMax != null ? String(v.payMax) : '', sort: String(v.sort ?? 0), active: v.active !== false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={v.id ? `Edit ${v.name}` : 'Add a grade'} onClose={onClose}>
      <div className="sch-fields">
        <In id="gr-n" label="NAME" value={f.name} maxLength={60} onChange={x => setF({ ...f, name: x })} placeholder="TGT" />
        <Sel id="gr-c" label="FOR" value={f.category} onChange={x => setF({ ...f, category: x })}>
          <option value="">Any category</option>{Object.entries(STAFF_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Sel>
        <In id="gr-s" label="ORDER" type="number" min={0} max={999} value={f.sort} onChange={x => setF({ ...f, sort: x })} hint="Lower shows first." />
        {data.can.sensitive && <>
          <In id="gr-min" label="PAY FROM (RS A MONTH)" inputMode="numeric" value={f.payMin} onChange={x => setF({ ...f, payMin: x })} placeholder="35000" />
          <In id="gr-max" label="PAY TO (RS A MONTH)" inputMode="numeric" value={f.payMax} onChange={x => setF({ ...f, payMax: x })} placeholder="52000" />
        </>}
      </div>
      {v.id && !f.active && <label style={{ display: 'flex', gap: 8, fontSize: 13, marginTop: 12 }}><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Bring this grade back into use</label>}
      <Buttons busy={busy} err={err} onClose={onClose} disabled={!f.name.trim()}
        onSave={async () => { if (await run(setBusy, setErr, () => call(API, 'PUT', { entity: 'grade', id: v.id, name: f.name, category: f.category || null, payMin: f.payMin, payMax: f.payMax, sort: Number(f.sort) || 0, active: f.active }))) onSaved('Grade saved'); }}
        onRemove={v.id && v.active ? async () => { let retired = false; if (await run(setBusy, setErr, async () => { retired = (await call<{ retired: boolean }>(API, 'DELETE', { entity: 'grade', id: v.id })).retired; })) onSaved(retired ? 'Grade retired (kept for past records)' : 'Grade removed'); } : undefined}
        removeLabel="Remove" />
    </Pop>
  );
}

function PostEditor({ v, data, call, onClose, onSaved }: EditorProps<Post>) {
  const [f, setF] = useState({ departmentId: v.departmentId ?? data.departments.find(d => d.active)?.id ?? '', gradeId: v.gradeId ?? '', sanctioned: String(v.sanctioned ?? 1), note: v.note ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Pop title={v.id ? 'Edit sanctioned posts' : 'Add sanctioned posts'} sub="Leave the grade open to count everyone in the department." onClose={onClose}>
      <div className="sch-fields">
        <Sel id="po-d" label="DEPARTMENT" value={f.departmentId} onChange={x => setF({ ...f, departmentId: x })}>{data.departments.filter(d => d.active || d.id === f.departmentId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel>
        <Sel id="po-g" label="GRADE" value={f.gradeId} onChange={x => setF({ ...f, gradeId: x })}><option value="">Any grade</option>{data.grades.filter(g => g.active || g.id === f.gradeId).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</Sel>
        <In id="po-n" label="SANCTIONED" type="number" min={0} max={2000} value={f.sanctioned} onChange={x => setF({ ...f, sanctioned: x })} />
        <In id="po-t" label="NOTE" value={f.note} maxLength={300} onChange={x => setF({ ...f, note: x })} placeholder="Board resolution, June 2026" />
      </div>
      <Buttons busy={busy} err={err} onClose={onClose} disabled={!f.departmentId}
        onSave={async () => { if (await run(setBusy, setErr, () => call(API, 'PUT', { entity: 'post', id: v.id, departmentId: f.departmentId, gradeId: f.gradeId || null, sanctioned: Number(f.sanctioned), note: f.note }))) onSaved('Sanctioned posts saved'); }}
        onRemove={v.id ? async () => { if (await run(setBusy, setErr, () => call(API, 'DELETE', { entity: 'post', id: v.id }))) onSaved('Removed'); } : undefined} removeLabel="Remove" />
    </Pop>
  );
}

function SettingsCard({ data, call, onSaved }: { data: PeopleData; call: Call; onSaved: () => void }) {
  const s = data.settings;
  const [f, setF] = useState({ codePrefix: s.codePrefix, codeWidth: String(s.codeWidth), probationMonths: String(s.probationMonths), noticeDays: String(s.noticeDays), alertDays: String(s.alertDays) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const width = Number(f.codeWidth) || s.codeWidth;
  return (
    <div className="card">
      <CardHead title="Settings" sub={`The next employee code will be ${f.codePrefix}${String(s.codeLastNo + 1).padStart(width, '0')}. Codes are issued in order and a number is never used twice; codes people already have are kept.`} />
      <div className="sch-fields">
        <In id="se-p" label="CODE PREFIX" value={f.codePrefix} maxLength={12} onChange={x => setF({ ...f, codePrefix: x })} placeholder="STH-" />
        <In id="se-w" label="DIGITS IN THE NUMBER" type="number" min={2} max={8} value={f.codeWidth} onChange={x => setF({ ...f, codeWidth: x })} />
        <In id="se-pm" label="PROBATION (MONTHS)" type="number" min={0} max={36} value={f.probationMonths} onChange={x => setF({ ...f, probationMonths: x })} hint="The default for a new permanent employee." />
        <In id="se-n" label="NOTICE PERIOD (DAYS)" type="number" min={0} max={365} value={f.noticeDays} onChange={x => setF({ ...f, noticeDays: x })} />
        <In id="se-a" label="ALERT THIS MANY DAYS AHEAD" type="number" min={1} max={180} value={f.alertDays} onChange={x => setF({ ...f, alertDays: x })} hint="For probation, contracts, exits and documents." />
      </div>
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div className="hr-form-acts">
        <button className="btn pri" disabled={busy} onClick={async () => {
          if (await run(setBusy, setErr, () => call(API, 'PUT', { entity: 'settings', codePrefix: f.codePrefix, codeWidth: Number(f.codeWidth), probationMonths: Number(f.probationMonths), noticeDays: Number(f.noticeDays), alertDays: Number(f.alertDays) }))) onSaved();
        }}>{busy ? 'Saving…' : 'Save settings'}</button>
      </div>
    </div>
  );
}
