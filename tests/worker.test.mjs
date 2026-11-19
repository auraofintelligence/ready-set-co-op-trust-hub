import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createWorker } from '../cloudflare/worker.mjs';

const BASE = 'https://participate.example';
const LOCAL = 'http://127.0.0.1:8787';
const NOW = '2026-11-19T08:00:00.000Z';
const SECRET = 'test-only-secret-with-at-least-32-characters';

test('the short public home address serves index.html while preserving its query and method', async () => {
  const seen = [];
  const worker = createWorker();
  const env = { ASSETS: { fetch: async request => {
    seen.push({ url: request.url, method: request.method });
    return new Response('<!doctype html><title>Ready SETCO</title>', { headers: { 'Content-Type': 'text/html' } });
  } } };
  for (const method of ['GET', 'HEAD']) {
    const response = await worker.fetch(new Request(`${BASE}/?from=phone`, { method }), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'text/html');
  }
  assert.deepEqual(seen, [
    { url: `${BASE}/index.html?from=phone`, method: 'GET' },
    { url: `${BASE}/index.html?from=phone`, method: 'HEAD' },
  ]);
});
const pair = await generateKeyPair('RS256');
const publicJwk = { ...await exportJWK(pair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const resolver = createLocalJWKSet({ keys: [publicJwk] });

// Execute the exact production SQL against real SQLite. Transactions match the
// D1 batch contract; this catches SQL errors, rollback bugs and unsafe queries.
function sqliteD1(sqlite) {
  function prepared(sql, values = []) {
    return {
      bind(...bound) { return prepared(sql, bound); },
      async first(column) {
        const row = sqlite.prepare(sql).get(...values) ?? null;
        return row && column ? row[column] : row;
      },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() {
        const result = sqlite.prepare(sql).run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
      execute() {
        const results = sqlite.prepare(sql).all(...values);
        return { success: true, results, meta: { changes: sqlite.prepare('SELECT changes() AS n').get().n } };
      },
    };
  }
  return {
    prepare: prepared,
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = statements.map(statement => statement.execute());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}

function fixture(t, overrides = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_intake.sql', import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const env = {
    DB: sqliteD1(sqlite), RATE_LIMIT_SALT: SECRET, INTAKE_RATE_LIMIT: '1000',
    ACCESS_TEAM_DOMAIN: 'test-team.cloudflareaccess.com', ACCESS_AUD: 'test-audience',
    ADMIN_EMAILS: 'reviewer@example.com',
    ASSETS: { fetch: async () => new Response('<!doctype html><title>Private review</title>', { headers: { 'Content-Type': 'text/html' } }) },
    ...overrides,
  };
  const worker = createWorker({ keyResolver: resolver, now: () => NOW });
  return { sqlite, env, worker, fetch: request => worker.fetch(request, env) };
}

function intake(overrides = {}) {
  return {
    submissionId: crypto.randomUUID(), name: 'Test Resident', email: 'person@example.com',
    participantType: 'resident', interests: ['events', 'founding'], offer: 'I can help with event setup.',
    consentContact: true, consentVersion: '2026-11-19', consentFutureHandover: false,
    ...overrides,
  };
}

function post(data, { origin = BASE, base = BASE, headers = {}, body } = {}) {
  return new Request(`${base}/api/intake`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10',
    ...(origin === null ? {} : { Origin: origin }), ...headers,
  }, body: body ?? JSON.stringify(data) });
}

async function jwt(overrides = {}, key = pair.privateKey) {
  return new SignJWT({ email: 'reviewer@example.com', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject('reviewer-id').setIssuedAt().setExpirationTime('5m')
    .setIssuer('https://test-team.cloudflareaccess.com').setAudience('test-audience').sign(key);
}

async function admin(path = '/api/admin/participants', { method = 'GET', data, token, base = BASE, origin = BASE, headers = {} } = {}) {
  return new Request(`${base}${path}`, { method, headers: {
    'Cf-Access-Jwt-Assertion': token ?? await jwt(),
    ...(origin === null ? {} : { Origin: origin }), ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers,
  }, body: data ? JSON.stringify(data) : undefined });
}

test('intake persists real records and immutable consent before returning a private-safe reference', async t => {
  const f = fixture(t);
  const data = intake({ name: '  Person Test  ', email: 'PERSON@example.com', phone: '0400000000' });
  const response = await f.fetch(post(data));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['reference', 'status']);
  assert.equal(body.status, 'received');
  const row = f.sqlite.prepare('SELECT * FROM participants').get();
  assert.equal(row.id, body.reference);
  assert.equal(row.name, 'Person Test');
  assert.equal(row.email, 'person@example.com');
  assert.equal(row.status, 'interest');
  assert.equal(row.initial_operating_entity_id, 'sbt');
  assert.equal(row.current_operating_entity_id, 'sbt');
  assert.equal(row.consent_future_handover, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n, 1);
  assert.throws(() => f.sqlite.prepare("UPDATE participants SET initial_operating_entity_id='ready-setco'").run(), /immutable/);
  assert.throws(() => f.sqlite.prepare("UPDATE participants SET consent_future_handover=1").run(), /immutable/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('identical canonical retry returns the same receipt without duplicating audit', async t => {
  const f = fixture(t);
  const data = intake();
  const first = await f.fetch(post(data));
  const retry = await f.fetch(post({ ...data, name: ` ${data.name} `,
    email: data.email.toUpperCase(), interests: [...data.interests].reverse(),
    authorityConfirmed: false, phone: '', organisation: '' }));
  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), await first.json());
  const row = f.sqlite.prepare('SELECT * FROM participants').get();
  assert.equal(row.name, data.name);
  assert.equal(row.consent_future_handover, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n, 1);
});

test('reuse of a submission ID with changed details returns409 and preserves the original snapshot', async t => {
  const f = fixture(t);
  const data = intake();
  assert.equal((await f.fetch(post(data))).status, 201);
  for (const change of [{ name: 'Changed name' }, { consentFutureHandover: true }, { interests: ['training'] },
    { email: 'updated@example.com' }, { offer: 'Updated offer' }]) {
    const response = await f.fetch(post({ ...data, ...change }));
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.code, 'submission_conflict');
    assert.match(body.error, /already received.*different details.*Contact Luke/);
    assert.doesNotMatch(JSON.stringify(body), /person@example|updated@example|Test Resident|reference/);
  }
  const row = f.sqlite.prepare('SELECT * FROM participants').get();
  assert.equal(row.name, data.name);
  assert.equal(row.email, data.email);
  assert.equal(row.consent_future_handover, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n, 1);
});

test('intake never claims success when persistence fails and hides database details', async t => {
  const f = fixture(t);
  f.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'secret SQL failure'); END;");
  const response = await f.fetch(post(intake()));
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.doesNotMatch(body, /secret|SQL|reference|person@example/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 0);
});

test('health exposes no records, counts, configuration, secrets or entity metadata', async t => {
  const f = fixture(t, { DB: undefined });
  const response = await f.fetch(new Request(`${BASE}/api/health`));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('public record lookup and public exports do not exist', async t => {
  const f = fixture(t);
  for (const path of ['/api/participants', '/api/export', `/api/intake/${crypto.randomUUID()}`]) {
    const response = await f.fetch(new Request(BASE + path));
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /participants|person@example/);
  }
});

test('server validates consent, authority, field types, bounds and rejects sensitive extra fields', async t => {
  const f = fixture(t);
  const invalid = [
    { consentContact: false }, { consentContact: 'true' }, { consentVersion: 'old' },
    { submissionId: 'not-a-uuid' }, { name: '' }, { name: 'x'.repeat(121) }, { email: 'wrong' },
    { email: 'a@b.c\nmalicious' }, { phone: 'x'.repeat(51) }, { organisation: 'x'.repeat(201) },
    { participantType: 'member' }, { participantType: 'business', authorityConfirmed: false },
    { participantType: 'community' }, { authorityConfirmed: 1 }, { interests: [] },
    { interests: ['events', 'events'] }, { interests: ['visa'] }, { interests: 'events' },
    { offer: 'x'.repeat(1201) }, { offer: '\u0000' }, { consentFutureHandover: 'yes' },
    { tfn: '123456789' }, { visa: '417' }, { passport: 'sensitive' },
  ];
  for (const change of invalid) {
    const response = await f.fetch(post(intake(change)));
    assert.equal(response.status, 400, JSON.stringify(change));
    assert.doesNotMatch(await response.text(), /123456789|sensitive|a@b/);
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 0);
});

test('business and community participation require genuine authority confirmation', async t => {
  const f = fixture(t);
  for (const participantType of ['business', 'community']) {
    const response = await f.fetch(post(intake({ participantType, authorityConfirmed: true, organisation: 'Local group' })));
    assert.equal(response.status, 201);
  }
});

test('business requires an organisation while an authorised community leader may omit it', async t => {
  const f = fixture(t);
  for (const organisation of [undefined, '', '   ']) {
    const response = await f.fetch(post(intake({ participantType: 'business', authorityConfirmed: true, organisation })));
    assert.equal(response.status, 400);
  }
  assert.equal((await f.fetch(post(intake({ participantType: 'community', authorityConfirmed: true })))).status, 201);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 1);
});

test('request media type, malformed JSON and non-object payloads are rejected', async t => {
  const f = fixture(t);
  assert.equal((await f.fetch(post(intake(), { headers: { 'Content-Type': 'text/plain' } }))).status, 415);
  for (const body of ['{', '[]', 'null', 'true', '42']) assert.equal((await f.fetch(post(null, { body }))).status, 400);
});

test('body limit applies to advertised length and actual streamed UTF-8 bytes', async t => {
  const f = fixture(t);
  assert.equal((await f.fetch(post(intake(), { headers: { 'Content-Length': '13000' } }))).status, 413);
  const bytes = new TextEncoder().encode(JSON.stringify(intake({ offer: '😀'.repeat(4000) })));
  const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 100)); controller.enqueue(bytes.subarray(100)); controller.close(); } });
  const request = new Request(`${BASE}/api/intake`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'Content-Length': '4', 'CF-Connecting-IP': '192.0.2.10',
  }, body: stream, duplex: 'half' });
  assert.equal((await f.fetch(request)).status, 413);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 0);
});

