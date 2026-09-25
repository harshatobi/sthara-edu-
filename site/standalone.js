/* Routing for the self-contained launch preview. The hosted site uses launch.js. */
(() => {
  'use strict';
  const root = document.documentElement;
  const company = document.getElementById('company-page');
  const homeTitle = document.title;
  const companyNames = new Set(['about', 'privacy', 'dpdp', 'contact']);
  const roleNames = new Set(['student', 'teacher', 'admin', 'parent']);
  let currentCompany = '';

  function route() {
    let fragment = location.hash.slice(1);
    try { fragment = decodeURIComponent(fragment); } catch { fragment = ''; }
    const name = fragment.startsWith('/') ? fragment.slice(1).split('#')[0] : 'home';
    const page = companyNames.has(name) || roleNames.has(name) ? name : 'home';
    root.dataset.page = page;
    root.dataset.title = homeTitle;

    if (companyNames.has(page)) {
      const template = document.getElementById(`standalone-${page}`);
      root.dataset.title = template.dataset.title;
      if (currentCompany !== page) {
        company.replaceChildren(template.content.cloneNode(true));
        currentCompany = page;
      }
      company.hidden = false;
      company.querySelectorAll('[data-enquiry-host]').forEach(host => {
        if (location.protocol === 'file:') {
          host.innerHTML = '<div class="company-callout" role="note"><h3>Enquiries need the hosted website.</h3><p>This preview is open from a file, so it cannot send enquiries. Configure and serve the launch website to use its secure form, or email the Sthara team.</p><a class="button" href="mailto:coo@sthara.in">Email coo@sthara.in <span aria-hidden="true">↗</span></a></div>';
        } else if (location.protocol === 'http:' || location.protocol === 'https:') {
          // The enquiry script loads after the route script on the first visit.
          requestAnimationFrame(() => {
            if (host.isConnected && root.dataset.page === page) window.StharaEnquiry?.mount(host);
          });
        }
      });
    } else {
      company.hidden = true;
    }

    document.querySelectorAll('nav a, .footer-top a').forEach(link => {
      const href = link.getAttribute('href');
      if (href === `#/${page}` || (page === 'home' && href === '#top')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  // Register before app.js so it renders the page selected here on every hash change.
  window.addEventListener('hashchange', route);
  route();
})();
