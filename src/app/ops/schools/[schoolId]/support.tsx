'use client';

/** The school workspace's Support tab: guardian links, class moves, people who left, bulk roster corrections. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { DownloadSimpleIcon as DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { CORRECTIONS_TEMPLATE, parseCorrectionsCsv, type CorrectionInput, type CorrectionPlan } from '@/lib/ops/corrections';
import { normClass } from '@/lib/ops/people';
import { ReasonAction, Section, Table, errText, plural } from '../../_ui';
import { useOpsApi } from '../../useOpsApi';
import type { ClassRow, Person } from './parts';

interface Link { parentId: string; name: string; email: string; relationship: string | null; verified: boolean; left: boolean }
interface Family { studentId: string; name: string; rollNo: string | null; cls: string | null; left: boolean; links: Link[] }
interface Parent { id: string; name: string; email: string; left: boolean; children: number }

const FIELD_LABEL = { name: 'Name', email: 'Email', rollNo: 'Roll no.', class: 'Class' } as const;

export function SupportTab({ schoolId, classes, people, onChanged }: {
  schoolId: string; classes: ClassRow[]; people: Person[]; onChanged: (msg: string) => Promise<void> | void;
}) {
  const api = useOpsApi();
  const [fam, setFam] = useState<Families | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setFam(await api<Families>(`/schools/${schoolId}/support`)); setErr(null); } catch (e) { setErr(errText(e)); }
  }, [api, schoolId]);
  useEffect(() => {
    let live = true;
    api<Families>(`/schools/${schoolId}/support`)
      .then(d => { if (live) { setFam(d); setErr(null); } })
      .catch(e => { if (live) setErr(errText(e)); });
    return () => { live = false; };
  }, [api, schoolId]);

  const post: Post = body => api(`/schools/${schoolId}/support`, { method: 'POST', body });
  const done = async (msg: string) => { await load(); await onChanged(msg); };

  return (
    <>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      {!fam ? <Skeleton h={240} /> : <FamilyLinks fam={fam} post={post} done={done} />}
      <ClassMoves classes={classes} people={people} post={post} done={done} />
      <LeftSchool people={people} post={post} done={done} />
      <Corrections post={post} done={done} />
    </>
  );
}

interface Families { families: Family[]; parents: Parent[] }
/** Server replies: `moved` for class moves, `results` for applied corrections, `plan` for previews. */
interface Reply { ok?: boolean; moved: number; results: { row: number; status: string; message?: string }[]; plan: CorrectionPlan[] }
type Post = (body: Record<string, unknown>) => Promise<Reply>;
type Done = (msg: string) => Promise<void>;

// ── Guardian links ────────────────────────────────────────────────────────────

function FamilyLinks({ fam, post, done }: { fam: { families: Family[]; parents: Parent[] }; post: Post; done: Done }) {
  const [show, setShow] = useState<'missing' | 'pending' | 'all'>('missing');
  const [q, setQ] = useState('');
  const current = fam.families.filter(f => !f.left);
  const missing = current.filter(f => !f.links.some(l => l.verified && !l.left));
  const pending = current.filter(f => f.links.some(l => !l.verified));
  const needle = q.trim().toLowerCase();
  const list = (show === 'missing' ? missing : show === 'pending' ? pending : fam.families)
    .filter(f => !needle || `${f.name} ${f.rollNo ?? ''} ${f.cls ?? ''} ${f.links.map(l => `${l.name} ${l.email}`).join(' ')}`.toLowerCase().includes(needle));

  return (
    <Section title="Family links" sub="Which parent can see which child. Fee reminders, attendance and messages reach only verified links.">
      <div className="tabs" style={{ boxShadow: 'none', background: 'var(--body)' }}>
        <button className={`tab${show === 'missing' ? ' on blue' : ''}`} onClick={() => setShow('missing')}>No verified parent ({missing.length})</button>
        <button className={`tab${show === 'pending' ? ' on blue' : ''}`} onClick={() => setShow('pending')}>Awaiting verification ({pending.length})</button>
        <button className={`tab${show === 'all' ? ' on blue' : ''}`} onClick={() => setShow('all')}>All students ({fam.families.length})</button>
      </div>
      <input className="cmp-in" style={{ margin: '4px 0 8px' }} placeholder="Search by student, roll number, class or parent" aria-label="Search families" value={q} onChange={e => setQ(e.target.value)} />
      {!list.length ? (
        <Empty icon={<CheckCircle size={26} weight="duotone" />} title={show === 'missing' ? 'Every student has a verified parent' : show === 'pending' ? 'Nothing awaiting verification' : 'Nobody matches'} />
      ) : list.slice(0, 200).map(f => <FamilyRow key={f.studentId} f={f} parents={fam.parents} post={post} done={done} />)}
      {list.length > 200 && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Showing 200 of {list.length}. Search to narrow the list.</p>}
    </Section>
  );
}

