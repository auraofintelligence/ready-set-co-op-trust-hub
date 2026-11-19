import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { randomUUID, randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('..', import.meta.url));
const waitFor = async (check, description) => {
  for (let tries = 0; tries < 150; tries++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out: ${description}`);
};

test('participant and organiser interfaces persist, retry, review and export through the real local API', { timeout: 30000 }, async () => {
  const dataDirectory = await mkdtemp(path.join(root, '.local', 'interface-test-'));
  const origin = `http://127.0.0.1:${randomInt(20000, 29000)}`;
  const child = spawn(process.execPath, ['scripts/local-server.mjs'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, READY_SETCO_PORT: new URL(origin).port, READY_SETCO_DATA_DIR: dataDirectory },
  });
  let output = ''; let token = ''; const windows = [];
  child.stdout.on('data', chunk => {
    output += String(chunk);
    token = /sign-in field:\r?\n([^\r\n]+)/.exec(output)?.[1] ?? '';
  });
  let serverError = '';
  child.stderr.on('data', chunk => { serverError += String(chunk); });
  const exit = new Promise(resolve => child.once('exit', resolve));
  try {
    await waitFor(() => token || child.exitCode !== null, 'local server startup');
    assert.ok(token, `Local test server failed: ${serverError}`);
    async function page(filename) {
      const dom = new JSDOM(await readFile(path.join(root, filename), 'utf8'), { url: `${origin}/${filename}`, runScripts: 'outside-only' });
      windows.push(dom.window);
      dom.window.HTMLElement.prototype.scrollIntoView = () => {};
      dom.window.crypto.randomUUID = randomUUID;
      dom.window.fetch = (url, options = {}) => {
        const headers = new Headers(options.headers);
        if (options.method && options.method !== 'GET') headers.set('Origin', origin);
        return fetch(new URL(url, origin), { ...options, headers });
      };
      await dom.window.eval(await readFile(path.join(root, 'operations-config.js'), 'utf8'));
      return dom.window;
    }
    const guest = await page('join.html');
    let loseFirstReply = true;
    const realFetch = guest.fetch;
    guest.fetch = async (...args) => {
      const response = await realFetch(...args);
      if (loseFirstReply && response.ok) { loseFirstReply = false; throw new Error('Test connection lost after saving.'); }
      return response;
    };
    guest.eval(await readFile(path.join(root, 'join.js'), 'utf8'));
    const form = guest.document.querySelector('#interest-form');
    const field = name => form.elements.namedItem(name);
    const submit = () => form.dispatchEvent(new guest.Event('submit', { bubbles: true, cancelable: true }));
    field('name').value = 'Fictional Conference Host';
    field('email').value = 'host@example.test';
    field('participantType').value = 'business';
    field('participantType').dispatchEvent(new guest.Event('change'));
    assert.equal(guest.document.querySelector('#organisation-fields').hidden, false);
    assert.equal(field('organisation').required, true);
    field('organisation').value = 'Fictional Island Events';
    field('authorityConfirmed').checked = true;
    field('consentContact').checked = true;
    submit();
    assert.match(guest.document.querySelector('#intake-status').textContent, /at least one interest/);
    form.querySelector('[name=interests][value=events]').checked = true;
    submit();
    await waitFor(() => guest.document.querySelector('#intake-status').textContent.includes('connection lost'), 'lost response displayed truthfully');
    assert.equal(guest.document.querySelector('#send-interest').disabled, false);
    submit();
    await waitFor(() => guest.document.querySelector('#intake-status').dataset.kind === 'success', 'confirmed receipt');
    assert.match(guest.document.querySelector('#intake-status').textContent, /Fictional Conference Host/);
    assert.equal(guest.document.querySelector('#send-interest').disabled, true);
    assert.equal(guest.document.querySelector('#download-receipt').hidden, false);
    assert.equal(guest.localStorage.length, 0, 'No contact details in localStorage');
    assert.equal(guest.sessionStorage.length, 0, 'No contact details in sessionStorage');

    const unauthenticated = await fetch(`${origin}/api/admin/participants`);
    assert.equal(unauthenticated.status, 401);
    const organiser = await page('manage.html');
    organiser.eval(await readFile(path.join(root, 'manage.js'), 'utf8'));
    const login = organiser.document.querySelector('#local-login-form');
    login.elements.namedItem('token').value = token;
    login.dispatchEvent(new organiser.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => organiser.document.querySelector('#review-count').textContent.includes('1 matching record'), 'private list');
    assert.equal(login.elements.namedItem('token').value, '', 'Token cleared from input');
    const recordButton = organiser.document.querySelector('#participants button');
    assert.equal(recordButton.textContent, 'Fictional Conference Host');
    recordButton.click();
    const review = organiser.document.querySelector('#participant-review');
    review.elements.namedItem('status').value = 'pilot_partner';
    review.elements.namedItem('notes').value = 'Fictional pilot discussion recorded for interface test.';
    review.dispatchEvent(new organiser.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => organiser.document.querySelector('#review-status').textContent.includes('Review saved'), 'saved organiser review');
    const privateExport = await (await fetch(`${origin}/api/admin/export`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal(privateExport.participants.length, 1, 'Lost response retry creates no duplicate');
    assert.equal(privateExport.participants[0].status, 'pilot_partner');
    assert.equal(privateExport.participants[0].initialOperatingEntityId, 'sbt');
    assert.equal(privateExport.participants[0].consentFutureHandover, false, 'Optional consent remains off by default');
    assert.equal(privateExport.auditEvents.length, 2, 'One intake and one review audit event');
    assert.equal(organiser.localStorage.length, 0, 'No admin token/records in localStorage');
    assert.equal(organiser.sessionStorage.length, 0, 'No admin token/records in sessionStorage');
  } finally {
    for (const window of windows) window.close();
    child.kill('SIGTERM');
    await exit;
    const relative = path.relative(path.join(root, '.local'), dataDirectory);
    if (!relative.startsWith('..') && path.basename(dataDirectory).startsWith('interface-test-')) await rm(dataDirectory, { recursive: true, force: true });
  }
});
