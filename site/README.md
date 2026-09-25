# Sthara launch preview

An isolated, Vercel-compatible marketing package. The original `sthara-astra` project, self-contained Astra exports, Claude copy and actual school app were not changed. No deployment or real email was sent.

## Included

- The approved glass pillar and original three tilted elliptical paths, with quieter particles and all four role colours.
- Existing homepage, TML interactions, pricing and four role pages preserved.
- About / leadership, full Privacy and DPDP pages from the user-supplied `sthara_site_v2.html`; Contact from Sthara's published website. See `source/CONTENT_AUDIT.md` for provenance. The supplied file supersedes the truncated live-source policy snapshot.
- Clean page URLs, direct page loads, metadata, mobile navigation, light/dark themes and a 404 page.
- Enquiry form and Vercel API, default recipient **coo@sthara.in**, server validation, consent and Turnstile protection. Offline tests mock external providers.

## Run locally

Requires Node 24. No package installation is needed.

```sh
npm run build
npm test
npm run verify
npm run export
npm run dev
```

Open http://127.0.0.1:4180. This preview server also executes the enquiry endpoint. With no provider configuration, the form safely reports unavailable; it does not pretend to send or retain enquiries. `node --env-file=.env.local preview.mjs` can load local credentials if you configure them yourself. Never add credentials to source control.

## Vercel handoff — deploy this folder, not just dist

1. Use this **entire folder** as the project root. Framework preset: Other. Build: `npm run build`. Output: `dist`. Node: 24.x. The included `vercel.json` sets routes, security headers and the API duration. No CLI deployment has been made.
2. Use a **Preview deployment** while the items below remain open. Preview output is `noindex,nofollow`; this is not access control. Enable Vercel Deployment Protection if access must be restricted.
3. Configure email and anti-spam variables from `.env.example` using `FORM_SETUP.md`. This implementation uses Resend and Cloudflare Turnstile; neither has been provisioned or assumed to be configured. Sender-domain verification is required. Configure the exact preview origin in `CONTACT_ALLOWED_ORIGINS` and Turnstile hostname settings.
4. Review the full imported Privacy and DPDP wording in `company-pages.mjs` for current operating accuracy before approving publication. The supplied HTML contains all 14 Privacy and 8 DPDP sections, resolving the earlier truncated-source gap. This import is not independent legal approval. Confirm that the policy reflects the actual enquiry providers and processing, including Vercel, Resend and Cloudflare Turnstile.
5. Confirm hosting for the existing school application. Its current sign-in URL is `https://www.sthara.in/login`. **Do not replace the existing app deployment with this standalone marketing package:** that could remove `/login` and other app routes. Keep this in a separate preview project until the existing repository/routing is provided. `SCHOOL_APP_URL` only changes links; it does not host, migrate or proxy the application. Preserve its existing routes or set a confirmed separate app URL before domain cutover.
6. After those checks, set `POLICIES_APPROVED=true`, `APP_ROUTING_CONFIRMED=true`, `SITE_ENV=production`, and the final HTTPS `SITE_URL`. Both `SITE_ENV=production` and Vercel's `VERCEL_ENV=production` activate the launch gate; a normal production deployment will deliberately fail until the approvals are configured.
7. Submit a labelled test enquiry after configuring your preview; confirm provider acceptance **and inbox arrival at coo@sthara.in**. Confirm Reply-To, mobile form behaviour, failures and spam controls. Configure a managed rate limit for `/api/contact` before public campaign traffic. Follow the full checklist in `FORM_SETUP.md`.

## Content / privacy checks before public release

- The product captures are the user-supplied design/demo screens and remain labelled as examples. Confirm permission and anonymisation for every capture; this build does not independently establish that the displayed names are fictional.
- Pricing and company statements are retained as published/supplied, not independently certified. Confirm current amounts and commercial terms before launch.
- Legal source text is preserved, not extended with invented promises or presented as legal advice.
- Public indexing and sitemap entries are enabled only in an approved production build. Preview sitemap is intentionally empty.

`BUILD_REPORT.json` records the latest build mode and page manifest. `npm test` verifies mocked API behaviour; neither it nor a successful build proves live email delivery or regulatory compliance.

## Single-file review copy

`npm run export` creates `../Sthara_Launch_Preview.html`. About, Privacy, DPDP, Contact and all four roles navigate inside that file; images and fonts are embedded. Open this new file instead of an older Astra export to review the imported pages. It does not overwrite `Sthara_Astra_Constellation.html`, `Sthara_Astra_Daylight.html` or the supplied source. The enquiry service cannot run from a `file://` preview: use the full Vercel project for real submissions. Sign-in deliberately remains an external link to the school application.
