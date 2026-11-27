export const publicPageSequence = [
  ['index.html', 'Home'],
  ['events.html', 'Events & experiences'],
  ['jobs.html', 'Training & work'],
  ['media-assets.html', 'Notices, news & media'],
  ['grant-roadmap.html', 'Grants & project readiness'],
  ['boundaries.html', 'Compliance & support'],
  ['map.html', 'Local map'],
  ['members.html', 'Members & decisions'],
  ['formation.html', 'Formation & governance'],
  ['cooperative-law.html', 'Queensland law & rules'],
  ['governance.html', 'Running the cooperative'],
  ['formation-planner.html', 'Formation planning tools'],
  ['cooperative-network.html', 'Cooperatives in other communities'],
  ['join.html', 'Take part'],
  ['about.html', 'About Ready SETCO'],
  ['ecosystem-links.html', 'Sources & connected work'],
  ['site-map.html', 'Site directory'],
  ['trust-ladder.html', 'Earlier research: Sharing safely'],
  ['ballow-road.html', 'Earlier research: A shared workspace'],
  ['horizon.html', 'Earlier research: Longer-term ideas'],
];

const brandUrl = 'https://auraofintelligence.github.io/strange-but-true/';
const escape = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function strangeButTrueMarkup({ full = false, linked = true, middle = 'but' } = {}) {
  const words = `<span class="sbt-brand-strange">Strange</span> <span class="sbt-brand-but">${middle}</span> <span class="sbt-brand-true">True${full ? ':' : ''}</span>${full ? ' <span class="sbt-brand-tagline">Tech, Art and Ideas That\'ll Help</span>' : ''}`;
  return linked
    ? `<a class="sbt-brand-link${full ? ' sbt-brand-full' : ' sbt-brand-short'}" href="${brandUrl}"><strong>${words}</strong></a>`
    : `<strong class="sbt-brand-wordmark">${words}</strong>`;
}

export function pageJourney(file) {
  const index = publicPageSequence.findIndex(([target]) => target === file);
  if (index < 0) return '';
  const previous = publicPageSequence[index - 1];
  const next = publicPageSequence[index + 1];
  const link = (entry, direction, label) => `<a class="page-journey-${direction}" href="${entry[0]}" rel="${direction === 'previous' ? 'prev' : 'next'}"><span>${label}</span><strong>${escape(entry[1])}</strong></a>`;
  return `<nav class="page-journey" aria-label="Browse the website"><div class="page-journey-heading"><p>Page ${index + 1} of ${publicPageSequence.length} <span>· ${['trust-ladder.html', 'ballow-road.html', 'horizon.html'].includes(file) ? 'Earlier research' : 'Main site'}</span></p><a href="site-map.html">See all pages</a></div><div class="page-journey-links">${previous ? link(previous, 'previous', 'Previous') : '<span class="page-journey-start"><span>You are at the beginning</span><strong>Welcome to Ready SETCO</strong></span>'}${next ? link(next, 'next', 'Next') : link(publicPageSequence[0], 'next', 'Back to the beginning')}</div></nav>`;
}

export function readingPreferences() {
  return `<aside class="reading-panel" aria-label="Reading and language"><div class="reading-quick-controls"><button id="reading-easy-toggle" type="button" aria-pressed="false" hidden>Larger text &amp; high contrast <span class="reading-current" aria-hidden="true" hidden>On</span></button><button id="reading-standard" type="button" hidden>Use standard view</button><button id="reading-language-toggle" type="button" aria-expanded="false" aria-controls="translation-options" hidden>Language / Translate</button></div><p id="reading-view-status" role="status" aria-live="polite"></p><details id="translation-options"><summary id="translation-options-title">Language / Translate</summary><div id="translation-controls"><p>Use your browser's Translate option to read this page in another language.</p></div></details><details id="reading-options"><summary>Listen to this page</summary><p>Optional read aloud uses your browser's voice, which may need internet access. It reads public page text only, never anything you type in a form. Nothing starts automatically.</p><div id="read-aloud-controls" hidden><div class="reading-listen-buttons"><button id="read-aloud-start" type="button">Read page aloud</button><button id="read-aloud-pause" type="button" disabled>Pause reading</button><button id="read-aloud-stop" type="button" disabled>Stop reading</button></div><p id="read-aloud-status" role="status" aria-live="polite"></p></div><p id="read-aloud-unavailable">If this browser has no page voice, use its Read aloud feature or your usual screen reader.</p></details><noscript><p>You can enlarge the page with your browser's zoom controls, use a screen reader, or choose Translate in the browser menu. The larger-text switch needs JavaScript.</p></noscript></aside>`;
}

/** Keep public visual branding and the no-JavaScript page tour consistent. */
export function applyPublicDetails(doc, file) {
  if (!publicPageSequence.some(([target]) => target === file)) return;
  doc.querySelectorAll('.reading-panel').forEach(item => item.remove());
  doc.querySelector('.site-header').insertAdjacentHTML('afterend', readingPreferences());
  for (const item of doc.querySelectorAll('link[href="reading.css"],script[src="reading.js"],script[src="translation.js"]')) item.remove();
  doc.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="reading.css"><script src="reading.js" defer></script><script src="translation.js" defer></script>');
  const footer = doc.querySelector('.site-footer');
  if (!footer) throw new Error(`${file}: missing public footer`);
  const introduction = footer.querySelector('.footer-brand p');
  if (introduction) introduction.innerHTML = 'Ready Sustainable Employment and Training Cooperative.<br>A proposed local cooperative for skills, paid work and shared resources. Help shape it from the beginning.';
  const about = footer.querySelector('.footer-links a[href="about.html"]');
  if (about) about.textContent = 'About Ready SETCO';
  const support = footer.querySelector('.footer-links a[href="boundaries.html"]');
  if (support) support.textContent = 'Permissions & support';
  const operator = footer.querySelector('.footer-bottom > span');
  if (operator) operator.innerHTML = `Initially operated by Luke Hayes, trading as ${strangeButTrueMarkup({ middle: 'But' })} · ABN 81 913 657 174.<br>Ready SETCO is still forming. Joining as a member or transferring services will require separate agreements.`;
  footer.querySelectorAll('.page-journey').forEach(item => item.remove());
  footer.insertAdjacentHTML('afterbegin', pageJourney(file));
  for (const anchor of footer.querySelectorAll(`.footer-bottom > a[href="${brandUrl}"]`)) {
    anchor.outerHTML = strangeButTrueMarkup({ full: true });
  }

  const walker = doc.createTreeWalker(doc.body, doc.defaultView.NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!/Strange But True/i.test(node.textContent) ||
        node.parentElement.closest('script,style,.sbt-brand-link,.sbt-brand-wordmark')) continue;
    const existingLink = node.parentElement.closest('a');
    const fragment = doc.createDocumentFragment();
    const parts = node.textContent.split(/(Strange (?:But|but) True)/g);
    for (const part of parts) {
      if (/^Strange (?:But|but) True$/.test(part)) {
        const template = doc.createElement('template');
        template.innerHTML = strangeButTrueMarkup({ linked: !existingLink, middle: part.split(' ')[1] });
        fragment.append(template.content);
      } else {
        fragment.append(doc.createTextNode(part));
      }
    }
    node.replaceWith(fragment);
  }
}

