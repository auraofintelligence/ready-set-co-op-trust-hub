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
const identity = { accountId: '1096c2bc-e190-4b00-82ba-6e03416e84cc', username: 'test.participant', displayName: 'Fictional Participant', email: 'fictional@example.test', webmaster: false, status: 'active', version: 1, hasPassword: true };
const PASSWORD = 'a';
const site = { id: 'minjerribah', name: 'Fictional island pilot', locality: 'Fictional locality', summary: 'Test group only.', applicationsOpen: true, published: true, version: 1 };
const profile = { accountId: identity.accountId, displayName: identity.displayName, email: identity.email, phone: '', organisation: '', locality: '', about: '', interests: [], consentContact: true, consentFutureHandover: false, version: 1, updatedAt: '2026-11-27T10:00:00.000Z' };
const clone = value => JSON.parse(JSON.stringify(value));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

function fixture(t, { signedIn = true, account = identity, hash = '', override, webauthn = {} } = {}) {
  const dom = new JSDOM(html, { url: `${BASE}/portal.html${hash}`, runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const window = dom.window, calls = [], downloads = [], ceremonies = [], passwordCalls = [], workers = [];
  const data = { authenticated: signedIn, hasPassword: account.hasPassword === true, profile: clone(profile), applications: [], groups: [], sites: [clone(site)] };
  Object.defineProperty(window, 'crypto', { value: crypto });
  window.Blob = Blob; window.confirm = () => true;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLAnchorElement.prototype.click = function () {};
  window.URL.createObjectURL = blob => { downloads.push(blob); return 'blob:test-private-download'; };
  window.URL.revokeObjectURL = () => {};
  window.Worker = class extends window.EventTarget {
    constructor(url, options) { super(); this.url = url; this.options = options; this.terminated = false; this.states = new Set(); workers.push(this); }
    postMessage(message) {
      passwordCalls.push(clone(message));
      queueMicrotask(() => {
        if (this.terminated) return;
        const { id, method, params } = message; let result;
        if (method.endsWith('.start')) { const stateId = `fictional-state-${id}`; this.states.add(stateId); result = { stateId, ...(method === 'registration.start' ? { registrationRequest: 'fictional-registration-request' } : { startLoginRequest: 'fictional-login-request' }) }; }
        else if (method.endsWith('.finish')) { assert.equal(this.states.delete(params.stateId), true); result = method === 'registration.finish' ? { registrationRecord: 'fictional-registration-record' } : { finishLoginRequest: 'fictional-login-proof' }; }
        else if (method === 'cancel') { this.states.delete(params.stateId); result = { cleared: true }; }
        else if (method === 'clear') { this.states.clear(); result = { cleared: true }; }
        else assert.fail(`Unexpected password worker method: ${method}`);
        this.dispatchEvent(new window.MessageEvent('message', { data: { id, ok: true, result } }));
      });
    }
    terminate() { this.terminated = true; this.states.clear(); }
  };
  window.SimpleWebAuthnBrowser = {
    startRegistration: async value => { ceremonies.push({ kind: 'registration', value }); return { id: 'fictional-credential', type: 'public-key', response: {} }; },
    startAuthentication: async value => { ceremonies.push({ kind: 'authentication', value }); return { id: 'fictional-credential', type: 'public-key', response: {} }; }, ...webauthn,
  };
  window.fetch = async (path, options = {}) => {
    const url = new URL(path, BASE), body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path: url.pathname, search: url.search, options, body });
    const custom = await override?.({ path: url.pathname, url, options, body, data, calls }); if (custom) return custom;
    if (url.pathname === '/api/auth/session') return json({ authenticated: data.authenticated, identity: data.authenticated ? { ...account, hasPassword: data.hasPassword } : null, authConfigured: true, passwordAvailable: true, bootstrapAvailable: true });
    const passwordRoute = /^\/api\/auth\/password\/([^/]+)\/(options|verify)$/.exec(url.pathname);
    if (passwordRoute) {
      const registration = ['register', 'bootstrap', 'activate', 'recover', 'change'].includes(passwordRoute[1]);
      if (passwordRoute[2] === 'options') return json({ ceremonyId: 'fictional-password-ceremony', ...(registration ? { registrationResponse: 'fictional-registration-response' } : { loginResponse: 'fictional-login-response' }) });
      data.authenticated = true; if (registration) data.hasPassword = true;
      return json({ identity: { ...account, hasPassword: data.hasPassword }, ...(!['login', 'reauth'].includes(passwordRoute[1]) ? { recoveryCodes: ['TEST-CODE-01', 'TEST-CODE-02', 'TEST-CODE-03', 'TEST-CODE-04', 'TEST-CODE-05', 'TEST-CODE-06', 'TEST-CODE-07', 'TEST-CODE-08'] } : {}) });
    }
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
    if (url.pathname === '/api/auth/passkeys') return json({ hasPassword: data.hasPassword, passkeys: [{ id: 'test-key', name: 'Fictional device', createdAt: '2026-11-27' }] });
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
  return { window, $, set, submit, idle, until, calls, downloads, ceremonies, passwordCalls, workers, data };
}

test('signed-out portal keeps private data unloaded and cancelled passkeys do not verify or create accounts', async t => {
  const f = fixture(t, { signedIn: false, webauthn: { startAuthentication: async () => { throw new DOMException('Cancelled', 'NotAllowedError'); } } });
  await f.idle();
  assert.equal(f.$('portal-signed-out').hidden, false); assert.equal(f.$('portal-signed-in').hidden, true);
  assert.equal(f.calls.some(call => call.path.startsWith('/api/member/')), false);
  f.set(f.$('portal-passkey-login'), 'username', 'test.participant'); f.submit(f.$('portal-passkey-login')); await f.idle();
  assert.match(f.$('portal-status').textContent, /cancelled or timed out/);
  assert.equal(f.calls.some(call => call.path.endsWith('/verify')), false);
  assert.equal(f.$('portal-passkey-login').elements.username.value, 'test.participant');
  assert.equal(f.workers.length, 0);
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
});

test('registration accepts a simple one-character password with explicit consent and privately displayed recovery codes', async t => {
  const f = fixture(t, { signedIn: false }); await f.idle(); const form = f.$('portal-register');
  assert.equal(form.elements.consent.checked, false);
  for (const [name, val] of Object.entries({ username: 'new.participant', displayName: 'Fictional Participant', email: 'fictional@example.test', password: PASSWORD, confirmPassword: PASSWORD, consent: true })) f.set(form, name, val);
  f.submit(form); await f.idle();
  const options = f.calls.find(call => call.path === '/api/auth/password/register/options');
  assert.deepEqual(options.body, { username: 'new.participant', displayName: 'Fictional Participant', email: 'fictional@example.test', consentAccount: true, consentVersion: '2026-11-27', registrationRequest: 'fictional-registration-request' });
  assert.equal(options.options.credentials, 'same-origin'); assert.equal(options.options.cache, 'no-store');
  assert.equal(f.ceremonies.length, 0);
  assert.equal(f.passwordCalls[0].method, 'registration.start');
  assert.equal(f.calls.some(call => JSON.stringify(call.body).includes(JSON.stringify(PASSWORD))), false);
  assert.equal(f.$('portal-signed-in').hidden, false); assert.equal(f.$('portal-code-list').children.length, 8);
  assert.equal(f.downloads.length, 0, 'Recovery codes are downloaded only on request.');
  assert.equal(f.$('tab-webmaster').hidden, true); assert.equal(f.$('tab-committee').hidden, true);
  f.$('portal-download-codes').click(); assert.equal(f.downloads.length, 1); assert.match(await f.downloads[0].text(), /TEST-CODE-01/);
  f.$('portal-codes-saved').click(); assert.equal(f.$('portal-code-list').children.length, 0); assert.equal(f.$('portal-recovery-codes').hidden, true);
  assert.equal(form.elements.password.value, ''); assert.equal(form.elements.confirmPassword.value, '');
  assert.equal(form.elements.usePasskey.checked, false);
});

test('activation token is removed from the URL and sent only with explicit account consent', async t => {
  const f = fixture(t, { signedIn: false, hash: '#invite=fictional-private-token' }); await f.idle();
  assert.equal(f.window.location.hash, ''); assert.equal(f.$('portal-activation').hidden, false);
  assert.equal(f.$('portal-activate').elements.consent.checked, false);
  for (const [name, value] of Object.entries({ consent: true, password: PASSWORD, confirmPassword: PASSWORD })) f.set(f.$('portal-activate'), name, value);
  f.submit(f.$('portal-activate')); await f.idle();
  const sent = f.calls.find(call => call.path === '/api/auth/password/activate/options');
  assert.deepEqual(sent.body, { token: 'fictional-private-token', consentAccount: true, consentVersion: '2026-11-27', registrationRequest: 'fictional-registration-request' });
  assert.equal(f.ceremonies.length, 0);
  assert.equal(f.window.document.body.textContent.includes('fictional-private-token'), false);
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
});

test('typed password sign-in preserves spaces, normalises Unicode and never invokes a passkey prompt', async t => {
  const f = fixture(t, { signedIn: false }); await f.idle();
  const form = f.$('portal-login'), password = ' e\u0301 ';
  assert.equal(f.workers.length, 0, 'Password cryptography begins only after an explicit submit.');
  f.set(form, 'username', identity.username); f.set(form, 'password', password); f.submit(form); await f.idle();
  assert.equal(f.ceremonies.length, 0); assert.equal(f.$('portal-signed-in').hidden, false);
  assert.equal(f.workers[0].url, '/password-crypto-worker.js'); assert.equal(f.workers[0].options.type, 'module');
  assert.equal(f.passwordCalls[0].params.password, password.normalize('NFC'));
  assert.deepEqual(f.calls.find(call => call.path === '/api/auth/password/login/options').body, { username: identity.username, startLoginRequest: 'fictional-login-request' });
  assert.deepEqual(f.calls.find(call => call.path === '/api/auth/password/login/verify').body, { ceremonyId: 'fictional-password-ceremony', finishLoginRequest: 'fictional-login-proof' });
  assert.equal(f.calls.some(call => JSON.stringify(call.body).includes(password.normalize('NFC'))), false);
  assert.equal(form.elements.password.value, ''); assert.equal(f.workers[0].states.size, 0);
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
});

test('inline password controls reveal independent fields without submitting, moving focus or changing values', async t => {
  const f = fixture(t, { signedIn: false }); await f.idle();
  const inputs = [...f.window.document.querySelectorAll('[data-account-password]')];
  for (const input of inputs) {
    const toggle = input.closest('.portal-password-control').querySelector('[data-password-toggle]');
    assert.equal(input.type, 'password'); assert.equal(input.labels.length, 1);
    assert.equal(toggle.type, 'button'); assert.equal(toggle.getAttribute('aria-controls'), input.id);
    assert.equal(toggle.getAttribute('aria-label'), 'Show password'); assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(toggle.querySelector('svg').getAttribute('aria-hidden'), 'true');
  }
  assert.equal(f.$('portal-bootstrap').elements.bootstrapKey.closest('.portal-password-control'), null);
  assert.equal(f.$('portal-recover').elements.recoveryCode.closest('.portal-password-control'), null);
  const form = f.$('portal-register'), password = form.elements.password, confirmation = form.elements.confirmPassword;
  const first = password.closest('.portal-password-control').querySelector('button'), second = confirmation.closest('.portal-password-control').querySelector('button');
  const requests = f.calls.length; let submissions = 0; form.addEventListener('submit', () => submissions++);
  f.set(form, 'password', ' first value '); f.set(form, 'confirmPassword', 'second value');
  first.focus(); first.click();
  assert.equal(f.window.document.activeElement, first); assert.equal(password.type, 'text'); assert.equal(confirmation.type, 'password');
  assert.equal(first.getAttribute('aria-label'), 'Hide password'); assert.equal(first.getAttribute('aria-pressed'), 'true');
  second.click(); first.click();
  assert.equal(password.type, 'password'); assert.equal(confirmation.type, 'text');
  assert.equal(password.value, ' first value '); assert.equal(confirmation.value, 'second value');
  assert.equal(password.autocomplete, 'new-password'); assert.equal(confirmation.autocomplete, 'new-password');
  assert.equal(submissions, 0); assert.equal(f.calls.length, requests); assert.equal(f.workers.length, 0);
  form.reset();
  assert.equal(password.type, 'password'); assert.equal(confirmation.type, 'password'); assert.equal(confirmation.value, '');
  assert.equal(second.getAttribute('aria-label'), 'Show password'); assert.equal(second.getAttribute('aria-pressed'), 'false');
  assert.equal(f.window.localStorage.length, 0); assert.equal(f.window.sessionStorage.length, 0);
});

test('password reveal resets when changing portal views and signing out', async t => {
  const f = fixture(t); await f.idle(); f.$('tab-security').click(); await f.idle();
  const form = f.$('portal-password'), input = form.elements.currentPassword;
  const toggle = input.closest('.portal-password-control').querySelector('button');
  f.set(form, 'currentPassword', 'a'); toggle.click(); assert.equal(input.type, 'text');
  f.$('tab-profile').click(); assert.equal(input.type, 'password'); assert.equal(input.value, 'a');
  f.$('tab-security').click(); await f.idle(); assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  toggle.click(); assert.equal(input.type, 'text'); f.$('portal-logout').click(); await f.idle();
  assert.equal(input.type, 'password'); assert.equal(input.value, ''); assert.equal(toggle.getAttribute('aria-label'), 'Show password');
  assert.equal(f.$('portal-signed-in').hidden, true);
});

test('optional passkey registration happens only after selecting it explicitly', async t => {
  const f = fixture(t, { signedIn: false }); await f.idle(); const form = f.$('portal-register');
  for (const [name, value] of Object.entries({ username: 'optional.passkey', displayName: 'Fictional Participant', email: 'fictional@example.test', consent: true, usePasskey: true })) f.set(form, name, value);
  form.elements.usePasskey.dispatchEvent(new f.window.Event('change', { bubbles: true }));
  assert.equal(f.$('register-passwords').hidden, true); assert.equal(form.elements.password.required, false);
  f.submit(form); await f.idle();
  assert.equal(f.ceremonies.length, 1); assert.equal(f.ceremonies[0].kind, 'registration');
  assert.equal(f.workers.length, 0); assert.ok(f.calls.some(call => call.path === '/api/auth/register/verify'));
  assert.equal(form.elements.usePasskey.checked, false); assert.equal(form.elements.password.required, true);
});

test('activation and recovery use passkeys only after an explicit method choice', async t => {
  for (const scenario of [
    { form: 'portal-activate', prefix: 'activate', hash: '#invite=fictional-invitation-token', purpose: 'activate', fields: { consent: true }, expected: { token: 'fictional-invitation-token', consentAccount: true, consentVersion: '2026-11-27' } },
    { form: 'portal-recover', prefix: 'recover', hash: '', purpose: 'recover', fields: { username: identity.username, recoveryCode: 'FICTIONAL-RECOVERY-CODE' }, expected: { username: identity.username, recoveryCode: 'FICTIONAL-RECOVERY-CODE' } },
    { form: 'portal-activate', prefix: 'activate', hash: '#recover=fictional-recovery-token', purpose: 'recover', fields: {}, expected: { token: 'fictional-recovery-token' } },
  ]) {
    const f = fixture(t, { signedIn: false, hash: scenario.hash }); await f.idle(); const form = f.$(scenario.form);
    assert.equal(form.elements.usePasskey.checked, false); assert.equal(form.elements.password.required, true);
    form.querySelector('details').open = true;
    assert.equal(f.ceremonies.length, 0); assert.equal(f.workers.length, 0);
    for (const [name, value] of Object.entries({ ...scenario.fields, usePasskey: true })) f.set(form, name, value);
    form.elements.usePasskey.dispatchEvent(new f.window.Event('change', { bubbles: true }));
    assert.equal(f.$(`${scenario.prefix}-passwords`).hidden, true); assert.equal(form.elements.password.required, false);
    f.submit(form); await f.idle();
    assert.deepEqual(f.calls.find(call => call.path === `/api/auth/${scenario.purpose}/options`).body, scenario.expected);
    assert.equal(f.ceremonies.length, 1); assert.equal(f.ceremonies[0].kind, 'registration'); assert.equal(f.workers.length, 0);
    assert.equal(f.$('portal-signed-in').hidden, false); assert.equal(form.elements.usePasskey.checked, false); assert.equal(form.elements.password.required, true);
  }
});

test('bootstrap accepts a one-character password with matching confirmation and a separate setup authorisation key', async t => {
  const f = fixture(t, { signedIn: false, hash: '#setup' }); await f.idle(); const form = f.$('portal-bootstrap');
  const key = '1'.repeat(64);
  for (const [name, value] of Object.entries({ bootstrapKey: key, username: 'fictional.owner', displayName: 'Fictional Owner', email: 'owner@example.test', consent: true, password: PASSWORD, confirmPassword: 'Different fictional password' })) f.set(form, name, value);
  f.submit(form); await f.idle(); assert.match(f.$('portal-status').textContent, /do not match/); assert.equal(f.workers.length, 0);
  f.set(form, 'password', key); f.set(form, 'confirmPassword', key); f.submit(form); await f.idle();
  assert.match(f.$('portal-status').textContent, /separate from the one-time setup authorisation key/);
  assert.equal(f.workers.length, 0); assert.equal(form.elements.bootstrapKey.value, key);
  f.set(form, 'password', PASSWORD); f.set(form, 'confirmPassword', PASSWORD); f.submit(form); await f.idle();
  assert.equal(f.ceremonies.length, 0);
  assert.equal(f.calls.find(call => call.path === '/api/auth/password/bootstrap/options').body.bootstrapKey, key);
  assert.equal(f.passwordCalls.some(call => JSON.stringify(call.params).includes(key)), false, 'Setup authorisation does not enter password cryptography.');
  assert.equal(form.elements.bootstrapKey.value, '');
});

test('recovery uses a saved code to set a typed password without opening device authentication', async t => {
  const f = fixture(t, { signedIn: false }); await f.idle(); const form = f.$('portal-recover');
  for (const [name, value] of Object.entries({ username: identity.username, recoveryCode: 'FICTIONAL-RECOVERY-CODE', password: PASSWORD, confirmPassword: PASSWORD })) f.set(form, name, value);
  f.submit(form); await f.idle();
  assert.deepEqual(f.calls.find(call => call.path === '/api/auth/password/recover/options').body, { username: identity.username, recoveryCode: 'FICTIONAL-RECOVERY-CODE', registrationRequest: 'fictional-registration-request' });
  assert.equal(f.ceremonies.length, 0); assert.equal(f.$('portal-signed-in').hidden, false); assert.equal(f.$('portal-code-list').children.length, 8);
  assert.equal(form.elements.recoveryCode.value, ''); assert.equal(form.elements.password.value, '');
});

test('failed password reauthentication preserves signed-in identity and unsaved profile edits', async t => {
  let rejectPassword = true;
  const f = fixture(t, { override: ({ path, options }) => {
    if (path === '/api/member/profile' && options.method === 'PATCH') return json({ error: 'Confirm your sign-in.', code: 'reauthentication_required' }, 403);
    if (path === '/api/auth/password/reauth/verify' && rejectPassword) return json({ error: 'The password could not be confirmed.', code: 'invalid_credentials' }, 401);
  } });
  await f.idle(); const profileForm = f.$('portal-profile'), form = f.$('portal-reauth-form');
  f.set(profileForm, 'about', 'Keep my private unsaved edit.'); f.submit(profileForm); await f.idle();
  assert.equal(f.$('portal-reauth').hidden, false); assert.equal(form.hidden, false);
  f.set(form, 'password', 'Incorrect fictional password'); f.submit(form); await f.idle();
  assert.equal(f.$('portal-signed-in').hidden, false); assert.equal(profileForm.elements.about.value, 'Keep my private unsaved edit.'); assert.equal(form.elements.password.value, '');
  rejectPassword = false; f.set(form, 'password', PASSWORD); f.submit(form); await f.idle();
  assert.equal(f.$('portal-reauth').hidden, true); assert.equal(profileForm.elements.about.value, 'Keep my private unsaved edit.');
  assert.equal(f.ceremonies.length, 0);
});

test('changing a password confirms the current password first and rotates recovery codes without touching passkeys', async t => {
  const f = fixture(t); await f.idle(); f.$('tab-security').click(); await f.idle();
  const form = f.$('portal-password');
  for (const [name, value] of Object.entries({ currentPassword: 'Current fictional password', password: PASSWORD, confirmPassword: PASSWORD })) f.set(form, name, value);
  f.submit(form); await f.idle();
  assert.deepEqual(f.calls.filter(call => call.path.startsWith('/api/auth/password/')).map(call => call.path), ['/api/auth/password/reauth/options', '/api/auth/password/reauth/verify', '/api/auth/password/change/options', '/api/auth/password/change/verify']);
  assert.equal(f.ceremonies.length, 0); assert.equal(f.calls.some(call => call.options.method === 'DELETE'), false);
  assert.equal(f.$('portal-code-list').children.length, 8); assert.equal(form.elements.currentPassword.value, ''); assert.equal(form.elements.password.value, '');
  assert.equal(f.$('portal-passkey-list').querySelector('button').textContent, 'Remove this passkey', 'An optional last passkey can be removed when a password exists.');
  const recoveryForm = f.$('portal-recovery-password'); f.set(recoveryForm, 'password', PASSWORD); f.submit(recoveryForm); await f.idle();
  assert.ok(f.calls.some(call => call.path === '/api/auth/password/recovery-codes/verify')); assert.equal(f.ceremonies.length, 0);
});

test('a failed password options request discards worker state and clears typed credentials', async t => {
  const f = fixture(t, { signedIn: false, override: ({ path }) => path === '/api/auth/password/login/options' ? json({ error: 'Please try again shortly.' }, 503) : null }); await f.idle();
  const form = f.$('portal-login'); f.set(form, 'username', identity.username); f.set(form, 'password', PASSWORD); f.submit(form); await f.idle();
  assert.deepEqual(f.passwordCalls.map(call => call.method), ['login.start', 'cancel']);
  assert.equal(f.workers[0].states.size, 0); assert.equal(form.elements.password.value, ''); assert.equal(form.elements.username.value, identity.username);
  assert.equal(f.calls.some(call => call.path.endsWith('/verify')), false);
});

test('leaving during a password exchange terminates private worker state and cannot repopulate the page', async t => {
  let finishOptions;
  const f = fixture(t, { signedIn: false, override: ({ path }) => path === '/api/auth/password/login/options' ? new Promise(resolve => { finishOptions = resolve; }) : null }); await f.idle();
  const form = f.$('portal-login'); f.set(form, 'username', identity.username); f.set(form, 'password', PASSWORD); f.submit(form);
  await f.until(() => !!finishOptions);
  f.window.dispatchEvent(new f.window.Event('pagehide'));
  finishOptions(json({ ceremonyId: 'fictional-password-ceremony', loginResponse: 'fictional-login-response' })); await f.idle();
  assert.equal(f.workers[0].terminated, true); assert.equal(f.workers[0].states.size, 0); assert.equal(f.workers.length, 1);
  assert.equal(form.elements.password.value, ''); assert.equal(f.$('portal-signed-in').hidden, true);
  assert.equal(f.calls.some(call => call.path.endsWith('/verify')), false);
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
