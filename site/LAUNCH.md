# Website launch checklist (www.sthara.in)

The marketing site is built into the school app: `node site/build.mjs --app` (npm `prebuild` / `predev`) writes
`public/site/`, and `next.config.ts` serves it at `/`, `/about`, `/privacy`, `/dpdp`, `/contact`, `/for/*`,
`/robots.txt` and `/sitemap.xml`. `/login`, `/terms` and every portal are untouched.

Verified 2026-09-25: `next build` passes with `VERCEL_ENV=production`; production server serves every page
(portals still redirect to sign-in, unknown URLs get the branded 404); `npm run test:site` 33/33;
`node site/verify.mjs` passes; enquiry storage checked against the live `enquiries` table.

## Go live

1. Merge and deploy the app as usual (Vercel builds the site on every deploy).
2. In Vercel → Settings → Environment Variables (Production):
   - `POLICIES_APPROVED=true` — until set, marketing pages ship `noindex` and robots.txt blocks everything.
     Setting it opens the marketing pages to search engines; portals, sign-in and APIs stay disallowed.
   - `SITE_URL=https://www.sthara.in` (the default) — canonical URLs, sitemap, Open Graph.
   - `SUPABASE_SERVICE_ROLE_KEY` must be present (it already is for the app) — the enquiry form saves with it.
3. Vercel → Firewall: add a rate-limit rule for `/api/contact` (for example 10 requests per minute per IP).
   The handler's own limit is per server instance only.
4. Redeploy, then send one labelled test enquiry from www.sthara.in/contact and confirm it appears in
   `/ops/enquiries` (operator account). Mark it as spam or closed afterwards.

## Enquiries

Stored in Supabase (`public.enquiries`, Mumbai; service role only) and worked in `/ops/enquiries`.
Optional later, no code change needed — set these and redeploy:
- Cloudflare Turnstile: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (the form then requires the check).
- Email copy to coo@sthara.in via Resend: `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` (verified sender), optional
  `CONTACT_TO_EMAIL`. A stored enquiry still succeeds if the email fails.
- `CONTACT_ALLOWED_ORIGINS` (optional): exact origins; unset means same-site only.
Adding Resend or Cloudflare makes them sub-processors: add them to Privacy §8 when you do.

## The published policies are the target spec

Decision (2026-09-25): the Privacy and DPDP pages are published as written, as the platform's spec, while
the app is in internal testing. These claims are **not yet true of the product** and must be built (or the
wording changed) **before the first real school's data goes in**:

| Policy claim | Where | Gap today |
| --- | --- | --- |
| Wellness check-ins are off until separate guardian consent; no data collected until then | Privacy §3, DPDP "Sensitive features" | Students can check in without consent (the page only shows "consent pending"). Gate check-ins on `consents.wellness_checkin` in the database and UI, plus a per-school on/off setting. |
| Sthara data is hosted in India | Privacy §9, DPDP "Data residency" | Database is in Mumbai (AWS ap-south-1). App servers have no region set, so Vercel runs them in the US by default. Add `"regions": ["bom1"]` to a `vercel.json` (also cuts database latency). |
| Every student account is linked to a guardian record | DPDP §9 | Not enforced; the test school has students with no verified guardian. |
| Administrators can export a full per-student record and action erasure | DPDP obligations table | No per-student export yet; erasure is the hard delete in the directory. |
| Nomination is recorded at the school level | DPDP obligations table | Not built. |
| Audit logs purged on a rolling security window | Privacy §10 | Not built; no retention job. |
| Incident runbook with severity thresholds and a named owner | DPDP obligations table | No runbook in the repo. |
| Consent captured at onboarding against purpose-scoped activities | DPDP obligations table | Parents can now give/withdraw per purpose at `/parent/consent`; onboarding capture itself is not built. |
| WhatsApp Business API and payment gateway as sub-processors | Privacy §8 | Neither is live yet (listed as future sub-processors). |
| Operator named as "Sthara" | Privacy §1 | Add the registered legal entity name and address when available. |

Confirmed true: role-based access enforced in the database; encryption in transit; audit trail; no ads or
trackers; teacher confirms AI marks; Gemini on a paid (billed) API key, so inputs are not used to improve
Google's products; grievance channel coo@sthara.in; pricing (Aadhara ₹2,000, Sthamba ₹2,500, Shikhara
₹3,500, Mandala custom; paid pilot credited 100%); no real names in product screenshots.
