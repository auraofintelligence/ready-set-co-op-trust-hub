import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { handleMapRequest, MAP_ICON_IDS } from '../cloudflare/map-records.mjs';
import { createSqliteD1 } from '../scripts/sqlite-d1.mjs';
import iconCatalog from '../assets/map-icons/catalog.json' with { type: 'json' };

const NOW = '2026-11-19T10:00:00.000Z';
const ACTOR = 'organiser@example.test';
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0001_intake.sql', '0002_operator_legal_name.sql', '0003_map_records.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const env = { DB: createSqliteD1(sqlite) };
  return { sqlite, env, async call(path, data, actor) {
    const method = data === undefined ? 'GET' : path.includes('/places/') ? 'PATCH' : 'POST';
    const request = new Request(`https://map.example${path}`, { method, ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) });
    return handleMapRequest(request, env, { actor, now: NOW, readJSON: () => request.json() });
  } };
}
function point(overrides = {}) {
  return { submissionId: crypto.randomUUID(), name: 'Fictional unmarked stop', category: 'bus_stop', latitude: -27.45, longitude: 153.42,
    locationDescription: 'Fictional roadside position for a test only.', description: 'A fictional testing record.', access: 'public', wheelchair: 'unknown',
    facilities: ['shelter', 'seating'], stopMarking: 'unmarked', sourceType: 'firsthand', sourceUrl: '', observedOn: '2026-11-18', publicCredit: '',
    publicationConsent: true, consentVersion: '2026-11-19', ...overrides };
}
async function received(f, data = point()) {
  const response = await f.call('/api/map/suggestions', data); assert.equal(response.status, 201);
  return (await response.json()).reference;
}
async function queue(f) { return (await (await f.call('/api/admin/map/suggestions', undefined, ACTOR)).json()).suggestions; }
async function decide(f, id, decision = 'publish', notes = 'Checked fictional test source.') {
  const record = (await queue(f)).find(row => row.id === id);
  return f.call(`/api/admin/map/suggestions/${id}/review`, { decision, notes, expectedUpdatedAt: record.updatedAt }, ACTOR);
}
async function publish(f, data = point()) {
  const id = await received(f, data); const response = await decide(f, id); assert.equal(response.status, 200);
  return (await response.json()).place;
}

test('map contributions persist pending, remain private and retain original operator and display permission', async t => {
  const f = fixture(t); const id = await received(f);
  const publicData = await (await f.call('/api/map/places')).json();
  assert.equal(publicData.features.length, 0); assert.equal(publicData.metadata.total, 0);
  const row = (await queue(f))[0]; assert.equal(row.id, id); assert.equal(row.status, 'pending');
  assert.equal(row.initialOperatingEntityId, 'sbt'); assert.equal(row.publicationConsent, true);
  assert.equal(row.consentVersion, '2026-11-19'); assert.equal(row.data.stopMarking, 'unmarked');
  assert.throws(() => f.sqlite.prepare('UPDATE map_suggestions SET data_json = ? WHERE id = ?').run('{}', id), /immutable/);
  assert.throws(() => f.sqlite.prepare('DELETE FROM map_suggestions WHERE id = ?').run(id), /history/);
});

test('canonical retries save no duplicate suggestion or audit and reject changed submission details', async t => {
  const f = fixture(t); const data = point(); const id = await received(f, data);
  const retry = await f.call('/api/map/suggestions', { ...data, name: ` ${data.name} `, facilities: ['seating', 'shelter'] });
  assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), { status: 'received', reference: id, duplicate: true });
  assert.equal((await f.call('/api/map/suggestions', { ...data, name: 'Changed' })).status, 409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_suggestions').get().n, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_audit_events').get().n, 1);
});

