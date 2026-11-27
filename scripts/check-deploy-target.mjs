import { readFile } from 'node:fs/promises';

const configuration = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const database = configuration.d1_databases?.find(binding => binding.binding === 'DB');
if (configuration.name !== 'ready-setco' || configuration.account_id !== '8ec4bbe64bddc4086162119149e37ef8' ||
    database?.database_name !== 'ready-setco-operations' || database?.database_id !== 'da54bed9-19e4-4559-91a0-605661217183') {
  throw new Error('Production deployment must target the existing ready-setco Worker and ready-setco-operations database.');
}
if (process.env.WORKERS_CI && process.env.WORKERS_CI_BRANCH !== 'main') {
  throw new Error('Production deployment and database migrations are restricted to the main branch. Disable preview builds for this connection.');
}
if (process.env.WRANGLER_CI_OVERRIDE_NAME && process.env.WRANGLER_CI_OVERRIDE_NAME !== 'ready-setco') {
  throw new Error('This repository must be connected to the existing ready-setco Worker.');
}
if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID !== configuration.account_id) {
  throw new Error('The build account does not match the configured ready-setco account.');
}
console.log('Verified production target: ready-setco and the existing ready-setco-operations database.');
