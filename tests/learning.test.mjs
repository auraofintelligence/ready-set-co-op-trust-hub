import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteD1 } from '../scripts/sqlite-d1.mjs';
import { handleLearningRequest, LearningRequestError } from '../cloudflare/learning.mjs';
import { handleMemberServiceRequest } from '../cloudflare/member-services.mjs';

const ORIGIN = 'https://ready-setco.example';
const NOW = '2026-11-28T10:00:00.000Z';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  t.after(() => sqlite.close());
  const migrations = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const db = createSqliteD1(sqlite);
  function account(name, webmaster = false) {
    const id = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO member_accounts (id,username,display_name,email,status,webmaster,created_at,updated_at,created_by,original_payload_json,last_operation_id)
      VALUES (?,?,?,?,'active',?,?,?,'test','{}',?)`).run(id, name, name, `${name}@example.test`, Number(webmaster), NOW, NOW, crypto.randomUUID());
    return { accountId: id, username: name, displayName: name, webmaster, status: 'active', authentication: 'password' };
  }
  const member = account('learner');
  const other = account('other');
  const admin = account('webmaster', true);
  async function call(path, method = 'GET', data = undefined, identity = member, now = NOW) {
    const request = new Request(`${ORIGIN}/api/learning${path}`, { method });
    try { return await handleLearningRequest(request, db, { identity, now, readJSON: async () => data }); }
    catch (error) {
      if (!(error instanceof LearningRequestError)) throw error;
      return Response.json({ code: error.code }, { status: error.status });
    }
  }
  async function ownExport(identity = member) {
    const request = new Request(`${ORIGIN}/api/member/export`);
    const response = await handleMemberServiceRequest(request, { DB: db }, { identity, now: NOW });
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).learning;
  }
  return { sqlite, member, other, admin, call, ownExport };
}

async function saved(response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}

test('private work and learning profiles save separate pathways and are versioned and exportable', async t => {
  const f = fixture(t);
  assert.equal((await f.call('/profile', 'GET', undefined, null)).status, 401);
  assert.equal((await saved(await f.call('/profile'))).profile.version, 0);
  const data = {
    expectedVersion: 0, pathways: ['working_holiday', 'volunteering', 'employer_joining'], availableFrom: '2026-12-01',
    availableUntil: '2027-01-01', english: 'instructions', skills: 'Fictional waterfront event setup', licences: 'Car'
  };
  await saved(await f.call('/profile', 'PATCH', data));
  assert.equal((await f.call('/profile', 'PATCH', data)).status, 409);
  assert.equal((await f.call('/profile', 'PATCH', { ...data, expectedVersion: 1, availableUntil: '2026-02-31' })).status, 400);
  assert.equal((await f.call('/profile', 'PATCH', { ...data, role: 'admin' })).status, 400);
  assert.deepEqual((await f.ownExport()).profile.pathways, data.pathways);
  assert.equal((await f.ownExport(f.other)).profile.skills, '');
});

test('private evidence uses consent, idempotent submission, reviewer checks, expiry and atomic history', async t => {
  const f = fixture(t);
  const data = { id: crypto.randomUUID(), category: 'work_rights', label: 'Fictional subclass 417', issuer: '', consent: true };
  assert.equal((await f.call('/evidence', 'POST', { ...data, consent: false })).status, 400);
  await saved(await f.call('/evidence', 'POST', data), 201);
  await saved(await f.call('/evidence', 'POST', data));
  assert.equal((await f.call('/evidence', 'POST', data, f.other)).status, 409);
  assert.equal((await f.call('/reviews')).status, 403);
  assert.equal((await f.call(`/evidence/${data.id}`, 'PATCH', { expectedVersion: 1, action: 'withdraw' }, f.other)).status, 404);
  const queued = await saved(await f.call('/reviews', 'GET', undefined, f.admin));
  assert.equal(queued.evidence[0].applicant, 'learner');
  assert.equal(Object.hasOwn(queued.evidence[0], 'email'), false);
  const review = `/reviews/${data.id}`;
  const decision = { expectedVersion: 1, status: 'verified', method: 'sighted', expiresOn: '2026-11-28', note: '' };
  assert.equal((await f.call(review, 'PATCH', decision, f.admin)).status, 400);
  assert.equal((await f.call(review, 'PATCH', { ...decision, method: 'vevo', expiresOn: '' }, f.admin)).status, 400);
  f.sqlite.exec("CREATE TRIGGER stop_audit BEFORE INSERT ON learning_evidence_history WHEN NEW.status='verified' BEGIN SELECT RAISE(ABORT,'test'); END");
  await assert.rejects(f.call(review, 'PATCH', { ...decision, method: 'vevo' }, f.admin));
  assert.equal((await saved(await f.call('/evidence'))).evidence[0].status, 'submitted');
  f.sqlite.exec('DROP TRIGGER stop_audit');
  assert.equal((await saved(await f.call(review, 'PATCH', { ...decision, method: 'vevo' }, f.admin))).evidence.status, 'verified');
  const nextBrisbaneDay = '2026-11-28T14:00:00.000Z';
  assert.equal((await saved(await f.call('/evidence', 'GET', undefined, f.member, nextBrisbaneDay))).evidence[0].status, 'expired');
  await saved(await f.call(`/evidence/${data.id}`, 'PATCH', { expectedVersion: 2, action: 'withdraw' }));
  assert.deepEqual((await f.ownExport()).history.map(row => row.status).sort(), ['submitted', 'verified', 'withdrawn']);
  assert.deepEqual((await f.ownExport(f.other)).evidence, []);
});

test('PLFC is the only draft provider and a completion requires a released version', async t => {
  const f = fixture(t);
  assert.equal((await f.call('/drafts')).status, 403);
  const { drafts, categories } = await saved(await f.call('/drafts', 'GET', undefined, f.admin));
  assert.deepEqual(drafts.map(item => item.id), ['plfc-officer-handover', 'plfc-volunteer-onboarding']);
  assert.ok(drafts.every(item => item.provider === 'Point Lookout Fishing Club' && item.lessons.length >= 3));
  assert.ok(categories.some(item => item.id === 'grants'));
  const complete = () => f.sqlite.prepare('INSERT INTO learning_completions(account_id,course_id,revision,completed_at) VALUES(?,?,1,?)').run(f.member.accountId, 'plfc-officer-handover', NOW);
  assert.throws(complete, /released version/);
  f.sqlite.exec("UPDATE learning_courses SET site_id='minjerribah' WHERE id='plfc-officer-handover'; UPDATE learning_course_versions SET state='published' WHERE course_id='plfc-officer-handover'");
  complete();
  assert.throws(() => f.sqlite.exec("UPDATE learning_course_versions SET title='new' WHERE course_id='plfc-officer-handover'"), /versioned/);
  assert.equal((await saved(await f.call('/completions'))).completions[0].revision, 1);
  assert.deepEqual((await saved(await f.call('/completions', 'GET', undefined, f.other))).completions, []);
});
