import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteD1 } from '../scripts/sqlite-d1.mjs';
import { handleMemberServiceRequest } from '../cloudflare/member-services.mjs';

const html = readFileSync(new URL('../portal.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const BASE = 'https://ready-setco.example';
const identity = { accountId: '1096c2bc-e190-4b00-82ba-6e03416e84cc', username: 'test.participant', displayName: 'Fictional Participant', email: 'fictional@example.test', webmaster: false, status: 'active', version: 1 };
const site = { id: 'minjerribah', name: 'Fictional island pilot', locality: 'Fictional locality', summary: 'Test group only.', applicationsOpen: true, published: true, version: 1 };
const profile = { accountId: identity.accountId, displayName: identity.displayName, email: identity.email, phone: '', organisation: '', locality: '', about: '', interests: [], consentContact: true, consentFutureHandover: false, version: 1, updatedAt: '2026-11-27T10:00:00.000Z' };
const clone = value => JSON.parse(JSON.stringify(value));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

function fixture(t, { signedIn = true, account = identity, hash = '', override, webauthn = {} } = {}) {
  const dom = new JSDOM(html, { url: `${BASE}/portal.html${hash}`, runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const window = dom.window, calls = [], downloads = [], ceremonies = [];
  const data = { authenticated: signedIn, profile: clone(profile), applications: [], groups: [], sites: [clone(site)] };
  Object.defineProperty(window, 'crypto', { value: crypto });
  window.Blob = Blob; window.confirm = () => true;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLAnchorElement.prototype.click = function () {};
  window.URL.createObjectURL = blob => { downloads.push(blob); return 'blob:test-private-download'; };
  window.URL.revokeObjectURL = () => {};
  window.SimpleWebAuthnBrowser = {
    startRegistration: async value => { ceremonies.push({ kind: 'registration', value }); return { id: 'fictional-credential', type: 'public-key', response: {} }; },
    startAuthentication: async value => { ceremonies.push({ kind: 'authentication', value }); return { id: 'fictional-credential', type: 'public-key', response: {} }; }, ...webauthn,
  };
  window.fetch = async (path, options = {}) => {
    const url = new URL(path, BASE), body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: url.pathname, search: url.search, options, body });
    const custom = await override?.({ path: url.pathname, url, options, body, data, calls }); if (custom) return custom;
    if (url.pathname === '/api/auth/session') return json({ authenticated: data.authenticated, identity: data.authenticated ? account : null, authConfigured: true, bootstrapAvailable: true });
    if (/\/api\/auth\/(?:register|bootstrap|activate|recover|login|recovery-codes)\/options$/.test(url.pathname)) return json({ ceremonyId: 'fictional-ceremony', options: { challenge: 'fictional-challenge' } });
    if (/\/api\/auth\/(?:register|bootstrap|activate|recover|login|recovery-codes)\/verify$/.test(url.pathname)) { data.authenticated = true; return json({ identity: account, ...(!url.pathname.includes('/login/') ? { recoveryCodes: ['TEST-CODE-01', 'TEST-CODE-02', 'TEST-CODE-03', 'TEST-CODE-04', 'TEST-CODE-05', 'TEST-CODE-06', 'TEST-CODE-07', 'TEST-CODE-08'] } : {}) }); }
    if (url.pathname === '/api/auth/logout' || url.pathname === '/api/auth/sessions/revoke') { data.authenticated = false; return json({ ok: true }); }
    if (url.pathname === '/api/member/profile') {
      if (options.method === 'PATCH') { data.profile = { ...body, version: body.expectedVersion + 1 }; delete data.profile.expectedVersion; }
      return json({ profile: data.profile });
    }
    if (url.pathname === '/api/member/sites') return json({ sites: data.sites, total: data.sites.length, page: 1, pageSize: 50 });
    if (url.pathname === '/api/member/applications') {
      if (options.method === 'POST') { data.applications.push({ ...body, status: 'submitted', version: 1, siteName: site.name }); return json({ application: data.applications.at(-1) }, 201); }
      return json({ applications: data.applications, total: data.applications.length, page: 1, pageSize: 50 });
    }
    if (url.pathname === '/api/member/groups') return json({ groups: data.groups, total: data.groups.length, page: 1, pageSize: 50 });
    if (url.pathname === '/api/committee/sites') return json({ sites: account.webmaster ? data.sites : [], total: account.webmaster ? data.sites.length : 0, page: 1, pageSize: 50 });
    if (url.pathname === '/api/webmaster/sites') return json({ sites: data.sites, total: data.sites.length, page: 1, pageSize: 50 });
    if (url.pathname === '/api/webmaster/accounts') return json({ accounts: [account], total: 1, page: 1, pageSize: 25 });
    if (url.pathname === '/api/auth/passkeys') return json({ passkeys: [{ id: 'test-key', name: 'Fictional device', createdAt: '2026-11-27' }] });
    if (url.pathname === '/api/member/export') return json({ profile: data.profile, applications: data.applications });
    return json({ error: `Test route not configured: ${url.pathname}`, code: 'not_found' }, 404);
  };
  const $ = id => window.document.getElementById(id);
  const set = (form, name, val) => {
    const element = form.elements.namedItem(name); assert.ok(element, name);
    if (element.type === 'checkbox') element.checked = val; else element.value = val;
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  async function until(predicate) {
    for (let i = 0; i < 600; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 4)); }
    assert.fail(`UI timed out: ${$('portal-status').textContent}`);
  }
  const idle = () => until(() => $('main').getAttribute('aria-busy') === 'false');
  const submit = form => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  window.eval(script);
  return { window, $, set, submit, idle, until, calls, downloads, ceremonies, data };
}

test('signed-out portal keeps private data unloaded and cancelled passkeys do not verify or create accounts', async t => {
  const f = fixture(t, { signedIn: false, webauthn: { startAuthentication: async () => { throw new DOMException('Cancelled', 'NotAllowedError'); } } });
  await f.idle();
  assert.equal(f.$('portal-signed-out').hidden, false); assert.equal(f.$('portal-signed-in').hidden, true);
  assert.equal(f.calls.some(call => call.path.startsWith('/api/member/')), false);
  f.set(f.$('portal-login'), 'username', 'test.participant'); f.submit(f.$('portal-login')); await f.idle();
  assert.match(f.$('portal-status').textContent, /cancelled or timed out/);
  assert.equal(f.calls.some(call => call.path.endsWith('/verify')), false);
  assert.equal(f.$('portal-login').elements.username.value, 'test.participant');
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
});

test('registration uses explicit consent, a passkey ceremony and privately displayed recovery codes', async t => {
  const f = fixture(t, { signedIn: false }); await f.idle(); const form = f.$('portal-register');
  assert.equal(form.elements.consent.checked, false);
  for (const [name, val] of Object.entries({ username: 'new.participant', displayName: 'Fictional Participant', email: 'fictional@example.test', consent: true })) f.set(form, name, val);
  f.submit(form); await f.idle();
  const options = f.calls.find(call => call.path === '/api/auth/register/options');
  assert.deepEqual(options.body, { username: 'new.participant', displayName: 'Fictional Participant', email: 'fictional@example.test', consentAccount: true, consentVersion: '2026-11-27' });
  assert.equal(options.options.credentials, 'same-origin'); assert.equal(options.options.cache, 'no-store');
  assert.equal(f.ceremonies[0].kind, 'registration');
  assert.equal(f.$('portal-signed-in').hidden, false); assert.equal(f.$('portal-code-list').children.length, 8);
  assert.equal(f.downloads.length, 0, 'Recovery codes are downloaded only on request.');
  assert.equal(f.$('tab-webmaster').hidden, true); assert.equal(f.$('tab-committee').hidden, true);
  f.$('portal-download-codes').click(); assert.equal(f.downloads.length, 1); assert.match(await f.downloads[0].text(), /TEST-CODE-01/);
  f.$('portal-codes-saved').click(); assert.equal(f.$('portal-code-list').children.length, 0); assert.equal(f.$('portal-recovery-codes').hidden, true);
  assert.equal(f.window.document.querySelectorAll('input[type="password"]').length, 2, 'Only setup secret and one-use recovery code are password-type fields.');
});

test('activation token is removed from the URL and sent only with explicit account consent', async t => {
  const f = fixture(t, { signedIn: false, hash: '#invite=fictional-private-token' }); await f.idle();
  assert.equal(f.window.location.hash, ''); assert.equal(f.$('portal-activation').hidden, false);
  assert.equal(f.$('portal-activate').elements.consent.checked, false);
  f.set(f.$('portal-activate'), 'consent', true); f.submit(f.$('portal-activate')); await f.idle();
  const sent = f.calls.find(call => call.path === '/api/auth/activate/options');
  assert.deepEqual(sent.body, { token: 'fictional-private-token', consentAccount: true, consentVersion: '2026-11-27' });
  assert.equal(f.window.document.body.textContent.includes('fictional-private-token'), false);
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
});

test('profile conflicts preserve unsaved text and use the previously loaded version', async t => {
  const f = fixture(t, { override: ({ path, options }) => path === '/api/member/profile' && options.method === 'PATCH' ? json({ error: 'This profile changed in another session.', code: 'record_conflict' }, 409) : null });
  await f.idle(); const form = f.$('portal-profile');
  f.set(form, 'about', 'My private unsaved edit.'); f.submit(form); await f.idle();
  const sent = f.calls.find(call => call.path === '/api/member/profile' && call.options.method === 'PATCH');
  assert.equal(sent.body.expectedVersion, 1); assert.equal(sent.body.about, 'My private unsaved edit.');
  assert.equal(form.elements.about.value, 'My private unsaved edit.'); assert.match(f.$('portal-status').textContent, /unsaved text is still here/);
  assert.equal(form.elements.about.disabled, false);
});

test('uncertain application saves retry the identical submission identifier and report only confirmed saves', async t => {
  let first = true;
  const f = fixture(t, { override: ({ path, options }) => { if (path === '/api/member/applications' && options.method === 'POST' && first) { first = false; throw new TypeError('Network response lost'); } } });
  await f.idle(); f.$('tab-applications').click();
  const form = f.$('portal-application');
  for (const [name, val] of Object.entries({ siteId: site.id, motivation: 'Help prepare a fictional community event.', skills: 'Fictional organising experience', availability: 'One morning a week', consentParticipation: true })) f.set(form, name, val);
  f.submit(form); await f.idle();
  assert.match(f.$('portal-status').textContent, /did not confirm/); assert.equal(form.elements.motivation.value, 'Help prepare a fictional community event.');
  f.submit(form); await f.idle();
  const writes = f.calls.filter(call => call.path === '/api/member/applications' && call.options.method === 'POST');
  assert.equal(writes.length, 2); assert.equal(writes[0].body.id, writes[1].body.id); assert.deepEqual(writes[0].body, writes[1].body);
  assert.equal(writes[0].body.consentParticipation, true); assert.equal(writes[0].body.consentFutureHandover, false);
  assert.match(f.$('portal-status').textContent, /application has been saved/); assert.equal(f.data.applications.length, 1);
});

test('group content is rendered as text, unsafe document links are excluded and logout clears private values', async t => {
  const f = fixture(t, { override: ({ path }) => {
    if (path === '/api/member/groups') return json({ groups: [{ ...site, role: 'participant', legalMembershipStatus: 'not_admitted' }], total: 1, page: 1, pageSize: 50 });
    if (path === `/api/member/groups/${site.id}/bulletins`) return json({ bulletins: [{ id: 'test-post', title: '<img src=x onerror=alert(1)>', body: 'Private text <script>bad()</script>', label: 'Notice', link: 'javascript:alert(1)', version: 1 }], total: 1, page: 1, pageSize: 50 });
  } });
  await f.idle(); f.$('tab-groups').click(); f.$('portal-groups-list').querySelector('button').click(); await f.idle();
  assert.match(f.$('portal-post-list').textContent, /<script>bad\(\)<\/script>/);
  assert.equal(f.$('portal-post-list').querySelectorAll('script,img,a').length, 0);
  assert.match(f.$('portal-group-membership').textContent, /admission has not been recorded/);
  f.$('portal-logout').click(); await f.idle();
  assert.equal(f.$('portal-post-list').textContent, ''); assert.equal(f.$('portal-profile').elements.email.value, '');
  assert.equal(f.$('portal-signed-in').hidden, true); assert.equal(f.$('portal-signed-out').hidden, false);
});

test('public group selection loads subsequent pages rather than silently hiding groups after the first page', async t => {
  const f = fixture(t, { override: ({ path, url }) => {
    if (path !== '/api/member/sites') return null;
    const page = Number(url.searchParams.get('page') || 1);
    return json({ sites: [{ ...site, id: page === 1 ? 'first' : 'second', name: page === 1 ? 'First group' : 'Second group' }], total: 2, page, pageSize: 1 });
  } });
  await f.idle(); assert.ok(f.$('portal-application-details-more'));
  f.$('portal-application-details-more').click(); await f.idle();
  assert.deepEqual([...f.$('portal-application-workspace').options].map(option => option.value), ['', 'first', 'second']);
  assert.equal(f.$('portal-application-details-more'), null);
});

test('webmaster role editor fetches the exact selected account assignment and uses its version', async t => {
  const admin = { ...identity, webmaster: true };
  const f = fixture(t, { account: admin, override: ({ path, options, body }) => {
    if (path === `/api/webmaster/sites/${site.id}/roles/${identity.accountId}`) return json({ assignment: { accountId: identity.accountId, role: 'committee', version: 7 } });
    if (path === `/api/webmaster/sites/${site.id}/roles` && options.method === 'PUT') { assert.equal(body.expectedVersion, 7); assert.equal(body.role, 'none'); return json({ assignment: { ...body, version: 8 } }); }
  } });
  await f.idle(); f.$('tab-webmaster').click(); await f.idle();
  f.$('portal-account-list').querySelector('button').click();
  const selector = f.$('portal-role-workspace'); selector.value = site.id; selector.dispatchEvent(new f.window.Event('change', { bubbles: true })); await f.idle();
  assert.equal(f.$('portal-role').elements.role.value, 'committee');
  f.set(f.$('portal-role'), 'role', 'none'); f.submit(f.$('portal-role')); await f.idle();
  assert.ok(f.calls.some(call => call.path === `/api/webmaster/sites/${site.id}/roles` && call.options.method === 'PUT'));
});


test('portal profile and application forms persist through the real SQLite member service and reload correctly', async t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const name of ['0001_intake.sql', '0002_operator_legal_name.sql', '0003_map_records.sql', '0004_governance.sql', '0005_member_accounts.sql', '0006_member_services.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  sqlite.prepare(`INSERT INTO member_accounts(id,username,display_name,email,status,webmaster,consent_account,consent_version,created_at,updated_at,created_by,original_payload_json,last_operation_id) VALUES(?,?,?,?, 'active',0,1,'2026-11-27',?,?,?,'{}',?)`).run(identity.accountId,identity.username,identity.displayName,identity.email,'2026-11-27T10:00:00.000Z','2026-11-27T10:00:00.000Z','fictional-test',crypto.randomUUID());
  const env = { DB: createSqliteD1(sqlite) };
  const override = async ({ path, url, options, body }) => {
    if (!path.startsWith('/api/member/') && !path.startsWith('/api/committee/')) return null;
    const request = new Request(url, { method: options.method, headers: { Origin: BASE, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return handleMemberServiceRequest(request, env, { identity, now: '2026-11-27T10:05:00.000Z', readJSON: async () => body });
  };
  const f = fixture(t, { override }); await f.idle();
  const form = f.$('portal-profile'); f.set(form, 'organisation', 'Fictional learning circle'); f.set(form, 'about', 'Help with practical learning.'); f.set(form, 'consentContact', true); f.submit(form); await f.idle();
  assert.match(f.$('portal-status').textContent, /saved on the server/);
  assert.equal(sqlite.prepare('SELECT version FROM member_profiles WHERE account_id=?').get(identity.accountId).version, 1);
  f.$('tab-applications').click(); const applicationForm = f.$('portal-application');
  f.set(applicationForm, 'siteId', 'minjerribah'); f.set(applicationForm, 'motivation', 'Fictional test participation request.'); f.set(applicationForm, 'consentParticipation', true); f.submit(applicationForm); await f.idle();
  assert.match(f.$('portal-status').textContent, /application has been saved/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM member_applications WHERE account_id=?').get(identity.accountId).count, 1);
  const fresh = fixture(t, { override }); await fresh.idle();
  assert.equal(fresh.$('portal-profile').elements.organisation.value, 'Fictional learning circle');
  assert.match(fresh.$('portal-application-list').textContent, /Fictional test participation request/);
  assert.equal(fresh.$('portal-profile').elements.consentFutureHandover.checked, false);
});


test('explicit unconfigured owner setup generates a private key only on request and preserves edits when checking configuration', async t => {
  let configured = false;
  const override = ({ path }) => path === '/api/auth/session' ? json({ authenticated: false, identity: null, authConfigured: configured, bootstrapAvailable: configured, setupComplete: false }) : null;
  const f = fixture(t, { signedIn: false, hash: '#setup', override }); await f.idle();
  const form = f.$('portal-bootstrap');
  assert.equal(f.$('portal-setup').hidden, false); assert.equal(f.$('portal-signed-out').hidden, false);
  assert.equal(form.elements.bootstrapKey.value, '', 'No key is created before the owner requests one.');
  f.$('portal-generate-key').click(); const key = form.elements.bootstrapKey.value;
  assert.match(key, /^[a-f0-9]{64}$/); assert.equal(f.$('portal-generate-key').disabled, true);
  assert.equal(f.window.document.body.textContent.includes(key), false);
  assert.equal(f.window.location.href.includes(key), false);
  assert.equal(f.calls.some(call => JSON.stringify(call.body).includes(key)), false);
  f.set(form, 'displayName', 'Fictional Owner'); configured = true;
  f.$('portal-check-setup').click(); await f.idle();
  assert.equal(form.elements.bootstrapKey.value, key); assert.equal(form.elements.displayName.value, 'Fictional Owner');
  assert.equal(f.$('portal-setup-help').hidden, true); assert.match(f.$('portal-status').textContent, /setup is ready/);
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
  const publicView = fixture(t, { signedIn: false, override: ({ path }) => path === '/api/auth/session' ? json({ authenticated: false, identity: null, authConfigured: false, bootstrapAvailable: false }) : null });
  await publicView.idle(); assert.equal(publicView.$('portal-signed-out').hidden, true); assert.equal(publicView.$('portal-unavailable').hidden, false);
});


test('private recovery links stay with their named recipient and webmaster access is an explicit versioned change', async t => {
  const admin = { ...identity, webmaster: true };
  const alice = { ...identity, accountId: 'c08eb7cf-729b-4834-a5c0-28b17c6927f7', username: 'fictional.alice', displayName: 'Fictional Alice', email: 'alice@example.test' };
  const bob = { ...identity, accountId: '696d9634-3e36-47cb-9d0d-7a667dfcf3a8', username: 'fictional.bob', displayName: 'Fictional Bob', email: 'bob@example.test' };
  const f = fixture(t, { account: admin, override: ({ path, options, body }) => {
    if (path === '/api/webmaster/accounts' && options.method === 'GET') return json({ accounts: [alice, bob], total: 2, page: 1, pageSize: 25 });
    if (path === `/api/webmaster/accounts/${alice.accountId}/recovery-link`) { alice.version++; return json({ account: alice, token: 'fictional-alice-only-link', purpose: 'recovery', expiresAt: '2026-11-27T11:00:00.000Z' }); }
    if (path === `/api/webmaster/accounts/${bob.accountId}` && options.method === 'PATCH') { assert.deepEqual(body, { expectedVersion: 1, status: 'active', webmaster: true }); bob.webmaster = true; bob.version = 2; return json({ account: bob }); }
  } });
  await f.idle(); f.$('tab-webmaster').click(); await f.idle();
  f.$('portal-account-list').querySelectorAll('button')[0].click();
  f.$('portal-account-reset').click(); await f.idle();
  assert.equal(f.$('portal-private-link').hidden, false);
  assert.match(f.$('portal-private-link-help').textContent, /Fictional Alice \(@fictional.alice\)/);
  assert.match(f.$('portal-private-link-value').value, /fictional-alice-only-link/);
  f.$('portal-account-list').querySelectorAll('button')[1].click();
  assert.equal(f.$('account-editor-title').textContent, 'Fictional Bob');
  assert.equal(f.$('portal-private-link').hidden, true); assert.equal(f.$('portal-private-link-value').value, ''); assert.equal(f.$('portal-private-link-help').textContent, '');
  const form = f.$('portal-account-state'); assert.equal(form.elements.webmaster.checked, false);
  f.set(form, 'webmaster', true); f.submit(form); await f.idle();
  assert.equal(form.elements.webmaster.checked, true); assert.match(f.$('portal-account-info').textContent, /Version 2/);
  assert.ok(f.calls.some(call => call.path === `/api/webmaster/accounts/${bob.accountId}` && call.options.method === 'PATCH'));
});
