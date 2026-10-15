/**
 * The test catalog's shape. Every requirement, system test script (TE.040), integration scenario
 * (TE.050) and defect is data here; tools/build-workbooks.ts turns it into the Oracle AIM workbooks
 * and tools/check-catalog.ts proves the traceability holds (every requirement has a script, every
 * automated-test reference points at a real test).
 */

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';
export type ScriptType = 'Positive' | 'Negative' | 'Boundary' | 'Security' | 'Regression' | 'Usability';

/** Business process areas (the "process" axis of the solution matrix). */
export const PROCESSES = {
  P01: 'Platform and tenancy (Sthara operators)',
  P02: 'Identity, sign-in and access',
  P03: 'Admissions to enrolment',
  P04: 'Fees: billing to collection (order to cash)',
  P05: 'Workforce: staff, leave, attendance and payroll inputs',
  P06: 'Timetabling and the academic calendar',
  P07: 'Cover, duties and fairness',
  P08: 'Teaching: assignments, grading and mastery (TML)',
  P09: 'Student learning: homework, tutor and mastery',
  P10: 'Wellbeing, safeguarding and the situational feed',
  P11: 'Parent engagement and messages',
  P12: 'Leadership insight: dashboard, Probe, Ask the School OS',
  P13: 'Compliance and data protection (DPDP, CBSE filing, audit)',
  P14: 'WhatsApp channel',
  P15: 'Non-functional: security, performance, usability, reliability',
} as const;
export type ProcessId = keyof typeof PROCESSES;

/** One step: [action, expected result] or [action, expected result, test data]. */
export type Step = [string, string] | [string, string, string];

export interface ReqDef {
  n: string;
  process: ProcessId;
  text: string;
  priority: Priority;
  /** Office permission(s) that govern it, if any. */
  perm?: string;
  /** Where it lives: API route(s) and database tables. */
  api?: string;
  tables?: string;
  /**
   * Automated tests that cover it: "owner:path::test name" (owner app = the app's own tests,
   * qa = this pack). A leading "~" in the name matches as a prefix.
   */
  auto?: string[];
  /** Fit, Fit with note (works, with a limitation), Gap (not built). */
  fit?: 'Fit' | 'Fit with note' | 'Gap';
  note?: string;
}

export interface ScriptDef {
  n: string;
  title: string;
  role: string;
  perm?: string;
  priority: Priority;
  type: ScriptType;
  /** Requirement numbers in this module ("01") or full ids ("REQ-FEE-01"). */
  req: string[];
  pre: string;
  data?: string;
  steps: Step[];
  /** Include in the UAT (TE.130) pack. */
  uat?: boolean;
  /** Automated test(s) that execute this script, same format as ReqDef.auto. */
  auto?: string[];
}

export interface ModuleDef {
  code: string;
  name: string;
  /** Where a tester finds it: "Admin › Admissions & Fees". */
  nav: string;
  portal: 'Sign-in' | 'Platform Manager' | 'Admin' | 'Teacher' | 'Student' | 'Parent' | 'WhatsApp' | 'Cross-cutting';
  reqs: ReqDef[];
  scripts: ScriptDef[];
}

export interface SitStep { role: string; action: string; expected: string; data?: string; ref?: string }
export interface Scenario {
  id: string;
  title: string;
  processes: ProcessId[];
  roles: string[];
  priority: Priority;
  objective: string;
  pre: string;
  data: string;
  req: string[];
  steps: SitStep[];
  /** Automated journey covering the core of it. */
  auto?: string[];
}

export interface Defect {
  id: string;
  kind: 'Defect' | 'Observation' | 'Risk' | 'Test debt';
  severity: 'S1 Critical' | 'S2 High' | 'S3 Medium' | 'S4 Low';
  area: string;
  title: string;
  detail: string;
  evidence: string;
  impact: string;
  suggestion: string;
  status: 'Open' | 'To verify' | 'Accepted (by design)' | 'Fixed';
  foundIn: string;
  req?: string[];
  auto?: string[];
  /** What fixed it, once status is Fixed. */
  fix?: string;
}

export function mod(code: string, name: string, portal: ModuleDef['portal'], nav: string, body: { reqs: ReqDef[]; scripts: ScriptDef[] }): ModuleDef {
  return { code, name, portal, nav, ...body };
}
