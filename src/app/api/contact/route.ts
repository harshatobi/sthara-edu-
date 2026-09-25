import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createContactHandler, type NodeLikeResponse } from '../../../../site/api/contact.mjs';

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
    const { error } = await createAdminClient().from('enquiries').upsert({
      submission_id: submissionId, name: fields.name, email: fields.email.toLowerCase(), school: fields.school,
      role: fields.role, phone: fields.phone || null, message: fields.message, consent: true, source_origin: origin,
    }, { onConflict: 'submission_id', ignoreDuplicates: true });
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
