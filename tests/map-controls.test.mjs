import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';

const point = {
  type: 'Feature', id: 'fictional-map-control-place',
  geometry: { type: 'Point', coordinates: [153.42, -27.45] },
  properties: {
    id: 'fictional-map-control-place', version: 1, name: 'Fictional map control test place',
    category: 'bus_stop', description: 'Fictional interface fixture, never published.',
    sourceType: 'firsthand', access: 'public', wheelchair: 'unknown', facilities: [], stopMarking: 'unmarked',
  },
};
const gps = { coords: { latitude: -28.12345, longitude: 154.87654, accuracy: 24 } };
const settle = () => new Promise(resolve => setImmediate(resolve));

async function fixture(t) {
  const [html, leaflet, icons, application] = await Promise.all([
    readFile(new URL('../map.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/vendor/leaflet/leaflet.js', import.meta.url), 'utf8'),
    readFile(new URL('../map-icons.js', import.meta.url), 'utf8'),
    readFile(new URL('../map.js', import.meta.url), 'utf8'),
  ]);
  const dom = new JSDOM(html, { url: 'https://ready-setco.example/map.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const window = dom.window, document = window.document, calls = [], positionRequests = [], maps = [];
  t.after(() => window.close());
  window.crypto.randomUUID = randomUUID;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.SVGSVGElement.prototype.createSVGRect = () => ({});
  if (window.HTMLDialogElement) {
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  }
  const canvas = document.querySelector('#map-canvas');
  const size = { width: 640, height: 480 };
  Object.defineProperties(canvas, { clientWidth: { get: () => size.width }, clientHeight: { get: () => size.height } });
  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition(success, error, options) { positionRequests.push({ success, error, options }); } },
  });
  window.fetch = async (input, options = {}) => {
    const url = new URL(input, window.location.href);
    calls.push({ url: url.href, method: options.method ?? 'GET', body: options.body });
    assert.equal(url.pathname, '/api/map/places', 'Viewing controls only read the local place collection');
    return { ok: true, json: async () => structuredClone({ type: 'FeatureCollection', features: [point], metadata: { total: 1, limit: 200, offset: 0, hasMore: false } }) };
  };
  window.eval(leaflet);
  // Match the CSS-transform support of the phone and desktop browsers we ship to.
  window.L.Browser.any3d = true;
  const createMap = window.L.map;
  window.L.map = (...args) => { const map = createMap(...args); maps.push(map); return map; };
  window.eval(icons);
  window.eval(application);
  await settle();
  const click = id => { const target = document.getElementById(id); assert.ok(target, `Missing ${id} control`); target.click(); };
  const formValues = () => Array.from(new window.FormData(document.querySelector('#place-form')));
  const allLayers = map => { const layers = []; map.eachLayer(layer => layers.push(layer)); return layers; };
  return { window, document, calls, positionRequests, maps, click, formValues, allLayers, size };
}

function pickIcon(f) {
  const grid = f.document.querySelector('#icon-picker-grid');
  assert.ok(grid, 'The place form includes the icon library');
  if (f.document.querySelector('#icon-chooser')?.hidden) f.click('choose-icon');
  const disclosure = grid.closest('details');
  if (disclosure && !disclosure.open) disclosure.querySelector('summary').click();
  const group = f.document.querySelector('#icon-group');
  group.selectedIndex = 0; group.dispatchEvent(new f.window.Event('change'));
  const search = f.document.querySelector('#icon-search');
  search.value = ''; search.dispatchEvent(new f.window.Event('input'));
  const options = [...grid.querySelectorAll('button[data-icon-id]')].filter(button => button.dataset.iconId);
  assert.ok(options.length >= 40, 'The library offers a useful range of named icons');
  const selected = options[0]; selected.click();
  assert.equal(f.document.querySelector('#place-icon').value, selected.dataset.iconId);
  assert.equal([...grid.querySelectorAll('button[data-icon-id]')].find(button => button.dataset.iconId === selected.dataset.iconId)?.getAttribute('aria-pressed'), 'true');
  assert.equal(f.document.querySelector('#icon-chooser').hidden, true, 'Choosing an icon returns to the concise place form');
  return selected.dataset.iconId;
}

