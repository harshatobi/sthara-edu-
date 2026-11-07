import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupSteps, type SetupCounts } from './setup';

const blank: SetupCounts = {
  officeHolders: 1, safeguardingLead: false, teachers: 0, teachersAssigned: 0, studentLogins: 0, parentLogins: 0, loginRequestsPending: 0,
  sessionSet: false, students: 0, classSubjects: 0, studentSubjects: 0, calendarEvents: 0, bellSchedules: 0, rooms: 0, timetablePublished: false,
  examSchemes: 0, feeStructures: 0, admissionStages: 0, admissionSeats: 0, salaryTemplates: 0, payItems: 0, leavePolicies: 0, certificateSettings: false, houses: 0,
};

test('a new school: essentials outstanding, the school admin alone, logins with Sthara', () => {
  const s = setupSteps({ ...blank, loginRequestsPending: 2 });
  assert.equal(s.ready, false);
  assert.deepEqual(s.required, { done: 0, total: 6 });
  const by = Object.fromEntries(s.steps.map(x => [x.key, x]));
  assert.equal(by.roles.status, 'attention');
  assert.equal(by.logins.status, 'attention');
  assert.equal(by.logins.sthara, true);
  assert.match(by.logins.note, /2 requests with Sthara/);
});

test('ready once the six essentials are done; optional steps never block', () => {
  const s = setupSteps({ ...blank, officeHolders: 6, teachers: 40, teachersAssigned: 34, studentLogins: 900, parentLogins: 800, students: 1000, classSubjects: 60, studentSubjects: 5000, feeStructures: 12 });
  assert.equal(s.ready, true);
  assert.deepEqual(s.required, { done: 6, total: 6 });
  assert.ok(s.all.done < s.all.total, 'optional steps can still be open');
  assert.equal(s.steps.find(x => x.key === 'teaching')!.status, 'done', '34 of 40 is past 80%');
});
