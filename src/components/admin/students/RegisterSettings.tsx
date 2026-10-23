'use client';

import { useState } from 'react';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import { Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { GRADES, gradeLabel, ROLL_RULE_LABEL, ROLL_RULES, type RollRule } from '@/lib/students/register';
import { DEFAULT_CHECKLIST, DOC_GROUP_LABEL, DOC_KIND_KEYS, DOC_KINDS, docLabel, type ChecklistItem, type DocGroup } from '@/lib/students/documents';
import { CardHead, Field } from '../kit';
import { useGet } from '@/components/canon/useGet';

interface Settings {
  settings: { session: { startMonth: number; current: string }; admission: { prefix: string; pad: number; last: number; next: string }; rollRule: RollRule; checklist: ChecklistItem[] };
  blockers: { session: string; next: string; open: { cls: string; total: number }[] } | null;
  can: { manage: boolean; session: boolean };
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Numbering and roll numbers (registrar), the academic session and the admission checklist (school admin). */
export default function RegisterSettings() {
  const { data, error, reload } = useGet<Settings>('/api/admin/students/settings');
  if (error) return <div className="note err" role="alert">{error}</div>;
  if (!data) return <div className="g2">{[0, 1].map(i => <div className="card" key={i}>{[0, 1, 2, 3].map(j => <Skeleton key={j} h={18} style={{ marginBottom: 14 }} />)}</div>)}</div>;
  return (
    <>
      <div className="g2">
        <Numbering data={data} onSaved={reload} />
        <Session data={data} onSaved={reload} />
      </div>
      <Checklist data={data} onSaved={reload} />
    </>
  );
}

/** The documents the school asks for at admission, per class. Sthara's default until the school admin changes it. */
function Checklist({ data, onSaved }: { data: Settings; onSaved: () => void }) {
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const [list, setList] = useState<ChecklistItem[]>(data.settings.checklist);
  const [err, setErr] = useState<string | null>(null);
  const edit = data.can.session;
  const at = (k: string) => list.find(i => i.kind === k);
  const set = (k: (typeof DOC_KIND_KEYS)[number], patch: Partial<ChecklistItem> | null) => setList(l => {
    if (!patch) return l.filter(i => i.kind !== k);
    const cur = l.find(i => i.kind === k);
    return cur ? l.map(i => (i.kind === k ? { ...i, ...patch } : i)) : [...l, { kind: k, from: GRADES[0], to: GRADES[GRADES.length - 1], ...patch }];
  });
  const changed = JSON.stringify(list) !== JSON.stringify(data.settings.checklist);
  const save = async (value: ChecklistItem[], ok: string) => {
    setErr(null);
    try { await call('/api/admin/students/settings', 'POST', { action: 'checklist', list: value }); toast(ok); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  const gradeSel = (id: string, v: number, onChange: (g: number) => void) => (
    <select id={id} className="cmp-sel" value={v} disabled={!edit} onChange={e => onChange(Number(e.target.value))} style={{ minWidth: 110 }}>
      {GRADES.map(g => <option key={g} value={g}>{gradeLabel(g)}</option>)}
    </select>
  );
  return (
    <div className="card" style={{ marginTop: 20 }}>
      {toastEl}
      <CardHead title="Admission checklist" sub="What each student's record shows as needed, by the class they were admitted to. Only verified documents count. Only the school admin changes this." />
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Document</th><th>Asked for</th><th>From</th><th>To</th></tr></thead>
          <tbody>{(Object.keys(DOC_GROUP_LABEL) as DocGroup[]).flatMap(g => DOC_KIND_KEYS.filter(k => DOC_KINDS[k].group === g).map(k => {
            const i = at(k);
            return (
              <tr key={k}>
                <td>{docLabel(k)}<div className="muted" style={{ fontSize: 12 }}>{DOC_GROUP_LABEL[g]}</div></td>
                <td><input type="checkbox" aria-label={`Ask for ${docLabel(k)}`} checked={!!i} disabled={!edit} onChange={e => set(k, e.target.checked ? {} : null)} /></td>
                <td>{i ? gradeSel(`cl-from-${k}`, i.from, g2 => set(k, { from: g2 })) : <span className="muted">{'\u2014'}</span>}</td>
                <td>{i ? gradeSel(`cl-to-${k}`, i.to, g2 => set(k, { to: g2 })) : <span className="muted">{'\u2014'}</span>}</td>
              </tr>
            );
          }))}</tbody>
        </table>
      </div>
      {edit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn pri" disabled={!changed} onClick={() => save(list, 'Checklist saved.')}>Save checklist</button>
          <button className="btn" onClick={() => { setList(DEFAULT_CHECKLIST); void save(DEFAULT_CHECKLIST, 'Back to Sthara\u2019s default.'); }}>Use Sthara&apos;s default</button>
        </div>
      )}
    </div>
  );
}

function Numbering({ data, onSaved }: { data: Settings; onSaved: () => void }) {
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const s = data.settings;
  const [prefix, setPrefix] = useState(s.admission.prefix);
  const [pad, setPad] = useState(s.admission.pad);
  const [rule, setRule] = useState<RollRule>(s.rollRule);
  const [err, setErr] = useState<string | null>(null);
  const preview = `${prefix}${String(s.admission.last + 1).padStart(pad, '0')}`;
  const save = async () => {
    setErr(null);
    try { await call('/api/admin/students/settings', 'POST', { action: 'numbering', prefix, pad, rollRule: rule }); toast('Saved.'); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  return (
    <div className="card">
      {toastEl}
      <CardHead title="Admission numbers and roll numbers" sub="Numbers already on the register never change. Sthara continues after the highest one in this format." />
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="g2">
        <Field label="PREFIX" htmlFor="st-prefix" hint="For example VN/ or 2026/. Leave blank for numbers only.">
          <input id="st-prefix" className="cmp-in" value={prefix} maxLength={12} disabled={!data.can.manage} onChange={e => setPrefix(e.target.value)} />
        </Field>
        <Field label="DIGITS" htmlFor="st-pad">
          <select id="st-pad" className="cmp-sel" value={pad} disabled={!data.can.manage} onChange={e => setPad(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '4px 0 14px' }}>The next number Sthara issues: <b style={{ color: 'var(--ink)' }}>{preview}</b></p>
      <Field label="ROLL NUMBERS" htmlFor="st-roll" hint="Applied when a class is promoted or renumbered. Set by hand leaves them alone.">
        <select id="st-roll" className="cmp-sel" value={rule} disabled={!data.can.manage} onChange={e => setRule(e.target.value as RollRule)}>
          {ROLL_RULES.map(r => <option key={r} value={r}>{ROLL_RULE_LABEL[r]}</option>)}
        </select>
      </Field>
      {data.can.manage && <button className="btn pri" onClick={save}>Save</button>}
    </div>
  );
}

function Session({ data, onSaved }: { data: Settings; onSaved: () => void }) {
  const { call } = useAdminDesk();
  const [toast, toastEl] = useToast();
  const s = data.settings.session;
  const [month, setMonth] = useState(s.startMonth);
  const [override, setOverride] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const b = data.blockers;
  const post = async (body: Record<string, unknown>, ok: string) => {
    setErr(null);
    try { await call('/api/admin/students/settings', 'POST', body); toast(ok); setConfirm(false); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };
  return (
    <div className="card">
      {toastEl}
      <CardHead title="Academic session" sub={`Current session: ${s.current.replace('-', '–')}. Only the school admin changes these.`} />
      {err && <div className="note err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <Field label="SESSION STARTS IN" htmlFor="st-month">
        <select id="st-month" className="cmp-sel" value={month} disabled={!data.can.session} onChange={e => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </Field>
      {data.can.session && month !== s.startMonth && <button className="btn" onClick={() => post({ action: 'session-start', month }, 'Saved.')}>Save start month</button>}
      {data.can.session && b && (
        <div style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800 }}>Open {b.next.replace('-', '–')}</h3>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px' }}>
            Every login moves to its new class, and this session becomes history. {b.open.length
              ? `${b.open.length} class${b.open.length === 1 ? ' hasn’t' : 'es haven’t'} finished the year end: ${b.open.slice(0, 6).map(c => c.cls).join(', ')}${b.open.length > 6 ? ', ...' : ''}.`
              : 'Every class has been promoted.'}
          </p>
          {!confirm ? <button className="btn pri" onClick={() => setConfirm(true)}><CalendarCheck size={16} weight="bold" /> Open the next session</button> : (
            <>
              {b.open.length > 0 && (
                <Field label="REASON TO OPEN IT ANYWAY" htmlFor="st-over" hint="Recorded in the audit trail.">
                  <input id="st-over" className="cmp-in" value={override} maxLength={300} onChange={e => setOverride(e.target.value)} />
                </Field>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn pri" disabled={b.open.length > 0 && override.trim().length < 10} onClick={() => post({ action: 'open-session', override }, `Session ${b.next} is open.`)}>Open {b.next.replace('-', '–')}</button>
                <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