test('an empty-map click offers a zero-typing pin, with details optional and no keyboard focus', async t => {
  const f = await fixture(t); f.click('load-map');
  f.maps[0].fire('click', { latlng: f.window.L.latLng(-27.47321, 153.48123) });
  const card = f.document.querySelector('#quick-pin'), name = f.document.querySelector('#quick-pin-name');
  assert.equal(card.hidden, false);
  assert.ok(f.document.querySelector('#map-stage').contains(card));
  assert.equal(f.document.querySelector('#place-dialog').open, false);
  assert.equal(name.required, false);
  assert.equal(name.hasAttribute('autofocus'), false);
  assert.notEqual(f.document.activeElement, name);
  assert.equal(card.querySelectorAll('select,input[type="checkbox"]').length, 0, 'The quick card does not require category, icon or consent checkbox choices');
  assert.match(card.textContent, /public|shar/i); assert.match(card.textContent, /review/i);
  assert.equal(f.document.querySelector('#send-quick-pin').textContent.trim(), 'Send pin');
  const permissionNote = f.document.getElementById(f.document.querySelector('#send-quick-pin').getAttribute('aria-describedby'));
  assert.ok(permissionNote && /public/.test(permissionNote.textContent), 'The send action describes its public-map purpose to assistive readers');
  f.click('close-quick-pin');
  assert.equal(card.hidden, true); assert.equal(f.document.querySelector('#place-dialog').open, false);
  f.maps[0].fire('click', { latlng: f.window.L.latLng(-27.47321, 153.48123) });
  name.value = 'Fictional optional pin name';
  f.click('quick-pin-details');
  const form = f.document.querySelector('#place-form');
  assert.equal(form.elements.namedItem('name').value, 'Fictional optional pin name');
  assert.equal(Number(form.elements.namedItem('latitude').value), -27.47321);
  assert.equal(Number(form.elements.namedItem('longitude').value), 153.48123);
  assert.equal(form.elements.namedItem('publicationConsent').checked, false, 'The optional detailed form retains its own sharing choice');
});

test('a blank quick pin sends only its position and chosen sharing, with safe repeat and uncertain-reply handling', async t => {
  const f = await fixture(t); f.click('load-map');
  f.maps[0].fire('click', { latlng: f.window.L.latLng(-27.47321, 153.48123) });
  const quickForm = f.document.querySelector('#quick-pin-form'), card = f.document.querySelector('#quick-pin');
  const requests = []; let rejectFirst;
  const originalFetch = f.window.fetch;
  f.window.fetch = async (input, options = {}) => {
    const url = new URL(input, f.window.location.href);
    if (url.pathname !== '/api/map/suggestions') return originalFetch(input, options);
    assert.equal(options.method, 'POST'); requests.push(JSON.parse(options.body));
    if (requests.length === 1) return new Promise((resolve, reject) => { rejectFirst = reject; });
    return { ok: true, json: async () => ({ status: 'received', reference: 'fictional-quick-pin-receipt', duplicate: true }) };
  };
  const submit = () => quickForm.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
  submit(); submit();
  assert.equal(requests.length, 1, 'Repeated taps cannot send another request while a pin is saving');
  assert.equal(f.document.querySelector('#send-quick-pin').disabled, true);
  const first = requests[0];
  const allowed = new Set(['entryMode', 'submissionId', 'name', 'latitude', 'longitude', 'publicationConsent', 'consentVersion']);
  assert.ok(Object.keys(first).every(key => allowed.has(key)));
  assert.equal(first.entryMode, 'quick_pin');
  assert.match(first.submissionId, /^[0-9a-f-]{36}$/i);
  assert.equal(first.name ?? '', '');
  assert.equal(first.latitude, -27.47321); assert.equal(first.longitude, 153.48123);
  assert.equal(first.publicationConsent, true); assert.equal(first.consentVersion, '2026-11-19');
  assert.equal(first.sourceType, undefined, 'Dropping a pin does not invent a first-hand observation');
  rejectFirst(new Error('Fictional reply lost after saving.')); await settle();
  assert.match(card.textContent, /Fictional reply lost/);
  assert.equal(f.document.querySelector('#send-quick-pin').disabled, false);
  submit(); await settle();
  assert.equal(requests.length, 2); assert.deepEqual(requests[1], first, 'An uncertain retry retains the exact ID and fields');
  assert.equal(f.document.querySelector('#map-status').dataset.reference, 'fictional-quick-pin-receipt');
  assert.equal(card.hidden, true);
  submit(); await settle();
  assert.equal(requests.length, 2, 'A confirmed pin cannot be sent a second time');
  assert.equal(f.document.querySelector('#place-dialog').open, false);
});

