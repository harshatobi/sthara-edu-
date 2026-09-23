import type { Question } from '@/lib/teacher/questions';

/** Copilot → composer hand-off. Per-viewer, short-lived, so sessionStorage is the right place. */
const KEY = 'sthara.copilot.seed';
export interface CopilotSeed { title?: string; description?: string; questions?: Question[] }

export function writeCopilotSeed(seed: CopilotSeed) {
  try { sessionStorage.setItem(KEY, JSON.stringify(seed)); return true; } catch { return false; }
}

export function readCopilotSeed(): CopilotSeed | null {
  if (typeof window === 'undefined') return null;
  try { const raw = sessionStorage.getItem(KEY); return raw ? JSON.parse(raw) as CopilotSeed : null; } catch { return null; }
}
