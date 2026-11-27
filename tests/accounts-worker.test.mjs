import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSqliteD1 } from '../scripts/sqlite-d1.mjs';
import { handleAccountRequest, resolveAccountSession } from '../cloudflare/accounts.mjs';
import { createTestPasskey } from './helpers/passkeys.mjs';

const BASE = 'https://ready-setco.example';
const NOW = '2026-11-27T10:00:00.000Z';
const consent = { consentAccount: true, consentVersion: '2026-11-27' };
function fixture(t, { migrate = true, configured = true } = {}) {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  if (migrate) for (const name of ['0005_member_accounts.sql', '0007_member_passwords.sql']) sqlite.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const env = { DB: createSqliteD1(sqlite), ...(configured ? { READY_AUTH_SECRET: randomBytes(32).toString('hex') } : {}) };
  let now = NOW;
  function client() {
    const jar = new Map();
    return {
      jar,
      async request(path, { method = 'GET', data, origin = BASE, headers = {} } = {}) {
        const request = new Request(BASE + path, { method, headers: { 'CF-Connecting-IP': '192.0.2.1',
          ...(origin === null ? {} : { Origin: origin }), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
          Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; '), ...headers },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
        const identity = await resolveAccountSession(request, env, { now });
        const response = await handleAccountRequest(request, env, { identity, now });
        const set = response.headers.get('Set-Cookie');
        if (set) {
          const [name, value] = set.split(';')[0].split('=');
          if (set.includes('Max-Age=0')) jar.delete(name); else jar.set(name, value);
        }
        return response;
      },
      get(path) { return this.request(path); },
      post(path, data = {}, options = {}) { return this.request(path, { method: 'POST', data, ...options }); },
    };
  }
  return { sqlite, env, client, setNow(value) { now = value; } };
}
async function success(response, status = 200) {
  const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body;
}
async function options(client, purpose, data) { return success(await client.post('/api/auth/' + purpose + '/options', data)); }
async function enrol(client, name, extra = {}) {
  const purpose = extra.bootstrapKey ? 'bootstrap' : 'register';
  const begin = await options(client, purpose, { username: name, displayName: 'Fictional ' + name, email: name + '@example.test', ...consent, ...extra });
  const key = createTestPasskey();
  const result = await success(await client.post('/api/auth/' + purpose + '/verify', { ceremonyId: begin.ceremonyId, response: key.registration(begin.options, { origin: BASE }) }));
  return { ...result, key, client };
}
async function login(client, account, key = account.key) {
  const begin = await options(client, 'login', { username: account.identity.username });
  return client.post('/api/auth/login/verify', { ceremonyId: begin.ceremonyId, response: key.authentication(begin.options, { origin: BASE, accountId: account.identity.accountId }) });
}
function count(f, table) { return f.sqlite.prepare('SELECT COUNT(*) AS total FROM ' + table).get().total; }

test('native auth is unavailable safely before configuration and never reads D1 without a session cookie', async t => {
  const absent = { DB: { prepare() { throw new Error('must not read'); } }, READY_AUTH_SECRET: randomBytes(32).toString('hex') };
  assert.equal(await resolveAccountSession(new Request(BASE + '/api/auth/session'), absent), null);
  const f = fixture(t, { migrate: false }); const client = f.client();
  const state = await success(await client.get('/api/auth/session'));
  assert.equal(state.authConfigured, false); assert.equal(state.schemaReady, false); assert.equal(state.bootstrapAvailable, false);
  const request = await client.post('/api/auth/register/options', { username: 'fictional', displayName: 'Fictional', email: 'f@example.test', ...consent });
  assert.equal(request.status, 503); assert.equal((await request.json()).code, 'account_migration_required');
  const g = fixture(t, { configured: false });
  assert.equal((await success(await g.client().get('/api/auth/session'))).authConfigured, false);
});

test('real passkey registration creates a private participant, sign-in persists, and logout revokes the session', async t => {
  const f = fixture(t); const client = f.client(); const member = await enrol(client, 'participant.one');
  assert.equal(member.identity.webmaster, false); assert.equal(member.identity.emailVerified, false);
  assert.equal(member.identity.status, 'active'); assert.equal(member.recoveryCodes.length, 8);
  const state = await success(await client.get('/api/auth/session')); assert.equal(state.identity.accountId, member.identity.accountId);
  const session = f.sqlite.prepare('SELECT * FROM member_sessions').get();
  assert.match(session.token_hash, /^[a-f0-9]{64}$/); assert.notEqual(session.token_hash, client.jar.get('__Host-ready_session'));
  const account = f.sqlite.prepare('SELECT * FROM member_accounts').get();
  assert.equal(account.consent_account, 1); assert.equal(account.consent_version, consent.consentVersion);
  const allRows = JSON.stringify(f.sqlite.prepare('SELECT * FROM member_recovery_codes').all());
  assert.ok(member.recoveryCodes.every(code => !allRows.includes(code)));
  assert.equal((await client.get('/api/webmaster/accounts')).status, 403);
  const another = f.client(); const logged = await login(another, member);
  assert.match(logged.headers.get('Set-Cookie'), /Secure/); assert.match(logged.headers.get('Set-Cookie'), /HttpOnly/); assert.match(logged.headers.get('Set-Cookie'), /SameSite=Strict/);
  await success(logged);
  await success(await another.post('/api/auth/logout'));
  assert.equal((await success(await another.get('/api/auth/session'))).authenticated, false);
  assert.equal(count(f, 'member_sessions'), 1);
});

test('bootstrap needs the private key, remains available after ordinary registration, and is permanently one-use', async t => {
  const f = fixture(t); await enrol(f.client(), 'ordinary.first'); const owner = f.client();
  const data = { username: 'owner.account', displayName: 'Fictional owner', email: 'owner@example.test', ...consent };
  assert.equal((await owner.post('/api/auth/bootstrap/options', { ...data, bootstrapKey: randomBytes(32).toString('hex') })).status, 403);
  assert.equal((await success(await owner.get('/api/auth/session'))).bootstrapAvailable, true);
  const other = f.client();
  const a = await options(owner, 'bootstrap', { ...data, bootstrapKey: f.env.READY_AUTH_SECRET });
  const b = await options(other, 'bootstrap', { ...data, username: 'owner.other', bootstrapKey: f.env.READY_AUTH_SECRET });
  const ak = createTestPasskey(), bk = createTestPasskey();
  const results = await Promise.all([
    owner.post('/api/auth/bootstrap/verify', { ceremonyId: a.ceremonyId, response: ak.registration(a.options, { origin: BASE }) }),
    other.post('/api/auth/bootstrap/verify', { ceremonyId: b.ceremonyId, response: bk.registration(b.options, { origin: BASE }) }),
  ]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
  assert.equal(count(f, 'member_auth_bootstrap'), 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS total FROM member_accounts WHERE webmaster=1').get().total, 1);
  assert.equal(count(f, 'member_accounts'), 2);
  assert.throws(() => f.sqlite.exec('DELETE FROM member_auth_bootstrap'));
  assert.throws(() => f.sqlite.exec('UPDATE member_auth_bootstrap SET claimed_at=claimed_at'));
  delete f.env.READY_AUTH_SECRET;
  const state = await success(await owner.get('/api/auth/session'));
  assert.equal(state.setupComplete, true); assert.equal(state.authConfigured, false); assert.equal(state.bootstrapAvailable, false);
});

test('origin, consent, actor forgery, browser binding, user verification, signatures and challenge replay fail closed', async t => {
  const f = fixture(t); const client = f.client();
  const data = { username: 'protected.user', displayName: 'Fictional', email: 'p@example.test', ...consent };
  for (const origin of [null, 'https://other.example']) assert.equal((await client.post('/api/auth/register/options', data, { origin })).status, 403);
  assert.equal((await client.post('/api/auth/register/options', { ...data, webmaster: true })).status, 400);
  assert.equal((await client.post('/api/auth/register/options', { ...data, consentAccount: false })).status, 400);
  let begin = await options(client, 'register', data); const key = createTestPasskey();
  const verify = { ceremonyId: begin.ceremonyId, response: key.registration(begin.options, { origin: BASE }) };
  assert.equal((await f.client().post('/api/auth/register/verify', verify)).status, 401);
  assert.equal((await client.post('/api/auth/register/verify', { ...verify, response: key.registration(begin.options, { origin: BASE, flags: 0x41 }) })).status, 401);
  assert.equal((await client.post('/api/auth/register/verify', { ...verify, response: key.registration(begin.options, { origin: 'https://other.example' }) })).status, 401);
  const member = await success(await client.post('/api/auth/register/verify', verify));
  assert.equal((await client.post('/api/auth/register/verify', verify)).status, 401);
  begin = await options(client, 'login', { username: data.username });
  const response = key.authentication(begin.options, { origin: BASE, accountId: member.identity.accountId });
  const forged = structuredClone(response); const signature = Buffer.from(forged.response.signature, 'base64url'); signature[signature.length - 1] ^= 1; forged.response.signature = signature.toString('base64url');
  assert.equal((await client.post('/api/auth/login/verify', { ceremonyId: begin.ceremonyId, response: forged })).status, 401);
  await success(await client.post('/api/auth/login/verify', { ceremonyId: begin.ceremonyId, response }));
  assert.equal((await client.post('/api/auth/login/verify', { ceremonyId: begin.ceremonyId, response })).status, 401);
  begin = await options(client, 'login', {});
  f.setNow('2026-11-27T10:06:00.000Z');
  assert.equal((await client.post('/api/auth/login/verify', { ceremonyId: begin.ceremonyId, response: key.authentication(begin.options, { origin: BASE }) })).status, 401);
  assert.equal(count(f, 'member_accounts'), 1);
});

test('invitation retries keep the current version, activation requires consent and links and codes cannot be replayed', async t => {
  const f = fixture(t); const admin = f.client(); await enrol(admin, 'webmaster.one', { bootstrapKey: f.env.READY_AUTH_SECRET });
  const payload = { id: crypto.randomUUID(), username: 'invite.one', displayName: 'Fictional invitee', email: 'invite@example.test' };
  const reserved = await success(await admin.post('/api/webmaster/accounts', payload), 201);
  const link = await success(await admin.post('/api/webmaster/accounts/' + payload.id + '/invite', { expectedVersion: reserved.account.version }));
  assert.equal(link.sent, false); assert.equal(link.purpose, 'activation');
  const retry = await success(await admin.post('/api/webmaster/accounts', payload)); assert.equal(retry.account.version, link.account.version);
  assert.equal((await admin.post('/api/webmaster/accounts', { ...payload, displayName: 'Different' })).status, 409);
  assert.equal((await admin.post('/api/webmaster/accounts/' + payload.id + '/invite', { expectedVersion: 1 })).status, 409);
  const invited = f.client();
  assert.equal((await invited.post('/api/auth/activate/options', { token: link.token })).status, 400);
  assert.equal((await invited.post('/api/auth/recover/options', { token: link.token })).status, 401);
  const begin = await options(invited, 'activate', { token: link.token, ...consent }); const key = createTestPasskey();
  const active = await success(await invited.post('/api/auth/activate/verify', { ceremonyId: begin.ceremonyId, response: key.registration(begin.options, { origin: BASE }) }));
  assert.equal(active.identity.accountId, payload.id);
  assert.equal((await invited.post('/api/auth/activate/options', { token: link.token, ...consent })).status, 401);
  const recovery = f.client();
  const rb = await options(recovery, 'recover', { username: payload.username, recoveryCode: active.recoveryCodes[0] }); const replacement = createTestPasskey();
  const recovered = await success(await recovery.post('/api/auth/recover/verify', { ceremonyId: rb.ceremonyId, response: replacement.registration(rb.options, { origin: BASE }) }));
  assert.equal(recovered.identity.accountId, payload.id); assert.equal(recovered.recoveryCodes.length, 8);
  assert.equal((await success(await invited.get('/api/auth/session'))).authenticated, false);
  assert.equal((await login(f.client(), { identity: active.identity, key })).status, 401);
  await success(await login(f.client(), { identity: active.identity, key: replacement }));
  assert.equal((await f.client().post('/api/auth/recover/options', { username: payload.username, recoveryCode: active.recoveryCodes[0] })).status, 401);
  const history = await success(await admin.get('/api/webmaster/accounts/' + payload.id + '/history'));
  const stored = JSON.stringify(history) + JSON.stringify(f.sqlite.prepare('SELECT * FROM member_auth_links').all()) + JSON.stringify(f.sqlite.prepare('SELECT * FROM member_auth_ceremonies').all());
  assert.ok(!stored.includes(link.token)); assert.ok(!stored.includes(active.recoveryCodes[0]));
  assert.ok(history.events.every(event => !event.actor.includes('pretend')));
});

test('security controls require recent sign-in, cannot remove the last key, and revoke old sessions and codes', async t => {
  const f = fixture(t); const client = f.client(); const member = await enrol(client, 'security.user');
  let keys = await success(await client.get('/api/auth/passkeys'));
  assert.equal(keys.passkeys.length, 1); assert.equal(keys.recoveryCodesRemaining, 8);
  assert.equal((await client.request('/api/auth/passkeys/' + keys.passkeys[0].id, { method: 'DELETE', data: {} })).status, 409);
  f.setNow('2026-11-27T10:06:00.000Z');
  assert.equal((await client.post('/api/auth/passkeys/options', { name: 'Second device' })).status, 403);
  await success(await login(client, member));
  const add = await options(client, 'passkeys', { name: 'Second device' }); const second = createTestPasskey();
  await success(await client.post('/api/auth/passkeys/verify', { ceremonyId: add.ceremonyId, response: second.registration(add.options, { origin: BASE }) }));
  keys = await success(await client.get('/api/auth/passkeys')); assert.equal(keys.passkeys.length, 2);
  const own = keys.passkeys.find(key => key.name === 'Passkey');
  await success(await client.request('/api/auth/passkeys/' + own.id, { method: 'DELETE', data: {} }));
  assert.equal((await success(await client.get('/api/auth/session'))).authenticated, false);
  assert.equal((await login(f.client(), member)).status, 401);
  await success(await login(client, member, second));
  const rotate = await options(client, 'recovery-codes', {});
  const rotated = await success(await client.post('/api/auth/recovery-codes/verify', { ceremonyId: rotate.ceremonyId,
    response: second.authentication(rotate.options, { origin: BASE, accountId: member.identity.accountId }) }));
  assert.equal(rotated.recoveryCodes.length, 8); assert.equal(count(f, 'member_sessions'), 1);
  assert.equal((await f.client().post('/api/auth/recover/options', { username: member.identity.username, recoveryCode: member.recoveryCodes[1] })).status, 401);
  await success(await client.post('/api/auth/sessions/revoke'));
  assert.equal(count(f, 'member_sessions'), 0);
});

test('webmaster changes use versions, revoke privileges and atomically preserve an active webmaster', async t => {
  const f = fixture(t); const first = await enrol(f.client(), 'owner.first', { bootstrapKey: f.env.READY_AUTH_SECRET });
  const second = await enrol(f.client(), 'owner.second');
  const path = '/api/webmaster/accounts/';
  assert.equal((await first.client.request(path + first.identity.accountId, { method: 'PATCH', data: { expectedVersion: 1, webmaster: false } })).status, 409);
  const promoted = await success(await first.client.request(path + second.identity.accountId, { method: 'PATCH', data: { expectedVersion: 1, webmaster: true } }));
  assert.equal(promoted.account.webmaster, true);
  assert.equal((await success(await second.client.get('/api/auth/session'))).authenticated, false);
  await success(await login(second.client, second));
  const [a, b] = await Promise.all([
    first.client.request(path + first.identity.accountId, { method: 'PATCH', data: { expectedVersion: 1, webmaster: false } }),
    second.client.request(path + second.identity.accountId, { method: 'PATCH', data: { expectedVersion: promoted.account.version, webmaster: false } }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS total FROM member_accounts WHERE webmaster=1 AND status='active'").get().total, 1);
  assert.throws(() => f.sqlite.exec("UPDATE member_auth_audit SET actor='forged'"));
  assert.throws(() => f.sqlite.exec('DELETE FROM member_auth_audit'));
});

test('failed audit persistence rolls back the passkey, account, session and consumed challenge together', async t => {
  const f = fixture(t); const client = f.client();
  const begin = await options(client, 'register', { username: 'rollback.user', displayName: 'Fictional rollback', email: 'r@example.test', ...consent });
  const key = createTestPasskey();
  const data = { ceremonyId: begin.ceremonyId, response: key.registration(begin.options, { origin: BASE }) };
  f.sqlite.exec("CREATE TRIGGER reject_auth_audit BEFORE INSERT ON member_auth_audit BEGIN SELECT RAISE(ABORT, 'Simulated storage failure'); END;");
  await assert.rejects(client.post('/api/auth/register/verify', data), /Simulated storage failure/);
  for (const table of ['member_accounts', 'member_passkeys', 'member_sessions', 'member_recovery_codes']) assert.equal(count(f, table), 0);
  assert.equal(f.sqlite.prepare('SELECT consumed_at FROM member_auth_ceremonies WHERE id=?').get(begin.ceremonyId).consumed_at, null);
  f.sqlite.exec('DROP TRIGGER reject_auth_audit');
  await success(await client.post('/api/auth/register/verify', data));
  assert.equal(count(f, 'member_accounts'), 1);
});

test('auth attempts are rate limited in D1 and sensitive bodies are bounded', async t => {
  const f = fixture(t); const client = f.client();
  for (let i = 0; i < 20; i++) await success(await client.post('/api/auth/login/options', { username: 'limited.user' }));
  assert.equal((await client.post('/api/auth/login/options', { username: 'limited.user' })).status, 429);
  assert.equal((await client.post('/api/auth/login/options', { username: 'x'.repeat(14000) })).status, 413);
  assert.ok(!JSON.stringify(f.sqlite.prepare('SELECT * FROM member_auth_limits').all()).includes('192.0.2.1'));
});

test('an intervening account change does not consume a recovery code from a stale ceremony', async t => {
  const f = fixture(t); const owner = await enrol(f.client(), 'recovery.owner', { bootstrapKey: f.env.READY_AUTH_SECRET });
  const member = await enrol(f.client(), 'recovery.member'); const client = f.client();
  const begin = await options(client, 'recover', { username: member.identity.username, recoveryCode: member.recoveryCodes[0] });
  await success(await owner.client.post('/api/webmaster/accounts/' + member.identity.accountId + '/revoke-links', { expectedVersion: member.identity.version }));
  const key = createTestPasskey();
  assert.equal((await client.post('/api/auth/recover/verify', { ceremonyId: begin.ceremonyId, response: key.registration(begin.options, { origin: BASE }) })).status, 409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS total FROM member_recovery_codes WHERE account_id=? AND used_at IS NOT NULL').get(member.identity.accountId).total, 0);
  const fresh = await options(client, 'recover', { username: member.identity.username, recoveryCode: member.recoveryCodes[0] });
  await success(await client.post('/api/auth/recover/verify', { ceremonyId: fresh.ceremonyId, response: key.registration(fresh.options, { origin: BASE }) }));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS total FROM member_recovery_codes WHERE account_id=? AND used_at IS NOT NULL').get(member.identity.accountId).total, 1);
});

test('the active passkey bound is enforced when options are issued and again during the atomic save', async t => {
  const f = fixture(t); const member = await enrol(f.client(), 'many.passkeys');
  const original = f.sqlite.prepare('SELECT * FROM member_passkeys WHERE account_id=?').get(member.identity.accountId);
  function concurrentKey() {
    f.sqlite.prepare('INSERT INTO member_passkeys(id,account_id,rp_id,credential_id,public_key,counter,device_type,backed_up,label,created_at,last_operation_id) VALUES (?,?,?,?,?,0,?,0,?,?,?)')
      .run(crypto.randomUUID(), member.identity.accountId, original.rp_id, randomBytes(32).toString('base64url'), original.public_key, 'singleDevice', 'Test-only concurrent credential', NOW, crypto.randomUUID());
  }
  for (let i = 0; i < 18; i++) concurrentKey();
  const begin = await options(member.client, 'passkeys', { name: 'Final device' });
  concurrentKey();
  const key = createTestPasskey();
  assert.equal((await member.client.post('/api/auth/passkeys/verify', { ceremonyId: begin.ceremonyId, response: key.registration(begin.options, { origin: BASE }) })).status, 409);
  assert.equal(count(f, 'member_passkeys'), 20);
  const full = await member.client.post('/api/auth/passkeys/options', { name: 'Another device' });
  assert.equal(full.status, 409); assert.equal((await full.json()).code, 'passkey_limit');
});