function FamilyRow({ f, parents, post, done }: { f: Family; parents: Parent[]; post: Post; done: Done }) {
  const linked = new Set(f.links.map(l => l.parentId));
  const options = parents.filter(p => !linked.has(p.id) && !p.left);
  const [parentId, setParentId] = useState('');
  const [rel, setRel] = useState('mother');
  const first = f.name.split(' ')[0] || 'student';

  return (
    <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{f.name} {f.left && <Chip tone="n">LEFT</Chip>}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{f.cls || 'No class'} · roll {f.rollNo || '—'}</div>
        {!f.links.length && <div style={{ fontSize: 12.5, marginTop: 6, color: 'var(--red)', fontWeight: 600 }}>No parent linked</div>}
        {f.links.map(l => (
          <div key={l.parentId} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <Chip tone={l.left ? 'n' : l.verified ? 'g' : 'a'}>{l.left ? 'PARENT LEFT' : l.verified ? 'VERIFIED' : 'PENDING'}</Chip>
            <span style={{ fontSize: 13 }}><b>{l.name}</b> <span className="muted">{l.relationship ? `${l.relationship} · ` : ''}{l.email}</span></span>
            {!l.verified && (
              <ReasonAction label="Verify" confirm="Verify link" placeholder="How was it checked? e.g. Admission form"
                run={async reason => { await post({ action: 'verify', parentId: l.parentId, studentId: f.studentId, reason }); await done(`${l.name} verified as ${first}'s ${l.relationship || 'parent'}.`); }} />
            )}
            <ReasonAction label="Unlink" danger confirm="Unlink" placeholder="Reason, e.g. Wrong parent linked"
              run={async reason => { await post({ action: 'unlink', parentId: l.parentId, studentId: f.studentId, reason }); await done(`${l.name} unlinked from ${f.name}.`); }} />
          </div>
        ))}
      </div>
      <ReasonAction label="Link a parent" confirm="Link and verify" placeholder="How was it checked? e.g. Admission form"
        disabled={!options.length}
        extra={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="cmp-sel" aria-label="Parent" value={parentId} onChange={e => setParentId(e.target.value)} style={{ flex: '1 1 200px' }}>
              <option value="">Pick a parent account</option>
              {options.map(p => <option key={p.id} value={p.id}>{p.name} · {p.email}{p.children ? ` · ${plural(p.children, 'child', 'children')}` : ''}</option>)}
            </select>
            <select className="cmp-sel" aria-label="Relationship" value={rel} onChange={e => setRel(e.target.value)}>
              {['mother', 'father', 'guardian', 'grandparent', 'other'].map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
        )}
        run={async reason => {
          if (!parentId) throw new Error('Pick a parent account.');
          await post({ action: 'link', parentId, studentId: f.studentId, relationship: rel, reason });
          setParentId('');
          await done(`Parent linked to ${f.name} and verified.`);
        }} />
      {!options.length && !f.left && <p className="muted" style={{ fontSize: 12, flexBasis: '100%' }}>No free parent account at this school. Add one under People first.</p>}
    </div>
  );
}

// ── Class moves and promotion ─────────────────────────────────────────────────

