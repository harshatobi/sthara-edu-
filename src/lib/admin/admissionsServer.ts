import 'server-only';
import { NextResponse } from 'next/server';

/**
 * The admissions database functions (admission_move, admission_offer_*) raise plain-English messages with a
 * code saying what kind of problem it is; this turns one into the route's answer.
 */
const STATUS: Record<string, number> = {
  P0002: 404, // not found
  '40001': 409, // someone else changed it first
  '23505': 409, // already exists
  '42501': 409, // maker-checker: the proposer can't approve
  '22023': 400, // not allowed from here
};

export function admissionError(error: { code?: string; message?: string } | null, fallback: string): NextResponse {
  const status = (error?.code && STATUS[error.code]) || 500;
  if (status === 500) console.error('[admissions]', error?.code, error?.message);
  return NextResponse.json({ error: status === 500 ? fallback : error?.message || fallback }, { status });
}
