import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = (await readdir(root)).filter(name => name.endsWith('.html'));
const pages = new Map();
const errors = [];
let links = 0;
for (const file of files) {
  const dom = new JSDOM(await readFile(path.join(root, file), 'utf8'), { url: `https://ready-setco.example/${file}` });
  pages.set(file, dom);
  const doc = dom.window.document;
  if (doc.querySelectorAll('h1').length !== 1) errors.push(`${file}: needs one main heading`);
  if (!doc.querySelector('main#main') || !doc.querySelector('a.skip-link[href="#main"]')) errors.push(`${file}: missing skip-link destination`);
  if (!doc.querySelector('meta[name="viewport"]')) errors.push(`${file}: missing responsive viewport`);
  const ids = [...doc.querySelectorAll('[id]')].map(element => element.id);
  if (new Set(ids).size !== ids.length) errors.push(`${file}: duplicate IDs`);
  for (const image of doc.querySelectorAll('img')) if (!image.hasAttribute('alt')) errors.push(`${file}: image missing alt`);
  if (file !== 'manage.html' && !doc.querySelector('.nav-links a[href="map.html"]')) errors.push(`${file}: map missing from main menu`);
}
for (const [file, dom] of pages) {
  for (const element of dom.window.document.querySelectorAll('a[href],link[href],script[src],img[src]')) {
    const value = element.getAttribute(element.hasAttribute('src') ? 'src' : 'href');
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) continue;
    if (value.startsWith('/cdn-cgi/')) continue;
    links++;
    const url = new URL(value, `https://ready-setco.example/${file}`);
    const filename = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
    const target = path.resolve(root, filename);
    if (!target.startsWith(root) || !(await stat(target).catch(() => null))?.isFile()) {
      errors.push(`${file}: missing local destination ${value}`); continue;
    }
    if (url.hash && filename.endsWith('.html')) {
      const destination = pages.get(filename)?.window.document;
      if (destination && !destination.getElementById(decodeURIComponent(url.hash.slice(1)))) errors.push(`${file}: missing anchor ${value}`);
    }
  }
}
for (const dom of pages.values()) dom.window.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Verified ${files.length} pages and ${links} local links/assets: headings, anchors, IDs, map navigation and image descriptions.`);
