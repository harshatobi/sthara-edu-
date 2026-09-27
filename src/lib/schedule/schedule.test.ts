import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agenda, bellProblems, bellsFor, findClashes, clashesFor, periodsPerWeek, sectionsOf, subjectTeachers, teacherLoad, versionOn, weekdayOf, weekStart, wingOf } from './engine';
import { matchTeacher, parseAsc, parseCell, parseCsv, parseDay, parsePeriod, parseTable, readXlsx, resolve } from './importer';
import type { AcademicEvent, BellSchedule, ScheduleRows, Slot, TimetableVersion, Wing } from './types';

const wings: Wing[] = [{ id: 'w-pri', name: 'Primary', grade_from: 0, grade_to: 5 }, { id: 'w-sen', name: 'Senior', grade_from: 6, grade_to: 12 }];
const period = (no: number, s: string, e: string) => ({ seq: no + 1, label: `P${no}`, kind: 'period' as const, period_no: no, starts_at: s, ends_at: e });
const bells: BellSchedule[] = [
  { id: 'b-sen', name: 'Senior regular', wing_id: 'w-sen', kind: 'regular', weekdays: [1, 2, 3, 4, 5],
    periods: [{ seq: 1, label: 'Assembly', kind: 'assembly', period_no: null, starts_at: '08:00', ends_at: '08:20' }, period(1, '08:20', '09:00'), period(2, '09:00', '09:40')] },
  { id: 'b-pri', name: 'Primary regular', wing_id: 'w-pri', kind: 'regular', weekdays: [1, 2, 3, 4, 5], periods: [period(1, '08:30', '09:05'), period(2, '09:05', '09:40')] },
  { id: 'b-all-sat', name: 'Saturday', wing_id: null, kind: 'regular', weekdays: [6], periods: [period(1, '08:00', '08:30')] },
  { id: 'b-exam', name: 'Exam day', wing_id: null, kind: 'variant', weekdays: [], periods: [period(1, '09:00', '12:00')] },
];
const ev = (o: Partial<AcademicEvent>): AcademicEvent => ({
  id: 'e', title: 'x', kind: 'event', starts_on: '2026-10-02', ends_on: '2026-10-02', wing_ids: null, bell_schedule_id: null,
  suspends_classes: false, staff_scope: 'none', starts_at: null, ends_at: null, notes: null, ...o,
});
const v = (id: string, status: TimetableVersion['status'], from: string | null): TimetableVersion =>
  ({ id, session: '2026-27', name: id, status, effective_from: from, source: 'manual', notes: null, published_at: from ? `${from}T00:00:00Z` : null, created_at: '' });
const slot = (o: Partial<Slot>): Slot => ({ class: 'Class 10-A', group_label: '', weekday: 1, period_no: 1, subject: 'Maths', teacher_id: 't1', room_id: null, combined: false, ...o });

test('dates and wings', () => {
  assert.equal(weekdayOf('2026-09-28'), 1); // Monday
  assert.equal(weekdayOf('2026-10-04'), 7);
  assert.equal(weekStart('2026-10-01'), '2026-09-28');
  assert.equal(wingOf('Class 3-B', wings)?.id, 'w-pri');
  assert.equal(wingOf('UKG-A', wings)?.id, 'w-pri');
  assert.equal(wingOf('Class 11-A', wings)?.id, 'w-sen');
});

test('bells: holiday, variant, wing-specific regular, all-wing fallback', () => {
  const events = [ev({ id: 'h', kind: 'holiday', starts_on: '2026-10-02', suspends_classes: true }), ev({ id: 'x', kind: 'exam', starts_on: '2026-10-05', ends_on: '2026-10-06', bell_schedule_id: 'b-exam', wing_ids: ['w-sen'] })];
  assert.equal(bellsFor('2026-10-02', 'w-sen', bells, events).off?.id, 'h');
  assert.equal(bellsFor('2026-10-05', 'w-sen', bells, events).schedule?.id, 'b-exam');
  assert.equal(bellsFor('2026-10-05', 'w-pri', bells, events).schedule?.id, 'b-pri', 'exam variant is Senior only');
  assert.equal(bellsFor('2026-10-03', 'w-pri', bells, events).schedule?.id, 'b-all-sat');
  assert.equal(bellsFor('2026-10-04', 'w-pri', bells, events).schedule, null, 'Sunday has no bells');
});

test('bell problems', () => {
  assert.deepEqual(bellProblems(bells[0].periods), []);
  assert.ok(bellProblems([period(1, '08:00', '08:40'), period(2, '08:30', '09:00')]).some(p => /overlap/.test(p)));
  assert.ok(bellProblems([period(1, '08:00', '08:40'), { ...period(1, '08:40', '09:20'), seq: 5 }]).some(p => /share a number/.test(p)));
});

