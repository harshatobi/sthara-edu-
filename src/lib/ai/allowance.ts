/**
 * The per-student AI cost cap (Moses, 2026-11-06): AI cost per student per
 * year must never pass 50% of the price the school pays per student. 50% is
 * the ceiling, not a target; typical use is designed to cost 25% or less.
 *
 * Counted over the school's academic session: everything attributable to the
 * student (their own calls, AI grading of their work, their parents' Ask) plus
 * an equal share of the school's other AI (teachers, office).
 *
 *   under 70% of the allowance   normal
 *   70% to 100%                  economy: Sonnet work runs on Haiku (Gemini: Flash-Lite)
 *   100% and over                paused: optional student AI (new tutor sessions,
 *                                self-quizzes) stops until the next academic session.
 *                                Grading of teacher-set work never stops.
 *
 * Price: the school's contracted price per student, else the tier's list price.
 * A pilot or custom deal with no price set uses the lowest list price, so the
 * cap errs on the cautious side.
 */
import { PLAN_INFO } from '@/lib/settings/registry';
import { USD_TO_INR } from './pricing';

export const CAP_SHARE = 0.5;
export const DESIGN_SHARE = 0.25;
export const ECONOMY_AT = 0.7;

export type AllowanceLevel = 'normal' | 'economy' | 'paused';

export interface Allowance {
  priceInr: number;
  capInr: number;
  spentInr: number;
  /** Spent as a share of the cap (1 = at the cap). */
  used: number;
  level: AllowanceLevel;
}

export function lowestListPrice(): number {
  return Math.min(...Object.values(PLAN_INFO).map(p => p.price).filter((p): p is number => typeof p === 'number'));
}

export function allowanceFrom(priceInr: number | null, spentUsd: number, usdToInr = USD_TO_INR): Allowance {
  const price = priceInr && priceInr > 0 ? priceInr : lowestListPrice();
  const capInr = price * CAP_SHARE;
  const spentInr = Math.max(0, spentUsd) * usdToInr;
  const used = capInr > 0 ? spentInr / capInr : 1;
  return {
    priceInr: price,
    capInr: Math.round(capInr * 100) / 100,
    spentInr: Math.round(spentInr * 100) / 100,
    used: Math.round(used * 1000) / 1000,
    level: used >= 1 ? 'paused' : used >= ECONOMY_AT ? 'economy' : 'normal',
  };
}

export const PAUSED_REPLY = 'You have used this year’s AI tutor allowance, so new sessions are paused until the next academic session. Your past sessions and scores are all still here, and your teachers can still mark your work.';
