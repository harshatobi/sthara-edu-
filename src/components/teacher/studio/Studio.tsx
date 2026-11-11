'use client';

import { useEffect, useState } from 'react';
import { TextAaIcon as TextAa } from '@phosphor-icons/react/dist/ssr/TextAa';
import { CircleHalfIcon as CircleHalf } from '@phosphor-icons/react/dist/ssr/CircleHalf';
import { TranslateIcon as Translate } from '@phosphor-icons/react/dist/ssr/Translate';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { useTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { normClass } from '@/lib/teacher/scope';
import { STUDIO_LANGUAGES } from '@/lib/studio/languages';
import type { ReadyItem, WeekPeriod } from '@/lib/studio/home';
import ScopePicker, { useScopeSelection } from '../ScopePicker';
import Copilot, { type AskStart } from '../copilot/Copilot';
import { useStudioApi, type HomeData, type Material, type SetupPreset } from './api';
import HomeView, { type Tool } from './HomeView';
import SetupView from './SetupView';
import Workspace from './Workspace';
import LibraryView from './LibraryView';
import AccessNeedsPanel from './AccessNeedsPanel';

type Tab = 'make' | 'mine' | 'department' | 'ask';
type Screen = { kind: 'home' } | { kind: 'setup'; preset: SetupPreset | null; key: number } | { kind: 'material'; id: string };

const PREFS = 'sthara.studio.prefs';
function loadPrefs(): { large: boolean; contrast: boolean; language: string } {
  try { return { large: false, contrast: false, language: 'en', ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { return { large: false, contrast: false, language: 'en' }; }
}

/**
 * Copilot Studio (approved v2 mockup, plan ~/.claude/plans/copilot-studio-pr-a.md): everything a teacher needs to
 * teach this class well this week, made from its real results. Tabs: Make (home, set up, workspace), My materials,
 * Department, and Ask (the conversational Copilot, which keeps the lesson, ideas, visuals, parent note and board
 * paper generators).
 */
export default function Studio() {
  const { desk, error: deskError } = useTeacherDesk();
  const { classes, cls, subjects, subject, go } = useScopeSelection(desk?.scope ?? []);
  const api = useStudioApi();
  const [toast, toastEl] = useToast();
  const [tab, setTab] = useState<Tab>('make');
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [homeFor, setHomeFor] = useState<{ key: string; data: HomeData } | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [needsOpen, setNeedsOpen] = useState(false);
  const [askStart, setAskStart] = useState<AskStart | null>(null);
  // Rendered in the browser only (it waits for the teacher's desk), so local preferences can be read up front.
  const [prefs, setPrefs] = useState(() => (typeof window === 'undefined' ? { large: false, contrast: false, language: 'en' } : loadPrefs()));
  const setPref = (p: Partial<typeof prefs>) => setPrefs(cur => { const next = { ...cur, ...p }; try { localStorage.setItem(PREFS, JSON.stringify(next)); } catch { /* a convenience only */ } return next; });

  const homeKey = `${cls}|${subject}`;
  const [homeTick, setHomeTick] = useState(0);
  const loadHome = () => setHomeTick(t => t + 1);
  useEffect(() => {
    if (!cls || !subject) return;
    let live = true;
    api<HomeData>(`/api/teacher/studio/home?${new URLSearchParams({ class: cls, subject })}`)
      .then(d => { if (live) { setHomeFor({ key: homeKey, data: d }); setHomeError(null); } })
      .catch(e => { if (live) setHomeError(e?.message || 'Couldn’t load the Studio.'); });
    return () => { live = false; };
  }, [api, cls, subject, homeKey, homeTick]);
  const home = homeFor?.key === homeKey ? homeFor.data : null;

  const students = desk?.classes.find(c => normClass(c.cls) === normClass(cls))?.students ?? [];
  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const setup = (preset: SetupPreset | null) => { setTab('make'); setScreen({ kind: 'setup', preset, key: Date.now() }); toTop(); };
  const ask = (kind: AskStart['kind'], preset: AskStart['preset'] = null) => { setAskStart({ kind, preset, key: Date.now() }); setTab('ask'); toTop(); };
  const open = (id: string) => { setTab('make'); setScreen({ kind: 'material', id }); toTop(); };

  function onReady(r: ReadyItem) {
    const p = r.preset;
    if (p.tool === 'open' && p.materialId) return open(p.materialId);
    if (p.tool === 'parent_note') return ask('parent_note', { student: p.studentId });
    setup({ setKind: p.setKind, chapter: p.chapter, audience: p.audience, students: p.students, lessonId: p.lessonId, basis: r.detail });
  }
  function onTool(t: Tool) {
    if (t === 'questions') return setup(null);
    if (t === 'test') return setup({ setKind: 'test', audience: 'abc', chapter: home?.tiles.lowest?.chapter });
    if (t === 'lesson') return ask('lesson');
    if (t === 'ideas') return ask('explain');
    if (t === 'visual') return ask(/science|physics|chemistry/i.test(subject) ? 'lab_demo' : 'diagram');
    return ask('parent_note');
  }
  function onTile(t: 'mastery' | 'support' | 'pace' | 'test') {
    const tl = home?.tiles;
    if (t === 'pace') { window.location.assign(`/teacher/syllabus?${new URLSearchParams({ class: cls, subject })}`); return; }
    if (t === 'test') return setup({ setKind: 'test', audience: 'abc', chapter: tl?.lowest?.chapter, basis: tl?.nextTest ? `${tl.nextTest.title} is on ${tl.nextTest.on}.` : undefined });
    if (t === 'support' && tl?.needSupport.length) return setup({ setKind: 'catchup', audience: 'per_student', students: tl.needSupport.map(s => s.id), chapter: tl.lowest?.chapter, basis: `${tl.needSupport.length} student${tl.needSupport.length === 1 ? ' is' : 's are'} below 40%.` });
    setup({ setKind: tl?.lowest ? 'catchup' : 'quiz', chapter: tl?.lowest?.chapter, basis: tl?.lowest ? `${tl.lowest.chapter} is ${cls}'s weakest chapter at ${tl.lowest.score}%.` : undefined });
  }
  function onPeriod(p: WeekPeriod) {
    if (p.state === 'none') return ask('lesson');
    if (p.state === 'partial') return setup({ setKind: 'exit_ticket', chapter: p.title, lessonId: p.lessonId ?? undefined, basis: `The ${p.date} lesson has a plan but nothing to hand out.` });
  }

  if (deskError) return <div className="note err" role="alert">Couldn&apos;t load your classes: {deskError}</div>;
  if (!desk) return <div aria-busy="true"><PageBar eyebrow="AI ASSISTANT" title="Copilot Studio" sub={<Skeleton h={14} w={360} />} /><Skeleton h={420} /></div>;
  if (!classes.length) {
    return (
      <>
        <PageBar eyebrow="AI ASSISTANT" title="Copilot Studio" />
        <div className="card"><Empty icon={<Warning size={26} weight="duotone" />} title="No classes assigned yet">The Studio works from your classes&apos; real results. Once your admin links you to classes and subjects, it&apos;s ready.</Empty></div>
      </>
    );
  }

  const TABS: { k: Tab; label: string }[] = [{ k: 'make', label: 'Make' }, { k: 'mine', label: 'My materials' }, { k: 'department', label: 'Department' }, { k: 'ask', label: 'Ask' }];
  return (
    <div className={`sd-root${prefs.large ? ' sd-large' : ''}${prefs.contrast ? ' sd-contrast' : ''}`}>
      <PageBar eyebrow="AI ASSISTANT" title="Copilot Studio"
        sub={`Everything you need to teach ${cls} well this week, made from its real results.`}
        actions={<>
          <ScopePicker classes={classes} cls={cls} subjects={subjects} subject={subject} onChange={n => { go({ class: n.class ?? cls, subject: n.subject ?? (n.class ? null : subject) }); setScreen({ kind: 'home' }); setNeedsOpen(false); }} />
          <div className="sd-acc" role="group" aria-label="Reading and language options">
            <button aria-pressed={prefs.large} onClick={() => setPref({ large: !prefs.large })}><TextAa size={15} weight="bold" /> Larger text</button>
            <button aria-pressed={prefs.contrast} onClick={() => setPref({ contrast: !prefs.contrast })}><CircleHalf size={15} weight="bold" /> Contrast</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 6 }}><Translate size={15} weight="bold" aria-hidden="true" /><span className="sr-only">Language for new materials</span>
              <select value={prefs.language} onChange={e => setPref({ language: e.target.value })} aria-label="Language for new materials">
                {STUDIO_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.code === 'en' ? 'English' : l.native}</option>)}
              </select></label>
          </div>
          <button className="btn sm" aria-expanded={needsOpen} onClick={() => setNeedsOpen(o => !o)}>Access needs</button>
        </>} />

      <div className="sd-tabs" role="tablist" aria-label="Studio">
        {TABS.map(t => <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => { setTab(t.k); if (t.k === 'make' && screen.kind !== 'material') setScreen({ kind: 'home' }); }}>{t.label}</button>)}
      </div>

      {needsOpen && <AccessNeedsPanel cls={cls} onClose={() => setNeedsOpen(false)} onToast={toast} />}

      {tab === 'make' && screen.kind !== 'home' && (
        <button className="btn sm" style={{ marginBottom: 10 }} onClick={() => { setScreen({ kind: 'home' }); loadHome(); }}><ArrowLeft size={13} weight="bold" /> Studio</button>
      )}
      {tab === 'make' && screen.kind === 'home' && (
        <HomeView cls={cls} data={home} error={homeError} onReady={onReady} onTool={onTool} onOpen={open} onTile={onTile} onPeriod={onPeriod} onLibrary={() => setTab('mine')} />
      )}
      {tab === 'make' && screen.kind === 'setup' && !home && (homeError ? <div className="note err" role="alert">{homeError}</div> : <Skeleton h={420} />)}
      {tab === 'make' && screen.kind === 'setup' && home && (
        <SetupView key={screen.key} cls={cls} subject={subject} home={home} students={students} language={prefs.language} preset={screen.preset}
          onCancel={() => setScreen({ kind: 'home' })}
          onBuilt={(m: Material, s) => {
            toast(`${s.fromBank} from the bank, ${s.written} new and checked${s.flagged ? `, ${s.flagged} need${s.flagged === 1 ? 's' : ''} you` : ''}`);
            setScreen({ kind: 'material', id: m.id });
          }} />
      )}
      {tab === 'make' && screen.kind === 'material' && <Workspace key={screen.id} id={screen.id} students={students} home={home} onBack={() => setScreen({ kind: 'home' })} onToast={toast} />}
      {tab === 'mine' && <LibraryView view="mine" cls={cls} subject={subject} onOpen={open} />}
      {tab === 'department' && <LibraryView view="department" cls={cls} subject={subject} onOpen={open} />}
      {tab === 'ask' && <Copilot embedded start={askStart} onQuestionSet={p => setup({ ...p })} />}
      {toastEl}
    </div>
  );
}
