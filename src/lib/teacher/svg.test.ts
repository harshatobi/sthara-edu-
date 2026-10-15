import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSvg } from './svg';

const ok = '<svg viewBox="0 0 400 200"><defs><marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z"/></marker></defs><line x1="10" y1="100" x2="300" y2="100" stroke="#000" marker-end="url(#arr)"/><text x="20" y="90" font-size="14">Incident ray &amp; normal</text></svg>';

test('a clean diagram passes through intact', () => {
  const s = sanitizeSvg(ok)!;
  assert.match(s, /^<svg font-family="Arial, Helvetica, sans-serif" xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 400 200">/);
  assert.match(s, /marker-end="url\(#arr\)"/);
  assert.match(s, /<text x="20" y="90" font-size="14">Incident ray &amp; normal<\/text>/);
});

test('scripts, handlers, links, foreign content, styles and external urls never survive', () => {
  const evil = `<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><rect width="5" height="5" onclick="x()" style="fill:url(http://e.vil/x)" fill="url(http://e.vil/p)"/>
    <a href="javascript:alert(1)"><circle r="2"/></a><foreignObject><div>hi<img src=x onerror=alert(1)></div></foreignObject>
    <image href="http://e.vil/i.png"/><use href="#x"/><style>*{background:url(http://e.vil)}</style><text x="1" y="1">&lt;script&gt;</text></svg>`;
  const s = sanitizeSvg(evil)!;
  for (const bad of [/onload/, /onclick/, /onerror/, /script>/, /javascript/, /<a\b/, /foreignObject/, /<image/, /<use/, /<style/, /e\.vil/, /style=/, /<div/, /<img/]) {
    assert.doesNotMatch(s, bad, `${bad} removed`);
  }
  assert.match(s, /<rect width="5" height="5"\/>/, 'the shape stays, its bad attributes go');
  assert.match(s, /&lt;script&gt;/, 'text is escaped, not executed');
});

test('not a drawing: refused', () => {
  assert.equal(sanitizeSvg('<div>no svg</div>'), null);
  assert.equal(sanitizeSvg('<svg viewBox="0 0 1 1"><title>empty</title></svg>'), null, 'nothing drawable');
  assert.equal(sanitizeSvg('x'.repeat(50_000)), null, 'too big');
  assert.equal(sanitizeSvg(42), null);
});

test('a missing viewBox is supplied; unclosed elements are closed; nested svg is dropped', () => {
  const s = sanitizeSvg('<svg width="10"><g><rect width="1" height="1"/><svg><circle r="9"/></svg>')!;
  assert.match(s, /viewBox="0 0 800 500"/);
  assert.doesNotMatch(s, /<circle/);
  assert.match(s, /<\/g><\/svg>$/);
});
