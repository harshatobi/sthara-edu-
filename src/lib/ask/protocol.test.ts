import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankReply, canSee, canSeeAll, emptyActionBook, inrShort, parseAnswer, parsePlan, readReply, Sources, titleOf, toolsFor, topTiles, type Viewer } from './protocol';

const teacher: Viewer = { kind: 'staff', id: 't1', name: 'Kavya Rao', schoolId: 's', role: 'teacher', classes: ['9b', '10a'], classTeacherOf: '9b', perms: [], label: 'Teacher' };
const principal: Viewer = { kind: 'staff', id: 'p1', name: 'P', schoolId: 's', role: 'admin', classes: [], classTeacherOf: '', perms: ['dashboard.view', 'academics.read', 'attendance.read', 'fees.read', 'workforce.read', 'exams.read', 'students.read', 'admissions.read'], label: 'Principal' };
const cashier: Viewer = { kind: 'staff', id: 'c1', name: 'C', schoolId: 's', role: 'admin', classes: [], classTeacherOf: '', perms: ['dashboard.view', 'fees.read', 'fees.collect'], label: 'Cashier' };
const parent: Viewer = { kind: 'parent', id: 'g1', name: 'L', schoolId: 's', childIds: ['k1'] };

test('lookups follow the role', () => {
  assert.deepEqual(toolsFor(teacher), ['student', 'class', 'homework', 'attendance', 'exams', 'timetable', 'calendar']);
  assert.ok(toolsFor(principal).includes('fees') && toolsFor(principal).includes('staff') && toolsFor(principal).includes('admissions'));
  // A cashier reads fees (and a student's fee record), never classes or staff.
  assert.deepEqual(toolsFor(cashier), ['student', 'fees', 'timetable', 'calendar']);
  assert.deepEqual(toolsFor(parent), ['child', 'child_attendance', 'child_timetable', 'calendar']);
});

test('parsePlan keeps allowed lookups only, at most four, string args only', () => {
  const plan = parsePlan({ lookups: [
    { tool: 'fees', args: { class: '8' } },
    { tool: 'class', args: { class: '9-B', subject: 'Science', junk: 'x' } },
    { tool: 'class', args: { class: '9-B', subject: 'Science' } },
    { tool: 'student', args: { student: '[[S3]]', from: 20261001 } },
    { tool: 'attendance', args: { class: '9-B' } },
    { tool: 'timetable', args: {} },
    { tool: 'calendar', args: {} },
  ] }, toolsFor(teacher));
  assert.equal(plan.length, 4);
  assert.deepEqual(plan[0], { tool: 'class', args: { class: '9-B', subject: 'Science' } });
  assert.equal(plan[1].args.from, '20261001');
  assert.ok(!plan.some(p => p.tool === 'fees'));
  assert.deepEqual(parsePlan(null, toolsFor(teacher)), []);
  assert.deepEqual(parsePlan({ lookups: 'all' }, toolsFor(teacher)), []);
});

test('canSee: permissions, classes, either-of, self and school', () => {
  assert.ok(canSee('perm:fees.read', cashier));
  assert.ok(!canSee('perm:fees.read', teacher));
  assert.ok(canSee('class:9-B', teacher));
  assert.ok(!canSee('class:8-A', teacher));
  assert.ok(canSee('class:8-A', principal));
  assert.ok(!canSee('class:8-A', cashier));
  assert.ok(canSee('self|perm:academics.read', principal));
  assert.ok(canSee('self|perm:academics.read', teacher, 't1'));
  assert.ok(!canSee('self|perm:academics.read', cashier, 't1'));
  assert.ok(canSee('school', parent) && canSee('staff', cashier) && !canSee('staff', parent));
  assert.ok(canSee('child:k1', parent) && !canSee('child:k2', parent) && !canSee('perm:fees.read', parent));
  assert.ok(canSeeAll(['class:9b', 'perm:fees.read'], principal));
  assert.ok(!canSeeAll(['class:9b', 'perm:fees.read'], teacher));
  assert.ok(canSeeAll([], cashier));
});

