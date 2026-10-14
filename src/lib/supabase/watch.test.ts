import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbProblem } from './watch';
import { normaliseMessage } from '../errors/fingerprint';

const SB = 'https://x.supabase.co/rest/v1';

test('a refused read is reported with its table and code', () => {
  const p = dbProblem({ url: `${SB}/tml_scores?select=*&student_id=in.(a,b)`, method: 'GET' }, { status: 400, contentRange: null, body: { code: '', message: 'Bad Request' } });
  assert.equal(p, '[database] 400 on tml_scores (GET): Bad Request');
  assert.match(dbProblem({ url: `${SB}/rpc/ops_counts`, method: 'POST' }, { status: 500, contentRange: null, body: { code: 'XX000', message: 'boom' } })!, /500 on rpc ops_counts \(POST\) XX000/);
});

test('no row for single() and an expired session are not problems', () => {
  assert.equal(dbProblem({ url: `${SB}/users?id=eq.1`, method: 'GET' }, { status: 406, contentRange: null, body: { code: 'PGRST116' } }), null);
  assert.equal(dbProblem({ url: `${SB}/users`, method: 'GET' }, { status: 401, contentRange: null, body: { code: 'PGRST301' } }), null);
});

test('a list cut at 1,000 rows with no limit asked for is reported', () => {
  const p = dbProblem({ url: `${SB}/submissions?select=*&assignment_id=in.(a)`, method: 'GET' }, { status: 200, contentRange: '0-999/*' });
  assert.match(p!, /^\[database\] submissions: 1000 rows came back with no limit/);
  // Grouping: the same problem on another table is a different group, repeats on one table are one group.
  assert.notEqual(normaliseMessage(p!), normaliseMessage(p!.replace('submissions', 'users')));
});

test('paged reads, explicit limits, short lists, writes and other hosts are fine', () => {
  const full = { status: 200, contentRange: '1000-1999/*' };
  assert.equal(dbProblem({ url: `${SB}/users?select=id&offset=1000&limit=1000`, method: 'GET' }, full), null);
  assert.equal(dbProblem({ url: `${SB}/users?select=id&limit=5000`, method: 'GET' }, { status: 200, contentRange: '0-999/*' }), null);
  assert.equal(dbProblem({ url: `${SB}/users?select=id`, method: 'GET' }, { status: 200, contentRange: '0-33/*' }), null);
  assert.equal(dbProblem({ url: `${SB}/users`, method: 'POST' }, { status: 201, contentRange: '*/*' }), null);
  assert.equal(dbProblem({ url: 'https://x.supabase.co/auth/v1/token', method: 'POST' }, { status: 400, contentRange: null }), null);
});