test('version in force', () => {
  const vs = [v('a', 'published', '2026-04-01'), v('b', 'published', '2026-10-01'), v('c', 'draft', null), v('d', 'archived', '2026-09-01')];
  assert.equal(versionOn(vs, '2026-09-30')?.id, 'a');
  assert.equal(versionOn(vs, '2026-10-01')?.id, 'b');
  assert.equal(versionOn(vs, '2026-03-01'), null);
});

test('clashes: teacher, room (via home room), section, combined lessons allowed', () => {
  const rooms = [{ id: 'r1', name: '10A room', kind: 'classroom' as const, capacity: 40, home_class: 'Class 10-A', active: true }];
  const a = slot({ id: '1' });
  const b = slot({ id: '2', class: 'Class 10-B' });
  assert.deepEqual(findClashes([a, b]).map(c => c.kind), ['teacher']);
  assert.deepEqual(findClashes([{ ...a, combined: true }, { ...b, combined: true }]), [], 'combined same subject is fine');
  assert.equal(findClashes([{ ...a, combined: true }, { ...b, combined: true, subject: 'Physics' }]).length, 1, 'combined needs the same subject');
  const c = slot({ id: '3', class: 'Class 10-B', teacher_id: 't2', room_id: 'r1' });
  assert.deepEqual(findClashes([a, c], rooms).map(x => x.kind), ['room'], '10-B booked into 10-A home room');
  assert.deepEqual(findClashes([a, slot({ id: '4', teacher_id: 't3', group_label: 'Bio' })]).map(x => x.kind), ['section'], 'whole class beside a group');
  assert.deepEqual(findClashes([slot({ id: '5', group_label: 'Bio' }), slot({ id: '6', teacher_id: 't3', group_label: 'CS' })]), [], 'two groups at once');
  assert.deepEqual(findClashes([slot({ id: '7', group_label: 'Bio' }), slot({ id: '8', teacher_id: 't3', group_label: 'CS' })], rooms), [], 'split groups with no room set do not both claim the home room');
  assert.equal(findClashes([slot({ id: '9', group_label: 'Bio', room_id: 'r1' }), slot({ id: '10', teacher_id: 't3', group_label: 'CS', room_id: 'r1' })], rooms).length, 1, 'but two groups in the same named room clash');
  assert.equal(clashesFor(slot({ id: '1', subject: 'Physics' }), [a, b]).length, 1, 'editing a lesson ignores itself');
});

test('load and periods per week', () => {
  const s = [slot({ weekday: 1 }), slot({ weekday: 2 }), slot({ weekday: 3, subject: 'Physics' }),
    slot({ class: 'Class 10-B', weekday: 4, combined: true }), slot({ class: 'Class 10-C', weekday: 4, combined: true }),
    slot({ weekday: 5, group_label: 'G1', teacher_id: 't2' }), slot({ weekday: 5, group_label: 'G2', teacher_id: 't3' })];
  const load = teacherLoad(s);
  assert.equal(load.get('t1'), 4, 'combined counts once');
  const ppw = periodsPerWeek(s);
  assert.equal(ppw.find(x => x.cls === 'Class 10-A' && x.subject === 'Maths')?.periods, 3, 'split groups count once');
  assert.equal(subjectTeachers(s).get('10a::maths'), 't1');
});

test('sections come from students, scopes, timetable and home rooms', () => {
  const secs = sectionsOf({
    studentClasses: ['10a', 'Class 9-B'], slots: [slot({ class: '11 C' })], rooms: [{ id: 'r', name: 'x', kind: 'classroom', capacity: null, home_class: 'Class 2-A', active: true }],
    people: [{ id: 't', name: 'T', role: 'teacher', email: null, assignments: [{ class: 'Class 10-A', subject: 'Maths' }, { class: 'Class 12-A', subject: 'Maths' }] }],
  });
  assert.deepEqual(secs, ['Class 2-A', 'Class 9-B', 'Class 10-A', 'Class 11-C', 'Class 12-A']);
});