test('keyboard pin placement and Escape keep the expanded map available', async t => {
  const f = await fixture(t); f.click('load-map'); f.click('expand-map');
  const canvas = f.document.querySelector('#map-canvas'), card = f.document.querySelector('#quick-pin');
  const centre = f.maps[0].getCenter();
  canvas.focus(); canvas.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(card.hidden, false);
  assert.notEqual(f.document.activeElement, f.document.querySelector('#quick-pin-name'));
  f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(card.hidden, true);
  assert.equal(f.document.querySelector('.map-layout').classList.contains('is-expanded'), true, 'Escape dismisses the pin card before leaving the map');
  assert.equal(f.document.activeElement, canvas);
  canvas.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  f.click('quick-pin-details');
  const form = f.document.querySelector('#place-form');
  assert.ok(Math.abs(Number(form.elements.namedItem('latitude').value) - centre.lat) < 0.000001);
  assert.ok(Math.abs(Number(form.elements.namedItem('longitude').value) - centre.lng) < 0.000001);
});

test('the optional icon library can be filtered, searched and returned to the category default', async t => {
  const f = await fixture(t); f.click('add-detailed-place');
  const chooser = f.document.querySelector('#icon-chooser');
  assert.equal(chooser.hidden, true);
  f.click('choose-icon');
  assert.equal(chooser.hidden, false);
  const catalog = Array.from(f.window.READY_MAP_ICONS.icons);
  const grid = f.document.querySelector('#icon-picker-grid');
  const renderedIds = () => [...grid.querySelectorAll('button[data-icon-id]')].map(button => button.dataset.iconId).filter(Boolean);
  assert.deepEqual(new Set(renderedIds()), new Set(catalog.map(icon => icon.id)), 'All catalog choices are available');
  const group = f.document.querySelector('#icon-group');
  group.value = 'business'; group.dispatchEvent(new f.window.Event('change'));
  assert.deepEqual(new Set(renderedIds()), new Set(catalog.filter(icon => icon.sheet === 'business').map(icon => icon.id)));
  const target = catalog.find(icon => icon.sheet === 'business' && icon.label === 'Pharmacy');
  assert.ok(target);
  const search = f.document.querySelector('#icon-search');
  search.value = target.label; search.dispatchEvent(new f.window.Event('input'));
  assert.deepEqual(renderedIds(), [target.id]);
  grid.querySelector(`button[data-icon-id="${target.id}"]`).click();
  const form = f.document.querySelector('#place-form');
  assert.equal(form.elements.namedItem('iconId').value, target.id);
  assert.equal(form.elements.namedItem('category').value, 'business', 'An icon can suggest the category while it is still blank');
  assert.match(f.document.querySelector('#selected-icon').textContent, /Pharmacy/);
  f.click('choose-icon');
  const defaultIcon = f.document.querySelector('#default-icon');
  assert.ok(defaultIcon, 'The visitor can return to a category icon');
  defaultIcon.click();
  assert.equal(form.elements.namedItem('iconId').value, '');
  assert.equal(form.elements.namedItem('category').value, 'business');
});

