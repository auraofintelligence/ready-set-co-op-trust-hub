import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createWorker } from '../cloudflare/worker.mjs';
import { createSqliteD1 } from '../scripts/sqlite-d1.mjs';

const BASE = 'https://ready-setco.example';
const NOW = '2026-11-19T10:24:00.000Z';
const ACTOR = 'map-reviewer@example.test';
const pair = await generateKeyPair('RS256');
const resolver = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'map-test', alg: 'RS256', use: 'sig' }] });

function fixture(t, overrides = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0001_intake.sql', '0002_operator_legal_name.sql', '0003_map_records.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const env = {
    DB: createSqliteD1(sqlite), RATE_LIMIT_SALT: 'fictional-map-test-salt-at-least-32-characters', INTAKE_RATE_LIMIT: '100',
    ALLOWED_ORIGINS: 'https://auraofintelligence.github.io',
    ACCESS_TEAM_DOMAIN: 'map-test.cloudflareaccess.com', ACCESS_AUD: 'map-test-audience', ADMIN_EMAILS: ACTOR,
    ASSETS: { fetch: async () => new Response('<!doctype html><title>Test asset</title>', { headers: { 'Content-Type': 'text/html' } }) },
    ...overrides,
  };
  const worker = createWorker({ keyResolver: resolver, now: () => NOW });
  return { sqlite, env, fetch: request => worker.fetch(request, env) };
}
function suggestion(overrides = {}) {
  return { submissionId: crypto.randomUUID(), name: 'Fictional integration bus stop', category: 'bus_stop', latitude: -27.44, longitude: 153.42,
    description: 'Fictional integration test only.', stopMarking: 'unmarked', facilities: ['shelter'], sourceType: 'firsthand', observedOn: '2026-11-18', publicationConsent: true, consentVersion: '2026-11-19', ...overrides };
}
function post(data, { origin = BASE, headers = {}, body } = {}) {
  return new Request(`${BASE}/api/map/suggestions`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.55', ...(origin === null ? {} : { Origin: origin }), ...headers,
  }, body: body ?? JSON.stringify(data) });
}
async function token(email = ACTOR) {
  return new SignJWT({ email }).setProtectedHeader({ alg: 'RS256', kid: 'map-test' }).setSubject('fictional-map-reviewer')
    .setIssuedAt().setExpirationTime('5m').setIssuer('https://map-test.cloudflareaccess.com').setAudience('map-test-audience').sign(pair.privateKey);
}
async function admin(path, { method = 'GET', data, origin = BASE, assertion, headers = {} } = {}) {
  return new Request(`${BASE}${path}`, { method, headers: { 'Cf-Access-Jwt-Assertion': assertion ?? await token(),
    ...(origin === null ? {} : { Origin: origin }), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers,
  }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}

test('Worker public map intake applies origin rules and only confirms durable pending records', async t => {
  const f = fixture(t); const response = await f.fetch(post(suggestion()));
  assert.equal(response.status, 201); const receipt = await response.json(); assert.equal(receipt.status, 'received');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), BASE); assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  const row = f.sqlite.prepare('SELECT * FROM map_suggestions').get(); assert.equal(row.id, receipt.reference); assert.equal(row.status, 'pending');
  const publicData = await (await f.fetch(new Request(`${BASE}/api/map/places`))).json(); assert.equal(publicData.features.length, 0);
  assert.equal((await f.fetch(post(suggestion(), { origin: 'https://unrelated.example' }))).status, 403);
  const permitted = await f.fetch(post(suggestion(), { origin: 'https://auraofintelligence.github.io' })); assert.equal(permitted.status, 201);
  assert.equal(permitted.headers.get('Access-Control-Allow-Origin'), 'https://auraofintelligence.github.io');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_suggestions').get().n, 2);
});

test('Worker map preflight admits only the configured JSON POST origin', async t => {
  const f = fixture(t);
  const preflight = (overrides = {}) => new Request(`${BASE}/api/map/suggestions`, { method: 'OPTIONS', headers: {
    Origin: 'https://auraofintelligence.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type', ...overrides,
  } });
  const okay = await f.fetch(preflight()); assert.equal(okay.status, 204);
  assert.equal(okay.headers.get('Access-Control-Allow-Methods'), 'POST'); assert.equal(okay.headers.get('Access-Control-Allow-Credentials'), null);
  for (const change of [{ Origin: 'https://unrelated.example' }, { 'Access-Control-Request-Method': 'DELETE' }, { 'Access-Control-Request-Headers': 'authorization' }]) assert.equal((await f.fetch(preflight(change))).status, 403);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_suggestions').get().n, 0);
});

test('configured public-site origins can read map GeoJSON without granting cross-origin organiser access', async t => {
  const f = fixture(t); const publicOrigin = 'https://auraofintelligence.github.io';
  for (const path of ['/api/map/places', '/api/map/export']) {
    const allowed = await f.fetch(new Request(BASE + path, { headers: { Origin: publicOrigin } }));
    assert.equal(allowed.status, 200, path);
    assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), publicOrigin);
    assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), null);
    assert.match(allowed.headers.get('Vary'), /Origin/);
    assert.equal((await allowed.json()).type, 'FeatureCollection');
    const denied = await f.fetch(new Request(BASE + path, { headers: { Origin: 'https://unrelated.example' } }));
    assert.equal(denied.status, 403, path);
    assert.notEqual(denied.headers.get('Access-Control-Allow-Origin'), 'https://unrelated.example');
  }
  assert.equal((await f.fetch(await admin('/api/admin/map/suggestions', { origin: publicOrigin }))).status, 403);
  assert.equal((await f.fetch(await admin('/api/admin/map/export', { origin: publicOrigin }))).status, 403);
  assert.equal((await f.fetch(await admin('/api/admin/map/suggestions'))).status, 200);
});