test('a quick pin needs no typed details, persists privately and publishes its source and entry mode after review', async t => {
  const f = fixture(t);
  const data = { submissionId: crypto.randomUUID(), entryMode: 'quick_pin', latitude: -27.51, longitude: 153.43,
    publicationConsent: true, consentVersion: '2026-11-19' };
  const id = await received(f, data);
  const original = (await queue(f))[0];
  assert.equal(original.status, 'pending');
  assert.equal(original.data.name, 'Unnamed pin');
  assert.equal(original.data.category, 'other');
  assert.equal(original.data.sourceType, 'map_pin', 'A dropped point does not assert first-hand knowledge');
  assert.equal(original.data.entryMode, 'quick_pin');
  assert.equal(Object.hasOwn(original.data, 'iconId'), false);
  assert.equal((await (await f.call('/api/map/places')).json()).features.length, 0);
  const retry = await f.call('/api/map/suggestions', { ...data, name: '  ', category: 'other', sourceType: 'map_pin' });
  assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), { status: 'received', reference: id, duplicate: true });
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_suggestions').get().n, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_audit_events').get().n, 1);
  const response = await decide(f, id); assert.equal(response.status, 200);
  const published = (await (await f.call('/api/map/export')).json()).features[0];
  assert.equal(published.properties.name, 'Unnamed pin');
  assert.equal(published.properties.entryMode, 'quick_pin');
  assert.equal(published.properties.provenance.sourceType, 'map_pin');
  assert.deepEqual(published.geometry.coordinates, [153.43, -27.51]);
  const history = await (await f.call('/api/admin/map/export', undefined, ACTOR)).json();
  assert.equal(history.revisions[0].data.entryMode, 'quick_pin');
});

