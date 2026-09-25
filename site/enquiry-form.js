(() => {
  'use strict';
  let sequence = 0;
  let turnstileLoader;
  const mounted = new WeakMap();
  const ENDPOINT = '/api/contact';

  function markup() {
    const id = `enquiry-${++sequence}`;
    const field = (name, label, type, autocomplete, max, required = true) => `
      <div class="enquiry-field">
        <label class="enquiry-label" for="${id}-${name}">${label}${required ? '' : ' <span class="enquiry-optional">(optional)</span>'}</label>
        <input class="enquiry-input" id="${id}-${name}" name="${name}" type="${type}" autocomplete="${autocomplete}" maxlength="${max}" ${required ? 'required' : ''} aria-describedby="${id}-${name}-error">
        <span class="enquiry-field-error" id="${id}-${name}-error" data-enquiry-error="${name}"></span>
      </div>`;
    return `<form class="enquiry-form" action="${ENDPOINT}" method="post" aria-label="School enquiry">
      <p class="enquiry-intro">Tell us a little about your school and what you would like to explore.</p>
      <p class="enquiry-required">All fields are required unless marked optional.</p>
      <div class="enquiry-grid">
        ${field('name', 'Your name', 'text', 'name', 100)}
        ${field('email', 'Email address', 'email', 'email', 254)}
        ${field('school', 'School / organisation', 'text', 'organization', 160)}
        <div class="enquiry-field">
          <label class="enquiry-label" for="${id}-role">Your role</label>
          <select class="enquiry-input" id="${id}-role" name="role" required aria-describedby="${id}-role-error">
            <option value="">Select your role</option><option value="school-leader">School leader / management</option>
            <option value="administrator">School administrator</option><option value="teacher">Teacher</option>
            <option value="parent">Parent</option><option value="other">Other</option>
          </select>
          <span class="enquiry-field-error" id="${id}-role-error" data-enquiry-error="role"></span>
        </div>
        ${field('phone', 'Phone number', 'tel', 'tel', 30, false)}
      </div>
      <div class="enquiry-field">
        <label class="enquiry-label" for="${id}-message">How can we help?</label>
        <textarea class="enquiry-input enquiry-message" id="${id}-message" name="message" rows="4" minlength="10" maxlength="3000" required aria-describedby="${id}-message-hint ${id}-message-error"></textarea>
        <span class="enquiry-hint" id="${id}-message-hint">Please avoid including student names, records, or other sensitive information.</span>
        <span class="enquiry-field-error" id="${id}-message-error" data-enquiry-error="message"></span>
      </div>
      <div class="enquiry-trap" aria-hidden="true"><label for="${id}-website">Leave this field empty</label><input id="${id}-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
      <div class="enquiry-field enquiry-consent-field">
        <label class="enquiry-consent" for="${id}-consent"><input id="${id}-consent" name="consent" type="checkbox" required aria-describedby="${id}-consent-note ${id}-consent-error"><span>I agree that Sthara may use these details to respond to this enquiry and contact me about its school platform.</span></label>
        <p class="enquiry-privacy" id="${id}-consent-note">This is enquiry consent only. Please do not include children’s personal details or student records. <a href="/privacy" target="_blank" rel="noopener">Read the privacy notice (opens in a new tab)</a>.</p>
        <span class="enquiry-field-error" id="${id}-consent-error" data-enquiry-error="consent"></span>
      </div>
      <div class="enquiry-challenge" data-enquiry-challenge></div>
      <span class="enquiry-field-error" data-enquiry-error="challenge"></span>
      <p class="enquiry-status" data-enquiry-status role="status" aria-live="polite" aria-atomic="true" tabindex="-1">Connecting to the secure enquiry form…</p>
      <div class="enquiry-actions"><button class="enquiry-submit" type="submit" disabled>Send enquiry <span aria-hidden="true">↗</span></button><button class="enquiry-retry" type="button" data-enquiry-retry hidden>Try connecting again</button></div>
    </form>`;
  }

  async function request(options, timeout = 22000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(ENDPOINT, { ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      let data;
      try { data = await response.json(); } catch { throw new Error('The enquiry service could not be reached. Please try again.'); }
      return { response, data };
    } finally { clearTimeout(timer); }
  }

  function loadTurnstile() {
    if (window.turnstile?.render) return Promise.resolve(window.turnstile);
    if (turnstileLoader) return turnstileLoader;
    turnstileLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(fail, 12000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        turnstileLoader = undefined;
        reject(new Error('The security check could not load. Check your connection and try again.'));
      }
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        if (window.turnstile?.render) resolve(window.turnstile); else fail();
      };
      script.onerror = fail;
      document.head.append(script);
    });
    return turnstileLoader;
  }

  function mount(root) {
    if (!root || mounted.has(root)) return mounted.get(root);
    if (!root.querySelector('.enquiry-form')) root.innerHTML = markup();
    const form = root.querySelector('.enquiry-form');
    const status = form.querySelector('[data-enquiry-status]');
    const submit = form.querySelector('.enquiry-submit');
    const retry = form.querySelector('[data-enquiry-retry]');
    let widget;
    let token = '';
    // False when the site runs without a Turnstile widget (enquiries are then stored by the host app).
    let challenge = true;
    let ready = false;
    let pending = false;
    let submissionId = crypto.randomUUID();
    let previousPayload = '';

    function feedback(message, state = '') {
      status.textContent = message;
      status.dataset.state = state;
    }
    function resetChallenge() {
      token = '';
      if (widget !== undefined && window.turnstile) window.turnstile.reset(widget);
    }
    function clearErrors() {
      form.querySelectorAll('[data-enquiry-error]').forEach(element => { element.textContent = ''; });
      form.querySelectorAll('[aria-invalid]').forEach(element => element.removeAttribute('aria-invalid'));
    }
    async function connect() {
      ready = false;
      submit.disabled = true;
      retry.hidden = true;
      feedback('Connecting to the secure enquiry form…');
      try {
        const { response, data } = await request({ method: 'GET' }, 8000);
        if (!response.ok || data.ok !== true || (typeof data.siteKey !== 'string' && data.siteKey !== null)) throw new Error(data.message || 'Enquiries are temporarily unavailable. Please try again later.');
        challenge = data.siteKey !== null;
        if (!challenge) {
          ready = true;
          submit.disabled = false;
          feedback('');
          return;
        }
        const turnstile = await loadTurnstile();
        if (widget !== undefined) turnstile.remove(widget);
        widget = turnstile.render(form.querySelector('[data-enquiry-challenge]'), {
          sitekey: data.siteKey, action: 'enquiry', theme: 'auto', size: 'flexible', 'response-field': false,
          callback: value => {
            token = value;
            const error = form.querySelector('[data-enquiry-error="challenge"]');
            error.textContent = '';
          },
          'expired-callback': () => { token = ''; },
          'error-callback': () => {
            token = '';
            form.querySelector('[data-enquiry-error="challenge"]').textContent = 'The security check could not complete. Try connecting again.';
            retry.hidden = false;
            return true;
          },
        });
        ready = true;
        submit.disabled = false;
        feedback('');
      } catch (error) {
        feedback(error.name === 'AbortError' ? 'The connection timed out. Please try connecting again.' : error.message, 'error');
        retry.hidden = false;
      }
    }
    retry.addEventListener('click', connect);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (pending || !ready) return;
      clearErrors();
      if (!form.reportValidity()) return;
      if (challenge && !token) {
        feedback('Please complete the security check before sending your enquiry.', 'error');
        status.focus();
        return;
      }
      const values = new FormData(form);
      const fields = Object.fromEntries(['name', 'email', 'school', 'role', 'phone', 'message', 'website'].map(name => [name, String(values.get(name) || '').trim()]));
      fields.consent = values.get('consent') === 'on';
      const serialized = JSON.stringify(fields);
      // Retry an unchanged request with the same provider idempotency key after uncertain delivery.
      if (previousPayload && previousPayload !== serialized) submissionId = crypto.randomUUID();
      previousPayload = serialized;
      pending = true;
      submit.disabled = true;
      retry.hidden = true;
      form.setAttribute('aria-busy', 'true');
      feedback('Sending your enquiry…');
      try {
        const { response, data } = await request({
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fields, submissionId, ...(challenge ? { turnstileToken: token } : {}) }),
        });
        if (!response.ok || data.ok !== true) {
          let firstInvalid;
          for (const [name, message] of Object.entries(data.fieldErrors || {})) {
            // Only known static field names may be used as selectors.
            if (!['name', 'email', 'school', 'role', 'phone', 'message', 'consent', 'challenge'].includes(name)) continue;
            const error = form.querySelector(`[data-enquiry-error="${name}"]`);
            if (error && typeof message === 'string') error.textContent = message;
            const control = form.elements.namedItem(name);
            if (control) { control.setAttribute('aria-invalid', 'true'); firstInvalid ||= control; }
          }
          feedback(data.message || 'Your enquiry could not be confirmed. Please try again.', 'error');
          (firstInvalid || status).focus();
        } else {
          form.reset();
          submissionId = crypto.randomUUID();
          previousPayload = '';
          feedback('Thank you. Your enquiry has been submitted to the Sthara team.', 'success');
          status.focus();
        }
      } catch (error) {
        feedback(error.name === 'AbortError' ? 'We could not confirm your enquiry before the connection timed out. Please try again.' : 'The enquiry service could not be reached. Please check your connection and try again.', 'error');
        status.focus();
      } finally {
        pending = false;
        submit.disabled = false;
        form.removeAttribute('aria-busy');
        resetChallenge();
      }
    });
    const api = { form, reconnect: connect };
    mounted.set(root, api);
    connect();
    return api;
  }

  window.StharaEnquiry = { markup, mount };
  const autoMount = () => document.querySelectorAll('[data-enquiry-host]').forEach(mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount, { once: true });
  else autoMount();
})();