test('a pin can be placed from the expanded map and completed with an icon', async t => {
  const f = await fixture(t); f.click('load-map'); f.click('expand-map');
  const layout = f.document.querySelector('.map-layout'), form = f.document.querySelector('#place-form');
  assert.equal(f.document.querySelector('#add-map-pin').hidden, false);
  f.click('add-map-pin');
  assert.equal(f.document.querySelector('#add-map-pin').getAttribute('aria-pressed'), 'true');
  assert.equal(f.document.querySelector('#map-position-prompt').hidden, false);
  assert.equal(f.document.querySelector('#place-dialog').open, false, 'Choose the position before opening a fresh place form');
  assert.equal(layout.classList.contains('is-expanded'), true);
  f.maps[0].fire('click', { latlng: f.window.L.latLng(-27.47123, 153.48234) });
  assert.equal(f.document.querySelector('#quick-pin').hidden, false);
  assert.equal(f.document.querySelector('#place-dialog').open, false, 'A new pin starts with the quick card');
  f.click('quick-pin-details');
  assert.equal(f.document.querySelector('#place-dialog').open, true);
  assert.equal(layout.classList.contains('is-expanded'), true, 'The editor stays with the expanded map');
  assert.ok(layout.contains(f.document.querySelector('#place-dialog')), 'The expanded map owns its editor');
  assert.equal(f.document.querySelector('#add-map-pin').getAttribute('aria-pressed'), 'false');
  assert.equal(Number(form.elements.namedItem('latitude').value), -27.47123);
  assert.equal(Number(form.elements.namedItem('longitude').value), 153.48234);
  pickIcon(f);
  f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(layout.classList.contains('is-expanded'), true, 'Escape in an open editor does not dismiss its background map');
  f.click('close-place-dialog');
  assert.equal(f.document.querySelector('#place-dialog').open, false);
  assert.equal(layout.classList.contains('is-expanded'), true);
});

test('cancelling a new drop leaves the map in place without opening an empty editor', async t => {
  const f = await fixture(t); f.click('load-map'); f.click('expand-map');
  f.click('add-map-pin'); f.click('cancel-position');
  assert.equal(f.document.querySelector('#place-dialog').open, false);
  assert.equal(f.document.querySelector('.map-layout').classList.contains('is-expanded'), true);
  assert.equal(f.document.querySelector('#map-position-prompt').hidden, true);
  assert.equal(f.document.querySelector('#add-map-pin').getAttribute('aria-pressed'), 'false');
  f.click('add-map-pin'); f.maps[0].fire('click', { latlng: f.window.L.latLng(-27.46, 153.48) });
  f.click('quick-pin-details');
  const form = f.document.querySelector('#place-form');
  form.elements.namedItem('name').value = 'Fictional unfinished place';
  const iconId = pickIcon(f);
  f.click('choose-on-map');
  assert.equal(f.document.querySelector('#place-dialog').open, false);
  f.click('cancel-position');
  assert.equal(f.document.querySelector('#place-dialog').open, true, 'Cancelling a replacement position returns to the existing form');
  assert.equal(form.elements.namedItem('name').value, 'Fictional unfinished place');
  assert.equal(form.elements.namedItem('iconId').value, iconId);
  assert.equal(Number(form.elements.namedItem('latitude').value), -27.46);
  assert.equal(Number(form.elements.namedItem('longitude').value), 153.48);
});

