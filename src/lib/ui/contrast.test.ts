import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TML_BANDS, bandColor, bandLabel, tmlBand } from '../tml/bands';

// The Dusk role colours (docs/handoffs/sthara-dusk-handoff.md) and the TML band pills must stay readable:
// every text-on-fill pair below passes WCAG AA, 4.5:1. Role colours are read from canon.css itself, so a
// token edited there is checked here without a second copy to keep in step.

const hex = (h: string) => { const v = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255); };
const lum = (h: string) => {
  const [r, g, b] = hex(h).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
/** color-mix(in srgb, a p%, b), the way canon.css derives the Dusk sidebar top. */
const mix = (a: string, b: string, p: number) =>
  '#' + hex(a).map((c, i) => Math.round((c * p + hex(b)[i] * (1 - p)) * 255).toString(16).padStart(2, '0')).join('');

const AA = 4.5;
const WHITE = '#FFFFFF', NAVY = '#002147';
const css = readFileSync(join(process.cwd(), 'src/styles/canon.css'), 'utf8');

function roleTokens(role: string) {
  const block = css.match(new RegExp(`\\.canon\\[data-role="${role}"\\][^{]*\\{([^}]*)\\}`))?.[1];
  assert.ok(block, `canon.css defines data-role="${role}"`);
  const deep = block.match(/--role-deep:(#[0-9A-Fa-f]{6})/)?.[1];
  const soft = block.match(/--role-soft:(#[0-9A-Fa-f]{6})/)?.[1];
  const duskPct = block.match(/--role-dusk:color-mix\(in srgb, #[0-9A-Fa-f]{6} (\d+)%, (#[0-9A-Fa-f]{6})\)/);
  assert.ok(deep && soft, `${role} has deep and soft colours`);
  const dusk = duskPct ? mix(deep!, duskPct[2], Number(duskPct[1]) / 100) : NAVY;
  return { deep: deep!, soft: soft!, dusk };
}

for (const role of ['student', 'teacher', 'admin', 'parent', 'ops']) {
  test(`contrast: ${role} role colours`, () => {
    const t = roleTokens(role);
    assert.ok(ratio(WHITE, t.deep) >= AA, `white on ${role} deep ${t.deep}: ${ratio(WHITE, t.deep).toFixed(2)}`);
    assert.ok(ratio(t.deep, WHITE) >= AA, `${role} deep as text on white`);
    assert.ok(ratio(NAVY, t.soft) >= AA, `navy on the ${role} active pill ${t.soft}: ${ratio(NAVY, t.soft).toFixed(2)}`);
    // The pastel kicker sits on the top of the sidebar gradient (the dusk colour) and fades to navy below.
    for (const ground of [t.dusk, NAVY]) assert.ok(ratio(t.soft, ground) >= AA, `${role} soft on ${ground}: ${ratio(t.soft, ground).toFixed(2)}`);
  });
}

test('contrast: crimson for AI and risk', () => {
  const ai = css.match(/--ai:(#[0-9A-Fa-f]{6})/)?.[1], aiDark = css.match(/--ai-dark:(#[0-9A-Fa-f]{6})/)?.[1];
  const wash = css.match(/--ai-wash:(#[0-9A-Fa-f]{6})/)?.[1], ink = css.match(/--ai-ink:(#[0-9A-Fa-f]{6})/)?.[1];
  assert.ok(ai && aiDark && wash && ink);
  assert.ok(ratio(WHITE, ai!) >= AA, 'white on an AI button');
  assert.ok(ratio(ink!, wash!) >= AA, 'the AI tag');
  assert.ok(ratio(aiDark!, NAVY) >= AA, 'AI icon on the navy sidebar');
});

test('contrast: every TML band pill', () => {
  for (const b of TML_BANDS) assert.ok(ratio(b.ink, b.color) >= AA, `${b.label.staff}: ${b.ink} on ${b.color} = ${ratio(b.ink, b.color).toFixed(2)}`);
});

test('bands: ranges, and the bottom label by audience', () => {
  assert.deepEqual([95, 90, 89, 75, 74, 50, 49, 35, 34, 0].map(v => tmlBand(v).key),
    ['exemplary', 'exemplary', 'proficient', 'proficient', 'developing', 'developing', 'critical', 'critical', 'severe', 'severe']);
  assert.equal(bandLabel(20, 'staff'), 'Severe need');
  assert.equal(bandLabel(20, 'family'), 'Needs support');
  assert.equal(bandColor(20), '#E11D48');
});
