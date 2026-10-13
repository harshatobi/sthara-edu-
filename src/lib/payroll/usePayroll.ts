'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { PayItem, PersonPay, RateRow, RunTotals, SalaryLine, SchoolPay } from './engine';

export interface PayPerson {
  id: string; name: string; employeeCode: string | null; designation: string; category: string; departmentId: string | null; gradeId: string | null;
  employment: string; active: boolean; joinedOn: string | null; exitOn: string | null; pay: PersonPay | null; upcoming: number;
  salary: { id: string; effectiveFrom: string; lines: SalaryLine[]; gross: number; basicDa: number; hra: number; taxable: number; deductions: number; pfWage: number; esiWage: number } | null;
}
export interface PayRun {
  id: string; kind: 'regular' | 'settlement'; month: string; status: 'draft' | 'submitted' | 'approved'; totals: Partial<RunTotals>; warnings: string[];
  staffMemberId: string | null; exitId: string | null; inputs: Record<string, any>; computedAt: string | null; submittedBy: string | null; submittedByName: string | null;
  submittedAt: string | null; approvedByName: string | null; approvedAt: string | null; note: string | null;
}
export interface Loan { id: string; staffMemberId: string; kind: 'advance' | 'loan'; principal: number; issuedOn: string; instalment: number; startMonth: string; status: string; note: string | null; recovered: number }
export interface Template { id: string; name: string; gradeId: string | null; active: boolean; lines: SalaryLine[] }
export interface PayrollData {
  can: { prepare: boolean; approve: boolean; sensitive: boolean }; today: string; month: string; fy: string; settings: SchoolPay; configured: boolean; items: PayItem[];
  templates: Template[]; people: PayPerson[]; runs: PayRun[]; loans: Loan[];
  rates: { key: string; inForce: RateRow | null; sthara: RateRow | null }[]; overrides: RateRow[]; ptStates: string[];
  departments: { id: string; name: string }[]; grades: { id: string; name: string; payMin: number | null; payMax: number | null }[];
  exits: { id: string; staffMemberId: string; kind: string; lastDay: string; status: string }[]; me: string;
}
export type Call = <T = any>(path: string, method: 'GET' | 'POST', body?: unknown) => Promise<T>;

/** Payroll for the signed-in office account: one fetch of everything the pages need, a reload, and an authenticated call. */
export function usePayroll() {
  const { user, loading: authLoading, getAuthToken } = useAuth();
  const [data, setData] = useState<PayrollData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loaded = useRef(false);
  const reload = useCallback(() => setNonce(n => n + 1), []);
  const call = useCallback<Call>(async (path, method, body) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const res = await fetch(path, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || 'Something went wrong. Try again.');
    return json;
  }, [getAuthToken]);
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    call<PayrollData>('/api/admin/payroll', 'GET')
      .then(d => { if (!cancelled) { setData(d); setError(null); loaded.current = true; } })
      .catch(e => { if (!cancelled && !loaded.current) setError(e?.message || 'Could not load payroll.'); });
    return () => { cancelled = true; };
  }, [authLoading, user, call, nonce]);
  return { data, error, reload, call };
}
