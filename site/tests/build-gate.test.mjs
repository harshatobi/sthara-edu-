import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const vars of [
  { SITE_ENV: 'production' },
  { VERCEL_ENV: 'production' },
  { SITE_ENV: 'preview', VERCEL_ENV: 'production' },
]) {
  test(`production approval gate: ${JSON.stringify(vars)}`, () => {
    const env = { ...process.env, SITE_ENV: 'preview', VERCEL_ENV: 'preview', POLICIES_APPROVED: 'false', APP_ROUTING_CONFIRMED: 'false', ...vars };
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../build.mjs', import.meta.url))], { env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Production is gated/);
  });
}
