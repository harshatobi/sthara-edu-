'use client';

import { useMemo, useState } from 'react';
import { CaretLeftIcon as CaretLeft } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon as CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight';

/** Rows per page in every long list: past this a list pages instead of growing (or being cut). */
export const PAGE_ROWS = 200;

/** Which slice of `total` rows page `page` shows, with the page clamped into range. Pure, for the tests. */
export function pageWindow(total: number, page: number, size = PAGE_ROWS) {
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(0, Math.floor(page) || 0), pages - 1);
  return { page: p, pages, from: p * size, to: Math.min(total, (p + 1) * size) };
}

/**
 * The page number, back to the first page whenever `resetKey` changes (a new filter or search). Derived during
 * render rather than reset in an effect, so the old page never flashes with the new filter.
 */
export function usePageNumber(resetKey: unknown = null): [number, (p: number) => void] {
  const [st, setSt] = useState<{ key: unknown; page: number }>({ key: resetKey, page: 0 });
  const page = Object.is(st.key, resetKey) ? st.page : 0;
  return [page, (p: number) => setSt({ key: resetKey, page: p })];
}

/**
 * One page of an already-loaded list. Goes back to the first page when `resetKey` changes (a new filter or
 * search), and stays in range when the list shrinks under it.
 */
export function usePaged<T>(rows: readonly T[], resetKey: unknown = null, size = PAGE_ROWS) {
  const [page, setPage] = usePageNumber(resetKey);
  const w = pageWindow(rows.length, page, size);
  const shown = useMemo(() => rows.slice(w.from, w.to), [rows, w.from, w.to]);
  return { shown, pager: { page: w.page, pages: w.pages, from: w.from, to: w.to, total: rows.length, setPage } };
}

export type PagerState = ReturnType<typeof usePaged>['pager'];

/**
 * "Showing 201–400 of 1,000" with Previous and Next. Says how many rows there are even on one page, so a list
 * never ends without saying whether that was all of it. `total: null` = the count is not known (server paging
 * that only knows whether there is more).
 */
export function Pager({ page, pages, from, to, total, setPage, noun = 'rows', more }: {
  page: number; pages: number; from: number; to: number; total: number | null; setPage: (p: number) => void; noun?: string; more?: boolean;
}) {
  const hasNext = total === null ? !!more : page < pages - 1;
  if (total !== null ? total <= 0 : to <= from) return null;
  const n = (x: number) => x.toLocaleString('en-IN');
  return (
    <nav className="acts no-print" aria-label="Pages" style={{ justifyContent: 'space-between', padding: '12px 2px 2px', fontSize: 13 }}>
      <span className="muted" aria-live="polite">
        {total === null ? `Showing ${n(from + 1)}–${n(to)}` : `Showing ${n(from + 1)}–${n(to)} of ${n(total)} ${noun}`}
      </span>
      {(page > 0 || hasNext) && (
        <span className="acts" style={{ gap: 8 }}>
          <button type="button" className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}><CaretLeft size={14} weight="bold" /> Previous</button>
          {total !== null && <span className="muted">Page {page + 1} of {pages}</span>}
          <button type="button" className="btn sm" disabled={!hasNext} onClick={() => setPage(page + 1)}>Next <CaretRight size={14} weight="bold" /></button>
        </span>
      )}
    </nav>
  );
}
