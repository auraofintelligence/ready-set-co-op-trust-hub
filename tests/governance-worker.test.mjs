import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createWorker } from '../cloudflare/worker.mjs';
import { createSqliteD1 } from '../scripts/sqlite-d1.mjs';

const BASE = 'https://ready-setco.example';
const PATH = '/api/admin/governance/workspaces';
const NOW = '2026-11-27T08:30:00.000Z';
const ACTOR = 'organiser@example.test';
const pair = await generateKeyPair('RS256');
const resolver = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'governance-test', alg: 'RS256', use: 'sig' }] });
async function token(email = ACTOR) {
  return new SignJWT({ email }).setProtectedHeader({ alg: 'RS256', kid: 'governance-test' }).setSubject('governance-test-subject')
    .setIssuedAt().setExpirationTime('5m').setIssuer('https://governance-test.cloudflareaccess.com').setAudience('governance-test-audience').sign(pair.privateKey);
}
function fixture(t, overrides = {}, migration = true) {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0001_intake.sql', '0002_operator_legal_name.sql', '0003_map_records.sql', ...(migration ? ['0004_governance.sql'] : [])]) sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const env = { DB: createSqliteD1(sqlite), ACCESS_TEAM_DOMAIN: 'governance-test.cloudflareaccess.com', ACCESS_AUD: 'governance-test-audience', ADMIN_EMAILS: ACTOR, ...overrides };
  const worker = createWorker({ keyResolver: resolver, now: () => NOW });
  return { sqlite, env, fetch: request => worker.fetch(request, env), worker };
}
async function request(path = PATH, { method = 'GET', data, origin = BASE, assertion, headers = {} } = {}) {
  return new Request(`${BASE}${path}`, { method, headers: {
    ...(assertion === null ? {} : { 'Cf-Access-Jwt-Assertion': assertion ?? await token() }),
    ...(origin === null ? {} : { Origin: origin }), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers,
  }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}
function draftWorkspace(overrides = {}) { return { id: crypto.randomUUID(), name: 'Fictional cooperative for testing', locality: 'Fictional locality', jurisdiction: 'QLD', cooperativeType: 'undecided', purpose: 'Test data only', ...overrides }; }
function draftRecord(overrides = {}) { return { id: crypto.randomUUID(), kind: 'task', title: 'Draft a formation agenda', status: 'draft', owner: 'Convener', dueDate: '2026-12-01', sourceRef: 'Official formation meeting guide', evidenceRef: '', body: 'Fictional preparation task.', details: { milestone: 'formation-meeting', completionCriteria: 'Agenda reviewed by prospective founders.' }, ...overrides }; }
async function createWorkspace(f, data = draftWorkspace()) { const response = await f.fetch(await request(PATH, { method: 'POST', data })); assert.equal(response.status, 201, await response.clone().text()); return (await response.json()).workspace; }
async function createRecord(f, workspace, data = draftRecord()) { const response = await f.fetch(await request(`${PATH}/${workspace.id}/records`, { method: 'POST', data })); assert.equal(response.status, 201, await response.clone().text()); return (await response.json()).record; }
function workspaceEdit(workspace, overrides = {}) { return Object.fromEntries(['name', 'locality', 'jurisdiction', 'cooperativeType', 'purpose', 'stage', 'registrationRef', 'registrationDate'].map(key => [key, workspace[key]]).concat([['expectedVersion', workspace.version]], Object.entries(overrides))); }
function recordEdit(record, overrides = {}) { return Object.fromEntries(['title', 'status', 'owner', 'dueDate', 'sourceRef', 'evidenceRef', 'body', 'details'].map(key => [key, record[key]]).concat([['expectedVersion', record.version]], Object.entries(overrides))); }

test('governance begins empty, requires a verified allowed organiser, and denies public and cross-origin routes', async t => {
  const f = fixture(t);
  const empty = await f.fetch(await request()); assert.equal(empty.status, 200); assert.deepEqual((await empty.json()).workspaces, []);
  assert.equal((await f.fetch(await request(PATH, { assertion: null }))).status, 401);
  assert.equal((await f.fetch(await request(PATH, { assertion: await token('outsider@example.test') }))).status, 403);
  for (const origin of [null, 'https://unrelated.example', 'https://auraofintelligence.github.io']) assert.equal((await f.fetch(await request(PATH, { method: 'POST', data: draftWorkspace(), origin }))).status, 403);
  assert.equal((await f.fetch(await request(PATH, { headers: { 'Sec-Fetch-Site': 'cross-site' } }))).status, 403);
  assert.equal((await f.fetch(new Request(`${BASE}/api/governance/workspaces`))).status, 404);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM governance_workspaces').get().count, 0);
});

test('workspace creation has immutable original data, idempotent retries and actor attribution from the server', async t => {
  const f = fixture(t), data = draftWorkspace();
  const workspace = await createWorkspace(f, data);
  assert.equal(workspace.stage, 'exploring'); assert.equal(workspace.version, 1); assert.equal(workspace.updatedBy, ACTOR);
  assert.equal(workspace.jurisdictionReview, 'qld-guide-available');
  const retry = await f.fetch(await request(PATH, { method: 'POST', data })); assert.equal(retry.status, 200); assert.equal((await retry.json()).workspace.id, workspace.id);
  const changed = await f.fetch(await request(PATH, { method: 'POST', data: { ...data, name: 'Different submission' } })); assert.equal(changed.status, 409);
  assert.equal((await f.fetch(await request(PATH, { method: 'POST', data: { ...draftWorkspace(), updatedBy: 'pretend@example.test' } }))).status, 400);
  assert.equal((await f.fetch(await request(PATH, { method: 'POST', data: { ...draftWorkspace(), stage: 'registered' } }))).status, 400);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM governance_workspace_revisions').get().count, 1);
  assert.throws(() => f.sqlite.prepare('DELETE FROM governance_workspaces WHERE id = ?').run(workspace.id));
  assert.throws(() => f.sqlite.prepare('UPDATE governance_workspaces SET created_by = ? WHERE id = ?').run('pretend', workspace.id));
});

test('workspace edits record every revision, reject stale versions and require registration evidence', async t => {
  const f = fixture(t), workspace = await createWorkspace(f);
  const missing = await f.fetch(await request(`${PATH}/${workspace.id}`, { method: 'PATCH', data: workspaceEdit(workspace, { stage: 'registered' }) })); assert.equal(missing.status, 400);
  const update = workspaceEdit(workspace, { stage: 'registered', registrationRef: 'Fictional certificate reference', registrationDate: '2026-11-27' });
  const saved = await f.fetch(await request(`${PATH}/${workspace.id}`, { method: 'PATCH', data: update })); assert.equal(saved.status, 200);
  assert.equal((await saved.json()).workspace.version, 2);
  assert.equal((await f.fetch(await request(`${PATH}/${workspace.id}`, { method: 'PATCH', data: update }))).status, 409);
  const history = await (await f.fetch(await request(`${PATH}/${workspace.id}/history`))).json(); assert.equal(history.total, 2); assert.equal(history.revisions[0].snapshot.stage, 'registered'); assert.equal(history.revisions[1].snapshot.stage, 'exploring');
  assert.throws(() => f.sqlite.prepare('DELETE FROM governance_workspace_revisions WHERE workspace_id = ?').run(workspace.id));
});

test('typed records persist across Worker instances and retries do not duplicate original revisions', async t => {
  const f = fixture(t), workspace = await createWorkspace(f), data = draftRecord();
  const record = await createRecord(f, workspace, data);
  const retry = await f.fetch(await request(`${PATH}/${workspace.id}/records`, { method: 'POST', data })); assert.equal(retry.status, 200);
  assert.equal((await f.fetch(await request(`${PATH}/${workspace.id}/records`, { method: 'POST', data: { ...data, title: 'Changed attempt' } }))).status, 409);
  const freshWorker = createWorker({ keyResolver: resolver, now: () => NOW });
  const list = await (await freshWorker.fetch(await request(`${PATH}/${workspace.id}/records?kind=task`), f.env)).json();
  assert.equal(list.total, 1); assert.equal(list.records[0].id, record.id); assert.deepEqual(list.records[0].details, data.details); assert.equal(list.records[0].createdBy, ACTOR);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM governance_record_revisions').get().count, 1);
});

test('record update and audit append succeed atomically, retain originals and reject concurrent stale writes', async t => {
  const f = fixture(t), workspace = await createWorkspace(f), record = await createRecord(f, workspace);
  const data = recordEdit(record, { status: 'completed', evidenceRef: 'Minutes #1 section 2', body: 'Reviewed with prospective founders.' });
  const first = await f.fetch(await request(`${PATH}/${workspace.id}/records/${record.id}`, { method: 'PATCH', data })); assert.equal(first.status, 200); assert.equal((await first.json()).record.version, 2);
  assert.equal((await f.fetch(await request(`${PATH}/${workspace.id}/records/${record.id}`, { method: 'PATCH', data }))).status, 409);
  const history = await (await f.fetch(await request(`${PATH}/${workspace.id}/records/${record.id}/history`))).json();
  assert.equal(history.total, 2); assert.equal(history.revisions[0].snapshot.status, 'completed'); assert.equal(history.revisions[1].snapshot.status, 'draft'); assert.equal(history.revisions[0].actor, ACTOR);
  assert.throws(() => f.sqlite.prepare('UPDATE governance_record_revisions SET actor = ?').run('pretend'));
  assert.throws(() => f.sqlite.prepare('DELETE FROM governance_records WHERE id = ?').run(record.id));
  const current = history.revisions[0].snapshot;
  f.sqlite.exec("CREATE TRIGGER reject_test_revision BEFORE INSERT ON governance_record_revisions WHEN NEW.version = 3 BEGIN SELECT RAISE(ABORT, 'Test persistence failure'); END;");
  const failed = await f.fetch(await request(`${PATH}/${workspace.id}/records/${record.id}`, { method: 'PATCH', data: recordEdit(current, { title: 'Must roll back' }) })); assert.equal(failed.status, 503);
  assert.equal(f.sqlite.prepare('SELECT title FROM governance_records WHERE id = ?').get(record.id).title, record.title);
  assert.equal(f.sqlite.prepare('SELECT version FROM governance_records WHERE id = ?').get(record.id).version, 2);
});

test('workspace scoping prevents record substitution, cross-workspace history and export mixing', async t => {
  const f = fixture(t), a = await createWorkspace(f), b = await createWorkspace(f, draftWorkspace({ name: 'Another local cooperative' }));
  const record = await createRecord(f, a, draftRecord({ title: 'Private local A record' }));
  for (const suffix of [`/records/${record.id}`, `/records/${record.id}/history`]) assert.equal((await f.fetch(await request(`${PATH}/${b.id}${suffix}`))).status, 404);
  assert.equal((await f.fetch(await request(`${PATH}/${b.id}/records/${record.id}`, { method: 'PATCH', data: recordEdit(record, { title: 'Incorrect location' }) }))).status, 404);
  assert.equal((await f.fetch(await request(`${PATH}/${crypto.randomUUID()}/records`, { method: 'POST', data: draftRecord() }))).status, 404);
  const exported = await f.fetch(await request(`${PATH}/${b.id}/export`)); assert.equal(exported.status, 200); assert.equal(exported.headers.get('Cache-Control'), 'no-store');
  const content = await exported.text(); assert.ok(!content.includes(record.id)); assert.ok(!content.includes('Private local A record'));
  const full = await (await f.fetch(await request(`${PATH}/${a.id}/export`))).json(); assert.equal(full.records.length, 1); assert.equal(full.recordRevisions.length, 1); assert.equal(full.workspaceRevisions.length, 1); assert.equal(full.workspace.id, a.id);
});

test('records enforce type fields, real dates, versions, evidence and plausible vote counts', async t => {
  const f = fixture(t), workspace = await createWorkspace(f), url = `${PATH}/${workspace.id}/records`;
  for (const change of [
    { kind: 'unknown' }, { details: { secret: 'not accepted' } }, { dueDate: '2026-02-30' }, { status: 'approved' }, { actor: 'pretend' },
    { kind: 'decision', details: { eligibleVotes: 4, votesFor: 4, votesAgainst: 1 } },
    { kind: 'decision', details: { votesFor: -1 } },
    { kind: 'decision', status: 'draft', details: { outcome: 'carried' } },
    { kind: 'meeting', details: { quorumConfirmed: 'yes' } },
  ]) assert.equal((await f.fetch(await request(url, { method: 'POST', data: draftRecord(change) }))).status, 400, JSON.stringify(change));
  const record = await createRecord(f, workspace);
  const missingVersion = recordEdit(record); delete missingVersion.expectedVersion;
  assert.equal((await f.fetch(await request(`${url}/${record.id}`, { method: 'PATCH', data: missingVersion }))).status, 400);
  assert.equal((await f.fetch(await request(`${url}?kind=unknown`))).status, 400);
  assert.equal((await f.fetch(await request(`${url}?pageSize=10000`))).status, 400);
});

test('membership admission and handover require their own recorded evidence', async t => {
  const f = fixture(t), workspace = await createWorkspace(f), url = `${PATH}/${workspace.id}/records`;
  const member = draftRecord({ kind: 'membership', title: 'Fictional admission', evidenceRef: 'Fictional board minutes', details: { membershipStage: 'admitted', admissionDate: '2026-11-27', decisionRef: 'Resolution 1' } });
  assert.equal((await f.fetch(await request(url, { method: 'POST', data: member }))).status, 400);
  const registered = await f.fetch(await request(`${PATH}/${workspace.id}`, { method: 'PATCH', data: workspaceEdit(workspace, { stage: 'registered', registrationRef: 'Fictional certificate', registrationDate: '2026-11-27' }) })); assert.equal(registered.status, 200);
  assert.equal((await f.fetch(await request(url, { method: 'POST', data: member }))).status, 201);
  const handover = draftRecord({ kind: 'handover', status: 'approved', evidenceRef: 'Board acceptance record', details: { fromEntity: 'Fictional original operator', toEntity: workspace.name, effectiveDate: '2026-12-01' } });
  assert.equal((await f.fetch(await request(url, { method: 'POST', data: handover }))).status, 400);
  handover.details.consentRef = 'Fictional consent'; handover.details.acceptanceRef = 'Fictional acceptance';
  assert.equal((await f.fetch(await request(url, { method: 'POST', data: handover }))).status, 201);
  const resolution = draftRecord({ kind: 'decision', status: 'draft', evidenceRef: 'Fictional signed minutes', details: { outcome: 'carried', decisionDate: '2026-11-27', meetingRef: 'Fictional general meeting' } });
  assert.equal((await f.fetch(await request(url, { method: 'POST', data: resolution }))).status, 201);
});

test('other jurisdictions are explicitly marked for local legal review and workspace/record lists paginate', async t => {
  const f = fixture(t), workspace = await createWorkspace(f, draftWorkspace({ jurisdiction: 'NSW', name: 'A local project' }));
  assert.equal(workspace.jurisdictionReview, 'local-review-required');
  await createWorkspace(f, draftWorkspace({ name: 'B local project' }));
  const page = await (await f.fetch(await request(`${PATH}?page=2&pageSize=1`))).json(); assert.equal(page.workspaces.length, 1); assert.equal(page.total, 2); assert.equal(page.workspaces[0].name, 'B local project');
  await createRecord(f, workspace); await createRecord(f, workspace, draftRecord({ kind: 'risk', details: { impact: 'high', likelihood: 'low', mitigation: 'Record backup and restore responsibility.' } }));
  const all = await (await f.fetch(await request(`${PATH}/${workspace.id}/records?pageSize=1`))).json(); assert.equal(all.total, 2); assert.equal(all.records.length, 1);
  const filtered = await (await f.fetch(await request(`${PATH}/${workspace.id}/records?kind=risk`))).json(); assert.equal(filtered.total, 1); assert.equal(filtered.records[0].kind, 'risk');
});

test('unconfigured access fails closed and missing migration produces an actionable private response', async t => {
  const blocked = fixture(t, { ACCESS_AUD: '' });
  assert.equal((await blocked.fetch(await request())).status, 503);
  const oldDatabase = fixture(t, {}, false);
  const response = await oldDatabase.fetch(await request()); assert.equal(response.status, 503);
  const data = await response.json(); assert.equal(data.code, 'governance_setup_required'); assert.doesNotMatch(data.error, /SELECT|CREATE TABLE|example\.test/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
