/**
 * Watches the browser's direct database reads and reports the ones that went wrong to the ops error log.
 *
 * Desks (teacher, admin, student, parent) read the database straight from the browser, not through /api, so the
 * request explorer never sees them. Two failures are otherwise silent:
 *   - a refused request (400 for an id list too long for the URL, 403, 500) that the page shrugs off as "no data";
 *   - a list cut at the database's 1,000-row ceiling, which comes back as a normal answer with rows missing.
 * Both are sent as "[database] ..." errors, which the request explorer lists beside the API traffic.
 */
import { reportClientError } from '@/lib/errors/client';

/** The database answers at most this many rows per request (Supabase "max rows"). */
export const DB_MAX_ROWS = 1000;

/** What went wrong with one database response, or null when nothing did. Pure, for the tests. */
export function dbProblem(
  req: { url: string; method: string },
  res: { status: number; contentRange: string | null; body?: { code?: string; message?: string } | null },
): string | null {
  let u: URL;
  try { u = new URL(req.url); } catch { return null; }
  const m = u.pathname.match(/^\/rest\/v1\/(rpc\/)?([\w-]+)/);
  if (!m) return null;
  const target = (m[1] ? 'rpc ' : '') + m[2];
  const method = req.method.toUpperCase();
  if (res.status >= 400) {
    const code = res.body?.code || '';
    // No row for .single()/.maybeSingle(), and an expired session the auth client renews: both expected.
    if (code === 'PGRST116' || res.status === 401) return null;
    return `[database] ${res.status} on ${target} (${method})${code ? ` ${code}` : ''}: ${(res.body?.message || 'request refused').slice(0, 200)}`;
  }
  if (method !== 'GET' || u.searchParams.has('limit')) return null;
  const r = res.contentRange?.match(/^(\d+)-(\d+)\//);
  if (r && Number(r[2]) - Number(r[1]) + 1 >= DB_MAX_ROWS) {
    return `[database] ${target}: ${DB_MAX_ROWS} rows came back with no limit asked for, so the list was cut short and the rest silently dropped`;
  }
  return null;
}

/** fetch for the browser database client: answers exactly as fetch does, and reports problems on the side. */
export const watchedFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/rest/v1/')) return res;
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    const body = res.ok ? null : await res.clone().json().catch(() => null);
    const problem = dbProblem({ url, method }, { status: res.status, contentRange: res.headers.get('content-range'), body });
    if (problem) reportClientError('client', problem);
  } catch { /* watching must never break a read */ }
  return res;
};
