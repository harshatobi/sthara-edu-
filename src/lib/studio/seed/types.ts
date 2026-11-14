import type { Competency, QKind } from '../types';

/** One question from an official CBSE sample paper, with its key and value points from the marking scheme. */
export interface SqpItem {
  /** Question number in the paper; A/B for internal choices, -vi for a separate text-only version. */
  q: string;
  /** Uses CBSE's text-only version for visually impaired candidates (the original relies on a figure). */
  vi?: boolean;
  /** Chapter as named in Sthara's CBSE 2026-27 curriculum. */
  ch: string;
  topic: string;
  comp: Competency;
  type: QKind;
  marks: number;
  text: string;
  options?: string[];
  answer?: number;
  value?: number;
  unit?: string;
  scheme: string;
}

export interface SqpPaper { key: string; cls: string; subject: string; title: string; variant?: string; items: SqpItem[] }
