# Sthara enquiry form setup

The form posts to the Vercel Node function at `/api/contact`. The confirmed recipient is **coo@sthara.in**, held on the server. Delivery uses Resend; spam protection uses server-verified Cloudflare Turnstile. No account has been connected, live email sent, or production deployment verified by this implementation.

## Configure before launch

In the Vercel project settings, add the following environment variables to the deployment environment, then redeploy. Use Vercel's secret environment-variable controls for private keys. Do not put private keys in HTML, client JavaScript, git, or a public environment file.

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | A Resend API key with permission to send from the verified sending domain. |
| `CONTACT_FROM_EMAIL` | A **bare email address**, for example `enquiries@sthara.in`, on a domain verified in Resend. Display-name syntax is intentionally unsupported. |
| `CONTACT_TO_EMAIL` | Optional override; defaults to the user-confirmed `coo@sthara.in`. A single bare email address. |
| `CONTACT_ALLOWED_ORIGINS` | Comma-separated exact origins, for example `https://sthara.in,https://www.sthara.in`. Add the exact Vercel preview origin separately if testing there. No wildcard, path, query, or trailing comma. |
| `TURNSTILE_SITE_KEY` | Public site key for a managed Turnstile widget. This is the only provider setting returned to the browser. |
| `TURNSTILE_SECRET_KEY` | Private secret for that same widget. |

Create the Turnstile widget with the exact public hostnames you intend to use. The browser tags the challenge with action `enquiry`; the server requires that action and the matching request hostname. The endpoint rejects Cloudflare's documented dummy keys. There is no production bypass.

Deploy `outputs/sthara-launch` as the Vercel project root with its `api/contact.mjs` file included. A plain static file server previews layout only; it cannot execute the endpoint. Use a supported Node runtime with native `fetch` and `AbortController` (Node 22 or newer). The two provider requests each have a seven-second timeout; configure the function's maximum duration to at least 20 seconds if setting a custom limit.

Allow these origins in a Content Security Policy, merging them into the website's existing policy:

- `script-src`: `'self' https://challenges.cloudflare.com`
- `frame-src`: `https://challenges.cloudflare.com`
- `connect-src`: `'self' https://challenges.cloudflare.com`

Keep same-origin referrers enabled, for example with `Referrer-Policy: strict-origin-when-cross-origin`. The browser's initial GET uses its Origin or Referer to fetch public widget configuration. The POST requires an explicit matching Origin. A bare curl GET without either header intentionally returns 403 after configuration is available.

## Integration

Load `enquiry-form.css` after the site styles and load `enquiry-form.js` with `defer`. Place `<div data-enquiry-host></div>` wherever the form should appear. It mounts automatically and follows existing light/dark CSS variables. Provide a static `<noscript>` explanation beside the host when JavaScript is disabled.

For a dynamically inserted view, call `window.StharaEnquiry.mount(rootElement)`. `window.StharaEnquiry.markup()` returns accessible form markup if the surrounding code needs to insert it first. Mounting binds an existing `.enquiry-form` inside the root or creates one. Calling mount again for the same root reuses its instance. Returned instance: `{ form, reconnect }`. Public field names are `name`, `email`, `school`, `role`, `phone` (optional), `message`, and `consent`.

The endpoint accepts GET for public widget setup and POST for JSON enquiries. It rejects unexpected methods, cross-origin requests, bodies over 16 KiB, malformed fields, absent consent, filled honeypots, and invalid or replayed challenges. Text is sent as plain email text; user input never becomes HTML, sender, recipient, or subject. No request contents, contact details, provider payloads, or secrets are logged by this code.

## Verify the launch

Run the offline tests from the project root:

```sh
node --test tests/contact.test.mjs
```

These tests mock all provider traffic. They cover validation, JSON and body limits, origin restrictions, honeypot and consent, Turnstile checks, missing configuration, timeouts, mail-provider failures, success receipts, recipient overrides, and injection attempts. They do **not** prove live delivery.

After configuring the providers and deploying, submit a clearly labelled test enquiry yourself. Confirm the success state, the Resend delivery event, and arrival at `coo@sthara.in`; reply to it to verify the Reply-To address. Test a required-field failure and a network failure as well. Input is preserved after a failure and cleared only after provider acceptance. Acceptance is not a guarantee of inbox delivery; monitor delivery/bounce events in Resend.

Until mail, origin and Turnstile settings are complete, the form displays a temporary-unavailability message and cannot report success. No enquiries are queued or saved locally. The provider's idempotency key is retained for retries of unchanged form data in the current page session, which reduces duplicate sends after a lost response; reloads start a new attempt.

Turnstile and the honeypot reduce automated abuse; there is no claim of distributed rate limiting. Before directing public campaign traffic here, configure a managed request rate limit for `/api/contact` in Vercel's firewall, using a threshold suitable for expected traffic. This controls request floods before they consume function capacity. Do not substitute an in-memory counter in a serverless function.

Contact details pass through Vercel, Cloudflare Turnstile and Resend. Align the site's published privacy information and provider retention settings with this form's actual use before launch.

## Provider references

- [Vercel Node function request-body handling](https://vercel.com/docs/functions/runtimes/node-js)
- [Cloudflare server-side token validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Cloudflare hostname management](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)
- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
