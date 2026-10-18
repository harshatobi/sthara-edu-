'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOptionalTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { isScienceSubject } from '@/lib/teacher/copilot';
import type { ScopeEntry } from '@/lib/teacher/scope';
import type { LabScene } from '@/lib/lab/registry';
import type { RunAnswer } from '@/lib/lab/runs';

export interface ClassOption { key: string; cls: string; subject: string }

/** The teacher's science classes (all their classes if none is science): what a demo is saved or presented for. */
export function labClassOptions(scope: ScopeEntry[]): ClassOption[] {
  const sci = scope.filter(e => isScienceSubject(e.subject));
  return (sci.length ? sci : scope).map(e => ({ key: `${e.cls}::${e.subject}`, cls: e.cls, subject: e.subject }));
}

export type RunStatus = 'off' | 'idle' | 'saving' | 'saved' | 'retrying' | 'failed';
const RETRY_MS = 4000;

/**
 * Saves what the class answered in this lesson, in the background, for the
 * class being taught. A failed save retries once (and the next reveal tries
 * again) and never interrupts the lesson. The class is fixed once the first
 * answer is saved: a run belongs to one class.
 */
export function useClassRun(scene: LabScene, from: { class?: string | null; subject?: string | null; demo?: string | null }) {
  const desk = useOptionalTeacherDesk();
  const options = useMemo(() => labClassOptions(desk?.desk?.scope ?? []), [desk?.desk?.scope]);
  // null = not chosen yet: the link's class when the teacher teaches it, or their only class. '' = don't save.
  const [chosen, setChosen] = useState<string | null>(null);
  const fromKey = from.class && from.subject ? options.find(o => o.cls === from.class && o.subject === from.subject)?.key : undefined;
  const key = chosen ?? fromKey ?? (options.length === 1 ? options[0].key : '');
  const target = options.find(o => o.key === key) ?? null;

  const [runId] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState<RunStatus>('idle');
  const [started, setStarted] = useState(false);
  // Each save gets a number; a retry gives up if a newer save has started (it carries everything anyway).
  const seq = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /** Called at every reveal with everything the class has answered so far. */
  const save = useCallback(async (answers: Record<string, RunAnswer>) => {
    if (!desk || !target) return;
    const mine = ++seq.current;
    const body = { id: runId, class: target.cls, subject: target.subject, scene, sceneId: from.demo ?? null, answers };
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, RETRY_MS));
      if (!alive.current || mine !== seq.current) return;
      setStatus('saving');
      try {
        await desk.call('/api/teacher/lab/runs', 'POST', body);
        // The run now exists for this class, whichever save got there.
        setStarted(true);
        if (mine === seq.current) setStatus('saved');
        return;
      } catch {
        if (mine === seq.current) setStatus(attempt ? 'failed' : 'retrying');
      }
    }
  }, [desk, target, runId, scene, from.demo]);

  return {
    options, target, status: !desk || !target ? 'off' as const : status,
    /** The class can be changed only before anything is saved. */
    canChange: !started && options.length > 0,
    choose: (k: string) => { if (!started) setChosen(k); },
    save,
  };
}