test('quick pins accept an optional name but retain coordinate, permission and supplied-field validation', async t => {
  const f = fixture(t);
  const quick = () => ({ submissionId: crypto.randomUUID(), entryMode: 'quick_pin', latitude: -27.51, longitude: 153.43,
    publicationConsent: true, consentVersion: '2026-11-19' });
  for (const name of [undefined, '', '   ']) {
    const data = quick(); if (name !== undefined) data.name = name;
    const id = await received(f, data); assert.equal((await queue(f)).find(row => row.id === id).data.name, 'Unnamed pin');
  }
  const namedId = await received(f, { ...quick(), name: '  A named test pin  ', iconId: 'other' });
  assert.equal((await queue(f)).find(row => row.id === namedId).data.name, 'A named test pin');
  for (const change of [{ latitude: 91 }, { latitude: null }, { longitude: '153.43' }, { name: null }, { name: 'x'.repeat(141) },
    { category: 'unsupported' }, { sourceType: 'unverified_gps' }, { entryMode: '' }, { entryMode: null }, { entryMode: 'details' },
    { publicationConsent: false }, { publicationConsent: undefined }, { consentVersion: 'old' }, { email: 'private@example.test' }]) {
    assert.equal((await f.call('/api/map/suggestions', { ...quick(), ...change })).status, 400, JSON.stringify(change));
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_suggestions').get().n, 4);
  assert.equal((await f.call('/api/map/suggestions', point({ name: '' }))).status, 400, 'The detailed lane still needs its name');
  const missingCategory = point(); delete missingCategory.category;
  assert.equal((await f.call('/api/map/suggestions', missingCategory)).status, 400);
  const missingSource = point(); delete missingSource.sourceType;
  assert.equal((await f.call('/api/map/suggestions', missingSource)).status, 400);
});

test('the generated browser icon catalogue matches the backend allowlist and sheet positions', () => {
  const browser = { window: {} };
  runInNewContext(readFileSync(new URL('../map-icons.js', import.meta.url), 'utf8'), browser);
  const publicCatalog = JSON.parse(JSON.stringify(browser.window.READY_MAP_ICONS));
  assert.deepEqual(publicCatalog, iconCatalog);
  assert.equal(MAP_ICON_IDS.length, 48); assert.equal(new Set(MAP_ICON_IDS).size, 48);
  assert.deepEqual([...MAP_ICON_IDS], iconCatalog.icons.map(icon => icon.id));
  for (const sheet of Object.keys(iconCatalog.sheets)) {
    const positions = iconCatalog.icons.filter(icon => icon.sheet === sheet).map(icon => `${icon.row},${icon.column}`);
    assert.equal(positions.length, 16); assert.equal(new Set(positions).size, 16);
  }
});

test('selected map icons are allowlisted, persist through review and remain in portable revision history', async t => {
  const f = fixture(t);
  const data = point({ iconId: 'bus_stop' });
  const id = await received(f, data);
  assert.equal((await queue(f))[0].data.iconId, 'bus_stop');
  assert.equal((await (await f.call('/api/map/places')).json()).features.length, 0);
  const retry = await f.call('/api/map/suggestions', data); assert.equal(retry.status, 200);
  assert.equal((await f.call('/api/map/suggestions', { ...data, iconId: 'ferry' })).status, 409);
  const response = await decide(f, id); assert.equal(response.status, 200);
  const first = (await response.json()).place; assert.equal(first.properties.iconId, 'bus_stop');
  const correction = point({ placeId: first.id, baseVersion: 1, iconId: 'public_service' });
  const correctionId = await received(f, correction);
  assert.equal((await decide(f, correctionId)).status, 200);
  const publicData = await (await f.call('/api/map/export')).json();
  assert.equal(publicData.features[0].id, first.id);
  assert.equal(publicData.features[0].properties.iconId, 'public_service');
  assert.equal(publicData.features[0].properties.version, 2);
  const privateData = await (await f.call('/api/admin/map/export', undefined, ACTOR)).json();
  assert.deepEqual(privateData.revisions.map(revision => revision.data.iconId), ['bus_stop', 'public_service']);
  assert.equal(privateData.suggestions.find(row => row.id === id).data.iconId, 'bus_stop');
});

test('legacy map payloads omit icons and keep their original canonical retry shape', async t => {
  const f = fixture(t); const data = point(); const id = await received(f, data);
  const stored = f.sqlite.prepare('SELECT payload_json, data_json FROM map_suggestions WHERE id = ?').get(id);
  assert.equal(Object.hasOwn(JSON.parse(stored.payload_json).data, 'iconId'), false);
  assert.equal(Object.hasOwn(JSON.parse(stored.data_json), 'iconId'), false);
  assert.equal(Object.hasOwn(JSON.parse(stored.payload_json).data, 'entryMode'), false);
  assert.equal(Object.hasOwn(JSON.parse(stored.data_json), 'entryMode'), false);
  const response = await f.call('/api/map/suggestions', { ...data });
  assert.equal(response.status, 200); assert.equal((await response.json()).duplicate, true);
  await decide(f, id);
  const publicData = await (await f.call('/api/map/export')).json();
  assert.equal(Object.hasOwn(publicData.features[0].properties, 'iconId'), false);
});

test('all catalogue icons can be saved while unknown or malformed icon IDs are rejected', async t => {
  const f = fixture(t);
  for (const iconId of MAP_ICON_IDS) assert.equal((await f.call('/api/map/suggestions', point({ iconId }))).status, 201, iconId);
  for (const iconId of ['unknown', '', null, 1, {}, '<img src=x onerror=alert(1)>', 'BUS_STOP']) {
    assert.equal((await f.call('/api/map/suggestions', point({ iconId }))).status, 400, JSON.stringify(iconId));
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_suggestions').get().n, 48);
});

test('no receipt is returned when an atomic suggestion audit fails', async t => {
  const f = fixture(t);
  f.sqlite.exec("CREATE TRIGGER fail_map_audit BEFORE INSERT ON map_audit_events BEGIN SELECT RAISE(ABORT, 'test persistence failure'); END;");
  await assert.rejects(() => f.call('/api/map/suggestions', point()), /test persistence failure/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_suggestions').get().n, 0);
});

test('all private map routes require an organiser actor independently of the parent worker', async t => {
  const f = fixture(t);
  for (const path of ['/api/admin/map/suggestions', '/api/admin/map/export']) assert.equal((await f.call(path)).status, 401);
  assert.equal((await f.call(`/api/admin/map/suggestions/${crypto.randomUUID()}/review`, { decision: 'publish' })).status, 401);
  assert.equal((await f.call(`/api/admin/map/places/${crypto.randomUUID()}`, { status: 'archived' })).status, 401);
});

test('failed publication history rolls the entire review back to pending', async t => {
  const f = fixture(t); const id = await received(f);
  f.sqlite.exec("CREATE TRIGGER fail_map_revision BEFORE INSERT ON map_revisions BEGIN SELECT RAISE(ABORT, 'test revision failure'); END;");
  await assert.rejects(() => decide(f, id), /test revision failure/);
  assert.equal(f.sqlite.prepare('SELECT status FROM map_suggestions WHERE id = ?').get(id).status, 'pending');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_places').get().n, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_audit_events').get().n, 1);
});

test('publication creates GeoJSON in longitude-latitude order and excludes review identity, notes and pending content', async t => {
  const f = fixture(t); const place = await publish(f, point({ name: '<script>literal test name</script>', publicCredit: 'Chosen public credit' }));
  await received(f, point({ name: 'Pending confidential review label' }));
  const response = await f.call('/api/map/export'); assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /application\/geo\+json/);
  const result = await response.json(); assert.equal(result.type, 'FeatureCollection'); assert.equal(result.features.length, 1);
  assert.deepEqual(result.features[0].geometry.coordinates, [153.42, -27.45]);
  assert.equal(result.features[0].properties.id, place.id); assert.equal(result.features[0].properties.name, '<script>literal test name</script>');
  assert.equal(result.features[0].properties.version, 1); assert.equal(result.features[0].properties.provenance.observedOn, '2026-11-18');
  const serialized = JSON.stringify(result); for (const secret of [ACTOR, 'Checked fictional test source.', 'Pending confidential review label', 'consentVersion', 'submissionId', 'reviewNotes']) assert.ok(!serialized.includes(secret), secret);
  assert.equal(result.features[0].properties.publicCredit, 'Chosen public credit');
  assert.match(result.metadata.reuseNotice, /not yet been selected/);
});

