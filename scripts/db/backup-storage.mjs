// Download every file in every storage bucket into <dir>/<bucket>/<path> — used by scripts/db/backup.sh.
// Uses the service role (reads private buckets); env comes from .env.local.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
const out = process.argv[2];
if (!out) throw new Error('usage: backup-storage.mjs <dir>');

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// The storage list API is one folder at a time, 1,000 entries per page.
async function walk(bucket, prefix) {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const e of data) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) files.push(...(await walk(bucket, path)));
      else files.push(path);
    }
    if (data.length < 1000) return files;
  }
}

const { data: buckets, error } = await db.storage.listBuckets();
if (error) throw new Error(error.message);
let total = 0;
for (const b of buckets) {
  for (const path of await walk(b.id, '')) {
    const { data, error: e } = await db.storage.from(b.id).download(path);
    if (e) throw new Error(`${b.id}/${path}: ${e.message}`);
    const dest = join(out, b.id, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
    total++;
  }
}
console.log(`storage: ${total} files from ${buckets.length} buckets`);
