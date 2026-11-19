import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Miniflare } from 'miniflare';
import { createRepository } from '../cloudflare/repository.mjs';
import { createWorker } from '../cloudflare/worker.mjs';
import { createSqliteD1 } from './sqlite-d1.mjs';

// This is an explicit local integration rehearsal, rather than a normal unit
// test. Workerd needs loopback networking. It never authenticates to an account,
// invokes a browser, provisions resources or reads a live register.
const root = fileURLToPath(new URL('..', import.meta.url));
const configuration = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
const binding = configuration.d1_databases.find(item => item.binding === 'DB');
assert(binding, 'The dedicated DB binding must exist.');
const directory = path.join(root, '.local', `portability-${crypto.randomUUID()}`);
const persistence = path.join(directory, '.wrangler', 'state');
await mkdir(directory, { recursive: true });
// Wrangler's local export does not expose --persist-to. An isolated config
// makes its default storage agree with migrations and Miniflare without using
// any existing local register or a remote resource.
const localConfigPath = path.join(directory, 'wrangler.local.json');
await writeFile(localConfigPath, JSON.stringify({
  name: 'ready-setco-local-portability-check',
  compatibility_date: configuration.compatibility_date,
  d1_databases: [{ ...binding, migrations_dir: path.join(root, 'migrations') }],
}, null, 2));
const environment = {
  ...process.env,
  CI: 'true',
  WRANGLER_SEND_METRICS: 'false',
  WRANGLER_LOG_SANITIZE: 'true',
  WRANGLER_LOG_PATH: path.join(directory, 'logs'),
};
const cli = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
function wrangler(args) {
  const result = spawnSync(process.execPath, [cli, ...args, '--config', localConfigPath], {
    cwd: root, env: environment, encoding: 'utf8', windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`Local Wrangler rehearsal failed:\n${result.stderr || result.stdout}`);
}

wrangler(['d1', 'migrations', 'apply', binding.database_name, '--local']);
const miniflare = new Miniflare({
  modules: true,
  script: '',
  resourcePersistencePath: path.join(persistence, 'v3'),
  d1Databases: { DATABASE: binding.database_id ?? 'DB' },
});
const createdAt = '2026-11-19T01:00:00.000Z';
const reviewedAt = '2026-11-19T02:00:00.000Z';
const exportedAt = '2026-11-19T03:00:00.000Z';
const token = 'local-portability-rehearsal-token-32-characters';
let snapshot;
let reference;
let mapSnapshot;
let publicMapSnapshot;
let mapPlaceId;
let mapSuggestionId;
let correctionId;
try {
  const d1 = await miniflare.getD1Database('DATABASE');
  const repository = createRepository(d1);
  const receipt = await repository.createIntake({
    submissionId: crypto.randomUUID(), name: 'Portability test participant', email: 'portability@example.test',
    phone: '', organisation: 'Fictional restore-check business', participantType: 'business', authorityConfirmed: true,
    interests: ['events', 'tourism'], offer: 'Fictional test entry', consentVersion: '2026-11-19', consentFutureHandover: false,
  }, createdAt);
  assert.equal(receipt.created, true);
  reference = receipt.reference;
  const review = await repository.reviewParticipant(reference, {
    status: 'contacted', notes: 'Fictional backup and restore check', expectedUpdatedAt: createdAt,
  }, 'portability-test', reviewedAt);
  assert.equal(review.conflict, false);
  assert.equal(review.participant.status, 'contacted');
  assert.equal(await repository.consumeRateLimit('fictional-salted-hash', createdAt, '2026-11-19T02:00:00.000Z'), 1);
  snapshot = await repository.exportAll(exportedAt);
  assert.equal(snapshot.participants.length, 1);
  assert.equal(snapshot.auditEvents.length, 2);

  async function mapRequest(route, { method = 'GET', data, at = exportedAt, privateRoute = false } = {}) {
    const worker = createWorker({ now: () => at });
    const response = await worker.fetch(new Request(`http://127.0.0.1${route}`, {
      method, headers: {
        ...(method === 'GET' ? {} : { Origin: 'http://127.0.0.1', 'Content-Type': 'application/json' }),
        ...(privateRoute ? { Authorization: `Bearer ${token}` } : {}),
      }, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }), { DB: d1, LOCAL_DEV: 'true', LOCAL_ADMIN_TOKEN: token, INTAKE_RATE_LIMIT: '100' });
    assert.ok(response.ok, `The fictional D1 map rehearsal request failed: ${route} (${response.status}).`);
    return response.json();
  }
  const point = {
    submissionId: crypto.randomUUID(), name: 'Fictional portability-check bus stop', category: 'bus_stop',
    latitude: -27.44, longitude: 153.42, locationDescription: 'Fictional test position, not a public listing.',
    description: 'Created only in an isolated local migration rehearsal.', access: 'public', wheelchair: 'unknown',
    facilities: ['shelter', 'seating'], stopMarking: 'unmarked', sourceType: 'firsthand', sourceUrl: '',
    observedOn: '2026-11-18', publicCredit: '', publicationConsent: true, consentVersion: '2026-11-19',
  };
  const mapReceipt = await mapRequest('/api/map/suggestions', { method: 'POST', data: point, at: createdAt });
  assert.equal(mapReceipt.status, 'received'); mapSuggestionId = mapReceipt.reference;
  const queue = await mapRequest('/api/admin/map/suggestions', { privateRoute: true });
  assert.equal(queue.suggestions.length, 1);
  const publication = await mapRequest(`/api/admin/map/suggestions/${mapSuggestionId}/review`, {
    method: 'POST', at: reviewedAt, privateRoute: true,
    data: { decision: 'publish', expectedUpdatedAt: queue.suggestions[0].updatedAt, notes: 'Fictional source checked for the restore rehearsal.' },
  });
  mapPlaceId = publication.place.id; assert.equal(publication.place.properties.version, 1);
  const correction = await mapRequest('/api/map/suggestions', {
    method: 'POST', at: reviewedAt,
    data: { ...point, submissionId: crypto.randomUUID(), placeId: mapPlaceId, baseVersion: 1, name: 'Fictional pending portability correction' },
  });
  correctionId = correction.reference;
  mapSnapshot = await mapRequest('/api/admin/map/export', { privateRoute: true });
  assert.equal(mapSnapshot.places.length, 1);
  assert.equal(mapSnapshot.suggestions.length, 2);
  assert.equal(mapSnapshot.suggestions.find(item => item.id === correctionId).status, 'pending');
  assert.equal(mapSnapshot.revisions.length, 1);
  assert.equal(mapSnapshot.auditEvents.length, 3);
  publicMapSnapshot = await mapRequest('/api/map/export');
  assert.equal(publicMapSnapshot.features.length, 1);
  assert.equal(publicMapSnapshot.features[0].properties.name, point.name);
  assert.deepEqual(publicMapSnapshot.features[0].geometry.coordinates, [153.42, -27.44]);
} finally {
  await miniflare.dispose();
}

const sqlPath = path.join(directory, 'local-d1-export.sql');
wrangler(['d1', 'export', binding.database_name, '--local', '--output', sqlPath]);
const database = new DatabaseSync(path.join(directory, 'restored.sqlite'));
try {
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(await readFile(sqlPath, 'utf8'));
  const restored = createRepository(createSqliteD1(database));
  assert.deepEqual(await restored.exportAll(exportedAt), snapshot, 'D1 SQL export must preserve the private register and append order.');
  assert.throws(() => database.prepare('UPDATE participants SET current_operating_entity_id = ? WHERE id = ?')
    .run('ready-setco', reference), /immutable/i, 'Operator and consent history must remain protected after restore.');
  assert.throws(() => database.prepare('DELETE FROM audit_events WHERE participant_id = ?')
    .run(reference), /append-only/i, 'Audit events must remain append-only after restore.');

  const worker = createWorker({ now: () => exportedAt });
  const response = await worker.fetch(new Request('http://127.0.0.1/api/admin/export', {
    headers: { Authorization: `Bearer ${token}` },
  }), { DB: createSqliteD1(database), LOCAL_DEV: 'true', LOCAL_ADMIN_TOKEN: token });
  assert.equal(response.status, 200, 'The shared Worker API must run against restored native SQLite.');
  assert.deepEqual(await response.json(), snapshot);

  const restoredMapResponse = await worker.fetch(new Request('http://127.0.0.1/api/admin/map/export', {
    headers: { Authorization: `Bearer ${token}` },
  }), { DB: createSqliteD1(database), LOCAL_DEV: 'true', LOCAL_ADMIN_TOKEN: token });
  assert.equal(restoredMapResponse.status, 200, 'The private map export must run against restored native SQLite.');
  assert.deepEqual(await restoredMapResponse.json(), mapSnapshot, 'Published places, pending corrections, source permission, revisions and audit must survive D1 SQL export exactly.');
  const restoredPublicMap = await worker.fetch(new Request('http://127.0.0.1/api/map/export'), { DB: createSqliteD1(database) });
  assert.equal(restoredPublicMap.status, 200);
  assert.deepEqual(await restoredPublicMap.json(), publicMapSnapshot, 'The public GeoJSON must remain identical and exclude the pending correction after restore.');
  assert.throws(() => database.prepare('UPDATE map_suggestions SET consent_version = ? WHERE id = ?')
    .run('rewrite', correctionId), /immutable/i, 'Original map display permission must remain protected after restore.');
  assert.throws(() => database.prepare('DELETE FROM map_revisions WHERE place_id = ?')
    .run(mapPlaceId), /append-only/i, 'Map source revisions must remain append-only after restore.');
  assert.throws(() => database.prepare('DELETE FROM map_audit_events WHERE suggestion_id = ?')
    .run(mapSuggestionId), /append-only/i, 'Map audit events must remain append-only after restore.');
  console.log('Portability passed: real local D1 migrations, SQL export, native SQLite restore, protected participant and map history, identical public GeoJSON and shared Worker APIs.');
  console.log(`Fictional rehearsal files: ${directory}`);
} finally {
  database.close();
}
