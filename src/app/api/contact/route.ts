import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createContactHandler, type NodeLikeResponse } from '../../../../site/api/contact.mjs';
import { campaignCode } from '@/lib/ops/revenue';
import { loadTerritories, place } from '@/lib/ops/scope';
import { canonicalState } from '@/lib/ops/territories';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Enquiry form on the marketing site (site/). Reuses the site's own handler
 * (site/api/contact.mjs, covered by site/tests): same-origin check, honeypot,
 * validation, per-instance rate limit. Each enquiry is saved to public.enquiries
 * (Sthara's database) and worked in /ops/enquiries. Cloudflare Turnstile and
 * email via Resend switch on by themselves once their env variables are set
 * (site/.env.example); a saved enquiry succeeds even if that email fails.
 * This file only bridges Next's Request to the handler's Node-style API.
 */
const handler = createContactHandler({
  store: async (fields, { submissionId, origin }) => {
    const db = createAdminClient();
    // Where it sits and where it came from, worked out here so it reaches the right owner at once. If any of this
    // fails (an older database), the enquiry is still saved without it.
    let routing: Record<string, unknown> = {};
    try {
      const state = canonicalState(fields.state);
      const at = state ? place(await loadTerritories(db), state, null) : { territoryId: null, ownerId: null };
      const utm = Object.fromEntries([['source', fields.utmSource], ['medium', fields.utmMedium], ['campaign', fields.utmCampaign]].filter(([, v]) => v));
      const code = campaignCode(fields.utmCampaign);
      const { data: campaign } = code ? await db.from('ops_campaigns').select('id').eq('code', code).maybeSingle() : { data: null };
      routing = { state, territory_id: at.territoryId, owner_id: at.ownerId, source: 'website', utm: Object.keys(utm).length ? utm : null, campaign_id: campaign?.id ?? null };
    } catch { routing = {}; }
    const row = {
      submission_id: submissionId, name: fields.name, email: fields.email.toLowerCase(), school: fields.school,
      role: fields.role, phone: fields.phone || null,
      designation: fields.designation || null, city: fields.city || null,
      student_count: fields.studentCount ? Number(fields.studentCount) : null,
      board: fields.board || null, improvement_goal: fields.improvementGoal || null, message: fields.message, consent: true, source_origin: origin,
    };
    let { error } = await db.from('enquiries').upsert({ ...row, ...routing }, { onConflict: 'submission_id', ignoreDuplicates: true });
    // A database without the routing columns yet: save the enquiry as before rather than lose it.
    if (error?.code === '42703' || error?.code === 'PGRST204') ({ error } = await db.from('enquiries').upsert(row, { onConflict: 'submission_id', ignoreDuplicates: true }));
    if (error) throw new Error('store failed');
  },
});
const MAX_BODY_BYTES = 16 * 1024;

async function run(req: NextRequest) {
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => { headers[key] = value; });
  let body: string | undefined;
  if (req.method === 'POST') {
    // Don't buffer an oversized body; the handler answers 413 from content-length.
    body = Number(headers['content-length'] || 0) > MAX_BODY_BYTES ? '' : await req.text();
  }
  let status = 200;
  let payload = '';
  const out = new Headers();
  const res: NodeLikeResponse = {
    get statusCode() { return status; },
    set statusCode(v: number) { status = v; },
    setHeader: (k, v) => out.set(k, String(v)),
    end: d => { payload = d ?? ''; },
  };
  await handler({ method: req.method, headers, socket: { remoteAddress: undefined }, body }, res);
  return new Response(payload, { status, headers: out });
}

export const GET = run;
export const POST = run;
