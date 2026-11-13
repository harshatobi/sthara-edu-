'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { WarningCircleIcon as WarningCircle } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import { DatabaseIcon as Database } from '@phosphor-icons/react/dist/ssr/Database';
import { SparkleIcon as Sparkle } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { CalculatorIcon as Calculator } from '@phosphor-icons/react/dist/ssr/Calculator';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { ArrowsLeftRightIcon as ArrowsLeftRight } from '@phosphor-icons/react/dist/ssr/ArrowsLeftRight';
import { TrendUpIcon as TrendUp } from '@phosphor-icons/react/dist/ssr/TrendUp';
import { TrendDownIcon as TrendDown } from '@phosphor-icons/react/dist/ssr/TrendDown';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { CaretUpIcon as CaretUp } from '@phosphor-icons/react/dist/ssr/CaretUp';
import { CaretDownIcon as CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { PaperPlaneTiltIcon as PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr/PaperPlaneTilt';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { ProjectorScreenIcon as ProjectorScreen } from '@phosphor-icons/react/dist/ssr/ProjectorScreen';
import { CalendarPlusIcon as CalendarPlus } from '@phosphor-icons/react/dist/ssr/CalendarPlus';
import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { ArrowCounterClockwiseIcon as Undo } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import { SealCheckIcon as SealCheck } from '@phosphor-icons/react/dist/ssr/SealCheck';
import { HandPalmIcon as HandPalm } from '@phosphor-icons/react/dist/ssr/HandPalm';
import { AiTag, Skeleton } from '@/components/canon/ui';
import type { TStudent } from '@/lib/teacher/desk';
import { parseItem, parseQuestionSet } from '@/lib/studio/items';
import { markTotal } from '@/lib/studio/blueprint';
import { COMPETENCY_SHORT, QTYPE_LABEL, SET_KIND_LABEL, isChoice, newItemId, type QuestionSetContent, type StudioItem } from '@/lib/studio/types';
import { STUDIO_LANGUAGES, languageOf, isRtl } from '@/lib/studio/languages';
import { LETTERS } from '@/lib/studio/handout';
import { useStudioApi, type HomeData, type Material } from './api';
import PresentMode from './PresentMode';
import PrintSheet, { printStudio } from './PrintSheet';
import BankFigures from '@/components/studio/BankFigures';

type ItemAction = 'swap' | 'harder' | 'easier' | 'rewrite';
type View = { kind: 'class' } | { kind: 'student'; id: string } | { kind: 'set'; label: string };

const CHANGES = [
  { label: 'Easier start', instruction: 'Make the opening questions gentler so everyone can begin, keep the rest as they are.' },
  { label: 'Everyday examples', instruction: 'Use everyday situations from Indian towns and villages where a context helps.' },
  { label: 'Simpler wording', instruction: 'Use simpler, shorter sentences without changing what is being tested.' },
  { label: 'More thinking', instruction: 'Ask for reasons and explanations, not just answers, where the marks allow.' },
];

/** One material, open for editing and handing out. Every change is saved as a new version and can be undone. */
export default function Workspace({ id, students, home, onBack, onToast, onAnalysis }: {
  id: string; students: TStudent[]; home: HomeData | null; onBack: () => void; onToast: (m: string) => void; onAnalysis?: (assignmentId: string) => void;
}) {
  const api = useStudioApi();
  const [m, setM] = useState<Material | null>(null);
  const [can, setCan] = useState<{ edit: boolean; review: boolean }>({ edit: false, review: false });
  const [moderation, setModeration] = useState<string>('none');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: 'class' });
  const [editing, setEditing] = useState<string | null>(null);
  const [present, setPresent] = useState(false);
  const [due, setDue] = useState('');
  const [lesson, setLesson] = useState('');
  const [instruction, setInstruction] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [bankOpen, setBankOpen] = useState(false);
  const [again, setAgain] = useState(false);
  const [tallies, setTallies] = useState<Record<string, { counts: number[]; answer: number; class: string; at: string }>>({});
  const [tallyTick, setTallyTick] = useState(0);
  useEffect(() => {
    let live = true;
    api<{ tallies: typeof tallies }>(`/api/teacher/studio/tallies?materialId=${id}`).then(r => { if (live) setTallies(r.tallies); }).catch(() => { /* a help only */ });
    return () => { live = false; };
  }, [api, id, tallyTick]);

  const [tick, setTick] = useState(0);
  const load = () => setTick(t => t + 1);
  useEffect(() => {
    let live = true;
    api<{ material: Material; can: { edit: boolean; review: boolean }; moderation: string }>(`/api/teacher/studio/materials?id=${id}`).then(r => {
      if (!live) return;
      setM(r.material); setCan(r.can); setModeration(r.moderation);
      const c = parseQuestionSet(r.material.content);
      // Per-student versions and A/B/C sets open on the first version or set.
      setView(v => (v.kind !== 'class' ? v : c?.audience === 'per_student' && c.versions[0] ? { kind: 'student', id: c.versions[0].studentId } : c?.audience === 'abc' && c.sets[0] ? { kind: 'set', label: c.sets[0].label } : v));
    }).catch(e => { if (live) setError(e?.message || 'Couldn’t open this.'); });
    return () => { live = false; };
  }, [api, id, tick]);

  const set = useMemo(() => (m ? parseQuestionSet(m.content) : null), [m]);
  const byId = useMemo(() => new Map((set?.items ?? []).map(i => [i.id, i])), [set]);
  const ids = useMemo(() => {
    if (!set) return [];
    if (view.kind === 'student') return set.versions.find(v => v.studentId === view.id)?.itemIds ?? [];
    if (view.kind === 'set') return set.sets.find(s => s.label === view.label)?.itemIds ?? [];
    return set.order;
  }, [set, view]);
  const shown = ids.map(i => byId.get(i)).filter((x): x is StudioItem => !!x);
  const flagged = (set?.items ?? []).filter(i => i.check.status === 'flagged');
  const checkedCount = (set?.items ?? []).filter(i => i.check.status === 'passed' || i.check.status === 'rewritten').length;
  const nameOf = (sid: string) => students.find(s => s.id === sid)?.name ?? 'Student';
  const rtl = m ? isRtl(m.language) : false;

  /** Saves new content as the next version. */
  async function save(next: QuestionSetContent, note: string, extra: Record<string, unknown> = {}) {
    if (!m) return;
    setBusy('save');
    try {
      const r = await api<{ material: Material }>('/api/teacher/studio/materials', 'PATCH', { id: m.id, action: 'save', content: next, note, ...extra });
      setM(r.material);
    } catch (e: any) { setError(e?.message); if (/changed since/.test(e?.message || '')) load(); }
    finally { setBusy(null); }
  }
  const replaceItem = (item: StudioItem) => set && save({ ...set, items: set.items.map(i => (i.id === item.id ? item : i)) }, `Changed a question`);

  async function itemAction(it: StudioItem, action: ItemAction) {
    if (!m) return;
    setBusy(`${it.id}:${action}`); setError(null);
    try {
      const r = await api<{ item: StudioItem }>('/api/teacher/studio/item', 'POST', { materialId: m.id, itemId: it.id, action });
      await replaceItem(r.item);
      onToast(action === 'swap' ? 'Swapped for a bank question' : 'New question written and checked');
    } catch (e: any) { setError(e?.message); } finally { setBusy(null); }
  }

  /** Where the current view's list lives, so edits change the list being looked at. */
  const withList = (s: QuestionSetContent, f: (l: string[]) => string[]): QuestionSetContent =>
    view.kind === 'student' ? { ...s, versions: s.versions.map(v => (v.studentId === view.id ? { ...v, itemIds: f(v.itemIds) } : v)) }
      : view.kind === 'set' ? { ...s, sets: s.sets.map(x => (x.label === view.label ? { ...x, itemIds: f(x.itemIds) } : x)) }
        : { ...s, order: f(s.order) };
  const prune = (s: QuestionSetContent): QuestionSetContent => {
    const used = new Set([...s.order, ...s.versions.flatMap(v => v.itemIds), ...s.sets.flatMap(x => x.itemIds)]);
    return { ...s, items: s.items.filter(i => used.has(i.id)) };
  };
  const remove = (it: StudioItem) => set && save(prune(withList(set, l => l.filter(x => x !== it.id))), 'Removed a question');
  const move = (it: StudioItem, d: -1 | 1) => set && save(withList(set, l => {
    const i = l.indexOf(it.id), j = i + d;
    if (i < 0 || j < 0 || j >= l.length) return l;
    const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n;
  }), 'Reordered');
  const add = (it: StudioItem) => set && save(withList({ ...set, items: set.items.some(i => i.id === it.id) ? set.items : [...set.items, it] }, l => [...l, it.id]), 'Added a question');

  async function undo() {
    if (!m || m.version < 2) return;
    setBusy('undo');
    try { const r = await api<{ material: Material }>('/api/teacher/studio/materials', 'PATCH', { id: m.id, action: 'restore', version: m.version - 1 }); setM(r.material); onToast('Undone'); }
    catch (e: any) { setError(e?.message); } finally { setBusy(null); }
  }

  async function wholeSet(body: Record<string, unknown>, done: string) {
    if (!m || !set) return;
    setBusy('set'); setError(null);
    try {
      const r = await api<{ items: StudioItem[]; language?: string }>('/api/teacher/studio/item', 'POST', { materialId: m.id, ...body });
      await save({ ...set, items: r.items }, done, r.language ? { language: r.language } : {});
      onToast(done); setInstruction('');
    } catch (e: any) { setError(e?.message); } finally { setBusy(null); }
  }

  async function post(action: 'assign' | 'printed' | 'attach', body: Record<string, unknown> = {}) {
    if (!m) return null;
    setBusy(action); setError(null);
    try {
      const r = await api<{ material: Material; students?: number; lesson?: { title: string } }>('/api/teacher/studio/materials', 'POST', { id: m.id, action, ...body });
      setM(r.material);
      return r;
    } catch (e: any) { setError(e?.message); return null; } finally { setBusy(null); }
  }
  async function patch(body: Record<string, unknown>, done: string) {
    if (!m) return;
    setBusy('patch'); setError(null);
    try { const r = await api<{ material: Material }>('/api/teacher/studio/materials', 'PATCH', { id: m.id, ...body }); setM(r.material); onToast(done); }
    catch (e: any) { setError(e?.message); } finally { setBusy(null); }
  }

  if (error && !m) return <div className="note err" role="alert">{error} <button className="btn sm" onClick={onBack}>Back</button></div>;
  if (!m) return <div aria-busy="true"><Skeleton h={420} /></div>;
  if (!set) return <div className="note info">This material opens in the Ask tab. <button className="btn sm" onClick={onBack}>Back</button></div>;

  const needsApproval = moderation !== 'none' && (m.common_test || (moderation === 'all_shared' && m.share === 'department'));
  const assignBlock = flagged.length ? `Fix ${flagged.length === 1 ? 'the question marked red' : `the ${flagged.length} questions marked red`} first`
    : needsApproval && m.moderation !== 'approved' ? 'Waiting for the subject lead’s approval' : null;
  const marks = shown.reduce((n, i) => n + i.marks, 0);
  // Handing the same set out twice makes a second assignment: only on purpose.
  const assigned = (m.assignment_ids ?? []).length;
  const versionCount = set.audience === 'per_student' ? set.versions.length : set.audience === 'abc' ? set.sets.length : 1;

  return (
    <div className="sd-ws">
      <div className="sd-card" style={{ overflow: 'hidden' }}>
        <div className="sd-dh">
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2>{m.title}</h2>
            <p>{m.class} {m.subject}, {SET_KIND_LABEL[set.setKind]}, {shown.length} questions, {marks || markTotal(set.blueprint)} marks{versionCount > 1 ? `, ${versionCount} ${set.audience === 'abc' ? 'sets' : 'versions'}` : ''}. {m.status === 'assigned' ? 'Assigned.' : 'Saved as a draft.'}</p>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="sd-chip g"><CheckCircle size={13} weight="bold" /> {checkedCount} checked</span>
            {flagged.length > 0 && <span className="sd-chip r"><WarningCircle size={13} weight="bold" /> {flagged.length} need{flagged.length === 1 ? 's' : ''} you</span>}
            {can.edit && <button className="btn sm" disabled={m.version < 2 || !!busy} onClick={undo}><Undo size={13} weight="bold" /> Undo</button>}
          </div>
        </div>
        {set.audience !== 'class' && (
          <div className="sd-vb">
            <label htmlFor="sd-view">{set.audience === 'abc' ? 'Showing set' : 'Showing the version for'}</label>
            <select id="sd-view" className="cmp-sel" style={{ width: 'auto', padding: '4px 8px' }}
              value={view.kind === 'student' ? view.id : view.kind === 'set' ? view.label : ''}
              onChange={e => setView(set.audience === 'abc' ? { kind: 'set', label: e.target.value } : { kind: 'student', id: e.target.value })}>
              {set.audience === 'abc' ? set.sets.map(s => <option key={s.label} value={s.label}>Set {s.label}</option>)
                : set.versions.map(v => <option key={v.studentId} value={v.studentId}>{nameOf(v.studentId)}</option>)}
            </select>
            {view.kind === 'student' && <span>{set.versions.find(v => v.studentId === view.id)?.reason}</span>}
            {view.kind === 'student' && (set.versions.find(v => v.studentId === view.id)?.access ?? []).map(a => <span key={a} className="sd-chip t">{a.replace(/_/g, ' ')}</span>)}
          </div>
        )}

        <div dir={rtl ? 'rtl' : undefined} lang={m.language}>
          {shown.map((it, i) => editing === it.id
            ? <ItemEditor key={it.id} n={i + 1} item={it} onCancel={() => setEditing(null)} onSave={async next => {
                setBusy(`${it.id}:edit`);
                try { const r = await api<{ item: StudioItem }>('/api/teacher/studio/item', 'POST', { materialId: m.id, itemId: it.id, action: 'edit', item: next }); await replaceItem(r.item); setEditing(null); }
                catch (e: any) { setError(e?.message); } finally { setBusy(null); }
              }} />
            : <ItemCard key={it.id} n={i + 1} it={it} first={i === 0} last={i === shown.length - 1} editable={can.edit} busy={busy} hands={tallies[it.id]}
                onAction={a => itemAction(it, a)} onEdit={() => setEditing(it.id)} onRemove={() => remove(it)} onMove={d => move(it, d)} />)}
          {!shown.length && <p className="sd-mut" style={{ padding: 18, fontSize: 14 }}>No questions here yet.</p>}
        </div>
        {can.edit && (
          <div className="sd-vb" style={{ borderTop: '1px solid var(--sd-line)', borderBottom: 0 }}>
            <button className="btn sm" onClick={() => setBankOpen(o => !o)}><Database size={13} weight="bold" /> Add from bank</button>
            <button className="btn sm" onClick={() => {
              const it = parseItem({ id: newItemId(), source: 'teacher', qtype: 'short', competency: 'apply', marks: 2, text: 'New question', chapterKey: m.chapter_key, check: { status: 'passed', notes: ['Written by you.'] } });
              if (it) { add(it); setEditing(it.id); }
            }}><PencilSimple size={13} weight="bold" /> Write my own</button>
          </div>
        )}
        {bankOpen && <BankPicker cls={m.class} subject={m.subject} chapter={m.chapter_name ?? ''} have={new Set(set.items.map(i => i.bankId || i.id))} onPick={it => { add(it); onToast('Added from the bank'); }} />}
        {error && <div className="note err" role="alert" style={{ margin: 12 }}>{error}</div>}
      </div>

      <div className="sd-rail">
        {can.review && (
          <div className="sd-card sd-pad">
            <h2 style={{ fontSize: 17, fontWeight: 800 }}>Approve for the department</h2>
            <p className="sd-mut" style={{ fontSize: 13.5, marginTop: 4 }}>You can approve this for the {m.subject} department. Approving also approves its new questions in the school bank.</p>
            <textarea className="sd-ta" value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Note to the teacher (needed when asking for changes)" aria-label="Review note" />
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn sm pri" disabled={!!busy} onClick={() => patch({ action: 'review', decision: 'approve', note: reviewNote }, 'Approved')}><SealCheck size={13} weight="bold" /> Approve</button>
              <button className="btn sm" disabled={!!busy} onClick={() => patch({ action: 'review', decision: 'changes', note: reviewNote }, 'Sent back with your note')}>Ask for changes</button>
            </div>
          </div>
        )}
        {can.edit && (
          <div className="sd-card sd-pad">
            <h2 style={{ fontSize: 17, fontWeight: 800 }}>Use it</h2>
            {m.moderation === 'changes_requested' && m.review_note && <div className="note warn" style={{ marginTop: 8 }}>Subject lead: {m.review_note}</div>}
            <div className="sd-dest">
              <div aria-disabled={!!assignBlock} style={{ flexWrap: 'wrap' }}>
                <PaperPlaneTilt size={19} weight="duotone" />
                <span style={{ flex: 1 }}>Assign {set.audience === 'per_student' ? `to ${set.versions.length} students` : `to ${m.class}`}<small>{assignBlock ?? (assigned && !again ? `Already assigned${assigned > 1 ? ` ${assigned} times` : ''}. Hand-ins and marks are in My materials.` : set.handout === 'online' ? 'Answered on Sthara' : 'Handed in on paper, marked from photos')}</small></span>
                {assigned > 0 && !again && onAnalysis && <button className="btn sm" onClick={() => onAnalysis(m.assignment_ids[m.assignment_ids.length - 1])}>How it went</button>}
                {!assignBlock && assigned > 0 && !again && <button className="btn sm" onClick={() => setAgain(true)}>Assign again</button>}
                {!assignBlock && (!assigned || again) && (
                  <span style={{ display: 'flex', gap: 6, width: '100%' }}>
                    <input type="date" className="cmp-in" aria-label="Due date" value={due} min={new Date().toISOString().slice(0, 10)} onChange={e => setDue(e.target.value)} style={{ flex: 1, padding: '6px 8px' }} />
                    <button className="btn sm pri" disabled={!due || !!busy} onClick={async () => { const r = await post('assign', { dueDate: due }); if (r) { setAgain(false); setDue(''); } if (r) onToast(`Assigned to ${r.students} student${r.students === 1 ? '' : 's'}`); }}>Assign</button>
                  </span>
                )}
              </div>
              <button aria-disabled={!!flagged.length} onClick={() => { if (flagged.length) return; printStudio(); post('printed'); }}><Printer size={19} weight="duotone" /><span>Print<small>{set.audience === 'class' ? 'One sheet, answer key at the end' : 'A named sheet each, answer keys at the end'}</small></span></button>
              <button onClick={() => setPresent(true)}><ProjectorScreen size={19} weight="duotone" /><span>Present in class<small>Big text, one question at a time</small></span></button>
              <div style={{ flexWrap: 'wrap' }}>
                <CalendarPlus size={19} weight="duotone" /><span style={{ flex: 1 }}>Attach to a lesson<small>{home?.lessons.length ? 'Listed with the lesson in your planner' : 'No upcoming lessons planned'}</small></span>
                {!!home?.lessons.length && (
                  <span style={{ display: 'flex', gap: 6, width: '100%' }}>
                    <select className="cmp-sel" aria-label="Lesson" value={lesson} onChange={e => setLesson(e.target.value)} style={{ flex: 1, padding: '6px 8px' }}>
                      <option value="">Choose a lesson</option>
                      {home.lessons.map(l => <option key={l.id} value={l.id}>{new Date(`${l.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}{l.period ? `, P${l.period}` : ''}: {l.chapter}</option>)}
                    </select>
                    <button className="btn sm" disabled={!lesson || !!busy} onClick={async () => { const r = await post('attach', { lessonId: lesson }); if (r?.lesson) onToast(`Attached to ${r.lesson.title}`); }}>Attach</button>
                  </span>
                )}
              </div>
              <div style={{ flexWrap: 'wrap' }}>
                <UsersThree size={19} weight="duotone" /><span style={{ flex: 1 }}>Share with the {m.subject} department<small>{m.share === 'department' ? (m.moderation === 'pending' ? 'Shared, waiting for approval' : m.moderation === 'approved' ? 'Shared and approved' : 'Shared') : 'Only you can see it'}</small></span>
                <span style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={m.common_test} onChange={e => patch({ action: 'share', share: m.share, commonTest: e.target.checked }, e.target.checked ? 'Marked as a common test' : 'No longer a common test')} /> Common test for all sections</label>
                  <button className="btn sm" disabled={!!busy} onClick={() => patch({ action: 'share', share: m.share === 'department' ? 'private' : 'department', commonTest: m.common_test }, m.share === 'department' ? 'Back to private' : 'Shared with the department')}>{m.share === 'department' ? 'Stop sharing' : 'Share'}</button>
                </span>
              </div>
            </div>
          </div>
        )}
        {can.edit && (
          <div className="sd-card sd-pad">
            <h2 style={{ fontSize: 17, fontWeight: 800 }}>Change it</h2>
            <div className="sd-chips">{CHANGES.map(c => <button key={c.label} disabled={!!busy} onClick={() => wholeSet({ action: 'revise_set', instruction: c.instruction }, `${c.label}: rewritten and checked`)}>{c.label}</button>)}</div>
            <textarea className="sd-ta" value={instruction} maxLength={400} onChange={e => setInstruction(e.target.value)} placeholder='Or say what to change, e.g. "base question 4 on a swimming pool"' aria-label="What to change" />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <select className="cmp-sel" aria-label="Language" style={{ width: 'auto', padding: '6px 8px' }} value="" disabled={!!busy} onChange={e => e.target.value && wholeSet({ action: 'translate_set', language: e.target.value }, `Now in ${languageOf(e.target.value).name}`)}>
                <option value="">In another language…</option>
                {STUDIO_LANGUAGES.filter(l => l.code !== m.language).map(l => <option key={l.code} value={l.code}>{l.name} ({l.native})</option>)}
              </select>
              <button className="btn sm ai" disabled={instruction.trim().length < 3 || !!busy} onClick={() => wholeSet({ action: 'revise_set', instruction }, 'Rewritten and checked')}><Sparkle size={13} weight="fill" /> Change <AiTag /></button>
            </div>
            {busy === 'set' && <p className="sd-mut" style={{ fontSize: 13, marginTop: 8 }} aria-live="polite">Rewriting and checking every question…</p>}
          </div>
        )}
      </div>

      {present && <PresentMode title={m.title} items={shown} language={m.language} onClose={() => { setPresent(false); setTallyTick(t => t + 1); }}
        onCount={async (itemId, counts) => {
          const r = await api<{ total: number; right: number }>('/api/teacher/studio/tallies', 'POST', { materialId: m.id, itemId, counts });
          return `${r.right} of ${r.total} hands on the right answer. Saved for the class.`;
        }} />}
      <PrintSheet material={m} set={set} school={home?.school.name ?? ''} nameOf={nameOf} />
    </div>
  );
}

function ItemCard({ n, it, first, last, editable, busy, hands, onAction, onEdit, onRemove, onMove }: {
  n: number; it: StudioItem; first: boolean; last: boolean; editable: boolean; busy: string | null;
  hands?: { counts: number[]; answer: number; class: string };
  onAction: (a: ItemAction) => void; onEdit: () => void; onRemove: () => void; onMove: (d: -1 | 1) => void;
}) {
  const flagged = it.check.status === 'flagged';
  const doing = (a: string) => busy === `${it.id}:${a}`;
  const any = !!busy;
  const pct = it.stats && it.stats.attempts >= 5 ? Math.round((it.stats.correct / it.stats.attempts) * 100) : null;
  return (
    <div className={`sd-q${flagged ? ' flag' : ''}`}>
      <span className="qn">{n}</span>
      <div>
        <div className="tx">{it.text}</div>
        {it.figure?.alt && <div className="sch"><b>Figure:</b> {it.figure.alt}</div>}
        <BankFigures figs={it.figures} />
        {isChoice(it.qtype) && it.options && (
          <div className="op">{it.options.map((o, k) => <span key={k} className={k === it.answer ? 'c' : ''}>{LETTERS[k]}. {o}{k === it.answer ? ' (answer)' : ''}</span>)}</div>
        )}
        {it.qtype === 'numerical' && it.value !== null && it.value !== undefined && <div className="op"><span className="c">Answer: {it.value}{it.unit ? ` ${it.unit}` : ''}</span></div>}
        {it.scheme && <div className="sch">{isChoice(it.qtype) ? 'Why: ' : 'Marking: '}{it.scheme}</div>}
        <BankFigures figs={it.schemeFigures} label="Figure from the marking scheme" />
        {it.textVersion && <div className="sch"><b>Text-only version</b> (from CBSE, for students who need text instead of figures): {it.textVersion.text}</div>}
        {it.sourceRef && <div className="sch" style={{ fontStyle: 'italic' }}>{it.sourceRef}</div>}
        <div className="mt">
          {it.topic && <span className="sd-chip">{it.topic}</span>}
          <span className="sd-chip">{COMPETENCY_SHORT[it.competency]}</span>
          <span className="sd-chip">{QTYPE_LABEL[it.qtype]}, {it.marks} mark{it.marks === 1 ? '' : 's'}</span>
          {it.source === 'bank' ? <span className="sd-chip t"><Database size={12} weight="bold" /> Bank</span>
            : it.source === 'teacher' ? <span className="sd-chip"><PencilSimple size={12} weight="bold" /> Yours</span>
              : <span className="sd-chip r"><Sparkle size={12} weight="fill" /> New</span>}
          {pct !== null && <span className="st">{pct}% got it right ({it.stats!.attempts} answers{it.stats!.pooled ? ' across schools' : ''})</span>}
          {it.stats && it.stats.attempts >= 10 && it.stats.discrimination !== null && it.stats.discrimination !== undefined && it.stats.discrimination < 0.15 && <span className="st"><WarningCircle size={13} weight="bold" /> Hardly separates stronger from weaker students</span>}
          {hands && <span className="st"><HandPalm size={13} weight="bold" /> In {hands.class}: {hands.counts[hands.answer] ?? 0} of {hands.counts.reduce((a, b) => a + b, 0)} hands right</span>}
          {!flagged && it.check.computed && <span className="st"><Calculator size={13} weight="bold" /> Answer worked out separately and matches</span>}
          {!flagged && !it.check.computed && it.check.status !== 'unchecked' && it.check.notes[0] && <span className="st"><CheckCircle size={13} weight="bold" /> {it.check.notes[0]}</span>}
        </div>
        {flagged && (
          <div className="sd-fn" role="alert"><WarningCircle size={18} weight="bold" style={{ flex: 'none' }} /><div><b>Needs you before it can go to students.</b> {it.check.notes.join(' ')}</div></div>
        )}
        {editable && (
          <div className="qa">
            <button onClick={onEdit} disabled={any}><PencilSimple size={13} weight="bold" /> Edit</button>
            <button onClick={() => onAction('swap')} disabled={any}><ArrowsLeftRight size={13} weight="bold" /> {doing('swap') ? 'Swapping…' : 'Swap from bank'}</button>
            <button onClick={() => onAction('harder')} disabled={any}><TrendUp size={13} weight="bold" /> {doing('harder') ? 'Writing…' : 'Harder'}</button>
            <button onClick={() => onAction('easier')} disabled={any}><TrendDown size={13} weight="bold" /> {doing('easier') ? 'Writing…' : 'Easier'}</button>
            <button onClick={() => onAction('rewrite')} disabled={any}><ArrowsClockwise size={13} weight="bold" /> {doing('rewrite') ? 'Writing…' : 'Write again'}</button>
            <button onClick={onRemove} disabled={any}><Trash size={13} weight="bold" /> Remove</button>
            <button onClick={() => onMove(-1)} disabled={any || first} aria-label={`Move question ${n} up`}><CaretUp size={13} weight="bold" /></button>
            <button onClick={() => onMove(1)} disabled={any || last} aria-label={`Move question ${n} down`}><CaretDown size={13} weight="bold" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemEditor({ n, item, onSave, onCancel }: { n: number; item: StudioItem; onSave: (it: Partial<StudioItem>) => void; onCancel: () => void }) {
  const [text, setText] = useState(item.text);
  const [options, setOptions] = useState<string[]>(item.options ?? ['', '', '', '']);
  const [answer, setAnswer] = useState(item.answer ?? 0);
  const [scheme, setScheme] = useState(item.scheme);
  const [marks, setMarks] = useState(item.marks);
  const choice = isChoice(item.qtype);
  return (
    <div className="sd-q sd-edit">
      <span className="qn">{n}</span>
      <div>
        <label className="sr-only" htmlFor={`ed-${item.id}`}>Question {n}</label>
        <textarea id={`ed-${item.id}`} rows={3} value={text} onChange={e => setText(e.target.value)} />
        {choice ? options.map((o, k) => (
          <div className="row2" key={k}>
            <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 13, fontWeight: 700 }}><input type="radio" name={`ans-${item.id}`} checked={answer === k} onChange={() => setAnswer(k)} /> {LETTERS[k]}</label>
            <input aria-label={`Option ${LETTERS[k]}`} value={o} onChange={e => setOptions(x => x.map((y, j) => (j === k ? e.target.value : y)))} />
          </div>
        )) : (
          <div className="row2"><label htmlFor={`mk-${item.id}`} style={{ fontSize: 13, fontWeight: 700 }}>Marks</label>
            <input id={`mk-${item.id}`} type="number" min={1} max={10} value={marks} onChange={e => setMarks(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} style={{ width: 80 }} /></div>
        )}
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginTop: 6 }} htmlFor={`sc-${item.id}`}>{choice ? 'Why the answer is right' : 'Marking scheme (value points)'}</label>
        <textarea id={`sc-${item.id}`} rows={2} value={scheme} onChange={e => setScheme(e.target.value)} />
        <div className="qa">
          <button className="btn sm pri" style={{ background: 'var(--role-btn)', color: '#fff' }} onClick={() => onSave({ text, options: choice ? options : undefined, answer: choice ? answer : undefined, scheme, marks: choice ? 1 : marks })}>Save</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function BankPicker({ cls, subject, chapter, have, onPick }: { cls: string; subject: string; chapter: string; have: Set<string>; onPick: (it: StudioItem) => void }) {
  const api = useStudioApi();
  const [items, setItems] = useState<StudioItem[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => api<{ items: StudioItem[] }>(`/api/teacher/bank?${new URLSearchParams({ class: cls, subject, chapter, q })}`).then(r => { if (live) setItems(r.items); }).catch(() => { if (live) setItems([]); }), 250);
    return () => { live = false; clearTimeout(t); };
  }, [api, cls, subject, chapter, q]);
  return (
    <div style={{ borderTop: '1px solid var(--sd-line)', padding: '12px 18px', maxHeight: 360, overflow: 'auto' }}>
      <input className="cmp-in" placeholder="Search the bank" aria-label="Search the bank" value={q} onChange={e => setQ(e.target.value)} />
      {items === null ? <p className="sd-mut" style={{ fontSize: 13, marginTop: 8 }}>Loading…</p>
        : !items.length ? <p className="sd-mut" style={{ fontSize: 13, marginTop: 8 }}>Nothing in the bank for this chapter yet.</p>
          : items.filter(i => !have.has(i.id)).slice(0, 40).map(i => (
            <div key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid #EEF2F7' }}>
              <div style={{ flex: 1, fontSize: 14 }}>{i.text}<div className="sd-mut" style={{ fontSize: 12.5, marginTop: 2 }}>{COMPETENCY_SHORT[i.competency]}, {i.marks} mark{i.marks === 1 ? '' : 's'}{i.topic ? `, ${i.topic}` : ''}</div></div>
              <button className="btn sm" onClick={() => onPick(i)}><Plus size={12} weight="bold" /> Add</button>
            </div>
          ))}
    </div>
  );
}
