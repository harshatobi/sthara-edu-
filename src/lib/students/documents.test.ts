import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canManageKind, canSeeKind, checkChecklist, checklistFor, checklistOf, checkMeta, cleanFileName, DEFAULT_CHECKLIST, inlineType, isMedical,
} from './documents';

test('medical and disability documents need health.read; everything else students.read', () => {
  const reader = { students: true, health: false }, nurse = { students: false, health: true };
  assert.ok(canSeeKind('birth_certificate', reader) && canSeeKind('caste_certificate', reader));
  assert.ok(!canSeeKind('disability_certificate', reader) && !canSeeKind('medical_certificate', reader));
  assert.ok(canSeeKind('medical_certificate', nurse) && !canSeeKind('transfer_certificate', nurse));
  assert.ok(canManageKind('vaccination_record', nurse) && !canManageKind('birth_certificate', nurse), 'the health officer manages medical kinds only');
  assert.ok(canManageKind('vaccination_record', reader), 'the registrar may file any kind');
  assert.ok(!canSeeKind('no_such_kind', nurse) && canSeeKind('no_such_kind', reader), 'unknown kinds are not medical');
  assert.ok(isMedical('disability_certificate') && !isMedical('income_certificate'));
});

test('checklist: only a verified document still in date counts', () => {
  const items = DEFAULT_CHECKLIST;
  const today = '2026-10-23';
  const at = (grade: number, docs: Parameters<typeof checklistFor>[2]) => Object.fromEntries(checklistFor(items, grade, docs, today).map(c => [c.kind, c.state]));
  const lkg = at(-1, []);
  assert.equal(lkg.transfer_certificate, undefined, 'no TC before Class 2');
  assert.equal(lkg.report_card, undefined);
  assert.equal(lkg.birth_certificate, 'missing');
  const c5 = at(5, [
    { kind: 'birth_certificate', status: 'verified', valid_until: null },
    { kind: 'aadhaar_card', status: 'awaiting', valid_until: null },
    { kind: 'transfer_certificate', status: 'rejected', valid_until: null },
    { kind: 'address_proof', status: 'verified', valid_until: '2026-01-01' },
    { kind: 'parent_id', status: 'rejected', valid_until: null }, { kind: 'parent_id', status: 'verified', valid_until: '2027-01-01' },
  ]);
  assert.deepEqual(c5, { birth_certificate: 'verified', aadhaar_card: 'awaiting', transfer_certificate: 'rejected', report_card: 'missing', address_proof: 'expired', parent_id: 'verified' });
});

test('checklist settings: the default until set; a saved list is checked kind by kind', () => {
  assert.deepEqual(checklistOf(null), DEFAULT_CHECKLIST);
  assert.deepEqual(checklistOf({ documents: { checklist: [] } }), [], 'an empty list means nothing is asked for');
  assert.deepEqual(checklistOf({ documents: { checklist: [{ kind: 'passport', from: 1, to: 12 }, { kind: 'nope', from: 1, to: 2 }] } }), [{ kind: 'passport', from: 1, to: 12 }]);
  assert.ok('error' in checkChecklist([{ kind: 'passport', from: 5, to: 2 }]));
  assert.ok('error' in checkChecklist([{ kind: 'passport', from: 1, to: 2 }, { kind: 'passport', from: 3, to: 4 }]));
  assert.ok('error' in checkChecklist([{ kind: 'passport', from: 13, to: 14 }]));
  assert.deepEqual(checkChecklist([{ kind: 'ews_certificate', from: '-2', to: '8' }]), { value: [{ kind: 'ews_certificate', from: -2, to: 8 }] });
});

test('upload details: kind required, dates real and in order, title defaults to the kind', () => {
  const today = '2026-10-23';
  assert.deepEqual(checkMeta({ kind: 'income_certificate', issued_on: '2026-04-01', valid_until: '2027-03-31' }, today),
    { value: { kind: 'income_certificate', title: 'Income certificate', document_no: null, issued_on: '2026-04-01', valid_until: '2027-03-31' } });
  assert.ok('error' in checkMeta({ kind: 'x' }, today));
  assert.ok('error' in checkMeta({ kind: 'passport', issued_on: '2026-02-30' }, today), 'not a real day');
  assert.ok('error' in checkMeta({ kind: 'passport', issued_on: '2027-01-01' }, today), 'issued in the future');
  assert.ok('error' in checkMeta({ kind: 'passport', issued_on: '2026-01-02', valid_until: '2026-01-01' }, today));
  assert.equal(cleanFileName('C:\\scans\\tc.pdf'), 'tc.pdf');
  assert.equal(cleanFileName('a/b/\u0007c.jpg'), 'c.jpg');
  assert.equal(cleanFileName('   '), null);
});

test('only real PDFs and images open in the browser', () => {
  const b = (s: string) => new Uint8Array([...s].map(c => c.charCodeAt(0)));
  assert.equal(inlineType(b('%PDF-1.7 ....')), 'application/pdf');
  assert.equal(inlineType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(inlineType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(inlineType(b('RIFF....WEBPVP8 ')), 'image/webp');
  assert.equal(inlineType(b('<html><script>')), null, 'a page never opens inline');
  assert.equal(inlineType(b('<svg xmlns=')), null, 'nor an SVG, which can carry script');
});
