// Preserve incoming links from the current hash-based marketing site.
(() => {
  const pages = new Set(['about', 'privacy', 'dpdp', 'contact', 'student', 'teacher', 'admin', 'parent']);
  if (location.hash.startsWith('#/')) {
    let target;
    try { target = decodeURIComponent(location.hash.slice(2)); } catch { return; }
    const [page, anchor] = target.split('#');
    if (pages.has(page)) location.replace(`/${page}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`);
  }
  const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  document.querySelectorAll('nav a, .footer-top a').forEach(link => {
    if (link.getAttribute('href') === path) link.setAttribute('aria-current', 'page');
  });
})();
