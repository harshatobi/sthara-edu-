'use client';

import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ReadyItem, WeekDay } from '@/lib/studio/home';
import type { QuestionSetContent } from '@/lib/studio/types';

/** Reads and writes for the Studio, with the signed-in teacher's token. Errors come back as plain sentences. */
export function useStudioApi() {
  const { getAuthToken } = useAuth();
  const req = useCallback(async <T = any>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' = 'GET', body?: unknown): Promise<T> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const res = await fetch(path, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
    return data as T;
  }, [getAuthToken]);
  return req;
}

export interface HomeData {
  tiles: {
    mastery: number | null; lowest: { chapter: string; score: number } | null; needSupport: { id: string; name: string }[]; students: number;
    pace: number | null; chaptersStarted: number; chapters: number; nextTest: { title: string; on: string } | null;
  };
  ready: ReadyItem[];
  week: WeekDay[];
  hasTimetable: boolean;
  recent: { id: string; title: string; kind: string; status: string; updated_at: string; assignment_ids: string[] }[];
  school: { name: string };
  lessons: { id: string; date: string; period: number | null; title: string; chapter: string }[];
  chapters: { name: string; seq: number; topics: string[] }[];
}

export interface Material {
  id: string; teacher_id: string; class: string; subject: string; chapter_key: string | null; chapter_name: string | null;
  kind: string; title: string; content: QuestionSetContent | Record<string, unknown>; language: string;
  status: 'draft' | 'ready' | 'assigned' | 'archived'; share: 'private' | 'department'; common_test: boolean;
  moderation: 'none' | 'pending' | 'approved' | 'changes_requested'; review_note: string | null;
  assignment_ids: string[]; lesson_plan_id: string | null; version: number; updated_at: string;
}

/** What the Setup panel opens with: from a "Ready for you" item, a tile, or a tool. */
export interface SetupPreset {
  setKind?: string; chapter?: string; audience?: string; students?: string[]; lessonId?: string; basis?: string; topics?: string[];
}
