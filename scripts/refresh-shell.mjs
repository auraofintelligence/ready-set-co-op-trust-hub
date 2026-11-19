import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { applyPublicDetails } from './public-page-details.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const origin = 'https://ready-setco.auraofintelligence.workers.dev';
const navigation = [
  ['events.html', 'Events'], ['jobs.html', 'Training & work'],
  ['media-assets.html', 'Notices & media'], ['grant-roadmap.html', 'Grants'],
  ['boundaries.html', 'Support'], ['map.html', 'Map'], ['members.html', 'Members'],
];
const legacy = new Set(['trust-ladder.html', 'ballow-road.html', 'horizon.html']);
const brand = `<a class="brand-mark" href="index.html" aria-label="Ready SETCO home"><img class="brand-logo" src="assets/ready-setco-tide-192.png" width="192" height="192" alt=""><span class="brand-name">Ready <span class="set">SET</span>CO<span class="brand-subtitle">PEOPLE · SKILLS · POSSIBILITY</span></span></a>`;
const current = (file, target) => file === target ? ' aria-current="page"' : '';
function header(file) {
  return `<nav class="nav" aria-label="Main navigation">${brand}<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav-links"><span class="menu-lines" aria-hidden="true"></span>Menu</button><div class="nav-links" id="nav-links">${navigation.map(([target, label]) => `<a href="${target}"${current(file, target)}>${label}</a>`).join('')}<a class="mobile-only" href="about.html"${current(file, 'about.html')}>About Ready SETCO</a><a class="nav-join" href="join.html"${current(file, 'join.html')}>Take part</a></div></nav>`;
}
function dock(file) {
  return `<nav class="mobile-dock" aria-label="Quick navigation"><a href="events.html"${current(file, 'events.html')}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 2v6m8-6v6M4 11h16"/></svg>Events</a><a href="map.html"${current(file, 'map.html')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/></svg>Map</a><a class="dock-join" href="join.html"${current(file, 'join.html')}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m4-14v8m-4-4h8"/></svg>Take part</a></nav>`;
}
const footer = `<div class="footer-inner"><div class="footer-brand">${brand}<p>Ready Sustainable Employment and Training Cooperative.<br>A proposed local cooperative for skills, paid work and shared resources. Help shape it from the beginning.</p></div><div class="footer-links"><a href="about.html">About Ready SETCO</a><a href="members.html">Members & decisions</a><a href="boundaries.html">Permissions & support</a><a href="ecosystem-links.html">Sources & connected work</a><a href="site-map.html">Site directory</a><a href="mailto:sbt4183@gmail.com">Contact Luke</a></div></div><div class="footer-bottom"><span>Initially operated by Luke Hayes, trading as Strange But True · ABN 81 913 657 174.<br>Ready SETCO is still forming. Joining as a member or transferring services will require separate agreements.</span><a href="https://auraofintelligence.github.io/strange-but-true/">Strange But True</a></div>`;

let count = 0;
for (const name of (await readdir(root)).filter(name => name.endsWith('.html'))) {
  const dom = new JSDOM(await readFile(path.join(root, name), 'utf8'));
  const doc = dom.window.document;
  const head = doc.head;
  doc.documentElement.lang = 'en-AU';
  const viewport = head.querySelector('meta[name="viewport"]');
  if (viewport) viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  for (const item of head.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"],link[rel="preconnect"],link[href*="fonts.googleapis.com"],meta[name="theme-color"],link[rel="canonical"],meta[property^="og:"]')) item.remove();
  head.insertAdjacentHTML('beforeend', `<meta name="theme-color" content="#101020"><link rel="icon" href="assets/ready-setco-tide.ico?v=20261119" sizes="16x16 32x32 48x48"><link rel="icon" type="image/png" sizes="32x32" href="assets/ready-setco-tide-32.png?v=20261119"><link rel="icon" type="image/png" sizes="192x192" href="assets/ready-setco-tide-192.png?v=20261119"><link rel="apple-touch-icon" sizes="180x180" href="assets/ready-setco-tide-apple-180.png?v=20261119">`);
  if (name !== 'manage.html') {
    const description = head.querySelector('meta[name="description"]')?.content || 'Events, learning, information and shared capability, starting on Minjerribah.';
    const escape = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    head.insertAdjacentHTML('beforeend', `<link rel="canonical" href="${origin}/${name === 'index.html' ? '' : name}"><meta property="og:title" content="${escape(doc.title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${origin}/${name === 'index.html' ? '' : name}"><meta property="og:image" content="${origin}/assets/heroes/home-hero.webp">`);
    doc.querySelector('.site-header').innerHTML = header(name);
    doc.querySelector('.site-footer').innerHTML = footer;
    doc.querySelector('.mobile-dock')?.remove();
    doc.body.insertAdjacentHTML('beforeend', dock(name));
    if (!doc.querySelector('script[src="script.js"]')) doc.body.insertAdjacentHTML('beforeend', '<script src="script.js" defer></script>');
    doc.querySelectorAll('.route-nav,[data-to-top]').forEach(item => item.remove());
    if (legacy.has(name)) {
      doc.body.classList.add('legacy-page');
      if (!doc.querySelector('.legacy-banner')) doc.querySelector('main').insertAdjacentHTML('afterbegin', '<aside class="legacy-banner">Earlier concept material: retained as background research. Current priorities are for the proposed cooperative to choose. <a href="index.html">Return to Ready SETCO</a>.</aside>');
    }
  }
  applyPublicDetails(doc, name);
  await writeFile(path.join(root, name), dom.serialize() + '\n');
  dom.window.close();
  count++;
}
console.log(`Applied the shared mobile-first navigation, branding and footer to ${count} pages.`);
