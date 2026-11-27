import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { randomUUID, randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('..', import.meta.url));
async function waitFor(check, description, diagnostic = () => '') {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out: ${description}${diagnostic() ? ` (${diagnostic()})` : ''}`);
}

// Local-server startup rebuilds the shared public bundle. Run the full suite
// with --test-concurrency=1 so the two real interface servers build in sequence.
test('map contributor and organiser interfaces retry, publish, correct and archive through real SQLite HTTP APIs', { timeout: 30000 }, async () => {
  await mkdir(path.join(root, '.local'), { recursive: true });
  const dataDirectory = await mkdtemp(path.join(root, '.local', 'map-interface-test-'));
  const origin = `http://127.0.0.1:${randomInt(30000, 39000)}`;
  const child = spawn(process.execPath, ['scripts/local-server.mjs'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, READY_SETCO_PORT: new URL(origin).port, READY_SETCO_DATA_DIR: dataDirectory },
  });
  let output = ''; let token = ''; let serverError = ''; let networkError = '';
  const windows = []; const exit = new Promise(resolve => child.once('exit', resolve));
  child.stdout.on('data', chunk => { output += String(chunk); token = /sign-in field:\r?\n([^\r\n]+)/.exec(output)?.[1] ?? ''; });
  child.stderr.on('data', chunk => { serverError += String(chunk); });
  function submit(window, form) { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); }
  async function privateMap() {
    const response = await fetch(`${origin}/api/admin/map/export`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200); return response.json();
  }
  async function publicMap() { return (await fetch(`${origin}/api/map/places`)).json(); }
  async function page(filename) {
    const dom = new JSDOM(await readFile(path.join(root, filename), 'utf8'), { url: `${origin}/${filename}`, runScripts: 'outside-only' });
    const window = dom.window; windows.push(window);
    window.crypto.randomUUID = randomUUID; window.AbortController = AbortController;
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    if (window.HTMLDialogElement) {
      window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
      window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
    }
    window.URL.createObjectURL = () => 'blob:fictional-interface-download'; window.URL.revokeObjectURL = () => {};
    window.fetch = (url, options = {}) => {
      const headers = new Headers(options.headers);
      if (options.method && options.method !== 'GET') headers.set('Origin', origin);
      return fetch(new URL(url, origin), { ...options, headers }).catch(error => {
        networkError = `${error.message}; ${error.cause?.code || error.cause?.message || 'no additional network detail'}`;
        throw error;
      });
    };
    window.eval(await readFile(path.join(root, 'operations-config.js'), 'utf8'));
    if (filename === 'map.html') window.eval(await readFile(path.join(root, 'map-icons.js'), 'utf8'));
    return window;
  }
  async function mapPage() {
    const window = await page('map.html'); window.eval(await readFile(path.join(root, 'map.js'), 'utf8')); return window;
  }
  try {
    await waitFor(() => token || child.exitCode !== null, 'local server startup');
    assert.ok(token, `The isolated local map server could not start: ${serverError}`);
    const guest = await page('map.html'); const posted = [];
    let firstSaved = false; let releaseFirstReply; let loseFirstReply = true; let reference;
    const realGuestFetch = guest.fetch;
    guest.fetch = async (url, options = {}) => {
      const isSubmission = new URL(url, origin).pathname === '/api/map/suggestions' && options.method === 'POST';
      if (isSubmission) posted.push(JSON.parse(options.body));
      const response = await realGuestFetch(url, options);
      if (isSubmission && loseFirstReply && response.ok) {
        loseFirstReply = false; reference = (await response.clone().json()).reference;
        firstSaved = true; await new Promise(resolve => { releaseFirstReply = resolve; });
        throw new Error('Fictional connection lost after saving.');
      }
      return response;
    };
    guest.eval(await readFile(path.join(root, 'map.js'), 'utf8'));
    guest.document.querySelector('#add-detailed-place').click();
    const form = guest.document.querySelector('#place-form'); const field = name => form.elements.namedItem(name);
    field('name').value = 'Fictional unmarked bus stop'; field('category').value = 'bus_stop';
    field('category').dispatchEvent(new guest.Event('change'));
    assert.equal(guest.document.querySelector('#bus-stop-fields').hidden, false);
    const chooseIcon = (window, except = '') => {
      const grid = window.document.querySelector('#icon-picker-grid');
      assert.ok(grid, 'The place form offers the icon library');
      if (window.document.querySelector('#icon-chooser')?.hidden) window.document.querySelector('#choose-icon').click();
      const details = grid.closest('details'); if (details && !details.open) details.querySelector('summary').click();
      const group = window.document.querySelector('#icon-group'); group.selectedIndex = 0; group.dispatchEvent(new window.Event('change'));
      const choices = [...grid.querySelectorAll('button[data-icon-id]')].filter(button => button.dataset.iconId && button.dataset.iconId !== except);
      assert.ok(choices.length, 'A contributor can choose a catalog icon');
      choices[0].click();
      assert.equal(window.document.querySelector('#place-icon').value, choices[0].dataset.iconId);
      return choices[0].dataset.iconId;
    };
    const firstIcon = chooseIcon(guest);
    field('stopMarking').value = 'unmarked'; field('latitude').value = '-27.45'; field('longitude').value = '153.42';
    field('locationDescription').value = 'Fictional test roadside landmark.';
    field('description').value = 'Fictional local map test information.'; field('observedOn').value = '2026-11-18';
    form.querySelector('[name=facilities][value=shelter]').checked = true;
    assert.equal(field('publicationConsent').required, true); assert.equal(field('publicationConsent').checked, false);
    submit(guest, form);
    assert.equal(posted.length, 0, 'Unchecked public sharing choice prevents sending');
    field('publicationConsent').checked = true; submit(guest, form);
    await waitFor(() => firstSaved, 'first suggestion persisted before simulated lost response', () => `status: ${guest.document.querySelector('#suggestion-status').textContent}; network: ${networkError || 'none'}`);
    assert.ok([...form.querySelectorAll('input,select,textarea,button')].every(control => control.disabled), 'The in-flight payload cannot be edited from the form');
    assert.equal(guest.document.querySelector('#close-place-dialog').disabled, true);
    const cancel = new guest.Event('cancel', { cancelable: true }); guest.document.querySelector('#place-dialog').dispatchEvent(cancel);
    assert.equal(cancel.defaultPrevented, true, 'Escape cannot discard an in-flight submission');
    releaseFirstReply();
    await waitFor(() => guest.document.querySelector('#suggestion-status').textContent.includes('connection lost'), 'lost reply is shown truthfully');
    assert.equal(guest.document.querySelector('#submit-place').disabled, false);
    assert.equal(guest.document.querySelector('#close-place-dialog').disabled, false);
    submit(guest, form);
    await waitFor(() => guest.document.querySelector('#suggestion-status').dataset.kind === 'success', 'retry confirms the saved suggestion');
    assert.equal(posted.length, 2); assert.deepEqual(posted[1], posted[0], 'Retry preserves the exact submission UUID and content');
    assert.match(guest.document.querySelector('#suggestion-status').textContent, /awaiting review/);
    const pending = await privateMap(); assert.equal(pending.suggestions.length, 1); assert.equal(pending.suggestions[0].id, reference);
    assert.equal(pending.suggestions[0].status, 'pending'); assert.equal(pending.suggestions[0].data.stopMarking, 'unmarked');
    assert.equal(posted[0].iconId, firstIcon, 'The selected icon is included in the unchanged retry payload');
    assert.equal(pending.suggestions[0].data.iconId, firstIcon, 'The private review record retains the selected icon');
    assert.equal((await publicMap()).features.length, 0, 'A saved suggestion is not published automatically');

    const organiser = await page('manage.html'); organiser.eval(await readFile(path.join(root, 'manage.js'), 'utf8'));
    const login = organiser.document.querySelector('#local-login-form'); login.elements.namedItem('token').value = token; submit(organiser, login);
    await waitFor(() => organiser.document.querySelector('#map-review-count').textContent.includes('1 matching suggestion'), 'organiser map queue unlocks', () => organiser.document.querySelector('#map-review-status').textContent);
    assert.equal(login.elements.namedItem('token').value, '', 'The sign-in input is cleared');
    organiser.document.querySelector('#map-queue-list button').click();
    assert.match(organiser.document.querySelector('#map-suggestion-summary').textContent, /unmarked/);
    const decision = organiser.document.querySelector('#map-review-decision'); decision.elements.namedItem('notes').value = 'Fictional private review note one.';
    submit(organiser, decision);
    await waitFor(() => organiser.document.querySelector('#map-review-count').textContent.includes('0 matching suggestions'), 'first suggestion published and queue refreshed');
    await waitFor(() => organiser.document.querySelector('#map-archive-form select').options.length === 2, 'published place appears in organiser controls');
    const firstPublished = await publicMap(); assert.equal(firstPublished.features.length, 1);
    const stableId = firstPublished.features[0].id; assert.equal(firstPublished.features[0].properties.version, 1);
    assert.equal(firstPublished.features[0].properties.iconId, firstIcon, 'The published GeoJSON retains the chosen icon');

    const reader = await mapPage();
    await waitFor(() => reader.document.querySelector('#place-list button'), 'published place renders in a fresh public map');
    assert.match(reader.document.querySelector('#place-list button').textContent, /Fictional unmarked bus stop/);
    reader.document.querySelector('#place-list button').click();
    assert.equal(reader.document.querySelector('#place-detail-title').textContent, 'Fictional unmarked bus stop');
    assert.match(reader.document.querySelector('#place-detail-facts').textContent, /Unmarked/);
    reader.document.querySelector('#correct-place').click();
    const correctionForm = reader.document.querySelector('#place-form'); const correctionField = name => correctionForm.elements.namedItem(name);
    assert.equal(correctionField('name').value, 'Fictional unmarked bus stop'); assert.equal(correctionField('stopMarking').value, 'unmarked');
    assert.equal(correctionField('iconId').value, firstIcon, 'A correction starts with the published icon');
    assert.equal(correctionField('publicationConsent').checked, false, 'A correction requires its own public sharing choice');
    const secondIcon = chooseIcon(reader, firstIcon);
    correctionField('name').value = 'Fictional corrected unmarked bus stop'; correctionField('latitude').value = '-27.450125';
    correctionField('publicationConsent').checked = true; submit(reader, correctionForm);
    await waitFor(() => reader.document.querySelector('#suggestion-status').dataset.kind === 'success', 'correction saved for review');
    const beforeSecondReview = await privateMap(); const correction = beforeSecondReview.suggestions.find(item => item.status === 'pending');
    assert.equal(correction.placeId, stableId); assert.equal(correction.baseVersion, 1);
    assert.equal(correction.data.name, 'Fictional corrected unmarked bus stop');
    assert.equal(correction.data.iconId, secondIcon);
    submit(organiser, organiser.document.querySelector('#map-review-filter'));
    await waitFor(() => organiser.document.querySelector('#map-review-count').textContent.includes('1 matching suggestion'), 'correction appears in organiser queue');
    organiser.document.querySelector('#map-queue-list button').click();
    assert.match(organiser.document.querySelector('#map-suggestion-summary').textContent, /Correction to an existing place/);
    decision.elements.namedItem('notes').value = 'Fictional private review note two.'; submit(organiser, decision);
    await waitFor(() => organiser.document.querySelector('#map-review-count').textContent.includes('0 matching suggestions'), 'correction published');
    await waitFor(() => organiser.document.querySelector('#map-archive-form select').textContent.includes('Fictional corrected unmarked bus stop'), 'corrected place controls refreshed');
    const corrected = await publicMap(); assert.equal(corrected.features.length, 1); assert.equal(corrected.features[0].id, stableId);
    assert.equal(corrected.features[0].properties.version, 2); assert.equal(corrected.features[0].properties.latitude, -27.450125);
    assert.equal(corrected.features[0].properties.iconId, secondIcon, 'Publishing the correction updates the icon without changing the place identity');
    const publicText = JSON.stringify(corrected); assert.ok(!publicText.includes('Fictional private review')); assert.ok(!publicText.includes('local-development'));
    const secondReader = await mapPage();
    await waitFor(() => secondReader.document.querySelector('#place-list button')?.textContent.includes('Fictional corrected unmarked bus stop'), 'fresh public map renders the correction');
    const history = await privateMap(); assert.equal(history.revisions.length, 2);
    assert.equal(history.revisions[0].data.name, 'Fictional unmarked bus stop'); assert.equal(history.revisions[1].data.name, 'Fictional corrected unmarked bus stop');
    assert.equal(history.revisions[0].data.iconId, firstIcon); assert.equal(history.revisions[1].data.iconId, secondIcon);

    const archive = organiser.document.querySelector('#map-archive-form'); archive.elements.namedItem('place').value = stableId;
    archive.elements.namedItem('reason').value = 'Fictional integration removal.'; submit(organiser, archive);
    await waitFor(() => organiser.document.querySelector('#map-review-status').textContent.includes('Removed from the public map'), 'organiser archives the place');
    assert.equal((await publicMap()).features.length, 0);
    const finalData = await privateMap(); assert.equal(finalData.places[0].status, 'archived'); assert.equal(finalData.places[0].properties.version, 3);
    assert.equal(finalData.revisions.length, 3); assert.equal(finalData.auditEvents.length, 5, 'Retries added no duplicate audit event');
    const quickGuest = await mapPage();
    const canvas = quickGuest.document.querySelector('#map-canvas');
    Object.defineProperties(canvas, { clientWidth: { get: () => 640 }, clientHeight: { get: () => 480 } });
    quickGuest.SVGSVGElement.prototype.createSVGRect = () => ({});
    quickGuest.requestAnimationFrame = callback => quickGuest.setTimeout(() => callback(Date.now()), 0);
    quickGuest.eval(await readFile(path.join(root, 'assets/vendor/leaflet/leaflet.js'), 'utf8'));
    quickGuest.L.Browser.any3d = true;
    let quickMap; const createMap = quickGuest.L.map;
    quickGuest.L.map = (...args) => { quickMap = createMap(...args); return quickMap; };
    let quickReceipt; let quickPayload;
    const realQuickFetch = quickGuest.fetch;
    quickGuest.fetch = async (url, options = {}) => {
      const response = await realQuickFetch(url, options);
      if (new URL(url, origin).pathname === '/api/map/suggestions' && options.method === 'POST') {
        quickPayload = JSON.parse(options.body); quickReceipt = await response.clone().json();
      }
      return response;
    };
    quickGuest.document.querySelector('#add-place').click();
    assert.ok(quickMap, 'Drop a pin loads the map when needed');
    quickMap.fire('click', { latlng: quickGuest.L.latLng(-27.46, 153.43) });
    assert.equal(quickGuest.document.querySelector('#place-dialog').open, false);
    assert.equal(quickGuest.document.querySelector('#quick-pin').hidden, false);
    assert.equal(quickGuest.document.querySelector('#quick-pin-name').value, '');
    submit(quickGuest, quickGuest.document.querySelector('#quick-pin-form'));
    await waitFor(() => quickReceipt?.status === 'received' && quickGuest.document.querySelector('#map-status').dataset.reference === quickReceipt.reference, 'blank quick pin receives a durable save confirmation');
    assert.equal(quickGuest.document.querySelector('#quick-pin').hidden, true);
    assert.equal(quickPayload.entryMode, 'quick_pin');
    for (const absent of ['category', 'iconId', 'sourceType']) assert.equal(quickPayload[absent], undefined, 'A blank quick pin does not invent ' + absent);
    const quickPending = (await privateMap()).suggestions.find(item => item.id === quickReceipt.reference);
    assert.ok(quickPending); assert.equal(quickPending.status, 'pending');
    assert.equal(quickPending.data.name, 'Unnamed pin');
    assert.equal(quickPending.data.category, 'other');
    assert.equal(quickPending.data.sourceType, 'map_pin');
    assert.equal((await publicMap()).features.length, 0, 'Quick pins also await human publication review');
    submit(organiser, organiser.document.querySelector('#map-review-filter'));
    await waitFor(() => organiser.document.querySelector('#map-review-count').textContent.includes('1 matching suggestion'), 'quick pin appears for human review');
    organiser.document.querySelector('#map-queue-list button').click();
    submit(organiser, decision);
    await waitFor(() => organiser.document.querySelector('#map-review-count').textContent.includes('0 matching suggestions'), 'quick pin published by its reviewer');
    const quickPublished = await publicMap();
    assert.equal(quickPublished.features.length, 1);
    assert.equal(quickPublished.features[0].properties.name, 'Unnamed pin');
    assert.equal(quickPublished.features[0].properties.sourceType, 'map_pin');
    assert.deepEqual(quickPublished.features[0].geometry.coordinates, [153.43, -27.46]);
    const quickReader = await mapPage();
    await waitFor(() => quickReader.document.querySelector('#place-list button')?.textContent.includes('Unnamed pin'), 'a published quick pin can be revisited');
    quickReader.document.querySelector('#place-list button').click();
    quickReader.document.querySelector('#correct-place').click();
    assert.equal(quickReader.document.querySelector('#place-form').elements.namedItem('sourceType').value, 'map_pin', 'An optional detailed correction preserves the original pin-only source');
    assert.equal(quickReader.document.querySelector('#place-form').elements.namedItem('publicationConsent').checked, false);
    for (const window of windows) { assert.equal(window.localStorage.length, 0); assert.equal(window.sessionStorage.length, 0); }
  } finally {
    for (const window of windows) window.close();
    child.kill('SIGTERM'); await exit;
    const resolved = path.resolve(dataDirectory); const allowedParent = path.resolve(root, '.local');
    if (path.dirname(resolved) === allowedParent && path.basename(resolved).startsWith('map-interface-test-')) await rm(resolved, { recursive: true, force: true });
  }
});

