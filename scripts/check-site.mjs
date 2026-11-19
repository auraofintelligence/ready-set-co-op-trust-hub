import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { publicPageSequence } from './public-page-details.mjs';

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
  if (file !== 'manage.html') {
    if (!doc.querySelector('.site-header + .reading-panel') ||
        !doc.querySelector('button#reading-easy-toggle[aria-pressed]') ||
        !doc.querySelector('button#reading-language-toggle[aria-controls="translation-options"]') ||
        !['reading.css', 'reading.js', 'translation.js'].every(asset => doc.querySelector(`[href="${asset}"],[src="${asset}"]`))) {
      errors.push(`${file}: needs shared reading and language controls before the main content`);
    }
    const position = publicPageSequence.findIndex(([target]) => target === file);
    const journey = doc.querySelector('.site-footer .page-journey');
    if (position < 0) errors.push(`${file}: public page missing from the browse sequence`);
    if (!journey || doc.querySelectorAll('.page-journey').length !== 1) {
      errors.push(`${file}: needs one footer browse navigation`);
    } else if (position >= 0) {
      const previous = publicPageSequence[position - 1];
      const next = publicPageSequence[position + 1] || publicPageSequence[0];
      if (journey.querySelector('a[rel="prev"]')?.getAttribute('href') !== previous?.[0]) errors.push(`${file}: incorrect previous page`);
      if (journey.querySelector('a[rel="next"]')?.getAttribute('href') !== next[0]) errors.push(`${file}: incorrect next page`);
      if (!journey.querySelector('a[href="site-map.html"]')) errors.push(`${file}: browse navigation needs the full directory`);
      if (!journey.textContent.includes(`Page ${position + 1} of ${publicPageSequence.length}`)) errors.push(`${file}: incorrect browse position`);
    }
    const walker = doc.createTreeWalker(doc.body, dom.window.NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (/Strange But True/i.test(node.textContent) && !node.parentElement.closest('script,style,.sbt-brand-link,.sbt-brand-wordmark')) {
        errors.push(`${file}: visible Strange but True name needs its colour branding`);
      }
    }
  }
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
console.log(`Verified ${files.length} pages and ${links} local links/assets: headings, anchors, IDs, map navigation, the public page tour, brand names and image descriptions.`);
