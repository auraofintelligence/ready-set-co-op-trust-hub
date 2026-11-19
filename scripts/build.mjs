import { cp, lstat, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const publicNames = new Set(['robots.txt', 'sitemap.xml', 'site.webmanifest', 'LICENCE.md']);

function publicRootFile(name) {
  return !name.startsWith('.') && (/\.(?:html|css|js)$/i.test(name) || publicNames.has(name));
}

function verifiedBuildDirectory(name) {
  const target = path.resolve(projectRoot, name);
  if (path.dirname(target) !== path.resolve(projectRoot) || path.basename(target) !== 'dist') {
    throw new Error('The build output must remain in its dedicated project directory.');
  }
  return target;
}

async function countFiles(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Public build assets must be ordinary files.');
    if (entry.isDirectory()) count += await countFiles(path.join(directory, entry.name));
    else if (entry.isFile()) count++;
  }
  return count;
}

export async function buildSite() {
  const destination = verifiedBuildDirectory('dist');
  const existing = await lstat(destination).catch(() => null);
  if (existing?.isSymbolicLink()) throw new Error('The build output must not be a symbolic link.');
  // This path is constructed and checked above, never supplied by a request.
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });

  const entries = await readdir(projectRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && publicRootFile(entry.name)) {
      await cp(path.join(projectRoot, entry.name), path.join(destination, entry.name));
    }
  }

  const assets = path.join(projectRoot, 'assets');
  const assetInfo = await stat(assets).catch(() => null);
  if (assetInfo?.isDirectory()) {
    await countFiles(assets); // Reject links before copying anything outside the public asset tree.
    await cp(assets, path.join(destination, 'assets'), { recursive: true, dereference: false });
  }

  const count = await countFiles(destination);
  console.log(`Built ${count} public files in dist. Private records and server files are excluded.`);
  return destination;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await buildSite();
}
