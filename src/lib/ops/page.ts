import 'server-only';

/**
 * Every row of a query, fetched a page at a time.
 *
 * The database API returns at most 1,000 rows per request whatever limit is asked for, and says nothing when it
 * cuts a result short. Anything that may grow past that (a school's roster, a week of AI calls, the open cases)
 * goes through here. `build` must give a stable order. Stops at `max` rows, and reports whether it did.
 */
const PAGE = 1000;

export async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
  max = 20_000,
): Promise<{ data: T[]; error: { message: string; code?: string } | null; capped: boolean }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await build(from, Math.min(from + PAGE, max) - 1);
    if (error) return { data: out, error, capped: false };
    out.push(...(data || []));
    if (!data || data.length < PAGE) return { data: out, error: null, capped: false };
  }
  return { data: out, error: null, capped: true };
}

/** The rows matching a long list of ids, asked for 150 ids at a time (a thousand do not fit in one request). */
export async function byIds<T>(
  ids: string[],
  build: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const r = await pageAll<T>((from, to) => build(chunk, from, to));
    if (r.error) return { data: out, error: r.error };
    out.push(...r.data);
  }
  return { data: out, error: null };
}
