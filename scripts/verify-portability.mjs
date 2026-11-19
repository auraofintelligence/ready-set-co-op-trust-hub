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
let snapshot;
let reference;
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

  const token = 'local-portability-rehearsal-token-32-characters';
  const worker = createWorker({ now: () => exportedAt });
  const response = await worker.fetch(new Request('http://127.0.0.1/api/admin/export', {
    headers: { Authorization: `Bearer ${token}` },
  }), { DB: createSqliteD1(database), LOCAL_DEV: 'true', LOCAL_ADMIN_TOKEN: token });
  assert.equal(response.status, 200, 'The shared Worker API must run against restored native SQLite.');
  assert.deepEqual(await response.json(), snapshot);
  console.log('Portability passed: real local D1 migration, SQL export, native SQLite restore, protected history and shared Worker API.');
  console.log(`Fictional rehearsal files: ${directory}`);
} finally {
  database.close();
}