function ClassMoves({ classes, people, post, done }: { classes: ClassRow[]; people: Person[]; post: Post; done: Done }) {
  const names = classes.map(c => c.name);
  const current = people.filter(p => p.role === 'student' && !p.metadata?.left);
  const count = (c: string) => current.filter(s => normClass(s.student_class ?? '') === normClass(c)).length;
  const [from, setFrom] = useState(names[0] ?? '');
  const [to, setTo] = useState(names[1] ?? '');
  const [src, setSrc] = useState(names[0] ?? '');
  const [dest, setDest] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const inSrc = current.filter(s => normClass(s.student_class ?? '') === normClass(src));

  if (!names.length) return null;
  const sel = (v: string, set: (v: string) => void, label: string, placeholder?: string) => (
    <select className="cmp-sel" aria-label={label} value={v} onChange={e => set(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {names.map(n => <option key={n} value={n}>{n} ({count(n)})</option>)}
    </select>
  );

  return (
    <Section title="Class moves" sub="Promote a whole class at year end, or move individual students. Fees already raised stay on the old invoices.">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <b style={{ fontSize: 13.5 }}>Promote</b> {sel(from, setFrom, 'Promote from')} <span className="muted">to</span> {sel(to, setTo, 'Promote to')}
        <ReasonAction label={`Promote ${plural(count(from), 'student')}`} disabled={!count(from) || normClass(from) === normClass(to)} confirm="Promote class"
          placeholder="Reason, e.g. Session 2027-28 begins"
          run={async reason => { const r = await post({ action: 'promote', fromClass: from, toClass: to, reason }); await done(`${plural(r.moved, 'student')} promoted from ${from} to ${to}.`); }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13.5 }}>Move students in</b> {sel(src, v => { setSrc(v); setPicked(new Set()); }, 'Move from class')}
      </div>
      {inSrc.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, margin: '10px 0' }}>
          {inSrc.map(s => (
            <label key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => setPicked(p => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
              {s.name} <span className="muted">{s.custom_student_id ?? ''}</span>
            </label>
          ))}
        </div>
      ) : <p className="muted" style={{ fontSize: 13, margin: '10px 0' }}>No current students in {src}.</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="muted">to</span> {sel(dest, setDest, 'Move to class', 'Pick a class')}
        <ReasonAction label={`Move ${plural(picked.size, 'student')}`} disabled={!picked.size || !dest || normClass(dest) === normClass(src)} confirm="Move"
          placeholder="Reason, e.g. Section change approved by principal"
          run={async reason => { const r = await post({ action: 'move', studentIds: [...picked], toClass: dest, reason }); setPicked(new Set()); await done(`${plural(r.moved, 'student')} moved to ${dest}.`); }} />
      </div>
    </Section>
  );
}

// ── Left the school ───────────────────────────────────────────────────────────

function LeftSchool({ people, post, done }: { people: Person[]; post: Post; done: Done }) {
  const [q, setQ] = useState('');
  const left = people.filter(p => p.metadata?.left);
  const needle = q.trim().toLowerCase();
  const matches = needle.length >= 2
    ? people.filter(p => p.role !== 'superadmin' && !p.metadata?.left && `${p.name} ${p.email} ${p.custom_student_id ?? ''}`.toLowerCase().includes(needle)).slice(0, 8)
    : [];
  const leftInfo = (p: Person) => p.metadata?.left as { on?: string; reason?: string } | undefined;

  return (
    <Section title="Left the school" sub="Blocks sign-in and keeps the record, marks and fee history. Use this instead of deleting anyone with history.">
      <input className="cmp-in" style={{ marginBottom: 8 }} placeholder="Find someone who has left: name, email or roll number" aria-label="Find a person" value={q} onChange={e => setQ(e.target.value)} />
      {matches.map(p => (
        <div key={p.id} className="row">
          <Chip tone="n">{p.role.toUpperCase()}</Chip>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}><b>{p.name}</b> <span className="muted">{p.email}{p.student_class ? ` · ${p.student_class}` : ''}</span></div>
          <ReasonAction label="Mark as left" danger confirm="Mark as left" placeholder="Reason, e.g. Transfer certificate issued 30 Sep"
            run={async reason => { await post({ action: 'left', userId: p.id, reason }); setQ(''); await done(`${p.name} marked as left. They can no longer sign in.`); }} />
        </div>
      ))}
      {needle.length >= 2 && !matches.length && <p className="muted" style={{ fontSize: 13 }}>Nobody current matches.</p>}
      {left.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, margin: '14px 0 6px' }}>Marked as left ({left.length})</h3>
          {left.map(p => (
            <div key={p.id} className="row">
              <Chip tone="n">{p.role.toUpperCase()}</Chip>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                <b>{p.name}</b> <span className="muted">{p.email}</span>
                <div className="muted" style={{ fontSize: 12 }}>{leftInfo(p)?.reason ?? ''}</div>
              </div>
              <ReasonAction label="Bring back" confirm="Restore sign-in" placeholder="Reason, e.g. Re-admitted"
                run={async reason => { await post({ action: 'returned', userId: p.id, reason }); await done(`${p.name} can sign in again.`); }} />
            </div>
          ))}
        </>
      )}
    </Section>
  );
}