test('icon choices stay with device drafts and restore without granting publication permission', async t => {
  const f = await fixture(t); f.click('load-map'); f.click('add-map-pin');
  f.maps[0].fire('click', { latlng: f.window.L.latLng(-27.465, 153.481) });
  f.click('quick-pin-details');
  const form = f.document.querySelector('#place-form');
  form.elements.namedItem('name').value = 'Fictional drafted pin';
  form.elements.namedItem('category').value = 'beach';
  form.elements.namedItem('category').dispatchEvent(new f.window.Event('change'));
  const iconId = pickIcon(f);
  form.elements.namedItem('publicationConsent').checked = true;
  f.click('save-draft');
  const saved = JSON.parse(f.window.localStorage.getItem('ready-setco-place-draft-v1'));
  assert.equal(saved.suggestion.iconId, iconId);
  assert.equal(saved.suggestion.publicationConsent, false);
  f.click('close-place-dialog'); f.click('add-map-pin');
  f.maps[0].fire('click', { latlng: f.window.L.latLng(-27.48, 153.49) });
  f.click('quick-pin-details');
  assert.equal(form.elements.namedItem('iconId').value, '', 'A fresh pin starts with the category default rather than the previous explicit icon');
  assert.equal(f.document.querySelector('#default-icon').getAttribute('aria-pressed'), 'true');
  f.click('restore-draft');
  assert.equal(form.elements.namedItem('name').value, 'Fictional drafted pin');
  assert.equal(form.elements.namedItem('iconId').value, iconId);
  assert.equal(Number(form.elements.namedItem('latitude').value), -27.465);
  assert.equal(form.elements.namedItem('publicationConsent').checked, false);
  assert.ok(f.calls.every(call => call.method === 'GET'), 'Saving and restoring a device draft never submits it');
});

test('map tiles load only by choice and preserve flag-free provider attribution', async t => {
  const f = await fixture(t);
  assert.equal(f.maps.length, 0);
  assert.equal(f.document.querySelectorAll('.leaflet-tile').length, 0);
  assert.equal(f.positionRequests.length, 0, 'Opening the page never requests GPS');
  assert.equal(f.document.querySelector('#map-toolbar').hidden, true);
  f.click('load-map');
  assert.equal(f.maps.length, 1);
  assert.equal(f.document.querySelector('#map-toolbar').hidden, false);
  assert.ok(f.document.querySelectorAll('.leaflet-tile').length > 0);
  assert.ok([...f.document.querySelectorAll('.leaflet-tile')].every(tile => tile.src.includes('LatestStateProgram_AllUsers')));
  const attribution = f.document.querySelector('.leaflet-control-attribution');
  assert.match(attribution.textContent, /Leaflet/);
  assert.match(attribution.textContent, /Queensland/);
  assert.equal(f.document.querySelector('#map-satellite').getAttribute('aria-pressed'), 'true');
  assert.equal(attribution.querySelector('.leaflet-attribution-flag'), null);
  assert.equal(attribution.querySelector('svg'), null);
  assert.equal(f.positionRequests.length, 0);
});

test('switching road and aerial layers keeps the same view and a single background layer', async t => {
  const f = await fixture(t);
  f.click('load-map');
  const map = f.maps[0];
  map.setView([-27.472, 153.488], 15, { animate: false });
  const centre = map.getCenter(), zoom = map.getZoom();
  f.click('map-road');
  f.click('map-satellite');
  assert.equal(f.document.querySelector('#map-satellite').getAttribute('aria-pressed'), 'true');
  assert.equal(f.document.querySelector('#map-road').getAttribute('aria-pressed'), 'false');
  assert.ok(map.getCenter().equals(centre)); assert.equal(map.getZoom(), zoom);
  assert.equal(f.document.querySelectorAll('.leaflet-tile-pane > .leaflet-layer').length, 1);
  assert.ok([...f.document.querySelectorAll('.leaflet-tile')].every(tile => tile.src.includes('LatestStateProgram_AllUsers')));
  assert.match(f.document.querySelector('.leaflet-control-attribution').textContent, /Queensland/i);
  f.click('map-road'); f.click('map-satellite'); f.click('map-road');
  assert.ok(map.getCenter().equals(centre)); assert.equal(map.getZoom(), zoom);
  assert.equal(f.document.querySelectorAll('.leaflet-tile-pane > .leaflet-layer').length, 1);
  assert.match(f.document.querySelector('.leaflet-control-attribution').textContent, /OpenStreetMap contributors/);
  assert.equal(f.document.querySelectorAll('.leaflet-attribution-flag').length, 0);
});