test('signed organiser JWT can publish a pending map point while public output excludes all review details', async t => {
  const f = fixture(t); const receipt = await (await f.fetch(post(suggestion()))).json();
  const queueResponse = await f.fetch(await admin('/api/admin/map/suggestions')); assert.equal(queueResponse.status, 200);
  const queue = await queueResponse.json(); assert.equal(queue.suggestions.length, 1);
  const review = await f.fetch(await admin(`/api/admin/map/suggestions/${receipt.reference}/review`, { method: 'POST', data: {
    decision: 'publish', expectedUpdatedAt: queue.suggestions[0].updatedAt, notes: 'Private integration review note.',
  } }));
  assert.equal(review.status, 200); assert.equal((await review.json()).place.properties.version, 1);
  const publicResponse = await f.fetch(new Request(`${BASE}/api/map/export`)); assert.equal(publicResponse.status, 200);
  const data = await publicResponse.json(); assert.equal(data.features.length, 1); assert.deepEqual(data.features[0].geometry.coordinates, [153.42, -27.44]);
  for (const hidden of [ACTOR, 'Private integration review note.', receipt.reference, 'reviewedBy', 'consentVersion']) assert.ok(!JSON.stringify(data).includes(hidden), hidden);
  const forbidden = await f.fetch(await admin('/api/admin/map/suggestions', { assertion: await token('uninvited@example.test') })); assert.equal(forbidden.status, 403);
});

test('map organiser writes require same-origin requests even with a signed Access identity', async t => {
  const f = fixture(t); const receipt = await (await f.fetch(post(suggestion()))).json();
  const record = (await (await f.fetch(await admin('/api/admin/map/suggestions'))).json()).suggestions[0];
  const data = { decision: 'publish', expectedUpdatedAt: record.updatedAt };
  for (const origin of [null, 'https://unrelated.example']) {
    const response = await f.fetch(await admin(`/api/admin/map/suggestions/${receipt.reference}/review`, { method: 'POST', data, origin }));
    assert.equal(response.status, 403, `Origin ${origin}`);
  }
  const crossSite = await f.fetch(await admin(`/api/admin/map/suggestions/${receipt.reference}/review`, { method: 'POST', data, headers: { 'Sec-Fetch-Site': 'cross-site' } })); assert.equal(crossSite.status, 403);
  assert.equal(f.sqlite.prepare('SELECT status FROM map_suggestions WHERE id = ?').get(receipt.reference).status, 'pending');
});

test('map rate limiting returns 429 through the real Worker without storing an extra point or source IP', async t => {
  const f = fixture(t, { INTAKE_RATE_LIMIT: '1' });
  assert.equal((await f.fetch(post(suggestion()))).status, 201);
  const blocked = await f.fetch(post(suggestion())); assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).code, 'rate_limited'); assert.match(blocked.headers.get('Retry-After'), /^\d+$/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_suggestions').get().n, 1);
  const rate = f.sqlite.prepare('SELECT * FROM intake_rate_limits').get(); assert.equal(rate.hits, 2); assert.ok(!JSON.stringify(rate).includes('192.0.2.55'));
  assert.equal((await f.fetch(new Request(`${BASE}/api/map/places`))).status, 200, 'Reading the map is not an intake attempt');
});

test('map review, export and archive routes fail closed when production Access configuration is absent', async t => {
  const f = fixture(t, { ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', ADMIN_EMAILS: '' });
  for (const path of ['/api/admin/map/suggestions', '/api/admin/map/export', `/api/admin/map/places/${crypto.randomUUID()}`, `/api/admin/map/suggestions/${crypto.randomUUID()}/review`]) {
    const response = await f.fetch(await admin(path)); assert.equal(response.status, 503, path);
    assert.doesNotMatch(await response.text(), /fictional|test-salt|data_json|SELECT|CREATE TABLE/);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('Worker applies JSON media type, malformed-body and byte bounds to map submissions', async t => {
  const f = fixture(t);
  assert.equal((await f.fetch(post(suggestion(), { headers: { 'Content-Type': 'text/plain' } }))).status, 415);
  assert.equal((await f.fetch(post(suggestion(), { body: '{invalid' }))).status, 400);
  assert.equal((await f.fetch(post(suggestion(), { body: ' '.repeat(13 * 1024) }))).status, 413);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_suggestions').get().n, 0);
});

test('only the geographic map page permits explicitly chosen self-origin geolocation', async t => {
  const f = fixture(t);
  const map = await f.fetch(new Request(`${BASE}/map.html`)); assert.equal(map.status, 200);
  assert.match(map.headers.get('Permissions-Policy'), /geolocation=\(self\)/);
  for (const path of ['/', '/index.html', '/join.html', '/about.html', '/api/map/places']) {
    const response = await f.fetch(new Request(BASE + path)); assert.match(response.headers.get('Permissions-Policy'), /geolocation=\(\)/, path);
    assert.match(response.headers.get('Permissions-Policy'), /camera=\(\), microphone=\(\)/);
  }
});
