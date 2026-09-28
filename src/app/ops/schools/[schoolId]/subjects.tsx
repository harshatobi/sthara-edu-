'use client';

/**
 * The school workspace's Subjects tab: every subject the school tracks, linked to
 * the official curriculum, with who teaches it, who takes it and who leads it.
 * TML, the tutor and the teacher planner all key on these links.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { LinkIcon as LinkSimple } from '@phosphor-icons/react/dist/ssr/Link';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { Chip, Empty, Skeleton } from '@/components/canon/ui';
import { officialSubjects, type ClassLinkPlan, type SubjectKind, type TeacherLinkPlan } from '@/lib/subjects/catalog';
import { Section, Table, errText, plural } from '../../_ui';
import { useOpsApi } from '../../useOpsApi';

interface ClassSubject { id: string; class_id: string; subject_key: string; subject_name: string; level: string; kind: SubjectKind }
interface State {
  classes: { id: string; name: string; level: string | null }[];
  classSubjects: ClassSubject[];
  teacherSubjects: { id: string; teacher_id: string; class_subject_id: string; role: string }[];
  enrolments: { student_id: string; class_subject_id: string; source: SubjectKind }[];
  leads: { id: string; subject_key: string; subject_name: string; user_id: string }[];
  people: { id: string; role: string; name: string; email: string; cls: string | null; rollNo: string | null; left: boolean }[];
  plan: { classes: ClassLinkPlan[]; teachers: TeacherLinkPlan[] };
  sources: Record<string, Record<string, string[]>>;
}

/** A class subject to save; no kind means keep the current one (or the default for a new subject). */
type Item = { name: string; kind?: SubjectKind };
const norm = (c: string | null | undefined) => (c || '').toLowerCase().replace(/class|[^a-z0-9]/g, '');

export function SubjectsTab({ schoolId, onChanged }: { schoolId: string; onChanged: (msg: string) => Promise<void> | void }) {
  const api = useOpsApi();
  const [st, setSt] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setSt(await api<State>(`/schools/${schoolId}/subjects`)); setErr(null); } catch (e) { setErr(errText(e)); }
  }, [api, schoolId]);
  useEffect(() => {
    let live = true;
    api<State>(`/schools/${schoolId}/subjects`).then(d => { if (live) { setSt(d); setErr(null); } }).catch(e => { if (live) setErr(errText(e)); });
    return () => { live = false; };
  }, [api, schoolId]);

  const post = useCallback((body: Record<string, unknown>) => api<Record<string, unknown>>(`/schools/${schoolId}/subjects`, { method: 'POST', body }), [api, schoolId]);
  const done = async (msg: string) => { await load(); await onChanged(msg); };

  if (err) return <div className="note err" role="alert">{err}</div>;
  if (!st) return <Skeleton h={320} style={{ borderRadius: 20 }} />;
  return (
    <>
      <LinkReview st={st} post={post} done={done} />
      {st.classes.map(c => <ClassOffer key={c.id} c={c} st={st} post={post} done={done} />)}
      {!st.classes.length && <Empty icon={<LinkSimple size={26} weight="duotone" />} title="No classes yet">Add classes in Classes &amp; subjects first.</Empty>}
      <Electives st={st} post={post} done={done} />
      <Leads st={st} post={post} done={done} />
    </>
  );
}

