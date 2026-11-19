import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { applyPublicDetails, publicPageSequence } from './public-page-details.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
let changed = 0;
for (const [file] of publicPageSequence) {
  const location = path.join(root, file);
  const original = await readFile(location, 'utf8');
  const dom = new JSDOM(original);
  applyPublicDetails(dom.window.document, file);
  const updated = `${dom.serialize()}\n`;
  if (updated !== original) {
    await writeFile(location, updated);
    changed++;
  }
  dom.window.close();
}
console.log(`Refreshed the public page tour and Strange but True colours on ${changed} pages.`);
