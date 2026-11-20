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
  const [html, leaflet, application] = await Promise.all([
    readFile(new URL('../map.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/vendor/leaflet/leaflet.js', import.meta.url), 'utf8'),
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
  Object.defineProperties(canvas, { clientWidth: { get: () => 640 }, clientHeight: { get: () => 480 } });
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
  const createMap = window.L.map;
  window.L.map = (...args) => { const map = createMap(...args); maps.push(map); return map; };
  window.eval(application);
  await settle();
  const click = id => { const target = document.getElementById(id); assert.ok(target, `Missing ${id} control`); target.click(); };
  const formValues = () => Array.from(new window.FormData(document.querySelector('#place-form')));
  const allLayers = map => { const layers = []; map.eachLayer(layer => layers.push(layer)); return layers; };
  return { window, document, calls, positionRequests, maps, click, formValues, allLayers };
}

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
  assert.ok([...f.document.querySelectorAll('.leaflet-tile')].every(tile => tile.src.startsWith('https://tile.openstreetmap.org/')));
  const attribution = f.document.querySelector('.leaflet-control-attribution');
  assert.match(attribution.textContent, /Leaflet/);
  assert.match(attribution.textContent, /OpenStreetMap contributors/);
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
