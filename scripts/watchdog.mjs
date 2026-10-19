#!/usr/bin/env node
// Outage watchdog. Runs from GitHub Actions (.github/workflows/watchdog.yml),
// outside Vercel and Supabase, so it still reports when the app, the database
// or the ops platform is down.
//
// Each run probes /api/health. While it fails, one Jira issue stays open
// (found by label); once it passes again, that issue gets a recovery comment
// and is moved to Done. No dependencies: plain Node 24 fetch.
//
// The repo is public, so Actions logs are public: this script logs only the
// verdict. Error details go into the Jira issue.
//
// Env:
//   HEALTH_URL        default https://www.sthara.in/api/health
//   JIRA_BASE_URL     e.g. https://stharaedutech.atlassian.net
//   JIRA_EMAIL        Atlassian account the API token belongs to
//   JIRA_API_TOKEN    https://id.atlassian.com/manage-profile/security/api-tokens
//   JIRA_PROJECT_KEY  default CPB
//   JIRA_ISSUE_TYPE   default Bug
//   DRY_RUN=1         probe and decide, but make no Jira writes

const HEALTH_URL = process.env.HEALTH_URL || 'https://www.sthara.in/api/health';
const PROJECT = process.env.JIRA_PROJECT_KEY || 'CPB';
const ISSUE_TYPE = process.env.JIRA_ISSUE_TYPE || 'Bug';
const DRY_RUN = process.env.DRY_RUN === '1';
const LABEL = 'sthara-watchdog';

const ATTEMPTS = 3;
const TIMEOUT_MS = 15_000;
const RETRY_GAP_MS = 20_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One probe. Returns { ok, kind, detail }. */
async function probeOnce() {
  const started = Date.now();
  try {
    const res = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'sthara-watchdog' },
      cache: 'no-store',
    });
    const ms = Date.now() - started;
    let body = null;
    try {
      body = await res.json();
    } catch {
      // A non-JSON body (Vercel error page, etc.) is itself a signal.
    }
    if (res.ok && body?.status === 'ok') return { ok: true, kind: 'ok', detail: `HTTP ${res.status} in ${ms}ms` };
    if (body?.database === 'unreachable') {
      return { ok: false, kind: 'database', detail: `HTTP ${res.status}: database unreachable (${body.databaseError || 'no message'})` };
    }
    return { ok: false, kind: 'app', detail: `HTTP ${res.status}${body ? `: ${JSON.stringify(body).slice(0, 300)}` : ' with a non-JSON body'}` };
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError';
    return {
      ok: false,
      kind: 'unreachable',
      detail: timedOut ? `no response within ${TIMEOUT_MS / 1000}s` : `request failed: ${err?.cause?.code || err?.message || err}`,
    };
  }
}

/** Fails only if every attempt fails, so a single blip opens nothing. */
async function probe() {
  const attempts = [];
  for (let i = 0; i < ATTEMPTS; i++) {
    const r = await probeOnce();
    attempts.push(r);
    if (r.ok) return { ok: true, attempts };
    if (i < ATTEMPTS - 1) await sleep(RETRY_GAP_MS);
  }
  return { ok: false, kind: attempts.at(-1).kind, attempts };
}

const KIND_TITLE = {
  database: 'Database unreachable',
  app: 'App returning errors',
  unreachable: 'Site not responding',
};

// ---- Jira -------------------------------------------------------------------

function jiraConfig() {
  const base = process.env.JIRA_BASE_URL?.replace(/\/$/, '');
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) throw new Error('JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN must be set');
  return { base, auth: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64') };
}

