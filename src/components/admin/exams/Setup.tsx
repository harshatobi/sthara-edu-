'use client';

import { useMemo, useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { CertificateIcon as Certificate } from '@phosphor-icons/react/dist/ssr/Certificate';
import { Empty } from '@/components/canon/ui';
import { CardHead, Workspace } from '@/components/admin/kit';
import Pop, { run } from '@/components/schedule/Pop';
import { fmtDate } from '@/lib/admin/format';
import type { Assessment, Component, GradeBand, Rules, SubjectOverride, Term } from '@/lib/exams/engine';
import type { Call } from '@/lib/exams/useApi';
import type { ExamsData, Toast } from './ExamsPage';

type SchemeRow = ExamsData['schemes'][number];
type TermRow = ExamsData['terms'][number];
type AssessmentRow = ExamsData['assessments'][number];

const KINDS: [Assessment['kind'], string][] = [['written', 'Written exam'], ['internal', 'Internal assessment'], ['practical', 'Practical'], ['project', 'Project'], ['oral', 'Oral / activity']];
const RULES: [Component['rule'], string][] = [['sum', 'Add up'], ['avg', 'Average'], ['best', 'Best of']];

/** The assessment schemes: start from a Sthara CBSE preset, then change anything. */
export default function Setup({ data, call, reload, toast }: { data: ExamsData; call: Call; reload: () => void; toast: Toast }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const covered = new Set(data.schemes.filter(s => s.status === 'active').flatMap(s => s.grades));
  const create = async (preset: string) => {
    setBusy(true);
    try { const r = await call<{ id: string }>('/api/admin/exams', 'POST', { action: 'preset', preset, session: data.session }); toast('Scheme created from the preset. Check it, then open marks entry from the board.'); reload(); setEditing(r.id); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const scheme = data.schemes.find(s => s.id === editing);
  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title={`Schemes for ${data.session}`} sub="Each class follows one active scheme a session. A scheme sets the terms, what is assessed in each, how marks add up, the grades and the pass rules." />
        {data.schemes.length === 0 ? <Empty icon={<Certificate size={26} weight="duotone" />} title="None yet">Create one from a preset below.</Empty> : data.schemes.map(s => (
          <div key={s.id} className="ex-row">
            <div className="grow">
              <div className="t">{s.name} {s.status === 'archived' && <span className="ex-pill n">ARCHIVED</span>}</div>
              <div className="s">Classes {s.grades.join(', ')} · {data.terms.filter(t => t.schemeId === s.id).length} terms · {data.assessments.filter(a => a.schemeId === s.id).length} assessments · pass mark {s.rules.passPct}%{s.rules.bestOf ? ` · best ${s.rules.bestOf}` : ''}</div>
            </div>
            <button className="btn sm" onClick={() => setEditing(s.id)}><PencilSimple size={14} weight="bold" /> {data.can.manage ? 'Edit' : 'View'}</button>
          </div>
        ))}
      </div>
      {data.can.manage && (
        <div className="card">
          <CardHead title="Start from a Sthara CBSE preset" sub="Shaped to the subjects your classes take: skill subjects in Classes 9-10 get theory and practical, practical subjects in 11-12 get 70/30, languages are always counted in best-of-five." />
          {data.presets.map(p => {
            const clash = p.grades.filter(g => covered.has(g));
            return (
              <div key={p.key} className="ex-row">
                <div className="grow"><div className="t">{p.label}</div><div className="s">{p.summary}</div></div>
                {clash.length ? <span className="muted" style={{ fontSize: 12.5 }}>Class {clash.join(', ')} already covered</span>
                  : <button className="btn sm pri" disabled={busy} onClick={() => create(p.key)}><Plus size={14} weight="bold" /> Create</button>}
              </div>
            );
          })}
        </div>
      )}
      {scheme && <SchemeEditor key={scheme.id} data={data} scheme={scheme} call={call} reload={reload} toast={toast} onClose={() => setEditing(null)} />}
    </>
  );
}

function SchemeEditor({ data, scheme, call, reload, toast, onClose }: { data: ExamsData; scheme: SchemeRow; call: Call; reload: () => void; toast: Toast; onClose: () => void }) {
  const ro = !data.can.manage;
  const [name, setName] = useState(scheme.name);
  const [grades, setGrades] = useState<number[]>(scheme.grades);
  const [status, setStatus] = useState(scheme.status);
  const [rules, setRules] = useState<Rules>(scheme.rules);
  const [grading, setGrading] = useState<GradeBand[]>(scheme.grading);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [termEdit, setTermEdit] = useState<TermRow | 'new' | null>(null);
  const [asEdit, setAsEdit] = useState<AssessmentRow | 'new' | null>(null);
  const terms = data.terms.filter(t => t.schemeId === scheme.id).sort((a, b) => a.seq - b.seq);
  const assessments = data.assessments.filter(a => a.schemeId === scheme.id).sort((a, b) => a.seq - b.seq);
  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of grades) for (const s of data.subjectsByGrade[g] ?? []) m.set(s.key, s.name);
    return [...m.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [grades, data.subjectsByGrade]);
  const compKeys = [...new Set(terms.flatMap(t => t.components.map(c => c.key)))];
  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => setRules({ ...rules, [k]: v });
  // Saving returns to the list (with the change in it); a failed save keeps the editor open with the reason.
  const save = () => run(setBusy, setErr, () => call('/api/admin/exams', 'POST', { action: 'scheme', id: scheme.id, name, grades, grading, rules, status })).then(ok => { if (ok) { toast(`${name} saved.`); reload(); onClose(); } });
  const del = () => run(setBusy, setErr, () => call('/api/admin/exams', 'POST', { action: 'scheme_delete', id: scheme.id })).then(ok => { if (ok) { toast('Scheme deleted.'); reload(); onClose(); } });

  return (
    <Workspace wide title={scheme.name} sub={`Session ${scheme.session}${scheme.preset ? ` · from the ${scheme.preset} preset` : ''}`} onClose={onClose}
      actions={!ro && <div className="hr-acts"><button className="btn sm" disabled={busy} onClick={del}><Trash size={14} weight="bold" /> Delete</button><button className="btn sm pri" disabled={busy} onClick={save}>Save scheme</button></div>}>
      {err && <div className="note err" role="alert" style={{ marginBottom: 14 }}>{err}</div>}
      <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="card" style={{ marginBottom: 18 }}>
          <CardHead title="The scheme" />
          <div className="ex-form">
            <div><label htmlFor="sc-n">Name</label><input id="sc-n" className="ex-in" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></div>
            <div><label htmlFor="sc-s">Status</label><select id="sc-s" className="ex-in" value={status} onChange={e => setStatus(e.target.value as 'active' | 'archived')}><option value="active">Active</option><option value="archived">Archived</option></select></div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="muted" style={{ fontWeight: 800, fontSize: 11, letterSpacing: '.08em', marginBottom: 6 }}>CLASSES IT COVERS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(g => <label key={g} className="ex-chk"><input type="checkbox" checked={grades.includes(g)} onChange={e => setGrades(e.target.checked ? [...grades, g].sort((a, b) => a - b) : grades.filter(x => x !== g))} />Class {g}</label>)}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <CardHead title="Results and what the card shows" />
          <div className="ex-form">
            <div><label htmlFor="r-p">Pass mark (%)</label><input id="r-p" type="number" min={0} max={100} className="ex-in" value={rules.passPct} onChange={e => set('passPct', Number(e.target.value))} /></div>
            <div><label htmlFor="r-m">Result on the last card</label><select id="r-m" className="ex-in" value={rules.result} onChange={e => set('result', e.target.value as Rules['result'])}><option value="pass_fail">Pass, compartment or not passed</option><option value="none">No result (promotion decided separately)</option></select></div>
            <div><label htmlFor="r-b">Subjects counted</label><select id="r-b" className="ex-in" value={rules.bestOf ?? ''} onChange={e => set('bestOf', e.target.value ? Number(e.target.value) : null)}><option value="">All subjects</option>{[4, 5, 6].map(n => <option key={n} value={n}>Best {n}</option>)}</select></div>
            <div><label htmlFor="r-c">Compartment allowed in up to</label><select id="r-c" className="ex-in" value={rules.compartmentMax} onChange={e => set('compartmentMax', Number(e.target.value))}>{[0, 1, 2, 3].map(n => <option key={n} value={n}>{n} subject{n === 1 ? '' : 's'}</option>)}</select></div>
            <div><label htmlFor="r-ml">Medical (ML)</label><select id="r-ml" className="ex-in" value={rules.medical} onChange={e => set('medical', e.target.value as Rules['medical'])}><option value="scale">Leave it out and rescale</option><option value="zero">Count it as zero</option></select></div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 14 }}>
            <label className="ex-chk"><input type="checkbox" checked={rules.showMarks} onChange={e => set('showMarks', e.target.checked)} />Print marks (off: grades only)</label>
            <label className="ex-chk"><input type="checkbox" checked={rules.showRank} onChange={e => set('showRank', e.target.checked)} />Print rank in class</label>
            <label className="ex-chk"><input type="checkbox" checked={rules.showAttendance} onChange={e => set('showAttendance', e.target.checked)} />Attendance</label>
            <label className="ex-chk"><input type="checkbox" checked={rules.showTml} onChange={e => set('showTml', e.target.checked)} />Sthara mastery bands</label>
          </div>
          {rules.showRank && <div className="note" style={{ marginTop: 12 }}>CBSE discourages ranking students on report cards. Staff always see ranks in the class view.</div>}
          {rules.bestOf && (
            <div style={{ marginTop: 16 }}>
              <div className="muted" style={{ fontWeight: 800, fontSize: 11, letterSpacing: '.08em', marginBottom: 6 }}>ALWAYS COUNTED, NEVER REPLACED</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {subjects.map(s => <label key={s.key} className="ex-chk"><input type="checkbox" checked={rules.mandatory.includes(s.key)} onChange={e => set('mandatory', e.target.checked ? [...rules.mandatory, s.key] : rules.mandatory.filter(k => k !== s.key))} />{s.name}</label>)}
              </div>
            </div>
          )}
          {compKeys.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="muted" style={{ fontWeight: 800, fontSize: 11, letterSpacing: '.08em', marginBottom: 6 }}>COMPONENTS THAT MUST BE PASSED ON THEIR OWN</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {compKeys.map(k => <label key={k} className="ex-chk"><input type="checkbox" checked={rules.passEach.includes(k)} onChange={e => set('passEach', e.target.checked ? [...rules.passEach, k] : rules.passEach.filter(x => x !== k))} />{terms.flatMap(t => t.components).find(c => c.key === k)?.name ?? k}</label>)}
              </div>
            </div>
          )}
        </div>

        <div className="g2" style={{ marginBottom: 18 }}>
          <div className="card">
            <CardHead title="Grades" sub="From the highest. The lowest starts at 0." right={!ro && <button className="btn sm" onClick={() => setGrading([...grading, { min: 0, grade: '' }])}><Plus size={14} weight="bold" /> Grade</button>} />
            {grading.map((g, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 90px 1fr 36px', gap: 8, marginBottom: 8 }}>
                <input className="ex-in" aria-label="Grade" value={g.grade} maxLength={6} onChange={e => setGrading(grading.map((x, j) => (j === i ? { ...x, grade: e.target.value } : x)))} />
                <input className="ex-in" aria-label="From %" type="number" min={0} max={100} value={g.min} onChange={e => setGrading(grading.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)))} />
                <input className="ex-in" aria-label="Meaning" value={g.label ?? ''} maxLength={40} onChange={e => setGrading(grading.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <button className="btn sm" aria-label="Remove grade" onClick={() => setGrading(grading.filter((_, j) => j !== i))}><Trash size={13} /></button>
              </div>
            ))}
          </div>
          <div className="card">
            <CardHead title="Co-scholastic areas" sub="Graded by the class teacher each term." right={!ro && <button className="btn sm" onClick={() => set('coScholastic', [...rules.coScholastic, { key: `area_${rules.coScholastic.length + 1}`, name: '' }])}><Plus size={14} weight="bold" /> Area</button>} />
            {rules.coScholastic.map((a, i) => (
              <div key={a.key} style={{ display: 'grid', gridTemplateColumns: '1fr 36px', gap: 8, marginBottom: 8 }}>
                <input className="ex-in" aria-label="Area" value={a.name} maxLength={60} onChange={e => set('coScholastic', rules.coScholastic.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <button className="btn sm" aria-label="Remove area" onClick={() => set('coScholastic', rules.coScholastic.filter((_, j) => j !== i))}><Trash size={13} /></button>
              </div>
            ))}
            <div style={{ marginTop: 10 }}><label className="muted" htmlFor="co-g" style={{ fontSize: 12 }}>Grades used (comma separated)</label>
              <input id="co-g" className="ex-in" value={rules.coGrades.join(', ')} onChange={e => set('coGrades', e.target.value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean).slice(0, 8))} /></div>
          </div>
        </div>
      </fieldset>

      <div className="card" style={{ marginBottom: 18 }}>
        <CardHead title="Terms" sub="Each term has its own report card. A term with no share of the year is a progress report." right={!ro && <button className="btn sm" onClick={() => setTermEdit('new')}><Plus size={14} weight="bold" /> Term</button>} />
        {terms.map(t => (
          <div key={t.id} className="ex-row">
            <div className="grow">
              <div className="t">{t.name} <span className="muted" style={{ fontWeight: 600 }}>{t.weight ? `${t.weight}% of the year` : 'progress report'}</span></div>
              <div className="s">{fmtDate(t.startsOn)} to {fmtDate(t.endsOn)} · {t.components.map(c => `${c.name} ${c.weight}${c.rule === 'best' ? ` (best ${c.best} of ${c.codes.join(', ')})` : c.codes.length > 1 ? ` (${c.rule === 'avg' ? 'average of' : ''} ${c.codes.join(', ')})` : ` (${c.codes[0]})`}`).join(' · ')}</div>
              {Object.keys(t.subjectWeights).length > 0 && <div className="s">Own weights: {Object.entries(t.subjectWeights).map(([k, w]) => `${subjects.find(s => s.key === k)?.name ?? k} ${Object.entries(w).map(([ck, v]) => `${ck} ${v}`).join('/')}`).join('; ')}</div>}
            </div>
            <button className="btn sm" onClick={() => setTermEdit(t)}><PencilSimple size={14} weight="bold" /> {ro ? 'View' : 'Edit'}</button>
          </div>
        ))}
      </div>

      <div className="card">
        <CardHead title="Assessments" sub="What marks are entered for. A code is what the terms' components draw on." right={!ro && terms.length > 0 && <button className="btn sm" onClick={() => setAsEdit('new')}><Plus size={14} weight="bold" /> Assessment</button>} />
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Code</th><th>Name</th><th>Term</th><th>Kind</th><th className="c">Out of</th><th>Subjects</th><th>Dates</th><th /></tr></thead>
          <tbody>{assessments.map(a => {
            const opened = data.sheets.some(s => s.assessmentId === a.id);
            const own = Object.entries(a.subjects).filter(([k]) => k !== '*');
            const def = a.subjects['*'];
            return (
              <tr key={a.id}>
                <td><b>{a.code}</b></td><td>{a.name}</td><td>{terms.find(t => t.id === a.termId)?.name}</td><td className="muted">{KINDS.find(k => k[0] === a.kind)?.[1]}</td>
                <td className="c">{def?.max ?? a.maxMarks}</td>
                <td className="muted" style={{ fontSize: 12.5 }}>{def?.skip ? `Only ${own.filter(([, o]) => !o.skip).map(([k]) => subjects.find(s => s.key === k)?.name ?? k).join(', ')}` : own.length ? `${own.filter(([, o]) => o.skip).length ? `Not ${own.filter(([, o]) => o.skip).map(([k]) => subjects.find(s => s.key === k)?.name ?? k).join(', ')}` : ''}${own.filter(([, o]) => o.max).length ? ` ${own.filter(([, o]) => o.max).length} with their own maximum` : ''}` : 'All'}</td>
                <td className="muted">{a.heldFrom ? fmtDate(a.heldFrom, true) : '—'}</td>
                <td>{opened ? <span className="ex-pill b">OPEN</span> : null} <button className="btn sm" onClick={() => setAsEdit(a)}>{ro ? 'View' : 'Edit'}</button></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </div>

      {termEdit && <TermPop scheme={scheme} term={termEdit === 'new' ? null : termEdit} nextSeq={(terms[terms.length - 1]?.seq ?? 0) + 1} session={scheme.session} codes={assessments.map(a => a.code)} subjects={subjects} ro={ro} call={call}
        onDone={() => { setTermEdit(null); toast('Term saved.'); reload(); }} onClose={() => setTermEdit(null)} />}
      {asEdit && <AssessmentPop scheme={scheme} a={asEdit === 'new' ? null : asEdit} terms={terms} subjects={subjects} ro={ro} call={call}
        onDone={(m) => { setAsEdit(null); toast(m); reload(); }} onClose={() => setAsEdit(null)} />}
    </Workspace>
  );
}

function TermPop({ scheme, term, nextSeq, session, codes, subjects, ro, call, onDone, onClose }: {
  scheme: SchemeRow; term: Term | null; nextSeq: number; session: string; codes: string[]; subjects: { key: string; name: string }[]; ro: boolean; call: Call; onDone: () => void; onClose: () => void;
}) {
  const y = Number(session.slice(0, 4));
  const [name, setName] = useState(term?.name ?? `Term ${nextSeq}`);
  const [seq, setSeq] = useState(term?.seq ?? nextSeq);
  const [startsOn, setStartsOn] = useState(term?.startsOn ?? `${y}-04-01`);
  const [endsOn, setEndsOn] = useState(term?.endsOn ?? `${y + 1}-03-31`);
  const [weight, setWeight] = useState(term?.weight ?? 0);
  const [comps, setComps] = useState<Component[]>(term?.components ?? []);
  const [sw, setSw] = useState<Record<string, Record<string, number>>>(term?.subjectWeights ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [addSub, setAddSub] = useState('');
  const upd = (i: number, c: Partial<Component>) => setComps(comps.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const total = comps.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const save = () => run(setBusy, setErr, () => call('/api/admin/exams', 'POST', { action: 'term', id: term?.id, schemeId: scheme.id, name, seq, startsOn, endsOn, weight, components: comps, subjectWeights: sw })).then(ok => ok && onDone());
  const del = () => run(setBusy, setErr, () => call('/api/admin/exams', 'POST', { action: 'term_delete', id: term!.id })).then(ok => ok && onDone());
  return (
    <Pop wide title={term ? `Edit ${term.name}` : 'New term'} sub="Components build the term's result: each has a weight and draws on assessments by code. Weight 0 shows it on the card without counting it." onClose={onClose}>
      <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="ex-form">
          <div><label htmlFor="t-n">Name</label><input id="t-n" className="ex-in" value={name} maxLength={60} onChange={e => setName(e.target.value)} /></div>
          <div><label htmlFor="t-q">Order</label><input id="t-q" type="number" min={1} max={12} className="ex-in" value={seq} onChange={e => setSeq(Number(e.target.value))} /></div>
          <div><label htmlFor="t-s">Starts</label><input id="t-s" type="date" className="ex-in" value={startsOn} onChange={e => setStartsOn(e.target.value)} /></div>
          <div><label htmlFor="t-e">Ends</label><input id="t-e" type="date" className="ex-in" value={endsOn} onChange={e => setEndsOn(e.target.value)} /></div>
          <div><label htmlFor="t-w">Share of the year (%)</label><input id="t-w" type="number" min={0} max={100} className="ex-in" value={weight} onChange={e => setWeight(Number(e.target.value))} /></div>
        </div>
        <h4 style={{ margin: '18px 0 8px', fontWeight: 800 }}>Components <span className="muted" style={{ fontWeight: 600 }}>out of {total}</span></h4>
        <div className="ex-comp muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}><span>NAME</span><span>WEIGHT</span><span>ASSESSMENT CODES</span><span>COMBINE</span><span>BEST</span><span /></div>
        {comps.map((c, i) => (
          <div key={i} className="ex-comp">
            <input className="ex-in" aria-label="Component name" value={c.name} onChange={e => upd(i, { name: e.target.value, key: c.key || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20) })} />
            <input className="ex-in" aria-label="Weight" type="number" min={0} value={c.weight} onChange={e => upd(i, { weight: Number(e.target.value) })} />
            <input className="ex-in" aria-label="Codes" value={c.codes.join(', ')} placeholder={codes.slice(0, 3).join(', ')} onChange={e => upd(i, { codes: e.target.value.toUpperCase().split(/[\s,]+/).filter(Boolean) })} />
            <select className="ex-in" aria-label="Combine" value={c.rule} onChange={e => upd(i, { rule: e.target.value as Component['rule'] })}>{RULES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input className="ex-in" aria-label="Best of" type="number" min={1} disabled={c.rule !== 'best'} value={c.best ?? ''} onChange={e => upd(i, { best: Number(e.target.value) })} />
            <button className="btn sm" aria-label="Remove component" onClick={() => setComps(comps.filter((_, j) => j !== i))}><Trash size={13} /></button>
          </div>
        ))}
        <button className="btn sm" onClick={() => setComps([...comps, { key: `c${comps.length + 1}`, name: '', weight: 0, codes: [], rule: 'sum' }])}><Plus size={14} weight="bold" /> Component</button>
        <p className="muted" style={{ marginTop: 6 }}>Codes in this scheme: {codes.join(', ') || 'none yet. Add assessments first.'}</p>

        <h4 style={{ margin: '18px 0 8px', fontWeight: 800 }}>Subjects with their own weights</h4>
        {Object.entries(sw).map(([k, w]) => (
          <div key={k} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <b style={{ minWidth: 160 }}>{subjects.find(s => s.key === k)?.name ?? k}</b>
            {comps.map(c => <label key={c.key} className="ex-chk" style={{ fontSize: 12.5 }}>{c.name}<input className="ex-in" style={{ width: 70 }} type="number" min={0} value={w[c.key] ?? c.weight} onChange={e => setSw({ ...sw, [k]: { ...w, [c.key]: Number(e.target.value) } })} /></label>)}
            <button className="btn sm" aria-label="Remove" onClick={() => { const n = { ...sw }; delete n[k]; setSw(n); }}><Trash size={13} /></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="ex-in" style={{ maxWidth: 280 }} aria-label="Subject" value={addSub} onChange={e => setAddSub(e.target.value)}><option value="">Add a subject…</option>{subjects.filter(s => !sw[s.key]).map(s => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
          <button className="btn sm" disabled={!addSub} onClick={() => { setSw({ ...sw, [addSub]: Object.fromEntries(comps.map(c => [c.key, c.weight])) }); setAddSub(''); }}>Add</button>
        </div>
      </fieldset>
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      {!ro && <div className="ex-sticky">{term && <button className="btn sm" disabled={busy} onClick={del}><Trash size={14} weight="bold" /> Remove term</button>}<span className="sp" /><button className="btn sm" onClick={onClose}>Cancel</button><button className="btn sm pri" disabled={busy} onClick={save}>Save term</button></div>}
    </Pop>
  );
}

function AssessmentPop({ scheme, a, terms, subjects, ro, call, onDone, onClose }: {
  scheme: SchemeRow; a: AssessmentRow | null; terms: Term[]; subjects: { key: string; name: string }[]; ro: boolean; call: Call; onDone: (m: string) => void; onClose: () => void;
}) {
  const [termId, setTermId] = useState(a?.termId ?? terms[0]?.id ?? '');
  const [code, setCode] = useState(a?.code ?? '');
  const [name, setName] = useState(a?.name ?? '');
  const [kind, setKind] = useState<Assessment['kind']>(a?.kind ?? 'written');
  const [max, setMax] = useState(a?.subjects['*']?.max ?? a?.maxMarks ?? 80);
  const [only, setOnly] = useState(!!a?.subjects['*']?.skip);
  const [subs, setSubs] = useState<Record<string, SubjectOverride>>(Object.fromEntries(Object.entries(a?.subjects ?? {}).filter(([k]) => k !== '*')));
  const [heldFrom, setHeldFrom] = useState(a?.heldFrom ?? '');
  const [heldTo, setHeldTo] = useState(a?.heldTo ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const takes = (k: string) => (only ? subs[k] !== undefined && !subs[k].skip : !subs[k]?.skip);
  const toggle = (k: string, on: boolean) => {
    const n = { ...subs };
    if (only) { if (on) n[k] = { ...(n[k] ?? {}), skip: undefined }; else delete n[k]; }
    else if (on) { const rest = { ...(n[k] ?? {}) }; delete rest.skip; if (Object.keys(rest).length) n[k] = rest; else delete n[k]; } else n[k] = { ...(n[k] ?? {}), skip: true };
    setSubs(n);
  };
  const setOwnMax = (k: string, v: string) => {
    const n = { ...subs };
    const o: SubjectOverride = { ...(n[k] ?? {}) };
    if (v) o.max = Number(v); else delete o.max;
    if (!o.max && !o.skip && !only) delete n[k]; else n[k] = o;
    setSubs(n);
  };
  const payload = () => {
    const clean: Record<string, SubjectOverride> = {};
    for (const [k, o] of Object.entries(subs)) { const x: SubjectOverride = {}; if (o.skip) x.skip = true; if (o.max) x.max = o.max; if (only || Object.keys(x).length) clean[k] = x; }
    if (only) return { '*': { skip: true }, ...clean };
    // Keep a default maximum the scheme set for every subject (the presets do, for theory papers).
    return a?.subjects['*']?.max ? { '*': { max }, ...clean } : clean;
  };
  const save = () => run(setBusy, setErr, () => call<{ reshaped?: boolean }>('/api/admin/exams', 'POST', { action: 'assessment', id: a?.id, schemeId: scheme.id, termId, code, name, kind, maxMarks: max, subjects: payload(), heldFrom: heldFrom || null, heldTo: heldTo || null }))
    .then(ok => ok && onDone(a ? 'Assessment saved.' : 'Assessment added. Use its code in a term component, then open marks entry from the board.'));
  const del = () => run(setBusy, setErr, () => call('/api/admin/exams', 'POST', { action: 'assessment_delete', id: a!.id })).then(ok => ok && onDone('Assessment removed.'));
  return (
    <Pop wide title={a ? `${a.code}: ${a.name}` : 'New assessment'} onClose={onClose}>
      <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="ex-form">
          <div><label htmlFor="a-c">Code</label><input id="a-c" className="ex-in" value={code} maxLength={12} placeholder="PT1" onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></div>
          <div style={{ gridColumn: 'span 2' }}><label htmlFor="a-n">Name</label><input id="a-n" className="ex-in" value={name} maxLength={80} placeholder="Periodic test 1" onChange={e => setName(e.target.value)} /></div>
          <div><label htmlFor="a-t">Term</label><select id="a-t" className="ex-in" value={termId} onChange={e => setTermId(e.target.value)}>{terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><label htmlFor="a-k">Kind</label><select id="a-k" className="ex-in" value={kind} onChange={e => setKind(e.target.value as Assessment['kind'])}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label htmlFor="a-m">Out of</label><input id="a-m" type="number" min={1} max={1000} className="ex-in" value={max} onChange={e => setMax(Number(e.target.value))} /></div>
          <div><label htmlFor="a-f">From</label><input id="a-f" type="date" className="ex-in" value={heldFrom} onChange={e => setHeldFrom(e.target.value)} /></div>
          <div><label htmlFor="a-to">To</label><input id="a-to" type="date" className="ex-in" value={heldTo} onChange={e => setHeldTo(e.target.value)} /></div>
        </div>
        <h4 style={{ margin: '18px 0 8px', fontWeight: 800 }}>Subjects</h4>
        <label className="ex-chk" style={{ marginBottom: 10 }}><input type="checkbox" checked={only} onChange={e => { setOnly(e.target.checked); setSubs({}); }} />Only some subjects (a practical for skill subjects, say)</label>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Subject</th><th className="c">Assessed</th><th>Own maximum</th></tr></thead>
          <tbody>{subjects.map(s => (
            <tr key={s.key}>
              <td>{s.name}</td>
              <td className="c"><input type="checkbox" aria-label={`${s.name} assessed`} checked={takes(s.key)} onChange={e => toggle(s.key, e.target.checked)} /></td>
              <td><input className="ex-in" style={{ width: 90 }} type="number" min={1} aria-label={`${s.name} maximum`} disabled={!takes(s.key)} placeholder={String(max)} value={subs[s.key]?.max ?? ''} onChange={e => setOwnMax(s.key, e.target.value)} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      </fieldset>
      {err && <div className="note err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      {!ro && <div className="ex-sticky">{a && <button className="btn sm" disabled={busy} onClick={del}><Trash size={14} weight="bold" /> Remove</button>}<span className="sp" /><button className="btn sm" onClick={onClose}>Cancel</button><button className="btn sm pri" disabled={busy || !code || !name} onClick={save}>{a ? 'Save' : 'Add'}</button></div>}
    </Pop>
  );
}
