/**
 * Where the end-to-end run points and who it signs in as. Read from the process
 * environment, then from e2e.env in this pack (gitignored; copy e2e.env.example).
 * Credentials are only ever read here and handed to the browser; never logged.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnvFile(path.join(QA, 'e2e.env'));

const e = (k: string) => process.env[k]?.trim() || '';

export const BASE_URL = (e('E2E_BASE_URL') || 'http://localhost:3100').replace(/\/$/, '');
/** A local `next dev` of the app: demo sign-in exists, and there is no service key (so no database behind the APIs). */
export const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE_URL);

/** The dedicated test school in the target environment. */
export const SCHOOL_CODE = e('E2E_SCHOOL_CODE');
/**
 * Safety catch: the school name shown after the code is entered must match this, or nothing
 * signs in. Stops a mistyped code from ever running the suite against a real school.
 */
export const SCHOOL_NAME_PATTERN = new RegExp(e('E2E_SCHOOL_NAME_PATTERN') || '\\b(test|qa|uat|sandbox|e2e)\\b', 'i');

export type RoleKey = 'admin' | 'teacher' | 'student' | 'parent' | 'operator' | 'cashier' | 'teacher2';
export interface Account { key: RoleKey; loginRole: 'student' | 'teacher' | 'admin' | 'parent'; home: string; email: string; password: string }

const ACCOUNT_DEFS: { key: RoleKey; loginRole: Account['loginRole']; home: string }[] = [
  { key: 'admin', loginRole: 'admin', home: '/admin' },          // school admin: holds every office permission
  { key: 'teacher', loginRole: 'teacher', home: '/teacher' },    // teaches the test class and is its class teacher
  { key: 'student', loginRole: 'student', home: '/student' },    // on the roll of the teacher's class
  { key: 'parent', loginRole: 'parent', home: '/parent' },       // verified guardian of that student
  { key: 'operator', loginRole: 'admin', home: '/ops' },         // Sthara operator (optional)
  { key: 'cashier', loginRole: 'admin', home: '/admin' },        // office account holding only the Cashier role (optional)
  { key: 'teacher2', loginRole: 'teacher', home: '/teacher' },   // a second teacher, free to take cover (optional)
];

export const ACCOUNTS: Account[] = ACCOUNT_DEFS.flatMap(d => {
  const up = d.key.toUpperCase();
  const email = e(`E2E_${up}_EMAIL`), password = e(`E2E_${up}_PASSWORD`);
  return email && password ? [{ ...d, email, password }] : [];
});
export const account = (k: RoleKey) => ACCOUNTS.find(a => a.key === k);

/** The class the test teacher teaches and the test student is in, e.g. "Class 10-A". */
export const TEST_CLASS = e('E2E_CLASS');

/** Journeys that write records (leave, messages, applicants, registers, homework) run only when this is set. */
export const ALLOW_WRITES = e('E2E_ALLOW_WRITES') === '1';
/** Journeys that call Gemini (and so cost money and count against the school's AI use) run only when this is set. */
export const ALLOW_AI = e('E2E_ALLOW_AI') === '1';

/** One id per run, written into every record a journey creates, so test data is easy to find and clear. */
export const RUN_ID = e('E2E_RUN_ID') || `E2E-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;

export const AUTH_DIR = path.join(QA, '.auth');
export const authFile = (k: RoleKey) => path.join(AUTH_DIR, `${k}.json`);

/** The demo school's code (sample desks). Recognised only in local development; refused everywhere else. */
export const DEMO_CODE = 'SCH-VSN-2026';
/** The live test school (see the test accounts): a real code, looked up in the database. */
export const TEST_SCHOOL_CODE = 'STHTEST';
export const TEST_SCHOOL = 'Sthara Test School';
