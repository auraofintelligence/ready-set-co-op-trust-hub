import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const packageDirectory = path.join(projectRoot, 'node_modules/@serenity-kit/opaque');
const version = '1.1.0';
const integrity = 'sha512-Y6v/+hRMn0MdMEk5+/ArM0vPIiFfFEbdTZc7oAx+cWyvGODGezAQ/sMjXBVogf7NsS9z9EV0Ve5paZCVULuedw==';
const sourceSha256 = '1e8d56383a77948e453085b6d4f52dcb9645f8bfff32395738b63d3a2e2fcb52';
const wasmSha256 = '32255973125fe9ac1fdf54d7f152361b302299f4b6678a1cb1c9baa978f0d6db';
const hash = value => createHash('sha256').update(value).digest('hex');

export async function preparePasswordRuntime({ browserDirectory } = {}) {
  const [project, lock, dependency, source, license] = await Promise.all([
    readFile(path.join(projectRoot, 'package.json'), 'utf8').then(JSON.parse),
    readFile(path.join(projectRoot, 'package-lock.json'), 'utf8').then(JSON.parse),
    readFile(path.join(packageDirectory, 'package.json'), 'utf8').then(JSON.parse),
    readFile(path.join(packageDirectory, 'esm/index.js'), 'utf8'),
    readFile(path.join(packageDirectory, 'LICENSE'), 'utf8'),
  ]);
  const locked = lock.packages?.['node_modules/@serenity-kit/opaque'];
  if (project.dependencies?.['@serenity-kit/opaque'] !== version || dependency.name !== '@serenity-kit/opaque' ||
      dependency.version !== version || locked?.version !== version || locked?.integrity !== integrity ||
      hash(source) !== sourceSha256) {
    throw new Error('The pinned OPAQUE package failed its integrity check. Reinstall from the lockfile; review a dependency upgrade before changing these checks.');
  }

  // Preserve the upstream cryptography. Only its inline-WASM loader changes for Workers.
  const loader = /^function _loadWasmModule[\s\S]*?function wasmData\(imports\)\{return _loadWasmModule\(0, null, '([A-Za-z0-9+/=]+)'\)\}\n/;
  const matched = source.match(loader);
  if (!matched) throw new Error('The pinned OPAQUE WASM loader no longer matches the reviewed package.');
  const wasm = Buffer.from(matched[1], 'base64');
  if (wasm.length !== 309954 || hash(wasm) !== wasmSha256) throw new Error('The OPAQUE WASM binary failed its integrity check.');
  const init = '__wbg_init({ module_or_path: wasmData() })';
  if (source.split(init).length !== 2) throw new Error('The pinned OPAQUE initializer no longer matches.');
  const adapted = `// Generated from @serenity-kit/opaque ${version}; see scripts/prepare-password-runtime.mjs.\n` +
    `import opaqueWasmModule from './opaque.wasm';\n` +
    source.slice(matched[0].length).replace(init, '__wbg_init({ module_or_path: opaqueWasmModule })');

  const workerDirectory = path.join(projectRoot, 'cloudflare/vendor');
  await mkdir(workerDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(workerDirectory, 'opaque-worker.mjs'), adapted),
    writeFile(path.join(workerDirectory, 'opaque.wasm'), wasm),
    writeFile(path.join(workerDirectory, 'Opaque-LICENSE'), license),
  ]);
  if (browserDirectory) {
    await mkdir(browserDirectory, { recursive: true });
    await Promise.all([
      writeFile(path.join(browserDirectory, 'opaque-browser.js'), source),
      writeFile(path.join(browserDirectory, 'Opaque-LICENSE.txt'), license),
    ]);
  }
  return { workerDirectory, version, sourceSha256, wasmSha256 };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await preparePasswordRuntime();
  console.log(`Prepared pinned OPAQUE ${version} for the existing Cloudflare Worker.`);
}
