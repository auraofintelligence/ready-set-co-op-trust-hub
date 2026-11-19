(() => {
  const panel = document.querySelector('.reading-panel');
  if (!panel) return;
  const root = document.documentElement;
  const easyButton = panel.querySelector('#reading-easy-toggle');
  const standardButton = panel.querySelector('#reading-standard');
  const languageButton = panel.querySelector('#reading-language-toggle');
  const languages = panel.querySelector('#translation-options');
  const viewStatus = panel.querySelector('#reading-view-status');
  const storageKey = 'ready-setco:reading-mode';
  let mode = 'normal';

  function setView(value, { save = true, announce = true } = {}) {
    mode = value === 'easy' ? 'easy' : 'normal';
    root.dataset.readingMode = mode;
    easyButton.setAttribute('aria-pressed', String(mode === 'easy'));
    easyButton.querySelector('.reading-current').hidden = mode !== 'easy';
    standardButton.hidden = mode !== 'easy';
    let saved = true;
    if (save) {
      try { localStorage.setItem(storageKey, mode); } catch { saved = false; }
    }
    if (announce) {
      viewStatus.textContent = mode === 'easy' ? 'Larger text and high contrast are on.' : 'Standard view is on.';
      if (!saved) viewStatus.textContent += ' This browser could not save the choice for other pages.';
    }
    document.dispatchEvent(new CustomEvent('readysetco:readingmode', { detail: { mode } }));
    // Leaflet and other responsive widgets listen for the normal resize event.
    window.dispatchEvent(new Event('resize'));
  }

  try { mode = localStorage.getItem(storageKey) === 'easy' ? 'easy' : 'normal'; } catch { /* The current page still works without storage. */ }
  const requestedView = new URLSearchParams(location.search).get('view');
  const explicitView = requestedView === 'easy' || requestedView === 'normal';
  if (explicitView) mode = requestedView;
  setView(mode, { save: explicitView, announce: false });
  easyButton.hidden = false;
  standardButton.addEventListener('click', () => {
    setView('normal');
    easyButton.focus();
  });
  easyButton.addEventListener('click', () => setView(mode === 'easy' ? 'normal' : 'easy'));

  if (languageButton && languages) {
    panel.classList.add('reading-enhanced');
    languageButton.hidden = false;
    languageButton.addEventListener('click', () => { languages.open = !languages.open; });
    languages.addEventListener('toggle', () => {
      languageButton.setAttribute('aria-expanded', String(languages.open));
      if (!languages.open && languages.contains(document.activeElement)) languageButton.focus();
    });
  }

  const speechControls = panel.querySelector('#read-aloud-controls');
  const unavailable = panel.querySelector('#read-aloud-unavailable');
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
  speechControls.hidden = false;
  unavailable.hidden = true;
  const engine = window.speechSynthesis;
  const start = panel.querySelector('#read-aloud-start');
  const pause = panel.querySelector('#read-aloud-pause');
  const stop = panel.querySelector('#read-aloud-stop');
  const status = panel.querySelector('#read-aloud-status');
  let state = 'idle';
  let session = 0;
  let chunks = [];
  let position = 0;
  let waitingForResume = false;
  let currentUtterance;

  function updateControls() {
    start.disabled = state !== 'idle';
    pause.disabled = state === 'idle';
    pause.textContent = state === 'paused' ? 'Resume reading' : 'Pause reading';
    stop.disabled = state === 'idle';
  }

  function publicText() {
    const main = document.querySelector('main');
    if (!main) return [];
    const copy = main.cloneNode(true);
    copy.querySelectorAll('form,dialog,input,textarea,select,button,script,style,noscript,nav,svg,[hidden],[inert],[aria-hidden="true"],[role="status"],[aria-live],[data-no-read-aloud],.leaflet-container,.map-category-scroll').forEach(item => item.remove());
    for (const details of copy.querySelectorAll('details:not([open])')) {
      for (const child of [...details.children]) if (child.tagName !== 'SUMMARY') child.remove();
    }
    const blocks = [...copy.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,dt,dd,figcaption,summary')]
      .filter(item => !item.parentElement.closest('li,dt,dd,figcaption,summary'));
    const result = [];
    for (const block of blocks) {
      const text = block.textContent.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      let chunk = '';
      for (const word of text.split(' ')) {
        if (chunk && chunk.length + word.length + 1 > 240) { result.push(chunk); chunk = ''; }
        chunk += `${chunk ? ' ' : ''}${word}`;
      }
      if (chunk) result.push(chunk);
    }
    return result;
  }

  function finish(message) {
    state = 'idle';
    currentUtterance = undefined;
    waitingForResume = false;
    status.textContent = message;
    updateControls();
  }

  function speakNext(id) {
    if (id !== session) return;
    if (position >= chunks.length) { finish('Finished reading the page.'); return; }
    currentUtterance = new SpeechSynthesisUtterance(chunks[position]);
    currentUtterance.lang = document.documentElement.lang || 'en-AU';
    currentUtterance.onend = () => {
      if (id !== session) return;
      position++;
      if (state === 'paused') waitingForResume = true;
      else speakNext(id);
    };
    currentUtterance.onerror = () => {
      if (id !== session) return;
      session++;
      finish('Read aloud could not continue. Try again or use your browser’s reading tools.');
    };
    engine.speak(currentUtterance);
  }

  start.addEventListener('click', () => {
    if (state !== 'idle') return;
    chunks = publicText();
    if (!chunks.length) { status.textContent = 'There is no public page text to read.'; return; }
    session++;
    position = 0;
    waitingForResume = false;
    engine.cancel();
    state = 'playing';
    status.textContent = 'Reading the public page text.';
    updateControls();
    speakNext(session);
  });
  pause.addEventListener('click', () => {
    if (state === 'playing') {
      engine.pause(); state = 'paused'; status.textContent = 'Reading paused.';
    } else if (state === 'paused') {
      state = 'playing';
      engine.resume();
      if (waitingForResume) { waitingForResume = false; speakNext(session); }
      status.textContent = 'Reading resumed.';
    }
    updateControls();
  });
  stop.addEventListener('click', () => {
    session++;
    engine.cancel();
    finish('Reading stopped.');
  });
  window.addEventListener('pagehide', () => {
    if (state !== 'idle') { session++; engine.cancel(); }
  });
  updateControls();
})();
