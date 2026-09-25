import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { companyPages } from './company-pages.mjs';

const root = dirname(fileURLToPath(import.meta.url));
// --app: build into the school app (sthara-edu-), served by Next from public/site at the site's
// clean URLs. Role pages move to /for/* because /student, /teacher, /admin and /parent are the
// app's portals, and assets live under /site so they can't collide with app files.
const appMode = process.argv.includes('--app');
const output = appMode ? resolve(root, '../public/site') : resolve(root, 'dist');
const BASE = appMode ? '/site' : '';
const ROLE_PATH = appMode
  ? { student: '/for/students', teacher: '/for/teachers', admin: '/for/administrators', parent: '/for/parents' }
  : { student: '/student', teacher: '/teacher', admin: '/admin', parent: '/parent' };
const roleFile = key => (appMode ? `for-${ROLE_PATH[key].split('/').pop()}.html` : `${key}.html`);
const origin = new URL(process.env.SITE_URL || 'https://www.sthara.in').origin;
if (!origin.startsWith('https://')) throw new Error('SITE_URL must be HTTPS.');
// Inside the app, sign-in is same-origin, so it works on previews and localhost too.
const appURL = appMode && !process.env.SCHOOL_APP_URL ? { href: '/login' } : new URL(process.env.SCHOOL_APP_URL || 'https://www.sthara.in/login');
if (!appMode && appURL.protocol !== 'https:') throw new Error('SCHOOL_APP_URL must be HTTPS.');
const production = process.env.SITE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
const approved = process.env.POLICIES_APPROVED === 'true';
if (!appMode && production && (!approved || process.env.APP_ROUTING_CONFIRMED !== 'true')) {
  throw new Error('Production is gated: complete and approve policies, then confirm existing school-app routing. See README.md.');
}
// In the app, failing here would block every app deployment. Instead the site ships unindexed
// (noindex, empty sitemap) until the policy wording is approved. App routing is settled by
// construction: the site only takes URLs the app doesn't use.
const indexable = production && (appMode ? approved : true);
if (appMode && production && !approved) console.warn('[site] POLICIES_APPROVED is not true: marketing pages are built noindex.');
const PLACEHOLDER_TEXT = /\bTODO\b|\bTBD\b|PLACEHOLDER|Lorem ipsum/i;
if (production && Object.entries(companyPages).some(([, page]) => PLACEHOLDER_TEXT.test(page.html))) {
  throw new Error('Published policy content still contains placeholder text. Supply approved complete text before a production build.');
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let template = await readFile(resolve(root, 'index.html'), 'utf8');
const appSource = await readFile(resolve(root, 'app.js'), 'utf8');
// Reuse the approved role copy, without a second editable version drifting from it.
const roleStart = appSource.indexOf('  const roles = {');
const roleEnd = appSource.indexOf('  function selectRole(');
if (roleStart < 0 || roleEnd <= roleStart) throw new Error('Role content boundary changed.');
const { roles, moduleMarkup } = runInNewContext(`${appSource.slice(roleStart, roleEnd)};({ roles, moduleMarkup })`, {}, { timeout: 1000 });

function links(html) {
  return roleLinks(html
    .replaceAll('https://www.sthara.in/#/dpdp%23dp-residency', '/dpdp#dp-residency')
    .replace(/https:\/\/(?:www\.)?sthara\.in\/#\/(about|privacy|dpdp|contact)/g, '/$1')
    .replaceAll('https://www.sthara.in/login', escape(appURL.href))
    .replaceAll('href="#/', 'href="/')
    .replaceAll('href="#contact"', 'href="/contact"')
    .replace(/href="#(top|platform|product|demo|tml|pricing|trust)"/g, 'href="/#$1"')
    .replace(/href="mailto:sales@sthara\.in\?subject=[^"]*"/g, 'href="/contact"'));
}
// Role links (static and in app.js templates) point at the role pages' real URLs.
function roleLinks(html) {
  return html
    .replace(/href="\/(student|teacher|admin|parent)(?=["#])/g, (_, r) => `href="${ROLE_PATH[r]}`)
    .replaceAll('href="/${role}"', 'href="${ROLE_PATH[role]}"')
    .replaceAll('href="/${key}"', 'href="${ROLE_PATH[key]}"');
}
template = links(template)
  .replaceAll('<a href="/#trust">DPDP</a>', '<a href="/dpdp">DPDP</a>')
  .replace(/  <button class="review-button"[\s\S]*?<\/dialog>\n/, '')
  .replace('Interactive design concept. Not the live product.', 'Product examples use sample data.')
  .replace('<noscript><div class="no-script">Enable JavaScript to explore the interactive concepts. Pricing, policies and contact links remain available.</div></noscript>', '<noscript><div class="no-script">JavaScript is needed for interactive examples and the enquiry form. You can also email <a href="mailto:coo@sthara.in">coo@sthara.in</a>.</div></noscript>')
  .replace('<div><a href="/privacy">Privacy</a>', `<div class="footer-links"><a href="/about">About us</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a>${appMode ? '<a href="/terms">Terms</a>' : ''}`)
  .replace('<link rel="stylesheet" href="refinement.css">', '<link rel="stylesheet" href="refinement.css">\n  <link rel="stylesheet" href="company-pages.css">\n  <link rel="stylesheet" href="enquiry-form.css">\n  <link rel="stylesheet" href="launch.css">')
  .replace('<script src="hero-motion.js">', '<script src="launch.js"></script>\n  <script src="hero-motion.js">')
  .replace('<script src="app.js"></script>', '<script src="app.js"></script>\n  <script src="enquiry-form.js"></script>');

function roleHTML(key, info) {
  const supplied = key === 'teacher' ? ['copilot','class-mastery','curriculum'] : key === 'student' ? ['tutor','mastery','evidence'] : [];
  const images = supplied.length
    ? supplied.map(id => `<figure><button class="role-screen" data-open-capture="${id}"><img src="${BASE}/assets/captures/${id}.png" loading="lazy" alt="Sthara ${id.replaceAll('-', ' ')} sample product screen"><span>Inspect product screen ↗</span></button></figure>`).join('') + '<figcaption>Supplied design captures. Example values, not live student records.</figcaption>'
    : `<div class="capture-placeholder"><svg class="exact-brand" viewBox="0 0 196 316" aria-hidden="true"><use href="#pillar-logo"/></svg><strong>See your school's workflow.</strong><p>Explore the ${info.name.toLowerCase()} experience with the Sthara team during a pilot discussion.</p><a class="text-link" href="/contact">Talk to the team ↗</a></div><figcaption>No identifiable student or family records are displayed here.</figcaption>`;
  return `<div class="wrap"><section class="role-page-hero"><a class="back-link" href="/#platform">← Back to the platform</a><div class="eyebrow">FOR ${info.plural.toUpperCase()}</div><h1 tabindex="-1">${info.routeTitle}</h1><p>${info.routeDescription}</p><a class="button" href="/contact">Book a pilot ↗</a></section><section class="role-detail-layout"><div class="role-detail-steps"><h2>A day with Sthara.</h2>${info.steps.map(([title,copy])=>`<article><h3>${title}</h3><p>${copy}</p></article>`).join('')}<div class="sample-module">${moduleMarkup(key)}</div></div><figure class="role-capture">${images}</figure></section><nav class="role-related" aria-label="Other school roles"><span>One record connects everyone.</span>${Object.entries(roles).filter(([other])=>other!==key).map(([other,data])=>`<a href="${ROLE_PATH[other]}">${data.plural} ↗</a>`).join('')}</nav></div>`;
}
const pages = {
  home: { title: 'Sthara | The Unified School OS', description: 'One connected school platform for students, teachers, administrators and parents. Explore True Mastery Level, teaching support and a paid school pilot.' },
  ...Object.fromEntries(Object.entries(roles).map(([key,info])=>[key,{title:`Sthara for ${info.plural} | The Unified School OS`,description:info.routeDescription,html:roleHTML(key,info),role:true}])),
  ...companyPages
};
await mkdir(output, { recursive: true });
await cp(resolve(root, 'assets'), resolve(output, 'assets'), { recursive: true });
for (const file of ['style.css','refinement.css','company-pages.css','enquiry-form.css','launch.css','hero-motion.js','capture-gallery.js','app.js','enquiry-form.js','launch.js']) {
  let data = await readFile(resolve(root,file),'utf8');
  if (file === 'app.js') data = `const ROLE_PATH = ${JSON.stringify(ROLE_PATH)};\n${links(data)}`;
  if (appMode && file === 'capture-gallery.js') data = data.replaceAll('`assets/captures/', '`' + BASE + '/assets/captures/');
  if (appMode && file === 'launch.js') {
    data = data.replace("if (pages.has(page)) location.replace(`/${page}", `const ROLE_PATH = ${JSON.stringify(ROLE_PATH)};\n    if (pages.has(page)) location.replace(\`\${ROLE_PATH[page] || '/' + page}`);
  }
  await writeFile(resolve(output,file), data);
}
const manifest = [];
for (const [key,page] of Object.entries(pages)) {
  const path = key === 'home' ? '/' : ROLE_PATH[key] || `/${key}`;
  let html = template
    .replace('<html lang="en" data-theme="dark">', `<html lang="en" data-theme="dark" data-page="${key}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(page.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escape(page.description)}">`)
    .replace(/<meta name="robots"[^>]*>/, `<meta name="robots" content="${indexable?'index,follow':'noindex,nofollow'}">`)
    .replace('</head>', `<link rel="canonical" href="${origin}${path}">\n  <meta property="og:type" content="website">\n  <meta property="og:site_name" content="Sthara">\n  <meta property="og:title" content="${escape(page.title)}">\n  <meta property="og:description" content="${escape(page.description)}">\n  <meta property="og:url" content="${origin}${path}">\n  <meta property="og:image" content="${origin}${BASE}/assets/sthara-logo-presentation.png">\n  <meta name="twitter:card" content="summary">\n  <link rel="icon" href="${BASE}/assets/sthara-logo-presentation.png" type="image/png">\n  <link rel="preload" href="${BASE}/assets/jakarta-regular.ttf" as="font" type="font/ttf" crossorigin>\n</head>`);
  if (key !== 'home') html = html.replace('<div id="home-page">','<div id="home-page" hidden>');
  if (page.role) html = html.replace('<div id="role-page" hidden></div>', `<div id="role-page">${page.html}</div>`);
  else if (key !== 'home') html = html.replace('<div id="role-page" hidden></div>', `<div id="role-page" hidden></div><div id="company-page">${links(page.html)}</div>`);
  if (!appMode && !indexable && key === 'contact') html = html.replace('<div id="company-page">', '<div id="company-page"><div class="wrap preview-notice"><strong>Preview:</strong> sending enquiries requires the email and anti-spam setup described in FORM_SETUP.md. Do not submit child or student records.</div>');
  // Local assets are shared and cacheable instead of duplicated as base64 on every page.
  html = html.replace(/(src|href)="(assets\/[^"<>]+|[a-z-]+\.(?:js|css))"/g, `$1="${BASE}/$2"`);
  const filename = key === 'home' ? 'index.html' : ROLE_PATH[key] ? roleFile(key) : `${key}.html`;
  await writeFile(resolve(output,filename),html);
  manifest.push({key,path,file:filename,title:page.title,bytes:Buffer.byteLength(html)});
}
const notFound = template.replace(/<main id="main"[\s\S]*?<\/main>/, '<main id="main" tabindex="-1"><section class="role-page-hero wrap"><h1>Page not found.</h1><p>The page may have moved.</p><a class="button" href="/">Return to Sthara</a><a class="text-link" href="/contact">Contact the team ↗</a></section></main>').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<header class="site-header">[\s\S]*?<\/header>/, '<header class="site-header"><div class="nav-shell wrap"><a class="brand" href="/">STHARA</a><a class="button small" href="/contact">Book a pilot ↗</a></div></header>').replace(/<button[^>]*class="motion-control"[\s\S]*?<\/button>/g,'').replace(/<title>[^<]*<\/title>/,'<title>Page not found | Sthara</title>').replace(/(src|href)="(assets\/[^"<>]+|[a-z-]+\.(?:js|css))"/g,`$1="${BASE}/$2"`);
await writeFile(resolve(output,'404.html'),notFound.replace(/<button id="motion-toggle"[\s\S]*?<\/button>/g, ''));
// In the app this robots.txt covers the whole domain, so the portals, sign-in and APIs stay out of search.
const appDisallow = appMode ? ['/login', '/onboard', '/student', '/teacher', '/admin', '/parent', '/superadmin', '/ops', '/api', '/trial-expired'].map(p => `Disallow: ${p}\n`).join('') : '';
await writeFile(resolve(output,'robots.txt'),indexable ? `User-agent: *\nAllow: /\n${appDisallow}Sitemap: ${origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
await writeFile(resolve(output,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable ? manifest.map(page=>`<url><loc>${origin}${page.path}</loc></url>`).join('') : ''}</urlset>`);
await writeFile(resolve(appMode ? output : root,'BUILD_REPORT.json'),JSON.stringify({mode:indexable?'production':'preview',target:appMode?'app':'standalone',origin,schoolAppURL:appURL.href,pages:manifest,policyContentComplete:!Object.values(companyPages).some(page=>page.incomplete)},null,2));
console.log(`Built ${manifest.length} pages in ${appMode ? 'public/site/' : 'dist/'} (${indexable?'production':'preview; noindex'}).`);
