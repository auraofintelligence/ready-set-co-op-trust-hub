import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const categories = new Set(['business', 'bus_stop', 'picnic', 'seat', 'toilet', 'club', 'beach', 'water', 'other']);

export async function generateMapIcons({ check = false } = {}) {
  const catalog = JSON.parse(await readFile(new URL('assets/map-icons/catalog.json', root), 'utf8'));
  if (catalog.columns !== 4 || catalog.rows !== 4 || Object.keys(catalog.sheets ?? {}).length !== 3 || !Array.isArray(catalog.icons) || catalog.icons.length !== 48) {
    throw new Error('The map icon catalogue needs three complete 4 × 4 sheets.');
  }
  const ids = new Set(), positions = new Set();
  for (const icon of catalog.icons) {
    if (!/^[a-z][a-z_]+$/.test(icon.id) || ids.has(icon.id) || !icon.label || !categories.has(icon.category) ||
        !Object.hasOwn(catalog.sheets, icon.sheet) || !Number.isInteger(icon.column) || !Number.isInteger(icon.row) ||
        icon.column < 0 || icon.column >= catalog.columns || icon.row < 0 || icon.row >= catalog.rows) {
      throw new Error(`Invalid map icon catalogue entry: ${icon.id}`);
    }
    const position = `${icon.sheet}:${icon.column}:${icon.row}`;
    if (positions.has(position)) throw new Error(`Repeated map icon sheet position: ${position}`);
    ids.add(icon.id); positions.add(position);
  }
  for (const sheet of Object.values(catalog.sheets)) {
    if (!/^assets\/map-icons\/[a-z-]+\.png$/.test(sheet)) throw new Error('Map icon sheets must use local public PNG assets.');
  }
  const generated = `// Generated from assets/map-icons/catalog.json by scripts/generate-map-icons.mjs.\nwindow.READY_MAP_ICONS = ${JSON.stringify(catalog, null, 2)};\n`;
  const destination = new URL('map-icons.js', root);
  const existing = await readFile(destination, 'utf8').catch(() => null);
  if (existing !== generated) {
    if (check) throw new Error('map-icons.js is out of date. Run node scripts/generate-map-icons.mjs.');
    await writeFile(destination, generated);
  }
  return catalog;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const catalog = await generateMapIcons({ check: process.argv.includes('--check') });
  console.log(`Verified ${catalog.icons.length} map icons across ${Object.keys(catalog.sheets).length} sheets.`);
}
