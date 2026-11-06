// Connects one school to Sthara Pay: makes its institution, its book and its key there, and seals them here.
//
//   STHARA_PAY_URL=... PAY_ADMIN_KEY=... PAY_CONNECTION_KEY=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     PUBLIC_APP_URL=https://www.sthara.in npx tsx scripts/connect-pay-school.ts <school id> [test|live]
//
// The school's finance head then connects its own gateway account in the Pay console.
import { createClient } from '@supabase/supabase-js';
import { seal } from '../src/lib/pay/book';

const need = (k: string) => { const v = process.env[k]?.trim(); if (!v) throw new Error(`${k} is required`); return v; };
const [schoolId, mode = 'test'] = process.argv.slice(2);
if (!schoolId || !['test', 'live'].includes(mode)) throw new Error('Usage: connect-pay-school.ts <school id> [test|live]');
const PAY = need('STHARA_PAY_URL').replace(/\/$/, ''), ADMIN = need('PAY_ADMIN_KEY'), KEY = need('PAY_CONNECTION_KEY'), APP = need('PUBLIC_APP_URL').replace(/\/$/, '');
const db = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const op = async (path: string, body: unknown) => {
  const r = await fetch(`${PAY}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<any>;
};
const { data: school, error } = await db.from('schools').select('id, name').eq('id', schoolId).single();
if (error || !school) throw new Error('School not found.');
const { data: existing } = await db.from('pay_connections').select('school_id').eq('school_id', schoolId).maybeSingle();
if (existing) throw new Error('This school is already connected.');
const inst = await op('/admin/institutions', { name: school.name });
const client = await op('/admin/clients', { name: `School OS: ${school.name}`.slice(0, 80), institutionIds: [inst.id] });
const book = await op(`/admin/institutions/${inst.id}/books`, { label: 'School OS fee ledger', endpointUrl: `${APP}/api/pay/book/${schoolId}` });
const { error: e2 } = await db.from('pay_connections').insert({
  school_id: schoolId, institution_id: inst.id, book_id: book.id, mode,
  api_key_enc: seal(client.apiKey, schoolId, KEY), signing_secret_enc: seal(book.signingSecret, schoolId, KEY),
});
if (e2) throw new Error(e2.message);
console.log(`Connected ${school.name}. Pay institution ${inst.id}, book ${book.id}, ${mode} mode.`);
