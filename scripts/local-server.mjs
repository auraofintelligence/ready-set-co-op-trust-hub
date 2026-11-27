import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './build.mjs';
import { createSqliteD1 } from './sqlite-d1.mjs';
import worker from '../cloudflare/worker.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Use Node.js 24 or newer for the local SQLite server.');
const port = Number(process.env.READY_SETCO_PORT ?? '8792');
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('READY_SETCO_PORT must be a port from 1024 to 65535.');
const origin = `http://127.0.0.1:${port}`;
const localAdminToken = randomBytes(32).toString('base64url');
const publicDirectory = await buildSite();
const privateDirectory = path.resolve(root, process.env.READY_SETCO_DATA_DIR ?? '.local');
const relativeDataDirectory = path.relative(root, privateDirectory);
const outsideCheckout = path.isAbsolute(relativeDataDirectory) || relativeDataDirectory === '..' || relativeDataDirectory.startsWith(`..${path.sep}`);
if (!outsideCheckout &&
    relativeDataDirectory.split(path.sep)[0] !== '.local') {
  throw new Error('A data directory inside the checkout must be under .local so records cannot enter the public build or source control.');
}
await mkdir(privateDirectory, { recursive: true });
const database = new DatabaseSync(path.join(privateDirectory, 'ready-setco.sqlite'));
database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

const dbAdapter = createSqliteD1(database);

async function migrate() {
  database.exec('CREATE TABLE IF NOT EXISTS ready_setco_local_migrations (name TEXT PRIMARY KEY NOT NULL, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const directory = path.join(root, 'migrations');
  const files = (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  if (!files.length) throw new Error('No database migrations are available.');
  for (const name of files) {
    const sql = await readFile(path.join(directory, name), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const existing = database.prepare('SELECT sha256 FROM ready_setco_local_migrations WHERE name = ?').get(name);
    if (existing) {
      if (existing.sha256 !== hash) throw new Error(`Previously applied migration changed: ${name}. Preserve the database and add a new migration.`);
      continue;
    }
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(sql);
      database.prepare('INSERT INTO ready_setco_local_migrations (name, sha256, applied_at) VALUES (?, ?, ?)')
        .run(name, hash, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    console.log(`Applied local database migration ${name}.`);
  }
}
await migrate();

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.pdf': 'application/pdf'
};

async function assetFetch(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response('Bad path', { status: 400 }); }
  if (pathname.includes('\0') || pathname.includes('\\')) return new Response('Bad path', { status: 400 });
  if (pathname === '/') pathname = '/index.html';
  const resolved = path.resolve(publicDirectory, `.${pathname}`);
  const relative = path.relative(publicDirectory, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Not found', { status: 404 });
  try {
    const actual = await realpath(resolved);
    const actualRelative = path.relative(publicDirectory, actual);
    if (actualRelative.startsWith('..') || path.isAbsolute(actualRelative) || !(await stat(actual)).isFile()) {
      return new Response('Not found', { status: 404 });
    }
    return new Response(request.method === 'HEAD' ? null : await readFile(actual), {
      headers: { 'Content-Type': mime[path.extname(actual).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }
    });
  } catch { return new Response('Not found', { status: 404 }); }
}

const environment = {
  DB: dbAdapter,
  ASSETS: { fetch: assetFetch },
  LOCAL_DEV: 'true',
  LOCAL_ADMIN_TOKEN: localAdminToken,
  READY_AUTH_SECRET: process.env.READY_AUTH_SECRET,
  ALLOWED_ORIGINS: origin,
  INTAKE_RATE_LIMIT: '10'
};

const server = http.createServer(async (incoming, outgoing) => {
  try {
    const host = incoming.headers.host;
    if (![new URL(origin).host, `localhost:${port}`].includes(host)) {
      outgoing.writeHead(400, { 'Content-Type': 'text/plain' });
      outgoing.end('Use the loopback address printed by the local server.');
      return;
    }
    const requestUrl = new URL(incoming.url, `http://${host}`);
    if (requestUrl.origin !== `http://${host}`) throw new Error('Invalid request target.');
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) for (const part of value) headers.append(name, part);
      else if (value !== undefined) headers.set(name, value);
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of incoming) {
      length += chunk.length;
      if (length > 65536) {
        outgoing.writeHead(413, { 'Content-Type': 'text/plain' });
        outgoing.end('Request too large.');
        return;
      }
      chunks.push(chunk);
    }
    const body = ['GET', 'HEAD'].includes(incoming.method) ? undefined : Buffer.concat(chunks);
    const request = new Request(requestUrl, { method: incoming.method, headers, body });
    const response = await worker.fetch(request, environment, { waitUntil(promise) { promise.catch(() => {}); } });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('Local request failed:', error?.message ?? 'unknown error');
    if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    outgoing.end('The local request could not be completed.');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Ready SETCO local site: ${origin}/`);
  console.log(`Participation form: ${origin}/join.html`);
  console.log(`Local administration: ${origin}/manage.html`);
  console.log('Paste this temporary token into the local administration sign-in field:');
  console.log(localAdminToken);
  console.log('The token changes on restart. Keep it in browser memory only; it is never saved to source or the database.');
  console.log(`Local records persist in ${path.join(privateDirectory, 'ready-setco.sqlite')}. Cloudflare records are separate.`);
});

function close() {
  server.close(() => { database.close(); process.exit(0); });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);

