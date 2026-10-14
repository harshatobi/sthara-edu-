import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P15', priority: 'Critical', text: 'Every API route refuses callers without a valid session (401), operator routes answer 404, and machine endpoints need their secret; no route leaks a stack trace or key; each handler passes its gate before touching the database.', auto: [`~${A.gates}`, `${A.guards}no API route is without a recognised gate`, `${A.guards}every handler passes its gate before it touches the database`] },
  { n: '02', process: 'P15', priority: 'Critical', text: 'Tenant isolation: roles, schools and teaching scope come from the database, never from the request; nobody reads or writes another school’s records.', auto: [`${A.access}a school admin cannot read another school’s directory`, `${A.guards}signed-in routes under /api/admin check the caller’s school and role themselves`] },
  { n: '03', process: 'P15', priority: 'High', text: 'The marketing site is served with CSP, frame-ancestors none, nosniff, a strict referrer policy and no camera/microphone/geolocation.', auto: [`${A.routing}the marketing site is served with its security headers`] },
  { n: '04', process: 'P15', priority: 'High', text: 'Rate limits per user or address on every costly or sensitive route (signed-off table), answering 429 with a message.', auto: [`${A.limits}rate limits are the signed-off values (requests per window)`, `${A.limits}the limiter allows the limit, refuses the next, and opens a new window after it`], fit: 'Fit with note', note: 'OBS-008: the limiter is in memory per server instance, so limits are approximate across Vercel instances.' },
  { n: '05', process: 'P15', priority: 'High', text: 'Every page of every portal opens without a crash or failure screen, and no API call behind it fails, for each signed-in role.', auto: [`~${A.portals}`, `~${A.demo}`] },
  { n: '06', process: 'P15', priority: 'Medium', text: 'Works on a phone: no sideways scrolling, 16px inputs, the compact tab bar with More.', auto: [`${A.mobile}sign-in fits a phone screen at every step`] },
  { n: '07', process: 'P15', priority: 'Medium', text: 'Session tokens are kept where page scripts cannot read them.', fit: 'Gap', note: 'OBS-004: __session holds the access token in a cookie scripts can read (not HttpOnly).' },
  { n: '08', process: 'P13', priority: 'High', text: 'Data stays in India (Supabase ap-south-1); personal data is scrubbed from logs.', auto: [`${A.errors}scrub: tokens, emails, phone numbers and passwords never reach the log`], fit: 'Fit with note', note: 'OBS-009: pages load fonts from Google (fonts.googleapis.com), an outside request on every visit.' },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'API gate sweep (automated)', role: 'QA engineer', priority: 'Critical', type: 'Security', req: ['01'], auto: [`~${A.gates}`, `~${A.guards}`],
    pre: 'sthara-qa installed.',
    steps: [
      ['Run: npm run e2e:local -- --project=api (or against production with E2E_BASE_URL).', 'Every route and method refuses: 401, 404 for operator routes, 401/403 for machine endpoints; none leaks a trace.'],
      ['Run: npm run unit.', '"every handler passes its gate before it touches the database" passes.'],
    ] },
  { n: '02', title: 'Every page for every role (automated, read-only)', role: 'QA engineer', priority: 'High', type: 'Regression', req: ['05'], auto: [`~${A.portals}`],
    pre: 'e2e.env with the test school’s accounts.',
    steps: [
      ['Run: npm run e2e:prod.', 'Each role signs in; every page of its portal opens with no failure screen and no 5xx.'],
      ['Open the report (npm run report).', 'Screenshots and traces for any failure.'],
    ] },
  { n: '03', title: 'Phone and tablet', role: 'Tester', priority: 'Medium', type: 'Usability', req: ['06'],
    pre: 'An Android phone (Chrome) and an iPhone (Safari).',
    steps: [
      ['Sign in as each role.', 'No sideways scrolling; typing doesn’t zoom the page.'],
      ['Use the bottom tab bar and More.', 'Every menu item is reachable; Sign out is under More.'],
      ['Rotate to landscape.', 'Still usable.'],
    ] },
  { n: '04', title: 'Speed on a school network', role: 'Tester', priority: 'Medium', type: 'Usability', req: ['05'],
    pre: 'A school’s own Wi-Fi or a 4G phone.',
    steps: [
      ['Time sign-in to dashboard for each role.', 'Under 5 seconds.'],
      ['Open each menu page.', 'Content within 3 seconds; skeletons while loading, never a blank page.'],
    ] },
];
