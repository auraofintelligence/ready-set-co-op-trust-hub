import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../reading.js', import.meta.url), 'utf8');

function page({ query = '', stored, speech = false } = {}) {
  const dom = new JSDOM(html, { url: `https://ready-setco.example/${query}`, runScripts: 'outside-only' });
  const window = dom.window;
  if (stored) window.localStorage.setItem('ready-setco:reading-mode', stored);
  const calls = { spoken: [], cancel: 0, pause: 0, resume: 0 };
  if (speech) {
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    window.speechSynthesis = {
      speak(utterance) { calls.spoken.push(utterance); },
      cancel() { calls.cancel++; }, pause() { calls.pause++; }, resume() { calls.resume++; },
    };
  }
  window.fetch = () => { throw new Error('Reading choices must not make network requests.'); };
  return { dom, window, doc: window.document, calls, start() { window.eval(script); } };
}

test('reading choices preserve content and fields, save only the view, and honour explicit accessible links', () => {
  const first = page();
  try {
    first.doc.querySelector('main').insertAdjacentHTML('beforeend', '<form><label>A private field<input id="private-test" value="private typed value"></label></form>');
    const original = first.doc.querySelector('main').innerHTML;
    first.start();
    assert.equal(first.window.localStorage.length, 0, 'Default view does not write storage');
    assert.equal(first.doc.querySelector('#reading-easy-toggle').hidden, false);
    first.doc.querySelector('#reading-easy-toggle').click();
    assert.equal(first.doc.documentElement.dataset.readingMode, 'easy');
    assert.equal(first.doc.querySelector('#reading-easy-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(first.doc.querySelector('#reading-standard').hidden, false);
    assert.equal(first.window.localStorage.length, 1);
    assert.equal(first.window.localStorage.getItem('ready-setco:reading-mode'), 'easy');
    assert.equal(first.doc.querySelector('main').innerHTML, original, 'Easy view keeps the same page and form');
    first.doc.querySelector('#reading-language-toggle').click();
    assert.equal(first.doc.querySelector('#translation-options').open, true);
    assert.equal(first.doc.documentElement.dataset.readingMode, 'easy', 'Translation and larger text can be used together');
    const next = page({ stored: first.window.localStorage.getItem('ready-setco:reading-mode') });
    try { next.start(); assert.equal(next.doc.documentElement.dataset.readingMode, 'easy'); } finally { next.dom.window.close(); }
    first.doc.querySelector('#reading-standard').click();
    assert.equal(first.doc.documentElement.dataset.readingMode, 'normal');
    assert.equal(first.doc.activeElement.id, 'reading-easy-toggle', 'Returning from a disappearing button restores focus');
  } finally { first.dom.window.close(); }
  const linked = page({ query: '?view=easy&interest=working_holiday' });
  try {
    linked.start();
    assert.equal(linked.doc.documentElement.dataset.readingMode, 'easy');
    assert.equal(linked.window.localStorage.getItem('ready-setco:reading-mode'), 'easy');
    assert.equal(linked.window.location.search, '?view=easy&interest=working_holiday', 'No URL rewrite or private query storage');
  } finally { linked.dom.window.close(); }
  const standardLink = page({ query: '?view=normal', stored: 'easy' });
  try { standardLink.start(); assert.equal(standardLink.doc.documentElement.dataset.readingMode, 'normal'); } finally { standardLink.dom.window.close(); }
});

test('read aloud starts only on request, excludes forms and private/status text, and supports pause, resume and stop', () => {
  const fixture = page({ speech: true });
  const { doc, calls } = fixture;
  try {
    doc.querySelector('main').insertAdjacentHTML('beforeend', '<p>PUBLIC_READING_SENTINEL</p><form><input value="PRIVATE_INPUT_SENTINEL"><textarea>PRIVATE_TEXTAREA_SENTINEL</textarea><p>PRIVATE_FORM_SENTINEL</p></form><p hidden>HIDDEN_SENTINEL</p><p role="status">PRIVATE_STATUS_SENTINEL</p><details><summary>Visible section summary</summary><p>CLOSED_SENTINEL</p></details><dialog><p>DIALOG_SENTINEL</p></dialog>');
    fixture.start();
    assert.equal(calls.spoken.length, 0);
    assert.equal(calls.cancel, 0, 'No interference with browser voices on load');
    doc.querySelector('#read-aloud-start').click();
    assert.equal(calls.spoken.length, 1);
    assert.equal(doc.querySelector('#read-aloud-start').disabled, true);
    doc.querySelector('#read-aloud-pause').click();
    assert.equal(calls.pause, 1);
    assert.equal(doc.querySelector('#read-aloud-pause').textContent, 'Resume reading');
    calls.spoken.at(-1).onend();
    assert.equal(calls.spoken.length, 1, 'No next chunk while paused');
    doc.querySelector('#read-aloud-pause').click();
    assert.equal(calls.resume, 1);
    assert.equal(calls.spoken.length, 2);
    let cursor = 1;
    while (cursor < calls.spoken.length) {
      assert.ok(cursor < 300, 'Speech has a finite number of page chunks');
      calls.spoken[cursor++].onend();
    }
    const text = calls.spoken.map(utterance => utterance.text).join(' ');
    assert.match(text, /PUBLIC_READING_SENTINEL/);
    assert.doesNotMatch(text, /PRIVATE_|HIDDEN_SENTINEL|CLOSED_SENTINEL|DIALOG_SENTINEL/);
    assert.equal(doc.querySelector('#read-aloud-status').textContent, 'Finished reading the page.');
    doc.querySelector('#read-aloud-start').click();
    const stopped = calls.spoken.at(-1);
    doc.querySelector('#read-aloud-stop').click();
    const count = calls.spoken.length;
    stopped.onend();
    assert.equal(calls.spoken.length, count, 'A late callback cannot restart stopped speech');
    assert.equal(doc.querySelector('#read-aloud-status').textContent, 'Reading stopped.');
  } finally { fixture.dom.window.close(); }
});

test('reading options remain usable when storage or a browser voice is unavailable', () => {
  const fixture = page();
  try {
    fixture.window.Storage.prototype.setItem = () => { throw new Error('Storage disabled'); };
    fixture.start();
    fixture.doc.querySelector('#reading-easy-toggle').click();
    assert.equal(fixture.doc.documentElement.dataset.readingMode, 'easy');
    assert.match(fixture.doc.querySelector('#reading-view-status').textContent, /could not save/);
    assert.equal(fixture.doc.querySelector('#read-aloud-controls').hidden, true);
    assert.equal(fixture.doc.querySelector('#read-aloud-unavailable').hidden, false);
  } finally { fixture.dom.window.close(); }
});