// ── Bulk corrections ──────────────────────────────────────────────────────────

function Corrections({ post, done }: { post: Post; done: Done }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<CorrectionInput[] | null>(null);
  const [plan, setPlan] = useState<CorrectionPlan[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stats = useMemo(() => plan && {
    bad: plan.filter(p => p.issues.length).length,
    change: plan.filter(p => !p.issues.length && p.changes.length).length,
    same: plan.filter(p => !p.issues.length && !p.changes.length).length,
  }, [plan]);

  const preview = async () => {
    setErr(null); setPlan(null);
    const parsed = parseCorrectionsCsv(text);
    if (parsed.error) { setErr(parsed.error); return; }
    setBusy(true);
    try { const r = await post({ action: 'corrections-preview', rows: parsed.rows }); setRows(parsed.rows); setPlan(r.plan); }
    catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const template = () => {
    const url = URL.createObjectURL(new Blob([CORRECTIONS_TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'roster-corrections.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Section title="Bulk corrections" sub="Fix names, emails, roll numbers and classes from a CSV. Nothing changes until you preview and apply."
      actions={<button className="btn sm" onClick={template}><DownloadSimple size={13} weight="bold" /> Template</button>}>
      <textarea className="cmp-in" rows={6} style={{ width: '100%', fontFamily: 'var(--mono, monospace)', fontSize: 12.5 }} aria-label="Corrections CSV"
        placeholder={CORRECTIONS_TEMPLATE} value={text} onChange={e => { setText(e.target.value); setPlan(null); }} />
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 10px' }}>Rows are matched by the current email. Leave a cell blank to keep that value. Parents linked by an old roll number follow the new one.</p>
      <button className="btn sm pri" disabled={busy || !text.trim()} onClick={preview}>{busy ? 'Checking…' : 'Preview'}</button>
      {err && <div className="note err" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      {plan && stats && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 13.5, marginBottom: 8 }}>
            <b>{plural(stats.change, 'account')}</b> will change{stats.same ? ` · ${stats.same} already match` : ''}
            {stats.bad ? <span style={{ color: 'var(--red)', fontWeight: 600 }}> · {plural(stats.bad, 'row')} to fix first</span> : null}
          </p>
          <Table head={<tr><th>Row</th><th>Account</th><th>Changes</th><th>Problems</th></tr>}>
            {plan.map(p => (
              <tr key={p.row}>
                <td className="num">{p.row}</td>
                <td>{p.name ? <b>{p.name}</b> : null} <div className="sub">{p.email || '—'}</div></td>
                <td>{p.changes.length ? p.changes.map(c => (
                  <div key={c.field} style={{ fontSize: 12.5 }}>{FIELD_LABEL[c.field]}: <span className="muted">{c.from || '—'}</span> → <b>{c.to}</b></div>
                )) : <span className="muted">{p.issues.length ? '—' : 'No change'}</span>}</td>
                <td style={{ color: 'var(--red)', fontSize: 12.5 }}>{p.issues.join('; ')}</td>
              </tr>
            ))}
          </Table>
          <div style={{ marginTop: 12 }}>
            <ReasonAction label={`Apply ${plural(stats.change, 'correction')}`} disabled={!!stats.bad || !stats.change} confirm="Apply"
              placeholder="Reason, e.g. Corrections from the school office, 28 Sep"
              run={async reason => {
                const r = await post({ action: 'corrections-apply', rows, reason });
                const res = r.results;
                const failed = res.filter(x => x.status === 'error');
                const applied = res.filter(x => x.status === 'applied').length;
                if (failed.length) {
                  // Keep the CSV so the failed rows can be fixed and re-run; applied rows now match and are skipped.
                  setPlan(null);
                  setErr(`${plural(applied, 'correction')} applied. Failed: ${failed.map(x => `row ${x.row} (${x.message})`).join('; ')}`);
                  await done(`${plural(applied, 'correction')} applied · ${failed.length} failed`);
                  return;
                }
                setPlan(null); setText('');
                await done(`${plural(applied, 'correction')} applied.`);
              }} />
          </div>
        </div>
      )}
      {!plan && !text && <Empty icon={<UsersThree size={26} weight="duotone" />} title="No corrections staged" />}
    </Section>
  );
}