test('corrections retain revisions and reject stale places, stale reviews and duplicate review actions', async t => {
  const f = fixture(t); const original = await publish(f);
  const one = point({ placeId: original.id, baseVersion: 1, name: 'First correction' });
  const two = point({ placeId: original.id, baseVersion: 1, name: 'Competing correction' });
  const firstId = await received(f, one); const secondId = await received(f, two);
  const staleTime = await f.call(`/api/admin/map/suggestions/${firstId}/review`, { decision: 'publish', expectedUpdatedAt: '2020-01-01T00:00:00Z' }, ACTOR);
  assert.equal(staleTime.status, 409);
  const update = await decide(f, firstId); assert.equal(update.status, 200);
  const updated = (await update.json()).place; assert.equal(updated.properties.version, 2); assert.equal(updated.properties.name, 'First correction');
  assert.equal((await decide(f, secondId)).status, 409);
  assert.equal((await f.call('/api/map/suggestions', point({ placeId: original.id, baseVersion: 1 }))).status, 409);
  const replay = await f.call('/api/map/suggestions', one); assert.equal(replay.status, 200, 'A saved submission can retry after the base place changes');
  const row = f.sqlite.prepare('SELECT updated_at FROM map_suggestions WHERE id = ?').get(firstId);
  assert.equal((await f.call(`/api/admin/map/suggestions/${firstId}/review`, { decision: 'publish', expectedUpdatedAt: row.updated_at }, ACTOR)).status, 409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_revisions').get().n, 2);
  const revisions = f.sqlite.prepare('SELECT version, data_json FROM map_revisions ORDER BY version').all();
  assert.equal(JSON.parse(revisions[0].data_json).name, 'Fictional unmarked stop');
  assert.equal(JSON.parse(revisions[1].data_json).name, 'First correction');
  assert.throws(() => f.sqlite.exec("UPDATE map_revisions SET reason='rewrite'"), /append-only/);
});

test('rejecting a stale correction retains its submitted evidence without changing the published place', async t => {
  const f = fixture(t); const place = await publish(f);
  const firstId = await received(f, point({ placeId: place.id, baseVersion: 1, name: 'Accepted' }));
  const secondId = await received(f, point({ placeId: place.id, baseVersion: 1, name: 'Rejected evidence' }));
  await decide(f, firstId);
  assert.equal((await decide(f, secondId, 'reject', 'Outdated observation.')).status, 200);
  const privateData = await (await f.call('/api/admin/map/export', undefined, ACTOR)).json();
  assert.equal(privateData.suggestions.find(row => row.id === secondId).status, 'rejected');
  assert.equal(privateData.suggestions.find(row => row.id === secondId).data.name, 'Rejected evidence');
  assert.equal(privateData.places[0].properties.name, 'Accepted');
  assert.ok(privateData.auditEvents.some(row => row.eventType === 'rejected' && row.actor === ACTOR));
});

test('archiving is version checked, removes public output and preserves the full portable private history', async t => {
  const f = fixture(t); const place = await publish(f);
  const path = `/api/admin/map/places/${place.id}`;
  assert.equal((await f.call(path, { status: 'archived', expectedVersion: 99, reason: 'Wrong version' }, ACTOR)).status, 409);
  assert.equal((await f.call(path, { status: 'archived', expectedVersion: 1, reason: 'Fictional test removal' }, ACTOR)).status, 200);
  assert.equal((await (await f.call('/api/map/places')).json()).features.length, 0);
  assert.equal((await f.call('/api/map/suggestions', point({ placeId: place.id, baseVersion: 2 }))).status, 409);
  const data = await (await f.call('/api/admin/map/export', undefined, ACTOR)).json();
  assert.equal(data.places[0].status, 'archived'); assert.equal(data.places[0].properties.version, 2);
  assert.equal(data.revisions.length, 2); assert.equal(data.revisions[1].status, 'archived');
  assert.ok(data.auditEvents.some(row => row.eventType === 'archived' && row.reason === 'Fictional test removal'));
  assert.throws(() => f.sqlite.exec('DELETE FROM map_audit_events'), /append-only/);
});

test('published search, category, bounds and pagination expose only the requested public subset', async t => {
  const f = fixture(t);
  await publish(f, point({ name: 'North picnic seat', category: 'seat', latitude: -27.4 }));
  await publish(f, point({ name: 'South seat', category: 'seat', latitude: -27.7 }));
  await publish(f, point({ name: 'Test beach', category: 'beach', longitude: 153.5 }));
  const first = await (await f.call('/api/map/places?category=seat&limit=1')).json();
  assert.equal(first.features.length, 1); assert.equal(first.metadata.total, 2); assert.equal(first.metadata.hasMore, true);
  const second = await (await f.call('/api/map/places?category=seat&limit=1&offset=1')).json();
  assert.equal(second.features[0].properties.name, 'South seat'); assert.equal(second.metadata.hasMore, false);
  const bounds = await (await f.call('/api/map/places?bbox=153.4,-27.5,153.45,-27.3')).json();
  assert.equal(bounds.features.length, 1); assert.equal(bounds.features[0].properties.name, 'North picnic seat');
  const search = await (await f.call('/api/map/places?search=picnic')).json(); assert.equal(search.features.length, 1);
  assert.equal((await f.call('/api/map/places?bbox=x,1,2,3')).status, 400);
  assert.equal((await f.call('/api/map/places?limit=501')).status, 400);
});

test('map validation rejects unsupported fields, invalid positions, dates, links, facilities and absent permission', async t => {
  const f = fixture(t);
  for (const change of [{ name: '' }, { latitude: 91 }, { longitude: '153' }, { category: 'secret' }, { observedOn: '2026-99-99' }, { observedOn: '2026-02-30' }, { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:password@example.test/' }, { facilities: ['shelter', 'shelter'] }, { facilities: ['secret'] }, { publicationConsent: false }, { consentVersion: 'old' }, { email: 'private@example.test' }, { baseVersion: 1 }, { placeId: 'not-a-uuid' }]) {
    const response = await f.call('/api/map/suggestions', point(change)); assert.equal(response.status, 400, JSON.stringify(change));
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM map_suggestions').get().n, 0);
});

test('public exports fail explicitly at the size cap rather than silently omit published places', async t => {
  const f = fixture(t); await publish(f);
  const row = f.sqlite.prepare('SELECT * FROM map_places').get();
  const insert = f.sqlite.prepare(`INSERT INTO map_places
    (id,name,category,latitude,longitude,data_json,version,status,current_suggestion_id,last_operation_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,1,'published',?,?,?,?)`);
  f.sqlite.exec('BEGIN');
  for (let index = 0; index < 5000; index++) {
    const name = `Fictional capacity point ${index}`;
    insert.run(crypto.randomUUID(), name, 'seat', row.latitude, row.longitude,
      JSON.stringify({ ...JSON.parse(row.data_json), name, category: 'seat' }), row.current_suggestion_id, crypto.randomUUID(), NOW, NOW);
  }
  f.sqlite.exec('COMMIT');
  const oversized = await f.call('/api/map/export'); assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).code, 'export_too_large');
  const narrowed = await f.call('/api/map/export?category=bus_stop'); assert.equal(narrowed.status, 200);
  assert.equal((await narrowed.json()).features.length, 1);
});