test('agenda: a teacher across wings, holiday, leave, events', () => {
  const rows: ScheduleRows = {
    schoolName: 'Test School', wings, bells, rooms: [], versions: [v('pub', 'published', '2026-04-01'), v('draft', 'draft', null)],
    slots: [
      slot({ version_id: 'pub', weekday: 1, period_no: 1 }),
      slot({ version_id: 'pub', class: 'Class 3-A', weekday: 1, period_no: 2, subject: 'EVS' }),
      slot({ version_id: 'draft', weekday: 1, period_no: 2, subject: 'Draft only' }),
    ],
    events: [
      ev({ id: 'hp', title: 'Primary sports day', kind: 'holiday', starts_on: '2026-10-05', ends_on: '2026-10-05', wing_ids: ['w-pri'], suspends_classes: true }),
      ev({ id: 'ptm', title: 'PTM', kind: 'ptm', starts_on: '2026-10-05', ends_on: '2026-10-05', staff_scope: 'teaching', starts_at: '14:00', ends_at: '16:00' }),
    ],
    staff: [], people: [{ id: 't1', name: 'Anita Rao', role: 'teacher', email: null }], studentClasses: [],
    leave: [{ id: 'l', staff_id: 't1', leave_type: 'casual', from_date: '2026-10-12', to_date: '2026-10-12', half_day: false, status: 'approved' }],
    absences: [], covers: [], dutyPosts: [], roster: [], duties: [], visits: [], compOffs: [],
    missing: [],
  };
  const [mon] = agenda({ kind: 'teacher', userId: 't1' }, '2026-09-28', '2026-09-28', rows);
  const lessons = mon.items.filter(i => i.kind === 'lesson') as any[];
  assert.deepEqual(lessons.map(l => [l.slot.subject, l.start]), [['Maths', '08:20'], ['EVS', '09:05']], 'each lesson on its own wing clock; drafts ignored');

  const [holiday] = agenda({ kind: 'teacher', userId: 't1' }, '2026-10-05', '2026-10-05', rows);
  assert.equal(holiday.cancelled, 1, 'the Primary lesson is off');
  assert.equal(holiday.off, null, 'the teacher still has Senior classes');
  const ptm = holiday.items.find(i => i.kind === 'event' && i.event.id === 'ptm') as any;
  assert.ok(ptm?.required);

  const [onLeave] = agenda({ kind: 'teacher', userId: 't1' }, '2026-10-12', '2026-10-12', rows);
  assert.equal(onLeave.items[0].kind, 'leave');
  assert.ok((onLeave.items.filter(i => i.kind === 'lesson') as any[]).every(l => l.covered));

  const [cls] = agenda({ kind: 'class', cls: '10a' }, '2026-09-28', '2026-09-28', rows);
  assert.deepEqual(cls.items.map(i => i.kind), ['bell', 'lesson'], 'assembly then P1');
});

test('import: cells, days, periods, csv', () => {
  assert.equal(parseDay('Wednesday'), 3);
  assert.equal(parseDay('Th'), 4);
  assert.equal(parsePeriod('P3'), 3);
  assert.equal(parsePeriod('Period 7'), 7);
  assert.equal(parsePeriod('IV'), 4);
  assert.equal(parsePeriod('2nd'), 2);
  assert.deepEqual(parseCell('Maths / Anita Rao / Lab 1'), { subject: 'Maths', teacher: 'Anita Rao', room: 'Lab 1' });
  assert.deepEqual(parseCell('Physics (R. Iyer) [Physics Lab]'), { subject: 'Physics', teacher: 'R. Iyer', room: 'Physics Lab' });
  assert.equal(parseCell('Break'), null);
  assert.deepEqual(parseCsv('a,"b, c","d ""q"""\r\n1,2,3\n'), [['a', 'b, c', 'd "q"'], ['1', '2', '3']]);
});

test('import: long, grade + section, grid and FET layouts', () => {
  const long = parseTable(parseCsv('Class,Day,Period,Subject,Teacher,Room\n10-A,Mon,1,Maths,Anita Rao,\n10-A,Mon,abc,Maths,,'));
  assert.equal(long.format, 'long');
  assert.equal(long.rows.length, 1);
  assert.equal(long.problems.length, 1);
  const split = parseTable([['Grade', 'Section', 'Day', 'Period', 'Subject'], ['10', 'B', 'Tue', '2', 'English']]);
  assert.equal(split.rows[0].class, '10-B');
  const grid = parseTable(parseCsv('Class,Day,P1,P2,P3\n10-A,Monday,Maths / Anita Rao,Break,English (Ravi Kumar)'));
  assert.equal(grid.format, 'grid');
  assert.deepEqual(grid.rows.map(r => [r.period, r.subject, r.teacher]), [[1, 'Maths', 'Anita Rao'], [3, 'English', 'Ravi Kumar']]);
  const fet = parseTable(parseCsv('"Activity Id","Day","Hour","Students Sets","Subject","Teachers","Activity Tags","Room","Comments"\n1,Monday,09:00,10A+10B,PE,Coach Singh,,Ground,\n2,Monday,08:15,10A G1,Biology,Meena,,,'));
  assert.equal(fet.format, 'fet');
  assert.deepEqual(fet.rows.map(r => [r.class, r.group, r.period, r.combined]), [['10A', '', 2, true], ['10B', '', 2, true], ['10A', 'G1', 1, false]]);
});

