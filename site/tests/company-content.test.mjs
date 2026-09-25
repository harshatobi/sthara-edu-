import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { companyPages } from '../company-pages.mjs';

const source = readFileSync(new URL('../source/sthara_site_v2.html', import.meta.url), 'utf8');
const normalize = text => text.replace(/<[^>]*>/g, ' ').replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, x => ({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '})[x]).replace(/\s+/g, ' ').trim();
for (const [page, prefix, count] of [['privacy','pp-',14], ['dpdp','dp-',8]]) {
  test(`${page}: every supplied policy section and substantive block is retained locally`, () => {
    const section = source.split(`<div class="page" id="page-${page}">`)[1]?.split(`</div><!-- /page-${page} -->`)[0];
    assert.ok(section, 'supplied source section exists');
    const ids = [...section.matchAll(new RegExp(`<h3 id="(${prefix}[^"]+)"`, 'g'))].map(match => match[1]);
    assert.equal(ids.length, count);
    const imported = companyPages[page].html;
    for (const id of ids) assert.ok(imported.includes(`id="${id}"`), id);
    const prose = normalize(imported);
    const blocks = [...section.matchAll(/<(p|li|td|th)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(match => normalize(match[2])).filter(Boolean);
    for (const block of blocks) assert.ok(prose.includes(block), `Missing source text: ${block.slice(0, 100)}`);
    assert.doesNotMatch(imported, /href="https?:\/\/(?:www\.)?sthara\.in\/(?:#\/)?(?:about|privacy|dpdp)/);
    assert.notEqual(companyPages[page].incomplete, true);
  });
}
