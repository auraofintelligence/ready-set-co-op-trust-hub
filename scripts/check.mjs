import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const major = Number(process.versions.node.split('.')[0]);
if (major < 24) throw new Error('Ready SETCO operations requires Node.js 24 or newer.');

const sourceFiles = [];
for (const directory of ['scripts', 'cloudflare']) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && /\.mjs$/.test(entry.name)) sourceFiles.push(path.join(root, directory, entry.name));
  }
}
for (const name of ['join.js', 'manage.js', 'operations-config.js']) {
  await readFile(path.join(root, name));
  sourceFiles.push(path.join(root, name));
}
for (const source of sourceFiles) {
  const result = spawnSync(process.execPath, ['--check', source], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error(`Syntax check failed: ${path.relative(root, source)}`);
}

const configuration = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
if (configuration.name !== 'ready-setco' || configuration.assets?.directory !== './dist' ||
    !configuration.assets.run_worker_first.includes('/api/*') ||
    !['/manage', '/manage.html', '/manage/*'].every(route => configuration.assets.run_worker_first.includes(route)) ||
    configuration.d1_databases?.[0]?.binding !== 'DB') {
  throw new Error('The operations routes and dedicated database binding must remain configured.');
}

const ignore = await readFile(path.join(root, '.gitignore'), 'utf8');
for (const entry of ['node_modules/', 'dist/', '.wrangler/', '.local/', '.dev.vars', '.env']) {
  if (!ignore.split(/\r?\n/).includes(entry)) throw new Error(`Missing private/build exclusion: ${entry}`);
}
console.log(`Checked ${sourceFiles.length} JavaScript files, private-file exclusions and Worker routing.`);
