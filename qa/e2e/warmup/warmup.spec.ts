/**
 * Local only: `next dev` compiles each page the first time it is opened, which can take longer
 * than a test's timeout on a busy machine. This opens every page once, in order, with generous
 * timeouts and no assertions, so the demo checks that follow measure the app and not the compiler.
 */
import { test } from '@playwright/test';
import { navigation } from '../../tools/inventory';
import { IS_LOCAL } from '../support/env';

test.skip(!IS_LOCAL, 'Only a local next dev server needs warming.');
test.setTimeout(30 * 60_000);

test('compile every page once', async ({ page, context, baseURL }) => {
  // A Turbopack compile occasionally stalls under load until another request arrives, so each page
  // gets two minutes, anything that times out is left for a second pass, and nothing here fails.
  const visit = (href: string) => page.goto(href, { waitUntil: 'domcontentloaded', timeout: 120_000 }).then(() => true, () => false);
  await visit('/login');
  const missed: [string, string][] = [];
  for (const pass of [1, 2]) {
    const todo = pass === 1
      ? ['student', 'teacher', 'admin', 'parent'].flatMap(p => navigation().filter(n => n.portal === p).map(n => [p, n.href] as [string, string]))
      : missed.splice(0);
    for (const [portal, href] of todo) {
      await context.clearCookies();
      await context.addCookies([{ name: '__role', value: portal, url: baseURL! }]);
      if (!(await visit(href))) missed.push([portal, href]);
    }
  }
  if (missed.length) test.info().annotations.push({ type: 'slow to compile', description: missed.map(m => m[1]).join(', ') });
});