type Post = (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
type Done = (msg: string) => Promise<void>;

// ── Linking what's already here ───────────────────────────────────────────────

const STATUS: Record<string, { label: string; tone: 'g' | 'b' | 'a' | 'r' | 'n' }> = {
  linked: { label: 'LINKED', tone: 'g' }, 'will-link': { label: 'WILL LINK', tone: 'b' },
  'no-match': { label: 'NO MATCH', tone: 'r' }, 'unknown-class': { label: 'NO CURRICULUM', tone: 'n' },
};

function LinkReview({ st, post, done }: { st: State; post: Post; done: Done }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rows = st.plan.classes.flatMap(c => c.items.filter(i => i.status !== 'linked').map(i => ({ c, i })));
  const teacherRows = st.plan.teachers.flatMap(t => t.items.map(i => ({ t, i })));
  const willLink = rows.filter(r => r.i.status === 'will-link').length + teacherRows.filter(r => r.i.status === 'will-link').length;
  if (!rows.length && !teacherRows.length) return null;

  const link = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await post({ action: 'link-school' }) as { classSubjectsAdded: number; teacherLinks: number; unresolved: string[] };
      await done(`${plural(r.classSubjectsAdded, 'class subject')} and ${plural(r.teacherLinks, 'teacher assignment')} linked${r.unresolved.length ? ` · ${r.unresolved.length} left to review` : ''}.`);
    } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };

  return (
    <Section title="Link what's already here" sub="Subject names found in this school's class lists, lesson planner, syllabus, lessons, homework, timetable and teacher assignments, matched to the official curriculum. Linking renames them everywhere to the official name; progress stays on its chapter."
      actions={willLink ? <button className="btn pri sm" disabled={busy} onClick={link}><LinkSimple size={13} weight="bold" /> {busy ? 'Linking…' : `Link ${plural(willLink, 'subject')}`}</button> : undefined}>
      {msg && <div className="note err" role="alert" style={{ marginBottom: 10 }}>{msg}</div>}
      <Table head={<tr><th>Class</th><th>Found as</th><th>Official subject</th><th>Seen in</th><th /></tr>}>
        {rows.map(({ c, i }) => (
          <tr key={`${c.classId}|${i.raw}`}>
            <td className="nm">{c.className}</td>
            <td>{i.raw}</td>
            <td>{i.official ? <><b>{i.official.name}</b> <span className="muted" style={{ fontSize: 12 }}>· {i.kind}</span></> : <span className="muted">—</span>}</td>
            <td className="muted" style={{ fontSize: 12 }}>{(st.sources[c.classId]?.[i.raw] ?? []).join(', ')}</td>
            <td className="r"><Chip tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Chip>
              {i.status === 'no-match' && (st.sources[c.classId]?.[i.raw] ?? []).includes('class list') && (
                <button className="btn sm" style={{ marginLeft: 6 }} onClick={async () => { try { await post({ action: 'drop-legacy', classId: c.classId, name: i.raw }); await done(`${i.raw} removed from ${c.className}'s list.`); } catch (e) { setMsg(errText(e)); } }}>Remove</button>
              )}
            </td>
          </tr>
        ))}
        {teacherRows.map(({ t, i }) => (
          <tr key={`${t.teacherId}|${i.cls}|${i.raw}`}>
            <td className="nm">{i.cls}</td>
            <td>{i.raw} <div className="sub">{t.name}</div></td>
            <td>{i.official ? <b>{i.official.name}</b> : <span className="muted">—</span>}</td>
            <td className="muted" style={{ fontSize: 12 }}>teacher assignment</td>
            <td className="r"><Chip tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Chip></td>
          </tr>
        ))}
      </Table>
      {rows.some(r => r.i.status === 'no-match') && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>No match means the name isn&apos;t an official subject for that class. Pick the right one below, then remove the old name.</p>}
    </Section>
  );
}

// ── What a class offers ───────────────────────────────────────────────────────

