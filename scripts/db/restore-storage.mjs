// Upload a backup's storage/ folder (<dir>/<bucket>/<path>) into the project in .env.local — see docs/disaster-recovery.md.
// Buckets must exist already (the baseline migration creates them). Existing files at the same path are replaced.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let fileEnv = {};
try {
  fileEnv = Object.fromEntries(
    readFileSync(join(root, '.env.local'), 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"(.*)"$/, '$1')]),
  );
} catch {}
const env = { ...fileEnv, ...process.env };
const src = process.argv[2];
if (!src) throw new Error('usage: restore-storage.mjs <backup storage dir>');

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

let total = 0;
for (const bucket of readdirSync(src).filter((n) => statSync(join(src, n)).isDirectory())) {
  for (const file of walk(join(src, bucket))) {
    const path = relative(join(src, bucket), file).split('\\').join('/');
    const { error } = await db.storage.from(bucket).upload(path, readFileSync(file), { upsert: true });
    if (error) throw new Error(`${bucket}/${path}: ${error.message}`);
    total++;
  }
}
console.log(`storage: ${total} files restored`);