test('the island fills its opening frame and refits on expand without resetting a chosen view', async t => {
  const f = await fixture(t); f.click('load-map');
  // OpenStreetMap island relation 5911994, checked 20 November 2026.
  const map = f.maps[0], north = [-27.3884944,153.5471706], south = [-27.7406646,153.3931919];
  const usedHeight = () => Math.abs(map.latLngToContainerPoint(north).y-map.latLngToContainerPoint(south).y);
  assert.ok(map.getBounds().contains(north) && map.getBounds().contains(south), 'Both island ends stay in frame');
  assert.ok(usedHeight() > f.size.height*.94, 'The opening view uses nearly the full map height');
  f.size.height=780; f.click('expand-map');
  await new Promise(resolve => f.window.requestAnimationFrame(resolve));
  assert.ok(usedHeight() > f.size.height*.94, 'The overview fits the expanded height rather than staying small');
  map.setView([-27.43,153.53],16,{animate:false});
  const centre=map.getCenter(),zoom=map.getZoom();
  f.size.height=480; f.click('expand-map');
  await new Promise(resolve => f.window.requestAnimationFrame(resolve));
  assert.ok(map.distance(map.getCenter(),centre)<2, 'A chosen centre stays within one screen pixel after resize');
  assert.equal(map.getZoom(),zoom, 'A chosen view is preserved');
});

test('viewing GPS is explicit, shows accuracy and leaves place forms, drafts and API payloads unchanged', async t => {
  const f = await fixture(t);
  const form = f.document.querySelector('#place-form');
  form.elements.namedItem('latitude').value = '-27.41';
  form.elements.namedItem('longitude').value = '153.43';
  f.window.localStorage.setItem('ready-setco-place-draft-v1', 'fictional untouched device draft');
  const beforeForm = f.formValues(), beforeStorage = [...Object.entries(f.window.localStorage)], beforeCalls = structuredClone(f.calls);
  f.click('load-map');
  assert.equal(f.positionRequests.length, 0);
  const map = f.maps[0], previousLayers = new Set(f.allLayers(map));
  f.click('find-me');
  assert.equal(f.positionRequests.length, 1);
  assert.equal(f.positionRequests[0].options.enableHighAccuracy, true);
  f.positionRequests[0].success(gps);
  assert.ok(map.getCenter().equals([gps.coords.latitude, gps.coords.longitude]));
  const added = f.allLayers(map).filter(layer => !previousLayers.has(layer));
  assert.ok(added.some(layer => typeof layer.getRadius === 'function' && layer.getRadius() === gps.coords.accuracy), 'The viewing position includes an accuracy circle');
  assert.equal(f.document.querySelector('#clear-location').hidden, false);
  assert.deepEqual(f.formValues(), beforeForm);
  assert.deepEqual([...Object.entries(f.window.localStorage)], beforeStorage);
  assert.deepEqual(f.calls, beforeCalls, 'Viewing location never posts to the register or sends GPS through fetch');
  f.click('clear-location');
  assert.equal(f.document.querySelector('#clear-location').hidden, true);
  assert.ok(added.filter(layer => typeof layer.getLatLng === 'function').every(layer => !map.hasLayer(layer)), 'Clearing removes the position and accuracy layers');
  assert.deepEqual(f.formValues(), beforeForm);
});

test('a denied location request leaves the map usable and permits a later retry', async t => {
  const f = await fixture(t);
  f.click('load-map'); f.click('find-me');
  f.positionRequests[0].error({ code: 1 });
  assert.match(f.document.querySelector('#map-location-status').textContent, /permission|allow/i);
  assert.equal(f.document.querySelector('#find-me').disabled, false);
  assert.equal(f.document.querySelector('#clear-location').hidden, true);
  assert.equal(f.document.querySelector('#map-canvas').hidden, false);
  f.click('find-me');
  assert.equal(f.positionRequests.length, 2);
  f.positionRequests[1].success(gps);
  assert.equal(f.document.querySelector('#clear-location').hidden, false);
});

