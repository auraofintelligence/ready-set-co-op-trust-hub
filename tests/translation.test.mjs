import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const script = await readFile(new URL('../translation.js', import.meta.url), 'utf8');

function page(path) {
  const dom = new JSDOM('<div id="translation-controls"></div><form><input name="email" value="private@example.invalid"><textarea name="offer">Private draft</textarea></form>', {
    url: `https://ready-setco.example${path}`, runScripts: 'outside-only'
  });
  dom.window.fetch = () => { throw new Error('Translation must not make automatic requests'); };
  dom.window.eval(script);
  return dom;
}
function choose(dom, code) {
  const select = dom.window.document.querySelector('#translation-language');
  select.value = code;
  select.dispatchEvent(new dom.window.Event('change'));
  return dom.window.document.querySelector('.translation-actions .button');
}

test('public translation links use only a fixed public page, excluding queries, fragments and form drafts', () => {
  const dom = page('/about.html?email=secret@example.invalid#private-draft');
  try {
    const document = dom.window.document;
    assert.equal(document.querySelector('.translation-actions .button').hidden, true);
    const link = choose(dom, 'fr');
    const target = new URL(link.href);
    assert.equal(target.origin, 'https://translate.google.com');
    assert.equal(target.searchParams.get('tl'), 'fr');
    assert.equal(target.searchParams.get('u'), 'https://ready-setco.auraofintelligence.workers.dev/about.html');
    assert.equal(link.target, '_blank');
    assert.equal(link.referrerPolicy, 'no-referrer');
    assert.doesNotMatch(link.href, /secret|private|draft|email/);
    assert.equal(document.querySelector('iframe,script[src],img[src]'), null);
    assert.equal(document.querySelector('[name=email]').value, 'private@example.invalid');
    assert.equal(document.querySelector('[name=offer]').value, 'Private draft');
    assert.match(document.querySelector('option[value="ja"]').textContent, /日本語/);
  } finally { dom.window.close(); }
});

test('enquiry and map pages offer browser help without proxying a form or reading its values', () => {
  for (const file of ['join.html', 'map.html']) {
    const dom = page(`/${file}?interest=working_holiday#form`);
    try {
      const link = choose(dom, 'de');
      const target = new URL(link.href);
      assert.equal(target.origin, 'https://support.google.com');
      assert.equal(target.searchParams.get('hl'), 'de');
      assert.equal(target.searchParams.has('u'), false);
      assert.match(dom.window.document.querySelector('.translation-browser-help').textContent, /Originalwebsite/);
      assert.equal(new URL(choose(dom, 'other').href).origin, 'https://support.google.com');
      assert.equal(dom.window.document.querySelector('[name=email]').value, 'private@example.invalid');
    } finally { dom.window.close(); }
  }
});

test('private organiser routes and APIs never gain translation controls', () => {
  for (const path of ['/manage.html', '/manage', '/manage/', '/api/admin/export']) {
    const dom = page(path);
    try { assert.equal(dom.window.document.querySelector('#translation-controls').childElementCount, 0); }
    finally { dom.window.close(); }
  }
});

for (const [file, formId] of [['join', 'interest-form'], ['map', 'place-form']]) {
  test(`${file} reached through Google translation hides and disables its form before any request`, async () => {
    const dom = new JSDOM(await readFile(new URL(`../${file}.html`, import.meta.url), 'utf8'), {
      url: `https://ready--setco-auraofintelligence-workers-dev.translate.goog/${file}.html?_x_tr_tl=fr`,
      runScripts: 'outside-only'
    });
    try {
      let requests = 0;
      dom.window.fetch = () => { requests++; throw new Error('Translated form must not make requests'); };
      const form = dom.window.document.getElementById(formId);
      const input = form.querySelector('input:not([type=checkbox])');
      input.value = 'Private unsent draft';
      dom.window.eval(await readFile(new URL(`../${file}.js`, import.meta.url), 'utf8'));
      assert.equal(form.hidden, true);
      assert.equal([...form.elements].every(control => control.disabled), true);
      const submit = new dom.window.Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submit);
      assert.equal(submit.defaultPrevented, true);
      assert.equal(requests, 0);
      assert.equal(input.value, 'Private unsent draft');
      const notice = dom.window.document.querySelector('.translated-form-notice');
      assert.ok(notice.querySelector('h2'));
      assert.equal(notice.querySelector('a').href, `https://ready-setco.auraofintelligence.workers.dev/${file}.html`);
      assert.equal(notice.querySelector('a').target, '_blank');
    } finally { dom.window.close(); }
  });
}
