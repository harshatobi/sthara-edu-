const MAX_BODY_BYTES = 16 * 1024;
const ROLES = new Set(['school-leader', 'administrator', 'teacher', 'parent', 'other']);
const EMAIL = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNAVAILABLE = 'Enquiries are temporarily unavailable. Please try again later.';

function header(req, key) {
  const value = req.headers?.[key];
  return typeof value === 'string' ? value : '';
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function clientIp(req) {
  const forwarded = header(req, 'x-forwarded-for');
  return (forwarded ? forwarded.split(',')[0].trim() : '') || req.socket?.remoteAddress || 'unknown';
}

function send(res, status, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

// storeMode: the host app saves enquiries itself (see createContactHandler's `store`). Email
// and Turnstile then become optional add-ons, and without an allowlist only same-origin
// requests are accepted. Without `store`, all three remain required, exactly as before.
function configuration(env, storeMode = false) {
  const origins = new Set();
  try {
    // An unset allowlist is only acceptable in store mode (same-origin); otherwise it fails closed as before.
    const raw = (env.CONTACT_ALLOWED_ORIGINS || '').trim();
    if (!raw && !storeMode) return null;
    for (const entry of raw ? raw.split(',') : []) {
      const url = new URL(entry.trim());
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
          url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
      origins.add(url.origin);
    }
  } catch { return null; }
  const from = (env.CONTACT_FROM_EMAIL || '').trim();
  const to = (env.CONTACT_TO_EMAIL || 'coo@sthara.in').trim();
  const siteKey = (env.TURNSTILE_SITE_KEY || '').trim();
  const secret = (env.TURNSTILE_SECRET_KEY || '').trim();
  const apiKey = (env.RESEND_API_KEY || '').trim();
  // Cloudflare's documented dummy keys must never unlock this public endpoint.
  const mailOk = EMAIL.test(from) && EMAIL.test(to) && from.length <= 254 && to.length <= 254 && Boolean(apiKey);
  const challengeOk = Boolean(siteKey && secret) && !/^[123]x0{10}/.test(siteKey) && !/^[123]x0{10}/.test(secret);
  if (!storeMode) {
    if (!mailOk || !challengeOk) return null;
    return { origins, from, to, siteKey, secret, apiKey, mail: true, challenge: true, store: false };
  }
  // A half-configured provider is ignored rather than trusted: store mode never depends on it.
  return { origins, from, to, siteKey: challengeOk ? siteKey : null, secret, apiKey, mail: mailOk, challenge: challengeOk, store: true };
}

function requestOrigin(req, config) {
  if (header(req, 'sec-fetch-site') === 'cross-site') return null;
  let origin = header(req, 'origin');
  // Browsers omit Origin for same-origin GETs; Referer is sufficient for public widget configuration.
  if (!origin && req.method === 'GET') {
    try { origin = new URL(header(req, 'referer')).origin; } catch { return null; }
  }
  try {
    const url = new URL(origin);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    // With no allowlist in store mode, the request must come from this same site over HTTPS (HTTP only on localhost).
    const allowed = config.origins.size ? config.origins.has(origin)
      : config.store && (url.protocol === 'https:' || (local && url.protocol === 'http:'));
    if (url.origin !== origin || !allowed ||
        url.host.toLowerCase() !== header(req, 'host').toLowerCase()) return null;
    return url;
  } catch { return null; }
}

async function readBody(req) {
  const length = header(req, 'content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw Object.assign(new Error('Body too large'), { status: 413 });
  }
  let body = req.body; // Vercel can parse this lazily and throw on malformed JSON.
  if (body === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Body too large'), { status: 413 });
      chunks.push(buffer);
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  if (!serialized) throw new Error('Body is empty');
  if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) {
    throw Object.assign(new Error('Body too large'), { status: 413 });
  }
  if (typeof body === 'string') body = JSON.parse(body);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid JSON object');
  return body;
}

function validate(body, challenge = true) {
  const fields = {};
  const errors = {};
  const limits = { name: [2, 100], email: [3, 254], school: [2, 160], role: [1, 30], phone: [0, 30], message: [10, 3000] };
  for (const [key, [min, max]] of Object.entries(limits)) {
    const value = body[key] === undefined && key === 'phone' ? '' : body[key];
    const clean = typeof value === 'string' ? value.trim() : '';
    const forbiddenControls = key === 'message' ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/;
    if (typeof value !== 'string' || clean.length < min || clean.length > max || forbiddenControls.test(clean)) {
      errors[key] = key === 'phone' ? 'Enter a phone number of up to 30 characters, or leave it blank.' : `Enter ${min}–${max} characters.`;
    }
    fields[key] = clean;
  }
  if (!EMAIL.test(fields.email)) errors.email = 'Enter a valid email address.';
  if (!ROLES.has(fields.role)) errors.role = 'Choose your role.';
  if (fields.phone && (!/^[+\d().\s-]+$/.test(fields.phone) || fields.phone.replace(/\D/g, '').length < 7)) {
    errors.phone = 'Enter a valid phone number, or leave it blank.';
  }
  if (body.consent !== true) errors.consent = 'Please agree to be contacted about this enquiry.';
  if (!UUID.test(body.submissionId || '')) errors.form = 'Refresh the page and try again.';
  if (challenge && (typeof body.turnstileToken !== 'string' || body.turnstileToken.length < 1 || body.turnstileToken.length > 2048)) {
    errors.challenge = 'Complete the security check and try again.';
  }
  return { fields, errors };
}

async function providerJson(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error('Provider unavailable');
    return await response.json();
  } finally { clearTimeout(timer); }
}

// Dependency injection keeps automated tests offline; production always uses process.env and native fetch.
// `store(fields, { submissionId, origin })`, when given, saves the enquiry (the app's database) and
// must be idempotent on submissionId. A stored enquiry is a success even if an optional email fails.
export function createContactHandler({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 7000, store = null } = {}) {
  // Best-effort per-instance backstop only — serverless instances don't share this state.
  // The Vercel firewall rate limit described in FORM_SETUP.md remains the real control.
  const rateLimitHits = new Map();
  function rateLimited(ip) {
    const now = Date.now();
    const hits = (rateLimitHits.get(ip) || []).filter(time => now - time < RATE_LIMIT_WINDOW_MS);
    hits.push(now);
    rateLimitHits.set(ip, hits);
    if (rateLimitHits.size > 10000) rateLimitHits.clear(); // bound memory if many IPs churn through
    return hits.length > RATE_LIMIT_MAX;
  }
  return async function contact(req, res) {
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return send(res, 405, { ok: false, message: 'Use the enquiry form to submit your message.' });
    }
    const config = configuration(env, typeof store === 'function');
    if (!config) return send(res, 503, { ok: false, message: UNAVAILABLE });
    const origin = requestOrigin(req, config);
    if (!origin) return send(res, 403, { ok: false, message: 'Open the enquiry form on this website and try again.' });
    if (req.method === 'GET') return send(res, 200, { ok: true, siteKey: config.siteKey });
    if (rateLimited(clientIp(req))) {
      res.setHeader('Retry-After', String(RATE_LIMIT_WINDOW_MS / 1000));
      return send(res, 429, { ok: false, message: 'Too many enquiries submitted recently. Please try again later.' });
    }
    if (!/^application\/json(?:\s*;|$)/i.test(header(req, 'content-type'))) {
      return send(res, 415, { ok: false, message: 'Submit the enquiry using the website form.' });
    }
    let body;
    try { body = await readBody(req); }
    catch (error) {
      const status = error.status === 413 ? 413 : 400;
      return send(res, status, { ok: false, message: status === 413 ? 'This enquiry is too long. Shorten it and try again.' : 'The enquiry could not be read. Please try again.' });
    }
    if (body.website !== undefined && body.website !== '') {
      return send(res, 400, { ok: false, message: 'The enquiry could not be submitted. Please try again.' });
    }
    const { fields, errors } = validate(body, config.challenge);
    if (Object.keys(errors).length) return send(res, 400, { ok: false, message: 'Please check the form and try again.', fieldErrors: errors });
    try {
      if (config.challenge) {
        const verification = await providerJson(fetchImpl, 'https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: config.secret, response: body.turnstileToken }),
        }, timeoutMs);
        if (verification.success !== true || verification.hostname !== origin.hostname || verification.action !== 'enquiry') {
          return send(res, 400, { ok: false, message: 'The security check expired or could not be verified. Please try again.', fieldErrors: { challenge: 'Complete the new security check.' } });
        }
      }
      if (config.store) await store(fields, { submissionId: body.submissionId, origin: origin.origin });
    } catch {
      // Do not log request bodies, provider responses, contact details, or secrets.
      return send(res, 502, { ok: false, message: 'We could not confirm your enquiry. Please try again.' });
    }
    if (config.mail) {
      try {
        const text = [
          'New Sthara school enquiry', '', `Name: ${fields.name}`, `Email: ${fields.email}`,
          `School / organisation: ${fields.school}`, `Role: ${fields.role}`,
          `Phone: ${fields.phone || 'Not provided'}`, '', 'Message:', fields.message, '',
          'Consent: Agreed to be contacted about this enquiry.', `Source: ${origin.origin}`,
        ].join('\n');
        const receipt = await providerJson(fetchImpl, 'https://api.resend.com/emails', {
          method: 'POST', headers: {
            Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json',
            'Idempotency-Key': `sthara-enquiry/${body.submissionId}`,
          },
          body: JSON.stringify({ from: config.from, to: [config.to], reply_to: fields.email, subject: 'New Sthara school enquiry', text }),
        }, timeoutMs);
        if (typeof receipt.id !== 'string' || !receipt.id) throw new Error('Missing provider receipt');
      } catch {
        // Already saved: the team will see it in the console, so the sender still gets a success.
        if (!config.store) return send(res, 502, { ok: false, message: 'We could not confirm your enquiry. Please try again.' });
      }
    }
    return send(res, 200, { ok: true, message: 'Thank you. Your enquiry has been submitted to the Sthara team.' });
  };
}

export default createContactHandler();