test('only same origin and explicitly allowed HTTPS origins can post; no credentialed CORS', async t => {
  const f = fixture(t, { ALLOWED_ORIGINS: 'https://auraofintelligence.github.io,https://allowed.example/path,http://insecure.example' });
  for (const origin of ['https://evil.example', 'null', 'http://insecure.example', 'https://allowed.example', `${BASE}.evil.example`]) {
    const response = await f.fetch(post(intake(), { origin }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  const response = await f.fetch(post(intake(), { origin: 'https://auraofintelligence.github.io' }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://auraofintelligence.github.io');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
  assert.match(response.headers.get('Vary'), /Origin/);
});

test('public CORS preflight permits only POST with JSON headers', async t => {
  const f = fixture(t, { ALLOWED_ORIGINS: 'https://auraofintelligence.github.io' });
  const options = extra => new Request(`${BASE}/api/intake`, { method: 'OPTIONS', headers: {
    Origin: 'https://auraofintelligence.github.io', 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type', ...extra,
  } });
  const allowed = await f.fetch(options({}));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Methods'), 'POST');
  assert.equal((await f.fetch(options({ 'Access-Control-Request-Method': 'GET' }))).status, 403);
  assert.equal((await f.fetch(options({ 'Access-Control-Request-Headers': 'authorization' }))).status, 403);
});

test('rate limit is atomic, fixed-window, salted, expires old buckets and never stores IP', async t => {
  const f = fixture(t, { INTAKE_RATE_LIMIT: '2' });
  assert.equal((await f.fetch(post(intake()))).status, 201);
  assert.equal((await f.fetch(post(intake()))).status, 201);
  const limited = await f.fetch(post(intake()));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '3600');
  const bucket = f.sqlite.prepare('SELECT * FROM intake_rate_limits').get();
  assert.equal(bucket.hits, 3);
  assert.match(bucket.bucket_hash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(bucket), /192\.0\.2|test-only-secret/);
  const nextHour = createWorker({ keyResolver: resolver, now: () => '2026-11-19T09:00:00.000Z' });
  assert.equal((await nextHour.fetch(post(intake()), f.env)).status, 201);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM intake_rate_limits').get().n, 1);
  const changedSalt = { ...f.env, RATE_LIMIT_SALT: 'different-secret-with-more-than-32-characters' };
  assert.equal((await nextHour.fetch(post(intake()), changedSalt)).status, 201);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM intake_rate_limits').get().n, 2);
});

test('production intake fails closed without D1, rate salt or edge IP', async t => {
  for (const overrides of [{ DB: undefined }, { RATE_LIMIT_SALT: '' }, { RATE_LIMIT_SALT: 'short' }, { INTAKE_RATE_LIMIT: 'bad' }]) {
    const f = fixture(t, overrides);
    assert.equal((await f.fetch(post(intake()))).status, 503);
  }
  const f = fixture(t);
  const request = post(intake()); request.headers.delete('CF-Connecting-IP');
  assert.equal((await f.fetch(request)).status, 503);
});

test('local-only development explicitly permits local intake without production salt', async t => {
  const f = fixture(t, { LOCAL_DEV: 'true', RATE_LIMIT_SALT: '' });
  assert.equal((await f.fetch(post(intake(), { base: LOCAL, origin: LOCAL }))).status, 201);
  assert.equal((await f.fetch(post(intake()))).status, 503);
});

test('ALL admin routes and management HTML fail closed when Access configuration is absent', async t => {
  const f = fixture(t, { ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', ADMIN_EMAILS: '' });
  for (const path of ['/api/admin', '/api/admin/participants', '/api/admin/export', '/api/admin/unknown', '/manage.html', '/manage', '/manage/index.html']) {
    const response = await f.fetch(new Request(BASE + path));
    assert.equal(response.status, 503, path);
    assert.doesNotMatch(await response.text(), /Test Resident|<!doctype/);
  }
});

test('signed Access JWT admits only the configured audience, issuer and permitted email', async t => {
  const f = fixture(t);
  assert.equal((await f.fetch(await admin())).status, 200);
  const disallowed = await jwt({ email: 'outsider@example.com' });
  assert.equal((await f.fetch(await admin(undefined, { token: disallowed }))).status, 403);
  for (const options of [{ audience: 'wrong' }, { issuer: 'https://other.cloudflareaccess.com' }, { expired: true }, { missingEmail: true }]) {
    const token = await new SignJWT(options.missingEmail ? {} : { email: 'reviewer@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setSubject('user').setIssuedAt()
      .setExpirationTime(options.expired ? Math.floor(Date.now() / 1000) - 60 : '5m')
      .setIssuer(options.issuer ?? 'https://test-team.cloudflareaccess.com')
      .setAudience(options.audience ?? 'test-audience').sign(pair.privateKey);
    assert.equal((await f.fetch(await admin(undefined, { token }))).status, 401, JSON.stringify(options));
  }
});

test('forged identity header, unsigned JWT and wrong-key signature are rejected', async t => {
  const f = fixture(t);
  for (const path of ['/api/admin/participants', '/api/admin/export', `/api/admin/participants/${crypto.randomUUID()}`, '/manage.html']) {
    const response = await f.fetch(new Request(BASE + path, { headers: { 'Cf-Access-Authenticated-User-Email': 'reviewer@example.com' } }));
    assert.equal(response.status, 401);
  }
  const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify({ email: 'reviewer@example.com' })).toString('base64url')}.`;
  assert.equal((await f.fetch(await admin(undefined, { token: unsigned }))).status, 401);
  const other = await generateKeyPair('RS256');
  assert.equal((await f.fetch(await admin(undefined, { token: await jwt({}, other.privateKey) }))).status, 401);
});

test('verified Access cookie can load protected HTML; cache and framing are disabled', async t => {
  const f = fixture(t);
  const response = await f.fetch(new Request(`${BASE}/manage.html`, { headers: { Cookie: `CF_Authorization=${await jwt()}` } }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<!doctype/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
});

test('development bearer works only with loopback AND explicit switch and a long secret', async t => {
  const f = fixture(t, { LOCAL_DEV: 'true', LOCAL_ADMIN_TOKEN: SECRET });
  const request = (base, token = SECRET) => new Request(`${base}/api/admin/participants`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await f.fetch(request(LOCAL))).status, 200);
  assert.equal((await f.fetch(request(LOCAL, 'wrong'))).status, 401);
  assert.equal((await f.fetch(request(BASE))).status, 401);
  assert.equal((await f.worker.fetch(request(LOCAL), { ...f.env, LOCAL_DEV: 'false' })).status, 401);
  assert.equal((await f.worker.fetch(request(LOCAL), { ...f.env, LOCAL_ADMIN_TOKEN: 'short' })).status, 503);
  assert.equal((await f.fetch(new Request(`${LOCAL}/manage.html`))).status, 200);
});

test('admin list pagination and search are private, bounded and treat SQL input literally', async t => {
  const f = fixture(t);
  const injection = "Robert'); DROP TABLE participants;--";
  assert.equal((await f.fetch(post(intake({ name: injection })))).status, 201);
  assert.equal((await f.fetch(post(intake({ name: 'Other person', email: 'other@example.com' })))).status, 201);
  const first = await f.fetch(await admin('/api/admin/participants?page=1&pageSize=1'));
  const page = await first.json();
  assert.equal(page.total, 2); assert.equal(page.participants.length, 1);
  const search = await f.fetch(await admin(`/api/admin/participants?search=${encodeURIComponent(injection)}`));
  assert.equal((await search.json()).participants.length, 1);
  const literalWildcard = await f.fetch(await admin('/api/admin/participants?search=%25'));
  assert.equal((await literalWildcard.json()).total, 0);
  for (const query of ['page=0', 'pageSize=101', 'status=member', 'limit=1', "page=1%20OR%201=1"]) {
    assert.equal((await f.fetch(await admin(`/api/admin/participants?${query}`))).status, 400);
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 2);
});

test('private human review updates only status/notes and appends an immutable audit trail', async t => {
  const f = fixture(t);
  const initial = await (await f.fetch(post(intake()))).json();
  const before = f.sqlite.prepare('SELECT * FROM participants').get();
  const response = await f.fetch(await admin(`/api/admin/participants/${initial.reference}`, {
    method: 'PATCH', data: { status: 'founding_interest', notes: "Discuss contribution; no membership admission. ' OR 1=1", expectedUpdatedAt: before.updated_at },
  }));
  assert.equal(response.status, 200);
  const { participant } = await response.json();
  assert.equal(participant.status, 'founding_interest');
  assert.equal(participant.initialOperatingEntityId, 'sbt');
  assert.equal(participant.currentOperatingEntityId, 'sbt');
  assert.notEqual(participant.updatedAt, before.updated_at);
  const audit = f.sqlite.prepare("SELECT * FROM audit_events WHERE event_type='review_updated'").get();
  assert.equal(audit.actor, 'reviewer@example.com');
  assert.equal(audit.previous_status, 'interest');
  assert.equal(audit.new_status, 'founding_interest');
  assert.equal(audit.notes_changed, 1);
  assert.throws(() => f.sqlite.prepare('DELETE FROM audit_events').run(), /append-only/);
  assert.equal((await f.fetch(await admin(`/api/admin/participants/${initial.reference}`, {
    method: 'PATCH', data: { status: 'founding_interest', notes: participant.notes, expectedUpdatedAt: participant.updatedAt },
  }))).status, 200);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n, 2);
});

test('stale reviewer writes return409 without overwriting a later review or adding audit', async t => {
  const f = fixture(t);
  const { reference } = await (await f.fetch(post(intake()))).json();
  const path = `/api/admin/participants/${reference}`;
  assert.equal((await f.fetch(await admin(path, { method: 'PATCH', data: { status: 'contacted', expectedUpdatedAt: NOW } }))).status, 200);
  const stale = await f.fetch(await admin(path, { method: 'PATCH', data: { status: 'withdrawn', notes: 'Stale overwrite', expectedUpdatedAt: NOW } }));
  assert.equal(stale.status, 409);
  const row = f.sqlite.prepare('SELECT * FROM participants').get();
  assert.equal(row.status, 'contacted'); assert.equal(row.notes, '');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n, 2);
});

test('admin mutations enforce same-origin, JSON, supported statuses, field boundaries and valid IDs', async t => {
  const f = fixture(t, { ALLOWED_ORIGINS: 'https://auraofintelligence.github.io' });
  const { reference } = await (await f.fetch(post(intake()))).json();
  const path = `/api/admin/participants/${reference}`;
  for (const origin of [null, 'https://auraofintelligence.github.io', 'https://evil.example']) {
    assert.equal((await f.fetch(await admin(path, { method: 'PATCH', data: { status: 'contacted' }, origin }))).status, 403);
  }
  for (const data of [{ status: 'member' }, { status: 'contacted', currentOperatingEntityId: 'ready-setco' },
    { status: 'contacted', notes: 'x'.repeat(4001) }, { status: 'contacted', expectedUpdatedAt: 'yesterday' }]) {
    assert.equal((await f.fetch(await admin(path, { method: 'PATCH', data }))).status, 400);
  }
  assert.equal((await f.fetch(await admin('/api/admin/participants/not-valid', { method: 'PATCH', data: { status: 'contacted' } }))).status, 400);
  assert.equal((await f.fetch(await admin(`/api/admin/participants/${crypto.randomUUID()}`, { method: 'PATCH', data: { status: 'contacted' } }))).status, 404);
});

test('private export preserves entity metadata, consent, stable IDs and audit for migration', async t => {
  const f = fixture(t);
  await f.fetch(post(intake({ consentFutureHandover: true })));
  const response = await f.fetch(await admin('/api/admin/export'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Disposition'), /attachment/);
  const exported = await response.json();
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.entities.find(x => x.id === 'sbt').abn, '81913657174');
  assert.equal(exported.entities.find(x => x.id === 'ready-setco').legalStatus, 'proposed');
  assert.equal(exported.participants[0].consentFutureHandover, true);
  assert.equal(exported.auditEvents[0].participantId, exported.participants[0].id);
  assert.doesNotMatch(JSON.stringify(exported), /192\.0\.2|bucket_hash|RATE_LIMIT_SALT|LOCAL_ADMIN_TOKEN/);
});
