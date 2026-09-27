// Bundles the browser Web Workers into public/workers/ (run before dev and build).
// Turbopack copies `new Worker(new URL(...))` targets as raw files instead of bundling them, so the workers are
// built here with esbuild into plain scripts the page loads by URL.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const workers = [{ entry: 'src/lib/schedule/solver.worker.ts', out: 'public/workers/solver.js' }];

for (const w of workers) {
  await build({
    entryPoints: [`${root}${w.entry}`], outfile: `${root}${w.out}`,
    bundle: true, format: 'iife', platform: 'browser', target: 'es2019', minify: true, legalComments: 'none', logLevel: 'warning',
  });
}
console.log(`workers: built ${workers.map(w => w.out).join(', ')}`);
