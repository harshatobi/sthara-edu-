import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { companyPages } from './company-pages.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, 'dist');
const output = resolve(root, '..', 'Sthara_Launch_Preview.html');
const companyNames = ['about', 'privacy', 'dpdp', 'contact'];
const pageNames = new Set([...companyNames, 'student', 'teacher', 'admin', 'parent']);
const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const embedded = new Map();

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function localPath(reference) {
  const path = resolve(dist, reference.replace(/^\//, ''));
  if (!path.startsWith(`${dist}${sep}`)) throw new Error(`Asset escapes dist: ${reference}`);
  return path;
}

function dataURI(reference) {
  const path = localPath(reference);
  if (!embedded.has(path)) {
    const mime = mimeTypes[extname(path).toLowerCase()];
    if (!mime) throw new Error(`Unsupported embedded asset: ${reference}`);
    embedded.set(path, readFile(path).then(bytes => `data:${mime};base64,${bytes.toString('base64')}`));
  }
  return embedded.get(path);
}

async function replaceAsync(text, pattern, replace) {
  const matches = [...text.matchAll(pattern)];
  const values = await Promise.all(matches.map(replace));
  let result = '', cursor = 0;
  matches.forEach((match, index) => {
    result += text.slice(cursor, match.index) + values[index];
    cursor = match.index + match[0].length;
  });
  return result + text.slice(cursor);
}

function routeURL(value) {
  let href = value;
  if (/^https?:\/\/(?:www\.)?sthara\.in(?:\/|$)/i.test(href)) {
    const url = new URL(href);
    if (url.search) return value;
    href = `${url.pathname}${url.hash}`;
  }
  if (href === '/') return '#top';
  if (href.startsWith('/#/')) {
    try { href = `/${decodeURIComponent(href.slice(3))}`; } catch { return value; }
  }
  if (href.startsWith('/#')) return href.slice(1);
  const match = href.match(/^\/([^/#]+?)(?:\.html)?\/?(#.*)?$/);
  if (match && (pageNames.has(match[1]) || /^\$\{(?:role|key|other)\}$/.test(match[1]))) return `#/${match[1]}${match[2] || ''}`;
  return value;
}

function localLinks(text) {
  return text.replace(/href=(['"])([^'"]+)\1/g, (_match, quote, href) => `href=${quote}${routeURL(href)}${quote}`);
}

async function embedMarkup(html) {
  return replaceAsync(localLinks(html), /\b(src|href)=(['"])(\/?assets\/[^'"<>]+)\2/g,
    async match => `${match[1]}=${match[2]}${await dataURI(match[3])}${match[2]}`);
}

function inlineScript(source) {
  new Script(source);
  return `<script>\n${source.replace(/<\/script/gi, '<\\/script')}\n</script>`;
}

let html = await readFile(resolve(dist, 'index.html'), 'utf8');
if (!html.includes('id="role-page"')) throw new Error('Build the launch website before exporting.');
html = html
  .replace('<html ', '<html data-standalone="true" ')
  .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex,nofollow">')
  .replace(/\s*<link rel="(?:canonical|preload)"[^>]*>/g, '')
  .replace(/\s*<meta property="og:(?:url|image)"[^>]*>/g, '')
  .replace('<div id="role-page" hidden></div>', '<div id="role-page" hidden></div>\n    <div id="company-page" hidden></div>');

const templates = await Promise.all(companyNames.map(async name => {
  const page = companyPages[name];
  if (!page?.html || !page.title) throw new Error(`Missing company page: ${name}`);
  return `<template id="standalone-${name}" data-title="${escape(page.title)}">${await embedMarkup(page.html)}</template>`;
}));
html = html.replace('</main>', `</main>\n${templates.join('\n')}`);

html = await replaceAsync(html, /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, async match => {
  const css = await readFile(localPath(match[1]), 'utf8');
  const inlined = await replaceAsync(css, /url\(\s*(['"]?)(\/?assets\/[^\s)'"<>]+)\1\s*\)/g, async asset => `url("${await dataURI(asset[2])}")`);
  return `<style>\n${inlined}\n</style>`;
});
html = await embedMarkup(html);

const captureNames = (await readdir(resolve(dist, 'assets/captures'))).filter(name => name.endsWith('.png')).sort();
const captureEntries = await Promise.all(captureNames.map(async name => [name.slice(0, -4), await dataURI(`assets/captures/${name}`)]));
const captureMap = `window.STHARA_CAPTURE_IMAGES=${JSON.stringify(Object.fromEntries(captureEntries))};`;
html = await replaceAsync(html, /<script\b[^>]*src="([^"]+)"[^>]*>\s*<\/script>/g, async match => {
  const name = match[1].replace(/^\//, '');
  let source = await readFile(name === 'launch.js' ? resolve(root, 'standalone.js') : localPath(match[1]), 'utf8');
  source = localLinks(source);
  if (name === 'capture-gallery.js') source = `${captureMap}\n${source}`;
  // Never load the API client or Turnstile from a disk-opened preview.
  if (name === 'enquiry-form.js') source = `if (location.protocol === 'http:' || location.protocol === 'https:') {\n${source}\n}`;
  return inlineScript(source);
});

if (/<script\b[^>]*src=|<link\b[^>]*rel="stylesheet"/i.test(html)) throw new Error('An external script or stylesheet remains.');
if (/(?:src|href)=["']\/?assets\//.test(html) || /url\(['"]?\/?assets\//.test(html)) throw new Error('A local asset was not embedded.');
for (const [, , href] of html.matchAll(/href=(['"])([^'"]+)\1/g)) {
  if (routeURL(href) !== href) throw new Error(`A navigation link leaves the preview: ${href}`);
}
await writeFile(output, html);
console.log(`Exported ${output} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB).`);