test('hiding the map cancels an outstanding GPS result without reviving it on reload', async t => {
  const f = await fixture(t);
  f.click('load-map'); f.click('find-me');
  const pending = f.positionRequests[0];
  f.click('remove-map');
  assert.equal(f.document.querySelector('#map-toolbar').hidden, true);
  assert.equal(f.document.querySelector('#map-canvas').hidden, true);
  pending.success(gps);
  assert.equal(f.document.querySelector('#clear-location').hidden, true);
  assert.equal(f.document.querySelector('#map-canvas').hidden, true);
  f.click('load-map');
  assert.equal(f.maps.length, 2);
  assert.ok(!f.maps[1].getCenter().equals([gps.coords.latitude, gps.coords.longitude]));
  assert.equal(f.document.querySelector('#clear-location').hidden, true);
  assert.equal(f.positionRequests.length, 1, 'Reloading does not ask for location again');
});

test('expanded map is a reversible keyboard-accessible view with its own place-list toggle', async t => {
  const f = await fixture(t);
  f.click('load-map');
  const toggle = f.document.querySelector('#expand-map'), layout = f.document.querySelector('.map-layout');
  const header = f.document.querySelector('.site-header');
  toggle.focus(); f.click('expand-map');
  assert.equal(layout.classList.contains('is-expanded'), true);
  assert.equal(layout.getAttribute('role'), 'dialog');
  assert.equal(layout.getAttribute('aria-modal'), 'true');
  assert.ok(header.inert || header.hasAttribute('inert'), 'Background navigation is outside the expanded view');
  const listToggle = f.document.querySelector('#toggle-map-list');
  assert.equal(listToggle.hidden, false);
  const beforeState = listToggle.getAttribute('aria-expanded') ?? listToggle.getAttribute('aria-pressed');
  assert.notEqual(beforeState, null, 'The list toggle exposes its state');
  listToggle.click();
  assert.notEqual(listToggle.getAttribute('aria-expanded') ?? listToggle.getAttribute('aria-pressed'), beforeState);
  f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(layout.classList.contains('is-expanded'), false);
  assert.notEqual(layout.getAttribute('aria-modal'), 'true');
  assert.ok(!header.inert && !header.hasAttribute('inert'));
  assert.equal(f.document.activeElement, toggle);
  f.click('expand-map'); f.click('remove-map');
  assert.equal(layout.classList.contains('is-expanded'), false);
  assert.ok(!header.inert && !header.hasAttribute('inert'));
});

test('directions use the chosen public place and travel mode without exporting a GPS origin', async t => {
  const f = await fixture(t);
  f.document.querySelector('#place-list button').click();
  const directions = f.document.querySelector('#place-directions'), googleMap = f.document.querySelector('#place-google-map');
  assert.ok(directions); assert.ok(googleMap);
  const destination = `${point.geometry.coordinates[1]},${point.geometry.coordinates[0]}`;
  let url = new URL(directions.href);
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/maps/dir/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('destination'), destination);
  assert.equal(url.searchParams.has('origin'), false);
  assert.equal(new URL(googleMap.href).searchParams.get('query'), destination);
  assert.equal(f.document.querySelector('#place-external-map').href.startsWith('https://www.openstreetmap.org/'), true);
  const mode = f.document.querySelector('#directions-mode');
  for (const value of ['walking', 'driving', 'bicycling', 'transit', '']) {
    mode.value = value; mode.dispatchEvent(new f.window.Event('change'));
    url = new URL(directions.href);
    assert.equal(url.searchParams.get('destination'), destination);
    assert.equal(url.searchParams.get('travelmode'), value || null);
    assert.equal(url.searchParams.has('origin'), false);
  }
  f.click('load-map'); f.click('find-me'); f.positionRequests[0].success(gps);
  assert.equal(new URL(directions.href).searchParams.has('origin'), false);
  assert.equal(new URL(googleMap.href).searchParams.has('origin'), false);
  assert.ok(f.calls.every(call => call.method === 'GET'));
});