test('import: aSc XML with a double period and a combined lesson', () => {
  const xml = `<?xml version="1.0"?><timetable>
    <periods><period period="1" starttime="8:00"/><period period="2" starttime="8:45"/><period period="3"/></periods>
    <subjects><subject id="S1" name="Mathematics" short="Ma"/><subject id="S2" name="Physical Education" short="PE"/></subjects>
    <teachers><teacher id="T1" firstname="Anita" lastname="Rao" name="Anita Rao" short="AR"/><teacher id="T2" name="Coach Singh" short="CS"/></teachers>
    <classrooms><classroom id="R1" name="Ground"/></classrooms>
    <classes><class id="C1" name="10-A"/><class id="C2" name="10-B"/></classes>
    <groups><group id="G1" classid="C1" name="Entire class" entireclass="1"/></groups>
    <lessons><lesson id="L1" classids="C1" subjectid="S1" teacherids="T1" groupids="G1" periodspercard="2"/>
             <lesson id="L2" classids="C1,C2" subjectid="S2" teacherids="T2" periodspercard="1"/></lessons>
    <cards><card lessonid="L1" period="1" days="10000"/><card lessonid="L2" period="3" days="00100" classroomids="R1"/></cards>
  </timetable>`;
  const p = parseAsc(xml);
  assert.deepEqual(p.rows.map(r => [r.class, r.weekday, r.period, r.subject, r.teacher, r.room, r.combined]), [
    ['10-A', 1, 1, 'Mathematics', 'Anita Rao', '', false],
    ['10-A', 1, 2, 'Mathematics', 'Anita Rao', '', false],
    ['10-A', 3, 3, 'Physical Education', 'Coach Singh', 'Ground', true],
    ['10-B', 3, 3, 'Physical Education', 'Coach Singh', 'Ground', true],
  ]);
});

test('import: matching teachers and rooms, review map, duplicates', () => {
  const people = [{ id: 'a', name: 'Anita Rao', email: 'anita.rao@test.sthara.in' }, { id: 'r', name: 'Ravi Kumar', email: null }, { id: 'r2', name: 'Rekha Kumar', email: null }];
  assert.equal(matchTeacher('Mrs. Anita Rao', people), 'a');
  assert.equal(matchTeacher('A. Rao', people), 'a');
  assert.equal(matchTeacher('anita.rao', people), 'a');
  assert.equal(matchTeacher('AR', people), 'a');
  assert.equal(matchTeacher('R Kumar', people), null, 'ambiguous initial + surname');
  const rows = [
    { class: '10-A', group: '', weekday: 1, period: 1, subject: 'Maths', teacher: 'A Rao', room: 'Lab 1', combined: false },
    { class: '10-A', group: '', weekday: 1, period: 1, subject: 'Maths', teacher: 'A Rao', room: '', combined: false },
    { class: '10-A', group: '', weekday: 1, period: 2, subject: 'English', teacher: 'Mr Unknown', room: 'Room 10A', combined: false },
  ];
  const r = resolve(rows, people, [{ id: 'room', name: 'Room 10-A' }]);
  assert.equal(r.slots.length, 2);
  assert.equal(r.slots[0].teacher_id, 'a');
  assert.equal(r.slots[1].room_id, 'room');
  assert.deepEqual(r.unmatchedTeachers, [{ raw: 'Mr Unknown', lessons: 1 }]);
  assert.deepEqual(r.newRooms.map(x => [x.name, x.kind]), [['Lab 1', 'lab']]);
  assert.ok(r.problems.some(p => /duplicate/.test(p)));
  assert.equal(resolve(rows, people, [], { 'Mr Unknown': 'r' }).slots[1].teacher_id, 'r');
});

test('import: reads an .xlsx workbook', async () => {
  // A minimal workbook built with the same zip layout Excel writes (deflated entries).
  const { deflateRawSync } = await import('node:zlib');
  const files: Record<string, string> = {
    'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="TT" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Class</t></si><si><t>Day</t></si><si><t>P1</t></si><si><t>10-A</t></si><si><t>Mon</t></si><si><t>Maths &amp; Stats / Anita Rao</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="D2" t="s"><v>5</v></c></row></sheetData></worksheet>',
  };
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text));
    const n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(data.length, 20); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(offset, 42);
    parts.push(local, n, data); central.push(cen, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  const buf = Buffer.concat([...parts, cd, end]);
  const rows = await readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.deepEqual(rows, [['Class', 'Day', 'P1'], ['10-A', 'Mon', '', 'Maths & Stats / Anita Rao']]);
});