test('parseAnswer: cited sources only, renumbered, with what they need', () => {
  const src = new Sources();
  const a = src.add({ label: 'Fees', detail: 'ledger', href: '/admin/fees', need: 'perm:fees.read' });
  const b = src.add({ label: 'Mastery Tracker', detail: '9-B', href: '/admin/academic', need: 'class:9-B' });
  const c = src.add({ label: 'Attendance register', detail: '9-B', href: '/admin/attendance', need: 'class:9-B' });
  assert.equal(src.add({ label: 'Fees', detail: 'ledger', href: '/admin/fees', need: 'perm:fees.read' }), a, 'same source, same number');
  const { reply, needs } = parseAnswer({
    say: `Mastery fell to 54% [${b}] while attendance held [${c}]. Ignore [9].`,
    facts: [{ label: 'Mastery', value: '54%', tone: 'r' }, { label: '', value: 'x' }],
    table: { title: 'Lowest', columns: ['Student', 'Mastery'], rows: [['A', '38%'], ['B'], 'bad'], note: `From the tracker [${b}]` },
    chart: { title: 'Hand-ins', unit: '%', points: [{ label: '13 Oct', value: '86%' }, { label: '20 Oct', value: 61, warn: true }, { label: 'x', value: 'n/a' }] },
    actions: [{ kind: 'open', page: 'fees' }, { kind: 'reply', thread: '[[M9]]', draft: 'hi' }],
    suggestions: ['Compare with 9-A', 42],
  }, src, emptyActionBook({ fees: { href: '/admin/fees', label: 'Fees' } }), ['class overview, 9-B']);
  assert.equal(reply.say, 'Mastery fell to 54% [1] while attendance held [2]. Ignore .');
  assert.deepEqual(reply.sources.map(s => [s.n, s.label]), [[1, 'Mastery Tracker'], [2, 'Attendance register']]);
  assert.equal(reply.table?.note, 'From the tracker [1]');
  assert.deepEqual(reply.table?.rows, [['A', '38%'], ['B', '']]);
  assert.deepEqual(reply.chart?.points.map(p => p.value), [86, 61]);
  assert.equal(reply.facts.length, 1);
  assert.deepEqual(reply.actions, [{ kind: 'open', href: '/admin/fees', label: 'Fees' }]);
  assert.deepEqual(reply.suggestions, ['Compare with 9-A', '42']);
  assert.deepEqual(reply.lookups, ['class overview, 9-B']);
  assert.deepEqual(needs, ['class:9-B']);
});

test('parseAnswer: parent message actions resolve tokens or fall back to the office', () => {
  const book = emptyActionBook();
  book.staff.set('T1', { id: 'u-t1', name: 'Kavya Rao' });
  book.children.set('C1', { id: 'k1', name: 'Aarav Reddy' });
  const r1 = parseAnswer({ say: 'ok', actions: [{ kind: 'message', to: '[[T1]]', child: '[[C1]]', topic: 'meeting', subject: 'Meet', draft: 'Can we meet?' }] }, new Sources(), book, []).reply;
  assert.deepEqual(r1.actions[0], { kind: 'message', audience: 'teacher', to: 'u-t1', toName: 'Kavya Rao', childId: 'k1', topic: 'meeting', subject: 'Meet', draft: 'Can we meet?' });
  const r2 = parseAnswer({ say: 'ok', actions: [{ kind: 'message', to: 'office', topic: 'odd', draft: 'Fees?' }] }, new Sources(), book, []).reply;
  assert.equal(r2.actions[0].kind === 'message' && r2.actions[0].audience, 'office');
  assert.equal(r2.actions[0].kind === 'message' && r2.actions[0].topic, 'general');
});

test('shared answers the colleague cannot see are blanked, keeping only source labels', () => {
  const r = readReply({ say: 'Secret', facts: [{ label: 'x', value: '1', tone: 'g' }], sources: [{ n: 1, label: 'Fees', detail: 'ledger', href: '/admin/fees' }] })!;
  const b = blankReply(r);
  assert.ok(!b.say.includes('Secret'));
  assert.deepEqual(b.facts, []);
  assert.deepEqual(b.sources, [{ n: 1, label: 'Fees', detail: 'ledger', href: null }]);
  assert.equal(readReply('nope'), null);
});

test('helpers', () => {
  assert.equal(titleOf('  Why   is 9-B slipping?  '), 'Why is 9-B slipping?');
  assert.equal(titleOf(''), 'New conversation');
  assert.equal(titleOf('x'.repeat(100)).length, 80);
  assert.equal(inrShort(480000), '₹4.8 L');
  assert.equal(inrShort(21600000), '₹2.16 Cr');
  assert.equal(inrShort(18500), '₹18,500');
  const t = (key: string, weight: number) => ({ key, weight, tone: 'b' as const, icon: 'check' as const, label: '', value: '', detail: '', ask: '', href: null });
  assert.deepEqual(topTiles([t('a', 1), t('b', 9), t('c', 5), t('d', 7), t('e', 3)]).map(x => x.key), ['b', 'd', 'c', 'e']);
});
