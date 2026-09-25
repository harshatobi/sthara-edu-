#!/usr/bin/env node
// Static, dependency-free verification. Run `node build.mjs` first.
// Runtime-generated capture markup, external URLs and SVG fragment references
// are outside this check; browser/form behaviour is verified separately.
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, 'dist');
const expected = ['home', 'student', 'teacher', 'admin', 'parent', 'about', 'privacy', 'dpdp', 'contact'];
const failures = [];
const documents = new Map();
const scripts = new Set();
const styles = new Set();
let references = 0;
const check = (ok, message) => { if (!ok) failures.push(message); };
const decode = value => String(value).replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, token => {
  const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
  if (token[1] !== '#') return named[token.toLowerCase()] || token;
  return String.fromCodePoint(parseInt(token.slice(token[2].toLowerCase() === 'x' ? 3 : 2, -1), token[2].toLowerCase() === 'x' ? 16 : 10));
});
const text = html => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
function tags(html) {
  // Script contents can contain template HTML that is not in the static DOM.
  const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, '$1</script>');
  return [...source.matchAll(/<([a-z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)].map(match => {
    const attrs = {};
    for (const attr of match[2].matchAll(/([^\s="'<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[attr[1].toLowerCase()] = decode(attr[2] ?? attr[3] ?? attr[4] ?? '');
    }
    return { name: match[1].toLowerCase(), attrs };
  });
}
const routeFor = key => key === 'home' ? '/' : `/${key}`;
const filenameFor = key => key === 'home' ? 'index.html' : `${key}.html`;
async function documentAt(file) {
  if (!documents.has(file)) {
    const html = await readFile(file, 'utf8');
    const elements = tags(html);
    documents.set(file, { html, elements, ids: new Set(elements.map(tag => tag.attrs.id).filter(Boolean)) });
  }
  return documents.get(file);
}
async function verifyReference(value, fromFile, route, context) {
  // No network requests; mailto, data/blob and absolute external references skip.
  if (!value || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(value)) return;
  references += 1;
  let url;
  try { url = new URL(value, `https://static.invalid${route}`); }
  catch { failures.push(`${context}: invalid URL ${value}`); return; }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { failures.push(`${context}: malformed URL encoding ${value}`); return; }
  let target = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '').replace(/\/$/, '');
  if (!extname(target)) target += '.html';
  const file = resolve(dist, target);
  if (!(file === dist || file.startsWith(`${dist}${sep}`))) {
    failures.push(`${context}: path escapes dist (${value})`);
    return;
  }
  try {
    const info = await stat(file);
    check(info.isFile(), `${context}: target is not a file (${value})`);
    if (extname(file) === '.js' || extname(file) === '.mjs') scripts.add(file);
    if (extname(file) === '.css') styles.add(file);
    if (url.hash && extname(file) === '.html') {
      const id = decodeURIComponent(url.hash.slice(1));
      const targetDocument = await documentAt(file);
      check(targetDocument.ids.has(id), `${context}: missing fragment ${value}`);
    }
  } catch (error) {
    failures.push(`${context}: cannot resolve ${value} (${error.code || error.message})`);
  }
}

try {
  const report = JSON.parse(await readFile(resolve(root, 'BUILD_REPORT.json'), 'utf8'));
  check(['preview', 'production'].includes(report.mode), 'Build report has no recognized mode.');
  check(report.pages?.length === 9, 'Build report must contain exactly nine pages.');
  const declared = new Map((report.pages || []).map(page => [page.key, page]));
  check(expected.every(key => declared.has(key)), 'Build report is missing one or more expected pages.');
  const pageFiles = (await readdir(dist)).filter(file => file.endsWith('.html') && file !== '404.html');
  check(pageFiles.length === 9, 'dist must contain nine main HTML pages (plus optional 404.html).');
  const seenTitles = new Set();

  for (const key of expected) {
    const filename = filenameFor(key);
    const file = resolve(dist, filename);
    const route = routeFor(key);
    try {
      const { html, elements } = await documentAt(file);
      const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
      const headElements = tags(head);
      const titles = [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
      const title = text(titles[0]?.[1] || '');
      check(titles.length === 1 && title.includes('Sthara'), `${filename}: missing or duplicate title.`);
      check(title === declared.get(key)?.title, `${filename}: title differs from the build report.`);
      check(!seenTitles.has(title), `${filename}: title is not unique.`);
      seenTitles.add(title);
      const descriptions = headElements.filter(tag => tag.name === 'meta' && tag.attrs.name === 'description');
      check(descriptions.length === 1 && descriptions[0].attrs.content?.trim().length > 20, `${filename}: missing or empty meta description.`);
      const canonicals = headElements.filter(tag => tag.name === 'link' && tag.attrs.rel?.split(/\s+/).includes('canonical'));
      check(canonicals.length === 1 && canonicals[0].attrs.href === `${report.origin}${route}`, `${filename}: wrong or duplicate canonical.`);
      const robots = headElements.filter(tag => tag.name === 'meta' && tag.attrs.name === 'robots');
      const expectedRobots = report.mode === 'preview' ? ['noindex', 'nofollow'] : ['index', 'follow'];
      const actualRobots = robots[0]?.attrs.content?.toLowerCase().split(/\s*,\s*/) || [];
      check(robots.length === 1 && expectedRobots.every(value => actualRobots.includes(value)), `${filename}: incorrect ${report.mode} robots policy.`);
      const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/i)?.[0] || '';
      const footer = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/i)?.[0] || '';
      const linksIn = section => new Set(tags(section).filter(tag => tag.name === 'a').map(tag => tag.attrs.href));
      const footerLinks = linksIn(footer);
      for (const page of ['about', 'privacy', 'dpdp', 'contact']) check(footerLinks.has(`/${page}`), `${filename}: footer lacks /${page}.`);
      for (const nav of ['Primary navigation', 'Mobile navigation']) {
        const section = [...header.matchAll(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi)].find(match => tags(match[0])[0]?.attrs['aria-label'] === nav)?.[0] || '';
        check(linksIn(section).has('/dpdp'), `${filename}: ${nav} lacks a direct /dpdp link.`);
      }
      for (const tag of elements) {
        for (const attribute of ['href', 'src']) {
          const value = tag.attrs[attribute];
          if (value === undefined) continue;
          if (tag.name === 'use' && value.startsWith('#')) continue;
          await verifyReference(value, file, route, `${filename} <${tag.name}>`);
        }
      }
      if (key === 'contact') {
        check(elements.filter(tag => 'data-enquiry-host' in tag.attrs).length === 1, 'contact.html: expected exactly one enquiry mount.');
        check(elements.some(tag => tag.name === 'script' && tag.attrs.src === '/enquiry-form.js'), 'contact.html: missing enquiry script.');
        check(headElements.some(tag => tag.name === 'link' && tag.attrs.href === '/enquiry-form.css'), 'contact.html: missing enquiry stylesheet.');
      }
    } catch (error) { failures.push(`${filename}: ${error.message}`); }
  }

  for (const cssFile of styles) {
    const css = await readFile(cssFile, 'utf8');
    const route = `/${relative(dist, cssFile).split(sep).join('/')}`;
    for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) {
      if (!match[2].startsWith('#')) await verifyReference(match[2], cssFile, route, relative(dist, cssFile));
    }
  }
  for (const asset of ['sthara-logo-3d.png', 'pillar.png', 'sthara-logo-presentation.png']) {
    const original = await readFile(resolve(root, 'assets', asset));
    const built = await readFile(resolve(dist, 'assets', asset));
    const hash = buffer => createHash('sha256').update(buffer).digest('hex');
    check(hash(original) === hash(built), `${asset}: build copy diverged from the source asset.`);
  }
  for (const file of ['company-pages.css', 'enquiry-form.css', 'launch.css', 'enquiry-form.js', 'launch.js']) {
    check((await stat(resolve(dist, file))).isFile(), `Missing integration file: ${file}`);
  }
  for (const file of ['verify.mjs', 'build.mjs', 'company-pages.mjs', 'api/contact.mjs']) scripts.add(resolve(root, file));
  for (const file of scripts) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    check(result.status === 0, `${relative(root, file)}: syntax check failed: ${(result.stderr || result.error?.message || '').trim()}`);
  }
  const robotsText = await readFile(resolve(dist, 'robots.txt'), 'utf8');
  if (report.mode === 'preview') check(/Disallow:\s*\/\s*$/m.test(robotsText), 'Preview robots.txt must disallow crawling.');

  if (failures.length) {
    console.error(`Static verification failed (${failures.length}):\n${failures.map(message => `- ${message}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`Verified 9 ${report.mode} pages: metadata, navigation, ${references} local references, contact integration, and 3 unchanged Astra assets.`);
    console.log(`Syntax passed for ${scripts.size} JavaScript files. Browser behaviour and live email delivery require separate checks.`);
  }
} catch (error) {
  console.error(`Verification could not run: ${error.message}. Run node build.mjs first.`);
  process.exitCode = 1;
}