function ClassOffer({ c, st, post, done }: { c: State['classes'][number]; st: State; post: Post; done: Done }) {
  const linked = st.classSubjects.filter(x => x.class_id === c.id).sort((a, b) => Number(a.kind !== 'core') - Number(b.kind !== 'core') || a.subject_name.localeCompare(b.subject_name));
  const [add, setAdd] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ items: Item[]; text: string } | null>(null);
  const options = useMemo(() => officialSubjects(c.name).map(g => ({ ...g, subjects: g.subjects.filter(s => !linked.some(l => l.subject_key === s.key)) })).filter(g => g.subjects.length), [c.name, linked]);
  const students = st.people.filter(p => p.role === 'student' && !p.left && norm(p.cls) === norm(c.name)).length;
  const teachersOf = (id: string) => st.teacherSubjects.filter(t => t.class_subject_id === id).map(t => st.people.find(p => p.id === t.teacher_id)?.name ?? 'Teacher');
  const enrolled = (id: string) => st.enrolments.filter(e => e.class_subject_id === id).length;

  const save = async (items: Item[], confirmRemove = false, label = 'Saved') => {
    setMsg(null);
    try {
      await post({ action: 'set-class', classId: c.id, subjects: items, confirmRemove });
      setConfirm(null); setAdd('');
      await done(`${c.name}: ${label}.`);
    } catch (e) {
      const data = (e as { data?: { confirm?: boolean; error?: string } }).data;
      if (data?.confirm) setConfirm({ items, text: data.error ?? 'This removes links.' });
      else setMsg(errText(e));
    }
  };
  const current: Item[] = linked.map(l => ({ name: l.subject_name, kind: l.kind }));

  if (!c.level) {
    return (
      <Section title={c.name} sub="Sthara doesn't have the curriculum for this class level yet (Classes 6-7 are next), so its subjects can't be linked.">
        <p className="muted" style={{ fontSize: 13 }}>Subjects here stay as plain names and are flagged in health until the curriculum is loaded.</p>
      </Section>
    );
  }
  return (
    <Section title={c.name} sub={`CBSE Class ${c.level} · ${plural(students, 'student')} · ${plural(linked.length, 'subject')}`}>
      {msg && <div className="note err" role="alert" style={{ marginBottom: 10 }}>{msg}</div>}
      {confirm && (
        <div className="note" role="alert" style={{ marginBottom: 10 }}>
          {confirm.text}
          <div className="acts" style={{ marginTop: 8 }}>
            <button className="btn sm red" onClick={() => save(confirm.items, true, 'subject removed')}>Remove anyway</button>
            <button className="btn sm" onClick={() => setConfirm(null)}>Keep it</button>
          </div>
        </div>
      )}
      {!linked.length ? <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>No subjects linked yet. Students here have nothing for TML to count towards.</p> : (
        <Table head={<tr><th>Subject</th><th>Type</th><th className="r">Students</th><th>Taught by</th><th /></tr>}>
          {linked.map(l => (
            <tr key={l.id}>
              <td className="nm">{l.subject_name}</td>
              <td>
                <select className="cmp-sel" aria-label={`${l.subject_name} type`} value={l.kind} style={{ padding: '4px 8px', fontSize: 12.5 }}
                  onChange={e => save(current.map(x => (x.name === l.subject_name ? { ...x, kind: e.target.value as SubjectKind } : x)), false, `${l.subject_name} is now ${e.target.value}`)}>
                  <option value="core">Core: every student</option>
                  <option value="elective">Elective: chosen</option>
                </select>
              </td>
              <td className="r num">{enrolled(l.id)}{l.kind === 'core' ? '' : <span className="muted"> of {students}</span>}</td>
              <td style={{ fontSize: 12.5 }}>{teachersOf(l.id).join(', ') || <span style={{ color: 'var(--red)', fontWeight: 600 }}>No teacher</span>}</td>
              <td className="r">
                <button className="btn sm" aria-label={`Remove ${l.subject_name}`} onClick={() => save(current.filter(x => x.name !== l.subject_name), false, `${l.subject_name} removed`)}><X size={12} weight="bold" /></button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {options.length > 0 && (
        <form style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }} onSubmit={e => { e.preventDefault(); if (add) save([...current, { name: add }], false, `${add} added`); }}>
          <select className="cmp-sel" aria-label={`Add a subject to ${c.name}`} value={add} onChange={e => setAdd(e.target.value)} style={{ minWidth: 260 }}>
            <option value="">Add an official subject…</option>
            {options.map(g => <optgroup key={g.stream} label={g.stream}>{g.subjects.map(s => <option key={s.key} value={s.name}>{s.name}{s.codes.length ? ` (${s.codes.join('/')})` : ''}</option>)}</optgroup>)}
          </select>
          <button className="btn sm" disabled={!add}><Plus size={13} weight="bold" /> Add</button>
        </form>
      )}
    </Section>
  );
}

// ── Electives ─────────────────────────────────────────────────────────────────

function Electives({ st, post, done }: { st: State; post: Post; done: Done }) {
  const classes = st.classes.filter(c => st.classSubjects.some(x => x.class_id === c.id && x.kind === 'elective'));
  const [cid, setCid] = useState<string>(classes[0]?.id ?? '');
  const cls = classes.find(c => c.id === cid) ?? classes[0];
  const electives = cls ? st.classSubjects.filter(x => x.class_id === cls.id && x.kind === 'elective').sort((a, b) => a.subject_name.localeCompare(b.subject_name)) : [];
  const students = cls ? st.people.filter(p => p.role === 'student' && !p.left && norm(p.cls) === norm(cls.name)) : [];
  const initial = useMemo(() => Object.fromEntries(students.map(s => [s.id, st.enrolments.filter(e => e.student_id === s.id && e.source === 'elective' && electives.some(x => x.id === e.class_subject_id)).map(e => e.class_subject_id)])), [students, st.enrolments, electives]);
  const [draft, setDraft] = useState<Record<string, string[]> | null>(null);
  const [shownFor, setShownFor] = useState(initial);
  if (shownFor !== initial) { setShownFor(initial); setDraft(null); }
  const picks = draft ?? initial;
  const [msg, setMsg] = useState<string | null>(null);
  if (!classes.length) return null;
  const toggle = (sid: string, id: string) => setDraft({ ...picks, [sid]: picks[sid]?.includes(id) ? picks[sid].filter(x => x !== id) : [...(picks[sid] ?? []), id] });
  const dirty = JSON.stringify(picks) !== JSON.stringify(initial);

  return (
    <Section title="Electives" sub="Which electives each student takes. Core subjects are automatic; electives carry over to the next class when it offers the same subject."
      actions={<select className="cmp-sel" aria-label="Class" value={cls?.id} onChange={e => { setCid(e.target.value); setDraft(null); }}>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}>
      {msg && <div className="note err" role="alert" style={{ marginBottom: 10 }}>{msg}</div>}
      {!students.length ? <p className="muted" style={{ fontSize: 13 }}>No students in {cls?.name}.</p> : (
        <Table head={<tr><th>Student</th>{electives.map(e => <th key={e.id} className="c" style={{ fontSize: 11.5 }}>{e.subject_name}</th>)}</tr>}>
          {students.map(s => (
            <tr key={s.id}>
              <td className="nm">{s.name}<div className="sub">{s.rollNo ?? ''}</div></td>
              {electives.map(e => (
                <td key={e.id} className="c">
                  <input type="checkbox" aria-label={`${s.name} takes ${e.subject_name}`} checked={!!picks[s.id]?.includes(e.id)} onChange={() => toggle(s.id, e.id)} />
                </td>
              ))}
            </tr>
          ))}
        </Table>
      )}
      <div className="acts" style={{ marginTop: 10 }}>
        <button className="btn pri sm" disabled={!dirty} onClick={async () => {
          setMsg(null);
          try { const r = await post({ action: 'electives', classId: cls!.id, choices: picks }) as { added: number; removed: number }; setDraft(null); await done(`${cls!.name} electives saved: ${r.added} added, ${r.removed} removed.`); }
          catch (e) { setMsg(errText(e)); }
        }}>Save electives</button>
        {dirty && <button className="btn sm" onClick={() => setDraft(null)}>Undo</button>}
      </div>
    </Section>
  );
}

// ── Subject leads ─────────────────────────────────────────────────────────────

function Leads({ st, post, done }: { st: State; post: Post; done: Done }) {
  const subjects = [...new Map(st.classSubjects.map(x => [x.subject_key, x.subject_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const staff = st.people.filter(p => (p.role === 'teacher' || p.role === 'admin') && !p.left);
  const [msg, setMsg] = useState<string | null>(null);
  if (!subjects.length) return null;
  const leadsOf = (k: string) => st.leads.filter(l => l.subject_key === k).map(l => l.user_id);
  const set = async (k: string, ids: string[], label: string) => {
    setMsg(null);
    try { await post({ action: 'leads', subjectKey: k, userIds: ids }); await done(label); } catch (e) { setMsg(errText(e)); }
  };
  return (
    <Section title="Subject leads" sub="The head of department for each subject across the school. They see that subject's mastery and syllabus pace in every class.">
      {msg && <div className="note err" role="alert" style={{ marginBottom: 10 }}>{msg}</div>}
      <Table head={<tr><th>Subject</th><th>Classes</th><th>Lead</th></tr>}>
        {subjects.map(([k, name]) => {
          const ids = leadsOf(k);
          const classes = st.classSubjects.filter(x => x.subject_key === k).map(x => st.classes.find(c => c.id === x.class_id)?.name).filter(Boolean);
          return (
            <tr key={k}>
              <td className="nm">{name}</td>
              <td className="muted" style={{ fontSize: 12 }}>{classes.join(', ')}</td>
              <td>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {ids.map(id => (
                    <button key={id} type="button" className="ch b" title="Remove" onClick={() => set(k, ids.filter(x => x !== id), `Lead removed from ${name}.`)}>
                      {staff.find(p => p.id === id)?.name ?? 'Lead'} <X size={11} weight="bold" />
                    </button>
                  ))}
                  <select className="cmp-sel" aria-label={`Add a lead for ${name}`} value="" style={{ padding: '4px 8px', fontSize: 12.5 }}
                    onChange={e => e.target.value && set(k, [...ids, e.target.value], `${staff.find(p => p.id === e.target.value)?.name} now leads ${name}.`)}>
                    <option value="">{ids.length ? 'Add another…' : 'Pick a lead…'}</option>
                    {staff.filter(p => !ids.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}{p.role === 'admin' ? ' (office)' : ''}</option>)}
                  </select>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
      {subjects.every(([k]) => leadsOf(k).length) && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}><CheckCircle size={13} weight="fill" color="#10B981" /> Every subject has a lead.</p>}
    </Section>
  );
}
