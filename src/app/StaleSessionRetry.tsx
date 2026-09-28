'use client';

import { useEffect } from 'react';

/** Seconds-since-epoch expiry of the access token in the __session cookie, or null. */
function cookieTokenExp(): number | null {
  const m = document.cookie.match(/(?:^|; )__session=([^;]*)/);
  const part = m?.[1]?.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch { return null; }
}

/**
 * Server-rendered gates (the operator console) read the access token from the
 * __session cookie, which outlives the 1-hour token itself; the browser only
 * refreshes it once the app is running. So a page gated that way 404s when
 * opened after a long gap. When a 404 was rendered from an expired cookie,
 * wait for the app to write a fresh token and reload once. It runs on every
 * 404, so it says nothing about which routes exist.
 */
export default function StaleSessionRetry() {
  useEffect(() => {
    const exp = cookieTokenExp();
    if (!exp || exp * 1000 > Date.now()) return;
    const key = `stale-retry:${location.pathname}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { return; }
    const started = Date.now();
    const timer = setInterval(() => {
      const next = cookieTokenExp();
      if (next && next * 1000 > Date.now()) { clearInterval(timer); location.reload(); }
      else if (Date.now() - started > 10_000) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, []);
  return null;
}
