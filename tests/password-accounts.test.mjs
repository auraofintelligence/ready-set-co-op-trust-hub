import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { client as opaqueClient, ready } from '@serenity-kit/opaque';
import { createSqliteD1 } from '../scripts/sqlite-d1.mjs';
import { handleAccountRequest, resolveAccountSession } from '../cloudflare/accounts.mjs';
import { createTestPasskey } from './helpers/passkeys.mjs';

await ready;
const BASE = 'https://ready-setco.example', NOW = '2026-11-27T10:00:00.000Z';
const PASSWORD = 'A fictional password for private tests 26';
const NEXT_PASSWORD = 'A different fictional password for tests 27';
const consent = { consentAccount: true, consentVersion: '2026-11-27' };
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  for (const name of ['0005_member_accounts.sql', '0007_member_passwords.sql']) sqlite.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const env = { DB: createSqliteD1(sqlite), READY_AUTH_SECRET: randomBytes(32).toString('hex') }; let now = NOW;
  function client() {
    const jar = new Map();
    return { jar, async request(path, { method = 'GET', data, origin = BASE, headers = {} } = {}) {
      const request = new Request(BASE + path, { method, headers: { 'CF-Connecting-IP': '192.0.2.9', Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; '),
        ...(origin ? { Origin: origin } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      const identity = await resolveAccountSession(request, env, { now });
      const response = await handleAccountRequest(request, env, { identity, now });
      const set = response.headers.get('Set-Cookie');
      if (set) { const [name, value] = set.split(';')[0].split('='); if (set.includes('Max-Age=0')) jar.delete(name); else jar.set(name, value); }
      return response;
    }, get(path) { return this.request(path); }, post(path, data = {}, extra = {}) { return this.request(path, { method: 'POST', data, ...extra }); } };
  }
  return { sqlite, env, client, setNow(value) { now = value; } };
}
async function okay(response, status = 200) { const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body; }
function details(name) { return { username: name, displayName: 'Fictional ' + name, email: name + '@example.test', ...consent }; }
async function registration(client, purpose, data, password = PASSWORD) {
  const started = opaqueClient.startRegistration({ password });
  const issued = await okay(await client.post(`/api/auth/password/${purpose}/options`, { ...data, registrationRequest: started.registrationRequest }));
  const finished = opaqueClient.finishRegistration({ clientRegistrationState: started.clientRegistrationState, registrationResponse: issued.registrationResponse, password, keyStretching: 'memory-constrained' });
  return { ceremonyId: issued.ceremonyId, registrationRecord: finished.registrationRecord };
}
async function enrol(client, name, extra = {}, password = PASSWORD) {
  const purpose = extra.bootstrapKey ? 'bootstrap' : 'register';
  return okay(await client.post(`/api/auth/password/${purpose}/verify`, await registration(client, purpose, { ...details(name), ...extra }, password)));
}
async function loginProof(client, username, password = PASSWORD, purpose = 'login') {
  const started = opaqueClient.startLogin({ password });
  const issued = await okay(await client.post(`/api/auth/password/${purpose}/options`, { ...(username === undefined ? {} : { username }), startLoginRequest: started.startLoginRequest }));
  const result = opaqueClient.finishLogin({ clientLoginState: started.clientLoginState, loginResponse: issued.loginResponse, password, keyStretching: 'memory-constrained' });
  return result ? { ceremonyId: issued.ceremonyId, finishLoginRequest: result.finishLoginRequest } : null;
}
async function login(client, username, password = PASSWORD, purpose = 'login') {
  const proof = await loginProof(client, username, password, purpose); assert.ok(proof, 'the fictional password should authenticate');
  return okay(await client.post(`/api/auth/password/${purpose}/verify`, proof));
}
function count(f, table, where = '') { return f.sqlite.prepare('SELECT COUNT(*) AS total FROM ' + table + (where ? ' WHERE ' + where : '')).get().total; }
async function addPasskey(client) {
  const key = createTestPasskey(); const issued = await okay(await client.post('/api/auth/passkeys/options', { name: 'Fictional optional key' }));
  const result = await okay(await client.post('/api/auth/passkeys/verify', { ceremonyId: issued.ceremonyId, response: key.registration(issued.options, { origin: BASE }) }));
  return { key, result };
}

test('real OPAQUE password registration and login reuse native sessions without storing plaintext passwords', async t => {
  const f = fixture(t), person = f.client(), signedIn = f.client();
  const state = await okay(await person.get('/api/auth/session')); assert.equal(state.passwordAvailable, true);
  const created = await enrol(person, 'password.member');
  assert.equal(created.identity.authentication, 'password'); assert.equal(created.identity.hasPassword, true); assert.equal(created.identity.webmaster, false);
  assert.equal(created.recoveryCodes.length, 8); assert.equal(count(f, 'member_passkeys'), 0);
  const logged = await login(signedIn, 'password.member'); assert.equal(logged.identity.accountId, created.identity.accountId);
  assert.equal((await okay(await signedIn.get('/api/auth/session'))).identity.authentication, 'password');
  const records = JSON.stringify(['member_passwords', 'member_password_setup', 'member_password_ceremonies', 'member_auth_audit'].flatMap(table => f.sqlite.prepare('SELECT * FROM ' + table).all()));
  assert.ok(!records.includes(PASSWORD)); assert.ok(!records.includes(NEXT_PASSWORD));
  assert.ok(!records.includes(created.recoveryCodes[0]));
  assert.match(f.sqlite.prepare('SELECT encrypted_setup FROM member_password_setup').get().encrypted_setup, /^v1\./);
  assert.equal(count(f, 'member_sessions', "authentication='password'"), 2);
  assert.equal((await okay(await signedIn.get('/api/auth/passkeys'))).hasPassword, true);
  await okay(await signedIn.post('/api/auth/logout'));
  assert.equal((await okay(await signedIn.get('/api/auth/session'))).authenticated, false);
});

test('unknown usernames and wrong passwords do not create sessions; server login state stays encrypted', async t => {
  const f = fixture(t); await enrol(f.client(), 'correct.account'); const visitor = f.client();
  assert.equal(await loginProof(visitor, 'correct.account', NEXT_PASSWORD), null);
  assert.equal(await loginProof(visitor, 'unknown.account', PASSWORD), null);
  assert.equal(count(f, 'member_sessions'), 1);
  const pending = f.sqlite.prepare("SELECT encrypted_login_state FROM member_password_ceremonies WHERE purpose='login'").all();
  assert.equal(pending.length, 2); assert.ok(pending.every(row => /^v1\./.test(row.encrypted_login_state)));
  assert.equal((await okay(await visitor.get('/api/auth/session'))).authenticated, false);
});

test('password endpoints reject malformed protocol values, extra password fields and cross-site mutations before account changes', async t => {
  const f = fixture(t), client = f.client();
  for (const registrationRequest of [null, 42, {}, [], '', 'a'.repeat(44), '_'.repeat(43), 'a+'.repeat(21) + 'a']) {
    assert.equal((await client.post('/api/auth/password/register/options', { ...details('invalid.member'), registrationRequest })).status, 400);
  }
  const valid = opaqueClient.startRegistration({ password: PASSWORD });
  assert.equal((await client.post('/api/auth/password/register/options', { ...details('invalid.member'), registrationRequest: valid.registrationRequest, password: PASSWORD })).status, 400);
  for (const origin of [null, 'https://other.example']) assert.equal((await client.post('/api/auth/password/register/options', { ...details('invalid.member'), registrationRequest: valid.registrationRequest }, { origin })).status, 403);
  assert.equal(count(f, 'member_accounts'), 0); assert.equal(count(f, 'member_password_setup'), 0);
});

test('initial webmaster bootstrap is one-use across password and passkey ceremonies and cannot be claimed by ordinary registration', async t => {
  const f = fixture(t), passwordOwner = f.client(), passkeyOwner = f.client();
  await enrol(f.client(), 'ordinary.person');
  const begin = opaqueClient.startRegistration({ password: PASSWORD });
  assert.equal((await passwordOwner.post('/api/auth/password/bootstrap/options', { ...details('bad.owner'), registrationRequest: begin.registrationRequest, bootstrapKey: randomBytes(32).toString('hex') })).status, 403);
  const passwordProof = await registration(passwordOwner, 'bootstrap', { ...details('owner.password'), bootstrapKey: f.env.READY_AUTH_SECRET });
  const key = createTestPasskey(); const passkeyIssued = await okay(await passkeyOwner.post('/api/auth/bootstrap/options', { ...details('owner.passkey'), bootstrapKey: f.env.READY_AUTH_SECRET }));
  const responses = await Promise.all([
    passwordOwner.post('/api/auth/password/bootstrap/verify', passwordProof),
    passkeyOwner.post('/api/auth/bootstrap/verify', { ceremonyId: passkeyIssued.ceremonyId, response: key.registration(passkeyIssued.options, { origin: BASE }) }),
  ]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(count(f, 'member_auth_bootstrap'), 1); assert.equal(count(f, 'member_accounts', 'webmaster=1'), 1);
  assert.throws(() => f.sqlite.exec('DELETE FROM member_auth_bootstrap'));
  assert.equal((await okay(await f.client().get('/api/auth/session'))).bootstrapAvailable, false);
});

test('password proofs are origin-bound, browser-bound and single-use, including rejected authentication proofs', async t => {
  const f = fixture(t), first = f.client(), other = f.client();
  const registrationProof = await registration(first, 'register', details('bound.account'));
  assert.equal((await other.post('/api/auth/password/register/verify', registrationProof)).status, 401);
  await okay(await first.post('/api/auth/password/register/verify', registrationProof));
  assert.equal((await first.post('/api/auth/password/register/verify', registrationProof)).status, 401);
  const signIn = f.client(); const proof = await loginProof(signIn, 'bound.account');
  assert.equal((await other.post('/api/auth/password/login/verify', proof)).status, 401);
  assert.equal((await signIn.post('/api/auth/password/login/verify', proof, { origin: 'https://other.example' })).status, 403);
  await okay(await signIn.post('/api/auth/password/login/verify', proof));
  assert.equal((await signIn.post('/api/auth/password/login/verify', proof)).status, 401);
  const rejected = f.client(), validLater = await loginProof(rejected, 'bound.account');
  const forged = { ...validLater, finishLoginRequest: randomBytes(64).toString('base64url') };
  assert.equal((await rejected.post('/api/auth/password/login/verify', forged)).status, 401);
  assert.equal((await rejected.post('/api/auth/password/login/verify', validLater)).status, 401);
});

test('reauthentication remains on the current account and replaces its old session; changed permissions invalidate pending login', async t => {
  const f = fixture(t), alice = f.client(), bob = f.client(); const account = await enrol(alice, 'reauth.alice'); await enrol(bob, 'reauth.bob');
  const started = opaqueClient.startLogin({ password: PASSWORD });
  assert.equal((await alice.post('/api/auth/password/reauth/options', { username: 'reauth.bob', startLoginRequest: started.startLoginRequest })).status, 403);
  const old = alice.jar.get('__Host-ready_session'); await login(alice, undefined, PASSWORD, 'reauth');
  assert.notEqual(alice.jar.get('__Host-ready_session'), old); assert.equal(count(f, 'member_sessions'), 2);
  const oldClient = f.client(); oldClient.jar.set('__Host-ready_session', old);
  assert.equal((await okay(await oldClient.get('/api/auth/session'))).authenticated, false);
  const pending = f.client(), proof = await loginProof(pending, 'reauth.alice');
  f.sqlite.prepare('UPDATE member_accounts SET version=version+1,auth_version=auth_version+1 WHERE id=?').run(account.identity.accountId);
  assert.equal((await pending.post('/api/auth/password/login/verify', proof)).status, 401);
  assert.equal((await okay(await pending.get('/api/auth/session'))).authenticated, false);
});

test('password change requires recent sign-in, keeps optional passkeys and rotates sessions, links and recovery codes', async t => {
  const f = fixture(t), person = f.client(); const created = await enrol(person, 'change.person');
  const added = await addPasskey(person); assert.equal(added.result.identity.authentication, 'password');
  const oldSession = person.jar.get('__Host-ready_session');
  f.setNow('2026-11-27T10:06:00.000Z');
  const start = opaqueClient.startRegistration({ password: NEXT_PASSWORD });
  assert.equal((await person.post('/api/auth/password/change/options', { registrationRequest: start.registrationRequest })).status, 403);
  await login(person, undefined, PASSWORD, 'reauth');
  const changed = await okay(await person.post('/api/auth/password/change/verify', await registration(person, 'change', {}, NEXT_PASSWORD)));
  assert.equal(changed.identity.hasPassword, true); assert.equal(changed.recoveryCodes.length, 8);
  assert.equal(count(f, 'member_passkeys', 'revoked_at IS NULL'), 1); assert.equal(count(f, 'member_passwords', 'revoked_at IS NULL'), 1);
  assert.equal(count(f, 'member_sessions'), 1); assert.notEqual(person.jar.get('__Host-ready_session'), oldSession);
  assert.equal(await loginProof(f.client(), 'change.person', PASSWORD), null);
  await login(f.client(), 'change.person', NEXT_PASSWORD);
  const recoveryStart = opaqueClient.startRegistration({ password: PASSWORD });
  assert.equal((await f.client().post('/api/auth/password/recover/options', { username: 'change.person', recoveryCode: created.recoveryCodes[0], registrationRequest: recoveryStart.registrationRequest })).status, 401);
});

test('password recovery revokes old passwords and passkeys, and stale recovery leaves its unused code available', async t => {
  const f = fixture(t), original = f.client(), recovering = f.client(); const created = await enrol(original, 'recover.person'); await addPasskey(original);
  const proof = await registration(recovering, 'recover', { username: 'recover.person', recoveryCode: created.recoveryCodes[0] }, NEXT_PASSWORD);
  f.sqlite.prepare('UPDATE member_accounts SET version=version+1 WHERE id=?').run(created.identity.accountId);
  assert.equal((await recovering.post('/api/auth/password/recover/verify', proof)).status, 409);
  assert.equal(count(f, 'member_recovery_codes', 'used_at IS NOT NULL'), 0);
  const fresh = await registration(recovering, 'recover', { username: 'recover.person', recoveryCode: created.recoveryCodes[0] }, NEXT_PASSWORD);
  const recovered = await okay(await recovering.post('/api/auth/password/recover/verify', fresh));
  assert.equal(recovered.recoveryCodes.length, 8); assert.equal(count(f, 'member_passkeys', 'revoked_at IS NULL'), 0);
  assert.equal(count(f, 'member_passwords', 'revoked_at IS NULL'), 1); assert.equal(count(f, 'member_sessions'), 1);
  assert.equal((await okay(await original.get('/api/auth/session'))).authenticated, false);
  assert.equal(await loginProof(f.client(), 'recover.person', PASSWORD), null); await login(f.client(), 'recover.person', NEXT_PASSWORD);
});

test('passkey recovery also revokes the old password and the last total credential remains protected', async t => {
  const f = fixture(t), original = f.client(), recovering = f.client(); const created = await enrol(original, 'hybrid.person');
  await addPasskey(original); const keys = await okay(await original.get('/api/auth/passkeys'));
  await okay(await original.request('/api/auth/passkeys/' + keys.passkeys[0].id, { method: 'DELETE', data: {} }));
  assert.equal(count(f, 'member_passkeys', 'revoked_at IS NULL'), 0); await login(original, 'hybrid.person');
  const key = createTestPasskey(), issued = await okay(await recovering.post('/api/auth/recover/options', { username: 'hybrid.person', recoveryCode: created.recoveryCodes[0] }));
  const recovered = await okay(await recovering.post('/api/auth/recover/verify', { ceremonyId: issued.ceremonyId, response: key.registration(issued.options, { origin: BASE }) }));
  assert.equal(recovered.identity.hasPassword, false); assert.equal(count(f, 'member_passwords', 'revoked_at IS NULL'), 0);
  assert.equal(await loginProof(f.client(), 'hybrid.person'), null);
  const remaining = await okay(await recovering.get('/api/auth/passkeys'));
  assert.equal((await recovering.request('/api/auth/passkeys/' + remaining.passkeys[0].id, { method: 'DELETE', data: {} })).status, 409);
});

test('encrypted server setup survives concurrent first registrations and refuses silent regeneration after secret change', async t => {
  const f = fixture(t), a = f.client(), b = f.client();
  const [proofA, proofB] = await Promise.all([registration(a, 'register', details('setup.alice')), registration(b, 'register', details('setup.bob'))]);
  await okay(await a.post('/api/auth/password/register/verify', proofA)); await okay(await b.post('/api/auth/password/register/verify', proofB));
  assert.equal(count(f, 'member_password_setup'), 1); await login(f.client(), 'setup.alice'); await login(f.client(), 'setup.bob');
  const originalSecret = f.env.READY_AUTH_SECRET, stored = f.sqlite.prepare('SELECT encrypted_setup FROM member_password_setup').get().encrypted_setup;
  f.env.READY_AUTH_SECRET = randomBytes(32).toString('hex');
  const started = opaqueClient.startLogin({ password: PASSWORD });
  const failed = await okay(await f.client().post('/api/auth/password/login/options', { username: 'setup.alice', startLoginRequest: started.startLoginRequest }), 503);
  assert.equal(failed.code, 'password_key_unavailable'); assert.equal(f.sqlite.prepare('SELECT encrypted_setup FROM member_password_setup').get().encrypted_setup, stored);
  assert.throws(() => f.sqlite.exec('DELETE FROM member_password_setup'));
  f.env.READY_AUTH_SECRET = originalSecret; await login(f.client(), 'setup.alice');
});

test('audit failure rolls password creation back with account, credentials, session and one-use ceremony', async t => {
  const f = fixture(t), person = f.client(), proof = await registration(person, 'register', details('atomic.person'));
  f.sqlite.exec("CREATE TRIGGER reject_password_audit BEFORE INSERT ON member_auth_audit BEGIN SELECT RAISE(ABORT,'fictional audit outage'); END");
  await assert.rejects(person.post('/api/auth/password/register/verify', proof), /fictional audit outage/);
  for (const table of ['member_accounts', 'member_passwords', 'member_sessions', 'member_recovery_codes']) assert.equal(count(f, table), 0);
  assert.equal(f.sqlite.prepare('SELECT consumed_at FROM member_password_ceremonies WHERE id=?').get(proof.ceremonyId).consumed_at, null);
  f.sqlite.exec('DROP TRIGGER reject_password_audit'); await okay(await person.post('/api/auth/password/register/verify', proof));
});

test('expired password ceremonies and account limits prevent account creation or login', async t => {
  const f = fixture(t), person = f.client(), proof = await registration(person, 'register', details('expired.person'));
  f.setNow('2026-11-27T10:06:00.000Z'); assert.equal((await person.post('/api/auth/password/register/verify', proof)).status, 401);
  const started = opaqueClient.startLogin({ password: PASSWORD });
  for (let i = 0; i < 20; i++) await okay(await person.post('/api/auth/password/login/options', { username: 'limited.person', startLoginRequest: started.startLoginRequest }));
  assert.equal((await person.post('/api/auth/password/login/options', { username: 'limited.person', startLoginRequest: started.startLoginRequest })).status, 429);
  const limits = JSON.stringify(f.sqlite.prepare('SELECT * FROM member_auth_limits').all()); assert.ok(!limits.includes('limited.person')); assert.ok(!limits.includes('192.0.2.9'));
  assert.equal(count(f, 'member_accounts'), 0);
});

test('password activation and manual recovery links are scoped, one-use and do not send messages', async t => {
  const f = fixture(t), owner = f.client(), invited = f.client(); await enrol(owner, 'invite.owner', { bootstrapKey: f.env.READY_AUTH_SECRET });
  const accountId = crypto.randomUUID();
  await okay(await owner.post('/api/webmaster/accounts', { id: accountId, username: 'invited.person', displayName: 'Fictional invited person', email: 'invite@example.test' }), 201);
  const link = await okay(await owner.post(`/api/webmaster/accounts/${accountId}/invite`, { expectedVersion: 1 }));
  assert.equal(link.sent, false); assert.equal(count(f, 'member_passwords'), 1);
  const proof = await registration(invited, 'activate', { token: link.token, ...consent });
  const activated = await okay(await invited.post('/api/auth/password/activate/verify', proof));
  assert.equal(activated.identity.accountId, accountId); assert.equal(activated.identity.hasPassword, true);
  assert.equal((await invited.post('/api/auth/password/activate/verify', proof)).status, 401);
  const latest = (await okay(await owner.get('/api/webmaster/accounts?search=invited.person'))).accounts[0];
  const recovery = await okay(await owner.post(`/api/webmaster/accounts/${accountId}/recovery-link`, { expectedVersion: latest.version }));
  assert.equal(recovery.sent, false);
  const recovering = f.client(), recoveredProof = await registration(recovering, 'recover', { token: recovery.token }, NEXT_PASSWORD);
  await okay(await recovering.post('/api/auth/password/recover/verify', recoveredProof));
  assert.equal((await okay(await invited.get('/api/auth/session'))).authenticated, false);
  const retry = opaqueClient.startRegistration({ password: PASSWORD });
  assert.equal((await f.client().post('/api/auth/password/recover/options', { token: recovery.token, registrationRequest: retry.registrationRequest })).status, 401);
});

test('password-confirmed recovery code replacement refreshes the session and invalidates old codes only', async t => {
  const f = fixture(t), person = f.client(), other = f.client(); const created = await enrol(person, 'codes.person'); await login(other, 'codes.person'); await addPasskey(person);
  const priorSession = person.jar.get('__Host-ready_session');
  const proof = await loginProof(person, undefined, PASSWORD, 'recovery-codes');
  const changed = await okay(await person.post('/api/auth/password/recovery-codes/verify', proof));
  assert.equal(changed.recoveryCodes.length, 8); assert.equal(changed.identity.authentication, 'password');
  assert.notEqual(person.jar.get('__Host-ready_session'), priorSession); assert.equal(count(f, 'member_sessions'), 1);
  assert.equal(count(f, 'member_passkeys', 'revoked_at IS NULL'), 1); assert.equal(count(f, 'member_passwords', 'revoked_at IS NULL'), 1);
  assert.equal((await okay(await other.get('/api/auth/session'))).authenticated, false);
  const started = opaqueClient.startRegistration({ password: NEXT_PASSWORD });
  assert.equal((await f.client().post('/api/auth/password/recover/options', { username: 'codes.person', recoveryCode: created.recoveryCodes[0], registrationRequest: started.registrationRequest })).status, 401);
});

test('encrypted login state cannot be swapped between attempts and a revoked session cannot complete password change', async t => {
  const f = fixture(t), person = f.client(); await enrol(person, 'bound.state');
  const a = f.client(), b = f.client(), aProof = await loginProof(a, 'bound.state'), bProof = await loginProof(b, 'bound.state');
  const bState = f.sqlite.prepare('SELECT encrypted_login_state FROM member_password_ceremonies WHERE id=?').get(bProof.ceremonyId).encrypted_login_state;
  f.sqlite.prepare('UPDATE member_password_ceremonies SET encrypted_login_state=? WHERE id=?').run(bState, aProof.ceremonyId);
  assert.equal((await a.post('/api/auth/password/login/verify', aProof)).status, 401);
  assert.equal(count(f, 'member_sessions'), 1);
  const change = await registration(person, 'change', {}, NEXT_PASSWORD);
  await okay(await person.post('/api/auth/sessions/revoke'));
  assert.equal((await person.post('/api/auth/password/change/verify', change)).status, 401);
  await login(f.client(), 'bound.state', PASSWORD); assert.equal(await loginProof(f.client(), 'bound.state', NEXT_PASSWORD), null);
});
