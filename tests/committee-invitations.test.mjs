import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { client as opaqueClient, ready } from '@serenity-kit/opaque';
import { createSqliteD1 } from '../scripts/sqlite-d1.mjs';
import { createWorker } from '../cloudflare/worker.mjs';
import { createTestPasskey } from './helpers/passkeys.mjs';

await ready;
const BASE = 'https://ready-setco.example', NOW = '2026-11-28T01:00:00.000Z', PATH = '/api/webmaster/committee-invitations';
const consent = { consentAccount: true, consentVersion: '2026-11-27' };
const PASSWORD = 'Fictional invitation password';
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  }
  t.after(() => sqlite.close());
  let now = NOW, nextBatch;
  const d1 = createSqliteD1(sqlite);
  const db = { ...d1, async batch(statements) { const action = nextBatch; nextBatch = null; action?.(); return d1.batch(statements); }, withSession() { return db; } };
  const env = { DB: db, READY_AUTH_SECRET: randomBytes(32).toString('hex'), ASSETS: { fetch: async () => new Response('portal') } };
  const worker = createWorker({ now: () => now });
  function client(ip = '192.0.2.51') {
    const jar = new Map();
    return { jar, async request(path, { method = 'GET', data, origin = BASE } = {}) {
      const request = new Request(BASE + path, { method, headers: { 'CF-Connecting-IP': ip,
        Cookie: [...jar].map(([key, value]) => key + '=' + value).join('; '), ...(origin ? { Origin: origin } : {}),
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      const response = await worker.fetch(request, env), set = response.headers.get('Set-Cookie');
      if (set) { const [key, value] = set.split(';')[0].split('='); if (set.includes('Max-Age=0')) jar.delete(key); else jar.set(key, value); }
      return response;
    }, get(path) { return this.request(path); }, post(path, data = {}, extra = {}) { return this.request(path, { method: 'POST', data, ...extra }); } };
  }
  return { sqlite, env, client, now: () => now, setNow(value) { now = value; }, beforeNextBatch(action) { nextBatch = action; } };
}
async function okay(response, status = 200) { const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body; }
async function enrol(f, client, username, webmaster = false) {
  const purpose = webmaster ? 'bootstrap' : 'register', key = createTestPasskey();
  const begin = await okay(await client.post(`/api/auth/${purpose}/options`, { username, displayName: 'Fictional ' + username, email: username + '@example.test', ...consent,
    ...(webmaster ? { bootstrapKey: f.env.READY_AUTH_SECRET } : {}) }));
  return { ...await okay(await client.post(`/api/auth/${purpose}/verify`, { ceremonyId: begin.ceremonyId, response: key.registration(begin.options, { origin: BASE }) })), key };
}
async function login(client, person) {
  const begin = await okay(await client.post('/api/auth/login/options', { username: person.identity.username }));
  return okay(await client.post('/api/auth/login/verify', { ceremonyId: begin.ceremonyId, response: person.key.authentication(begin.options, { origin: BASE, accountId: person.identity.accountId }) }));
}
function inviteDetails(username = 'committee.person', extra = {}) { return { id: crypto.randomUUID(), username, displayName: 'Fictional ' + username, email: username + '@example.test', siteId: 'minjerribah', ...extra }; }
async function invite(owner, data = inviteDetails()) { return okay(await owner.post(PATH, data), 201); }
async function passkeyProof(client, token) {
  const key = createTestPasskey(), begin = await okay(await client.post('/api/auth/activate/options', { token, ...consent }));
  return { key, data: { ceremonyId: begin.ceremonyId, response: key.registration(begin.options, { origin: BASE }) } };
}
async function activatePasskey(client, token) { const proof = await passkeyProof(client, token); return { ...await okay(await client.post('/api/auth/activate/verify', proof.data)), key: proof.key }; }
async function passwordProof(client, token) {
  const start = opaqueClient.startRegistration({ password: PASSWORD });
  const begin = await okay(await client.post('/api/auth/password/activate/options', { token, ...consent, registrationRequest: start.registrationRequest }));
  const end = opaqueClient.finishRegistration({ clientRegistrationState: start.clientRegistrationState, registrationResponse: begin.registrationResponse, password: PASSWORD, keyStretching: 'memory-constrained' });
  return { ceremonyId: begin.ceremonyId, registrationRecord: end.registrationRecord };
}
function count(f, table) { return f.sqlite.prepare('SELECT COUNT(*) AS total FROM ' + table).get().total; }

test('webmaster prepares one group invitation, with no access until real passkey acceptance', async t => {
  const f = fixture(t), owner = f.client(), person = f.client(); const admin = await enrol(f, owner, 'webmaster.one', true);
  const issued = await invite(owner), id = issued.invitation.id;
  assert.equal(issued.invitation.status, 'pending'); assert.equal(issued.invitation.role, 'committee');
  assert.equal(issued.invitation.createdBy, 'account:' + admin.identity.accountId); assert.equal(issued.account.status, 'invited');
  assert.equal(issued.sent, false); assert.equal(issued.purpose, 'activation'); assert.equal(count(f, 'member_site_roles'), 0);
  const invitationState = f.sqlite.prepare('SELECT * FROM member_committee_invitations WHERE id=?').get(id);
  const link = f.sqlite.prepare('SELECT * FROM member_auth_links WHERE id=?').get(invitationState.current_link_id);
  assert.equal(link.committee_invitation_id, id); assert.notEqual(link.token_hash, issued.token);
  const context = await okay(await person.post('/api/auth/invitation', { token: issued.token }));
  assert.deepEqual(Object.keys(context.invitation).sort(), ['displayName', 'username', 'siteId', 'siteName', 'role', 'expiresAt'].sort());
  assert.equal(context.invitation.siteId, 'minjerribah'); assert.equal(context.invitation.role, 'committee');
  assert.equal((await person.get('/api/committee/sites')).status, 401);
  const active = await activatePasskey(person, issued.token);
  assert.equal(active.identity.accountId, issued.account.accountId); assert.equal(active.identity.webmaster, false);
  const groups = await okay(await person.get('/api/committee/sites'));
  assert.deepEqual(groups.sites.map(site => site.id), ['minjerribah']);
  const saved = await okay(await owner.get(PATH + '/' + id)); assert.equal(saved.invitation.status, 'accepted'); assert.equal(saved.invitation.version, 2);
  assert.equal(saved.invitation.acceptedAt, NOW); assert.equal(saved.account.status, 'active');
  assert.equal(count(f, 'member_profiles'), 0); assert.equal(count(f, 'member_applications'), 0);
  const history = f.sqlite.prepare("SELECT * FROM member_service_history WHERE entity_type='role'").all();
  assert.equal(history.length, 1); assert.equal(history[0].event, 'committee_invitation_accepted');
  assert.equal(JSON.parse(history[0].snapshot_json).invitationId, id);
  assert.equal((await person.post('/api/auth/invitation', { token: issued.token })).status, 401);
  for (const operation of ['renew', 'cancel', 'reopen']) assert.equal((await owner.post(PATH + '/' + id + '/' + operation, { expectedVersion: 2 })).status, 409);
});

test('real password invitation acceptance grants the same committee role without a passkey or member profile', async t => {
  const f = fixture(t), owner = f.client(), person = f.client(); await enrol(f, owner, 'webmaster.password', true);
  const issued = await invite(owner); const proof = await passwordProof(person, issued.token);
  assert.equal(count(f, 'member_site_roles'), 0);
  const active = await okay(await person.post('/api/auth/password/activate/verify', proof));
  assert.equal(active.identity.authentication, 'password'); assert.equal(active.identity.hasPassword, true);
  assert.equal(f.sqlite.prepare('SELECT role FROM member_site_roles WHERE account_id=?').get(active.identity.accountId).role, 'committee');
  assert.equal(f.sqlite.prepare('SELECT consent_account FROM member_accounts WHERE id=?').get(active.identity.accountId).consent_account, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS total FROM member_passkeys WHERE account_id=?').get(active.identity.accountId).total, 0);
  assert.equal((await okay(await owner.get(PATH))).invitations[0].status, 'accepted');
  assert.equal((await person.post('/api/auth/password/activate/verify', proof)).status, 401);
});

test('invitation register and mutations require current webmaster authority and exact origin', async t => {
  const f = fixture(t), owner = f.client(), visitor = f.client(), ordinary = f.client(); await enrol(f, owner, 'webmaster.scope', true);
  const member = await enrol(f, ordinary, 'ordinary.scope'), issued = await invite(owner);
  for (const client of [visitor, ordinary]) {
    const expected = client === visitor ? 401 : 403;
    for (const path of [PATH, PATH + '/' + issued.invitation.id]) assert.equal((await client.get(path)).status, expected);
    assert.equal((await client.post(PATH, inviteDetails('another.scope'))).status, expected);
    for (const action of ['renew', 'cancel', 'reopen']) assert.equal((await client.post(PATH + '/' + issued.invitation.id + '/' + action, { expectedVersion: 1 })).status, expected);
  }
  await okay(await owner.request('/api/webmaster/sites/minjerribah/roles', { method: 'PUT', data: { accountId: member.identity.accountId, role: 'committee', expectedVersion: 0 } }));
  assert.equal((await ordinary.get(PATH)).status, 403);
  for (const origin of [null, 'https://other.example']) assert.equal((await owner.post(PATH, inviteDetails('origin.scope'), { origin })).status, 403);
  assert.equal((await owner.post(PATH, { ...inviteDetails('forged.scope'), role: 'webmaster' })).status, 400);
  assert.equal((await owner.post(PATH, { ...inviteDetails('forged.scope'), webmaster: true })).status, 400);
  f.setNow('2026-11-28T01:06:00.000Z');
  const stale = await owner.post(PATH + '/' + issued.invitation.id + '/renew', { expectedVersion: 1 });
  assert.equal(stale.status, 403); assert.equal((await stale.json()).code, 'reauthentication_required');
  assert.equal((await owner.get(PATH)).status, 200);
});

test('renew and cancellation invalidate in-flight activation, and explicit reopening preserves the account and history', async t => {
  const f = fixture(t), owner = f.client(), person = f.client(); await enrol(f, owner, 'webmaster.lifecycle', true);
  const issued = await invite(owner), path = PATH + '/' + issued.invitation.id;
  const oldProof = await passkeyProof(person, issued.token);
  const renewed = await okay(await owner.post(path + '/renew', { expectedVersion: 1 }));
  assert.equal(renewed.invitation.version, 2); assert.notEqual(renewed.token, issued.token);
  assert.equal((await person.post('/api/auth/invitation', { token: issued.token })).status, 401);
  assert.equal((await person.post('/api/auth/activate/verify', oldProof.data)).status, 409);
  const password = await passwordProof(person, renewed.token);
  const cancelled = await okay(await owner.post(path + '/cancel', { expectedVersion: 2 }));
  assert.equal(cancelled.invitation.status, 'cancelled'); assert.equal(cancelled.invitation.cancelledAt, NOW);
  assert.equal((await person.post('/api/auth/password/activate/verify', password)).status, 409);
  assert.equal((await person.post('/api/auth/invitation', { token: renewed.token })).status, 401);
  assert.equal(count(f, 'member_site_roles'), 0); assert.equal(count(f, 'member_passwords'), 0);
  assert.equal(f.sqlite.prepare('SELECT status FROM member_accounts WHERE id=?').get(issued.account.accountId).status, 'invited');
  assert.equal((await owner.post(path + '/renew', { expectedVersion: 3 })).status, 409);
  const reopened = await okay(await owner.post(path + '/reopen', { expectedVersion: 3 }));
  assert.equal(reopened.invitation.status, 'pending'); assert.equal(reopened.invitation.version, 4); assert.equal(reopened.invitation.cancelledAt, null);
  assert.equal(reopened.account.accountId, issued.account.accountId);
  await activatePasskey(person, reopened.token);
  const actions = (await okay(await owner.get('/api/webmaster/accounts/' + issued.account.accountId + '/history'))).events.map(event => event.action);
  for (const action of ['committee_invitation_created', 'committee_invitation_renewed', 'committee_invitation_cancelled', 'committee_invitation_reopened', 'committee_invitation_accepted']) assert.ok(actions.includes(action));
});

test('generic account activation actions renew or cancel committee intent without bypassing explicit reopening', async t => {
  const f = fixture(t), owner = f.client(), person = f.client(); await enrol(f, owner, 'webmaster.generic', true);
  const issued = await invite(owner), accountPath = '/api/webmaster/accounts/' + issued.account.accountId;
  assert.equal((await owner.request(accountPath, { method: 'PATCH', data: { expectedVersion: issued.account.version, webmaster: false } })).status, 400);
  assert.equal((await okay(await owner.get(PATH + '/' + issued.invitation.id))).invitation.status, 'pending');
  const renewed = await okay(await owner.post(accountPath + '/invite', { expectedVersion: issued.account.version }));
  assert.equal(renewed.invitation.id, issued.invitation.id); assert.equal(renewed.invitation.version, 2);
  assert.equal((await person.post('/api/auth/invitation', { token: issued.token })).status, 401);
  const cancelled = await okay(await owner.post(accountPath + '/revoke-links', { expectedVersion: renewed.account.version }));
  assert.equal(cancelled.invitation.status, 'cancelled');
  const blocked = await owner.post(accountPath + '/invite', { expectedVersion: cancelled.account.version });
  assert.equal(blocked.status, 409); assert.equal((await blocked.json()).code, 'committee_invitation_cancelled');
  const reopened = await okay(await owner.post(PATH + '/' + issued.invitation.id + '/reopen', { expectedVersion: 3 }));
  const active = await activatePasskey(person, reopened.token); assert.equal(active.identity.accountId, issued.account.accountId);
  const current = await okay(await owner.get(PATH + '/' + issued.invitation.id));
  await okay(await owner.post(accountPath + '/revoke-links', { expectedVersion: current.account.version }));
  assert.equal((await okay(await owner.get(PATH + '/' + issued.invitation.id))).invitation.status, 'accepted');
  assert.equal(f.sqlite.prepare('SELECT role FROM member_site_roles WHERE account_id=?').get(active.identity.accountId).role, 'committee');
});

test('idempotent create recovers metadata without a new token; invalid references and collisions create no partial invitation', async t => {
  const f = fixture(t), owner = f.client(); await enrol(f, owner, 'webmaster.retry', true);
  const payload = inviteDetails(), issued = await invite(owner, payload), retried = await okay(await owner.post(PATH, payload));
  assert.equal(retried.invitation.id, issued.invitation.id); assert.equal(retried.account.accountId, issued.account.accountId); assert.equal(retried.token, undefined);
  assert.equal(count(f, 'member_auth_links'), 1); assert.equal(count(f, 'member_committee_invitations'), 1);
  assert.equal((await owner.post(PATH, { ...payload, siteId: 'other-group' })).status, 409);
  assert.equal((await owner.post(PATH, inviteDetails('bad.group', { siteId: 'not-created' }))).status, 400);
  const collision = await owner.post(PATH, inviteDetails(payload.username));
  assert.equal(collision.status, 409); assert.match((await collision.json()).error, /existing account/i);
  assert.equal(count(f, 'member_accounts'), 2); assert.equal(count(f, 'member_auth_links'), 1); assert.equal(count(f, 'member_committee_invitations'), 1);
  assert.throws(() => f.sqlite.exec('DELETE FROM member_committee_invitations'));
  assert.throws(() => f.sqlite.exec("UPDATE member_committee_invitations SET site_id='different'"));
});

test('version conflicts and authority changes at the write boundary cannot create or renew invitations', async t => {
  const f = fixture(t), owner = f.client(); const admin = await enrol(f, owner, 'webmaster.race', true);
  const issued = await invite(owner), path = PATH + '/' + issued.invitation.id;
  await okay(await owner.post(path + '/renew', { expectedVersion: 1 }));
  assert.equal((await owner.post(path + '/cancel', { expectedVersion: 1 })).status, 409);
  f.beforeNextBatch(() => f.sqlite.prepare('UPDATE member_accounts SET webmaster=0,auth_version=auth_version+1 WHERE id=?').run(admin.identity.accountId));
  assert.equal((await owner.post(path + '/renew', { expectedVersion: 2 })).status, 409);
  assert.equal(f.sqlite.prepare('SELECT version FROM member_committee_invitations WHERE id=?').get(issued.invitation.id).version, 2);
  assert.equal(count(f, 'member_auth_links'), 2);
  assert.equal((await owner.get(PATH)).status, 401);
  const g = fixture(t), other = g.client(); await enrol(g, other, 'webmaster.session', true);
  g.beforeNextBatch(() => g.sqlite.exec('DELETE FROM member_sessions'));
  assert.equal((await other.post(PATH, inviteDetails())).status, 409);
  assert.equal(count(g, 'member_committee_invitations'), 0); assert.equal(count(g, 'member_accounts'), 1);
});

test('register paginates and searches safely, expires links and never returns raw secrets in metadata', async t => {
  const f = fixture(t), owner = f.client(), person = f.client(); const admin = await enrol(f, owner, 'webmaster.register', true);
  const issued = [];
  for (let i = 0; i < 27; i++) issued.push(await invite(owner, inviteDetails('committee.' + String(i).padStart(2, '0'))));
  const first = await okay(await owner.get(PATH)), next = await okay(await owner.get(PATH + '?page=2'));
  assert.equal(first.total, 27); assert.equal(first.invitations.length, 25); assert.equal(next.invitations.length, 2);
  assert.equal(new Set([...first.invitations, ...next.invitations].map(invitation => invitation.id)).size, 27);
  const search = await okay(await owner.get(PATH + '?search=committee.09')); assert.equal(search.total, 1);
  assert.equal((await owner.get(PATH + '?status=not-real')).status, 400);
  const cancelled = await okay(await owner.post(PATH + '/' + issued[0].invitation.id + '/cancel', { expectedVersion: 1 }));
  assert.equal((await okay(await owner.get(PATH + '?status=cancelled'))).total, 1);
  assert.equal((await person.post('/api/auth/invitation', { token: 'bad' })).status, 400);
  f.setNow('2026-11-29T02:00:00.000Z'); await login(owner, admin);
  assert.equal((await person.post('/api/auth/invitation', { token: issued[1].token })).status, 401);
  const expired = await okay(await owner.get(PATH + '?status=expired')); assert.equal(expired.total, 26);
  const renewed = await okay(await owner.post(PATH + '/' + issued[1].invitation.id + '/renew', { expectedVersion: 1 })); assert.equal(renewed.invitation.status, 'pending');
  const records = JSON.stringify(first) + JSON.stringify(next) + JSON.stringify(search) + JSON.stringify(cancelled.invitation);
  for (const invitation of issued) assert.ok(!records.includes(invitation.token));
  assert.doesNotMatch(records, /token_hash|current_link_id|original_payload_json|last_operation_id|sessionHash/);
  const stored = JSON.stringify(f.sqlite.prepare('SELECT * FROM member_auth_audit').all()) + JSON.stringify(f.sqlite.prepare('SELECT * FROM member_committee_invitations').all());
  for (const invitation of issued) assert.ok(!stored.includes(invitation.token));
});

test('audit failure rolls account creation and acceptance back as one transaction', async t => {
  const f = fixture(t), owner = f.client(), person = f.client(); await enrol(f, owner, 'webmaster.atomic', true);
  f.sqlite.exec("CREATE TEMP TRIGGER fail_invite_audit BEFORE INSERT ON member_auth_audit WHEN NEW.action='committee_invitation_created' BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END");
  assert.equal((await owner.post(PATH, inviteDetails())).status, 503);
  assert.equal(count(f, 'member_accounts'), 1); assert.equal(count(f, 'member_committee_invitations'), 0); assert.equal(count(f, 'member_auth_links'), 0);
  f.sqlite.exec('DROP TRIGGER fail_invite_audit'); const issued = await invite(owner);
  const proof = await passkeyProof(person, issued.token);
  f.sqlite.exec("CREATE TEMP TRIGGER fail_role_audit BEFORE INSERT ON member_service_history WHEN NEW.event='committee_invitation_accepted' BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END");
  assert.equal((await person.post('/api/auth/activate/verify', proof.data)).status, 503);
  assert.equal(count(f, 'member_site_roles'), 0); assert.equal(count(f, 'member_passkeys'), 1);
  assert.equal(f.sqlite.prepare('SELECT status FROM member_accounts WHERE id=?').get(issued.account.accountId).status, 'invited');
  assert.equal(f.sqlite.prepare('SELECT redeemed_at FROM member_auth_links WHERE account_id=?').get(issued.account.accountId).redeemed_at, null);
  assert.equal(f.sqlite.prepare('SELECT accepted_at FROM member_committee_invitations').get().accepted_at, null);
  f.sqlite.exec('DROP TRIGGER fail_role_audit'); await okay(await person.post('/api/auth/activate/verify', proof.data));
});

test('ordinary participant invitations retain their activation flow and never acquire committee access', async t => {
  const f = fixture(t), owner = f.client(), person = f.client(); await enrol(f, owner, 'webmaster.participant', true);
  const { siteId, ...payload } = inviteDetails('ordinary.invitee');
  const account = await okay(await owner.post('/api/webmaster/accounts', payload), 201);
  const issued = await okay(await owner.post('/api/webmaster/accounts/' + payload.id + '/invite', { expectedVersion: account.account.version }));
  const context = await okay(await person.post('/api/auth/invitation', { token: issued.token }));
  assert.equal(context.invitation.role, 'participant'); assert.equal(context.invitation.siteId, null); assert.equal(context.invitation.siteName, null);
  const active = await activatePasskey(person, issued.token); assert.equal(active.identity.accountId, payload.id);
  assert.equal(count(f, 'member_committee_invitations'), 0); assert.equal(count(f, 'member_site_roles'), 0);
});