async function jira(method, path, body) {
  const { base, auth } = jiraConfig();
  const res = await fetch(base + path, {
    method,
    signal: AbortSignal.timeout(20_000),
    headers: { authorization: auth, accept: 'application/json', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Jira ${method} ${path} -> ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/** Atlassian Document Format from plain paragraphs. */
const adf = (...paragraphs) => ({
  type: 'doc',
  version: 1,
  content: paragraphs.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })),
});

async function findOpenIssue() {
  const res = await jira('POST', '/rest/api/3/search/jql', {
    jql: `project = "${PROJECT}" AND labels = "${LABEL}" AND statusCategory != Done ORDER BY created DESC`,
    fields: ['summary', 'created', 'labels'],
    maxResults: 1,
  });
  return res.issues?.[0] || null;
}

function attemptLines(attempts) {
  return attempts.map((a, i) => `Attempt ${i + 1}: ${a.detail}`);
}

async function openIssue(result) {
  const now = new Date().toISOString();
  const fields = {
    project: { key: PROJECT },
    issuetype: { name: ISSUE_TYPE },
    summary: `[Outage] ${KIND_TITLE[result.kind]}: ${new URL(HEALTH_URL).host}`,
    labels: [LABEL, `outage-${result.kind}`],
    description: adf(
      `The watchdog found ${HEALTH_URL} failing at ${now} (${ATTEMPTS} attempts, ${RETRY_GAP_MS / 1000}s apart).`,
      ...attemptLines(result.attempts),
      'This issue closes itself when the health check passes again. Where to look first: Vercel deployments and logs, then Supabase project status (paused, over quota, or an incident at status.supabase.com).',
    ),
  };
  try {
    return await jira('POST', '/rest/api/3/issue', { fields: { ...fields, priority: { name: 'Highest' } } });
  } catch (err) {
    // Priority isn't on every project's create screen; retry without it.
    if (err.status !== 400) throw err;
    return jira('POST', '/rest/api/3/issue', { fields });
  }
}

async function noteOngoing(issue, result) {
  // Comment only when the kind of failure changes (say the app recovers but
  // the database is still down), so a long outage isn't a comment every run.
  const tag = `outage-${result.kind}`;
  if (issue.fields.labels?.includes(tag)) return false;
  await jira('POST', `/rest/api/3/issue/${issue.key}/comment`, {
    body: adf(`Failure changed at ${new Date().toISOString()}: ${KIND_TITLE[result.kind]}.`, ...attemptLines(result.attempts)),
  });
  await jira('PUT', `/rest/api/3/issue/${issue.key}`, { update: { labels: [{ add: tag }] } });
  return true;
}

async function closeIssue(issue, result) {
  const downMin = Math.round((Date.now() - new Date(issue.fields.created).getTime()) / 60_000);
  await jira('POST', `/rest/api/3/issue/${issue.key}/comment`, {
    body: adf(
      `Recovered at ${new Date().toISOString()} (about ${downMin} min after this issue opened). ${result.attempts.at(-1).detail}.`,
      'Closed by the watchdog. Reopen if the cause still needs a fix.',
    ),
  });
  const { transitions } = await jira('GET', `/rest/api/3/issue/${issue.key}/transitions`);
  const done = transitions.find((t) => t.to?.statusCategory?.key === 'done');
  if (!done) return false;
  await jira('POST', `/rest/api/3/issue/${issue.key}/transitions`, { transition: { id: done.id } });
  return true;
}

// ---- main -------------------------------------------------------------------

async function main() {
  const result = await probe();
  console.log(result.ok ? 'health: ok' : `health: FAILING (${result.kind})`);

  if (DRY_RUN) {
    for (const line of attemptLines(result.attempts)) console.log('  ' + line);
    console.log('dry run: no Jira writes');
    return;
  }

  const open = await findOpenIssue();

  if (!result.ok) {
    if (!open) {
      const created = await openIssue(result);
      console.log(`jira: opened ${created.key}`);
    } else {
      const changed = await noteOngoing(open, result);
      console.log(`jira: ${open.key} already open${changed ? ', noted the new failure kind' : ''}`);
    }
    return;
  }

  if (open) {
    const moved = await closeIssue(open, result);
    console.log(`jira: ${open.key} ${moved ? 'closed' : 'commented (no Done transition found)'}`);
  }
}

main().catch((err) => {
  // Reaching Jira failed. Exit non-zero so the Actions run fails and GitHub
  // emails about it: the backstop when Jira is the thing that's down.
  console.error(`watchdog error: ${err.message}`);
  process.exit(1);
});
